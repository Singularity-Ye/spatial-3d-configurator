import React, { useState, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useHandTracking } from '../../utils/useHandTracking';

const FINGER_CONNECTIONS = {
  thumb: [0, 1, 2, 3, 4],
  index: [0, 5, 6, 7, 8],
  middle: [0, 9, 10, 11, 12],
  ring: [0, 13, 14, 15, 16],
  pinky: [0, 17, 18, 19, 20],
  palm: [5, 9, 13, 17, 0]
};

function SingleHandHologram({ handLandmarks, isPinching }) {
  const [smoothedPoints, setSmoothedPoints] = useState([]);
  const smoothedRef = useRef([]);

  // Map raw landmarks to target THREE.Vector3 coordinates in the 3D space
  const targets = useMemo(() => {
    if (!handLandmarks || handLandmarks.length < 21) return [];

    const scaleX = 3.6;
    const scaleY = 2.6;
    const scaleZ = 4.0;

    const list = [];
    for (let i = 0; i < 21; i++) {
      const lm = handLandmarks[i];
      if (!lm || isNaN(lm.x) || isNaN(lm.y) || isNaN(lm.z)) {
        return [];
      }
      const x = (1 - lm.x * 2) * scaleX;
      const y = (1 - lm.y * 2) * scaleY;
      const z = -lm.z * scaleZ + 1.2; // Push forward slightly in front of center
      list.push(new THREE.Vector3(x, y, z));
    }
    return list;
  }, [handLandmarks]);

  // Interpolate joint positions smoothly using LERP
  useFrame((state, delta) => {
    if (targets.length < 21) {
      if (smoothedRef.current.length > 0) {
        smoothedRef.current = [];
        setSmoothedPoints([]);
      }
      return;
    }

    if (smoothedRef.current.length === 0) {
      smoothedRef.current = targets.map(t => t.clone());
      setSmoothedPoints(smoothedRef.current);
      return;
    }

    const factor = 1 - Math.exp(-22 * Math.min(delta, 0.1));
    let changed = false;
    
    const nextPoints = smoothedRef.current.map((pt, idx) => {
      const target = targets[idx];
      if (!target) return pt;

      const nextPt = pt.clone().lerp(target, factor);
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

  if (smoothedPoints.length < 21) return null;

  // Render finger lines and joint spheres
  // Replaced Drei <Line> with native <line> to avoid LineMaterial shader errors causing WebGL context loss
  const fingerLines = Object.entries(FINGER_CONNECTIONS).map(([fingerName, indices]) => {
    const points = indices.map(idx => smoothedPoints[idx]);
    const lineColor = isPinching ? '#10b981' : '#00f0ff';
    
    // Flatten Vector3 points to Float32Array
    const vertexArray = new Float32Array(points.flatMap(p => [p.x, p.y, p.z]));

    return (
      <line key={fingerName}>
        <bufferGeometry attach="geometry">
          <bufferAttribute
            attach="attributes-position"
            count={points.length}
            array={vertexArray}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial
          attach="material"
          color={lineColor}
          transparent
          opacity={0.82}
          blending={THREE.AdditiveBlending}
          depthTest={false}
        />
      </line>
    );
  });

  return (
    <group>
      {/* 1. Finger connection lines */}
      {fingerLines}

      {/* 2. Joint points */}
      {smoothedPoints.map((pt, idx) => {
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

export default function HandHologram() {
  const { handDetected, landmarks, isPinching } = useHandTracking();

  if (!handDetected || !landmarks || landmarks.length === 0) return null;

  // Handle both single hand arrays and nested multi-hand arrays
  const handsArray = Array.isArray(landmarks[0]) ? landmarks : [landmarks];

  return (
    <group>
      {handsArray.map((handLandmarks, idx) => (
        <SingleHandHologram
          key={idx}
          handLandmarks={handLandmarks}
          isPinching={idx === 0 ? isPinching : false} // Only apply pinch highlight to the primary hand
        />
      ))}
    </group>
  );
}
