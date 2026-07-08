// Vercel Serverless Function: /api/google-token
// Handles Google OAuth 2.0 authorization code exchange and refresh token flows.
// Env vars needed on Vercel: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

export default async function handler(req, res) {
  // CORS (same-origin so lax; explicit doesn't hurt)
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

  // GET: expose client_id to the frontend (needed to build the auth URL)
  if (req.method === 'GET') {
    if (!CLIENT_ID) return res.status(500).json({ error: 'server_not_configured' });
    return res.status(200).json({ clientId: CLIENT_ID });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).json({ error: 'server_not_configured', hint: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars on Vercel' });
  }

  // Parse body robustly
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const { code, refresh_token, redirect_uri, grant_type } = body;

  let payload;
  if (grant_type === 'refresh_token' && refresh_token) {
    payload = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refresh_token,
      grant_type: 'refresh_token'
    });
  } else if (code && redirect_uri) {
    payload = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: code,
      redirect_uri: redirect_uri,
      grant_type: 'authorization_code'
    });
  } else {
    return res.status(400).json({ error: 'missing_params', hint: 'Provide either {code, redirect_uri} or {refresh_token, grant_type:"refresh_token"}' });
  }

  try {
    const googleResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload.toString()
    });
    const data = await googleResp.json();
    if (!googleResp.ok) {
      return res.status(googleResp.status).json({ error: data.error || 'google_error', details: data });
    }
    // data contains: access_token, expires_in, refresh_token (only on first exchange), scope, token_type
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: 'network_error', message: e.message });
  }
}
