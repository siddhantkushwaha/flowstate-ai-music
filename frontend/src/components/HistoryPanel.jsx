import React from 'react';
import { History, Trash2, Play, ListMusic } from 'lucide-react';

function relativeTime(unixSeconds) {
  const diffMs = Date.now() - unixSeconds * 1000;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function HistoryPanel({ entries = [], onResume, onDelete }) {
  if (!entries || entries.length === 0) return null;

  return (
    <div className="w-full glass-panel p-6 rounded-3xl space-y-3 shadow-2xl border border-white/10">
      <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm border-b border-white/10 pb-3">
        <History className="w-4 h-4" />
        <span>Recent (last 7 days)</span>
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="p-3 rounded-2xl flex items-center justify-between text-xs bg-slate-900/40 border border-white/5 hover:border-emerald-500/30 transition-all"
          >
            <button
              type="button"
              onClick={() => onResume && onResume(entry)}
              className="flex items-center gap-3 truncate pr-2 flex-1 min-w-0 text-left"
              title="Resume this session"
            >
              <span className="shrink-0 p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                <Play className="w-3.5 h-3.5" />
              </span>
              <div className="truncate space-y-0.5 flex-1 min-w-0">
                <p className="truncate font-medium text-slate-200">{entry.prompt}</p>
                <p className="text-slate-500 truncate text-[11px] flex items-center gap-1">
                  <ListMusic className="w-3 h-3 shrink-0" />
                  <span>{entry.tracks?.length || 0} tracks &middot; {relativeTime(entry.updated_at)}</span>
                </p>
              </div>
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); onDelete && onDelete(entry.id); }}
              className="shrink-0 ml-2 p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all active:scale-95"
              title="Delete from history"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
