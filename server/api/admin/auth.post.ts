export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const adminPassword = process.env.ADMIN_PASSWORD

  if (!adminPassword) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Admin password not configured'
    })
  }

  if (body.password !== adminPassword) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid password'
    })
  }

  return {
    success: true
  }
})
