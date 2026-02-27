
import React from 'react';
import { TranscriptionEntry } from '../types';

interface TranscriptProps {
  entries: TranscriptionEntry[];
}

export const Transcript: React.FC<TranscriptProps> = ({ entries }) => {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500 italic py-12">
        <p>Your conversation will appear here...</p>
      </div>
    );
  }

  return (
    <div 
      ref={scrollRef}
      className="flex flex-col gap-4 overflow-y-auto max-h-[400px] scrollbar-hide px-4"
    >
      {entries.map((entry, idx) => (
        <div 
          key={entry.timestamp + idx}
          className={`flex flex-col ${entry.type === 'user' ? 'items-end' : 'items-start'}`}
        >
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
            {entry.type === 'user' ? 'You' : 'Gemini'}
          </span>
          <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
            entry.type === 'user' 
              ? 'bg-zinc-800 text-zinc-100 rounded-tr-none' 
              : 'bg-blue-600/10 text-blue-200 border border-blue-500/20 rounded-tl-none'
          }`}>
            {entry.text}
          </div>
        </div>
      ))}
    </div>
  );
};
