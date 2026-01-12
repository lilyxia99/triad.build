export default defineEventHandler(async (event) => {
    console.log("[Instagram] ===== READING ASSET VIA STORAGE =====");

    try {
        // 1. Get the raw data
        const rawData = await useStorage().getItem('assets:server:instagram_data.json');

        if (!rawData || !Array.isArray(rawData)) {
            console.warn("[Instagram] Data is empty or not an array");
            return { body: [] };
        }

        // 2. Map raw items to your "Standard Event" format
        // (Adjust the property names on the RIGHT side to match your specific JSON fields)
        const normalizedEvents = rawData.map((item: any) => ({
            id: item.id || `insta-${Math.random().toString(36).substr(2, 9)}`, // Fallback ID
            title: item.title || item.caption || 'Instagram Event',
            org: item.username || 'Instagram',
            start: item.timestamp || item.date || new Date().toISOString(),
            end: item.timestamp || item.date || new Date().toISOString(), // Instagram often lacks end times
            url: item.permalink || item.url || '',
            location: item.location || 'Instagram',
            description: item.caption || '',
            images: item.media_url ? [item.media_url] : [],
            tags: ['instagram'] // Add default tag
        }));

        // 3. Wrap it in the "Source" structure to match Google Calendar
        const structuredResult = [{
            name: "Instagram Scrape",
            city: "Greensboro", // Or make this dynamic if your data has cities
            events: normalizedEvents
        }];

        console.log(`[Instagram] Returning ${normalizedEvents.length} events formatted as a Source.`);
        
        return { body: structuredResult };

    } catch (error) {
        console.error("[Instagram] Error:", error);
        return { body: [] };
    }
});