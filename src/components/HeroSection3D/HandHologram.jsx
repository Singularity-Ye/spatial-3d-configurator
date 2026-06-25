import React, { useState, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useHandTracking } from '../../utils/useHandTracking';

// Define the indices for joints in each finger
const FINGER_CONNECTIONS = {
  thumb: [0, 1, 2, 3, 4],
  index: [0, 5, 6, 7, 8],
  middle: [0, 9, 10, 11, 12],
  ring: [0, 13, 14, 15, 16],
  pinky: [0, 17, 18, 19, 20],
  palm: [5, 9, 13, 17, 0] // Connect base knuckles and back to wrist
};

export default function HandHologram() {
  const { handDetected, landmarks, isPinching } = useHandTracking();
  const [smoothedPoints, setSmoothedPoints] = useState([]);
  const smoothedRef = useRef([]);
  const velocitiesRef = useRef(Array.from({ length: 21 }, () => new THREE.Vector3()));

  // Map raw landmarks to target THREE.Vector3 coordinates in the 3D space
  const targets = useMemo(() => {
    if (!landmarks || landmarks.length < 21) return [];

    // Scale factors to stretch the hand to match screen space bounds
    const scaleX = 3.6;
    const scaleY = 2.6;
    const scaleZ = 4.0;

    return landmarks.map((lm) => {
      // Mirror X so it follows the user's hand correctly
      const x = (1 - lm.x * 2) * scaleX;
      const y = (1 - lm.y * 2) * scaleY;
      const z = -lm.z * scaleZ + 1.2; // Push forward slightly in front of center (Z=0)
      return new THREE.Vector3(x, y, z);
    });
  }, [landmarks]);

  // Interpolate joint positions at the monitor's native frame rate (60Hz/120Hz/144Hz) using spring physics
  useFrame((state, delta) => {
    if (!handDetected || targets.length < 21) {
      if (smoothedRef.current.length > 0) {
        smoothedRef.current = [];
        velocitiesRef.current = Array.from({ length: 21 }, () => new THREE.Vector3());
        setSmoothedPoints([]);
      }
      return;
    }

    // Initialize with targets directly if first detection to prevent flying-in from origin
    if (smoothedRef.current.length === 0) {
      smoothedRef.current = targets.map(t => t.clone());
      velocitiesRef.current = Array.from({ length: 21 }, () => new THREE.Vector3());
      setSmoothedPoints(smoothedRef.current);
      return;
    }

    const dt = Math.min(delta, 0.1); // Clamp to prevent explosions
    const stiffness = 150; // Softer spring to absorb high-frequency camera coordinate noise
    const damping = 24;    // High damping to make hand joints follow smoothly without shivering

    // Perform smooth spring dampening for each joint
    let changed = false;
    const nextPoints = smoothedRef.current.map((pt, idx) => {
      const target = targets[idx];
      if (!target) return pt;

      const vel = velocitiesRef.current[idx];

      // Hooke's Law with damping: Acceleration = -k * displacement - c * velocity
      const forceX = -stiffness * (pt.x - target.x) - damping * vel.x;
      const forceY = -stiffness * (pt.y - target.y) - damping * vel.y;
      const forceZ = -stiffness * (pt.z - target.z) - damping * vel.z;

      vel.x += forceX * dt;
      vel.y += forceY * dt;
      vel.z += forceZ * dt;

      const nextPt = pt.clone();
      nextPt.x += vel.x * dt;
      nextPt.y += vel.y * dt;
      nextPt.z += vel.z * dt;

      // Only trigger state updates if displacement is noticeable to save CPU cycles
      if (pt.distanceToSquared(nextPt) > 0.00001) {
        changed = true;
      }
      return nextPt;
    });

    if (changed || smoothedPoints.length === 0) {
      smoothedRef.current = nextPoints;
      setSmoothedPoints(nextPoints);
    }
  });

  // If no hand is detected, or we don't have smoothed points, don't render the 3D hand skeleton
  if (!handDetected || smoothedPoints.length < 21) return null;

  // Render finger lines and joint spheres
  const fingerLines = Object.entries(FINGER_CONNECTIONS).map(([fingerName, indices]) => {
    const points = indices.map(idx => smoothedPoints[idx]);
    
    // Choose neon green for pinching state, cyan for normal tracking
    const lineColor = isPinching ? '#10b981' : '#00f0ff';

    return (
      <Line
        key={fingerName}
        points={points}
        color={lineColor}
        lineWidth={3.2}
        transparent
        opacity={0.82}
        blending={THREE.AdditiveBlending}
        depthTest={false}
      />
    );
  });

  return (
    <group>
      {/* 1. Finger connection lines */}
      {fingerLines}

      {/* 2. Joint points */}
      {smoothedPoints.map((pt, idx) => {
        // Highlight thumb tip (4) and index tip (8)
        const isTip = idx === 4 || idx === 8;
        const color = isTip 
          ? (isPinching ? '#ef4444' : '#ff7b54') 
          : '#00f0ff';
        const size = isTip ? 0.055 : 0.038;

        return (
          <mesh key={idx} position={pt} depthTest={false}>
            <sphereGeometry args={[size, 12, 12]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.9}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        );
      })}
    </group>
  );
}
