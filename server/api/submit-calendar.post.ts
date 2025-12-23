export default defineEventHandler(async (event) => {
  try {
    // Only allow POST requests
    if (getMethod(event) !== 'POST') {
      throw createError({
        statusCode: 405,
        statusMessage: 'Method Not Allowed'
      })
    }

    // Get the request body
    const body = await readBody(event)
    
    // Validate required fields
    if (!body.name || !body.googleCalendarId || !body.filters || body.filters.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing required fields: name, googleCalendarId, and filters are required'
      })
    }

    // Validate Google Calendar ID format
    if (!body.googleCalendarId.includes('@group.calendar.google.com') && !body.googleCalendarId.includes('@gmail.com')) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid Google Calendar ID format'
      })
    }

    // Check for required environment variables
    const githubToken = process.env.GITHUB_TOKEN
    const githubOwner = process.env.GITHUB_OWNER || 'lilyxia99'
    const githubRepo = process.env.GITHUB_REPO || 'triad.build'
    
    if (!githubToken) {
      console.error('GITHUB_TOKEN environment variable is not set')
      throw createError({
        statusCode: 500,
        statusMessage: 'Server configuration error'
      })
    }

    // Create the submission object in the same format as event_sources.json
    const submission = {
      name: body.name,
      googleCalendarId: body.googleCalendarId,
      filters: body.filters,
      submittedAt: new Date().toISOString()
    }

    // Add optional fields if they exist
    if (body.prefixTitle) submission.prefixTitle = body.prefixTitle
    if (body.suffixTitle) submission.suffixTitle = body.suffixTitle
    if (body.suffixDescription) submission.suffixDescription = body.suffixDescription
    if (body.defaultLocation) submission.defaultLocation = body.defaultLocation

    console.log('Submission data:', JSON.stringify(submission, null, 2))

    // GitHub API configuration
    const filePath = 'assets/incoming_event_source.json'
    const githubApiUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${filePath}`
    
    const headers = {
      'Authorization': `Bearer ${githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'triad.build-calendar-submission'
    }

    let existingData = []
    let fileSha = null

    // Try to get existing file from GitHub
    try {
      console.log('Fetching existing file from GitHub:', githubApiUrl)
      const response = await fetch(githubApiUrl, { headers })
      
      if (response.ok) {
        const fileData = await response.json()
        const content = Buffer.from(fileData.content, 'base64').toString('utf-8')
        existingData = JSON.parse(content)
        fileSha = fileData.sha
        console.log('Successfully read existing submissions file from GitHub, entries:', existingData.length)
      } else if (response.status === 404) {
        console.log('File does not exist on GitHub, will create new file')
        existingData = []
      } else {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
      }
    } catch (error) {
      console.error('Error fetching file from GitHub:', error.message)
      // Continue with empty array if we can't fetch the file
      existingData = []
    }

    // Add the new submission
    existingData.push(submission)
    console.log('Added new submission, total submissions:', existingData.length)

    // Prepare the updated content
    const updatedContent = JSON.stringify(existingData, null, 2)
    const encodedContent = Buffer.from(updatedContent).toString('base64')

    // Commit message
    const commitMessage = `Add calendar submission: ${submission.name}`

    // Prepare the GitHub API request body
    const requestBody = {
      message: commitMessage,
      content: encodedContent,
      ...(fileSha && { sha: fileSha }) // Include SHA if file exists
    }

    // Push to GitHub
    try {
      console.log('Pushing to GitHub repository...')
      const response = await fetch(githubApiUrl, {
        method: 'PUT',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('GitHub API error:', errorData)
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()
      console.log('Successfully pushed to GitHub:', result.commit.html_url)

      // Return success response
      return {
        success: true,
        message: 'Calendar submission received and saved to GitHub successfully',
        commitUrl: result.commit.html_url
      }

    } catch (githubError) {
      console.error('Error pushing to GitHub:', githubError)
      throw createError({
        statusCode: 500,
        statusMessage: `Failed to save submission to GitHub: ${githubError.message}`
      })
    }

  } catch (error) {
    // If it's already a createError, re-throw it
    if (error.statusCode) {
      throw error
    }

    // Log the error for debugging
    console.error('Error processing calendar submission:', error)

    // Return generic error
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error while processing submission'
    })
  }
})
