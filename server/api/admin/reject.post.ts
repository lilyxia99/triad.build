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
    // Fetch pending submissions
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

    // Filter out rejected submissions
    const idsToReject = body.ids || []
    const toReject = submissionsWithIds.filter((sub: any) => idsToReject.includes(sub.id))
    const remaining = submissionsWithIds.filter((sub: any) => !idsToReject.includes(sub.id))

    if (toReject.length === 0) {
      throw new Error('No matching submissions found')
    }

    // Update incoming_event_source.json
    const updatedContent = JSON.stringify(remaining, null, 2)
    const encodedContent = Buffer.from(updatedContent).toString('base64')

    const updateResponse = await fetch(pendingUrl, {
      method: 'PUT',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Reject calendar submissions: ${toReject.map((s: any) => s.name).join(', ')}`,
        content: encodedContent,
        sha: pendingData.sha
      })
    })

    if (!updateResponse.ok) {
      throw new Error('Failed to update pending submissions')
    }

    return {
      success: true,
      rejected: toReject.length,
      names: toReject.map((s: any) => s.name)
    }

  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to reject submissions: ${error.message}`
    })
  }
})
