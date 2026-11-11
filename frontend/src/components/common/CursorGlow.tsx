import React, { useEffect, useRef } from 'react';

/**
 * High-performance cursor follower and ambient pointer lighting.
 * Tracks mouse using direct DOM translation in requestAnimationFrame
 * (zero React re-renders for smooth 60fps).
 * Automatically disabled on touch screens and when prefers-reduced-motion is active.
 */
export const CursorGlow: React.FC = () => {
  const glowRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: -1000, y: -1000, targetX: -1000, targetY: -1000 });
  const rafRef = useRef<number | null>(null);
  const isVisibleRef = useRef(false);

  useEffect(() => {
    // Check if device supports fine hover pointer
    const isPointerFine = window.matchMedia('(pointer: fine)').matches;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!isPointerFine || prefersReducedMotion) {
      return;
    }

    let isLoopRunning = false;

    const renderLoop = () => {
      const current = posRef.current;
      const dx = current.targetX - current.x;
      const dy = current.targetY - current.y;

      current.x += dx * 0.18;
      current.y += dy * 0.18;

      if (glowRef.current) {
        glowRef.current.style.transform = `translate3d(${current.x}px, ${current.y}px, 0)`;
      }

      // If cursor is stationary, halt loop to conserve 100% idle CPU/GPU cycles
      if (Math.abs(dx) < 0.25 && Math.abs(dy) < 0.25) {
        isLoopRunning = false;
        rafRef.current = null;
        return;
      }

      rafRef.current = requestAnimationFrame(renderLoop);
    };

    const startLoop = () => {
      if (!isLoopRunning) {
        isLoopRunning = true;
        rafRef.current = requestAnimationFrame(renderLoop);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      posRef.current.targetX = e.clientX;
      posRef.current.targetY = e.clientY;

      if (!isVisibleRef.current && glowRef.current) {
        isVisibleRef.current = true;
        glowRef.current.style.opacity = '1';
      }

      // Update card tilt proximity variables on hovered interactive elements
      const target = (e.target as HTMLElement)?.closest('.interactive-card') as HTMLElement | null;
      if (target) {
        const rect = target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        target.style.setProperty('--card-mouse-x', `${x}px`);
        target.style.setProperty('--card-mouse-y', `${y}px`);
      }

      startLoop();
    };

    const handleMouseLeave = () => {
      if (isVisibleRef.current && glowRef.current) {
        isVisibleRef.current = false;
        glowRef.current.style.opacity = '0';
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      isLoopRunning = false;
    };
  }, []);

  return (
    <div
      ref={glowRef}
      className="cursor-ambient-glow"
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '540px',
        height: '540px',
        marginLeft: '-270px',
        marginTop: '-270px',
        borderRadius: '50%',
        pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(14, 165, 233, 0.09) 0%, rgba(139, 92, 246, 0.045) 35%, transparent 70%)',
        opacity: 0,
        transition: 'opacity 0.4s ease',
        willChange: 'transform',
        zIndex: 0,
      }}
    />
  );
};

