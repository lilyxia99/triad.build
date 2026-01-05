import fs from 'node:fs';
import path from 'node:path';

export default defineEventHandler(async (event) => {
    console.log("[Instagram] Loading events from local calendar data file");
    
    try {
        // Read the calendar data from assets folder (same pattern as archive_meetup.ts)
        const filePath = path.resolve(process.cwd(), 'assets', 'calendar_data.json');
        
        console.log("[Instagram] Looking for file at:", filePath);
        console.log("[Instagram] File exists:", fs.existsSync(filePath));
        
        if (!fs.existsSync(filePath)) {
            console.log("[Instagram] Calendar data file not found at:", filePath);
            console.log("[Instagram] Current working directory:", process.cwd());
            console.log("[Instagram] Directory contents:", fs.readdirSync(process.cwd()));
            return { body: [] };
        }

        const fileContent = fs.readFileSync(filePath, 'utf-8');
        console.log("[Instagram] File content length:", fileContent.length);
        console.log("[Instagram] First 200 chars:", fileContent.substring(0, 200));
        
        const calendarData = JSON.parse(fileContent);
        console.log("[Instagram] Parsed data type:", typeof calendarData);
        console.log("[Instagram] Is array:", Array.isArray(calendarData));

        if (calendarData && Array.isArray(calendarData)) {
            console.log(`[Instagram] Loaded ${calendarData.length} Instagram event sources`);
            
            // Log details about each source
            calendarData.forEach((source, index) => {
                console.log(`[Instagram] Source ${index}: ${source.name}, events: ${source.events?.length || 0}`);
            });
            
            // Filter out sources with no events
            const sourcesWithEvents = calendarData.filter(source => 
                source.events && Array.isArray(source.events) && source.events.length > 0
            );
            
            console.log(`[Instagram] Found ${sourcesWithEvents.length} sources with events`);
            console.log("[Instagram] Returning body:", JSON.stringify({ body: sourcesWithEvents }, null, 2));
            return { body: sourcesWithEvents };
        } else {
            console.log("[Instagram] Invalid calendar data format, data:", calendarData);
            return { body: [] };
        }
    } catch (error) {
        console.error("[Instagram] Failed to load calendar data:", error);
        console.error("[Instagram] Error stack:", error.stack);
        return { body: [] };
    }
});
