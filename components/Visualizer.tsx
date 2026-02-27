
import React, { useMemo } from 'react';
import { AudioVisualizerProps } from '../types';

export const Visualizer: React.FC<AudioVisualizerProps> = ({ isActive, isModelTalking }) => {
  const bars = useMemo(() => Array.from({ length: 12 }, (_, i) => i), []);

  return (
    <div className="flex items-center justify-center gap-1.5 h-32 w-full">
      {bars.map((i) => (
        <div
          key={i}
          className={`w-1.5 rounded-full transition-all duration-300 ${
            isActive 
              ? isModelTalking 
                ? 'bg-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.5)]' 
                : 'bg-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.5)]'
              : 'bg-zinc-800'
          }`}
          style={{
            height: isActive ? `${Math.random() * 80 + 20}%` : '8px',
            transitionDelay: `${i * 50}ms`,
            animation: isActive ? `pulse 1.2s ease-in-out infinite ${i * 0.1}s` : 'none'
          }}
        />
      ))}
    </div>
  );
};
