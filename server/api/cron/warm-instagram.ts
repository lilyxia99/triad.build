import eventSourcesJSON from '@/assets/event_sources.json';

// Helper to pause execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// FIX 1: Use 'defineEventHandler' (NOT cached). 
// We want this script to actually execute every single time it is called.
export default defineEventHandler(async (event) => {
    
    // Security check (Uncomment for production)
    // const authHeader = getRequestHeader(event, 'authorization');
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) return { status: 'Unauthorized' };

    console.log("[Cron] Starting Instagram Warm-up (Sequential)...");
    
    const sources = eventSourcesJSON.instagram || [];
    const results = [];

    for (const source of sources) {
        try {
            // FIX 2: Use a relative path. 
            // Nuxt will call the function directly in memory. No network/port errors.
            const endpoint = `/api/events/instagram?username=${source.username}`;
            
            console.log(`[Cron] Warming up @${source.username}...`);
            
            await $fetch(endpoint);
            
            results.push({ user: source.username, status: 'Success' });
            console.log(`   -> Done.`);

            // Wait 2 seconds to be polite (prevents Rate Limit)
            await delay(2000); 

        } catch (e: any) {
            console.error(`[Cron] Failed to warm @${source.username}:`, e.message);
            results.push({ user: source.username, status: 'Failed', error: e.message });
        }
    }

    return { success: true, results };
});