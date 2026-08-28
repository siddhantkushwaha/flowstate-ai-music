import React, { useState } from 'react';
import { Sparkles, ArrowRight, Compass } from 'lucide-react';

// Large pool of varied inspiration prompts (moods, genres, eras, languages,
// activities). A random subset is sampled on each mount so the chips feel
// fresh instead of the same 4 hardcoded options every time.
const PROMPT_POOL = [
  { label: "Rainy Hindi Nostalgia", query: "Nostalgia filled music for a rainy day bus ride in hindi only!" },
  { label: "Leg Day Heavy Pump", query: "High energy leg day workout pump with heavy beats" },
  { label: "80s Synthwave Drive", query: "80s synthwave drive through a neon city at midnight" },
  { label: "Acoustic Focus Lofi", query: "Calm rainy afternoon acoustic indie study vibes" },
  { label: "Korean Late Night Feels", query: "Korean R&B and ballads for late night overthinking" },
  { label: "90s Grunge Rebellion", query: "90s grunge and alt rock for a rebellious mood" },
  { label: "Sunday Morning Jazz", query: "Smooth jazz and bossa nova for a lazy sunday morning" },
  { label: "Punjabi Road Trip", query: "Upbeat punjabi music for a road trip with friends" },
  { label: "Deep Focus Coding", query: "Instrumental electronic music for deep focus coding sessions" },
  { label: "Heartbreak Ballads", query: "Slow sad ballads about heartbreak and moving on" },
  { label: "Afrobeats House Party", query: "Afrobeats and dancehall for a house party" },
  { label: "Y2K Pop Punk", query: "Early 2000s pop punk and emo anthems" },
  { label: "Spanish Guitar Sunset", query: "Spanish guitar and flamenco for watching the sunset" },
  { label: "Cozy Winter Cabin", query: "Warm acoustic folk for a cozy winter cabin evening" },
  { label: "Bollywood Wedding Dance", query: "High energy bollywood dance hits for a wedding sangeet" },
  { label: "Midnight Drum and Bass", query: "Fast paced drum and bass for a late night drive" },
  { label: "French Cafe Morning", query: "French chanson and cafe jazz for a slow morning" },
  { label: "Classic Rock Highway", query: "Classic rock anthems for a long highway drive" },
  { label: "Meditation and Calm", query: "Ambient soundscapes for meditation and deep calm" },
  { label: "Arabic Pop Energy", query: "Modern arabic pop with energetic beats" },
  { label: "Old School Hip Hop", query: "Golden era 90s hip hop with classic boom bap beats" },
  { label: "Japanese City Pop", query: "Retro japanese city pop for a nostalgic night drive" },
  { label: "Reggae Beach Day", query: "Laid back reggae and dub for a beach day" },
  { label: "Dark Techno Warehouse", query: "Dark hypnotic techno for a warehouse rave" },
  { label: "Cottagecore Folk", query: "Gentle indie folk with nature and cottagecore vibes" },
  { label: "K-Pop Dance Practice", query: "High energy k-pop for a dance practice session" },
  { label: "Sad Girl Autumn", query: "Melancholic indie and dream pop for an autumn walk" },
  { label: "Latin Salsa Night", query: "Salsa and latin pop for a lively dance night" },
  { label: "Disco Revival Groove", query: "Funky disco revival tracks with groovy basslines" },
  { label: "Rainy Day Blues", query: "Soulful blues for a slow rainy day" },
  { label: "Cinematic Epic Score", query: "Cinematic orchestral music for an epic adventure feeling" },
  { label: "Chill Trip Hop Study", query: "Chill trip hop and downtempo beats for studying" },
  { label: "Punjabi Bhangra Gym", query: "Bhangra beats mixed with gym motivation energy" },
  { label: "Neo Soul Late Night", query: "Neo soul and smooth r&b for a late night in" },
  { label: "Metalcore Rage Workout", query: "Aggressive metalcore for an intense rage workout" },
  { label: "Bengali Adda Evening", query: "Nostalgic bengali music for an evening adda with friends" },
  { label: "Tropical House Poolside", query: "Tropical house for a relaxed poolside afternoon" },
  { label: "Indie Sleaze Party", query: "2010s indie sleaze party anthems" },
  { label: "Classical Piano Study", query: "Calm classical piano pieces for studying" },
  { label: "Turkish Pop Roadtrip", query: "Modern turkish pop for a summer roadtrip" },
  { label: "Grime UK Energy", query: "High energy UK grime and drill" },
  { label: "Soft Sleep Ambient", query: "Soft ambient textures to help fall asleep" },
  { label: "Mandarin Pop Feels", query: "Emotional mandopop ballads for a reflective evening" },
  { label: "Country Backroads", query: "Classic country music for cruising backroads" },
  { label: "Vaporwave Nostalgia", query: "Dreamy vaporwave and synth for nostalgic nights" },
  { label: "Punk Rock Basement", query: "Raw punk rock energy for a basement show feeling" },
  { label: "Ghazal Rainy Evening", query: "Soulful urdu ghazals for a quiet rainy evening" },
  { label: "Progressive House Sunset", query: "Melodic progressive house for a sunset festival feeling" },
  { label: "Motown Kitchen Dance", query: "Classic motown soul for dancing around the kitchen" },
  { label: "Post Rock Introspection", query: "Instrumental post rock for deep introspection" },
  { label: "Reggaeton Summer Heat", query: "Reggaeton and latin trap for summer heat" },
  { label: "Study Session Rain Lofi", query: "Rainy lofi hip hop beats for a long study session" },
  { label: "Italian Romance Dinner", query: "Romantic italian music for a candlelit dinner" },
  { label: "Trap Confidence Boost", query: "Hard trap beats for a confidence boost before a big day" },
  { label: "Celtic Forest Walk", query: "Celtic folk instrumentals for a walk through the forest" },
  { label: "New Wave 80s Nightlife", query: "New wave and synth pop for 80s inspired nightlife" },
  { label: "Gospel Sunday Uplift", query: "Uplifting gospel music for a sunday morning" },
  { label: "Desi Hip Hop Swagger", query: "Modern desi hip hop with confident swagger" },
  { label: "Shoegaze Dream Haze", query: "Hazy shoegaze and dream pop for zoning out" },
  { label: "Salsa Kitchen Cooking", query: "Upbeat salsa and merengue for cooking dinner" },
  { label: "Dark Academia Study", query: "Moody classical and dark academia study playlist" },
  { label: "Funk Groove Cleaning", query: "Funky groove music for cleaning the house" },
];

function sampleRandom(pool, count) {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function PromptInput({ onSubmit, isLoading }) {
  const [prompt, setPrompt] = useState('');
  const [presetVibes] = useState(() => sampleRandom(PROMPT_POOL, 4));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;
    onSubmit(prompt);
  };

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
