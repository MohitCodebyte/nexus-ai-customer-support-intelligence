import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { MascotState } from '../../types/chat';
import { prefersReducedMotion } from '../../lib/webgl';

interface MascotModelProps {
  state: MascotState;
}

export const MascotModel: React.FC<MascotModelProps> = ({ state }) => {
  // Main group hierarchy
  const rootGroupRef = useRef<THREE.Group>(null);
  const headGroupRef = useRef<THREE.Group>(null);
  const leftEyeGroupRef = useRef<THREE.Group>(null);
  const rightEyeGroupRef = useRef<THREE.Group>(null);
  const leftEyebrowRef = useRef<THREE.Group>(null);
  const rightEyebrowRef = useRef<THREE.Group>(null);
  const mouthRef = useRef<THREE.Group>(null);
  const chestBar1Ref = useRef<THREE.Mesh>(null);
  const chestBar2Ref = useRef<THREE.Mesh>(null);
  const chestBar3Ref = useRef<THREE.Mesh>(null);
  const rightArmGroupRef = useRef<THREE.Group>(null);
  const rightForearmRef = useRef<THREE.Group>(null);
  const leftArmGroupRef = useRef<THREE.Group>(null);
  const leftForearmRef = useRef<THREE.Group>(null);
  const floorShadowRef = useRef<THREE.Mesh>(null);

  // Material refs for 60fps render loop mutations (avoiding react re-renders)
  const eyeMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const rightEyeMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const eyebrowMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const mouthMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const chestCoreMaterialRef = useRef<THREE.MeshStandardMaterial>(null);

  // Blink timing refs
  const blinkTimerRef = useRef(0);
  const isBlinkingRef = useRef(false);

  // Global cursor tracking ref across window
  const globalMouseRef = useRef({ x: 0, y: 0, active: false });

  // Periodic waving gesture timer
  const waveCycleTimerRef = useRef(0);

  // Friendly click reaction timer
  const clickReactionTimerRef = useRef(0);

  // Check reduced motion preference
  const isReducedMotion = useMemo(() => prefersReducedMotion(), []);

  // Listen to mouse movement anywhere on the window on desktop (disabled on mobile touch devices)
  useEffect(() => {
    const isMobileDevice =
      typeof window !== 'undefined' &&
      (window.matchMedia('(max-width: 768px)').matches ||
        window.matchMedia('(pointer: coarse)').matches ||
        'ontouchstart' in window);

    if (isMobileDevice) {
      return;
    }

    let timeoutId: number;
    const handlePointerMove = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = -((e.clientY / window.innerHeight) * 2 - 1);
      globalMouseRef.current.x = THREE.MathUtils.clamp(nx, -1, 1);
      globalMouseRef.current.y = THREE.MathUtils.clamp(ny, -1, 1);
      globalMouseRef.current.active = true;

      clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        globalMouseRef.current.active = false;
      }, 3000);
    };

    const handlePointerLeave = () => {
      globalMouseRef.current.active = false;
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerleave', handlePointerLeave);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerleave', handlePointerLeave);
      clearTimeout(timeoutId);
    };
  }, []);

  // Emotion color palettes for luminous parts
  const stateColors = useMemo(
    () => ({
      idle: new THREE.Color('#00f0ff'), // Vibrant cyan
      listening: new THREE.Color('#38bdf8'), // Bright sky blue
      thinking: new THREE.Color('#a855f7'), // Intelligent lavender
      speaking: new THREE.Color('#06b6d4'), // Radiant cyan-blue
      happy: new THREE.Color('#10b981'), // Fresh emerald/mint
      confused: new THREE.Color('#f59e0b'), // Warm inquisitive amber
    }),
    []
  );

  // Render loop animation with smooth delta damping
  useFrame((sceneState, delta) => {
    const time = sceneState.clock.getElapsedTime();
    const effectiveDelta = Math.min(delta, 0.1);
    const targetColor = stateColors[state] || stateColors.idle;

    // 1. Color and Emissive Intensity Updates
    if (eyeMaterialRef.current) {
      eyeMaterialRef.current.color.lerp(targetColor, effectiveDelta * 6);
      eyeMaterialRef.current.emissive.lerp(targetColor, effectiveDelta * 6);
      eyeMaterialRef.current.emissiveIntensity =
        state === 'thinking' || state === 'speaking' ? 3.0 : 2.5;
    }

    if (rightEyeMaterialRef.current) {
      rightEyeMaterialRef.current.color.lerp(targetColor, effectiveDelta * 6);
      rightEyeMaterialRef.current.emissive.lerp(targetColor, effectiveDelta * 6);
      rightEyeMaterialRef.current.emissiveIntensity =
        state === 'thinking' || state === 'speaking' ? 3.0 : 2.5;
    }

    if (eyebrowMaterialRef.current) {
      eyebrowMaterialRef.current.color.lerp(targetColor, effectiveDelta * 6);
      eyebrowMaterialRef.current.emissive.lerp(targetColor, effectiveDelta * 6);
    }

    if (mouthMaterialRef.current) {
      mouthMaterialRef.current.color.lerp(targetColor, effectiveDelta * 6);
      mouthMaterialRef.current.emissive.lerp(targetColor, effectiveDelta * 6);
    }

    if (chestCoreMaterialRef.current) {
      chestCoreMaterialRef.current.color.lerp(targetColor, effectiveDelta * 6);
      chestCoreMaterialRef.current.emissive.lerp(targetColor, effectiveDelta * 6);
      const pulseSpeed = state === 'thinking' ? 6.0 : 2.8;
      chestCoreMaterialRef.current.emissiveIntensity =
        2.0 + Math.sin(time * pulseSpeed) * 0.8;
    }

    // 1b. Chest Screen Animated Interface Bars
    if (chestBar1Ref.current) {
      chestBar1Ref.current.scale.x = 0.85 + Math.sin(time * 6.5) * 0.25;
    }
    if (chestBar2Ref.current) {
      chestBar2Ref.current.scale.x = 0.70 + Math.sin(time * 8.0 + 1.2) * 0.30;
    }
    if (chestBar3Ref.current) {
      chestBar3Ref.current.scale.x = 0.60 + Math.sin(time * 5.0 + 2.5) * 0.35;
    }

    // Normalized Cursor Pointer (prefer global window mouse if active, else scene pointer)
    const pointerX = globalMouseRef.current.active
      ? globalMouseRef.current.x
      : (sceneState.pointer ? THREE.MathUtils.clamp(sceneState.pointer.x, -1, 1) : 0);
    const pointerY = globalMouseRef.current.active
      ? globalMouseRef.current.y
      : (sceneState.pointer ? THREE.MathUtils.clamp(sceneState.pointer.y, -1, 1) : 0);

    // 2. Eye Blinking Logic
    blinkTimerRef.current += effectiveDelta;
    if (!isBlinkingRef.current && blinkTimerRef.current > 3.2 + Math.sin(time * 0.5) * 1.5) {
      isBlinkingRef.current = true;
      blinkTimerRef.current = 0;
    }

    let eyeScaleY = 1.0;
    if (isBlinkingRef.current) {
      if (blinkTimerRef.current < 0.1) {
        eyeScaleY = Math.max(0.08, 1 - (blinkTimerRef.current / 0.1) * 0.92);
      } else if (blinkTimerRef.current < 0.22) {
        eyeScaleY = 0.08 + ((blinkTimerRef.current - 0.1) / 0.12) * 0.92;
      } else {
        isBlinkingRef.current = false;
        blinkTimerRef.current = 0;
      }
    }

    // Eye pupil follow cursor
    const eyeFollowX = pointerX * 0.035;
    const eyeFollowY = pointerY * 0.025;

    if (leftEyeGroupRef.current && rightEyeGroupRef.current) {
      if (state === 'happy') {
        // Cheerful crescent eyes
        leftEyeGroupRef.current.scale.y = THREE.MathUtils.lerp(
          leftEyeGroupRef.current.scale.y,
          0.38,
          effectiveDelta * 10
        );
        rightEyeGroupRef.current.scale.y = THREE.MathUtils.lerp(
          rightEyeGroupRef.current.scale.y,
          0.38,
          effectiveDelta * 10
        );
      } else if (state === 'confused') {
        // Slightly asymmetrical inquisitive expression
        leftEyeGroupRef.current.scale.y = THREE.MathUtils.lerp(
          leftEyeGroupRef.current.scale.y,
          1.15,
          effectiveDelta * 10
        );
        rightEyeGroupRef.current.scale.y = THREE.MathUtils.lerp(
          rightEyeGroupRef.current.scale.y,
          0.85,
          effectiveDelta * 10
        );
      } else if (state === 'listening') {
        // Wide alert pupils
        leftEyeGroupRef.current.scale.y = THREE.MathUtils.lerp(
          leftEyeGroupRef.current.scale.y,
          1.12,
          effectiveDelta * 10
        );
        rightEyeGroupRef.current.scale.y = THREE.MathUtils.lerp(
          rightEyeGroupRef.current.scale.y,
          1.12,
          effectiveDelta * 10
        );
      } else {
        leftEyeGroupRef.current.scale.y = THREE.MathUtils.lerp(
          leftEyeGroupRef.current.scale.y,
          eyeScaleY,
          effectiveDelta * 18
        );
        rightEyeGroupRef.current.scale.y = THREE.MathUtils.lerp(
          rightEyeGroupRef.current.scale.y,
          eyeScaleY,
          effectiveDelta * 18
        );
      }

      // Eye pupil position follows cursor smoothly
      if (state === 'thinking') {
        const eyeShift = Math.sin(time * 3.5) * 0.02;
        leftEyeGroupRef.current.position.x = -0.17 + eyeShift;
        rightEyeGroupRef.current.position.x = 0.17 + eyeShift;
      } else {
        leftEyeGroupRef.current.position.x = THREE.MathUtils.lerp(
          leftEyeGroupRef.current.position.x,
          -0.17 + eyeFollowX,
          effectiveDelta * 8
        );
        leftEyeGroupRef.current.position.y = THREE.MathUtils.lerp(
          leftEyeGroupRef.current.position.y,
          0.03 + eyeFollowY,
          effectiveDelta * 8
        );
        rightEyeGroupRef.current.position.x = THREE.MathUtils.lerp(
          rightEyeGroupRef.current.position.x,
          0.17 + eyeFollowX,
          effectiveDelta * 8
        );
        rightEyeGroupRef.current.position.y = THREE.MathUtils.lerp(
          rightEyeGroupRef.current.position.y,
          0.03 + eyeFollowY,
          effectiveDelta * 8
        );
      }
    }

    // 3. Eyebrow Emotional Expressions
    if (leftEyebrowRef.current && rightEyebrowRef.current) {
      let lAngle = 0;
      let rAngle = 0;
      let lPosY = 0.16;
      let rPosY = 0.16;

      if (state === 'confused') {
        lAngle = 0.24; // One raised high
        rAngle = -0.20; // One furrowed down
        lPosY = 0.19;
        rPosY = 0.14;
      } else if (state === 'listening') {
        lAngle = 0.08;
        rAngle = -0.08;
        lPosY = 0.17;
        rPosY = 0.17;
      } else if (state === 'thinking') {
        lAngle = -0.14;
        rAngle = 0.14;
        lPosY = 0.15;
        rPosY = 0.15;
      } else if (state === 'happy') {
        lAngle = 0.12;
        rAngle = -0.12;
        lPosY = 0.18;
        rPosY = 0.18;
      }

      leftEyebrowRef.current.rotation.z = THREE.MathUtils.lerp(
        leftEyebrowRef.current.rotation.z,
        lAngle,
        effectiveDelta * 8
      );
      rightEyebrowRef.current.rotation.z = THREE.MathUtils.lerp(
        rightEyebrowRef.current.rotation.z,
        rAngle,
        effectiveDelta * 8
      );
      leftEyebrowRef.current.position.y = THREE.MathUtils.lerp(
        leftEyebrowRef.current.position.y,
        lPosY,
        effectiveDelta * 8
      );
      rightEyebrowRef.current.position.y = THREE.MathUtils.lerp(
        rightEyebrowRef.current.position.y,
        rPosY,
        effectiveDelta * 8
      );
    }

    // 4. Mouth Emotional & Speech Animation
    if (mouthRef.current) {
      let targetRotZ = Math.PI * 1.08;
      let scaleX = 1.0;
      let scaleY = 0.85;

      if (state === 'speaking') {
        scaleX = 1.05 + Math.sin(time * 16) * 0.3;
        scaleY = 0.75 + Math.sin(time * 18) * 0.45;
      } else if (state === 'happy') {
        scaleX = 1.35;
        scaleY = 1.25;
      } else if (state === 'confused') {
        scaleX = 0.72;
        scaleY = 0.55;
        targetRotZ = Math.PI * 1.08 - 0.2;
      } else if (state === 'thinking') {
        scaleX = 0.8;
        scaleY = 0.6;
      }

      mouthRef.current.scale.x = THREE.MathUtils.lerp(mouthRef.current.scale.x, scaleX, effectiveDelta * 10);
      mouthRef.current.scale.y = THREE.MathUtils.lerp(mouthRef.current.scale.y, scaleY, effectiveDelta * 10);
      mouthRef.current.rotation.z = THREE.MathUtils.lerp(mouthRef.current.rotation.z, targetRotZ, effectiveDelta * 8);
    }

    // 5. Head Motion, Cursor Proximity Tracking & Emotional Poses
    if (headGroupRef.current) {
      let targetRotX = 0;
      let targetRotY = 0;
      let targetRotZ = 0;

      if (!isReducedMotion) {
        // Natural gentle idle drift combined with responsive cursor follow
        targetRotY = Math.sin(time * 0.8) * 0.04 + pointerX * 0.45;
        targetRotX = Math.sin(time * 1.2) * 0.03 - pointerY * 0.28;
        targetRotZ = pointerX * 0.08;
      }

      if (state === 'listening') {
        targetRotX += 0.14; // Attentive tilt forward
        targetRotZ += 0.05;
      } else if (state === 'thinking') {
        targetRotZ += -0.16; // Curious tilt sideways
        targetRotX += -0.05;
      } else if (state === 'confused') {
        targetRotZ += 0.20; // Puzzled tilt
        targetRotX += 0.07;
      } else if (state === 'happy') {
        targetRotX += Math.sin(time * 6) * 0.05;
        targetRotY += Math.sin(time * 4) * 0.1;
      } else if (state === 'speaking') {
        targetRotX += Math.sin(time * 5) * 0.07;
      }

      headGroupRef.current.rotation.x = THREE.MathUtils.lerp(
        headGroupRef.current.rotation.x,
        targetRotX,
        effectiveDelta * 5
      );
      headGroupRef.current.rotation.y = THREE.MathUtils.lerp(
        headGroupRef.current.rotation.y,
        targetRotY,
        effectiveDelta * 5
      );
      headGroupRef.current.rotation.z = THREE.MathUtils.lerp(
        headGroupRef.current.rotation.z,
        targetRotZ,
        effectiveDelta * 5
      );
    }

    // Friendly click reaction update
    if (clickReactionTimerRef.current > 0) {
      clickReactionTimerRef.current = Math.max(0, clickReactionTimerRef.current - effectiveDelta);
    }

    // 6. Root Floating Motion & Shadow with Subtle Body Tilt
    if (rootGroupRef.current) {
      let floatY = 0;
      if (!isReducedMotion) {
        if (state === 'happy' || clickReactionTimerRef.current > 0) {
          floatY = Math.abs(Math.sin(time * 5)) * 0.07;
          if (clickReactionTimerRef.current > 0) {
            floatY += Math.sin((2.4 - clickReactionTimerRef.current) * 8) * 0.04;
          }
        } else {
          floatY = Math.sin(time * 1.8) * 0.035;
        }
      }
      rootGroupRef.current.position.y = THREE.MathUtils.lerp(
        rootGroupRef.current.position.y,
        floatY,
        effectiveDelta * 5
      );

      // Subtle body turn and tilt toward cursor
      if (!isReducedMotion) {
        rootGroupRef.current.rotation.y = THREE.MathUtils.lerp(
          rootGroupRef.current.rotation.y,
          pointerX * 0.16,
          effectiveDelta * 4
        );
        rootGroupRef.current.rotation.z = THREE.MathUtils.lerp(
          rootGroupRef.current.rotation.z,
          -pointerX * 0.05,
          effectiveDelta * 4
        );
      }

      if (floorShadowRef.current) {
        const shadowScale = 1 - floatY * 1.4;
        floorShadowRef.current.scale.set(shadowScale, shadowScale, shadowScale);
      }
    }

    // 7. Right Arm & Occasional Hand Waving Gesture
    waveCycleTimerRef.current += effectiveDelta;
    // Friendly hand wave occurs periodically every 8.5s for 2.6s, or when happy/speaking/clicked
    const isWavingPeriodic = (waveCycleTimerRef.current % 8.5) < 2.6;
    const isWaving =
      isWavingPeriodic ||
      state === 'happy' ||
      state === 'speaking' ||
      clickReactionTimerRef.current > 0;

    if (rightArmGroupRef.current && rightForearmRef.current) {
      let shoulderRotZ = -0.28;
      let forearmWaveZ = 0.05;
      let forearmRotX = 0.25;

      if (!isReducedMotion) {
        if (isWaving) {
          shoulderRotZ = -0.52;
          forearmRotX = 0.75;
          forearmWaveZ = Math.sin(time * 6.5) * 0.32;
        } else if (state === 'thinking') {
          shoulderRotZ = -0.18;
          forearmRotX = 0.60;
          forearmWaveZ = 0.22;
        } else if (state === 'listening') {
          forearmRotX = 0.45;
          forearmWaveZ = 0.08;
        } else {
          forearmRotX = 0.25 + Math.sin(time * 1.2) * 0.04;
        }
      }

      rightArmGroupRef.current.rotation.z = THREE.MathUtils.lerp(
        rightArmGroupRef.current.rotation.z,
        shoulderRotZ,
        effectiveDelta * 5
      );

      rightForearmRef.current.rotation.z = THREE.MathUtils.lerp(
        rightForearmRef.current.rotation.z,
        forearmWaveZ,
        effectiveDelta * 6
      );
      rightForearmRef.current.rotation.x = THREE.MathUtils.lerp(
        rightForearmRef.current.rotation.x,
        forearmRotX,
        effectiveDelta * 6
      );
    }

    // 8. Left Arm Resting Pose
    if (leftArmGroupRef.current && leftForearmRef.current) {
      let leftShoulderZ = 0.22;
      let leftForearmX = 0.12;

      if (state === 'happy') {
        leftShoulderZ = 0.38;
        leftForearmX = 0.28 + Math.sin(time * 4) * 0.08;
      } else if (state === 'confused') {
        leftShoulderZ = 0.44; // Subtle shrug
        leftForearmX = 0.32;
      }

      leftArmGroupRef.current.rotation.z = THREE.MathUtils.lerp(
        leftArmGroupRef.current.rotation.z,
        leftShoulderZ,
        effectiveDelta * 5
      );
      leftForearmRef.current.rotation.x = THREE.MathUtils.lerp(
        leftForearmRef.current.rotation.x,
        leftForearmX,
        effectiveDelta * 5
      );
    }
  });

  return (
    <group
      ref={rootGroupRef}
      position={[0, -0.02, 0]}
      onClick={(e) => {
        e.stopPropagation();
        clickReactionTimerRef.current = 2.4;
      }}
      onPointerOver={() => {
        if (typeof document !== 'undefined') document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        if (typeof document !== 'undefined') document.body.style.cursor = 'default';
      }}
    >
      {/* Soft Ground Floor Shadow */}
      <mesh
        ref={floorShadowRef}
        position={[0, -0.74, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[0, 0.48, 32]} />
        <meshBasicMaterial
          color="#1e293b"
          transparent
          opacity={0.14}
          depthWrite={false}
        />
      </mesh>

      {/* ================================================================= */}
      {/* 1. TORSO & BODY (Porcelain White Shell with Glowing Core)         */}
      {/* ================================================================= */}
      <group position={[0, -0.28, 0]}>
        {/* White Rounded Torso Shell */}
        <mesh scale={[1.0, 1.05, 0.94]}>
          <sphereGeometry args={[0.34, 40, 36]} />
          <meshStandardMaterial
            color="#ffffff"
            roughness={0.15}
            metalness={0.06}
          />
        </mesh>

        {/* Mint / Turquoise Torso Accent Collar */}
        <mesh position={[0, 0.24, 0]}>
          <torusGeometry args={[0.19, 0.02, 16, 32]} />
          <meshStandardMaterial color="#06b6d4" roughness={0.25} />
        </mesh>

        {/* =============================================================== */}
        {/* VAATBOT CHEST MONITOR (Rectangular Cyan Screen with Data Lines) */}
        {/* =============================================================== */}
        <group position={[0, 0.035, 0.31]}>
          {/* Dark Bezel Screen Frame */}
          <RoundedBox args={[0.26, 0.16, 0.04]} radius={0.03} smoothness={8}>
            <meshStandardMaterial color="#0c1829" roughness={0.2} metalness={0.3} />
          </RoundedBox>

          {/* Luminous Cyan Display Surface */}
          <RoundedBox position={[0, 0, 0.016]} args={[0.22, 0.12, 0.02]} radius={0.02} smoothness={8}>
            <meshStandardMaterial
              ref={chestCoreMaterialRef}
              color="#00f0ff"
              emissive="#00f0ff"
              emissiveIntensity={2.4}
              roughness={0.1}
            />
          </RoundedBox>

          {/* Digital Interface Waveform Bars */}
          <group position={[0, 0, 0.030]}>
            <mesh ref={chestBar1Ref} position={[0, 0.022, 0]}>
              <boxGeometry args={[0.13, 0.014, 0.005]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
            <mesh ref={chestBar2Ref} position={[-0.012, 0.0, 0]}>
              <boxGeometry args={[0.10, 0.014, 0.005]} />
              <meshBasicMaterial color="#ffffff" opacity={0.9} transparent />
            </mesh>
            <mesh ref={chestBar3Ref} position={[0.016, -0.022, 0]}>
              <boxGeometry args={[0.08, 0.014, 0.005]} />
              <meshBasicMaterial color="#ffffff" opacity={0.8} transparent />
            </mesh>
          </group>
        </group>

        {/* =============================================================== */}
        {/* SHORT CUTE LEGS & ROUNDED FEET (Grounded, Proportional)        */}
        {/* =============================================================== */}
        {/* Left Leg */}
        <group position={[-0.13, -0.24, 0]}>
          <mesh position={[0, -0.06, 0]}>
            <capsuleGeometry args={[0.055, 0.10, 12, 16]} />
            <meshStandardMaterial color="#ffffff" roughness={0.18} />
          </mesh>
          <mesh position={[0, -0.12, 0]}>
            <torusGeometry args={[0.056, 0.01, 12, 24]} />
            <meshStandardMaterial color="#06b6d4" roughness={0.25} />
          </mesh>
          <mesh position={[0, -0.15, 0.04]} scale={[1.0, 0.65, 1.3]}>
            <sphereGeometry args={[0.08, 20, 20]} />
            <meshStandardMaterial color="#ffffff" roughness={0.18} />
          </mesh>
        </group>

        {/* Right Leg */}
        <group position={[0.13, -0.24, 0]}>
          <mesh position={[0, -0.06, 0]}>
            <capsuleGeometry args={[0.055, 0.10, 12, 16]} />
            <meshStandardMaterial color="#ffffff" roughness={0.18} />
          </mesh>
          <mesh position={[0, -0.12, 0]}>
            <torusGeometry args={[0.056, 0.01, 12, 24]} />
            <meshStandardMaterial color="#06b6d4" roughness={0.25} />
          </mesh>
          <mesh position={[0, -0.15, 0.04]} scale={[1.0, 0.65, 1.3]}>
            <sphereGeometry args={[0.08, 20, 20]} />
            <meshStandardMaterial color="#ffffff" roughness={0.18} />
          </mesh>
        </group>

        {/* =============================================================== */}
        {/* 2. ARTICULATED HIERARCHICAL ARMS & HANDS (Seamless Joints)      */}
        {/* =============================================================== */}

        {/* RIGHT ARM (Welcoming Wave Gesture) */}
        <group position={[0.28, 0.06, 0.02]} ref={rightArmGroupRef}>
          {/* Shoulder Joint Ball nestled directly in torso side */}
          <mesh>
            <sphereGeometry args={[0.08, 20, 20]} />
            <meshStandardMaterial color="#ffffff" roughness={0.18} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.082, 0.012, 12, 24]} />
            <meshStandardMaterial color="#06b6d4" roughness={0.25} />
          </mesh>

          {/* Upper Arm Segment (Angled forward/up) */}
          <group position={[0.07, 0.06, 0.07]} rotation={[-0.4, 0.2, -0.35]}>
            <mesh>
              <capsuleGeometry args={[0.046, 0.12, 12, 16]} />
              <meshStandardMaterial color="#ffffff" roughness={0.18} />
            </mesh>

            {/* Elbow Joint (Child of Upper Arm) */}
            <group position={[0, 0.09, 0]}>
              <mesh>
                <sphereGeometry args={[0.052, 16, 16]} />
                <meshStandardMaterial color="#06b6d4" roughness={0.25} />
              </mesh>

              {/* Forearm & Hand Group (Child of Elbow) */}
              <group ref={rightForearmRef} position={[0, 0.08, 0.04]} rotation={[0.45, -0.2, 0]}>
                <mesh>
                  <capsuleGeometry args={[0.042, 0.11, 12, 16]} />
                  <meshStandardMaterial color="#ffffff" roughness={0.18} />
                </mesh>

                {/* Wrist Ring */}
                <mesh position={[0, 0.08, 0]}>
                  <torusGeometry args={[0.043, 0.01, 12, 24]} />
                  <meshStandardMaterial color="#06b6d4" roughness={0.25} />
                </mesh>

                {/* Cute Mitten Robotic Hand */}
                <group position={[0, 0.13, 0.02]} rotation={[0.1, -0.2, 0]}>
                  {/* Palm Mitten */}
                  <mesh scale={[1.15, 1.25, 0.7]}>
                    <sphereGeometry args={[0.065, 20, 20]} />
                    <meshStandardMaterial color="#ffffff" roughness={0.18} />
                  </mesh>

                  {/* Cyan Palm Inset */}
                  <mesh position={[0, 0, 0.036]}>
                    <sphereGeometry args={[0.03, 12, 12]} />
                    <meshStandardMaterial color="#06b6d4" roughness={0.3} />
                  </mesh>

                  {/* Mitten Thumb */}
                  <mesh position={[-0.042, -0.01, 0.015]} rotation={[0.2, 0.1, 0.6]}>
                    <capsuleGeometry args={[0.016, 0.04, 8, 12]} />
                    <meshStandardMaterial color="#ffffff" roughness={0.18} />
                  </mesh>

                  {/* Mitten Curved Fingers */}
                  <mesh position={[0.02, 0.045, 0.015]} rotation={[-0.2, 0, 0]}>
                    <capsuleGeometry args={[0.025, 0.05, 8, 12]} />
                    <meshStandardMaterial color="#ffffff" roughness={0.18} />
                  </mesh>
                </group>
              </group>
            </group>
          </group>
        </group>

        {/* LEFT ARM (Natural Resting Pose) */}
        <group position={[-0.28, 0.06, 0.02]} ref={leftArmGroupRef}>
          {/* Shoulder Joint Ball nestled directly in torso side */}
          <mesh>
            <sphereGeometry args={[0.08, 20, 20]} />
            <meshStandardMaterial color="#ffffff" roughness={0.18} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.082, 0.012, 12, 24]} />
            <meshStandardMaterial color="#06b6d4" roughness={0.25} />
          </mesh>

          {/* Upper Arm Segment (Child of Shoulder) */}
          <group position={[-0.06, -0.08, 0.02]} rotation={[0.1, 0, 0.2]}>
            <mesh>
              <capsuleGeometry args={[0.046, 0.12, 12, 16]} />
              <meshStandardMaterial color="#ffffff" roughness={0.18} />
            </mesh>

            {/* Elbow Joint (Child of Upper Arm) */}
            <group position={[0, -0.09, 0]}>
              <mesh>
                <sphereGeometry args={[0.052, 16, 16]} />
                <meshStandardMaterial color="#06b6d4" roughness={0.25} />
              </mesh>

              {/* Forearm & Hand Group (Child of Elbow) */}
              <group ref={leftForearmRef} position={[0, -0.08, 0.03]} rotation={[0.1, 0, 0.1]}>
                <mesh>
                  <capsuleGeometry args={[0.042, 0.11, 12, 16]} />
                  <meshStandardMaterial color="#ffffff" roughness={0.18} />
                </mesh>

                {/* Wrist Ring */}
                <mesh position={[0, -0.08, 0]}>
                  <torusGeometry args={[0.043, 0.01, 12, 24]} />
                  <meshStandardMaterial color="#06b6d4" roughness={0.25} />
                </mesh>

                {/* Left Cute Mitten Hand */}
                <mesh position={[0, -0.13, 0.02]}>
                  <sphereGeometry args={[0.065, 18, 18]} />
                  <meshStandardMaterial color="#ffffff" roughness={0.18} />
                </mesh>
              </group>
            </group>
          </group>
        </group>
      </group>

      {/* ================================================================= */}
      {/* 3. HEAD & HELMET (Chibi Proportions: 48% Total Height)            */}
      {/* ================================================================= */}
      <group ref={headGroupRef} position={[0, 0.35, 0]}>
        {/* Porcelain Pearl-White Outer Helmet Shell */}
        <mesh scale={[1.08, 0.98, 0.96]}>
          <sphereGeometry args={[0.50, 48, 44]} />
          <meshStandardMaterial
            color="#ffffff"
            roughness={0.14}
            metalness={0.06}
          />
        </mesh>

        {/* Top Helmet Crest Fin (Mint / Turquoise Accent) */}
        <group position={[0, 0.48, -0.02]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.035, 0.05, 0.42, 24]} />
            <meshStandardMaterial
              color="#06b6d4"
              roughness={0.2}
              metalness={0.1}
            />
          </mesh>

          {/* Cute Tiny Top Antenna with Glowing Emerald Sphere */}
          <mesh position={[0, 0.06, 0.02]}>
            <cylinderGeometry args={[0.012, 0.012, 0.10, 16]} />
            <meshStandardMaterial color="#06b6d4" roughness={0.2} />
          </mesh>
          <mesh position={[0, 0.12, 0.02]}>
            <sphereGeometry args={[0.042, 20, 20]} />
            <meshStandardMaterial
              color="#38bfa7"
              emissive="#38bfa7"
              emissiveIntensity={1.0}
            />
          </mesh>
        </group>

        {/* Rounded Cyan Ear Modules / Headphones (Left and Right) */}
        {/* Left Ear Module */}
        <group position={[-0.52, 0.0, -0.02]} rotation={[0, 0, Math.PI / 2]}>
          <mesh>
            <cylinderGeometry args={[0.16, 0.16, 0.08, 32]} />
            <meshStandardMaterial color="#0891b2" roughness={0.22} />
          </mesh>
          <mesh position={[0, 0.042, 0]}>
            <torusGeometry args={[0.11, 0.014, 12, 28]} />
            <meshStandardMaterial color="#ffffff" roughness={0.18} />
          </mesh>
          <mesh position={[0, 0.045, 0]}>
            <sphereGeometry args={[0.045, 16, 16]} />
            <meshStandardMaterial color="#06b6d4" roughness={0.2} />
          </mesh>
        </group>

        {/* Right Ear Module */}
        <group position={[0.52, 0.0, -0.02]} rotation={[0, 0, Math.PI / 2]}>
          <mesh>
            <cylinderGeometry args={[0.16, 0.16, 0.08, 32]} />
            <meshStandardMaterial color="#0891b2" roughness={0.22} />
          </mesh>
          <mesh position={[0, -0.042, 0]}>
            <torusGeometry args={[0.11, 0.014, 12, 28]} />
            <meshStandardMaterial color="#ffffff" roughness={0.18} />
          </mesh>
          <mesh position={[0, -0.045, 0]}>
            <sphereGeometry args={[0.045, 16, 16]} />
            <meshStandardMaterial color="#06b6d4" roughness={0.2} />
          </mesh>
        </group>

        {/* =============================================================== */}
        {/* 4. VISOR: SYMMETRICAL PROUD BLACK GLOSSY GLASS FACE DISPLAY     */}
        {/* Positioned at Z=0.44 with front at Z=0.53, clearing helmet Z=0.48*/}
        {/* =============================================================== */}
        <group position={[0, -0.02, 0.44]}>
          {/* Subtle Outer Frame Bezel */}
          <RoundedBox
            args={[0.76, 0.50, 0.16]}
            radius={0.14}
            smoothness={8}
          >
            <meshStandardMaterial
              color="#091427"
              roughness={0.18}
              metalness={0.25}
            />
          </RoundedBox>

          {/* Symmetrical Midnight-Black Glossy Glass Visor Face */}
          <RoundedBox
            position={[0, 0, 0.012]}
            args={[0.73, 0.47, 0.16]}
            radius={0.13}
            smoothness={8}
          >
            <meshStandardMaterial
              color="#020409"
              roughness={0.08}
              metalness={0.35}
            />
          </RoundedBox>

          {/* ============================================================= */}
          {/* 5. EMOTIVE FACIAL FEATURES ON THE VISOR SURFACE (Z = 0.096)   */}
          {/* ============================================================= */}

          {/* Left Glowing Cyan Eye with Dark Pupil & Double Catchlights */}
          <group ref={leftEyeGroupRef} position={[-0.17, 0.03, 0.096]}>
            {/* Luminous Cyan Eye Capsule */}
            <mesh scale={[1.15, 1.38, 0.2]}>
              <sphereGeometry args={[0.082, 32, 32]} />
              <meshStandardMaterial
                ref={eyeMaterialRef}
                color="#00f0ff"
                emissive="#00f0ff"
                emissiveIntensity={2.5}
                roughness={0.08}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={-2}
                polygonOffsetUnits={-2}
              />
            </mesh>

            {/* Dark Inner Pupil Core */}
            <mesh position={[0, 0, 0.016]} scale={[1.0, 1.25, 0.1]}>
              <sphereGeometry args={[0.058, 24, 24]} />
              <meshBasicMaterial color="#062238" depthWrite={false} />
            </mesh>

            {/* Primary Catchlight Dot (Upper Right) */}
            <mesh position={[0.024, 0.034, 0.032]}>
              <sphereGeometry args={[0.026, 16, 16]} />
              <meshBasicMaterial color="#ffffff" depthWrite={false} />
            </mesh>

            {/* Secondary Catchlight Dot (Lower Left) */}
            <mesh position={[-0.020, -0.024, 0.032]}>
              <sphereGeometry args={[0.014, 12, 12]} />
              <meshBasicMaterial color="#ffffff" opacity={0.85} transparent depthWrite={false} />
            </mesh>
          </group>

          {/* Right Glowing Cyan Eye with Dark Pupil & Double Catchlights */}
          <group ref={rightEyeGroupRef} position={[0.17, 0.03, 0.096]}>
            {/* Luminous Cyan Eye Capsule */}
            <mesh scale={[1.15, 1.38, 0.2]}>
              <sphereGeometry args={[0.082, 32, 32]} />
              <meshStandardMaterial
                ref={rightEyeMaterialRef}
                color="#00f0ff"
                emissive="#00f0ff"
                emissiveIntensity={2.5}
                roughness={0.08}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={-2}
                polygonOffsetUnits={-2}
              />
            </mesh>

            {/* Dark Inner Pupil Core */}
            <mesh position={[0, 0, 0.016]} scale={[1.0, 1.25, 0.1]}>
              <sphereGeometry args={[0.058, 24, 24]} />
              <meshBasicMaterial color="#062238" depthWrite={false} />
            </mesh>

            {/* Primary Catchlight Dot (Upper Right) */}
            <mesh position={[0.024, 0.034, 0.032]}>
              <sphereGeometry args={[0.026, 16, 16]} />
              <meshBasicMaterial color="#ffffff" depthWrite={false} />
            </mesh>

            {/* Secondary Catchlight Dot (Lower Left) */}
            <mesh position={[-0.020, -0.024, 0.032]}>
              <sphereGeometry args={[0.014, 12, 12]} />
              <meshBasicMaterial color="#ffffff" opacity={0.85} transparent depthWrite={false} />
            </mesh>
          </group>

          {/* Expressive Glowing Eyebrows */}
          <group ref={leftEyebrowRef} position={[-0.17, 0.16, 0.096]} rotation={[0, 0, 0.04]}>
            <mesh>
              <torusGeometry args={[0.052, 0.012, 16, 24, Math.PI * 0.7]} />
              <meshStandardMaterial
                ref={eyebrowMaterialRef}
                color="#00f0ff"
                emissive="#00f0ff"
                emissiveIntensity={2.4}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={-2}
                polygonOffsetUnits={-2}
              />
            </mesh>
          </group>

          <group ref={rightEyebrowRef} position={[0.17, 0.16, 0.096]} rotation={[0, 0, -0.04]}>
            <mesh>
              <torusGeometry args={[0.052, 0.012, 16, 24, Math.PI * 0.7]} />
              <meshStandardMaterial
                ref={eyebrowMaterialRef}
                color="#00f0ff"
                emissive="#00f0ff"
                emissiveIntensity={2.4}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={-2}
                polygonOffsetUnits={-2}
              />
            </mesh>
          </group>

          {/* Cheerful Curved Glowing Cyan Smile */}
          <group ref={mouthRef} position={[0, -0.09, 0.096]} rotation={[0, 0, Math.PI * 1.08]}>
            <mesh>
              <torusGeometry args={[0.065, 0.014, 16, 32, Math.PI * 0.85]} />
              <meshStandardMaterial
                ref={mouthMaterialRef}
                color="#00f0ff"
                emissive="#00f0ff"
                emissiveIntensity={2.4}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={-2}
                polygonOffsetUnits={-2}
              />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
};
