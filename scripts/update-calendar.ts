import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { z } from 'zod';
import vision from '@google-cloud/vision';

// --- IMPORTS & PATH SETUP ---
// We need to reconstruct __dirname because we are in a module environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import your source list. 
// NOTE: Ensure your tsconfig.json has "resolveJsonModule": true
import eventSourcesJSON from '../assets/event_sources.json' assert { type: 'json' };

// --- CONFIGURATION ---
const BATCH_SIZE = 5; // Process 5 users at a time
const OUTPUT_FILE = path.join(__dirname, '../assets/calendar_data.json');

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

    // 1. Validate Environment
    if (!process.env.OPENAI_API_KEY || !process.env.INSTAGRAM_USER_ACCESS_TOKEN) {
        throw new Error("Missing required environment variables (OPENAI_API_KEY or INSTAGRAM_USER_ACCESS_TOKEN).");
    }

    // 2. Initialize Clients
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

    const sources = eventSourcesJSON.instagram || [];
    console.log(`🚀 Found ${sources.length} sources to process.`);

    // 3. Define the Worker (Processes 1 User)
    const worker = (source: any) => processSingleSource(source, openai, visionClient);

    // 4. Run with Throttling (Batch Processing)
    const allResults = await processInChunks(sources, BATCH_SIZE, worker);

    // 5. Flatten results (remove nulls)
    const finalEvents = allResults.filter(r => r !== null); // .flat() if your worker returned arrays

    // 6. Save to Disk
    console.log(`💾 Saving ${finalEvents.length} processed Instagram accounts to ${OUTPUT_FILE}...`);
    
    // Ensure directory exists
    const dir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Save in the format expected by the Vue component
    const outputData = {
        lastUpdated: new Date().toISOString(),
        eventSources: finalEvents,
        totalSources: finalEvents.length,
        generatedBy: "GitHub Action - Instagram scraping only"
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData.eventSources, null, 2));
    
    console.log("✅ Instagram Calendar Update Complete!");
    console.log(`📊 Generated ${finalEvents.length} Instagram event sources`);
}

// --- WORKER LOGIC ---

async function processSingleSource(source: any, openai: OpenAI, visionClient: any) {
    try {
        console.log(`   Processing @${source.username}...`);
        
        // A. Fetch Instagram Data
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

        // B. Process Posts
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
                const imagesToScan = mediaUrls.slice(0, 3); // Limit to 3 to save cost
                const ocrResults = await Promise.all(imagesToScan.map(url => doOCR(visionClient, url)));
                ocrTextData = ocrResults
                    .map((txt, idx) => `\n--- IMG ${idx + 1} ---\n${txt}\n`)
                    .join("\n");
            }

            // AI Analysis
            const aiResponse = await analyzeWithAI(openai, post.caption || "", ocrTextData, source.context_clues?.join(', '), postDateString);

            // Convert to Event Objects
            if (aiResponse && aiResponse.events.length > 0) {
                const now = new Date();
                
                for (const ev of aiResponse.events) {
                    if (!ev.startDay) continue;

                    const year = ev.startYear || now.getFullYear();
                    const monthIndex = (ev.startMonth || (now.getMonth() + 1)) - 1; 
                    
                    let start = new Date(year, monthIndex, ev.startDay, ev.startHourMilitaryTime || 12, ev.startMinute || 0);
                    
                    // Future/Past Logic
                    if (start < new Date() && (new Date().getMonth() - start.getMonth() > 6)) start.setFullYear(year + 1);

                    let end = new Date(start);
                    if (ev.endHourMilitaryTime) end.setHours(ev.endHourMilitaryTime, ev.endMinute || 0);
                    else end.setHours(start.getHours() + 1);

                    let title = ev.title || "Instagram Event";
                    let description = post.caption || "";
                    if (!description && ocrTextData) description = "See flyer image for details.";
                    if (source.suffixDescription) description += source.suffixDescription;

                    // Tagging (Inline simplified version since we are outside Nuxt)
                    const tags = determineTags(title + " " + description + " " + source.name);

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

        // C. Deduplicate
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
        
        // Polite delay between batches
        if (i + chunkSize < items.length) {
            await new Promise(r => setTimeout(r, 2000));
        }
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
            // Same Day check
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

// Simple Tagging Helper (Inline replacement for your util function)
function determineTags(text: string): string[] {
    const t = text.toLowerCase();
    const tags = [];
    if (t.includes('music') || t.includes('concert') || t.includes('live') || t.includes('band')) tags.push('Music');
    if (t.includes('art') || t.includes('gallery') || t.includes('exhibit')) tags.push('Art');
    if (t.includes('market') || t.includes('pop-up') || t.includes('shop')) tags.push('Market');
    if (t.includes('book') || t.includes('reading') || t.includes('poetry')) tags.push('Literature');
    return tags;
}

// Execute
main().catch(err => {
    console.error("FATAL ERROR:", err);
    process.exit(1);
});
