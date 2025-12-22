import OpenAI from 'openai';
import { z } from 'zod';
import eventSourcesJSON from '@/assets/event_sources.json';
import { applyEventTags } from '@/utils/util';

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

// --- UNCACHED DEBUG HANDLER ---
export default defineCachedEventHandler(async (event) => {
    // 1. SETUP LOGGING
    const logs: string[] = [];
    const log = (msg: string) => logs.push(msg);
    
    // 2. CHECK KEYS
    const envStatus = {
        hasMetaToken: !!process.env.INSTAGRAM_USER_ACCESS_TOKEN,
        hasMetaID: !!process.env.INSTAGRAM_BUSINESS_USER_ID,
        hasOpenAI: !!process.env.OPENAI_API_KEY,
    };

    if (!envStatus.hasMetaToken || !envStatus.hasMetaID || !envStatus.hasOpenAI) {
        return { status: "ERROR", message: "Missing Environment Variables", debug: envStatus };
    }

    // 3. RUN SCRAPER
    try {
        const sources = eventSourcesJSON.instagram || [];
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const allResults = [];

        for (const source of sources) {
            // FIX: Declare 'posts' OUTSIDE the try block so it is always safe to use
            let posts: any[] = [];

            try {
                log(`Processing @${source.username}...`);
                
                // --- GRAPH API ---
                const myId = process.env.INSTAGRAM_BUSINESS_USER_ID;
                const token = process.env.INSTAGRAM_USER_ACCESS_TOKEN;
                const url = `https://graph.facebook.com/v21.0/${myId}?fields=business_discovery.username(${source.username}){media.limit(6){id,caption,media_type,media_url,thumbnail_url,permalink,timestamp}}&access_token=${token}`;
                
                const res = await fetch(url);
                
                if (!res.ok) {
                    const txt = await res.text();
                    
                    // DETECT RATE LIMIT
                    if (txt.includes('(#4)') || txt.includes('limit reached')) {
                        log(`   -> 🛑 RATE LIMIT HIT: You are temporarily banned by Facebook. Wait 1 hour.`);
                    } else if (txt.includes('Permissions error')) {
                         log(`   -> 🛑 PERMISSION ERROR: Check App Mode (Live vs Dev) or Token validity.`);
                    } else {
                        log(`   -> 🛑 API ERROR: ${txt}`);
                    }
                    // Skip to next source
                    continue; 
                }
                
                const data = await res.json();
                posts = data.business_discovery?.media?.data || [];
                log(`   -> Found ${posts.length} posts.`);

                // --- AI ANALYSIS ---
                const events = [];
                // Process sequentially to be gentle on APIs
                for (const post of posts) {
                    if (!post.caption) continue;

                    const postDateObj = new Date(post.timestamp);
                    const postDateString = postDateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

                    // Pass 'log' so we can see AI errors if they happen
                    const aiResult = await analyzeWithAI(openai, post.caption, source.context_clues?.join(', '), postDateString, log);
                    
                    if (aiResult && aiResult.isEvent && aiResult.startDay) {
                        const now = new Date();
                        const year = aiResult.startYear || now.getFullYear();
                        const monthIndex = (aiResult.startMonth || (now.getMonth() + 1)) - 1; 
                        
                        let start = new Date(year, monthIndex, aiResult.startDay, aiResult.startHourMilitaryTime || 12, aiResult.startMinute || 0);
                        if (start < new Date() && (new Date().getMonth() - start.getMonth() > 6)) start.setFullYear(year + 1);

                        let end = new Date(start);
                        if (aiResult.endHourMilitaryTime) end.setHours(aiResult.endHourMilitaryTime, aiResult.endMinute || 0);
                        else end.setHours(start.getHours() + 1);

                        let title = aiResult.title || "Instagram Event";
                        let description = post.caption;
                        if (source.suffixDescription) description += source.suffixDescription;
                        const mainImage = (post.media_type === 'VIDEO' && post.thumbnail_url) ? post.thumbnail_url : post.media_url;

                        events.push({
                            id: `ig-${post.id}`,
                            title,
                            org: source.name,
                            start: start.toISOString(),
                            end: end.toISOString(),
                            url: post.permalink,
                            location: aiResult.location || source.defaultLocation,
                            description,
                            images: [mainImage].filter(Boolean),
                            tags: applyEventTags(source, title, description)
                        });
                    }
                }
                
                const unique = removeDuplicates(events);
                log(`   -> Added ${unique.length} unique events.`);
                allResults.push({ events: unique, city: source.city, name: source.name });

            } catch (e: any) {
                log(`   -> CRASH on source ${source.username}: ${e.message}`);
            }
        }

        return { status: "SUCCESS", logs, body: allResults };

    } catch (e: any) {
        return { status: "CRITICAL FAILURE", message: e.message, logs };
    }
});

// --- HELPERS ---
async function analyzeWithAI(openai: OpenAI, caption: string, context: string, postDateString: string, log: Function) {
    const prompt = `
    Analyze this Instagram caption. UPLOAD DATE: ${postDateString}.
    Calculate relative dates (e.g. "This Wednesday") starting from ${postDateString}.
    Context: ${context}.
    Return JSON ONLY: { "isEvent": boolean, "title": "string", "startDay": number, "startMonth": number, "startYear": number, "startHourMilitaryTime": number, "startMinute": number, "endHourMilitaryTime": number, "location": "string" }
    Caption: "${caption.substring(0, 1000)}"
    `;

    try {
        const completion = await openai.chat.completions.create({
            messages: [{ role: "system", content: "You are a JSON event parser." }, { role: "user", content: prompt }],
            model: "gpt-4o-mini",
            response_format: { type: "json_object" },
            temperature: 0,
        });

        const raw = completion.choices[0].message.content;
        const result = AIEventSchema.safeParse(JSON.parse(raw));
        if (!result.success) {
            // log(`      [AI Ignored] Invalid Schema`);
            return null;
        }
        return result.data;

    } catch (e: any) {
        log(`      [AI Error] ${e.message}`);
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
            }
        }
        if (!isDuplicate) uniqueEvents.push(candidate);
    }
    return uniqueEvents;
}