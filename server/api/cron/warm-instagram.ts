import eventSourcesJSON from '@/assets/event_sources.json';

export default defineEventHandler(async (event) => {
    // 1. Security Check (Optional but Recommended)
    // Only allow Vercel Cron to trigger this
    const authHeader = getRequestHeader(event, 'authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        // You can skip this check while testing, but it prevents strangers from spamming your scraper
        // return { status: 'Unauthorized' };
    }

    console.log("[Cron] Starting Instagram Warm-up...");
    
    const sources = eventSourcesJSON.instagram || [];
    const results = [];

    // 2. Loop through all accounts and trigger the scrape
    // We use Promise.all to run them concurrently (or sequentially if you prefer to be gentle)
    for (const source of sources) {
        try {
            const endpoint = `${getRequestURL(event).origin}/api/events/instagram?username=${source.username}`;
            console.log(`[Cron] Warming up @${source.username}...`);
            
            // We force a fetch. This triggers the defineCachedEventHandler to update its cache.
            // We await it so the Vercel Function doesn't die before finishing.
            await $fetch(endpoint); 
            
            results.push({ user: source.username, status: 'Refreshed' });
        } catch (e) {
            console.error(`[Cron] Failed to warm @${source.username}:`, e);
            results.push({ user: source.username, status: 'Failed' });
        }
    }

    return { success: true, results };
});