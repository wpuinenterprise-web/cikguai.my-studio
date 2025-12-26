import React, { memo } from 'react';

const AnimatedBackground = memo(() => {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {/* Stars layer */}
      <div className="absolute inset-0">
        {[...Array(50)].map((_, i) => (
          <div
            key={`star-${i}`}
            className="absolute rounded-full bg-white animate-twinkle"
            style={{
              width: Math.random() * 2 + 1 + 'px',
              height: Math.random() * 2 + 1 + 'px',
              top: Math.random() * 100 + '%',
              left: Math.random() * 100 + '%',
              animationDelay: Math.random() * 3 + 's',
              animationDuration: Math.random() * 2 + 2 + 's',
              opacity: Math.random() * 0.7 + 0.3,
            }}
          />
        ))}
      </div>

      {/* Meteors */}
      <div className="absolute inset-0">
        {[...Array(6)].map((_, i) => (
          <div
            key={`meteor-${i}`}
            className="meteor absolute"
            style={{
              top: Math.random() * 50 + '%',
              left: Math.random() * 100 + '%',
              animationDelay: i * 3 + Math.random() * 2 + 's',
              animationDuration: Math.random() * 1 + 1.5 + 's',
            }}
          />
        ))}
      </div>

      {/* Aurora/Galaxy glow effect */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px] animate-aurora-1" />
        <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-neon-cyan/15 rounded-full blur-[100px] animate-aurora-2" />
        <div className="absolute bottom-1/4 left-1/3 w-72 h-72 bg-neon-purple/20 rounded-full blur-[80px] animate-aurora-3" />
      </div>

      {/* Subtle grid overlay */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(to right, hsl(var(--primary) / 0.1) 1px, transparent 1px),
            linear-gradient(to bottom, hsl(var(--primary) / 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />
    </div>
  );
});

AnimatedBackground.displayName = 'AnimatedBackground';

export default AnimatedBackground;
