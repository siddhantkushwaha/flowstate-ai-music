import React from 'react';
import { Waves, ShieldCheck, Disc, Sparkles } from 'lucide-react';

export function Header({ isAuthorized, backendStatus, onConnectSpotify, onOpenTasteProfile }) {
  return (
    <header className="px-4 sm:px-8 py-3.5 border-b border-white/5 glass-panel sticky top-0 z-40 flex items-center justify-between shadow-2xl">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-emerald-400 via-teal-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 ring-1 ring-white/20">
          <Waves className="w-5 h-5 text-white animate-pulse" />
        </div>
        <h1 className="text-lg font-black tracking-tight text-white font-sans">
          Flowstate
        </h1>
      </div>

      {/* Connection & Actions */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={onOpenTasteProfile}
          className="p-2 rounded-xl glass-card text-slate-300 hover:text-emerald-400 hover:border-emerald-500/30 transition-all flex items-center gap-1.5 text-xs font-medium"
          title="View taste profile"
        >
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span className="hidden md:inline">Taste Profile</span>
        </button>

        <button
          onClick={onConnectSpotify}
          title={isAuthorized ? 'Spotify Connected. Click to reconnect / refresh permissions.' : 'Connect your Spotify account'}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 shadow-lg ${
            isAuthorized
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400 shadow-emerald-900/20 hover:border-emerald-400/60'
              : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 border-emerald-400/40 text-slate-950 shadow-emerald-500/25 active:scale-95'
          }`}
        >
          {isAuthorized ? <ShieldCheck className="w-4 h-4" /> : <Disc className="w-4 h-4 animate-spin-slow" />}
          <span>{isAuthorized ? 'Spotify Active' : 'Connect Spotify'}</span>
        </button>
      </div>
    </header>
  );
}
