// --- CONFIGURATION ---
const CACHE_MAX_AGE = 60 * 60 * 24; // 24 Hours

// --- CACHED HANDLER ---
export default defineCachedEventHandler(async (event) => {
    console.log("[Instagram] Loading events from GitHub Actions scraped data");
    
    try {
        // Read the calendar data from the file system
        const fs = await import('fs');
        const path = await import('path');
        
        const calendarDataPath = path.join(process.cwd(), 'public', 'calendar_data.json');
        
        if (!fs.existsSync(calendarDataPath)) {
            console.log("[Instagram] Calendar data file not found");
            return { body: [] };
        }
        
        const calendarDataRaw = fs.readFileSync(calendarDataPath, 'utf-8');
        const calendarData = JSON.parse(calendarDataRaw);
        
        if (calendarData && Array.isArray(calendarData)) {
            console.log(`[Instagram] Loaded ${calendarData.length} Instagram event sources`);
            
            // Filter out sources with no events
            const sourcesWithEvents = calendarData.filter(source => 
                source.events && Array.isArray(source.events) && source.events.length > 0
            );
            
            console.log(`[Instagram] Found ${sourcesWithEvents.length} sources with events`);
            return { body: sourcesWithEvents };
        } else {
            console.log("[Instagram] Invalid calendar data format");
            return { body: [] };
        }
    } catch (error) {
        console.error("[Instagram] Failed to load calendar data:", error);
        return { body: [] };
    }
}, {
    maxAge: CACHE_MAX_AGE,
    swr: true, 
});
