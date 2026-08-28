import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Github } from 'lucide-react';
import { Header } from './components/Header';
import { PromptInput } from './components/PromptInput';
import { Player } from './components/Player';
import { MiniPlayer } from './components/MiniPlayer';
import { QueueView } from './components/QueueView';
import { VibeControls } from './components/VibeControls';
import { TasteProfileModal } from './components/TasteProfileModal';
import { HistoryPanel } from './components/HistoryPanel';
import { useSpotifyPlayer } from './hooks/useSpotifyPlayer';
import { useMediaSession } from './hooks/useMediaSession';
import {
  curateVibe, steerQueue, updateUserProfile, fetchSteerSuggestions, fetchInfiniteFlowTracks, checkBackendHealth,
  fetchUserProfile, fetchHistory, createHistoryEntry, patchHistoryEntry, deleteHistoryEntry,
} from './services/api';

// How long a freshly curated queue must play continuously (on its first
// track) before the session is saved to history - filters out abandoned or
// instantly-skipped prompts.
const HISTORY_SAVE_THRESHOLD_MS = 30 * 1000;

export default function App() {
  const spotify = useSpotifyPlayer();

  const {
    isAuthorized,
    isPlaying,
    currentTrack,
    currentIndex,
    queue,
    positionMs,
    durationMs,
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
    loadAndPlayQueue,
    login,
    logout,
    isInfiniteFlow,
    setIsInfiniteFlow,
  } = spotify;

  const [isLoading, setIsLoading] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState('');
  const [lastPrompt, setLastPrompt] = useState('');
  const [steerHistory, setSteerHistory] = useState([]);
  const [playedTracks, setPlayedTracks] = useState([]);
  const [curatorSummary, setCuratorSummary] = useState('');
  const [userProfile, setUserProfile] = useState('');
  const [recentSkips, setRecentSkips] = useState([]);
  const [backendStatus, setBackendStatus] = useState({ status: 'checking' });
  const [isTasteModalOpen, setIsTasteModalOpen] = useState(false);
  const [steerSuggestions, setSteerSuggestions] = useState([]);
  const [likedTrackIds, setLikedTrackIds] = useState([]);
  const [toastMessage, setToastMessage] = useState(null);
  const [history, setHistory] = useState([]);

  const isExtendingRef = useRef(false);
  const lastExtendQueueLengthRef = useRef(-1);
  const currentHistoryIdRef = useRef(null);
  const historySavedForQueueRef = useRef(false);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Bind iOS Lock Screen & Background MediaSession
  useMediaSession({
    currentTrack,
    isPlaying,
    onPlay: play,
    onPause: pause,
    onSkipNext: skipNext,
    onSkipPrevious: skipPrevious,
  });

  useEffect(() => {
    checkBackendHealth().then(setBackendStatus);
  }, []);

  // Hydrate the per-user taste profile and recent (7-day) curation history
  // from the backend as soon as the app session is available, instead of
  // starting both at empty on every reload.
  useEffect(() => {
    if (!isAuthorized) return;
    fetchUserProfile().then((profile) => { if (profile) setUserProfile(profile); });
    fetchHistory().then(setHistory);
  }, [isAuthorized]);

  const saveCurrentSessionToHistory = useCallback(async () => {
    if (historySavedForQueueRef.current || queue.length === 0) return;
    const prompt = initialPrompt || lastPrompt;
    if (!prompt) return;
    historySavedForQueueRef.current = true;
    const id = await createHistoryEntry({ prompt, curatorSummary, tracks: queue });
    if (!id) { historySavedForQueueRef.current = false; return; }
    currentHistoryIdRef.current = id;
    setHistory((prev) => [
      { id, prompt, curator_summary: curatorSummary, tracks: queue, steer_history: [], updated_at: Date.now() / 1000 },
      ...prev,
    ]);
  }, [queue, initialPrompt, lastPrompt, curatorSummary]);

  // Save a curated session to history once its first track has played
  // continuously for HISTORY_SAVE_THRESHOLD_MS - filters out prompts that
  // were never actually listened to.
  useEffect(() => {
    if (!isAuthorized || !isPlaying || currentIndex !== 0 || queue.length === 0 || historySavedForQueueRef.current) {
      return;
    }
    const timer = setTimeout(saveCurrentSessionToHistory, HISTORY_SAVE_THRESHOLD_MS);
    return () => clearTimeout(timer);
  }, [isAuthorized, isPlaying, currentIndex, queue.length, saveCurrentSessionToHistory]);

  // How many tracks must remain in the queue before we start prefetching the
  // next batch. Triggering only on the very last track meant playback caught
  // up to the fetch; starting a couple tracks early gives the LLM + catalog
  // search round trip time to finish before the queue actually runs out.
  const INFINITE_FLOW_PREFETCH_LOOKAHEAD = 2;

  // Auto-extend queue when Infinite Flow is enabled and the queue is running low
  const handleAutoExtendInfiniteFlow = useCallback(async () => {
    if (isExtendingRef.current || !isInfiniteFlow) return;
    if (queue.length === 0) return;
    // Already requested a continuation for this exact queue state - avoid
    // re-firing on every render while we wait for it to land.
    if (lastExtendQueueLengthRef.current === queue.length) return;
    lastExtendQueueLengthRef.current = queue.length;

    isExtendingRef.current = true;
    const activePrompt = initialPrompt || lastPrompt || 'Continuous music flow';
    const currentTrackName = currentTrack ? `${currentTrack.artistName || ''} - ${currentTrack.name || ''}` : '';
    console.log('[Infinite Flow] Auto-requesting continuation tracks with session context...', {
      initialPrompt: activePrompt,
      steerHistory,
      playedTracks,
    });

    try {
      const data = await fetchInfiniteFlowTracks({
        initialPrompt: activePrompt,
        steerHistory,
        playedTracks,
        currentTrack: currentTrackName,
        userProfile,
      });

      if (data.catalog_queries && data.catalog_queries.length > 0) {
        await appendSteeredSeeds(data.catalog_queries);
        const newTrackNames = data.catalog_queries.map((q) => `${q.artist} - ${q.track_name}`);
        setPlayedTracks((prev) => [...prev, ...newTrackNames]);
        showToast(`Infinite Flow: Added ${data.catalog_queries.length} continuous track(s)`);
      }
    } catch (err) {
      console.warn('[Infinite Flow] Auto-extend error:', err);
      // Allow a retry on the next check instead of getting stuck waiting
      // for a queue-length change that will never come.
      lastExtendQueueLengthRef.current = -1;
    } finally {
      isExtendingRef.current = false;
    }
  }, [isInfiniteFlow, queue.length, initialPrompt, lastPrompt, currentTrack, steerHistory, playedTracks, userProfile, appendSteeredSeeds]);

  // Monitor playback position in queue to trigger Infinite Flow prefetch
  // early, well before the current track finishes.
  useEffect(() => {
    if (!isInfiniteFlow) return;
    if (queue.length === 0) return;
    const tracksRemaining = queue.length - 1 - currentIndex;
    if (tracksRemaining <= INFINITE_FLOW_PREFETCH_LOOKAHEAD && !isExtendingRef.current) {
      handleAutoExtendInfiniteFlow();
    }
  }, [isInfiniteFlow, currentIndex, queue.length, handleAutoExtendInfiniteFlow]);

  // Update dynamic suggestions whenever prompt or track/queue changes
  const updateSuggestions = useCallback(async (promptText, trackObj, queueList) => {
    try {
      const trackName = trackObj ? `${trackObj.artistName || ''} - ${trackObj.name || ''}` : '';
      const queueNames = (queueList || []).map((t) => `${t.artistName || ''} - ${t.name || ''}`);
      const suggestions = await fetchSteerSuggestions(promptText, trackName, queueNames, userProfile);
      if (suggestions && suggestions.length > 0) {
        setSteerSuggestions(suggestions);
      }
    } catch (e) {
      console.warn('Failed to fetch dynamic suggestions:', e);
    }
  }, [userProfile]);

  const handlePromptSubmit = async (promptText) => {
    activatePlayerElement();
    setIsLoading(true);
    setInitialPrompt(promptText);
    setLastPrompt(promptText);
    setSteerHistory([]);
    currentHistoryIdRef.current = null;
    historySavedForQueueRef.current = false;
    try {
      const data = await curateVibe(promptText, userProfile);
      setCuratorSummary(data.curator_summary);
      if (data.catalog_queries) {
        await searchAndPlaySeeds(data.catalog_queries);
        const trackNames = data.catalog_queries.map((q) => `${q.artist} - ${q.track_name}`);
        setPlayedTracks(trackNames);
        // Refresh suggestions for the new flow
        updateSuggestions(promptText, null, trackNames);
      }
    } catch (err) {
      console.error('Curation failed:', err);
      showToast(`Error curating vibe: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSteer = async (feedbackText) => {
    if (!currentTrack) return;
    activatePlayerElement();
    setIsLoading(true);
    const trackName = currentTrack.attributes?.name || currentTrack.name || 'Current Track';
    const artistName = currentTrack.attributes?.artistName || currentTrack.artistName || '';

    setSteerHistory((prev) => [...prev, feedbackText]);

    try {
      const data = await steerQueue(
        `${artistName} - ${trackName}`,
        feedbackText,
        recentSkips,
        userProfile
      );

      if (data.catalog_queries && data.catalog_queries.length > 0) {
        const addedTracks = await appendSteeredSeeds(data.catalog_queries);
        const newTrackNames = data.catalog_queries.map((q) => `${q.artist} - ${q.track_name}`);
        setPlayedTracks((prev) => [...prev, ...newTrackNames]);
        showToast(`Added ${data.catalog_queries.length} steered track(s) to queue!`);
        if (currentHistoryIdRef.current && addedTracks && addedTracks.length > 0) {
          patchHistoryEntry(currentHistoryIdRef.current, { steerText: feedbackText, addedTracks });
        }
      }
      // Refresh suggestions
      updateSuggestions(lastPrompt, currentTrack, queue);
    } catch (err) {
      console.error('Steering failed:', err);
      showToast(`Steering failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };


  const handleLike = async (track) => {
    if (!track) return;
    const trackTitle = track.attributes?.name || track.name || 'Liked Track';
    const trackId = track.id;

    // 1. Save to Spotify library
    const spotifySuccess = await likeTrack(track);

    // 2. Update local state
    if (trackId && !likedTrackIds.includes(trackId)) {
      setLikedTrackIds((prev) => [...prev, trackId]);
    }

    // 3. Update LLM user profile
    const updated = await updateUserProfile(userProfile, trackTitle);
    setUserProfile(updated);

    if (spotifySuccess) {
      showToast(`Saved "${trackTitle}" to your Spotify Liked Songs!`);
    } else {
      showToast(`Couldn't save "${trackTitle}" to Spotify (check console for details). Saved to your taste profile instead.`);
    }
  };

  const handleSkip = () => {
    activatePlayerElement();
    if (currentTrack) {
      const name = currentTrack.attributes?.name || currentTrack.name || '';
      setRecentSkips((prev) => [...prev.slice(-4), name]);
    }
    skipNext();
  };

  const handlePrevious = () => {
    activatePlayerElement();
    skipPrevious();
  };

  const handleSavePlaylist = async (playlistName) => {
    const result = await saveAsPlaylist(playlistName);
    if (result.ok) {
      showToast(result.created ? `Created playlist "${playlistName}" on Spotify!` : `Updated playlist "${playlistName}" on Spotify!`);
    } else {
      showToast(`Playlist save error: ${result.error}`);
    }
    return result;
  };

  const handleResumeHistory = async (entry) => {
    activatePlayerElement();
    setInitialPrompt(entry.prompt);
    setLastPrompt(entry.prompt);
    setCuratorSummary(entry.curator_summary || '');
    setSteerHistory(entry.steer_history || []);
    setPlayedTracks((entry.tracks || []).map((t) => `${t.artistName || ''} - ${t.name || ''}`));
    currentHistoryIdRef.current = entry.id;
    historySavedForQueueRef.current = true; // already saved - don't re-save on resume
    await loadAndPlayQueue(entry.tracks || []);
  };

  const handleLogout = () => {
    logout();
    setUserProfile('');
    setHistory([]);
    setInitialPrompt('');
    setLastPrompt('');
    setSteerHistory([]);
    setPlayedTracks([]);
    setCuratorSummary('');
    setLikedTrackIds([]);
    currentHistoryIdRef.current = null;
    historySavedForQueueRef.current = false;
  };

  const handleDeleteHistory = async (id) => {
    const ok = await deleteHistoryEntry(id);
    if (ok) {
      setHistory((prev) => prev.filter((h) => h.id !== id));
      if (currentHistoryIdRef.current === id) currentHistoryIdRef.current = null;
    } else {
      showToast('Failed to delete history entry.');
    }
  };

  const isCurrentLiked = currentTrack && (likedTrackIds.includes(currentTrack.id) || likedTrackIds.includes(currentTrack.uri));

  return (
    <div className="min-h-screen bg-[#060911] text-slate-100 flex flex-col pb-24 md:pb-0 selection:bg-emerald-500 relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 px-4 py-2.5 rounded-2xl glass-panel border border-emerald-500/40 bg-emerald-950/90 text-emerald-300 text-xs font-semibold shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-200 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{toastMessage}</span>
        </div>
      )}

      <Header
        isAuthorized={isAuthorized}
        backendStatus={backendStatus}
        onConnectSpotify={login}
        onOpenTasteProfile={() => setIsTasteModalOpen(true)}
        onLogout={handleLogout}
      />

      <main className="px-4 sm:px-8 py-6 max-w-7xl mx-auto w-full flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-6 space-y-6 lg:sticky lg:top-24">
            <Player
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              positionMs={positionMs}
              durationMs={durationMs}
              onPlay={play}
              onPause={pause}
              onSkip={handleSkip}
              onPrevious={handlePrevious}
              onSeek={seek}
              onLike={handleLike}
              isLiked={isCurrentLiked}
              isInfiniteFlow={isInfiniteFlow}
              onToggleInfiniteFlow={() => setIsInfiniteFlow((prev) => !prev)}
            />

            {currentTrack && (
              <VibeControls
                onSteer={handleSteer}
                isLoading={isLoading}
                suggestions={steerSuggestions}
              />
            )}
          </div>

          <div className="lg:col-span-6 space-y-6">
            <PromptInput onSubmit={handlePromptSubmit} isLoading={isLoading} />
            <QueueView
              queue={queue}
              currentIndex={currentIndex}
              summary={curatorSummary}
              onSelectTrack={selectQueueTrack}
              onRemoveTrack={removeFromQueue}
              onSavePlaylist={handleSavePlaylist}
              onConnectSpotify={login}
              isInfiniteFlow={isInfiniteFlow}
              onToggleInfiniteFlow={() => setIsInfiniteFlow((prev) => !prev)}
            />
            <HistoryPanel
              entries={history}
              onResume={handleResumeHistory}
              onDelete={handleDeleteHistory}
            />
          </div>

        </div>
      </main>

      <MiniPlayer
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        onPlay={play}
        onPause={pause}
        onSkip={handleSkip}
      />

      <TasteProfileModal
        isOpen={isTasteModalOpen}
        onClose={() => setIsTasteModalOpen(false)}
        userProfile={userProfile}
      />

      <footer className="text-center text-xs text-slate-500 pt-6 pb-4 px-4 flex items-center justify-center gap-2">
        <span>Flowstate</span>
        <span>•</span>
        <a
          href="https://github.com/siddhantkushwaha/flowstate-ai-music"
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-400 hover:text-emerald-400 transition-colors flex items-center gap-1.5 font-medium"
        >
          <Github className="w-3.5 h-3.5" />
          <span>GitHub</span>
        </a>
      </footer>
    </div>
  );
}
