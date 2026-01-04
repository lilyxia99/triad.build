import eventSourcesJSON from '@/assets/event_sources.json';
import { logTimeElapsedSince, serverCacheMaxAgeSeconds, serverStaleWhileInvalidateSeconds, serverFetchHeaders, applyEventTags } from '@/utils/util';
const isDevelopment = process.env.NODE_ENV === 'development';

// export default defineCachedEventHandler(async (event) => {
export default defineCachedEventHandler(async (event) => {
	const startTime = new Date();
	//Adding .env processing
	if (process.env.EVENT_SOURCES_ENV &&typeof process.env.EVENT_SOURCES_ENV === 'string') {
		try {
			const eventSourcesENV = JSON.parse(String(process.env.EVENT_SOURCES_ENV));
			eventSourcesJSON.googleCalendar = [...eventSourcesJSON.googleCalendar, ...eventSourcesENV.googleCalendar];
		} catch (error) {
			console.error('Failed to parse EVENT_SOURCES_ENV:', error);
		}
	} else {
		console.error('EVENT_SOURCES_ENV is not set or is not a valid string.');
	}
	const body = await fetchGoogleCalendarEvents();
	logTimeElapsedSince(startTime.getTime(), 'Google Calendar: events fetched.');
	return {
		body
	}
// }, {
// 	maxAge: serverCacheMaxAgeSeconds,
// 	staleMaxAge: serverStaleWhileInvalidateSeconds,
// 	swr: true,
// });

// Function to replace Google tracking URLs with the actual URL
function replaceGoogleTrackingUrls(description: string): string {
    const googleTrackingUrlRegex = /<a href="https:\/\/www\.google\.com\/url\?q=(https[^&]+)&[^"]+"([^>]*)>/g;
    return description.replace(googleTrackingUrlRegex, (match, p1, p2) => {
        const decodedUrl = decodeURIComponent(p1);
        return `<a href="${decodedUrl}"${p2}>`;
    });
}

function findImageUrls(description: string): string[] {
	if (!description) return [];
	const imageUrlRegex = /(https?:\/\/[^\s"<>]+?\.(jpg|jpeg|png|gif|bmp|svg|webp))/g;
	const matches = description.match(imageUrlRegex);
	const uniqueMatches = matches ? [...new Set(matches)] : [];
	
	// Convert Imgur URLs to direct image format
	const convertedMatches = uniqueMatches.map(url => {
		// Convert imgur.com/xxxxx.ext to i.imgur.com/xxxxx.ext
		if (url.includes('imgur.com/') && !url.includes('i.imgur.com/')) {
			return url.replace('imgur.com/', 'i.imgur.com/');
		}
		// For i.imgur.com URLs, ensure they have the direct format
		if (url.includes('i.imgur.com/')) {
			// Extract the image ID and extension
			const match = url.match(/i\.imgur\.com\/([a-zA-Z0-9]+)\.(jpg|jpeg|png|gif|webp)/);
			if (match) {
				const [, imageId, extension] = match;
				return `https://i.imgur.com/${imageId}.${extension}`;
			}
		}
		return url;
	});
	
	console.log('Original image URLs found:', uniqueMatches);
	console.log('Converted image URLs:', convertedMatches);
	
	return convertedMatches || [];
}

function formatTitleAndDateToID(inputDate: any, title: string) {
	const date = new Date(inputDate);
	const year = date.getFullYear().toString().slice(-2); // Get last 2 digits of year
	const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Get month (0-11) and format to 2 digits
	const day = date.getDate().toString().padStart(2, '0');
	const hours = date.getHours().toString().padStart(2, '0');
	const minutes = date.getMinutes().toString().padStart(2, '0');
  
    // Function to get the first three URL-compatible characters from the title
    function getFirstThreeUrlCompatibleChars(inputTitle: string): string {
        // Define URL-compatible characters (alphanumeric and some special characters)
        const urlCompatibleChars = /^[A-Za-z]+$/;

		// Ensure inputTitle is a string to prevent the "undefined is not iterable" error
		inputTitle = inputTitle || 'und';
        // Filter out non-URL-compatible characters and take the first three
        return Array.from(inputTitle)
            .filter(char => urlCompatibleChars.test(char))
            .slice(0, 3)
            .join('')
            .toLowerCase();
    }

    // Extract the first three URL-compatible characters from the title
    const titlePrefix = getFirstThreeUrlCompatibleChars(title);
  
	return `${year}${month}${day}${hours}${minutes}${titlePrefix}`;
  }

  async function fetchGoogleCalendarEvents() {
	let googleCalendarSources = await useStorage().getItem('googleCalendarSources');
	try {
	  console.log('Environment check - API key exists:', !!process.env.GOOGLE_CALENDAR_API_KEY);
	  console.log('Number of Google Calendar sources to fetch:', eventSourcesJSON.googleCalendar.length);
	  
	  if (!process.env.GOOGLE_CALENDAR_API_KEY) {
		console.error('No Google Calendar API key found. Please set the GOOGLE_CALENDAR_API_KEY environment variable.');
		return [];
	  }
  
	  googleCalendarSources = await Promise.all(
		eventSourcesJSON.googleCalendar.map(async (source) => {
		  const searchParams = new URLSearchParams({
			singleEvents: 'true',
			maxResults: '9999',
			timeMin: new Date(new Date().setMonth(new Date().getMonth() - 2)).toISOString(),
			timeMax: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString(),
		  });
  
		  const res = await fetch(
			`https://www.googleapis.com/calendar/v3/calendars/${source.googleCalendarId}/events?key=${process.env.GOOGLE_CALENDAR_API_KEY}`
			+ `&${searchParams.toString()}`,
			{ headers: serverFetchHeaders }
		  );
		  
		  if (!res.ok) {
			console.error(`Error fetching Google Calendar events for ${source.name}: ${res.status} ${res.statusText}`);
			const errorText = await res.text();
			console.error('Error response body:', errorText);
			return { events: [], city: source.city, name: source.name };
		  }
		  const data = await res.json()
		  console.log(`Successfully fetched ${data.items?.length || 0} events from ${source.name}`);
  
		  const events = data.items.map((item) => {
			let title = item.summary;
			let description = item.description ? replaceGoogleTrackingUrls(item.description.toString()) : '';
			// Append or prepend text if specified in the source
			if (source.prefixTitle) { title = source.prefixTitle + title; }
			if (source.suffixTitle) { title += source.suffixTitle; }
			if (source.suffixDescription) { description += source.suffixDescription; }

			const tags = applyEventTags(source, title, description);
			// if (isDevelopment) title=tags.length+" "+title;

			return {
			  id: formatTitleAndDateToID(item.start.dateTime, title),
			  title: title,
			  org: source.name,
			  start: item.start.dateTime,
			  end: item.end.dateTime,
			  url: item.htmlLink,
			  location: item.location || source.defaultLocation || 'Location not specified',
			  description: description,
			  images: findImageUrls(description),
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
	  await useStorage().setItem('googleCalendarSources', googleCalendarSources);
	} catch (e) {
	  console.error("Error fetching Google Calendar events: ", e);
	  return [];
	}
	console.log('Returning Google Calendar sources:', googleCalendarSources?.length || 0, 'sources');
	return googleCalendarSources || [];
  }
});
