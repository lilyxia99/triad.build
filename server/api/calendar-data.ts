export default defineEventHandler(async (event) => {
    try {
        // Import the calendar data directly from the public folder
        // This will be bundled with the serverless function
        const calendarData = await import('@/public/calendar_data.json');
        
        return calendarData.default || calendarData;
    } catch (error) {
        console.error("[Calendar Data] Failed to load calendar data:", error);
        return [];
    }
});
