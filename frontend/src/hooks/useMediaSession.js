import { useEffect } from 'react';

export function useMediaSession({ currentTrack, isPlaying, onPlay, onPause, onSkipNext, onSkipPrevious }) {
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

    const actionHandlers = [
      ['play', onPlay],
      ['pause', onPause],
      ['nexttrack', onSkipNext],
      ['previoustrack', onSkipPrevious],
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
  }, [currentTrack, isPlaying, onPlay, onPause, onSkipNext, onSkipPrevious]);
}
