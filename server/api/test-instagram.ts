import fs from 'node:fs';
import path from 'node:path';

export default defineEventHandler(async (event) => {
    console.log("[Instagram] ===== INSTAGRAM ENDPOINT CALLED =====");
    console.log("[Instagram] Request URL:", event.node.req.url);
    console.log("[Instagram] Request method:", event.node.req.method);
    console.log("[Instagram] Request headers:", event.node.req.headers);
    console.log("[Instagram] Loading events from GitHub Actions scraped data");
    
    try {
        // Read the calendar data from public folder (same pattern as other endpoints)
        const filePath = path.resolve(process.cwd(), 'public', 'calendar_data.json');
        
        console.log(`[Instagram] Looking for file at: ${filePath}`);
        console.log(`[Instagram] Current working directory: ${process.cwd()}`);
        console.log(`[Instagram] File exists: ${fs.existsSync(filePath)}`);
        
        // List contents of public directory for debugging
        const publicDir = path.resolve(process.cwd(), 'public');
        if (fs.existsSync(publicDir)) {
            const publicFiles = fs.readdirSync(publicDir);
            console.log(`[Instagram] Public directory contents:`, publicFiles);
        } else {
            console.log(`[Instagram] Public directory does not exist at: ${publicDir}`);
        }
        
        if (!fs.existsSync(filePath)) {
            console.log("[Instagram] Calendar data file not found, returning empty array");
            return { body: [] };
        }

        const fileContent = fs.readFileSync(filePath, 'utf-8');
        console.log(`[Instagram] File content length: ${fileContent.length}`);
        console.log(`[Instagram] First 200 chars of file:`, fileContent.substring(0, 200));
        
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
        console.error("[Instagram] Error stack:", error?.stack);
        return { body: [] };
    }
});
