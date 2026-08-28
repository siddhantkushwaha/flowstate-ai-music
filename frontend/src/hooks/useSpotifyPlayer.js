import { useState, useEffect, useCallback, useRef } from 'react';
import { getStoredSpotifyToken, getStoredAppSession, redirectToSpotifyOAuth, exchangeCodeForToken, logoutSpotify } from '../services/spotifyAuth';
import { fetchClientConfig, establishAppSession } from '../services/api';

const SPOTIFY_CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID || '';

export function useSpotifyPlayer() {
  const [token, setToken] = useState(null);
  const [clientId, setClientId] = useState(SPOTIFY_CLIENT_ID);
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

  // Fetch backend runtime config on mount
  useEffect(() => {
    fetchClientConfig().then((cfg) => {
      if (cfg && cfg.spotify_client_id) {
        setClientId(cfg.spotify_client_id);
      }
    });
  }, []);

  // Ties the app's identity to the verified Spotify login - only calls out
  // if there isn't already a signed app session stored (e.g. from a prior
  // login this browser already completed).
  const establishSession = useCallback(async (accessToken) => {
    if (getStoredAppSession()) return;
    await establishAppSession(accessToken);
  }, []);

  // Resolve any stored Spotify token once the client ID is known, silently
  // refreshing it if the access token has expired. Replaces the old
  // synchronous "expired -> logged out" behavior.
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      const stored = await getStoredSpotifyToken(clientId);
      if (!cancelled && stored) {
        setToken(stored);
        establishSession(stored);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId, establishSession]);

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
    if (code) {
      const handleExchange = async () => {
        let activeId = clientId || SPOTIFY_CLIENT_ID;
        if (!activeId) {
          const cfg = await fetchClientConfig();
          if (cfg && cfg.spotify_client_id) activeId = cfg.spotify_client_id;
        }
        if (activeId) {
          try {
            const newToken = await exchangeCodeForToken(activeId, code);
            setToken(newToken);
            establishSession(newToken);
          } catch (err) {
            console.error('Spotify OAuth Code exchange error:', err);
          }
        }
      };
      handleExchange();
    }
  }, [clientId, establishSession]);

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
        // Anchor the interpolation timer (below) to this authoritative sample
        // so the smoothed position never drifts from what Spotify reports.
        positionAnchorRef.current = { positionMs: state.position || 0, atRealTime: Date.now() };

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

  // The Web Playback SDK renders actual audio inside a hidden cross-origin
  // iframe, so the OS/browser attaches the lock-screen Now Playing card and
  // hardware media keys to THAT iframe (showing as "Spotify Embedded Player"
  // with no artwork) instead of to this page's navigator.mediaSession.
  // Anchoring a silent, looping <audio> element on this page and keeping it
  // "playing" in lockstep with real playback makes this document the one
  // with active audible media, so the OS attributes Now Playing (and
  // next/previous key routing) here instead of the SDK's iframe.
  const silentAnchorRef = useRef(null);
  useEffect(() => {
    const sampleRate = 8000;
    const numSamples = sampleRate; // 1 second, looped
    const buffer = new ArrayBuffer(44 + numSamples);
    const view = new DataView(buffer);
    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + numSamples, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate, true);
    view.setUint16(32, 1, true);
    view.setUint16(34, 8, true);
    writeString(36, 'data');
    view.setUint32(40, numSamples, true);
    for (let i = 0; i < numSamples; i++) view.setUint8(44 + i, 128); // silence (8-bit PCM midpoint)

    const blobUrl = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
    const anchor = new Audio(blobUrl);
    anchor.loop = true;
    anchor.volume = 0;
    silentAnchorRef.current = anchor;

    return () => {
      anchor.pause();
      URL.revokeObjectURL(blobUrl);
      silentAnchorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const anchor = silentAnchorRef.current;
    if (!anchor) return;
    if (isPlaying) {
      anchor.play().catch(() => {});
    } else {
      anchor.pause();
    }
  }, [isPlaying]);

  // Activate element on user gesture (browser security)
  const activatePlayerElement = useCallback(() => {
    if (player && typeof player.activateElement === 'function') {
      try { player.activateElement(); } catch (e) { console.warn('[Spotify SDK] activateElement warning:', e); }
    }
    // Unlock the silent anchor while we still have a real user gesture;
    // iOS Safari requires the first play() on a media element to originate
    // from one. Once unlocked, later play()/pause() calls from the
    // isPlaying-sync effect above don't need a gesture.
    silentAnchorRef.current?.play().catch(() => {});
  }, [player]);

  // Smooth position timer: interpolate from the last authoritative SDK sample
  // using elapsed wall-clock time (instead of blindly adding a fixed step per
  // tick), so the seek bar doesn't drift or visibly jump when ticks land late.
  const positionAnchorRef = useRef({ positionMs: 0, atRealTime: Date.now() });
  const resetPosition = useCallback((ms = 0) => {
    setPositionMs(ms);
    positionAnchorRef.current = { positionMs: ms, atRealTime: Date.now() };
  }, []);
  useEffect(() => {
    let interval = null;
    if (isPlaying) {
      interval = setInterval(() => {
        const { positionMs: anchorPos, atRealTime } = positionAnchorRef.current;
        const elapsed = Date.now() - atRealTime;
        setPositionMs(Math.min(anchorPos + elapsed, durationMs || anchorPos + elapsed));
      }, 250);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isPlaying, durationMs]);

  const login = useCallback(async () => {
    let activeId = clientId || SPOTIFY_CLIENT_ID;
    if (!activeId) {
      const cfg = await fetchClientConfig();
      if (cfg && cfg.spotify_client_id) activeId = cfg.spotify_client_id;
    }
    if (!activeId) {
      alert('Missing Spotify Client ID. Set SPOTIFY_CLIENT_ID in your .env file.');
      return;
    }
    redirectToSpotifyOAuth(activeId);
  }, [clientId]);

  const logout = useCallback(() => {
    logoutSpotify();
    setToken(null); setPlayer(null); setDeviceId(null);
    setIsPlaying(false); setQueue([]); setCurrentIndex(0);
    resetPosition(0); setDurationMs(0);
  }, [resetPosition]);

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

  const attemptPlay = (targetDevId, uris, accessToken) =>
    fetch(`https://api.spotify.com/v1/me/player/play?device_id=${targetDevId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris }),
    });

  const reportPlayError = async (res) => {
    const errText = await res.text();
    console.error(`[Spotify SDK] Play error (${res.status}):`, errText);
    if (res.status === 403) alert('Spotify requires Premium to stream.');
    else if (res.status === 401) alert('Session expired. Please reconnect Spotify.');
    else if (res.status === 404) alert('Spotify device not found. Try refreshing the page.');
    else alert(`Spotify error (${res.status}): ${errText}`);
  };

  // Skips/track-selects call this constantly, so the common case (device is
  // already active) takes a single request instead of a devices-list lookup
  // plus a transfer round trip before the play call. Only fall back to the
  // slower resolve-and-transfer path if the fast attempt fails.
  const playUrisOnSpotify = async (uris, devId, accessToken) => {
    activatePlayerElement();

    if (devId) {
      try {
        console.log('[Spotify SDK] Playing URIs (fast path):', uris);
        const res = await attemptPlay(devId, uris, accessToken);
        if (res.ok || res.status === 204) return true;
        if (res.status !== 404) {
          await reportPlayError(res);
          return false;
        }
        console.warn('[Spotify SDK] Fast play got 404, falling back to device resolve + transfer.');
      } catch (err) {
        console.warn('[Spotify SDK] Fast play attempt failed, falling back to device resolve:', err);
      }
    }

    const targetDevId = await getLiveValidDeviceId(devId, accessToken);
    if (!targetDevId) { console.error('[Spotify SDK] No active deviceId resolved.'); return false; }
    try {
      console.log(`[Spotify SDK] Transferring to deviceId: ${targetDevId}`);
      await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_ids: [targetDevId], play: true }),
      });
      console.log('[Spotify SDK] Playing URIs:', uris);
      const res = await attemptPlay(targetDevId, uris, accessToken);
      console.log(`[Spotify SDK] Play response: ${res.status}`);
      if (!res.ok && res.status !== 204) {
        await reportPlayError(res);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[Spotify SDK] Exception playing URIs:', err);
      return false;
    }
  };

  // Same-song identity for dedup purposes - uri is the canonical Spotify
  // track identifier, id as a fallback for items missing one.
  const trackKey = (t) => t.uri || t.id || null;

  // Search Spotify catalog for seed queries, build track objects. Skips any
  // result that's already in existingTracks OR already resolved earlier in
  // this same batch - the LLM/catalog search can both independently produce
  // a track that's already queued (steering has no visibility into the
  // queue at all, and Infinite Flow's "avoid repeats" is a prompt-level
  // request, not a guarantee), so this is the one choke point all paths
  // funnel through before a track becomes visible in the queue.
  const resolveTracksFromQueries = async (catalogQueries, existingTracks = []) => {
    const seenKeys = new Set(existingTracks.map(trackKey).filter(Boolean));
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
            const key = found.uri || found.id;
            if (key && seenKeys.has(key)) {
              console.log(`[Spotify SDK] Skipping duplicate track already queued: ${found.name}`);
              continue;
            }
            if (key) seenKeys.add(key);
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
    resetPosition(0);
    if (spotifyUris.length > 0) {
      const success = await playUrisOnSpotify(spotifyUris, deviceId, token);
      if (success) setIsPlaying(true);
    }
  }, [token, deviceId, resetPosition]);

  // Load an already-resolved track list (e.g. from history) straight into the
  // queue and start playback - skips the LLM/catalog-search round trip since
  // these tracks were resolved once already at the time they were saved.
  const loadAndPlayQueue = useCallback(async (trackItems) => {
    if (!token) { alert('Please connect Spotify to stream music.'); return; }
    if (!trackItems || trackItems.length === 0) return;
    // Re-mint uids so resumed history entries get fresh React keys even if
    // played again later - duplicate songs across sessions must not collide.
    const freshItems = trackItems.map((t) => ({
      ...t,
      uid: `track-${t.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }));
    setQueue(freshItems);
    setCurrentIndex(0);
    resetPosition(0);
    const uris = freshItems.map((t) => t.uri).filter(Boolean);
    if (uris.length > 0) {
      const success = await playUrisOnSpotify(uris, deviceId, token);
      if (success) setIsPlaying(true);
    }
  }, [token, deviceId, resetPosition]);

  // Append steered tracks to existing queue (keeps current playing)
  const appendSteeredSeeds = useCallback(async (catalogQueries) => {
    if (!token) { alert('Please connect Spotify to stream music.'); return []; }
    console.log('[Spotify SDK] Appending steered tracks to queue:', catalogQueries);
    const { trackItems } = await resolveTracksFromQueries(catalogQueries, queueRef.current);
    if (trackItems.length === 0) return [];
    setQueue((prev) => [...prev, ...trackItems]);
    return trackItems;
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
        resetPosition(0);
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
    resetPosition(0);
    // Play from nextIdx onward
    const uris = currentQ.slice(nextIdx).map((t) => t.uri).filter(Boolean);
    if (token && uris.length > 0) {
      const success = await playUrisOnSpotify(uris, deviceId, token);
      if (success) setIsPlaying(true);
    }
  }, [token, deviceId, activatePlayerElement, resetPosition]);


  const skipPrevious = useCallback(async () => {
    activatePlayerElement();
    const currentQ = queueRef.current;
    const idx = currentIndexRef.current;
    // If past 3 seconds, restart current track; else go back
    if (positionMs > 3000) {
      if (player) { try { await player.seek(0); resetPosition(0); return; } catch (e) {} }
    }
    const prevIdx = Math.max(0, idx - 1);
    setCurrentIndex(prevIdx);
    resetPosition(0);
    const uris = currentQ.slice(prevIdx).map((t) => t.uri).filter(Boolean);
    if (token && uris.length > 0) {
      const success = await playUrisOnSpotify(uris, deviceId, token);
      if (success) setIsPlaying(true);
    }
  }, [token, deviceId, player, positionMs, activatePlayerElement, resetPosition]);

  const selectQueueTrack = useCallback(async (index) => {
    const currentQ = queueRef.current;
    if (index < 0 || index >= currentQ.length) return;
    activatePlayerElement();
    setCurrentIndex(index);
    resetPosition(0);
    const uris = currentQ.slice(index).map((t) => t.uri).filter(Boolean);
    if (token && uris.length > 0) {
      console.log(`[Spotify SDK] Playing queue track #${index + 1}: ${currentQ[index].name}`);
      const success = await playUrisOnSpotify(uris, deviceId, token);
      if (success) setIsPlaying(true);
    }
  }, [token, deviceId, activatePlayerElement, resetPosition]);

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
    if (player) {
      try {
        await player.seek(positionTargetMs);
        resetPosition(positionTargetMs);
      } catch (e) { console.error('[Spotify SDK] Seek error:', e); }
    }
  }, [player, resetPosition]);

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
    if (!token) return { ok: false, error: 'Please connect Spotify first.', needsReauth: true };

    const currentQ = queueRef.current;
    // Extract strictly valid Spotify URIs (spotify:track:<22-char-id>)
    const validUris = currentQ
      .map((t) => {
        if (t.uri && /^spotify:track:[0-9A-Za-z]{22}$/.test(t.uri)) return t.uri;
        if (t.id && /^[0-9A-Za-z]{22}$/.test(t.id)) return `spotify:track:${t.id}`;
        if (t.uri && t.uri.startsWith('spotify:track:')) return t.uri;
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
          return { ok: false, error: 'Session expired. Please reconnect Spotify.', needsReauth: true };
        }
        return { ok: false, error: 'Failed to access Spotify profile.' };
      }
      const me = await meRes.json();
      const userId = me.id;

      // 2. Check existing user playlists to see if one with the same name exists and is owned by the user
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
          const found = items.find(
            (p) =>
              p &&
              p.name &&
              p.name.trim().toLowerCase() === playlistName.trim().toLowerCase() &&
              (p.owner?.id === userId || p.collaborative === true)
          );
          if (found) {
            existingId = found.id;
            console.log(`[Spotify SDK] Found existing user-owned playlist with name "${playlistName}": ${existingId}`);
            break;
          }
          if (!plData.next || items.length === 0) break;
          offset += 50;
        }
      } catch (e) {
        console.warn('[Spotify SDK] Could not search existing playlists:', e);
      }

      // Helper to add or replace tracks in playlist with 100-item batching, fallback endpoints, and full logging
      const setPlaylistTracks = async (playlistId, isNew = false) => {
        const chunkSize = 100;
        for (let i = 0; i < validUris.length; i += chunkSize) {
          const chunk = validUris.slice(i, i + chunkSize);
          const method = !isNew && i === 0 ? 'PUT' : 'POST';

          console.log(`[Spotify SDK] [setPlaylistTracks] Batch ${Math.floor(i / chunkSize) + 1}: ${method} ${chunk.length} tracks to playlist ID: ${playlistId}`, {
            playlistId,
            method,
            isNew,
            totalTracksInQueue: validUris.length,
            chunkSample: chunk.slice(0, 3),
            fullChunk: chunk,
          });

          // Endpoints to attempt: /tracks then /items
          const endpoints = [
            `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
            `https://api.spotify.com/v1/playlists/${playlistId}/items`,
          ];

          let success = false;
          let lastStatus = 0;
          let lastErrorDetail = '';

          for (const endpoint of endpoints) {
            try {
              console.log(`[Spotify SDK] Sending ${method} request to ${endpoint}...`);
              const res = await fetch(endpoint, {
                method,
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ uris: chunk }),
              });

              const resText = await res.text();
              lastStatus = res.status;
              let parsedBody = null;
              try { parsedBody = JSON.parse(resText); } catch {}

              console.log(`[Spotify SDK] Response from ${endpoint} [Status ${res.status}]:`, parsedBody || resText);

              if (res.ok || res.status === 200 || res.status === 201) {
                success = true;
                break;
              } else {
                const apiMsg = parsedBody?.error?.message || parsedBody?.error_description || resText || `HTTP ${res.status}`;
                lastErrorDetail = apiMsg;
                console.warn(`[Spotify SDK] Endpoint ${endpoint} failed (${res.status}): ${apiMsg}`);

                // Try query parameter fallback for /tracks if JSON body failed
                if (endpoint.includes('/tracks')) {
                  const queryUris = encodeURIComponent(chunk.join(','));
                  const queryEndpoint = `${endpoint}?uris=${queryUris}`;
                  console.log(`[Spotify SDK] Trying fallback query param URL: ${queryEndpoint}`);
                  const queryRes = await fetch(queryEndpoint, {
                    method,
                    headers: {
                      Authorization: `Bearer ${token}`,
                    },
                  });
                  const queryResText = await queryRes.text();
                  console.log(`[Spotify SDK] Fallback query param response [Status ${queryRes.status}]:`, queryResText);
                  if (queryRes.ok || queryRes.status === 200 || queryRes.status === 201) {
                    success = true;
                    break;
                  }
                }
              }
            } catch (err) {
              console.error(`[Spotify SDK] Exception calling ${endpoint}:`, err);
              lastErrorDetail = err.message || String(err);
            }
          }

          if (!success) {
            console.error(`[Spotify SDK] Failed to add tracks to playlist ${playlistId}. Final Status: ${lastStatus}, Detail: ${lastErrorDetail}`);
            return {
              ok: false,
              status: lastStatus,
              error: lastErrorDetail || `Spotify API error (${lastStatus})`,
            };
          }
        }
        return { ok: true };
      };

      // Helper to create fresh playlist under current user
      const createFreshPlaylist = async () => {
        console.log(`[Spotify SDK] Creating new playlist "${playlistName}" for user: ${userId}`);
        const payload = JSON.stringify({
          name: playlistName,
          description: 'Curated via Flowstate AI Music',
          public: false,
        });

        let createRes = await fetch('https://api.spotify.com/v1/me/playlists', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: payload,
        });

        if (!createRes.ok && userId) {
          // Fallback to /users/{userId}/playlists endpoint
          console.log(`[Spotify SDK] /me/playlists returned ${createRes.status}. Trying /users/${userId}/playlists fallback...`);
          createRes = await fetch(`https://api.spotify.com/v1/users/${encodeURIComponent(userId)}/playlists`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: payload,
          });
        }

        if (!createRes.ok) {
          const errText = await createRes.text();
          let parsedErr = null;
          try { parsedErr = JSON.parse(errText); } catch {}
          const errorMsg = parsedErr?.error?.message || parsedErr?.error_description || errText || `HTTP ${createRes.status}`;
          console.error(`[Spotify SDK] Create playlist failed (${createRes.status}):`, errorMsg);
          return {
            ok: false,
            needsReauth: createRes.status === 403 || createRes.status === 401,
            error: `Failed to create playlist (${createRes.status}): ${errorMsg}`,
          };
        }

        const newPl = await createRes.json();
        console.log(`[Spotify SDK] Playlist created successfully: ID=${newPl.id}, Name="${newPl.name}". Now adding ${validUris.length} tracks...`, newPl);

        const addResult = await setPlaylistTracks(newPl.id, true);
        if (!addResult.ok) {
          console.error(`[Spotify SDK] Created playlist "${playlistName}" (${newPl.id}) but failed to add tracks:`, addResult);
          return {
            ok: false,
            needsReauth: addResult.status === 403 || addResult.status === 401,
            error: `Created playlist "${playlistName}" but failed to add tracks: ${addResult.error}`,
          };
        }

        return { ok: true, id: newPl.id, created: true };
      };

      // 3. Overwrite existing or create new playlist
      if (existingId) {
        console.log(`[Spotify SDK] Overwriting tracks in existing playlist: ${existingId}`);
        const updateResult = await setPlaylistTracks(existingId, false);
        if (!updateResult.ok) {
          console.warn(`[Spotify SDK] Failed to update playlist ${existingId} (${updateResult.status}: ${updateResult.error}). Falling back to creating new playlist.`);
          return await createFreshPlaylist();
        }
        return { ok: true, id: existingId, created: false };
      } else {
        return await createFreshPlaylist();
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
    loadAndPlayQueue,
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

