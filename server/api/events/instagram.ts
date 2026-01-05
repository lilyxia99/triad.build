export default defineEventHandler(async (event) => {
    console.log("[Instagram] Loading events from GitHub Actions scraped data");
    
    try {
        // Import the calendar data directly (like archive_meetup.ts does)
        const calendarData = await import('@/public/calendar_data.json');
        
        if (calendarData.default && Array.isArray(calendarData.default)) {
            console.log(`[Instagram] Loaded ${calendarData.default.length} Instagram event sources`);
            
            // Filter out sources with no events
            const sourcesWithEvents = calendarData.default.filter(source => 
                source.events && Array.isArray(source.events) && source.events.length > 0
            );
            
            console.log(`[Instagram] Found ${sourcesWithEvents.length} sources with events`);
            return { body: sourcesWithEvents };
        } else {
            console.log("[Instagram] No valid calendar data found");
            return { body: [] };
        }
    } catch (error) {
        console.error("[Instagram] Failed to load calendar data:", error);
        return { body: [] };
    }
});
