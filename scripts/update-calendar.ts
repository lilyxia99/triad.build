console.log("🚀 Script file loaded! Starting imports..."); // Sanity check

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { z } from 'zod';
import vision from '@google-cloud/vision';

// --- IMPORTS & PATH SETUP ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ FIX: Pointing to the correct location in server/assets
import eventSourcesJSON from '../assets/event_sources.json' assert { type: 'json' };

// --- CONFIGURATION ---
const BATCH_SIZE = 5; 
const OUTPUT_FILE = path.join(__dirname, '../server/assets/instagram_data.json');

// --- INTERFACES & TYPES ---

interface TagDef {
    name: string;
    fullName: string;
    defaultValue: string;
    keywords?: string[]; 
}

interface AppConfig {
    tagsToShow: TagDef[][];
}

interface InstagramSource {
    name: string;
    username: string;
    city: string;
    defaultLocation: string;
    filters?: string[][];
    context_clues?: string[];
    suffixDescription?: string;
}

const appConfig = (eventSourcesJSON as any).appConfig as AppConfig;
const ALL_TAGS = appConfig.tagsToShow.flat();

// --- SCHEMAS ---
const SingleEventSchema = z.object({
    title: z.string().nullable().optional(),
    startDay: z.number().nullable().optional(),
    startMonth: z.number().nullable().optional(),
    startYear: z.number().nullable().optional(),
    startHourMilitaryTime: z.number().nullable().optional(),
    startMinute: z.number().nullable().optional(),
    endDay: z.number().nullable().optional(),
    endMonth: z.number().nullable().optional(),
    endYear: z.number().nullable().optional(),
    endHourMilitaryTime: z.number().nullable().optional(),
    endMinute: z.number().nullable().optional(),
    location: z.string().nullable().optional(),
});

const AIResponseSchema = z.object({
    events: z.array(SingleEventSchema)
});

// --- MAIN EXECUTION ---
async function main() {
    console.log("📅 Starting Daily Calendar Update via GitHub Action...");

    if (!process.env.OPENAI_API_KEY || !process.env.INSTAGRAM_USER_ACCESS_TOKEN) {
        throw new Error("Missing required environment variables.");
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    let visionClient = null;
    
    if (process.env.GOOGLE_CLOUD_VISION_PRIVATE_KEY && process.env.GOOGLE_CLOUD_VISION_CLIENT_EMAIL) {
        console.log("✅ Google Vision Enabled");
        visionClient = new vision.ImageAnnotatorClient({
            credentials: {
                private_key: process.env.GOOGLE_CLOUD_VISION_PRIVATE_KEY.replace(/\\n/g, '\n'),
                client_email: process.env.GOOGLE_CLOUD_VISION_CLIENT_EMAIL,
            },
        });
    } else {
        console.warn("⚠️ Google Vision Key missing. OCR will be skipped.");
    }

    const sources = (eventSourcesJSON.instagram || []) as InstagramSource[];
    console.log(`🚀 Found ${sources.length} sources to process.`);

    const worker = (source: InstagramSource) => processSingleSource(source, openai, visionClient);
    const allResults = await processInChunks(sources, BATCH_SIZE, worker);

    const finalEvents = allResults.filter(r => r !== null);

    console.log(`💾 Saving ${finalEvents.length} processed Instagram accounts to ${OUTPUT_FILE}...`);
    
    const dir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const outputData = {
        lastUpdated: new Date().toISOString(),
        eventSources: finalEvents,
        totalSources: finalEvents.length,
        generatedBy: "GitHub Action - Instagram scraping only"
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData.eventSources, null, 2));
    
    console.log("✅ Instagram Calendar Update Complete!");
}

// --- WORKER LOGIC ---

