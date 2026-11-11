import React, { Suspense, Component, useState, useEffect, useRef, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { MascotState } from '../../types/chat';
import { MascotModel } from './MascotModel';
import { MascotFallback2D } from './MascotFallback2D';

interface MascotCanvasProps {
  state: MascotState;
  className?: string;
  fullBody?: boolean;
  minHeight?: string | number;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class CanvasErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('3D Canvas encountered an error, falling back to 2D vector mascot:', error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export const MascotCanvas: React.FC<MascotCanvasProps> = ({
  state,
  className = '',
  fullBody = true,
  minHeight = '100%',
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(true);

  // Pause Three.js rendering completely when the canvas is scrolled off-screen
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.05 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={wrapperRef}
      className={`mascot-canvas-wrapper ${className}`}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <CanvasErrorBoundary
        fallback={<MascotFallback2D state={state} size={300} />}
      >
        <Suspense fallback={<MascotFallback2D state={state} size={300} />}>
          <Canvas
            frameloop={isVisible ? 'always' : 'never'}
            camera={{
              position: fullBody ? [0, 0.08, 3.38] : [0, 0.12, 3.15],
              fov: fullBody ? 31 : 38,
            }}
            dpr={[1, Math.min(1.5, typeof window !== 'undefined' ? window.devicePixelRatio : 1)]}
            gl={{
              antialias: true,
              alpha: true,
              powerPreference: 'high-performance',
              depth: true,
              stencil: false,
            }}
            style={{ width: '100%', height: '100%', pointerEvents: 'auto' }}
          >
            {/* Ambient Lighting tuned for dark midnight navy canvas */}
            <ambientLight intensity={1.35} color="#e2e8f0" />

            {/* Clean White Key Light from upper right */}
            <directionalLight
              position={[3.0, 3.5, 2.8]}
              intensity={1.7}
              color="#ffffff"
            />

            {/* Vibrant Sky-blue rim light for ceramic silhouette definition */}
            <directionalLight
              position={[-3.2, 2.4, -1.2]}
              intensity={2.0}
              color="#38bdf8"
            />

            {/* Soft Cyber Violet back rim light */}
            <pointLight
              position={[0, 2.8, -2.2]}
              intensity={1.1}
              color="#818cf8"
            />

            {/* Subtle Cyan Bounce from underneath */}
            <pointLight
              position={[0, -0.9, 1.2]}
              intensity={0.65}
              color="#00f0ff"
            />

            {/* 3D Cute AI Robot Mascot */}
            <MascotModel state={state} />

            {/* Smooth constrained OrbitControls */}
            <OrbitControls
              enablePan={false}
              enableZoom={false}
              target={fullBody ? [0, 0.08, 0] : [0, 0.12, 0]}
              minPolarAngle={Math.PI / 3}
              maxPolarAngle={Math.PI / 2 + 0.1}
              minAzimuthAngle={-Math.PI / 4}
              maxAzimuthAngle={Math.PI / 4}
              rotateSpeed={0.5}
            />
          </Canvas>
        </Suspense>
      </CanvasErrorBoundary>
    </div>
  );
};
