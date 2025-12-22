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

export default defineCachedEventHandler(async (event) => {
    const startTime = new Date();
    
    // DEBUG: Check Environment Variables
    const hasMetaToken = !!process.env.INSTAGRAM_USER_ACCESS_TOKEN;
    const hasMetaID = !!process.env.INSTAGRAM_BUSINESS_USER_ID;
    const hasOpenAI = !!process.env.OPENAI_API_KEY;

    console.log(`\n[Instagram Init] Keys Present? MetaToken: ${hasMetaToken}, MetaID: ${hasMetaID}, OpenAI: ${hasOpenAI}`);

    if (!hasMetaToken || !hasMetaID || !hasOpenAI) {
        console.error('[Instagram Error] Missing API Keys in .env');
        return { body: [] };
    }

    const body = await fetchInstagramEvents();
    logTimeElapsedSince(startTime.getTime(), 'Instagram: events process complete.');

    return { body };

}, { 
    maxAge: 60 * 60 * 4, // 4 hours cache
    swr: true 
});


// --- MAIN FUNCTION ---

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

                // --- 1. CONVERT TIMESTAMP TO DATE STRING ---
                // Instagram gives "2025-12-20T14:00:00+0000"
                // We format it to "Saturday, December 20, 2025" so the AI understands "Today"
                const postDateObj = new Date(post.timestamp);
                const postDateString = postDateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

                const aiResult = await analyzeWithAI(openai, post.caption, source.context_clues?.join(', '), postDateString);
                
                if (aiResult && aiResult.isEvent && aiResult.startDay) {
                    console.log(`      ✅ [EVENT MATCH] "${aiResult.title}" | Date: ${aiResult.startMonth}/${aiResult.startDay}`);
                    
                    const now = new Date();
                    const year = aiResult.startYear || now.getFullYear();
                    const monthIndex = (aiResult.startMonth || (now.getMonth() + 1)) - 1; 
                    
                    const start = new Date(year, monthIndex, aiResult.startDay, aiResult.startHourMilitaryTime || 12, aiResult.startMinute || 0);
                    
                    // Year Rollover (e.g. Post in Dec for Jan event)
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
                    const mainImage = (post.media_type === 'VIDEO' && post.thumbnail_url) ? post.thumbnail_url : post.media_url;

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

            const results = await Promise.all(aiPromises);
            const rawEvents = results.filter(e => e !== null);
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
    const url = `https://graph.facebook.com/v21.0/${myId}?fields=business_discovery.username(${username}){media.limit(6){id,caption,media_type,media_url,thumbnail_url,permalink,timestamp}}&access_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Graph API failed`);
    const data = await res.json();
    return data.business_discovery?.media?.data || [];
}

// --- UPDATED AI FUNCTION ---
async function analyzeWithAI(openai: OpenAI, caption: string, context: string, postDateString: string) {
    if (!caption) return null;

    // We explicitly tell the AI when the post was made.
    const prompt = `
    Analyze this Instagram caption.
    CONTEXT CLUES: ${context || 'General'}.
    
    CRITICAL DATE INFO:
    - This post was uploaded on: ${postDateString}.
    - If the text says "Today", "Tonight", or "Tomorrow", calculate the date relative to the UPLOAD DATE (${postDateString}), NOT the current real-world date.
    
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
        return AIEventSchema.parse(JSON.parse(raw));
    } catch (e) {
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
                const stopWords = new Set(['the', 'and', 'for', 'with', 'at', 'in', 'of', 'to', 'a', 'an', 'reception', 'exhibition']);
                const significantA = [...wordsA].filter(w => !stopWords.has(w) && w.length > 3);
                
                if (significantA.some(w => wordsB.has(w))) { isDuplicate = true; break; }
            }
        }
        if (!isDuplicate) uniqueEvents.push(candidate);
    }
    return uniqueEvents;
}