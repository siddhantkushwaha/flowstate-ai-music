import React, { useState } from 'react';
import { Sparkles, ArrowRight, Compass } from 'lucide-react';

export function PromptInput({ onSubmit, isLoading }) {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;
    onSubmit(prompt);
  };

  const presetVibes = [
    { label: "Rainy Hindi Nostalgia", query: "Nostalgia filled music for a rainy day bus ride in hindi only!" },
    { label: "Leg Day Heavy Pump", query: "High energy leg day workout pump with heavy beats" },
    { label: "80s Synthwave Drive", query: "80s synthwave drive through a neon city at midnight" },
    { label: "Acoustic Focus Lofi", query: "Calm rainy afternoon acoustic indie study vibes" }
  ];

  return (
    <div className="w-full space-y-3.5">
      {/* Search Input Box */}
      <form onSubmit={handleSubmit} className="relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-600 rounded-2xl opacity-30 group-hover:opacity-60 blur-md transition duration-500 group-focus-within:opacity-80"></div>
        <div className="relative flex items-center bg-[#0d1322] rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
          <div className="pl-4 pr-2 text-emerald-400">
            <Sparkles className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </div>
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe any vibe, mood, or language requirement..."
            disabled={isLoading}
            className="w-full py-4 pr-16 text-sm sm:text-base bg-transparent text-white placeholder-slate-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={isLoading || !prompt.trim()}
            className="absolute right-2.5 p-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 disabled:opacity-40 font-bold transition-all shadow-md active:scale-95 flex items-center justify-center"
          >
            <ArrowRight className="w-4 h-4 stroke-[3]" />
          </button>
        </div>
      </form>

      {/* Preset Vibe Chips */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium px-1">
          <Compass className="w-3.5 h-3.5 text-emerald-400" />
          <span>Curated Inspirations:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {presetVibes.map((item, idx) => (
            <button
              key={idx}
              onClick={() => {
                setPrompt(item.query);
                onSubmit(item.query);
              }}
              disabled={isLoading}
              className="text-xs px-3.5 py-2 rounded-xl glass-card text-slate-200 hover:text-emerald-300 hover:border-emerald-500/40 transition-all border border-white/5 flex items-center gap-2 active:scale-95 disabled:opacity-50 font-medium"
            >
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
