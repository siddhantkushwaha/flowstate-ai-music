import React, { useState } from 'react';
import { ListMusic, Tag, Sparkles, X, BookmarkPlus, Check, Loader2, Infinity, Repeat } from 'lucide-react';

export function QueueView({
  queue,
  currentIndex = 0,
  summary,
  onSelectTrack,
  onRemoveTrack,
  onSavePlaylist,
  isInfiniteFlow = false,
  onToggleInfiniteFlow,
}) {
  const [playlistName, setPlaylistName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null); // { ok, created } | null

  if (!queue || queue.length === 0) return null;

  const handleSave = async () => {
    if (!playlistName.trim() || saving) return;
    setSaving(true);
    setSaveResult(null);
    const result = await onSavePlaylist(playlistName.trim());
    setSaving(false);
    setSaveResult(result);
    if (result?.ok) {
      setTimeout(() => setSaveResult(null), 3000);
    }
  };

  return (
    <div className="w-full glass-panel p-6 rounded-3xl space-y-4 shadow-2xl border border-white/10">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
          <ListMusic className="w-4 h-4" />
          <span>Queue ({queue.length} tracks)</span>
        </div>

        {/* Infinite Flow / Loop Toggle */}
        <button
          onClick={onToggleInfiniteFlow}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95 border ${
            isInfiniteFlow
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-md shadow-emerald-950/40 hover:bg-emerald-500/25'
              : 'bg-slate-900/60 border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20'
          }`}
          title={
            isInfiniteFlow
              ? 'Infinite Flow: ON (Automatically appends fresh songs matching session vibe as queue finishes)'
              : 'Loop Mode: Replays from top of queue when finished (Click to enable Infinite Flow)'
          }
        >
          {isInfiniteFlow ? (
            <>
              <Infinity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span>Infinite Flow</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            </>
          ) : (
            <>
              <Repeat className="w-3.5 h-3.5 text-slate-400" />
              <span>Loop: Top</span>
            </>
          )}
        </button>
      </div>


      {/* Curator summary */}
      {summary && (
        <div className="glass-card p-3 rounded-2xl border border-emerald-500/20 text-xs text-emerald-300/90 flex items-start gap-2 bg-emerald-950/20">
          <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <p className="italic font-medium">"{summary}"</p>
        </div>
      )}

      {/* Track list */}
      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {queue.map((item, index) => {
          const name = item.attributes?.name || item.name || item.track_name || 'Track';
          const artist = item.attributes?.artistName || item.artistName || item.artist || 'Artist';
          const artworkUrl = item.attributes?.artwork?.url
            ? item.attributes.artwork.url.replace('{w}', '100').replace('{h}', '100')
            : item.artwork?.url || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100&auto=format&fit=crop&q=80';
          const isActive = index === currentIndex;

          return (
            <div
              key={item.uid || `${item.id || 'track'}-${index}`}
              className={`p-3 rounded-2xl flex items-center justify-between text-xs transition-all ${
                isActive
                  ? 'bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 font-semibold shadow-lg shadow-emerald-950/30'
                  : 'bg-slate-900/40 border border-white/5 text-slate-300 hover:border-emerald-500/30 cursor-pointer'
              }`}
            >
              {/* Click to play */}
              <div
                className="flex items-center gap-3 truncate pr-2 flex-1 min-w-0"
                onClick={() => !isActive && onSelectTrack && onSelectTrack(index)}
                title={isActive ? 'Now playing' : 'Click to play'}
              >
                <span className="w-5 text-center font-bold text-slate-500 shrink-0">
                  {isActive ? (
                    <span className="flex items-end gap-px h-3 justify-center">
                      <span className="w-0.5 bg-emerald-400 eq-bar rounded-full" />
                      <span className="w-0.5 bg-emerald-400 eq-bar rounded-full" />
                      <span className="w-0.5 bg-emerald-400 eq-bar rounded-full" />
                    </span>
                  ) : index + 1}
                </span>
                <img src={artworkUrl} alt={name} className="w-9 h-9 rounded-lg object-cover shrink-0 border border-white/10" />
                <div className="truncate text-left space-y-0.5 flex-1 min-w-0">
                  <p className={`truncate font-medium ${isActive ? 'text-white' : 'text-slate-200'}`}>{name}</p>
                  <p className="text-slate-400 truncate text-[11px]">{artist}</p>
                </div>
                {item.vibeTags && item.vibeTags.length > 0 && (
                  <span className="shrink-0 hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800/80 text-emerald-300 border border-slate-700/50 text-[10px]">
                    <Tag className="w-2.5 h-2.5" />
                    {item.vibeTags[0]}
                  </span>
                )}
              </div>

              {/* Remove button */}
              <button
                onClick={(e) => { e.stopPropagation(); onRemoveTrack && onRemoveTrack(index); }}
                className="shrink-0 ml-2 p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all active:scale-95"
                title="Remove from queue"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Save as playlist */}
      <div className="pt-1 border-t border-white/10">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={playlistName}
            onChange={(e) => setPlaylistName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            placeholder="Name this playlist..."
            className="flex-1 min-w-0 px-3 py-2 rounded-xl glass-card text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 border border-white/10"
          />
          <button
            onClick={handleSave}
            disabled={!playlistName.trim() || saving}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-40 transition-all active:scale-95"
            title="Save to Spotify playlist"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : saveResult?.ok ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <BookmarkPlus className="w-3.5 h-3.5" />
            )}
            {saving ? 'Saving…' : saveResult?.ok ? (saveResult.created ? 'Created!' : 'Updated!') : 'Save to Spotify'}
          </button>
        </div>
        {saveResult && !saveResult.ok && (
          <p className="mt-1 text-xs text-rose-400">{saveResult.error || 'Failed to save playlist.'}</p>
        )}
      </div>
    </div>
  );
}
