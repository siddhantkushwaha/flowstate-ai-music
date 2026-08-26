import React, { useState } from 'react';
import { Sliders, Send, Sparkles } from 'lucide-react';

export function VibeControls({ onSteer, isLoading, suggestions = [] }) {
  const [customSteer, setCustomSteer] = useState('');

  const defaultSteers = [
    "Increase BPM / Energy",
    "Soften & Go Acoustic",
    "Shift Era / Nostalgic",
    "More Heavy Bass & Beats"
  ];

  const displaySteers = suggestions && suggestions.length > 0 ? suggestions : defaultSteers;

  const handleCustomSubmit = (e) => {
    e.preventDefault();
    if (!customSteer.trim() || isLoading) return;
    onSteer(customSteer);
    setCustomSteer('');
  };

  return (
    <div className="w-full glass-panel p-5 rounded-3xl space-y-3.5 shadow-2xl border border-white/10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
          <Sliders className="w-4 h-4" />
          <span>Vibe Steering</span>
        </div>
        {suggestions && suggestions.length > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400/80 font-medium bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            <Sparkles className="w-3 h-3" />
            Dynamic AI
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {displaySteers.map((option, idx) => (
          <button
            key={idx}
            onClick={() => onSteer(option)}
            disabled={isLoading}
            className="p-3 text-xs text-left rounded-2xl glass-card text-slate-300 hover:text-white hover:border-emerald-500/40 transition-all border border-white/5 disabled:opacity-50 active:scale-95 flex items-center gap-2 font-medium group"
          >
            <span className="truncate group-hover:text-emerald-300 transition-colors">{option}</span>
          </button>
        ))}
      </div>

      <form onSubmit={handleCustomSubmit} className="relative flex items-center pt-1">
        <input
          type="text"
          value={customSteer}
          onChange={(e) => setCustomSteer(e.target.value)}
          placeholder="Shift vibe e.g. 'less synth, more bass'..."
          disabled={isLoading}
          className="w-full pl-4 pr-12 py-3 rounded-2xl glass-card text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 border border-white/10"
        />
        <button
          type="submit"
          disabled={isLoading || !customSteer.trim()}
          className="absolute right-2 p-2 rounded-xl bg-emerald-500 text-slate-950 disabled:opacity-40 hover:bg-emerald-400 font-bold transition-all shadow-md"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}
