import React, { useRef, useMemo, useEffect } from 'react';
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

// Check if safe gesture test mode is enabled via URL search parameter
const isSafeMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('safeGesture') === '1';

// Pre-allocated static sphere geometries to prevent memory leaks and GC churn
const tipGeometry = new THREE.SphereGeometry(0.055, 12, 12);
const jointGeometry = new THREE.SphereGeometry(0.038, 12, 12);

function SingleHandHologram({ handLandmarks, isPinching, visible }) {
  const groupRef = useRef();
  const jointsRef = useRef([]);
  const linesRef = useRef({});
  const smoothedRef = useRef([]);

  // Pre-allocated line geometries computed once on mount
  const lineGeometries = useMemo(() => {
    const geos = {};
    Object.entries(FINGER_CONNECTIONS).forEach(([fingerName, indices]) => {
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(indices.length * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geos[fingerName] = geo;
    });
    return geos;
  }, []);

  // Dispose line geometries on unmount to prevent GPU resource leaks
  useEffect(() => {
    return () => {
      Object.values(lineGeometries).forEach(geo => geo.dispose());
    };
  }, [lineGeometries]);

  // Interpolate joint positions smoothly using LERP and update geometries/meshes directly
  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group) return;

    if (!visible || !handLandmarks || handLandmarks.length < 21) {
      group.visible = false;
      return;
    }

    group.visible = true;

    // Lock the group to the camera position and rotation to keep it screen-aligned
    const { camera, size } = state;
    group.position.copy(camera.position);
    group.quaternion.copy(camera.quaternion);

    // Place the hand skeleton at a fixed depth of 3.0 units in front of the camera
    const depth = 3.0;
    const tempDir = new THREE.Vector3(0, 0, -depth);
    tempDir.applyQuaternion(camera.quaternion);
    group.position.add(tempDir);

    // Calculate targets in camera local space
    const aspect = size.width / size.height;
    const localTargets = [];
    const tanFovHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    for (let i = 0; i < 21; i++) {
      const lm = handLandmarks[i];
      if (!lm || isNaN(lm.x) || isNaN(lm.y) || isNaN(lm.z)) {
        group.visible = false;
        return;
      }
      const z = -lm.z * 1.5; // Scale the z coordinate slightly to show depth
      const jointDepth = depth - z; // Actual depth of this joint from camera
      const halfHeightJoint = jointDepth * tanFovHalf;
      const halfWidthJoint = halfHeightJoint * aspect;

      const x = (1 - lm.x * 2) * halfWidthJoint;
      const y = (1 - lm.y * 2) * halfHeightJoint;
      localTargets.push(new THREE.Vector3(x, y, z));
    }

    if (smoothedRef.current.length === 0) {
      smoothedRef.current = localTargets.map(t => t.clone());
    } else {
      const factor = 1 - Math.exp(-22 * Math.min(delta, 0.1));
      smoothedRef.current = smoothedRef.current.map((pt, idx) => {
        const target = localTargets[idx];
        return target ? pt.clone().lerp(target, factor) : pt;
      });
    }

    const nextPoints = smoothedRef.current;

    // 1. Update joint positions and material colors in-place
    for (let i = 0; i < 21; i++) {
      // In safe mode, we only track and update index fingertip (joint index 8)
      if (isSafeMode && i !== 8) continue;

      const mesh = jointsRef.current[i];
      if (mesh) {
        mesh.position.copy(nextPoints[i]);
        const isTip = i === 4 || i === 8;
        const colorStr = isTip 
          ? (isPinching ? '#ef4444' : '#ff7b54') 
          : '#00f0ff';
        if (mesh.material) {
          mesh.material.color.set(colorStr);
        }
      }
    }

    // 2. Update line coordinates and colors in-place (Skip completely in safe mode)
    if (!isSafeMode) {
      Object.entries(FINGER_CONNECTIONS).forEach(([fingerName, indices]) => {
        const line = linesRef.current[fingerName];
        if (line) {
          const posAttr = line.geometry.getAttribute('position');
          const array = posAttr.array;
          
          indices.forEach((idx, i) => {
            const pt = nextPoints[idx];
            if (pt) {
              array[i * 3] = pt.x;
              array[i * 3 + 1] = pt.y;
              array[i * 3 + 2] = pt.z;
            }
          });
          
          posAttr.needsUpdate = true;
          
          const lineColor = isPinching ? '#10b981' : '#00f0ff';
          if (line.material) {
            line.material.color.set(lineColor);
          }
        }
      });
    }
  });

  // Reset smoothing state on visibility toggle
  useEffect(() => {
    if (!visible) {
      smoothedRef.current = [];
    }
  }, [visible]);

  return (
    <group ref={groupRef} visible={false}>
      {/* 1. Finger connection lines (rendered once, coordinates updated in useFrame) - Skip in safe mode */}
      {!isSafeMode && Object.keys(FINGER_CONNECTIONS).map((fingerName) => (
        <line
          key={fingerName}
          ref={(el) => { if (el) linesRef.current[fingerName] = el; }}
          geometry={lineGeometries[fingerName]}
        >
          <lineBasicMaterial
            attach="material"
            transparent
            opacity={0.82}
            blending={THREE.AdditiveBlending}
            depthTest={false}
          />
        </line>
      ))}

      {/* 2. Joint points (rendered once, positions updated in useFrame) */}
      {Array.from({ length: 21 }).map((_, idx) => {
        // In safe mode, skip rendering any joint points other than the index tip (index 8)
        if (isSafeMode && idx !== 8) return null;

        const isTip = idx === 4 || idx === 8;

        return (
          <mesh
            key={idx}
            ref={(el) => { if (el) jointsRef.current[idx] = el; }}
            depthTest={false}
            geometry={isTip ? tipGeometry : jointGeometry}
          >
            <meshBasicMaterial
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

  // Always keep both hand components mounted and toggle visibility to prevent context lost
  const primaryHandLandmarks = landmarks && landmarks.length > 0
    ? (Array.isArray(landmarks[0]) ? landmarks[0] : landmarks)
    : null;
  const secondaryHandLandmarks = landmarks && landmarks.length > 1
    ? landmarks[1]
    : null;

  return (
    <group>
      <SingleHandHologram
        handLandmarks={primaryHandLandmarks}
        isPinching={isPinching}
        visible={!!(handDetected && primaryHandLandmarks)}
      />
      <SingleHandHologram
        handLandmarks={secondaryHandLandmarks}
        isPinching={false}
        visible={!!(handDetected && secondaryHandLandmarks)}
      />
    </group>
  );
}
