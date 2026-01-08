
import React from 'react';

export const MODELS = [
  { 
    id: 'gpt', 
    name: 'GPT', 
    color: 'text-white', 
    border: 'border-white/20', 
    glow: 'shadow-[0_0_20px_-5px_rgba(255,255,255,0.2)]',
    accent: 'bg-white'
  },
  { 
    id: 'grok', 
    name: 'GROK', 
    color: 'text-slate-300', 
    border: 'border-slate-500/20', 
    glow: 'shadow-[0_0_20px_-5px_rgba(203,213,225,0.15)]',
    accent: 'bg-slate-400'
  },
  { 
    id: 'gemini', 
    name: 'GEMINI', 
    color: 'text-zinc-200', 
    border: 'border-zinc-500/20', 
    glow: 'shadow-[0_0_20px_-5px_rgba(228,228,231,0.15)]',
    accent: 'bg-zinc-300'
  },
  { 
    id: 'claude', 
    name: 'CLAUDE', 
    color: 'text-neutral-100', 
    border: 'border-neutral-500/20', 
    glow: 'shadow-[0_0_20px_-5px_rgba(245,245,245,0.2)]',
    accent: 'bg-neutral-200'
  },
];

export const STAGES = [
  { id: 1, label: 'Мнения', value: 'STAGE_1' },
  { id: 2, label: 'Рецензии', value: 'STAGE_2' },
  { id: 3, label: 'Консенсус', value: 'STAGE_3' },
];

export const CREOMATICA_LOGO = (
  <a 
    href="https://creomatica.ru/" 
    target="_blank" 
    rel="noopener noreferrer" 
    className="flex items-center gap-3.5 group cursor-pointer pointer-events-auto"
  >
    <div className="relative w-9 h-9 rounded-[6px] border border-white/10 bg-white/5 flex items-center justify-center group-hover:border-white/30 group-hover:bg-white/10 transition-all duration-700 ease-out shadow-2xl shrink-0">
      <svg 
        width="18" 
        height="18" 
        viewBox="0 0 24 24" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg" 
        className="text-white opacity-60 group-hover:opacity-100 transition-opacity duration-700"
      >
        <path 
          d="M18.2 8C16.9 6 14.9 5 12.7 5C8.8 5 5.7 8.1 5.7 12C5.7 15.9 8.8 19 12.7 19C14.9 19 16.9 18 18.2 16" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round"
        />
      </svg>
    </div>
    <span className="text-[13px] tracking-[0.5em] font-semibold text-white/20 group-hover:text-white/80 transition-all duration-700 uppercase leading-none">
      Creomatica
    </span>
  </a>
);
