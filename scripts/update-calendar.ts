import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { z } from 'zod';
import vision from '@google-cloud/vision';

// --- IMPORTS & PATH SETUP ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import your source list.
import eventSourcesJSON from '../assets/event_sources.json' assert { type: 'json' };

// --- CONFIGURATION ---
const BATCH_SIZE = 5; 
const OUTPUT_FILE = path.join(__dirname, '../public/calendar_data.json');

// --- INTERFACES & TYPES ---

// 1. Define types to match your event_sources.json structure
interface TagDef {
    name: string;
    fullName: string;
    defaultValue: string;
    // Optional: Add 'keywords' here if you ever add custom keywords to your JSON
    keywords?: string[]; 
}

interface AppConfig {
    tagsToShow: TagDef[][]; // Array of Arrays of TagDefs
}

interface InstagramSource {
    name: string;
    username: string;
    city: string;
    defaultLocation: string;
    filters?: string[][]; // The tags to inherit
    context_clues?: string[];
    suffixDescription?: string;
}

// Extract the appConfig and flatten the tags for easy searching
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

    // Cast sources to our typed interface
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
        console.log(`   Processing @${source.username}...`);
        
        const myId = process.env.INSTAGRAM_BUSINESS_USER_ID;
        const token = process.env.INSTAGRAM_USER_ACCESS_TOKEN;
        const url = `https://graph.facebook.com/v21.0/${myId}?fields=business_discovery.username(${source.username}){media.limit(6){id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_url,media_type,thumbnail_url}}}&access_token=${token}`;
        
        const res = await fetch(url);
        if (!res.ok) {
            const txt = await res.text();
            if (txt.includes('(#4)')) console.warn(`   ⚠️ [Rate Limit] @${source.username} temporarily blocked.`);
            else console.warn(`   ⚠️ [API Error] @${source.username}: ${txt.substring(0, 100)}`);
            return null;
        }
        
        const data = await res.json();
        const posts = data.business_discovery?.media?.data || [];
        let sourceEvents: any[] = [];

        for (const post of posts) {
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

            if (mediaUrls.length === 0 && !post.caption) continue;

            // OCR
            let ocrTextData = "";
            if (visionClient && mediaUrls.length > 0) {
                const imagesToScan = mediaUrls.slice(0, 3);
                const ocrResults = await Promise.all(imagesToScan.map(url => doOCR(visionClient, url)));
                ocrTextData = ocrResults
                    .map((txt, idx) => `\n--- IMG ${idx + 1} ---\n${txt}\n`)
                    .join("\n");
            }

            // AI Analysis
            const aiResponse = await analyzeWithAI(openai, post.caption || "", ocrTextData, source.context_clues?.join(', ') || "", postDateString);

            if (aiResponse && aiResponse.events.length > 0) {
                const now = new Date();
                
                for (const ev of aiResponse.events) {
                    if (!ev.startDay) continue;

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

                    // --- NEW TAGGING LOGIC ---
                    // Combine relevant text for keyword scanning
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
            }
        }

        const uniqueEvents = removeDuplicates(sourceEvents);
        return { events: uniqueEvents, city: source.city, name: source.name };

    } catch (e: any) {
        console.error(`   ❌ [Failed] @${source.username}: ${e.message}`);
        return null;
    }
}

// --- HELPERS ---

async function processInChunks(items: any[], chunkSize: number, iteratorFn: Function) {
    const results = [];
    for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        console.log(`   📦 Batch ${Math.floor(i/chunkSize) + 1}: Processing ${chunk.length} items...`);
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
    const prompt = `
    Extract events from this Instagram post.
    POST DATE: ${postDateString}
    CONTEXT: ${context}
    
    CAPTION: "${caption.substring(0, 1000)}"
    OCR DATA: "${ocrTextData.substring(0, 15000)}"

    Return JSON: { "events": [{ "title": "...", "startDay": 1, ... }] }
    `;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are an event extraction assistant. Return valid JSON only." }, 
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0,
        });

        const raw = completion.choices[0].message.content;
        const result = AIResponseSchema.safeParse(JSON.parse(raw || "{}"));
        return result.success ? result.data : null;
    } catch (e) {
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

// --- NEW TAGGING FUNCTION ---
function generateTagsForPost(textToScan: string, sourceConfig: InstagramSource): string[] {
    const finalTags = new Set<string>();
    const normalizedText = textToScan.toLowerCase();

    // 1. Inherit tags from the Account Source (e.g. "lgbtq" for Pride accounts)
    if (sourceConfig.filters) {
        sourceConfig.filters.forEach(tagGroup => {
            tagGroup.forEach(tag => {
                if (tag) finalTags.add(tag);
            });
        });
    }

    // 2. Detect Keywords from appConfig (e.g. scan text for "soccer", "music")
    ALL_TAGS.forEach(tagDef => {
        // Basic Check: Does the tag name exist in the text?
        if (normalizedText.includes(tagDef.name.toLowerCase())) {
            finalTags.add(tagDef.name);
        }

        // Optional: specific overrides or custom keyword mapping
        // Example: if tag is 'music', also look for 'concert' or 'band'
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