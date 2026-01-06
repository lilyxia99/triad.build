import fs from 'node:fs';
import path from 'node:path';

export default defineEventHandler(async (event) => {
    console.log("[Instagram] ===== INSTAGRAM ENDPOINT CALLED =====");
    console.log("[Instagram] Loading events from GitHub Actions scraped data");
    
    try {
        // Read the calendar data from public folder (same pattern as other endpoints)
        const filePath = path.resolve(process.cwd(), 'public', 'calendar_data.json');
        
        console.log(`[Instagram] Looking for file at: ${filePath}`);
        console.log(`[Instagram] Current working directory: ${process.cwd()}`);
        console.log(`[Instagram] File exists: ${fs.existsSync(filePath)}`);
        
        if (!fs.existsSync(filePath)) {
            console.log("[Instagram] Calendar data file not found, returning empty array");
            return { body: [] };
        }

        const fileContent = fs.readFileSync(filePath, 'utf-8');
        console.log(`[Instagram] File content length: ${fileContent.length}`);
        
        if (fileContent.length === 0) {
            console.log("[Instagram] File is empty, returning empty array");
            return { body: [] };
        }
        
        const calendarData = JSON.parse(fileContent);
        console.log(`[Instagram] Parsed data type: ${typeof calendarData}, is array: ${Array.isArray(calendarData)}`);
        console.log(`[Instagram] Total items in array: ${calendarData?.length || 0}`);

        if (calendarData && Array.isArray(calendarData)) {
            console.log(`[Instagram] Loaded ${calendarData.length} Instagram event sources`);
            
            // Log each source for debugging
            calendarData.forEach((source, index) => {
                console.log(`[Instagram] Source ${index}: ${source.name}, events: ${source.events?.length || 0}`);
            });
            
            // Return all sources, even those without events (to match other endpoints)
            console.log(`[Instagram] Returning all ${calendarData.length} Instagram sources`);
            return { body: calendarData };
        } else {
            console.log("[Instagram] Invalid calendar data format, returning empty array");
            return { body: [] };
        }
    } catch (error) {
        console.error("[Instagram] Failed to load calendar data:", error);
        console.error("[Instagram] Error details:", error?.message);
        return { body: [] };
    }
});
