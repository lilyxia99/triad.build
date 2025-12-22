import OpenAI from 'openai';
import { z } from 'zod';
import eventSourcesJSON from '@/assets/event_sources.json';
import { logTimeElapsedSince, applyEventTags } from '@/utils/util';

// --- VALIDATION SCHEMA ---
const AIEventSchema = z.object({
    isEvent: z.boolean(),
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

// --- HANDLER (Uncached for Debugging) ---
export default defineEventHandler(async (event) => {
    const startTime = new Date();
    
    // 1. DIAGNOSTICS: Check Environment Variables
    const envStatus = {
        hasMetaToken: !!process.env.INSTAGRAM_USER_ACCESS_TOKEN,
        hasMetaID: !!process.env.INSTAGRAM_BUSINESS_USER_ID,
        hasOpenAI: !!process.env.OPENAI_API_KEY,
        metaIdFirst4: process.env.INSTAGRAM_BUSINESS_USER_ID ? process.env.INSTAGRAM_BUSINESS_USER_ID.substring(0, 4) : 'N/A'
    };

    console.log(`[Instagram Init] Keys Present?`, envStatus);

    // If keys are missing, return a clear error to the browser/logs
    if (!envStatus.hasMetaToken || !envStatus.hasMetaID || !envStatus.hasOpenAI) {
        console.error('[Instagram Error] Missing API Keys on Server');
        return { 
            status: "ERROR", 
            message: "Missing Environment Variables. Check Vercel Settings.", 
            debug: envStatus,
            body: []
        };
    }

    // 2. RUN SCRAPER
    try {
        const body = await fetchInstagramEvents();
        logTimeElapsedSince(startTime.getTime(), 'Instagram process complete.');
        return { status: "SUCCESS", debug: envStatus, body };
    } catch (e: any) {
        console.error('[Instagram Critical Fail]', e);
        return { 
            status: "CRASH", 
            message: e.message, 
            debug: envStatus, 
            body: [] 
        };
    }
});


// --- MAIN LOGIC ---

async function fetchInstagramEvents() {
    const sources = eventSourcesJSON.instagram || [];
    if (sources.length === 0) return [];

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const allResults = [];

    console.log(`[Instagram] Processing ${sources.length} sources...`);

    for (const source of sources) {
        try {
            console.log(`\n--- FETCHING @${source.username} ---`);
            const posts = await getInstagramPosts(source.username);
            console.log(`   [Graph API] Found ${posts.length} posts.`);

            // Parallel AI Analysis
            const aiPromises = posts.map(async (post) => {
                if (!post.caption) return null;

                // A. Convert Timestamp to Readable Date (The "Upload Date")
                const postDateObj = new Date(post.timestamp);
                const postDateString = postDateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

                // B. Call OpenAI
                const aiResult = await analyzeWithAI(openai, post.caption, source.context_clues?.join(', '), postDateString);
                
                // C. Process Result
                if (aiResult && aiResult.isEvent && aiResult.startDay) {
                    console.log(`      ✅ [MATCH] "${aiResult.title}" | Date: ${aiResult.startMonth}/${aiResult.startDay}`);
                    
                    const now = new Date();
                    const year = aiResult.startYear || now.getFullYear();
                    const monthIndex = (aiResult.startMonth || (now.getMonth() + 1)) - 1; 
                    
                    const start = new Date(year, monthIndex, aiResult.startDay, aiResult.startHourMilitaryTime || 12, aiResult.startMinute || 0);
                    
                    // Year Rollover Fix (If event is in Jan but we are in Dec)
                    if (start < new Date() && (new Date().getMonth() - start.getMonth() > 6)) {
                        start.setFullYear(year + 1);
                    }

                    const end = new Date(start);
                    if (aiResult.endHourMilitaryTime) {
                        end.setHours(aiResult.endHourMilitaryTime, aiResult.endMinute || 0);
                    } else {
                        end.setHours(start.getHours() + 1);
                    }

                    const title = aiResult.title || "Instagram Event";
                    let description = post.caption;
                    if (source.suffixDescription) description += source.suffixDescription;

                    const tags = applyEventTags(source, title, description);
                    
                    // VIDEO FIX: Use thumbnail if video, else media_url
                    const mainImage = (post.media_type === 'VIDEO' && post.thumbnail_url) 
                        ? post.thumbnail_url 
                        : post.media_url;

                    return {
                        id: `ig-${post.id}`,
                        title: title,
                        org: source.name,
                        start: start.toISOString(),
                        end: end.toISOString(),
                        url: post.permalink,
                        location: aiResult.location || source.defaultLocation || "See post details",
                        description: description,
                        images: [mainImage].filter(Boolean),
                        tags
                    };
                } 
                return null;
            });

            // Wait for all AI calls to finish
            const results = await Promise.all(aiPromises);
            const rawEvents = results.filter(e => e !== null);
            
            // D. Remove Duplicates
            const uniqueEvents = removeDuplicates(rawEvents);

            console.log(`   -> Added ${uniqueEvents.length} unique events.`);
            allResults.push({ events: uniqueEvents, city: source.city, name: source.name });

        } catch (e) {
            console.error(`   [Error] Failed processing ${source.username}:`, e);
        }
    }

    return allResults;
}


// --- HELPERS ---

async function getInstagramPosts(username: string) {
    const myId = process.env.INSTAGRAM_BUSINESS_USER_ID;
    const token = process.env.INSTAGRAM_USER_ACCESS_TOKEN;
    
    // Note: fields includes thumbnail_url for videos
    const url = `https://graph.facebook.com/v21.0/${myId}?fields=business_discovery.username(${username}){media.limit(6){id,caption,media_type,media_url,thumbnail_url,permalink,timestamp}}&access_token=${token}`;
    
    const res = await fetch(url);
    if (!res.ok) {
        const txt = await res.text();
        console.error("Graph API Failed:", txt);
        throw new Error(`Graph API failed: ${res.statusText}`);
    }
    const data = await res.json();
    return data.business_discovery?.media?.data || [];
}

async function analyzeWithAI(openai: OpenAI, caption: string, context: string, postDateString: string) {
    if (!caption) return null;

    const prompt = `
    Analyze this Instagram caption.
    CONTEXT: ${context || 'General'}.
    UPLOAD DATE: ${postDateString}.
    
    INSTRUCTION: 
    1. If the text mentions "Today", "Tomorrow", "This Weekend", calculate the specific date based on the UPLOAD DATE (${postDateString}).
    2. Ignore year if not specified, default to current year.
    
    Return JSON ONLY:
    {
      "isEvent": boolean,
      "title": "short string",
      "startDay": number,
      "startMonth": number,
      "startYear": number,
      "startHourMilitaryTime": number (0-23),
      "startMinute": number,
      "endHourMilitaryTime": number (0-23),
      "endMinute": number,
      "location": "string"
    }

    Caption: "${caption.substring(0, 1500)}"
    `;

    try {
        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: "You are a JSON event parser. Resolve relative dates based on the provided Upload Date." }, 
                { role: "user", content: prompt }
            ],
            model: "gpt-3.5-turbo-0125",
            response_format: { type: "json_object" },
            temperature: 0,
        });

        const raw = completion.choices[0].message.content;
        const result = AIEventSchema.safeParse(JSON.parse(raw));
        
        if (!result.success) {
            console.error("   [AI Schema Error]", result.error.format());
            return null;
        }
        return result.data;

    } catch (e) {
        console.error("   [AI Request Error]", e.message);
        return null;
    }
}

function removeDuplicates(events: any[]) {
    const uniqueEvents: any[] = [];
    events.sort((a, b) => a.id.localeCompare(b.id));

    for (const candidate of events) {
        let isDuplicate = false;
        for (const existing of uniqueEvents) {
            if (candidate.start === existing.start) {
                const cleanA = candidate.title.toLowerCase().replace(/[^\w\s]/g, '');
                const cleanB = existing.title.toLowerCase().replace(/[^\w\s]/g, '');
                
                if (cleanA === cleanB) { isDuplicate = true; break; }

                const wordsA = new Set(cleanA.split(/\s+/));
                const wordsB = new Set(cleanB.split(/\s+/));
                const stopWords = new Set(['the', 'and', 'for', 'with', 'at', 'in', 'of', 'to', 'a', 'an', 'reception', 'exhibition', 'event', 'show']);
                const significantA = [...wordsA].filter(w => !stopWords.has(w) && w.length > 3);
                
                if (significantA.some(w => wordsB.has(w))) { isDuplicate = true; break; }
            }
        }
        if (!isDuplicate) uniqueEvents.push(candidate);
    }
    return uniqueEvents;
}