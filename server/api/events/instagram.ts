import { defineEventHandler, setHeader } from 'h3';

// --- CONFIGURATION ---
const CACHE_MAX_AGE = 60 * 60 * 2; // 2 Hours (Adjust as needed)
// This points to the raw version of the file your GitHub Action generates
const GITHUB_DATA_URL = 'https://raw.githubusercontent.com/lilyxia99/triad.build/main/assets/calendar_data.json';

export default defineEventHandler(async (event) => {
    console.log("[Instagram] Loading events from GitHub Raw Data");
    
    try {
        // Fetch the JSON directly from your repository
        const response = await fetch(GITHUB_DATA_URL);
        
        // Handle cases where the file hasn't been generated yet or is missing
        if (!response.ok) {
            console.error(`[Instagram] Failed to fetch data: ${response.status} ${response.statusText}`);
            return { body: [] };
        }

        const calendarData = await response.json();

        if (calendarData && Array.isArray(calendarData)) {
            console.log(`[Instagram] Loaded ${calendarData.length} Instagram event sources`);
            
            // Filter out sources with no events
            const sourcesWithEvents = calendarData.filter(source => 
                source.events && Array.isArray(source.events) && source.events.length > 0
            );
            
            console.log(`[Instagram] Found ${sourcesWithEvents.length} sources with events`);
            
            // Set Cache Headers: This tells Vercel/Browsers to cache this response
            // so we don't spam GitHub with requests on every page load.
            setHeader(event, 'Cache-Control', `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_MAX_AGE}`);
            
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