import fs from 'node:fs';
import path from 'node:path';

export default defineEventHandler(async (event) => {
    console.log("[Instagram] Loading events from GitHub Actions scraped data");
    
    try {
        // Read the calendar data from public folder (same pattern as other endpoints)
        const filePath = path.resolve(process.cwd(), 'public', 'calendar_data.json');
        
        console.log(`[Instagram] Looking for file at: ${filePath}`);
        console.log(`[Instagram] Current working directory: ${process.cwd()}`);
        console.log(`[Instagram] File exists: ${fs.existsSync(filePath)}`);
        
        if (!fs.existsSync(filePath)) {
            console.log("[Instagram] Calendar data file not found");
            return { body: [] };
        }

        const fileContent = fs.readFileSync(filePath, 'utf-8');
        console.log(`[Instagram] File content length: ${fileContent.length}`);
        
        const calendarData = JSON.parse(fileContent);
        console.log(`[Instagram] Parsed data type: ${typeof calendarData}, is array: ${Array.isArray(calendarData)}`);

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
        console.error("[Instagram] Error details:", error.message);
        return { body: [] };
    }
});
