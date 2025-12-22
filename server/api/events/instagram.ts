import OpenAI from 'openai';
import { z } from 'zod';
import eventSourcesJSON from '@/assets/event_sources.json';
import { applyEventTags } from '@/utils/util'; // Removed logTimeElapsedSince to simplify

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

export default defineEventHandler(async (event) => {
    // 1. DIAGNOSTICS
    const envStatus = {
        hasMetaToken: !!process.env.INSTAGRAM_USER_ACCESS_TOKEN,
        hasMetaID: !!process.env.INSTAGRAM_BUSINESS_USER_ID,
        hasOpenAI: !!process.env.OPENAI_API_KEY,
    };

    // 2. INTERNAL LOG COLLECTOR (To see errors in the browser)
    const logs: string[] = [];
    const log = (msg: string) => logs.push(msg);

    if (!envStatus.hasMetaToken || !envStatus.hasMetaID || !envStatus.hasOpenAI) {
        return { status: "ERROR", message: "Missing Keys", debug: envStatus };
    }

    // 3. RUN SCRAPER
    try {
        const sources = eventSourcesJSON.instagram || [];
        log(`Found ${sources.length} sources in config.`);

        if (sources.length === 0) {
            return { status: "WARNING", message: "No sources in JSON", logs };
        }

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const allResults = [];

        for (const source of sources) {
            try {
                log(`Processing @${source.username}...`);
                
                // --- GRAPH API CALL ---
                const myId = process.env.INSTAGRAM_BUSINESS_USER_ID;
                const token = process.env.INSTAGRAM_USER_ACCESS_TOKEN;
                const url = `https://graph.facebook.com/v21.0/${myId}?fields=business_discovery.username(${source.username}){media.limit(6){id,caption,media_type,media_url,thumbnail_url,permalink,timestamp}}&access_token=${token}`;
                
                const res = await fetch(url);
                if (!res.ok) {
                    const txt = await res.text();
                    throw new Error(`Graph API (${res.status}): ${txt}`);
                }
                
                const data = await res.json();
                const posts = data.business_discovery?.media?.data || [];
                log(`   -> Found ${posts.length} posts.`);

                // --- AI ANALYSIS ---
                const aiPromises = posts.map(async (post: any) => {
                    if (!post.caption) return null;
                    
                    const postDateObj = new Date(post.timestamp);
                    const postDateString = postDateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

                    const aiResult = await analyzeWithAI(openai, post.caption, source.context_clues?.join(', '), postDateString);
                    
                    if (aiResult && aiResult.isEvent && aiResult.startDay) {
                        // ... (Event construction logic) ...
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

                        return {
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
                        };
                    }
                    return null;
                });

                const results = await Promise.all(aiPromises);
                const events = results.filter(e => e !== null);
                log(`   -> AI identified ${events.length} events.`);
                
                // Deduplicate
                const unique = removeDuplicates(events);
                allResults.push({ events: unique, city: source.city, name: source.name });

            } catch (e: any) {
                log(`   -> ERROR processing ${source.username}: ${e.message}`);
            }
        }

        return { status: "SUCCESS", logs, body: allResults };

    } catch (e: any) {
        return { status: "CRASH", message: e.message, logs };
    }
});

// --- HELPERS (Keep existing logic, just stripped for length in this view) ---
async function analyzeWithAI(openai: OpenAI, caption: string, context: string, postDateString: string) {
    // ... Copy your existing analyzeWithAI function here ...
    // (Ensure you keep the exact logic we established previously)
    if (!caption) return null;
    const prompt = `Analyze this Instagram caption. CONTEXT: ${context}. UPLOAD DATE: ${postDateString}. Return JSON event data.`;
    try {
        const completion = await openai.chat.completions.create({
            messages: [{ role: "system", content: "You are a JSON event parser." }, { role: "user", content: prompt }],
            model: "gpt-3.5-turbo-0125",
            response_format: { type: "json_object" },
            temperature: 0,
        });
        const raw = completion.choices[0].message.content;
        const result = AIEventSchema.safeParse(JSON.parse(raw));
        if (result.success) return result.data;
        return null;
    } catch (e) { return null; }
}

function removeDuplicates(events: any[]) {
    // ... Copy your existing removeDuplicates function here ...
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