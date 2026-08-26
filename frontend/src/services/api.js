const getApiBase = () => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return `${import.meta.env.VITE_API_BASE_URL}/api`;
  }
  const host = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
  return `http://${host}:5050/api`;
};

const API_BASE = getApiBase();

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
  let response;
  try {
    response = await fetch(`${API_BASE}/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_profile: currentProfile, liked_track: likedTrack }),
    });
  } catch (netErr) {
    response = await fetch(`/api/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_profile: currentProfile, liked_track: likedTrack }),
    });
  }

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

