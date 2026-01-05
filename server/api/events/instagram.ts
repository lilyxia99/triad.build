import fs from 'node:fs';
import path from 'node:path';

export default defineEventHandler(async (event) => {
    console.log("[Instagram] Loading events from GitHub Actions scraped data");
    
    try {
        // Read the calendar data from public folder (accessible at runtime on Vercel)
        const filePath = path.resolve(process.cwd(), 'public', 'calendar_data.json');
        
        if (!fs.existsSync(filePath)) {
            console.log("[Instagram] Calendar data file not found");
            return { body: [] };
        }

        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const calendarData = JSON.parse(fileContent);

        if (calendarData && Array.isArray(calendarData)) {
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
});
