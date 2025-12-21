import fs from 'node:fs';
import path from 'node:path';
import eventSourcesJSON from '@/assets/event_sources.json';
import { logTimeElapsedSince, applyEventTags } from '@/utils/util';

// --- 1. SHARED HELPERS (Matched to Google Calendar) ---

function formatTitleAndDateToID(inputDate: any, title: string) {
    const date = new Date(inputDate);
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
  
    function getFirstThreeUrlCompatibleChars(inputTitle: string): string {
        const urlCompatibleChars = /^[A-Za-z]+$/;
        inputTitle = inputTitle || 'und';
        return Array.from(inputTitle)
            .filter(char => urlCompatibleChars.test(char))
            .slice(0, 3)
            .join('')
            .toLowerCase();
    }

    const titlePrefix = getFirstThreeUrlCompatibleChars(title);
    return `${year}${month}${day}${hours}${minutes}${titlePrefix}`;
}

// --- 2. INSTAGRAM SPECIFIC HELPERS ---

function isLikelyEvent(caption: string): boolean {
    if (!caption) return false;
    const keywords = ['join us', 'link in bio', 'starts at', 'pm', 'am', 'where:', 'when:', 'rsvp', 'save the date', 'tickets', 'tomorrow', 'tonight', 'this weekend', 'workshop', 'celebration', 'parade', 'market'];
    const lower = caption.toLowerCase();
    return keywords.some(w => lower.includes(w));
}

function parseCaptionDate(caption: string, uploadDate: Date): Date {
    if (!caption) return uploadDate;

    // Regex for "Jan 25", "10/12", "September 12th"
    const dateRegex = /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s?\d{1,2}(?:st|nd|rd|th)?)|(\d{1,2}\/\d{1,2})/i;
    // Regex for "7pm", "7:00 PM"
    const timeRegex = /(\d{1,2}(?::\d{2})?\s?(?:am|pm))|(\d{1,2}:\d{2})/i;

    const dateMatch = caption.match(dateRegex);
    const timeMatch = caption.match(timeRegex);

    if (!dateMatch) {
        // Fallback to upload date if no text date found
        return uploadDate;
    }

    // Clean ordinal suffixes (7th -> 7) to prevent Invalid Date crash
    let dateStr = dateMatch[0].replace(/(\d+)(st|nd|rd|th)/i, '$1');
    
    const currentYear = new Date().getFullYear();
    let eventDate = new Date(`${dateStr} ${currentYear}`);

    // Safety check for invalid parsing
    if (isNaN(eventDate.getTime())) return uploadDate;

    // Logic: If "Jan 5" found but currently Dec, assume next year
    if (eventDate < new Date() && (new Date().getMonth() - eventDate.getMonth() > 6)) {
        eventDate.setFullYear(currentYear + 1);
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
    } else {
        // Default to upload time if no specific time mentioned
        eventDate.setHours(uploadDate.getHours(), uploadDate.getMinutes());
    }

    return eventDate;
}

function extractTitle(caption: string): string {
    if (!caption) return 'Instagram Post';
    let title = caption.split('\n')[0]; // Take first line
    if (title.length > 80) {
        const sentenceEnd = title.indexOf('.');
        if (sentenceEnd > 10 && sentenceEnd < 80) {
            title = title.substring(0, sentenceEnd);
        } else {
            title = title.substring(0, 80) + '...';
        }
    }
    return title;
}

// --- 3. MAIN HANDLER ---

export default defineEventHandler(async (event) => {
    const startTime = new Date();

    const body = await fetchInstagramEvents();
    logTimeElapsedSince(startTime.getTime(), 'Instagram Archive: events fetched.');
    
    return {
        body
    }
});

async function fetchInstagramEvents() {
    let archiveInstagramSources = await useStorage().getItem('archivearchiveInstagramSources');
    
    if (!eventSourcesJSON.instagram || eventSourcesJSON.instagram.length === 0) {
        return [];
    }

    try {
        console.log('Number of Instagram Archive sources to process:', eventSourcesJSON.instagram.length);

        // We map just like Google Calendar, but reading local files instead of fetching URLs
        archiveInstagramSources = await Promise.all(
            eventSourcesJSON.instagram.map(async (source) => {
                if (!source.jsonFile) return { events: [], city: source.city, name: source.name };

                // 1. Read File
                const assetsPath = path.resolve(process.cwd(), 'assets');
                const filePath = path.join(assetsPath, source.jsonFile);

                if (!fs.existsSync(filePath)) {
                    console.error(`Instagram Archive file not found: ${filePath}`);
                    return { events: [], city: source.city, name: source.name };
                }

                const fileContent = fs.readFileSync(filePath, 'utf-8');
                const rawData = JSON.parse(fileContent);
                console.log(`Processing ${rawData.length} items from ${source.name}`);

                // 2. Map Events
                const events = rawData
                    .filter((item: any) => {
                        // Filter logic: Must contain keywords
                        return isLikelyEvent(item.caption);
                    })
                    .map((item: any) => {
                        const caption = item.caption || "";
                        const uploadDate = new Date(item.timestamp);

                        // Calculate Start Date
                        const startDateObj = parseCaptionDate(caption, uploadDate);
                        const endDateObj = new Date(startDateObj.getTime() + (60 * 60 * 1000)); // Default 1 hour duration

                        // Generate Title
                        let title = extractTitle(caption);

                        // Config Logic (Prefix/Suffix)
                        if (source.prefixTitle) { title = source.prefixTitle + title; }
                        if (source.suffixTitle) { title += source.suffixTitle; }
                        
                        // Description Construction
                        let description = caption;
                        if (source.suffixDescription) { description += source.suffixDescription; }
                        if (item.hashtags && item.hashtags.length) {
                            description += ' ' + item.hashtags.map((t: string) => `#${t}`).join(' ');
                        }

                        // Image Logic
                        const images = [];
                        if (item.displayUrl) images.push(item.displayUrl);
                        // Apify specific structure for carousels
                        if (item.images && Array.isArray(item.images)) {
                            item.images.forEach((img: any) => typeof img === 'string' ? images.push(img) : null);
                        }
                        if (item.childPosts && Array.isArray(item.childPosts)) {
                            item.childPosts.forEach((child: any) => child.displayUrl ? images.push(child.displayUrl) : null);
                        }

                        // Tags
                        const tags = applyEventTags(source, title, description);

                        return {
                            id: formatTitleAndDateToID(startDateObj, title),
                            title: title,
                            org: item.ownerFullName || source.name,
                            start: startDateObj.toISOString(),
                            end: endDateObj.toISOString(),
                            url: item.url,
                            location: item.locationName || source.defaultLocation || 'Location not specified',
                            description: description,
                            images: [...new Set(images)],
                            tags,
                        };
                    });

                console.log(`Successfully extracted ${events.length} events from ${source.name}`);

                return {
                    events,
                    city: source.city,
                    name: source.name,
                };
            })
        );

        await useStorage().setItem('archiveInstagramSources', archiveInstagramSources);

    } catch (e) {
        console.error("Error processing Instagram events: ", e);
        return [];
    }

    console.log('Returning Instagram sources:', archiveInstagramSources?.length || 0, 'sources');
    return archiveInstagramSources || [];
}