async function processSingleSource(source: InstagramSource, openai: OpenAI, visionClient: any) {
    try {
        console.log(`\n🔍 [START] Processing @${source.username}...`);
        
        const myId = process.env.INSTAGRAM_BUSINESS_USER_ID;
        const token = process.env.INSTAGRAM_USER_ACCESS_TOKEN;
        
        // 1. UPDATED LIMIT: Increased to 25 to catch older flyers
        const url = `https://graph.facebook.com/v21.0/${myId}?fields=business_discovery.username(${source.username}){media.limit(25){id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_url,media_type,thumbnail_url}}}&access_token=${token}`;
        
        const res = await fetch(url);
        
        // 2. DEBUG: API Network Failures
        if (!res.ok) {
            const txt = await res.text();
            if (txt.includes('(#4)')) console.warn(`   ⚠️ [Rate Limit] @${source.username} temporarily blocked.`);
            else console.warn(`   ❌ [API Error] @${source.username} returned ${res.status}: ${txt.substring(0, 150)}`);
            return null;
        }
        
        const data = await res.json();

        // 3. DEBUG: Detect Personal vs Business Accounts
        if (!data.business_discovery) {
            console.warn(`   ⚠️ [Data Missing] @${source.username} returned no business data. Likely a PERSONAL account or AGE-GATED.`);
            console.log(`   --> API Response dump: ${JSON.stringify(data).substring(0, 200)}...`);
            return null;
        }

        const posts = data.business_discovery?.media?.data || [];
        console.log(`   📡 Fetched ${posts.length} posts from API.`);

        if (posts.length === 0) {
            console.warn(`   ⚠️ Account exists but has 0 posts available to API.`);
            return null;
        }

        let sourceEvents: any[] = [];
        let postCounter = 0;

        for (const post of posts) {
            postCounter++;
            const postDateObj = new Date(post.timestamp);
            const postDateString = postDateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

            // Gather Media
            let mediaUrls: string[] = [];
            if (post.media_type === 'CAROUSEL_ALBUM' && post.children?.data) {
                mediaUrls = post.children.data.map((child: any) => 
                    (child.media_type === 'VIDEO' && child.thumbnail_url) ? child.thumbnail_url : child.media_url
                ).filter(Boolean);
            } else {
                const singleUrl = (post.media_type === 'VIDEO' && post.thumbnail_url) ? post.thumbnail_url : post.media_url;
                if (singleUrl) mediaUrls.push(singleUrl);
            }

            // 4. DEBUG: Empty Posts
            if (mediaUrls.length === 0 && !post.caption) {
                console.log(`   ⏭️ [Skip] Post ${postCounter}: No media URL and no caption.`);
                continue;
            }

            // OCR
            let ocrTextData = "";
            if (visionClient && mediaUrls.length > 0) {
                // console.log(`      ...Running OCR on Post ${postCounter}`); 
                const imagesToScan = mediaUrls.slice(0, 3);
                const ocrResults = await Promise.all(imagesToScan.map(url => doOCR(visionClient, url)));
                ocrTextData = ocrResults
                    .map((txt, idx) => `\n--- IMG ${idx + 1} ---\n${txt}\n`)
                    .join("\n");
            }

            // 5. DEBUG: Check what we are sending AI
            const captionLen = post.caption ? post.caption.length : 0;
            const ocrLen = ocrTextData.length;
            
            if (captionLen < 5 && ocrLen < 10) {
                 console.log(`   ⏭️ [Skip] Post ${postCounter}: Not enough text data (Caption: ${captionLen} chars, OCR: ${ocrLen} chars).`);
                 continue;
            }

            // AI Analysis
            const aiResponse = await analyzeWithAI(openai, post.caption || "", ocrTextData, source.context_clues?.join(', ') || "", postDateString);

            if (aiResponse && aiResponse.events.length > 0) {
                // Added source.username to the log
                console.log(`   ✅ [AI Match] @${source.username} | Post ${postCounter} (${postDateString}): Found ${aiResponse.events.length} event(s).`);
                
                const now = new Date();
                
                for (const ev of aiResponse.events) {
                    if (!ev.startDay) {
                        console.log(`      ⚠️ Skipped event "${ev.title}" (Missing start day)`);
                        continue;
                    }

                    const year = ev.startYear || now.getFullYear();
                    const monthIndex = (ev.startMonth || (now.getMonth() + 1)) - 1; 
                    
                    let start = new Date(year, monthIndex, ev.startDay, ev.startHourMilitaryTime || 12, ev.startMinute || 0);
                    
                    if (start < new Date() && (new Date().getMonth() - start.getMonth() > 6)) start.setFullYear(year + 1);

                    let end = new Date(start);
                    if (ev.endHourMilitaryTime) end.setHours(ev.endHourMilitaryTime, ev.endMinute || 0);
                    else end.setHours(start.getHours() + 1);

                    let title = ev.title || "Instagram Event";
                    let description = post.caption || "";
                    if (!description && ocrTextData) description = "See flyer image for details.";
                    if (source.suffixDescription) description += source.suffixDescription;

                    const combinedText = `${title} ${description} ${source.name} ${ocrTextData}`;
                    const tags = generateTagsForPost(combinedText, source);

                    sourceEvents.push({
                        id: `ig-${post.id}-${sourceEvents.length + 1}`,
                        title,
                        org: source.name,
                        start: start.toISOString(),
                        end: end.toISOString(),
                        url: post.permalink,
                        location: ev.location || source.defaultLocation,
                        description,
                        images: mediaUrls,
                        tags: tags
                    });
                }
            } else {
                 // 6. DEBUG: AI found nothing
                 // console.log(`   zzz Post ${postCounter}: AI found 0 events.`);
            }
        }

        const uniqueEvents = removeDuplicates(sourceEvents);
        console.log(`   🎉 [Done] @${source.username}: ${uniqueEvents.length} unique events saved.`);
        return { events: uniqueEvents, city: source.city, name: source.name };

    } catch (e: any) {
        console.error(`   ❌ [CRITICAL FAIL] @${source.username}: ${e.message}`);
        return null;
    }
}

