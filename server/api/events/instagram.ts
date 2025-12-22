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

export default defineCachedEventHandler(async (event) => {
    // 1. DIAGNOSTICS & LOGGING
    const envStatus = {
        hasMetaToken: !!process.env.INSTAGRAM_USER_ACCESS_TOKEN,
        hasMetaID: !!process.env.INSTAGRAM_BUSINESS_USER_ID,
        hasOpenAI: !!process.env.OPENAI_API_KEY,
    };

    const logs: string[] = [];
    const log = (msg: string) => logs.push(msg);

    if (!envStatus.hasMetaToken || !envStatus.hasMetaID || !envStatus.hasOpenAI) {
        return { status: "ERROR", message: "Missing Keys", debug: envStatus };
    }

    try {
        const sources = eventSourcesJSON.instagram || [];
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const allResults = [];

        for (const source of sources) {
            try {
                log(`Processing @${source.username}...`);
                
                // --- GRAPH API ---
                const myId = process.env.INSTAGRAM_BUSINESS_USER_ID;
                const token = process.env.INSTAGRAM_USER_ACCESS_TOKEN;
                const url = `https://graph.facebook.com/v21.0/${myId}?fields=business_discovery.username(${source.username}){media.limit(6){id,caption,media_type,media_url,thumbnail_url,permalink,timestamp}}&access_token=${token}`;
                
                const res = await fetch(url);
                if (!res.ok) throw new Error(`Graph API (${res.status})`);
                const data = await res.json();
                const posts = data.business_discovery?.media?.data || [];
                log(`   -> Found ${posts.length} posts.`);

                // --- AI ANALYSIS ---
                const aiPromises = posts.map(async (post: any) => {
                    if (!post.caption) return null;
                    
                    // CRITICAL: Format date to include Day Name (e.g. "Monday, December 15, 2025")
                    // This helps the AI calculate "This Wednesday" correctly.
                    const postDateObj = new Date(post.timestamp);
                    const postDateString = postDateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

                    const aiResult = await analyzeWithAI(openai, post.caption, source.context_clues?.join(', '), postDateString, log);
                    
                    if (aiResult && aiResult.isEvent && aiResult.startDay) {
                        const now = new Date();
                        const year = aiResult.startYear || now.getFullYear();
                        const monthIndex = (aiResult.startMonth || (now.getMonth() + 1)) - 1; 
                        
                        let start = new Date(year, monthIndex, aiResult.startDay, aiResult.startHourMilitaryTime || 12, aiResult.startMinute || 0);
                        
                        // Fix Year Rollover (e.g. Post in Dec for Jan event)
                        if (start < new Date() && (new Date().getMonth() - start.getMonth() > 6)) {
                            start.setFullYear(year + 1);
                        }

                        let end = new Date(start);
                        if (aiResult.endHourMilitaryTime) {
                            end.setHours(aiResult.endHourMilitaryTime, aiResult.endMinute || 0);
                        } else {
                            end.setHours(start.getHours() + 1);
                        }

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
                
                const unique = removeDuplicates(events);
                log(`   -> AI identified ${unique.length} unique events.`);
                allResults.push({ events: unique, city: source.city, name: source.name });

            } catch (e: any) {
                log(`   -> ERROR source ${source.username}: ${e.message}`);
            }
        }

        return { status: "SUCCESS", logs, body: allResults };

    } catch (e: any) {
        return { status: "CRASH", message: e.message, logs };
    }
});

// --- UPDATED AI FUNCTION (GPT-4o-mini + Better Prompt) ---
async function analyzeWithAI(openai: OpenAI, caption: string, context: string, postDateString: string, log: Function) {
    
    // We strictly tell the AI to "Pretend" it is the upload date.
    const prompt = `
    You are an event extraction engine.
    
    CRITICAL INSTRUCTION:
    The current date is ${postDateString}. You must calculate all relative dates (like "This Wednesday", "Tomorrow", "Next Week") starting from ${postDateString}.
    
    Context Clues: ${context || 'None'}.
    
    Analyze the caption below. If it describes an event, extract the date/time.
    - If year is missing, assume the event happens after ${postDateString}.
    - "Wednesday" usually means the *upcoming* Wednesday after ${postDateString}.
    
    Return JSON ONLY: 
    { 
      "isEvent": boolean, 
      "title": "string", 
      "startDay": number, 
      "startMonth": number, 
      "startYear": number, 
      "startHourMilitaryTime": number, 
      "startMinute": number, 
      "endHourMilitaryTime": number, 
      "location": "string" 
    }

    Caption: "${caption.substring(0, 1000)}"
    `;

    try {
        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: "You are a helpful assistant that extracts event JSON." }, 
                { role: "user", content: prompt }
            ],
            // SWITCHED TO 4o-mini
            model: "gpt-4o-mini",
            response_format: { type: "json_object" },
            temperature: 0,
        });

        const raw = completion.choices[0].message.content;
        const result = AIEventSchema.safeParse(JSON.parse(raw));
        
        if (!result.success) {
            log(`      [AI Schema Fail] ${result.error.issues[0].message}`);
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