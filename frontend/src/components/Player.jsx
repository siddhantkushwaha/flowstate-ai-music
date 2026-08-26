import React from 'react';
import { Play, Pause, SkipForward, SkipBack, Heart, Music, Sparkles, Infinity, Repeat } from 'lucide-react';

function formatTime(ms) {
  if (!ms || isNaN(ms)) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

export function Player({
  currentTrack,
  isPlaying,
  positionMs = 0,
  durationMs = 0,
  onPlay,
  onPause,
  onSkip,
  onPrevious,
  onSeek,
  onLike,
  isLiked = false,
  isInfiniteFlow = false,
  onToggleInfiniteFlow,
}) {
  if (!currentTrack) {
    return (
      <div className="w-full glass-panel p-8 sm:p-12 rounded-3xl text-center space-y-4 border border-white/10 shadow-2xl relative overflow-hidden">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-emerald-500/20 to-indigo-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-xl">
          <Music className="w-10 h-10 animate-pulse" />
        </div>
        <div className="max-w-sm mx-auto">
          <h3 className="text-lg font-bold text-white tracking-tight">Enter Your Flow</h3>
        </div>
      </div>
    );
  }

  const name = currentTrack.attributes?.name || currentTrack.name || 'Unknown Track';
  const artist = currentTrack.attributes?.artistName || currentTrack.artistName || 'Unknown Artist';
  const album = currentTrack.attributes?.albumName || currentTrack.albumName || 'Flowstate Queue';
  const artworkUrl = currentTrack.attributes?.artwork?.url
    ? currentTrack.attributes.artwork.url.replace('{w}', '600').replace('{h}', '600')
    : currentTrack.artwork?.url || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=600&auto=format&fit=crop&q=80';
  const reasoning = currentTrack.reasoning;

  const trackDuration = durationMs || currentTrack.durationMs || 1000;
  const trackPosition = Math.min(positionMs, trackDuration);

  return (
    <div className="w-full p-5 sm:p-6 rounded-3xl space-y-4 shadow-2xl relative overflow-hidden border border-white/10 group" style={{ background: 'rgba(10,16,28,0.97)' }}>
      {/* Ambient Artwork Glow */}
      <div
        className="absolute inset-0 bg-cover bg-center -z-10"
        style={{ backgroundImage: `url(${artworkUrl})`, filter: 'blur(60px) opacity(0.15)', transform: 'scale(1.1)' }}
      />
      <div className="absolute inset-0 -z-10" style={{ background: 'rgba(10,16,28,0.93)' }} />

      {/* Track Cover Art + Details */}
      <div className="flex flex-col sm:flex-row items-center gap-5">
        <div className="relative aspect-square w-36 sm:w-44 rounded-2xl overflow-hidden shadow-2xl shrink-0 group/cover ring-1 ring-white/20">
          <img
            src={artworkUrl}
            alt={name}
            className="w-full h-full object-cover group-hover/cover:scale-105 transition-transform duration-700"
          />
          {isPlaying && (
            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full glass-card border border-emerald-500/40 flex items-center gap-1.5 text-xs text-emerald-400">
              <div className="flex items-end gap-0.5 h-3">
                <span className="w-0.5 bg-emerald-400 eq-bar rounded-full"></span>
                <span className="w-0.5 bg-emerald-400 eq-bar rounded-full"></span>
                <span className="w-0.5 bg-emerald-400 eq-bar rounded-full"></span>
                <span className="w-0.5 bg-emerald-400 eq-bar rounded-full"></span>
              </div>
              <span className="text-[10px] font-bold tracking-wider uppercase">Spotify Active</span>
            </div>
          )}
        </div>

        {/* Track Title, Artist, Album & AI Reasoning */}
        <div className="flex-1 space-y-2 text-center sm:text-left min-w-0 w-full">
          <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
            <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
              Streaming via Spotify
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white truncate mt-1.5 tracking-tight">{name}</h2>
          <p className="text-sm font-semibold text-emerald-300 truncate">{artist}</p>
          <p className="text-xs text-slate-400 truncate mt-0.5">{album}</p>

          {/* AI Reasoning Pill */}
          {reasoning && (
            <div className="glass-card p-2.5 rounded-2xl border border-emerald-500/20 text-xs text-slate-200 flex items-start gap-2 text-left bg-emerald-950/20 mt-2">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed text-[11px]">{reasoning}</p>
            </div>
          )}
        </div>
      </div>

      {/* Interactive Track Seeking Progress Bar */}
      <div className="space-y-1.5 group/seek">
        <div className="relative flex items-center h-4">
          <div className="absolute inset-y-0 flex items-center w-full">
            <div className="relative w-full h-1 rounded-full overflow-hidden bg-white/10">
              <div
                className="absolute left-0 top-0 h-full rounded-full bg-emerald-400 transition-none"
                style={{ width: `${(trackPosition / trackDuration) * 100}%` }}
              />
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={trackDuration}
            value={trackPosition}
            onChange={(e) => onSeek && onSeek(Number(e.target.value))}
            className="seek-bar absolute inset-0 w-full opacity-0 cursor-pointer h-4"
          />
        </div>
        <div className="flex justify-between text-[10px] font-mono text-slate-500 font-medium">
          <span>{formatTime(trackPosition)}</span>
          <span>{formatTime(trackDuration)}</span>
        </div>
      </div>

      {/* Main Playback Controls */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onLike && onLike(currentTrack)}
          className={`p-2.5 rounded-full glass-card transition-all active:scale-95 ${isLiked ? 'text-rose-400 bg-rose-500/15' : 'text-slate-400 hover:text-rose-400 hover:bg-rose-500/10'}`}
          title="Save to Spotify Liked Songs"
        >
          <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={onPrevious}
            className="w-10 h-10 rounded-full glass-card text-slate-200 flex items-center justify-center hover:bg-slate-800 transition-all hover:scale-105 active:scale-95 border border-white/10"
            title="Previous track"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={isPlaying ? onPause : onPlay}
            className="w-12 h-12 rounded-full bg-gradient-to-tr from-emerald-400 via-teal-500 to-emerald-600 text-slate-950 flex items-center justify-center shadow-lg shadow-emerald-500/30 hover:scale-105 active:scale-95 transition-all font-black"
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
          </button>

          <button
            onClick={onSkip}
            className="w-10 h-10 rounded-full glass-card text-slate-200 flex items-center justify-center hover:bg-slate-800 transition-all hover:scale-105 active:scale-95 border border-white/10"
            title="Next track"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Infinite Flow / Loop Toggle */}
        <button
          onClick={onToggleInfiniteFlow}
          className={`p-2.5 rounded-full glass-card transition-all active:scale-95 border flex items-center justify-center ${
            isInfiniteFlow
              ? 'text-emerald-300 bg-emerald-500/20 border-emerald-500/40 shadow-sm shadow-emerald-500/20'
              : 'text-slate-400 hover:text-slate-200 border-white/10 hover:border-white/20'
          }`}
          title={
            isInfiniteFlow
              ? 'Infinite Flow: ON (Auto-extending queue continuously)'
              : 'Loop Mode: Replays from top of queue when finished (Click to toggle Infinite Flow)'
          }
        >
          {isInfiniteFlow ? (
            <Infinity className="w-4 h-4 text-emerald-400" />
          ) : (
            <Repeat className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}

