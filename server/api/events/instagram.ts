import OpenAI from 'openai';
import { z } from 'zod';
import vision from '@google-cloud/vision';
import eventSourcesJSON from '@/assets/event_sources.json';
import { applyEventTags } from '@/utils/util';

// --- CONFIGURATION ---
const CACHE_MAX_AGE = 60 * 60 * 24; // 24 Hours

// --- SCHEMA ---
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

// --- CACHED HANDLER ---
export default defineCachedEventHandler(async (event) => {
    console.log("[Instagram] Loading events from GitHub Actions scraped data");
    
    try {
        // Import the calendar data directly from assets
        const calendarData = await import('@/assets/calendar_data.json');
        
        if (calendarData.default && Array.isArray(calendarData.default)) {
            console.log(`[Instagram] Loaded ${calendarData.default.length} Instagram event sources`);
            
            // Filter out sources with no events
            const sourcesWithEvents = calendarData.default.filter(source => 
                source.events && Array.isArray(source.events) && source.events.length > 0
            );
            
            return { body: sourcesWithEvents };
        } else {
            console.log("[Instagram] No valid calendar data found");
            return { body: [] };
        }
    } catch (error) {
        console.error("[Instagram] Failed to load calendar data:", error);
        return { body: [] };
    }
}, {
    maxAge: CACHE_MAX_AGE,
    swr: true, 
});


// --- MAIN LOGIC ---

async function fetchInstagramEvents() {
    const sources = eventSourcesJSON.instagram || [];
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const allResults = [];

    // Initialize Google Vision
    let visionClient = null;
    if (process.env.GOOGLE_CLOUD_VISION_PRIVATE_KEY && process.env.GOOGLE_CLOUD_VISION_CLIENT_EMAIL) {
        visionClient = new vision.ImageAnnotatorClient({
            credentials: {
                private_key: process.env.GOOGLE_CLOUD_VISION_PRIVATE_KEY.replace(/\\n/g, '\n'),
                client_email: process.env.GOOGLE_CLOUD_VISION_CLIENT_EMAIL,
            },
        });
    }

    for (const source of sources) {
        try {
            console.log(`Processing @${source.username}...`);
            
            // 1. Fetch Instagram Data
            const myId = process.env.INSTAGRAM_BUSINESS_USER_ID;
            const token = process.env.INSTAGRAM_USER_ACCESS_TOKEN;
            const url = `https://graph.facebook.com/v21.0/${myId}?fields=business_discovery.username(${source.username}){media.limit(6){id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_url,media_type,thumbnail_url}}}&access_token=${token}`;
            
            const res = await fetch(url);
            if (!res.ok) {
                const txt = await res.text();
                if (txt.includes('(#4)')) console.error(`[Rate Limit] @${source.username} blocked.`);
                else console.error(`[Graph API Error] @${source.username}: ${txt}`);
                continue; 
            }
            
            const data = await res.json();
            const posts = data.business_discovery?.media?.data || [];

            // 2. Process Posts
            let sourceEvents = [];
            for (const post of posts) {
                const postDateObj = new Date(post.timestamp);
                const postDateString = postDateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

                // A. Gather Media URLs
                let mediaUrls: string[] = [];
                if (post.media_type === 'CAROUSEL_ALBUM' && post.children?.data) {
                    mediaUrls = post.children.data.map((child: any) => {
                        return (child.media_type === 'VIDEO' && child.thumbnail_url) ? child.thumbnail_url : child.media_url;
                    }).filter(Boolean);
                } else {
                    const singleUrl = (post.media_type === 'VIDEO' && post.thumbnail_url) ? post.thumbnail_url : post.media_url;
                    if (singleUrl) mediaUrls.push(singleUrl);
                }

                if (mediaUrls.length === 0 && !post.caption) continue;

                // B. Run OCR (Force separators so AI sees distinct items)
                let ocrTextData = "";
                if (visionClient && mediaUrls.length > 0) {
                    const ocrPromises = mediaUrls.map(url => doOCR(visionClient, url));
                    const ocrResults = await Promise.all(ocrPromises);
                    
                    ocrTextData = ocrResults
                        .map((txt, idx) => `\n--- START IMAGE ${idx + 1} TEXT ---\n${txt}\n--- END IMAGE ${idx + 1} ---\n`)
                        .join("\n");
                }

                // C. Analyze with AI
                const aiResponse = await analyzeWithAI(openai, post.caption || "", ocrTextData, source.context_clues?.join(', '), postDateString);
                
                // D. Convert to Events
                if (aiResponse && aiResponse.events.length > 0) {
                    const now = new Date();
                    
                    for (const ev of aiResponse.events) {
                        if (!ev.startDay) continue;

                        const year = ev.startYear || now.getFullYear();
                        const monthIndex = (ev.startMonth || (now.getMonth() + 1)) - 1; 
                        
                        let start = new Date(year, monthIndex, ev.startDay, ev.startHourMilitaryTime || 12, ev.startMinute || 0);
                        
                        // Fix "Last Year" bug but allow recent past
                        if (start < new Date() && (new Date().getMonth() - start.getMonth() > 6)) start.setFullYear(year + 1);

                        let end = new Date(start);
                        if (ev.endHourMilitaryTime) end.setHours(ev.endHourMilitaryTime, ev.endMinute || 0);
                        else end.setHours(start.getHours() + 1);

                        let title = ev.title || "Instagram Event";
                        let description = post.caption || "";
                        if (!description && ocrTextData) description = "See flyer image for details.";
                        if (source.suffixDescription) description += source.suffixDescription;

                        // Unique ID includes index to handle multiple events per post
                        const uniqueSuffix = sourceEvents.length + 1;

                        sourceEvents.push({
                            id: `ig-${post.id}-${uniqueSuffix}`,
                            title,
                            org: source.name,
                            start: start.toISOString(),
                            end: end.toISOString(),
                            url: post.permalink,
                            location: ev.location || source.defaultLocation,
                            description,
                            images: mediaUrls, 
                            tags: applyEventTags(source, title, description)
                        });
                    }
                }
            }
            
            // 3. FUZZY DEDUPLICATION
            const uniqueEvents = removeDuplicates(sourceEvents);
            console.log(`   -> Added ${uniqueEvents.length} unique events from @${source.username}`);
            allResults.push({ events: uniqueEvents, city: source.city, name: source.name });

        } catch (e: any) {
            console.error(`Error processing ${source.username}: ${e.message}`);
        }
    }

    return allResults;
}


