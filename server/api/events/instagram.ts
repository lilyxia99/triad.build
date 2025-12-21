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
    location: z.string().nullable().optional(),
});

export default defineEventHandler(async (event) => {
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
    if (sources.length === 0) {
        console.log('[Instagram] No sources defined in event_sources.json');
        return [];
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const allResults = [];

    console.log(`[Instagram] Processing ${sources.length} sources from config...`);

    for (const source of sources) {
        try {
            console.log(`\n--- FETCHING @${source.username} ---`);
            
            // 1. Fetch Posts
            const posts = await getInstagramPosts(source.username);
            console.log(`   [Graph API] Found ${posts.length} posts.`);

            const events = [];

            // 2. AI Analysis Loop
            for (const post of posts) {
                // Shorten caption for log readability
                const shortCap = post.caption ? post.caption.substring(0, 30).replace(/\n/g, ' ') + '...' : '[No Caption]';
                
                console.log(`   [AI] Analyzing post ${post.id}: "${shortCap}"`); 

                const aiResult = await analyzeWithAI(openai, post.caption, source.context_clues?.join(', '));
                
                if (aiResult && aiResult.isEvent && aiResult.startDay) {
                    console.log(`      ✅ [EVENT MATCH] "${aiResult.title}" | Date: ${aiResult.startMonth}/${aiResult.startDay} | Time: ${aiResult.startHourMilitaryTime || '??'}:00`);
                    
                    // Construct Date Objects
                    const now = new Date();
                    const year = aiResult.startYear || now.getFullYear();
                    const monthIndex = (aiResult.startMonth || (now.getMonth() + 1)) - 1; 
                    
                    const start = new Date(year, monthIndex, aiResult.startDay, aiResult.startHourMilitaryTime || 12, aiResult.startMinute || 0);
                    
                    // Year Rollover Fix
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
					
					// Logic: If it's a VIDEO, use the thumbnail. Otherwise, use the media_url.
					const mainImage = (post.media_type === 'VIDEO' && post.thumbnail_url) 
						? post.thumbnail_url 
						: post.media_url;
                    events.push({
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
                    });
                } else {
                    console.log(`      ❌ [Not Event] AI prediction: ${JSON.stringify(aiResult)}`);
                }
            }
            
            console.log(`   -> Added ${events.length} valid events from @${source.username}`);

            allResults.push({
                events,
                city: source.city,
                name: source.name
            });

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
    
    // Fetch last 6 posts
    const url = `https://graph.facebook.com/v21.0/${myId}?fields=business_discovery.username(${username}){media.limit(6){id,caption,media_type,media_url,thumbnail_url,permalink,timestamp}}&access_token=${token}`;

    const res = await fetch(url);
    if (!res.ok) {
        const err = await res.text();
        console.error(`   [Graph API Error] ${res.status} ${res.statusText}`);
        console.error(`   Body: ${err}`);
        throw new Error(`Graph API failed`);
    }

    const data = await res.json();
    return data.business_discovery?.media?.data || [];
}

async function analyzeWithAI(openai: OpenAI, caption: string, context: string) {
    if (!caption) return null;

    const prompt = `
    Analyze this Instagram caption. Context clues: ${context || 'General'}.
    Current Date: ${new Date().toDateString()}.
    
    Is this a specific event with a date?
    Return JSON ONLY:
    {
      "isEvent": boolean,
      "title": "short string",
      "startDay": number,
      "startMonth": number,
      "startYear": number,
      "startHourMilitaryTime": number (0-23),
      "startMinute": number,
      "location": "string"
    }

    Caption: "${caption.substring(0, 1500)}"
    `;

    try {
        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: "You are a JSON event parser." }, 
                { role: "user", content: prompt }
            ],
            model: "gpt-3.5-turbo-0125",
            response_format: { type: "json_object" },
            temperature: 0,
        });

        const raw = completion.choices[0].message.content;
        const parsed = JSON.parse(raw);
        
        // Quick Zod check
        const safe = AIEventSchema.safeParse(parsed);
        if (safe.success) return safe.data;
        
        console.log(`   [AI Parse Error] Invalid JSON structure: ${raw}`);
        return null;

    } catch (e) {
        console.error("   [OpenAI Error]", e.message);
        return null;
    }
}