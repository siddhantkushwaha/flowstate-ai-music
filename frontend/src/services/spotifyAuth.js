const SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state',
  'user-read-currently-playing',
  'user-library-modify',
  'user-library-read',
  'playlist-modify-private',
  'playlist-modify-public',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ');

const TOKEN_KEY = 'flowstate_spotify_access_token';
const EXPIRES_KEY = 'flowstate_spotify_token_expires';
const SCOPE_KEY = 'flowstate_spotify_token_scope';
const REFRESH_KEY = 'flowstate_spotify_refresh_token';
const APP_SESSION_KEY = 'flowstate_app_session';

function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRES_KEY);
  localStorage.removeItem(SCOPE_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function getStoredAppSession() {
  try {
    const raw = localStorage.getItem(APP_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function storeAppSession(sessionToken, user) {
  localStorage.setItem(APP_SESSION_KEY, JSON.stringify({ sessionToken, user }));
}

function clearAppSession() {
  localStorage.removeItem(APP_SESSION_KEY);
}

// Pure JS SHA-256 implementation fallback for mobile HTTP origins
export function sha256PureJs(ascii) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let result = '';
  const words = [];
  const asciiLength = ascii.length * 8;

  let hash = (sha256PureJs.h = sha256PureJs.h || []);
  let k = (sha256PureJs.k = sha256PureJs.k || []);
  let primeCounter = k.length;

  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 300; i += candidate) {
        isComposite[i] = true;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      primeCounter++;
    }
  }

  ascii += '\x80';
  while ((ascii.length % 64) - 56) ascii += '\x00';
  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i);
    if (j >> 8) return;
    words[i >> 2] |= j << ((3 - (i % 4)) * 8);
  }
  words[words.length] = (asciiLength / maxWord) | 0;
  words[words.length] = asciiLength | 0;

  for (let j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash;
    hash = hash.slice(0, 8);

    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

      hash = [(temp1 + temp2) | 0, ...hash.slice(0, 7)];
      hash[4] = (hash[4] + temp1) | 0;
    }

    for (let i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (let i = 0; i < 8; i++) {
    for (let j = 3; j >= 0; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

function generateRandomString(length) {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function base64UrlEncode(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function generatePKCEChallenge() {
  const codeVerifier = generateRandomString(64);
  let codeChallenge = '';

  if (window.crypto && window.crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(codeVerifier);
      const digest = await window.crypto.subtle.digest('SHA-256', data);
      codeChallenge = base64UrlEncode(digest);
    } catch (e) {
      const hexHash = sha256PureJs(codeVerifier);
      const match = hexHash.match(/\w{2}/g);
      if (match) {
        const bytes = new Uint8Array(match.map((h) => parseInt(h, 16)));
        codeChallenge = base64UrlEncode(bytes.buffer);
      }
    }
  } else {
    const hexHash = sha256PureJs(codeVerifier);
    const match = hexHash.match(/\w{2}/g);
    if (match) {
      const bytes = new Uint8Array(match.map((h) => parseInt(h, 16)));
      codeChallenge = base64UrlEncode(bytes.buffer);
    }
  }

  return { codeVerifier, codeChallenge };
}

function hasAllRequiredScopes() {
  const storedScope = localStorage.getItem(SCOPE_KEY) || '';
  const grantedScopes = new Set(storedScope.split(' ').filter(Boolean));
  return SPOTIFY_SCOPES.split(' ').every((s) => grantedScopes.has(s));
}

function persistTokenBundle(data) {
  const expiresAt = Date.now() + data.expires_in * 1000;
  localStorage.setItem(TOKEN_KEY, data.access_token);
  localStorage.setItem(EXPIRES_KEY, expiresAt.toString());
  // Spotify echoes back the scopes actually granted for this token.
  localStorage.setItem(SCOPE_KEY, data.scope || SPOTIFY_SCOPES);
  // Spotify may rotate the refresh token on use - only overwrite if a new one came back.
  if (data.refresh_token) {
    localStorage.setItem(REFRESH_KEY, data.refresh_token);
  }
}

// Exchanges the stored refresh token for a fresh access token. Unlike the
// authorization-code exchange, Spotify's refresh tokens (PKCE flow) have no
// fixed server-side expiry, so this is the path that keeps a user "logged in"
// indefinitely without ever re-showing the Spotify consent screen.
export async function refreshSpotifyToken(clientId) {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return null;

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok) {
      console.warn('[Spotify Auth] Refresh token exchange failed:', await response.text());
      return null;
    }
    const data = await response.json();
    persistTokenBundle(data);
    return data.access_token;
  } catch (e) {
    console.warn('[Spotify Auth] Refresh token exchange error:', e);
    return null;
  }
}

export async function getStoredSpotifyToken(clientId) {
  const token = localStorage.getItem(TOKEN_KEY);
  const expiresAt = localStorage.getItem(EXPIRES_KEY);
  if (!token || !expiresAt) return null;

  if (Date.now() > parseInt(expiresAt, 10)) {
    const refreshed = clientId ? await refreshSpotifyToken(clientId) : null;
    if (!refreshed || !hasAllRequiredScopes()) {
      clearStoredToken();
      return null;
    }
    return refreshed;
  }

  // A token stored before a scope (e.g. playlist-modify-*, user-library-modify)
  // was added to SPOTIFY_SCOPES is still "valid" (not expired) but Spotify will
  // 403 on any endpoint needing the missing scope - notably Like and Save
  // Playlist. Detect that here and force re-auth instead of failing silently.
  if (!hasAllRequiredScopes()) {
    console.warn('[Spotify Auth] Stored token is missing newly required scopes, clearing to force re-auth.');
    clearStoredToken();
    return null;
  }

  return token;
}

export async function redirectToSpotifyOAuth(clientId) {
  if (!clientId) {
    alert('Missing Spotify Client ID. Set VITE_SPOTIFY_CLIENT_ID in frontend/.env');
    return;
  }

  const { codeVerifier, codeChallenge } = await generatePKCEChallenge();
  sessionStorage.setItem('spotify_code_verifier', codeVerifier);

  const redirectUri = window.location.origin + window.location.pathname;

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SPOTIFY_SCOPES,
    show_dialog: 'true',
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(clientId, code) {
  const codeVerifier = sessionStorage.getItem('spotify_code_verifier');
  if (!codeVerifier) {
    throw new Error('Code verifier missing from session storage.');
  }

  const redirectUri = window.location.origin + window.location.pathname;

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error_description || 'Failed to exchange authorization code for token');
  }

  const data = await response.json();
  persistTokenBundle(data);
  sessionStorage.removeItem('spotify_code_verifier');

  // Clean URL parameters
  window.history.replaceState({}, document.title, window.location.pathname);

  return data.access_token;
}

export function logoutSpotify() {
  clearStoredToken();
  clearAppSession();
}
