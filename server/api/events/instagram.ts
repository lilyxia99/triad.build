import { defineEventHandler, setHeader } from 'h3';

// --- CONFIGURATION ---
const GITHUB_DATA_URL = 'https://raw.githubusercontent.com/lilyxia99/triad.build/main/assets/calendar_data.json';

export default defineEventHandler(async (event) => {
    console.log("[Instagram] Loading events from GitHub Raw Data (Fresh Fetch)");
    
    try {
        // 1. FORCE FRESH DATA FROM GITHUB
        // We add ?t=... to the URL. This tricks GitHub/Vercel into thinking it's a 
        // completely new file, bypassing any "raw.githubusercontent" caching.
        const timestamp = Date.now();
        const freshUrl = `${GITHUB_DATA_URL}?t=${timestamp}`;

        const response = await fetch(freshUrl);
        
        if (!response.ok) {
            console.error(`[Instagram] Failed to fetch data: ${response.status}`);
            return { body: [] };
        }

        const calendarData = await response.json();

        if (calendarData && Array.isArray(calendarData)) {
            const sourcesWithEvents = calendarData.filter(source => 
                source.events && Array.isArray(source.events) && source.events.length > 0
            );
            
            // 2. DISABLE BROWSER/VERCEL CACHING
            // "no-store" means: Never save this response, always run the function again.
            setHeader(event, 'Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            setHeader(event, 'Pragma', 'no-cache');
            setHeader(event, 'Expires', '0');
            
            return { body: sourcesWithEvents };
        } else {
            return { body: [] };
        }
    } catch (error) {
        console.error("[Instagram] Failed:", error);
        return { body: [] };
    }
});