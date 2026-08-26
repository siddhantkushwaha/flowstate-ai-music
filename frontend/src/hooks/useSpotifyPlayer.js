import { useState, useEffect, useCallback, useRef } from 'react';
import { getStoredSpotifyToken, redirectToSpotifyOAuth, exchangeCodeForToken, logoutSpotify } from '../services/spotifyAuth';

const SPOTIFY_CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID || '';

export function useSpotifyPlayer() {
  const [token, setToken] = useState(getStoredSpotifyToken());
  const [player, setPlayer] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState([]);          // full ordered list of tracks
  const [currentIndex, setCurrentIndex] = useState(0); // index into queue
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [userProductTier, setUserProductTier] = useState(null);
  const [isInfiniteFlow, setIsInfiniteFlowState] = useState(() => {
    return localStorage.getItem('flowstate_infinite_flow') === 'true';
  });

  const setIsInfiniteFlow = useCallback((val) => {
    const nextVal = typeof val === 'function' ? val(isInfiniteFlowRef.current) : val;
    setIsInfiniteFlowState(nextVal);
    localStorage.setItem('flowstate_infinite_flow', String(nextVal));
  }, []);

  // Derived: current track is queue[currentIndex]
  const currentTrack = queue[currentIndex] ?? null;

  // Keep a ref for use inside closures that can't capture fresh state
  const queueRef = useRef(queue);
  const currentIndexRef = useRef(currentIndex);
  const isInfiniteFlowRef = useRef(isInfiniteFlow);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { isInfiniteFlowRef.current = isInfiniteFlow; }, [isInfiniteFlow]);


  // Exchange OAuth code from URL on page load
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code && SPOTIFY_CLIENT_ID) {
      exchangeCodeForToken(SPOTIFY_CLIENT_ID, code)
        .then((newToken) => setToken(newToken))
        .catch((err) => console.error('Spotify OAuth Code exchange error:', err));
    }
  }, []);

  // Inspect Spotify User Profile Tier (Premium vs Free)
  useEffect(() => {
    if (!token) return;
    fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        console.log(`[Spotify Auth] User: ${data.display_name} | Tier: ${data.product}`);
        setUserProductTier(data.product);
      })
      .catch((err) => console.error('[Spotify Auth] Profile query error:', err));
  }, [token]);

  // Initialize Spotify Web Playback SDK
  useEffect(() => {
    if (!token) return;

    const initPlayer = () => {
      if (!window.Spotify) return;

      const spotifyPlayer = new window.Spotify.Player({
        name: 'Flowstate Web Player',
        getOAuthToken: (cb) => cb(token),
        volume: 1.0,
      });

      spotifyPlayer.addListener('initialization_error', ({ message }) => console.error('[Spotify SDK] Init Error:', message));
      spotifyPlayer.addListener('authentication_error', ({ message }) => console.error('[Spotify SDK] Auth Error:', message));
      spotifyPlayer.addListener('account_error', ({ message }) => {
        console.error('[Spotify SDK] Account Error:', message);
        alert('Spotify Account Error: Spotify Web Playback SDK requires an active Spotify Premium subscription.');
      });
      spotifyPlayer.addListener('playback_error', ({ message }) => console.error('[Spotify SDK] Playback Error:', message));

      spotifyPlayer.addListener('ready', async ({ device_id }) => {
        console.log('[Spotify SDK] Player Ready. Device ID:', device_id);
        setDeviceId(device_id);
        try {
          await spotifyPlayer.setVolume(1.0);
          await fetch('https://api.spotify.com/v1/me/player', {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_ids: [device_id], play: false }),
          });
        } catch (e) {
          console.warn('[Spotify SDK] Device transfer warning on init:', e);
        }
      });

      spotifyPlayer.addListener('player_state_changed', (state) => {
        if (!state) return;
        setIsPlaying(!state.paused);
        setPositionMs(state.position || 0);
        setDurationMs(state.duration || 0);

        // Sync currentIndex if Spotify SDK advanced to another track in our queue
        const sdkTrack = state.track_window?.current_track;
        if (sdkTrack) {
          const currentQ = queueRef.current;
          const currentIdx = currentIndexRef.current;
          const matchIdx = currentQ.findIndex(
            (t) => (t.id && t.id === sdkTrack.id) || (t.uri && t.uri === sdkTrack.uri)
          );
          if (matchIdx !== -1 && matchIdx !== currentIdx) {
            setCurrentIndex(matchIdx);
          }
        }
      });

      spotifyPlayer.connect();
      setPlayer(spotifyPlayer);
    };

    if (window.Spotify) {
      initPlayer();
    } else {
      window.onSpotifyWebPlaybackSDKReady = initPlayer;
    }

    return () => { if (player) player.disconnect(); };
  }, [token]);

  // Activate element on user gesture (browser security)
  const activatePlayerElement = useCallback(() => {
    if (player && typeof player.activateElement === 'function') {
      try { player.activateElement(); } catch (e) { console.warn('[Spotify SDK] activateElement warning:', e); }
    }
  }, [player]);

  // Smooth position timer
  useEffect(() => {
    let interval = null;
    if (isPlaying) {
      interval = setInterval(() => {
        setPositionMs((prev) => (prev < durationMs ? prev + 1000 : prev));
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isPlaying, durationMs]);

  const login = useCallback(() => { redirectToSpotifyOAuth(SPOTIFY_CLIENT_ID); }, []);

  const logout = useCallback(() => {
    logoutSpotify();
    setToken(null); setPlayer(null); setDeviceId(null);
    setIsPlaying(false); setQueue([]); setCurrentIndex(0);
    setPositionMs(0); setDurationMs(0);
  }, []);

  // Resolve live Spotify device ID (avoids stale ID)
  const getLiveValidDeviceId = async (preferredDevId, accessToken) => {
    try {
      const res = await fetch('https://api.spotify.com/v1/me/player/devices', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        const devices = data.devices || [];
        console.log('[Spotify SDK] Live Devices:', devices.map(d => `${d.name}(${d.id})`));
        const match =
          devices.find((d) => d.id === preferredDevId) ||
          devices.find((d) => d.name === 'Flowstate Web Player') ||
          devices[0];
        if (match) { setDeviceId(match.id); return match.id; }
      }
    } catch (e) { console.warn('[Spotify SDK] Error querying live devices:', e); }
    return preferredDevId;
  };

  const playUrisOnSpotify = async (uris, devId, accessToken) => {
    const targetDevId = await getLiveValidDeviceId(devId, accessToken);
    if (!targetDevId) { console.error('[Spotify SDK] No active deviceId resolved.'); return false; }
    try {
      activatePlayerElement();
      console.log(`[Spotify SDK] Transferring to deviceId: ${targetDevId}`);
      await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_ids: [targetDevId], play: true }),
      });
      console.log('[Spotify SDK] Playing URIs:', uris);
      const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${targetDevId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uris }),
      });
      console.log(`[Spotify SDK] Play response: ${res.status}`);
      if (!res.ok && res.status !== 204) {
        const errText = await res.text();
        console.error(`[Spotify SDK] Play error (${res.status}):`, errText);
        if (res.status === 403) alert('Spotify requires Premium to stream.');
        else if (res.status === 401) alert('Session expired. Please reconnect Spotify.');
        else if (res.status === 404) alert('Spotify device not found. Try refreshing the page.');
        else alert(`Spotify error (${res.status}): ${errText}`);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[Spotify SDK] Exception playing URIs:', err);
      return false;
    }
  };

  // Search Spotify catalog for seed queries, build track objects
  const resolveTracksFromQueries = async (catalogQueries) => {
    const spotifyUris = [];
    const trackItems = [];
    for (const item of catalogQueries) {
      try {
        const res = await fetch(
          `https://api.spotify.com/v1/search?q=${encodeURIComponent(item.query_term)}&type=track&limit=1`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          const found = data.tracks?.items?.[0];
          if (found) {
            spotifyUris.push(found.uri);
            trackItems.push({
              uid: `track-${found.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              id: found.id,
              name: found.name,
              artistName: found.artists.map((a) => a.name).join(', '),
              albumName: found.album.name,
              artwork: { url: found.album.images[0]?.url },
              reasoning: item.reasoning,
              vibeTags: item.vibe_tags,
              uri: found.uri,
              durationMs: found.duration_ms,
            });
          }
        }
      } catch (err) { console.warn('[Spotify SDK] Catalog search error:', err); }
    }
    return { spotifyUris, trackItems };
  };

  // Start fresh queue from a set of catalog queries
  const searchAndPlaySeeds = useCallback(async (catalogQueries) => {
    if (!token) { alert('Please connect Spotify to stream music.'); return; }
    console.log('[Spotify SDK] Searching catalog for seed tracks:', catalogQueries);
    const { spotifyUris, trackItems } = await resolveTracksFromQueries(catalogQueries);
    if (trackItems.length === 0) { alert('No matching Spotify tracks found.'); return; }
    setQueue(trackItems);
    setCurrentIndex(0);
    setPositionMs(0);
    if (spotifyUris.length > 0) {
      const success = await playUrisOnSpotify(spotifyUris, deviceId, token);
      if (success) setIsPlaying(true);
    }
  }, [token, deviceId]);

  // Append steered tracks to existing queue (keeps current playing)
  const appendSteeredSeeds = useCallback(async (catalogQueries) => {
    if (!token) { alert('Please connect Spotify to stream music.'); return; }
    console.log('[Spotify SDK] Appending steered tracks to queue:', catalogQueries);
    const { trackItems } = await resolveTracksFromQueries(catalogQueries);
    if (trackItems.length === 0) return;
    setQueue((prev) => [...prev, ...trackItems]);
  }, [token]);

  const play = useCallback(async () => {
    activatePlayerElement();
    if (player) { try { await player.resume(); setIsPlaying(true); } catch (e) { console.error('[Spotify SDK] Resume error:', e); } }
  }, [player, activatePlayerElement]);

  const pause = useCallback(async () => {
    if (player) { try { await player.pause(); setIsPlaying(false); } catch (e) { console.error('[Spotify SDK] Pause error:', e); } }
  }, [player]);

  const skipNext = useCallback(async () => {
    activatePlayerElement();
    const currentQ = queueRef.current;
    const idx = currentIndexRef.current;
    if (idx >= currentQ.length - 1) {
      if (!isInfiniteFlowRef.current && currentQ.length > 0) {
        // Replay / loop from top when reaching the end
        console.log('[Spotify SDK] Reached end of queue with Infinite Flow OFF. Looping from top.');
        setCurrentIndex(0);
        setPositionMs(0);
        const uris = currentQ.map((t) => t.uri).filter(Boolean);
        if (token && uris.length > 0) {
          const success = await playUrisOnSpotify(uris, deviceId, token);
          if (success) setIsPlaying(true);
        }
        return;
      }
      setIsPlaying(false);
      return;
    }
    const nextIdx = idx + 1;
    setCurrentIndex(nextIdx);
    setPositionMs(0);
    // Play from nextIdx onward
    const uris = currentQ.slice(nextIdx).map((t) => t.uri).filter(Boolean);
    if (token && uris.length > 0) {
      const success = await playUrisOnSpotify(uris, deviceId, token);
      if (success) setIsPlaying(true);
    }
  }, [token, deviceId, activatePlayerElement]);


  const skipPrevious = useCallback(async () => {
    activatePlayerElement();
    const currentQ = queueRef.current;
    const idx = currentIndexRef.current;
    // If past 3 seconds, restart current track; else go back
    if (positionMs > 3000) {
      if (player) { try { await player.seek(0); setPositionMs(0); return; } catch (e) {} }
    }
    const prevIdx = Math.max(0, idx - 1);
    setCurrentIndex(prevIdx);
    setPositionMs(0);
    const uris = currentQ.slice(prevIdx).map((t) => t.uri).filter(Boolean);
    if (token && uris.length > 0) {
      const success = await playUrisOnSpotify(uris, deviceId, token);
      if (success) setIsPlaying(true);
    }
  }, [token, deviceId, player, positionMs, activatePlayerElement]);

  const selectQueueTrack = useCallback(async (index) => {
    const currentQ = queueRef.current;
    if (index < 0 || index >= currentQ.length) return;
    activatePlayerElement();
    setCurrentIndex(index);
    setPositionMs(0);
    const uris = currentQ.slice(index).map((t) => t.uri).filter(Boolean);
    if (token && uris.length > 0) {
      console.log(`[Spotify SDK] Playing queue track #${index + 1}: ${currentQ[index].name}`);
      const success = await playUrisOnSpotify(uris, deviceId, token);
      if (success) setIsPlaying(true);
    }
  }, [token, deviceId, activatePlayerElement]);

  const removeFromQueue = useCallback((index) => {
    const currentQ = queueRef.current;
    const idx = currentIndexRef.current;
    if (index < 0 || index >= currentQ.length) return;
    const newQueue = currentQ.filter((_, i) => i !== index);
    // Adjust currentIndex: if removing before current, shift back
    let newIdx = idx;
    if (index < idx) newIdx = idx - 1;
    else if (index === idx) newIdx = Math.min(idx, newQueue.length - 1);
    setQueue(newQueue);
    setCurrentIndex(Math.max(0, newIdx));
  }, []);

  const seek = useCallback(async (positionTargetMs) => {
    if (player) { try { await player.seek(positionTargetMs); setPositionMs(positionTargetMs); } catch (e) { console.error('[Spotify SDK] Seek error:', e); } }
  }, [player]);

  // Save to Spotify liked songs
  const likeTrack = useCallback(async (track) => {
    if (!token || !track?.id) return false;
    try {
      const res = await fetch(`https://api.spotify.com/v1/me/tracks?ids=${track.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error(`[Spotify SDK] Like track error (${res.status}):`, errText);
        return false;
      }
      return true;
    } catch (e) {
      console.error('[Spotify SDK] Like track exception:', e);
      return false;
    }
  }, [token]);

  // Save or overwrite a Spotify playlist with the current queue
  const saveAsPlaylist = useCallback(async (playlistName) => {
    if (!token) return { ok: false, error: 'Please connect Spotify first.' };

    const currentQ = queueRef.current;
    // Extract strictly valid Spotify URIs (spotify:track:<22-char-id>)
    const validUris = currentQ
      .map((t) => {
        if (t.uri && t.uri.startsWith('spotify:track:')) return t.uri;
        if (t.id && /^[0-9A-Za-z]{22}$/.test(t.id)) return `spotify:track:${t.id}`;
        return null;
      })
      .filter(Boolean);

    if (validUris.length === 0) {
      return { ok: false, error: 'No valid Spotify tracks in queue to save.' };
    }

    try {
      console.log(`[Spotify SDK] Saving playlist "${playlistName}" with ${validUris.length} tracks:`, validUris);

      // 1. Get current user profile
      const meRes = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!meRes.ok) {
        const errText = await meRes.text();
        console.error(`[Spotify SDK] /me failed (${meRes.status}):`, errText);
        if (meRes.status === 401) {
          return { ok: false, error: 'Session expired. Please click "Connect Spotify" to re-authenticate.' };
        }
        return { ok: false, error: 'Failed to access Spotify profile.' };
      }
      const me = await meRes.json();
      const userId = me.id;

      // 2. Check existing user playlists to see if one with the same name exists
      let existingId = null;
      try {
        let offset = 0;
        while (offset < 200) {
          const plRes = await fetch(`https://api.spotify.com/v1/me/playlists?limit=50&offset=${offset}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!plRes.ok) break;
          const plData = await plRes.json();
          const items = plData.items || [];
          const found = items.find((p) => p && p.name && p.name.trim().toLowerCase() === playlistName.trim().toLowerCase());
          if (found) {
            existingId = found.id;
            console.log(`[Spotify SDK] Found existing playlist with name "${playlistName}": ${existingId}`);
            break;
          }
          if (!plData.next || items.length === 0) break;
          offset += 50;
        }
      } catch (e) {
        console.warn('[Spotify SDK] Could not search existing playlists:', e);
      }

      // Helper to add or replace tracks in playlist
      const setPlaylistTracks = async (playlistId, isNew = false) => {
        const payload = { uris: validUris.slice(0, 100) };
        const method = isNew ? 'POST' : 'PUT';

        console.log(`[Spotify SDK] ${method} tracks to playlist ${playlistId}:`, payload);
        let res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error(`[Spotify SDK] ${method} /playlists/${playlistId}/tracks failed (${res.status}):`, errText);

          // If JSON body failed, attempt query parameter fallback
          const queryUris = encodeURIComponent(validUris.slice(0, 100).join(','));
          const fallbackRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?uris=${queryUris}`, {
            method,
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (!fallbackRes.ok) {
            const fallbackErr = await fallbackRes.text();
            console.error(`[Spotify SDK] Fallback query ${method} tracks failed (${fallbackRes.status}):`, fallbackErr);
            return { ok: false, status: res.status, error: errText };
          }
        }
        return { ok: true };
      };

      // 3. Overwrite existing or create new playlist
      if (existingId) {
        console.log(`[Spotify SDK] Overwriting tracks in existing playlist: ${existingId}`);
        const updateResult = await setPlaylistTracks(existingId, false);
        if (!updateResult.ok) {
          if (updateResult.status === 403) {
            return {
              ok: false,
              error: 'Playlist write permission missing. Please click "Connect Spotify" to refresh permissions.',
            };
          }
          return { ok: false, error: `Failed to update playlist (${updateResult.status}).` };
        }
        return { ok: true, id: existingId, created: false };
      } else {
        console.log(`[Spotify SDK] Creating new playlist "${playlistName}" for user: ${userId}`);
        let createRes = await fetch(`https://api.spotify.com/v1/me/playlists`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: playlistName,
            description: 'Curated via Flowstate AI Music',
          }),
        });

        if (!createRes.ok && userId) {
          // Fallback to /users/{userId}/playlists endpoint
          createRes = await fetch(`https://api.spotify.com/v1/users/${userId}/playlists`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: playlistName,
              description: 'Curated via Flowstate AI Music',
            }),
          });
        }

        if (!createRes.ok) {
          const errText = await createRes.text();
          console.error(`[Spotify SDK] Create playlist failed (${createRes.status}):`, errText);
          if (createRes.status === 403) {
            return {
              ok: false,
              error: 'Playlist creation permission missing. Please click "Connect Spotify" to grant playlist permissions.',
            };
          }
          return { ok: false, error: `Failed to create playlist (${createRes.status}).` };
        }

        const newPl = await createRes.json();
        console.log(`[Spotify SDK] Playlist created successfully: ${newPl.id}. Adding ${validUris.length} tracks...`);

        const addResult = await setPlaylistTracks(newPl.id, true);
        if (!addResult.ok) {
          return { ok: false, error: `Created playlist but failed to add tracks (${addResult.status}).` };
        }

        return { ok: true, id: newPl.id, created: true };
      }
    } catch (e) {
      console.error('[Spotify SDK] Save playlist exception:', e);
      return { ok: false, error: e.message || 'Unexpected error saving playlist.' };
    }
  }, [token]);

  return {
    isAuthorized: !!token,
    token,
    deviceId,
    isPlaying,
    currentTrack,
    currentIndex,
    queue,
    positionMs,
    durationMs,
    userProductTier,
    login,
    logout,
    searchAndPlaySeeds,
    appendSteeredSeeds,
    play,
    pause,
    skipNext,
    skipPrevious,
    selectQueueTrack,
    removeFromQueue,
    seek,
    likeTrack,
    saveAsPlaylist,
    activatePlayerElement,
    setQueue,
    setCurrentIndex,
    isInfiniteFlow,
    setIsInfiniteFlow,
  };
}

