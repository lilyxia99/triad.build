import fs from 'node:fs';
import path from 'node:path';

export default defineEventHandler(async (event) => {
    console.log("[Instagram] Loading events from local calendar data file");
    
    try {
        // Read the calendar data from assets folder (same pattern as archive_meetup.ts)
        const filePath = path.resolve(process.cwd(), 'assets', 'calendar_data.json');
        
        if (!fs.existsSync(filePath)) {
            console.log("[Instagram] Calendar data file not found at:", filePath);
            return { body: [] };
        }

        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const calendarData = JSON.parse(fileContent);

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
});
