import { useEffect } from 'react';

export function useMediaSession({ currentTrack, isPlaying, positionMs, durationMs, onPlay, onPause, onSkipNext, onSkipPrevious, onSeek }) {
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    if (currentTrack) {
      const title = currentTrack.name || 'AI Music';
      const artist = currentTrack.artistName || 'AI Curator';
      const album = currentTrack.albumName || 'Natural Language Queue';
      const artworkUrl = currentTrack.artwork?.url
        || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=512&auto=format&fit=crop&q=80';

      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist,
        album,
        artwork: [
          { src: artworkUrl, sizes: '512x512', type: 'image/jpeg' },
        ],
      });
    }

    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

    // Tells the OS where the scrubber sits and how long the track is, so the
    // lock-screen seek bar actually renders and drags to the right place.
    if (durationMs > 0 && navigator.mediaSession.setPositionState) {
      try {
        navigator.mediaSession.setPositionState({
          duration: durationMs / 1000,
          playbackRate: 1,
          position: Math.min(positionMs / 1000, durationMs / 1000),
        });
      } catch (error) {
        console.warn('MediaSession setPositionState failed:', error);
      }
    }

    const actionHandlers = [
      ['play', onPlay],
      ['pause', onPause],
      ['nexttrack', onSkipNext],
      ['previoustrack', onSkipPrevious],
      ['seekto', onSeek ? (details) => onSeek(details.seekTime * 1000) : null],
    ];

    for (const [action, handler] of actionHandlers) {
      try {
        if (handler) {
          navigator.mediaSession.setActionHandler(action, handler);
        } else {
          navigator.mediaSession.setActionHandler(action, null);
        }
      } catch (error) {
        console.warn(`MediaSession action ${action} not supported:`, error);
      }
    }
  }, [currentTrack, isPlaying, positionMs, durationMs, onPlay, onPause, onSkipNext, onSkipPrevious, onSeek]);
}
