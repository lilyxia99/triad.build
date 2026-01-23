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

  const filePath = 'assets/incoming_event_source.json'
  const githubApiUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${filePath}`

  const headers = {
    'Authorization': `Bearer ${githubToken}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'triad.build-admin'
  }

  try {
    const response = await fetch(githubApiUrl, { headers })

    if (response.ok) {
      const fileData = await response.json()
      const content = Buffer.from(fileData.content, 'base64').toString('utf-8')
      const submissions = JSON.parse(content)

      // Add unique IDs based on submission index if not present
      const submissionsWithIds = submissions.map((sub: any, index: number) => ({
        id: sub.id || `${sub.googleCalendarId}-${index}`,
        ...sub
      }))

      return {
        submissions: submissionsWithIds,
        fileSha: fileData.sha
      }
    } else if (response.status === 404) {
      return { submissions: [], fileSha: null }
    } else {
      throw new Error(`GitHub API error: ${response.status}`)
    }
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch pending submissions: ${error.message}`
    })
  }
})
