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

export default defineEventHandler(async (event) => {
    const startTime = new Date();

    if (!process.env.APIFY_API_TOKEN) {
        console.error('APIFY_API_TOKEN is not set.');
        return { body: [] };
    }

    const body = await fetchApifyMeetupEvents();
    logTimeElapsedSince(startTime.getTime(), 'Apify Meetup: events fetched.');
    
    return {
        body
    }
});

async function fetchApifyMeetupEvents() {
    let apifyMeetupSources = await useStorage().getItem('apifyMeetupSources');
    
    // Check if configuration exists
    if (!eventSourcesJSON.apifyMeetup || eventSourcesJSON.apifyMeetup.length === 0) {
        console.log('No Apify Meetup sources configured in event_sources.json');
        return [];
    }

    try {
        console.log('Number of Apify Meetup sources to fetch:', eventSourcesJSON.apifyMeetup.length);

        apifyMeetupSources = await Promise.all(
            eventSourcesJSON.apifyMeetup.map(async (source) => {
                // Fetch clean items from Apify
                const url = `https://api.apify.com/v2/datasets/${source.datasetId}/items?token=${process.env.APIFY_API_TOKEN}&clean=true`;

                const res = await fetch(url, { headers: serverFetchHeaders });

                if (!res.ok) {
                    console.error(`Error fetching Apify Meetup dataset for ${source.name}: ${res.status} ${res.statusText}`);
                    return { events: [], city: source.city, name: source.name };
                }

                const data = await res.json();
                console.log(`Successfully fetched ${data.length || 0} events from ${source.name}`);

                const events = data.map((item: any) => {
                    let title = item.title || 'Untitled Event';
                    let description = item.description || '';
                    
                    // Config Logic (Prefix/Suffix)
                    if (source.prefixTitle) { title = source.prefixTitle + title; }
                    if (source.suffixTitle) { title += source.suffixTitle; }
                    
                    // 1. Append internal suffix config
                    if (source.suffixDescription) { description += source.suffixDescription; }

                    // 2. Append raw Meetup tags to description so our tagger can see them
                    // e.g. "Description... #Pickleball #Social"
                    if (item.tags && Array.isArray(item.tags)) {
                        description += ' ' + item.tags.map(t => `#${t.replace(/\s+/g, '')}`).join(' ');
                    }

                    const tags = applyEventTags(source, title, description);

                    // Image Logic
                    const extractedImages = findImageUrls(description);
                    // Prioritize the main event image from JSON
                    if (item.image) extractedImages.unshift(item.image);
                    // Fallback to group image if no event image
                    if (item.group?.image) extractedImages.push(item.group.image);

                    // Date Logic
                    // Apify Meetup provides "dateTime": "2025-12-26T14:30:00-05:00" -> Perfect ISO!
                    const startDateObj = new Date(item.dateTime);
                    
                    // Meetup scraper often doesn't provide end time/duration.
                    // Default to 2 hours (2 * 60 * 60 * 1000 ms)
                    const endDateObj = new Date(startDateObj.getTime() + (2 * 60 * 60 * 1000));

                    // Location Logic
                    let locationString = source.defaultLocation || 'Location not specified';
                    if (item.location) {
                        const venue = item.location.venue || '';
                        const address = item.location.address || '';
                        // Combine venue and address if both exist
                        locationString = [venue, address].filter(Boolean).join(', ');
                    }

                    return {
                        id: formatTitleAndDateToID(startDateObj, title),
                        title: title,
                        org: item.group?.name || source.name, // Prefer specific group name from JSON
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

        await useStorage().setItem('apifyMeetupSources', apifyMeetupSources);

    } catch (e) {
        console.error("Error fetching Apify Meetup events: ", e);
        return [];
    }

    return apifyMeetupSources || [];
}