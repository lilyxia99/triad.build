export default defineEventHandler(async (event) => {
  const githubToken = process.env.GITHUB_TOKEN
  const githubOwner = process.env.GITHUB_OWNER || 'lilyxia99'
  const githubRepo = process.env.GITHUB_REPO || 'triad.build'

  if (!githubToken) {
    throw createError({
      statusCode: 500,
      statusMessage: 'GitHub token not configured'
    })
  }

  const filePath = 'assets/event_sources.json'
  const githubApiUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${filePath}`

  const headers = {
    'Authorization': `Bearer ${githubToken}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'triad.build-sources'
  }

  try {
    const response = await fetch(githubApiUrl, { headers })

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`)
    }

    const fileData = await response.json()
    const content = Buffer.from(fileData.content, 'base64').toString('utf-8')
    const eventSources = JSON.parse(content)

    const allSources = []

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

    // Other source types can be added here as needed
    // apify, apifyMeetup, squarespace, elfsight, libcal

    return {
      sources: allSources
    }
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch sources: ${error.message}`
    })
  }
})
