export default defineEventHandler(async (event) => {
  // Helper: parse eventSources JSON and return unified source list
  const buildSourceList = (eventSources: any) => {
    const allSources: any[] = []

    // Google Calendar sources
    if (eventSources.googleCalendar) {
      eventSources.googleCalendar.forEach((source: any) => {
        allSources.push({
          type: 'googleCalendar',
          name: source.name,
          googleCalendarId: source.googleCalendarId,
          instagramHandle: source.instagramHandle,
          websiteUrl: source.websiteUrl,
          contactEmail: source.contactEmail,
          description: source.description,
          defaultLocation: source.defaultLocation,
          filters: source.filters
        })
      })
    }

    // Instagram sources
    if (eventSources.instagram) {
      eventSources.instagram.forEach((source: any) => {
        allSources.push({
          type: 'instagram',
          name: source.name,
          instagramHandle: source.username ? `@${source.username}` : source.instagramHandle,
          websiteUrl: source.websiteUrl,
          contactEmail: source.contactEmail,
          description: source.description,
          defaultLocation: source.defaultLocation,
          filters: source.filters
        })
      })
    }

    // Eventbrite sources
    if (eventSources.eventbrite) {
      eventSources.eventbrite.forEach((source: any) => {
        allSources.push({
          type: 'eventbrite',
          name: source.name,
          organizerId: source.organizerId,
          instagramHandle: source.instagramHandle,
          websiteUrl: source.websiteUrl,
          contactEmail: source.contactEmail,
          description: source.description,
          defaultLocation: source.defaultLocation,
          filters: source.filters
        })
      })
    }

    // Apify sources
    if (eventSources.apify) {
      eventSources.apify.forEach((source: any) => {
        allSources.push({
          type: 'apify',
          name: source.name,
          instagramHandle: source.instagramHandle,
          websiteUrl: source.websiteUrl,
          contactEmail: source.contactEmail,
          description: source.description,
          defaultLocation: source.defaultLocation,
          filters: source.filters
        })
      })
    }

    // Apify Meetup sources
    if (eventSources.apifyMeetup) {
      eventSources.apifyMeetup.forEach((source: any) => {
        allSources.push({
          type: 'apifyMeetup',
          name: source.name,
          instagramHandle: source.instagramHandle,
          websiteUrl: source.websiteUrl,
          contactEmail: source.contactEmail,
          description: source.description,
          defaultLocation: source.defaultLocation,
          filters: source.filters
        })
      })
    }

    return allSources
  }

  // Fetch the static JSON file via HTTP - works in both dev and production
  // In dev: http://localhost:3000/event_sources.json
  // In prod: https://www.triad.build/event_sources.json
  try {
    const origin = getRequestURL(event).origin
    const fileUrl = `${origin}/event_sources.json`
    
    const eventSources = await $fetch(fileUrl, {
      responseType: 'json'
    })

    return {
      sources: buildSourceList(eventSources)
    }
  } catch (error: any) {
    console.error('Error in /api/sources:', error.message)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to load sources: ${error.message}`
    })
  }
})
