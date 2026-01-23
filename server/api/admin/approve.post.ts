export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  // Verify admin password
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminPassword || body.password !== adminPassword) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }

  const githubToken = process.env.GITHUB_TOKEN
  const githubOwner = process.env.GITHUB_OWNER || 'lilyxia99'
  const githubRepo = process.env.GITHUB_REPO || 'triad.build'

  if (!githubToken) {
    throw createError({
      statusCode: 500,
      statusMessage: 'GitHub token not configured'
    })
  }

  const headers = {
    'Authorization': `Bearer ${githubToken}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'triad.build-admin'
  }

  try {
    // 1. Fetch pending submissions
    const pendingPath = 'assets/incoming_event_source.json'
    const pendingUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${pendingPath}`
    const pendingResponse = await fetch(pendingUrl, { headers })

    if (!pendingResponse.ok) {
      throw new Error('Failed to fetch pending submissions')
    }

    const pendingData = await pendingResponse.json()
    const pendingContent = Buffer.from(pendingData.content, 'base64').toString('utf-8')
    const allSubmissions = JSON.parse(pendingContent)

    // Add IDs to submissions if they don't have them
    const submissionsWithIds = allSubmissions.map((sub: any, index: number) => ({
      id: sub.id || `${sub.googleCalendarId}-${index}`,
      ...sub
    }))

    // 2. Find submissions to approve
    const idsToApprove = body.ids || []
    const toApprove = submissionsWithIds.filter((sub: any) => idsToApprove.includes(sub.id))
    const remaining = submissionsWithIds.filter((sub: any) => !idsToApprove.includes(sub.id))

    if (toApprove.length === 0) {
      throw new Error('No matching submissions found')
    }

    // 3. Fetch event_sources.json
    const sourcesPath = 'assets/event_sources.json'
    const sourcesUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${sourcesPath}`
    const sourcesResponse = await fetch(sourcesUrl, { headers })

    if (!sourcesResponse.ok) {
      throw new Error('Failed to fetch event sources')
    }

    const sourcesData = await sourcesResponse.json()
    const sourcesContent = Buffer.from(sourcesData.content, 'base64').toString('utf-8')
    const eventSources = JSON.parse(sourcesContent)

    // 4. Add approved submissions to event_sources.json (remove metadata fields)
    toApprove.forEach((submission: any) => {
      const cleanSubmission: any = {
        name: submission.name,
        googleCalendarId: submission.googleCalendarId,
        filters: submission.filters
      }

      // Add optional calendar config fields
      if (submission.prefixTitle) cleanSubmission.prefixTitle = submission.prefixTitle
      if (submission.suffixTitle) cleanSubmission.suffixTitle = submission.suffixTitle
      if (submission.suffixDescription) cleanSubmission.suffixDescription = submission.suffixDescription
      if (submission.defaultLocation) cleanSubmission.defaultLocation = submission.defaultLocation

      // Add optional display metadata
      if (submission.instagramHandle) cleanSubmission.instagramHandle = submission.instagramHandle
      if (submission.websiteUrl) cleanSubmission.websiteUrl = submission.websiteUrl
      if (submission.contactEmail) cleanSubmission.contactEmail = submission.contactEmail
      if (submission.description) cleanSubmission.description = submission.description

      eventSources.googleCalendar.push(cleanSubmission)
    })

    // 5. Update event_sources.json
    const updatedSourcesContent = JSON.stringify(eventSources, null, 4)
    const encodedSourcesContent = Buffer.from(updatedSourcesContent).toString('base64')

    const sourcesUpdateResponse = await fetch(sourcesUrl, {
      method: 'PUT',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Approve calendar submissions: ${toApprove.map((s: any) => s.name).join(', ')}\n\nCo-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`,
        content: encodedSourcesContent,
        sha: sourcesData.sha
      })
    })

    if (!sourcesUpdateResponse.ok) {
      throw new Error('Failed to update event_sources.json')
    }

    // 6. Update incoming_event_source.json (remove approved submissions)
    const updatedPendingContent = JSON.stringify(remaining, null, 2)
    const encodedPendingContent = Buffer.from(updatedPendingContent).toString('base64')

    const pendingUpdateResponse = await fetch(pendingUrl, {
      method: 'PUT',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Remove approved submissions from pending: ${toApprove.map((s: any) => s.name).join(', ')}`,
        content: encodedPendingContent,
        sha: pendingData.sha
      })
    })

    if (!pendingUpdateResponse.ok) {
      throw new Error('Failed to update pending submissions')
    }

    return {
      success: true,
      approved: toApprove.length,
      names: toApprove.map((s: any) => s.name)
    }

  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to approve submissions: ${error.message}`
    })
  }
})
