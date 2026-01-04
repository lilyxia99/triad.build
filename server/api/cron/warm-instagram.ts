// server/routes/cron.ts (or wherever your cron handler is)
import eventSourcesJSON from '@/assets/event_sources.json';

// Helper to pause execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default defineEventHandler(async (event) => {
    // 1. Determine the Base URL
    // VERCEL_URL is provided automatically, but excludes 'https://'
    const baseUrl = process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : 'http://localhost:3000';

    console.log("[Cron] Starting Calendar Refresh...");
    
    const sources = eventSourcesJSON.instagram || [];
    const results = [];

    for (const source of sources) {
        try {
            // 2. CRITICAL CHANGE: Use Absolute URL
            // This forces the request out to the internet and back through Vercel's CDN,
            // triggering the 'swr' rule we set in nuxt.config.ts.
            const endpoint = `${baseUrl}/api/events/instagram?username=${source.username}`;
            
            console.log(`[Cron] Warming public cache: ${endpoint}`);
            
            // This request will regenerate the data and store it in the CDN
            await $fetch(endpoint);
            
            results.push({ user: source.username, status: 'Refreshed' });
            
            // Polite delay
            await delay(2000); 

        } catch (e: any) {
            console.error(`[Cron] Failed:`, e.message);
            results.push({ user: source.username, status: 'Failed', error: e.message });
        }
    }

    return { success: true, results };
});