import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Github } from 'lucide-react';
import { Header } from './components/Header';
import { PromptInput } from './components/PromptInput';
import { Player } from './components/Player';
import { MiniPlayer } from './components/MiniPlayer';
import { QueueView } from './components/QueueView';
import { VibeControls } from './components/VibeControls';
import { TasteProfileModal } from './components/TasteProfileModal';
import { useSpotifyPlayer } from './hooks/useSpotifyPlayer';
import { useMediaSession } from './hooks/useMediaSession';
import { curateVibe, steerQueue, updateUserProfile, fetchSteerSuggestions, fetchInfiniteFlowTracks, checkBackendHealth } from './services/api';

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
    login,
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

  const isExtendingRef = useRef(false);

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

  // Auto-extend queue when Infinite Flow is enabled and queue is near the end
  const handleAutoExtendInfiniteFlow = useCallback(async () => {
    if (isExtendingRef.current || !isInfiniteFlow) return;
    if (queue.length === 0) return;

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
    } finally {
      isExtendingRef.current = false;
    }
  }, [isInfiniteFlow, queue.length, initialPrompt, lastPrompt, currentTrack, steerHistory, playedTracks, userProfile, appendSteeredSeeds]);

  // Monitor playback position in queue to trigger Infinite Flow expansion
  useEffect(() => {
    if (!isInfiniteFlow) return;
    if (queue.length > 0 && currentIndex >= queue.length - 1 && !isExtendingRef.current) {
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
        await appendSteeredSeeds(data.catalog_queries);
        const newTrackNames = data.catalog_queries.map((q) => `${q.artist} - ${q.track_name}`);
        setPlayedTracks((prev) => [...prev, ...newTrackNames]);
        showToast(`Added ${data.catalog_queries.length} steered track(s) to queue!`);
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
      showToast(`Saved "${trackTitle}" to your taste profile!`);
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
