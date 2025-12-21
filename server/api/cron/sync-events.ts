import { ApifyClient } from 'apify-client';

// Initialize the client
const client = new ApifyClient({
    token: process.env.APIFY_API_TOKEN,
});

export default defineEventHandler(async (event) => {
    // 1. Check for a secret key to prevent strangers from triggering your scraper
    const { auth } = getQuery(event);
    if (auth !== process.env.CRON_SECRET) {
        throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
    }

    try {
        // 2. Start the Facebook Events Scraper Actor
        // Replace 'actor-id' with the specific ID (e.g., 'apify/facebook-events-scraper')
        const run = await client.actor('apify/facebook-events-scraper').call({
            startUrls: [{ url: 'https://www.facebook.com/events/...' }], // Your target URLs
            maxItems: 50,
        });

        // 3. Fetch the results from the dataset
        const { items } = await client.dataset(run.defaultDatasetId).listItems();

        // 4. IMPORTANT: Save 'items' to your database here
        // Example: await useStorage().setItem('db:events', items); 
        // Or insert into Supabase/Firebase/MongoDB
        
        return { success: true, count: items.length };

    } catch (error) {
        console.error(error);
        return { success: false, error: error.message };
    }
});