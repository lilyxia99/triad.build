import fs from 'node:fs';
import path from 'node:path';

export default defineEventHandler(async (event) => {
    try {
        // Read the calendar data from public folder (accessible at runtime on Vercel)
        const filePath = path.resolve(process.cwd(), 'public', 'calendar_data.json');
        
        if (!fs.existsSync(filePath)) {
            console.log("[Calendar Data] Calendar data file not found");
            return [];
        }

        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const calendarData = JSON.parse(fileContent);
        
        console.log(`[Calendar Data] Successfully loaded ${Array.isArray(calendarData) ? calendarData.length : 0} sources`);
        return calendarData;
    } catch (error) {
        console.error("[Calendar Data] Failed to load calendar data:", error);
        return [];
    }
});
