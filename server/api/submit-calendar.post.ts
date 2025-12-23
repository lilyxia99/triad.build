import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'

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

    // Path to the incoming submissions file
    const filePath = join(process.cwd(), 'incoming_event_source.json')
    console.log('Attempting to write to file path:', filePath)
    
    let existingData = []
    
    // Try to read existing file
    try {
      const fileContent = await readFile(filePath, 'utf-8')
      existingData = JSON.parse(fileContent)
      console.log('Successfully read existing submissions file')
    } catch (error) {
      // File doesn't exist or is invalid, start with empty array
      console.log('Creating new submissions file:', error.message)
      existingData = []
    }

    // Add the new submission
    existingData.push(submission)
    console.log('Added new submission, total submissions:', existingData.length)

    // Ensure directory exists and write file
    try {
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, JSON.stringify(existingData, null, 2), 'utf-8')
      console.log('Successfully wrote submissions to file:', filePath)
    } catch (writeError) {
      console.error('Error writing file:', writeError)
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to save submission to file system'
      })
    }

    // Return success response
    return {
      success: true,
      message: 'Calendar submission received successfully'
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
