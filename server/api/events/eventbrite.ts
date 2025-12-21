import eventSourcesJSON from '@/assets/event_sources.json';
import { logTimeElapsedSince, serverFetchHeaders, applyEventTags } from '@/utils/util';

// --- Helper Functions ---

function findImageUrls(description: string): string[] {
    if (!description) return [];
    const imageUrlRegex = /(https?:\/\/[^\s"<>]+?\.(jpg|jpeg|png|gif|bmp|svg|webp))/g;
    const matches = description.match(imageUrlRegex);
    const uniqueMatches = matches ? [...new Set(matches)] : [];
    return uniqueMatches || [];
}

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

// --- Main Handler ---

export default defineEventHandler(async (event) => {
    const startTime = new Date();

    // Check for the variable you already have in .env
    if (!process.env.EVENTBRITE_API_KEY) {
        console.error('EVENTBRITE_API_KEY is not set in .env');
        return { body: [] };
    }

    const body = await fetchEventbriteEvents();
    logTimeElapsedSince(startTime.getTime(), 'Eventbrite: events fetched.');
    
    return {
        body
    }
});

async function fetchEventbriteEvents() {
    let eventbriteSources = await useStorage().getItem('eventbriteSources');
    
    if (!eventSourcesJSON.eventbrite || eventSourcesJSON.eventbrite.length === 0) {
        console.log('No Eventbrite sources configured in event_sources.json');
        return [];
    }

    try {
        console.log('Number of Eventbrite sources to fetch:', eventSourcesJSON.eventbrite.length);

        eventbriteSources = await Promise.all(
            eventSourcesJSON.eventbrite.map(async (source) => {
                // We use '?expand=venue' to get the full address in one request
                // We filter by status=live to avoid drafts or past events
                const url = `https://www.eventbriteapi.com/v3/organizers/${source.organizerId}/events/?status=live&expand=venue&order_by=start_asc`;
                // --- SPY LOG START ---
                const token = process.env.EVENTBRITE_API_KEY || "MISSING";
                // --- SPY LOG END ---
                
                const res = await fetch(url, { 
                    headers: {
                        // Eventbrite expects 'Bearer <token>'
                        'Authorization': `Bearer ${process.env.EVENTBRITE_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!res.ok) {
                    console.error(`Error fetching Eventbrite for ${source.name}: ${res.status} ${res.statusText}`);
                    // Optional: Log the error body to debug specific API issues
                    const errText = await res.text();
                    console.error('Eventbrite Error Body:', errText);
                    return { events: [], city: source.city, name: source.name };
                }

                const data = await res.json();
                const rawEvents = data.events || [];

                console.log(`Successfully fetched ${rawEvents.length || 0} events from ${source.name}`);

                const events = rawEvents.map((item: any) => {
                    // Eventbrite uses nested objects for text: name.text, description.text
                    let title = item.name?.text || 'Untitled Event';
                    let description = item.description?.text || ''; 
                    
                    // --- Config Logic ---
                    if (source.prefixTitle) { title = source.prefixTitle + title; }
                    if (source.suffixTitle) { title += source.suffixTitle; }
                    if (source.suffixDescription) { description += source.suffixDescription; }

                    const tags = applyEventTags(source, title, description);
                    
                    // --- Image Logic ---
                    const extractedImages = findImageUrls(description);
                    // Eventbrite usually provides a 'logo' object
                    if (item.logo?.original?.url) {
                        extractedImages.unshift(item.logo.original.url);
                    }

                    // --- Date Handling ---
                    // Eventbrite returns ISO strings (e.g., "2025-12-01T19:00:00Z")
                    const startDateObj = new Date(item.start.utc);
                    const endDateObj = new Date(item.end.utc);

                    // --- Location Logic ---
                    let locationString = source.defaultLocation || 'Location not specified';
                    if (item.venue) {
                        const v = item.venue;
                        // Construct a readable address string
                        const addressParts = [
                            v.name, 
                            v.address?.address_1, 
                            v.address?.city
                        ].filter(Boolean); // Remove empty values

                        if (addressParts.length > 0) {
                            locationString = addressParts.join(', ');
                        }
                    }

                    return {
                        id: formatTitleAndDateToID(startDateObj, title),
                        title: title,
                        org: source.name,
                        start: startDateObj.toISOString(),
                        end: endDateObj.toISOString(),
                        url: item.url,
                        location: locationString,
                        description: description,
                        images: [...new Set(extractedImages)],
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
        await useStorage().setItem('eventbriteSources', eventbriteSources);

    } catch (e) {
        console.error("Error fetching Eventbrite events: ", e);
        return [];
    }

    return eventbriteSources || [];
}