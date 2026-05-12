import fs from 'fs'
import path from 'path'

export default defineEventHandler(async (event) => {
  const githubToken = process.env.GITHUB_TOKEN
  const githubOwner = process.env.GITHUB_OWNER || 'lilyxia99'
  const githubRepo = process.env.GITHUB_REPO || 'triad.build'

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

  // --- Try to read from local file (works in both dev and production) ---
  // Priority 1: Read from server/ directory (always included in Nuxt 3 builds)
  const serverDirPath = path.join(__dirname, '..', 'event_sources.json')
  
  try {
    if (fs.existsSync(serverDirPath)) {
      const raw = fs.readFileSync(serverDirPath, 'utf-8')
      const eventSources = JSON.parse(raw)
      return { sources: buildSourceList(eventSources) }
    }
  } catch (error: any) {
    console.log(`Failed to read from server directory:`, error.message)
  }

  // Priority 2: Try other possible paths (for dev environment or edge cases)
  const possiblePaths = [
    // Dev environment
    path.join(process.cwd(), 'assets', 'event_sources.json'),
    // Alternative paths
    path.join(process.cwd(), 'server', 'event_sources.json'),
    path.join(__dirname, '..', '..', 'assets', 'event_sources.json'),
  ]

  // Try each path
  for (const filePath of possiblePaths) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8')
        const eventSources = JSON.parse(raw)
        return { sources: buildSourceList(eventSources) }
      }
    } catch (error: any) {
      console.log(`Failed to read from ${filePath}:`, error.message)
    }
  }

  // --- Fallback: Try to fetch from GitHub API (if token is available) ---
  if (githubToken) {
    const filePath = 'assets/event_sources.json'
    const githubApiUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${filePath}`

    const headers: Record<string, string> = {
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

      return {
        sources: buildSourceList(eventSources)
      }
    } catch (error: any) {
      console.error('GitHub API fallback failed:', error.message)
      // Don't throw here, we'll throw a comprehensive error below
    }
  }

  // --- If nothing works ---
  throw createError({
    statusCode: 500,
    statusMessage: 'Failed to read event_sources.json: file not found in local paths and GitHub API fallback failed or not configured'
  })
})
