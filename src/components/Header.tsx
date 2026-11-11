import React from 'react';
import { Sparkles, Video, Clock } from 'lucide-react';

interface HeaderProps {
  activeTab: 1 | 2;
  onTabChange: (tab: 1 | 2) => void;
  timestampCount: number;
  clipCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  timestampCount,
  clipCount,
}) => {
  return (
    <header className="bg-[#0e0e11] border-b border-[#222226] px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between sticky top-0 z-50 gap-3">
      {/* Brand title */}
      <div className="flex items-center gap-3">
        <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></div>
        <div className="flex items-center gap-2">
          <span className="font-bold tracking-tight text-white text-sm sm:text-base font-sans">
            SALEEM EDITOR STUDIO
          </span>
          <span className="text-[11px] text-zinc-400 font-mono-code bg-[#141418] px-2 py-0.5 rounded border border-zinc-800 hidden sm:inline-block">
            v2.4 AI Suite
          </span>
        </div>
      </div>

      {/* Navigation Switcher */}
      <div className="flex items-center gap-1.5 bg-[#16161a] p-1 rounded-xl border border-[#26262c]">
        <button
          type="button"
          onClick={() => onTabChange(1)}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 1
              ? 'bg-white text-black shadow-md'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>1. Timestamp Generator</span>
          {timestampCount > 0 && (
            <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-200 text-zinc-900 font-bold">
              {timestampCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => onTabChange(2)}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 2
              ? 'bg-white text-black shadow-md'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
          }`}
        >
          <Video className="w-3.5 h-3.5" />
          <span>2. Saleem Editor Studio (Video Editor)</span>
          {clipCount > 0 && (
            <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-700 text-zinc-200 font-bold">
              {clipCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};
