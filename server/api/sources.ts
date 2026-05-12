// Simple, reliable approach: fetch the JSON file via HTTP
// This works in both dev (Nuxt dev server) and prod (static files on Vercel)

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

  // Fetch from static file - works in both dev and production
  try {
    // In Nuxt 3, we can use $fetch to get the file
    // Try multiple possible paths for the JSON file
    const possiblePaths = [
      '/assets/event_sources.json',
      '/event_sources.json',
      './assets/event_sources.json'
    ]

    let eventSources = null
    let lastError = null

    for (const filePath of possiblePaths) {
      try {
        // Use $fetch which works with Nuxt's internal fetch
        const data = await $fetch(filePath, {
          responseType: 'json',
          baseURL: getRequestURL(event).origin
        })
        eventSources = data
        break
      } catch (e: any) {
        lastError = e
        // Try next path
        continue
      }
    }

    // If $fetch with baseURL didn't work, try relative fetch
    if (!eventSources) {
      try {
        const data = await $fetch('/assets/event_sources.json', {
          responseType: 'json'
        })
        eventSources = data
      } catch (e: any) {
        lastError = e
      }
    }

    if (!eventSources) {
      throw lastError || new Error('Failed to fetch event_sources.json from all paths')
    }

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
