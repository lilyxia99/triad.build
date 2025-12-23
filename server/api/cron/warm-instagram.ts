import eventSourcesJSON from '@/assets/event_sources.json';

export default defineEventHandler(async (event) => {
    // TEMPORARY: Comment out auth check for local testing if needed
    const authHeader = getRequestHeader(event, 'authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) { return { status: 'Unauthorized' }; }

    console.log("[Cron] Starting Instagram Warm-up...");
    
    const sources = eventSourcesJSON.instagram || [];
    
    // Use Promise.all to fetch ALL accounts simultaneously
    const results = await Promise.all(sources.map(async (source) => {
        try {
            // "origin" is the current domain (localhost:3000 or your-site.vercel.app)
            const endpoint = `${getRequestURL(event).origin}/api/events/instagram?username=${source.username}`;
            
            console.log(`[Cron] Triggering warm-up for @${source.username}...`);
            await $fetch(endpoint);
            
            return { user: source.username, status: 'Success' };
        } catch (e) {
            console.error(`[Cron] Failed to warm @${source.username}`);
            return { user: source.username, status: 'Failed' };
        }
    }));

    return { success: true, results };
});