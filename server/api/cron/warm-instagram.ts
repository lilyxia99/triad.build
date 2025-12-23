import eventSourcesJSON from '@/assets/event_sources.json';

// 1. Helper function to create a pause
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default defineCachedEventHandler(async (event) => {
    // Security check (Uncomment for production)
    // const authHeader = getRequestHeader(event, 'authorization');
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) return { status: 'Unauthorized' };

    console.log("[Cron] Starting Instagram Warm-up (Sequential)...");
    
    const sources = eventSourcesJSON.instagram || [];
    const results = [];

    // 2. USE A STANDARD FOR-LOOP (Not .map or Promise.all)
    // This forces the code to wait for one to finish before starting the next.
    for (const source of sources) {
        try {
            // Get the base URL dynamically
            const baseUrl = getRequestURL(event).origin;
            const endpoint = `${baseUrl}/api/events/instagram?username=${source.username}`;
            
            console.log(`[Cron] Warming up @${source.username}...`);
            
            // Fetch and wait for the result
            await $fetch(endpoint);
            
            results.push({ user: source.username, status: 'Success' });
            console.log(`   -> Done.`);

            // 3. THE IMPORTANT PART: Sleep for 2 seconds between requests
            // This prevents the "Rate Limit" error.
            await delay(2000); 

        } catch (e: any) {
            console.error(`[Cron] Failed to warm @${source.username}:`, e.message);
            results.push({ user: source.username, status: 'Failed', error: e.message });
        }
    }

    return { success: true, results };
});