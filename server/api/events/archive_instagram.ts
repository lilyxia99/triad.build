import fs from 'node:fs';
import path from 'node:path';
import eventSourcesJSON from '@/assets/event_sources.json';
import { applyEventTags } from '@/utils/util';

// --- 1. SMART PARSING HELPERS ---

function isLikelyEvent(caption: string): boolean {
    if (!caption) return false;
    // Added a few more keywords for better detection
    const keywords = ['join us', 'link in bio', 'starts at', 'pm', 'am', 'where:', 'when:', 'rsvp', 'save the date', 'tickets', 'tomorrow', 'tonight', 'this weekend', 'workshop', 'celebration', 'parade', 'market'];
    const lower = caption.toLowerCase();
    
    // DEBUG: Check which keyword triggered it
    const foundKeyword = keywords.find(w => lower.includes(w));
    if (foundKeyword) {
        // console.log(`   [Filter] Matched keyword: "${foundKeyword}"`); // Uncomment for very verbose logs
        return true;
    }
    return false;
}

function parseCaptionDate(caption: string, uploadDate: Date): Date {
    if (!caption) return uploadDate;

    // Regex for "Jan 25", "10/12", "September 12"
    const dateRegex = /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s?\d{1,2}(?:st|nd|rd|th)?)|(\d{1,2}\/\d{1,2})/i;
    // Regex for "7pm", "7:00 PM"
    const timeRegex = /(\d{1,2}(?::\d{2})?\s?(?:am|pm))|(\d{1,2}:\d{2})/i;

    const dateMatch = caption.match(dateRegex);
    const timeMatch = caption.match(timeRegex);

    // If no written date found, use the upload timestamp
    if (!dateMatch) {
        console.log(`   [Date] No date text found. Using Upload Date: ${uploadDate.toISOString().split('T')[0]}`);
        return uploadDate;
    }

    const currentYear = new Date().getFullYear();
    let eventDate = new Date(`${dateMatch[0]} ${currentYear}`);
    console.log(`   [Date] Found text "${dateMatch[0]}" -> Parsed: ${eventDate.toDateString()}`);

    // Logic: If we found "Jan 5" but it's currently December, assume it's next year.
    if (eventDate < new Date() && (new Date().getMonth() - eventDate.getMonth() > 6)) {
        eventDate.setFullYear(currentYear + 1);
        console.log(`   [Date] Adjusted year to ${currentYear + 1}`);
    }

    // Add Time
    if (timeMatch) {
        let timeString = timeMatch[0].replace(/\./g, '').toUpperCase();
        const isPM = timeString.includes('PM');
        let [hours, minutes] = timeString.replace(/[^0-9:]/g, '').split(':').map(Number);
        
        if (isPM && hours < 12) hours += 12;
        if (!isPM && hours === 12) hours = 0; 
        if (!minutes) minutes = 0;

        eventDate.setHours(hours, minutes);
        console.log(`   [Time] Found text "${timeMatch[0]}" -> Set to ${hours}:${minutes.toString().padStart(2, '0')}`);
    } else {
        eventDate.setHours(uploadDate.getHours(), uploadDate.getMinutes());
    }

    return eventDate;
}

function extractTitle(caption: string): string {
    if (!caption) return 'Instagram Post';
    let title = caption.split('\n')[0]; // Take first line
    if (title.length > 60) {
        title = title.substring(0, 60) + '...';
    }
    return title;
}

function formatTitleAndDateToID(inputDate: any, title: string) {
    const date = new Date(inputDate);
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const cleanTitle = title.replace(/[^a-zA-Z0-9]/g, '').substring(0, 5).toLowerCase();
    return `ig-${year}${month}${day}-${cleanTitle}`;
}


// --- 2. MAIN HANDLER ---

export default defineEventHandler(async (event) => {
    const allResults = [];

    if (!eventSourcesJSON.instagram) {
        return { body: [] };
    }

    for (const sourceConfig of eventSourcesJSON.instagram) {
        if (!sourceConfig.jsonFile) continue;

        try {
            const assetsPath = path.resolve(process.cwd(), 'assets');
            const filePath = path.join(assetsPath, sourceConfig.jsonFile);

            if (!fs.existsSync(filePath)) {
                console.error(`Instagram Archive not found: ${filePath}`);
                continue;
            }

            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const rawData = JSON.parse(fileContent);
            
            console.log('------------------------------------------------');
            console.log(`[INSTAGRAM] Processing ${sourceConfig.name} (${rawData.length} items found)`);
            console.log('------------------------------------------------');

            const events = [];

            for (const item of rawData) {
                const caption = item.caption || "";
                const shortCode = item.shortCode || item.id;

                // 1. FILTER: Is it an event?
                const isEvent = isLikelyEvent(caption);
                
                if (!isEvent) {
                    // console.log(`[SKIP] Post ${shortCode} - No event keywords found.`);
                    continue;
                }

                console.log(`[MATCH] Post ${shortCode}: "${extractTitle(caption)}"`);

                // 2. PARSE: Get details
                const uploadDate = new Date(item.timestamp);
                const startDateObj = parseCaptionDate(caption, uploadDate);
                const endDateObj = new Date(startDateObj.getTime() + (60 * 60 * 1000));
                
                const title = extractTitle(caption);
                
                const images = [];
                if (item.displayUrl) images.push(item.displayUrl);
                if (item.images && Array.isArray(item.images)) {
                     item.images.forEach((img: any) => {
                         if (typeof img === 'string') images.push(img);
                     });
                }
                if (item.childPosts && Array.isArray(item.childPosts)) {
                     item.childPosts.forEach((child: any) => {
                         if (child.displayUrl) images.push(child.displayUrl);
                     });
                }

                const location = item.locationName || sourceConfig.defaultLocation || "Instagram Live";

                let description = caption;
                if (sourceConfig.suffixDescription) description += sourceConfig.suffixDescription;
                if (item.hashtags && item.hashtags.length) {
                    description += ' ' + item.hashtags.map((t: string) => `#${t}`).join(' ');
                }
                const tags = applyEventTags(sourceConfig, title, description);

                events.push({
                    id: formatTitleAndDateToID(startDateObj, title),
                    title: title,
                    org: item.ownerFullName || sourceConfig.name,
                    start: startDateObj.toISOString(),
                    end: endDateObj.toISOString(),
                    url: item.url,
                    location: location,
                    description: description,
                    images: [...new Set(images)],
                    tags
                });
            }
            
            console.log(`[SUMMARY] Extracted ${events.length} valid events from ${sourceConfig.name}`);

            allResults.push({
                events,
                city: sourceConfig.city,
                name: sourceConfig.name
            });

        } catch (error) {
            console.error(`Error processing Instagram file ${sourceConfig.jsonFile}:`, error);
        }
    }

    return { body: allResults };
});