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
    'User-Agent': 'triad.build-admin'
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
      sources: eventSources.googleCalendar || []
    }
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch approved sources: ${error.message}`
    })
  }
})
