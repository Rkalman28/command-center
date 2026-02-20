import { sql } from '@vercel/postgres';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = `${process.env.NEXTAUTH_URL}/api/auth/callback`;

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
];

// Ensure tokens table exists
export async function ensureAuthTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS google_tokens (
      id TEXT PRIMARY KEY DEFAULT 'default',
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      token_type TEXT,
      expiry_date BIGINT,
      email TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

// Build the Google OAuth URL
export function getAuthUrl() {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// Exchange auth code for tokens
export async function exchangeCodeForTokens(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  return res.json();
}

// Refresh an expired access token
export async function refreshAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }

  return res.json();
}

// Save tokens to database - keyed by email for multi-account support
export async function saveTokens(tokens, email) {
  await ensureAuthTable();
  const expiryDate = Date.now() + (tokens.expires_in || 3600) * 1000;
  const id = email || 'default';

  await sql`
    INSERT INTO google_tokens (id, access_token, refresh_token, token_type, expiry_date, email, updated_at)
    VALUES (${id}, ${tokens.access_token}, ${tokens.refresh_token || null}, ${tokens.token_type || 'Bearer'}, ${expiryDate}, ${email || null}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      access_token = ${tokens.access_token},
      refresh_token = COALESCE(${tokens.refresh_token || null}, google_tokens.refresh_token),
      token_type = ${tokens.token_type || 'Bearer'},
      expiry_date = ${expiryDate},
      email = COALESCE(${email || null}, google_tokens.email),
      updated_at = NOW()
  `;
}

// Get a valid access token for a specific account (auto-refresh if expired)
export async function getValidAccessToken(accountId) {
  await ensureAuthTable();

  const { rows } = await sql`SELECT * FROM google_tokens WHERE id = ${accountId}`;
  if (rows.length === 0) return null;

  const token = rows[0];

  if (token.expiry_date && Date.now() > Number(token.expiry_date) - 300000) {
    if (!token.refresh_token) return null;

    try {
      const newTokens = await refreshAccessToken(token.refresh_token);
      await saveTokens(newTokens, token.email);
      return newTokens.access_token;
    } catch (err) {
      console.error('Failed to refresh token:', err);
      return null;
    }
  }

  return token.access_token;
}

// Get ALL valid access tokens (for multi-account calendar fetching)
export async function getAllValidAccessTokens() {
  await ensureAuthTable();

  const { rows } = await sql`SELECT * FROM google_tokens ORDER BY created_at`;
  const tokens = [];

  for (const token of rows) {
    let accessToken = token.access_token;

    if (token.expiry_date && Date.now() > Number(token.expiry_date) - 300000) {
      if (!token.refresh_token) continue;

      try {
        const newTokens = await refreshAccessToken(token.refresh_token);
        await saveTokens(newTokens, token.email);
        accessToken = newTokens.access_token;
      } catch (err) {
        console.error(`Failed to refresh token for ${token.email}:`, err);
        continue;
      }
    }

    tokens.push({ email: token.email, accessToken });
  }

  return tokens;
}

// Get all connected accounts
export async function getAllSessions() {
  await ensureAuthTable();
  const { rows } = await sql`SELECT id, email, updated_at FROM google_tokens ORDER BY created_at`;
  return rows.map(r => ({ id: r.id, email: r.email, connectedAt: r.updated_at }));
}

// Delete tokens for a specific account
export async function deleteTokens(accountId) {
  await ensureAuthTable();
  if (accountId) {
    await sql`DELETE FROM google_tokens WHERE id = ${accountId}`;
  } else {
    await sql`DELETE FROM google_tokens`;
  }
}

// Get user email from Google
export async function getUserEmail(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.email;
}
