import React from 'react';
import { X, Sparkles, Heart, Brain } from 'lucide-react';

export function TasteProfileModal({ isOpen, onClose, userProfile }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-lg glass-panel p-6 sm:p-8 rounded-3xl space-y-6 border border-white/10 shadow-2xl relative overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5 text-emerald-400">
            <Brain className="w-6 h-6" />
            <h3 className="text-lg font-bold text-white">Evolving Taste Memory</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl glass-card text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4">
          <p className="text-xs text-slate-400 leading-relaxed">
            Flowstate maintains a lightweight, rolling context summary of your musical preferences. Every time you click the <Heart className="w-3.5 h-3.5 inline text-rose-400" /> icon, your profile evolves.
          </p>

          <div className="glass-card p-5 rounded-2xl border border-emerald-500/20 space-y-2 bg-emerald-950/20">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>Current Profile Summary:</span>
            </div>
            <p className="text-sm text-slate-100 font-medium leading-relaxed italic">
              {userProfile || "No taste profile saved yet. Like your favorite tracks to build your AI memory!"}
            </p>
          </div>
        </div>

        {/* Footer */}
        <button
          onClick={onClose}
          className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-all shadow-lg active:scale-95"
        >
          Close
        </button>
      </div>
    </div>
  );
}
