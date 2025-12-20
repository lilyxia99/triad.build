// server/api/webhook.ts
export default defineEventHandler(async (event) => {
  const method = event.node.req.method;
  const query = getQuery(event);

  // --- CONFIGURATION ---
  // This must match EXACTLY what you type in the Instagram "Verify Token" box later
  const MY_VERIFY_TOKEN = 'my_secure_token_123'; 

  // 1. HANDLE VERIFICATION (GET Request)
  // Instagram sends this to check if your server is real.
  if (method === 'GET') {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode && token) {
      if (mode === 'subscribe' && token === MY_VERIFY_TOKEN) {
        // Success! We return the challenge number back to Instagram.
        // We use parseInt/String to ensure it's returned as a plain value, not JSON.
        return String(challenge); 
      } else {
        // Failed: Token didn't match
        throw createError({ statusCode: 403, statusMessage: 'Forbidden' });
      }
    }
  }

  // 2. RECEIVE NOTIFICATIONS (POST Request)
  // Instagram sends this when someone comments, mentions you, etc.
  if (method === 'POST') {
    const body = await readBody(event);
    
    // Log the data to your Vercel logs so you can see it
    console.log('Webhook Event Received:', JSON.stringify(body, null, 2));

    // Return a 200 OK to let Instagram know we got it
    return 'EVENT_RECEIVED';
  }
});