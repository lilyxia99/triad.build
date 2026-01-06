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
        console.log(`[Instagram] First 200 chars: ${fileContent.substring(0, 200)}`);
        
        const calendarData = JSON.parse(fileContent);
        console.log(`[Instagram] Parsed data type: ${typeof calendarData}, is array: ${Array.isArray(calendarData)}`);
        console.log(`[Instagram] Total items in array: ${calendarData?.length || 0}`);

        if (calendarData && Array.isArray(calendarData)) {
            console.log(`[Instagram] Loaded ${calendarData.length} Instagram event sources`);
            
            // Log each source for debugging
            calendarData.forEach((source, index) => {
                console.log(`[Instagram] Source ${index}: ${source.name}, events: ${source.events?.length || 0}`);
            });
            
            // Filter out sources with no events
            const sourcesWithEvents = calendarData.filter(source => 
                source.events && Array.isArray(source.events) && source.events.length > 0
            );
            
            console.log(`[Instagram] Found ${sourcesWithEvents.length} sources with events out of ${calendarData.length} total`);
            
            if (sourcesWithEvents.length > 0) {
                console.log(`[Instagram] Returning sources with events:`, sourcesWithEvents.map(s => s.name));
            }
            
            return { body: sourcesWithEvents };
        } else {
            console.log("[Instagram] Invalid calendar data format or empty data");
            return { body: [] };
        }
    } catch (error) {
        console.error("[Instagram] Failed to load calendar data:", error);
        console.error("[Instagram] Error details:", error.message);
        console.error("[Instagram] Error stack:", error.stack);
        return { body: [] };
    }
});
