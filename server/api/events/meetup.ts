import eventSourcesJSON from '@/assets/event_sources.json';
import { logTimeElapsedSince, serverFetchHeaders, applyEventTags } from '@/utils/util';

// --- Helper Functions ---

function findImageUrls(description: string): string[] {
    if (!description) return [];
    const imageUrlRegex = /(https?:\/\/[^\s"<>]+?\.(jpg|jpeg|png|gif|bmp|svg|webp))/g;
    const matches = description.match(imageUrlRegex);
    const uniqueMatches = matches ? [...new Set(matches)] : [];
    
    // Imgur Fixes
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

// Reuse your standard ID generator
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

export default defineEventHandler(async (event) => {
    const startTime = new Date();
    const body = await fetchMeetupEvents();
    logTimeElapsedSince(startTime.getTime(), 'Meetup: events fetched.');
    
    return {
        body
    }
});

async function fetchMeetupEvents() {
    let meetupSources = await useStorage().getItem('meetupSources');
    
    if (!eventSourcesJSON.meetup || eventSourcesJSON.meetup.length === 0) {
        console.log('No Meetup sources configured.');
        return [];
    }

    try {
        console.log('Number of Meetup sources to fetch:', eventSourcesJSON.meetup.length);

        meetupSources = await Promise.all(
            eventSourcesJSON.meetup.map(async (source) => {
                // Meetup Public Events Endpoint
                // Note: If this public endpoint is rate-limited, you may need to add an API key here later.
                const url = `https://api.meetup.com/${source.groupUrlName}/events?status=upcoming&desc=true&photo-host=public&page=20`;

                const res = await fetch(url, { headers: serverFetchHeaders });

                if (!res.ok) {
                    console.error(`Error fetching Meetup events for ${source.name}: ${res.status} ${res.statusText}`);
                    return { events: [], city: source.city, name: source.name };
                }

                // Meetup sometimes returns an array directly, sometimes an object.
                // The public endpoint usually returns an array.
                const data = await res.json();
                const rawEvents = Array.isArray(data) ? data : (data.results || []);

                console.log(`Successfully fetched ${rawEvents.length || 0} events from ${source.name}`);

                const events = rawEvents.map((item: any) => {
                    let title = item.name || 'Untitled Meetup';
                    let description = item.description || '';
                    
                    // Apply Config Logic
                    if (source.prefixTitle) { title = source.prefixTitle + title; }
                    if (source.suffixTitle) { title += source.suffixTitle; }
                    if (source.suffixDescription) { description += source.suffixDescription; }

                    const tags = applyEventTags(source, title, description);
                    
                    // Extract Images
                    const extractedImages = findImageUrls(description);
                    if (item.featured_photo?.photo_link) extractedImages.unshift(item.featured_photo.photo_link);

                    // --- DATE HANDLING ---
                    // Meetup provides 'time' in UTC milliseconds.
                    const startDateObj = new Date(item.time);
                    
                    // Meetup provides 'duration' in milliseconds.
                    // If missing, default to 2 hours (7200000 ms).
                    const duration = item.duration || 7200000;
                    const endDateObj = new Date(item.time + duration);

                    // Location formatting
                    let locationString = source.defaultLocation || 'Online/Unknown';
                    if (item.venue) {
                        locationString = `${item.venue.name}, ${item.venue.address_1}, ${item.venue.city}`;
                    } else if (item.is_online_event) {
                        locationString = "Online Event";
                    }

                    return {
                        id: formatTitleAndDateToID(startDateObj, title),
                        title: title,
                        org: source.name,
                        // Return ISO strings for App.vue
                        start: startDateObj.toISOString(),
                        end: endDateObj.toISOString(),
                        url: item.link,
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

        await useStorage().setItem('meetupSources', meetupSources);

    } catch (e) {
        console.error("Error fetching Meetup events: ", e);
        return [];
    }

    return meetupSources || [];
}