// --- HELPERS ---

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
    You are an event extraction engine.
    
    GLOBAL CONTEXT:
    - Post Upload Date: ${postDateString}
    - Organization Context: ${context}
    
    INPUT DATA:
    ----------------
    CAPTION:
    "${caption.substring(0, 1000)}"
    ----------------
    OCR IMAGE DATA (Flyers):
    "${ocrTextData.substring(0, 30000)}"
    ----------------

    INSTRUCTIONS:
    1. SCAN EVERY IMAGE BLOCK. Do not stop after the first one.
    2. If Image 1 is "Film Night" and Image 2 is "Live Jazz", extract BOTH as separate events.
    3. TIME LOGIC: 
       - If a time is "7:30" or "8" for a film/party, ASSUME PM unless "AM" is stated.
       - "December 17" means the closest December 17 to the Upload Date.
    
    Return JSON ONLY: 
    { 
      "events": [
        { "title": "string", "startDay": number, "startMonth": number, "startYear": number, "startHourMilitaryTime": number, "startMinute": number, "endHourMilitaryTime": number, "location": "string" }
      ]
    }
    `;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are a precise event extraction assistant. You process every single image provided." }, 
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0,
        });

        const raw = completion.choices[0].message.content;
        const result = AIResponseSchema.safeParse(JSON.parse(raw));
        
        if (result.success) return result.data;
        return null;

    } catch (e: any) {
        console.error(`[AI Error] ${e.message}`);
        return null;
    }
}

// --- SMART FUZZY DEDUPLICATION ---
function removeDuplicates(events: any[]) {
    const uniqueEvents: any[] = [];
    
    // Helper to normalize strings (remove special chars, lowercase)
    const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const candidate of events) {
        let isDuplicate = false;
        
        for (const existing of uniqueEvents) {
            // 1. Check if Start Dates match (roughly)
            const dateA = new Date(candidate.start);
            const dateB = new Date(existing.start);
            const sameDay = dateA.getDate() === dateB.getDate() && dateA.getMonth() === dateB.getMonth();
            const sameHour = Math.abs(dateA.getHours() - dateB.getHours()) <= 1; // Allow 1 hour variance

            if (sameDay && sameHour) {
                // 2. Check Titles (Fuzzy Match)
                const titleA = normalize(candidate.title);
                const titleB = normalize(existing.title);

                // If one title contains the other, or they are very similar
                if (titleA.includes(titleB) || titleB.includes(titleA)) {
                    isDuplicate = true;
                    // Optional: You could merge descriptions here if you wanted
                    break; 
                }
            }
        }

        if (!isDuplicate) {
            uniqueEvents.push(candidate);
        }
    }
    return uniqueEvents;
}
