import eventSourcesJSON from '@/assets/calendar_data.json';
import { logTimeElapsedSince, serverFetchHeaders, applyEventTags } from '@/utils/util';

// Helper: Extract images from description
function findImageUrls(description: string): string[] {
    if (!description) return [];
    const imageUrlRegex = /(https?:\/\/[^\s"<>]+?\.(jpg|jpeg|png|gif|bmp|svg|webp))/g;
    const matches = description.match(imageUrlRegex);
    const uniqueMatches = matches ? [...new Set(matches)] : [];
    
    // Convert Imgur URLs to direct image format
    const convertedMatches = uniqueMatches.map(url => {
        if (url.includes('imgur.com/') && !url.includes('i.imgur.com/')) {
            return url.replace('imgur.com/', 'i.imgur.com/');
        }
        if (url.includes('i.imgur.com/')) {
            const match = url.match(/i\.imgur\.com\/([a-zA-Z0-9]+)\.(jpg|jpeg|png|gif|webp)/);
            if (match) {
                const [, imageId, extension] = match;
                return `https://i.imgur.com/${imageId}.${extension}`;
            }
        }
        return url;
    });
    return convertedMatches || [];
}

// Helper: Generate ID
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

// Helper: Parse Duration String (e.g., "4 hr", "30 min")
function parseDurationToMilliseconds(durationStr: string): number {
    if (!durationStr) return 0;
    
    // Default to 0
    let totalMs = 0;
    
    // Regex for hours and minutes
    const hoursMatch = durationStr.match(/(\d+)\s*(hr|hour|h)/i);
    const minsMatch = durationStr.match(/(\d+)\s*(min|m)/i);
    
    if (hoursMatch) {
        totalMs += parseInt(hoursMatch[1]) * 60 * 60 * 1000;
    }
    
    if (minsMatch) {
        totalMs += parseInt(minsMatch[1]) * 60 * 1000;
    }
    
    return totalMs;
}

export default defineEventHandler(async (event) => {
    const startTime = new Date();
    
    // Check for Apify Token
    if (!process.env.APIFY_API_TOKEN) {
        console.error('APIFY_API_TOKEN is not set.');
        return { body: [] };
    }

    const body = await fetchApifyEvents();
    logTimeElapsedSince(startTime.getTime(), 'Apify: events fetched.');
    
    return {
        body
    }
});

async function fetchApifyEvents() {
    let apifySources = await useStorage().getItem('apifySources');
    
    // If we don't have sources defined in JSON, return empty
    if (!eventSourcesJSON.apify || eventSourcesJSON.apify.length === 0) {
        console.log('No Apify sources configured in event_sources.json');
        return [];
    }

    try {
        console.log('Number of Apify sources to fetch:', eventSourcesJSON.apify.length);

        apifySources = await Promise.all(
            eventSourcesJSON.apify.map(async (source) => {
                // Fetch the items from the Apify Dataset
                const url = `https://api.apify.com/v2/datasets/${source.datasetId}/items?token=${process.env.APIFY_API_TOKEN}&clean=true`;

                const res = await fetch(url, { headers: serverFetchHeaders });

                if (!res.ok) {
                    console.error(`Error fetching Apify dataset for ${source.name}: ${res.status} ${res.statusText}`);
                    return { events: [], city: source.city, name: source.name };
                }

                const data = await res.json();
                console.log(`Successfully fetched ${data.length || 0} events from ${source.name}`);

                // Transform the Apify data to your App's format
                const events = data.map((item: any) => {
                    let title = item.name || item.title || 'Untitled Event';
                    let description = item.description || '';
                    
                    // Handle prefix/suffix logic from config
                    if (source.prefixTitle) { title = source.prefixTitle + title; }
                    if (source.suffixTitle) { title += source.suffixTitle; }
                    if (source.suffixDescription) { description += source.suffixDescription; }

                    const tags = applyEventTags(source, title, description);

                    // Extract Images
                    const extractedImages = findImageUrls(description);
                    if (item.coverUrl) extractedImages.unshift(item.coverUrl); 
                    if (item.imageUrl) extractedImages.unshift(item.imageUrl);

                    // --- DATE HANDLING FIX ---
                    // 1. Prioritize ISO strings (utcStartDate) over human strings (start)
                    // If utcStartDate exists, use it. Otherwise fall back to start.
                    const startDateRaw = item.utcStartDate || item.startTime || item.start;
                    const startDateObj = new Date(startDateRaw);

                    // 2. Calculate End Date
                    // App.vue relies on 'end' existing for .getTime() calculations.
                    let endDateObj;
                    const providedEndRaw = item.utcEndDate || item.endTime || item.end;

                    if (providedEndRaw) {
                        endDateObj = new Date(providedEndRaw);
                    } else if (item.duration) {
                        // Calculate end based on start + duration
                        const durationMs = parseDurationToMilliseconds(item.duration);
                        // If parsing failed (0), default to 1 hour
                        const addedTime = durationMs > 0 ? durationMs : (60 * 60 * 1000); 
                        endDateObj = new Date(startDateObj.getTime() + addedTime);
                    } else {
                        // Default Fallback: 1 hour duration
                        endDateObj = new Date(startDateObj.getTime() + 60 * 60 * 1000);
                    }

                    return {
                        id: formatTitleAndDateToID(startDateObj, title),
                        title: title,
                        org: source.name,
                        
                        // Return ISO strings so `new Date()` in App.vue works reliably
                        start: startDateObj.toISOString(),
                        end: endDateObj.toISOString(),
                        
                        url: item.eventUrl || item.url,
                        location: item.location?.name || item.location || source.defaultLocation || 'Location not specified',
                        description: description,
                        images: [...new Set(extractedImages)], // Remove duplicates
                        tags,
                    };
                });

                return {
                    events,
                    city: source.city,
                    name: source.name,
                };
            })
        );

        // Cache the result
        await useStorage().setItem('apifySources', apifySources);

    } catch (e) {
        console.error("Error fetching Apify events: ", e);
        return [];
    }

    console.log('Returning Apify sources:', apifySources?.length || 0, 'sources');
    return apifySources || [];
}