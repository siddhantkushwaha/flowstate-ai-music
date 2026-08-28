import { getStoredAppSession, storeAppSession } from './spotifyAuth';

const getApiBase = () => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return `${import.meta.env.VITE_API_BASE_URL}/api`;
  }
  // In production, or when loaded over HTTPS, request API relatively from the same origin to avoid Mixed Content errors.
  if (import.meta.env.PROD || (typeof window !== 'undefined' && window.location.protocol === 'https:')) {
    return '/api';
  }
  const host = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
  return `http://${host}:5050/api`;
};

const API_BASE = getApiBase();

function authHeader() {
  const session = getStoredAppSession();
  return session?.sessionToken ? { Authorization: `Bearer ${session.sessionToken}` } : {};
}

// Shared fetch-with-same-origin-fallback for the newer, auth-scoped endpoints
// (history, profile, session). Existing calls above keep their own inline
// try/catch to avoid touching working code, but new endpoints share this.
async function apiRequest(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...authHeader(), ...(options.headers || {}) };
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (netErr) {
    response = await fetch(`/api${path}`, { ...options, headers });
  }
  return response;
}

export async function establishAppSession(accessToken) {
  try {
    const response = await apiRequest('/auth/session', {
      method: 'POST',
      body: JSON.stringify({ access_token: accessToken }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    storeAppSession(data.session_token, data.user);
    return data.user;
  } catch (e) {
    console.warn('[API] Failed to establish app session:', e);
    return null;
  }
}

export async function fetchUserProfile() {
  try {
    const response = await apiRequest('/profile', { method: 'GET' });
    if (!response.ok) return '';
    const data = await response.json();
    return data.profile || '';
  } catch (e) {
    console.warn('[API] Failed to fetch user profile:', e);
    return '';
  }
}

export async function fetchHistory() {
  try {
    const response = await apiRequest('/history', { method: 'GET' });
    if (!response.ok) return [];
    const data = await response.json();
    return data.history || [];
  } catch (e) {
    console.warn('[API] Failed to fetch history:', e);
    return [];
  }
}

// Upserts by (user, prompt) on the backend - safe to call on every queue
// modification (steer, Infinite Flow addition, track removal), not just the
// initial save. Always sends the session's full current state.
export async function saveHistoryEntry({ prompt, curatorSummary, tracks, steerHistory = [] }) {
  try {
    const response = await apiRequest('/history', {
      method: 'POST',
      body: JSON.stringify({ prompt, curator_summary: curatorSummary, tracks, steer_history: steerHistory }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.id || null;
  } catch (e) {
    console.warn('[API] Failed to save history entry:', e);
    return null;
  }
}

export async function deleteHistoryEntry(id) {
  try {
    const response = await apiRequest(`/history/${id}`, { method: 'DELETE' });
    return response.ok;
  } catch (e) {
    console.warn('[API] Failed to delete history entry:', e);
    return false;
  }
}

export async function fetchClientConfig() {
  try {
    const res = await fetch(`${API_BASE}/config`);
    if (res.ok) return await res.json();
  } catch (e) {
    try {
      const fallbackRes = await fetch('/api/config');
      if (fallbackRes.ok) return await fallbackRes.json();
    } catch {}
  }
  return {};
}

export async function curateVibe(prompt, userProfile = '') {
  let response;
  try {
    response = await fetch(`${API_BASE}/curate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, user_profile: userProfile }),
    });
  } catch (netErr) {
    response = await fetch(`/api/curate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, user_profile: userProfile }),
    });
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to curate vibe');
  }

  return response.json();
}

export async function steerQueue(currentTrack, feedback, recentSkips = [], userProfile = '') {
  let response;
  try {
    response = await fetch(`${API_BASE}/steer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        current_track: currentTrack,
        feedback,
        recent_skips: recentSkips,
        user_profile: userProfile,
      }),
    });
  } catch (netErr) {
    response = await fetch(`/api/steer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        current_track: currentTrack,
        feedback,
        recent_skips: recentSkips,
        user_profile: userProfile,
      }),
    });
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to steer queue');
  }

  return response.json();
}

export async function updateUserProfile(currentProfile, likedTrack) {
  const response = await apiRequest('/profile', {
    method: 'POST',
    body: JSON.stringify({ current_profile: currentProfile, liked_track: likedTrack }),
  });

  if (!response.ok) return currentProfile;
  const data = await response.json();
  return data.updated_profile || currentProfile;
}

export async function fetchSteerSuggestions(prompt = '', currentTrack = '', queueTracks = [], userProfile = '') {
  let response;
  const payload = {
    prompt,
    current_track: currentTrack,
    queue_tracks: queueTracks,
    user_profile: userProfile,
  };
  try {
    response = await fetch(`${API_BASE}/suggestions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (netErr) {
    response = await fetch(`/api/suggestions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  if (!response.ok) {
    return [
      "Increase Energy & BPM",
      "Soften & Go Acoustic",
      "Shift Era / Nostalgic",
      "More Heavy Bass & Beats",
    ];
  }
  const data = await response.json();
  return data.suggestions || [];
}

export async function checkBackendHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return await res.json();
  } catch (err) {
    try {
      const resFallback = await fetch(`/api/health`);
      return await resFallback.json();
    } catch (err2) {
      return { status: 'offline', error: err.message };
    }
  }
}

export async function fetchInfiniteFlowTracks({
  initialPrompt = '',
  steerHistory = [],
  playedTracks = [],
  currentTrack = '',
  userProfile = '',
}) {
  const payload = {
    initial_prompt: initialPrompt,
    steer_history: steerHistory,
    played_tracks: playedTracks,
    current_track: currentTrack,
    user_profile: userProfile,
  };

  let response;
  try {
    response = await fetch(`${API_BASE}/infinite-flow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (netErr) {
    response = await fetch(`/api/infinite-flow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to extend infinite flow');
  }

  return response.json();
}