// --- HELPERS ---

async function processInChunks(items: any[], chunkSize: number, iteratorFn: Function) {
    const results = [];
    for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        console.log(` 📦 Batch ${Math.floor(i/chunkSize) + 1}: Processing ${chunk.length} items...`);
        const chunkResults = await Promise.all(chunk.map(item => iteratorFn(item)));
        results.push(...chunkResults);
        if (i + chunkSize < items.length) await new Promise(r => setTimeout(r, 2000));
    }
    return results;
}

async function doOCR(client: any, url: string) {
    try {
        const [result] = await client.textDetection(url);
        return result.fullTextAnnotation?.text || '';
    } catch (e) {
        return '';
    }
}

async function analyzeWithAI(openai: OpenAI, caption: string, ocrTextData: string, context: string, postDateString: string) {
    const today = new Date();
    const currentYear = today.getFullYear();

    const prompt = `
    You are an expert Event Extractor. Extract concrete event details from this Instagram post.

    --- INPUT DATA ---
    POST DATE: ${postDateString}
    CONTEXT CLUES: ${context}
    CURRENT YEAR: ${currentYear}
    
    CAPTION: "${caption.substring(0, 1500)}"
    OCR TEXT: "${ocrTextData.substring(0, 15000)}"

    --- RULES ---
    1. **Relative Dates:** If post says "This Friday", calculate the numeric date based on POST DATE.
    2. **Flyers First:** Trust the OCR text (flyer) over the caption if they conflict.
    3. **Exhibitions & Runs:** - If an event spans dates (e.g. "On view Jan 10 - Feb 20" or "Running through March 5"), EXTRACT the start AND end dates.
       - If it's an "Opening Reception", treat it as a single-day event.
    4. **Times:** If implied (e.g. "Doors 7pm"), use that. If no time is listed for an exhibition, assume 10:00 (10am) to 18:00 (6pm).
    5. **Multiple Events:** If a post lists a schedule, output multiple events.
    6. **Ignore Recaps:** Do not extract events from "Thank you for coming" posts.

    --- OUTPUT JSON ---
    { 
      "events": [
        { 
          "title": "Exhibition Title or Event Name", 
          "startDay": 10, "startMonth": 1, "startYear": 2026, "startHourMilitaryTime": 18, "startMinute": 0,
          "endDay": 20, "endMonth": 2, "endYear": 2026, "endHourMilitaryTime": 17, "endMinute": 0,
          "location": "Gallery Name"
        }
      ] 
    }
    `;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are a precise data extraction assistant. Return valid JSON only." }, 
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0,
        });

        const raw = completion.choices[0].message.content;
        const result = AIResponseSchema.safeParse(JSON.parse(raw || "{}"));
        return result.success ? result.data : null;
    } catch (e) {
        console.error("AI Analysis Failed:", e);
        return null;
    }
}

function removeDuplicates(events: any[]) {
    const uniqueEvents: any[] = [];
    const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const candidate of events) {
        let isDuplicate = false;
        for (const existing of uniqueEvents) {
            const dateA = new Date(candidate.start);
            const dateB = new Date(existing.start);
            if (dateA.toDateString() === dateB.toDateString()) {
                const titleA = normalize(candidate.title);
                const titleB = normalize(existing.title);
                if (titleA.includes(titleB) || titleB.includes(titleA)) {
                    isDuplicate = true;
                    break;
                }
            }
        }
        if (!isDuplicate) uniqueEvents.push(candidate);
    }
    return uniqueEvents;
}

function generateTagsForPost(textToScan: string, sourceConfig: InstagramSource): string[] {
    const finalTags = new Set<string>();
    const normalizedText = textToScan.toLowerCase();

    if (sourceConfig.filters) {
        sourceConfig.filters.forEach(tagGroup => {
            tagGroup.forEach(tag => {
                if (tag) finalTags.add(tag);
            });
        });
    }

    ALL_TAGS.forEach(tagDef => {
        if (normalizedText.includes(tagDef.name.toLowerCase())) {
            finalTags.add(tagDef.name);
        }
        if (tagDef.name === 'music' && (normalizedText.includes('concert') || normalizedText.includes('live band'))) {
            finalTags.add('music');
        }
        if (tagDef.name === 'art' && (normalizedText.includes('gallery') || normalizedText.includes('exhibition'))) {
            finalTags.add('art');
        }
    });

    return Array.from(finalTags);
}

// Execute
main().catch(err => {
    console.error("FATAL ERROR:", err);
    process.exit(1);
});