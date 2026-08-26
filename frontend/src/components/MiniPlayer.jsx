import React from 'react';
import { Play, Pause, SkipForward } from 'lucide-react';

export function MiniPlayer({ currentTrack, isPlaying, onPlay, onPause, onSkip }) {
  if (!currentTrack) return null;

  const name = currentTrack.attributes?.name || currentTrack.name || 'Unknown Track';
  const artist = currentTrack.attributes?.artistName || currentTrack.artistName || 'Unknown Artist';
  const artworkUrl = currentTrack.attributes?.artwork?.url
    ? currentTrack.attributes.artwork.url.replace('{w}', '100').replace('{h}', '100')
    : currentTrack.artwork?.url || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100&auto=format&fit=crop&q=80';

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 glass-panel border-t border-white/10 px-4 py-3 sm:px-6 shadow-2xl backdrop-blur-xl md:hidden">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 truncate min-w-0">
          <img src={artworkUrl} alt={name} className="w-10 h-10 rounded-xl object-cover shrink-0 border border-white/10" />
          <div className="truncate text-left space-y-0.5">
            <p className="text-white text-xs font-bold truncate">{name}</p>
            <p className="text-slate-400 text-[11px] truncate">{artist}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={isPlaying ? onPause : onPlay}
            className="w-10 h-10 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center font-bold active:scale-95 transition-transform"
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
          </button>
          <button onClick={onSkip} className="p-2 text-slate-300 hover:text-white active:scale-95 transition-transform">
            <SkipForward className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
