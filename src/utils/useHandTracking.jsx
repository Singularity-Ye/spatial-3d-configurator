import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const HandTrackingContext = createContext(null);

const MEDIAPIPE_HANDS_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js';
const MEDIAPIPE_CAMERA_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js';

export const TRACKING_MODES = {
  MOUSE: 'mouse',
  CAMERA: 'camera',
  WEBSOCKET: 'websocket',
  SIMULATE: 'simulate',
};

const loadScript = (src) => {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

// Distance helper
const getDistance = (p1, p2) => {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = p1.z - p2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

// Determine if finger is curled
const isFingerCurled = (hand, mcp, pip, dip, tip) => {
  const dKnuckleToTip = getDistance(hand[mcp], hand[tip]);
  const dSegments = getDistance(hand[mcp], hand[pip]) + 
                    getDistance(hand[pip], hand[dip]) + 
                    getDistance(hand[dip], hand[tip]);
  return dSegments > 0 ? (dKnuckleToTip / dSegments) < 0.65 : true;
};

// Calculate Roll, Pitch, Yaw from landmarks
const calculateRotation = (lm) => {
  if (!lm || lm.length < 21) return { x: 0, y: 0, z: 0 };
  const p0 = lm[0];
  const p9 = lm[9];
  const p5 = lm[5];
  const p17 = lm[17];

  // Roll (Z-rotation)
  const roll = Math.atan2(p9.y - p0.y, p9.x - p0.x) + Math.PI / 2;

  // Palm Normal Vector (Cross product)
  const ux = p5.x - p0.x, uy = p5.y - p0.y, uz = p5.z - p0.z;
  const vx = p17.x - p0.x, vy = p17.y - p0.y, vz = p17.z - p0.z;

  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;

  const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  const normX = nx / len;
  const normY = ny / len;

  // Map to Pitch/Yaw (clamped)
  const pitch = normY * Math.PI * 0.45;
  const yaw = -normX * Math.PI * 0.45;

  return { x: pitch, y: yaw, z: -roll };
};

export function HandTrackingProvider({ children }) {
  const [trackingMode, setTrackingMode] = useState(TRACKING_MODES.MOUSE);
  const [handDetected, setHandDetected] = useState(false);
  const [cursor, setCursor] = useState({ x: 0, y: 0 }); // Screen NDC coords: [-1, 1]
  const [isPinching, setIsPinching] = useState(false);
  const [isFist, setIsFist] = useState(false);
  const [isPeaceSign, setIsPeaceSign] = useState(false);
  const [landmarks, setLandmarks] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [wsUrl, setWsUrl] = useState('ws://localhost:8765');
  const [handRot, setHandRot] = useState({ x: 0, y: 0, z: 0 });
  const [cameraActive, setCameraActive] = useState(false);

  // Hidden video and canvas refs for MediaPipe
  const videoRefInternal = useRef(null);
  const canvasRefInternal = useRef(null);
  const wsRef = useRef(null);
  const mediaPipeHandsRef = useRef(null);
  const mediaPipeCameraRef = useRef(null);
  const simulationIntervalRef = useRef(null);
  const activeModeRef = useRef(trackingMode);
  const activeInitIdRef = useRef(0);

  // Gesture state debouncing tracking
  const pinchActiveRef = useRef(false);
  const pinchTransitionFramesRef = useRef(0);
  const pinchEnterFramesRef = useRef(0); // Prevent noise on entering pinch state

  const fistActiveRef = useRef(false);
  const fistTransitionFramesRef = useRef(0);

  const peaceActiveRef = useRef(false);
  const peaceTransitionFramesRef = useRef(0);

  // Cursor filter states
  const smoothedCursorRef = useRef({ x: 0, y: 0 });
  const isFirstFrameRef = useRef(true);

  // Debounced gesture state dispatchers
  const updatePinchState = useCallback((rawPinchActive) => {
    if (rawPinchActive) {
      pinchTransitionFramesRef.current = 0;
      if (!pinchActiveRef.current) {
        pinchEnterFramesRef.current += 1;
        if (pinchEnterFramesRef.current >= 3) { // Must be true for 3 consecutive frames to trigger pinch
          pinchActiveRef.current = true;
          setIsPinching(true);
        }
      }
    } else {
      pinchEnterFramesRef.current = 0;
      if (pinchActiveRef.current) {
        pinchTransitionFramesRef.current += 1;
        if (pinchTransitionFramesRef.current >= 8) { // Must be false for 8 consecutive frames to release
          pinchActiveRef.current = false;
          setIsPinching(false);
        }
      }
    }
  }, []);

  const updateFistState = useCallback((rawFistActive) => {
    if (rawFistActive) {
      fistTransitionFramesRef.current = 0;
      if (!fistActiveRef.current) {
        fistActiveRef.current = true;
        setIsFist(true);
      }
    } else {
      if (fistActiveRef.current) {
        fistTransitionFramesRef.current += 1;
        if (fistTransitionFramesRef.current >= 6) {
          fistActiveRef.current = false;
          setIsFist(false);
        }
      }
    }
  }, []);

  const updatePeaceState = useCallback((rawPeaceActive) => {
    if (rawPeaceActive) {
      peaceTransitionFramesRef.current = 0;
      if (!peaceActiveRef.current) {
        peaceActiveRef.current = true;
        setIsPeaceSign(true);
      }
    } else {
      if (peaceActiveRef.current) {
        peaceTransitionFramesRef.current += 1;
        if (peaceTransitionFramesRef.current >= 6) {
          peaceActiveRef.current = false;
          setIsPeaceSign(false);
        }
      }
    }
  }, []);

  // Callback refs to detect mounting/unmounting of video/canvas elements across page transitions
  const [elementTrigger, setElementTrigger] = useState(0);

  const videoRefCallback = useCallback((node) => {
    videoRefInternal.current = node;
    setElementTrigger((prev) => prev + 1);
  }, []);

  const canvasRefCallback = useCallback((node) => {
    canvasRefInternal.current = node;
  }, []);

  // Sync mode ref to avoid closure problems in callbacks
  useEffect(() => {
    activeModeRef.current = trackingMode;
  }, [trackingMode]);

  // Clean up all resources
  const cleanup = useCallback(() => {
    // Invalidate any ongoing camera initializations
    activeInitIdRef.current++;

    // 1. Stop simulation
    if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current);
      simulationIntervalRef.current = null;
    }

    // 2. Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);

    // 3. Stop MediaPipe Camera & Video Stream
    if (mediaPipeCameraRef.current) {
      try {
        mediaPipeCameraRef.current.stop();
      } catch (e) {
        console.warn('Error stopping MediaPipe Camera:', e);
      }
      mediaPipeCameraRef.current = null;
    }

    if (videoRefInternal.current && videoRefInternal.current.srcObject) {
      const stream = videoRefInternal.current.srcObject;
      stream.getTracks().forEach((track) => track.stop());
      videoRefInternal.current.srcObject = null;
    }

    // Reset gesture states & debouncing frame counters immediately
    pinchActiveRef.current = false;
    pinchTransitionFramesRef.current = 0;
    pinchEnterFramesRef.current = 0;
    fistActiveRef.current = false;
    fistTransitionFramesRef.current = 0;
    peaceActiveRef.current = false;
    peaceTransitionFramesRef.current = 0;
    isFirstFrameRef.current = true;

    setCameraActive(false);
    setHandDetected(false);
    setIsPinching(false);
    setIsFist(false);
    setIsPeaceSign(false);
    setLandmarks([]);
  }, []);

  // Process MediaPipe results
  const onResults = useCallback((results) => {
    if (activeModeRef.current !== TRACKING_MODES.CAMERA) return;

    const canvas = canvasRefInternal.current;
    const ctx = canvas ? canvas.getContext('2d') : null;

    // Clear transparent canvas
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const hand = results.multiHandLandmarks[0];
      setLandmarks(hand);
      setHandDetected(true);

      // Mapped NDC Pointer Cursor (based on Index Finger Tip landmark 8)
      // Mirroring correction: (1 - x) to match mirrored video display
      const indexTip = hand[8];
      const ndcX = 1 - indexTip.x * 2;
      const ndcY = 1 - indexTip.y * 2;

      // Pinch check using scale-independent normalized distance
      // Distance between Thumb Tip (4) and Index Tip (8) relative to hand size (wrist 0 to middle knuckle 9)
      const pinchDist = getDistance(hand[4], hand[8]);
      const handScale = getDistance(hand[0], hand[9]) || 0.2;
      const relativePinchDist = pinchDist / handScale;
      // 0.38 is an ideal threshold that detects pinch cleanly and avoids occlusion issues
      const rawPinchActive = relativePinchDist < 0.38;
      updatePinchState(rawPinchActive);

      // Smooth the cursor position using first-order low-pass filter (Exponential Moving Average)
      // When pinch is active, we apply a stronger filter to mitigate self-occlusion jitter.
      const filterFactor = pinchActiveRef.current ? 0.08 : 0.22;

      if (isFirstFrameRef.current) {
        smoothedCursorRef.current = { x: ndcX, y: ndcY };
        isFirstFrameRef.current = false;
      } else {
        smoothedCursorRef.current.x += (ndcX - smoothedCursorRef.current.x) * filterFactor;
        smoothedCursorRef.current.y += (ndcY - smoothedCursorRef.current.y) * filterFactor;
      }

      setCursor({ x: smoothedCursorRef.current.x, y: smoothedCursorRef.current.y });

      // Fist check (curl of index, middle, ring, pinky)
      const indexCurled = isFingerCurled(hand, 5, 6, 7, 8);
      const middleCurled = isFingerCurled(hand, 9, 10, 11, 12);
      const ringCurled = isFingerCurled(hand, 13, 14, 15, 16);
      const pinkyCurled = isFingerCurled(hand, 17, 18, 19, 20);
      const rawFistActive = indexCurled && middleCurled && ringCurled && pinkyCurled;
      updateFistState(rawFistActive);

      // Peace sign check (Index and Middle extended, Ring and Pinky curled)
      const rawPeaceActive = !indexCurled && !middleCurled && ringCurled && pinkyCurled;
      updatePeaceState(rawPeaceActive);

      // Calculate Rotation
      const rot = calculateRotation(hand);
      setHandRot(rot);

      // Draw skeleton on 2D PiP canvas
      if (ctx) {
        ctx.fillStyle = pinchActiveRef.current ? '#ff3b30' : '#00e5ff';
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2.5;

        // Draw connections
        const connections = [
          [0, 1], [1, 2], [2, 3], [3, 4],
          [0, 5], [5, 6], [6, 7], [7, 8],
          [0, 9], [9, 10], [10, 11], [11, 12],
          [0, 13], [13, 14], [14, 15], [15, 16],
          [0, 17], [17, 18], [18, 19], [19, 20],
          [5, 9], [9, 13], [13, 17]
        ];

        connections.forEach(([s, e]) => {
          ctx.beginPath();
          ctx.moveTo(hand[s].x * canvas.width, hand[s].y * canvas.height);
          ctx.lineTo(hand[e].x * canvas.width, hand[e].y * canvas.height);
          ctx.stroke();
        });

        // Draw joint points
        hand.forEach((p, idx) => {
          ctx.beginPath();
          ctx.arc(p.x * canvas.width, p.y * canvas.height, idx === 4 || idx === 8 ? 5.5 : 3.5, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    } else {
      setHandDetected(false);
      isFirstFrameRef.current = true;
      
      // Reset gesture states & debouncing frame counters immediately
      pinchActiveRef.current = false;
      pinchTransitionFramesRef.current = 0;
      pinchEnterFramesRef.current = 0;
      fistActiveRef.current = false;
      fistTransitionFramesRef.current = 0;
      peaceActiveRef.current = false;
      peaceTransitionFramesRef.current = 0;

      setIsPinching(false);
      setIsFist(false);
      setIsPeaceSign(false);
      setLandmarks([]);
    }
  }, [updatePinchState, updateFistState, updatePeaceState]);

  // Initialize MediaPipe tracking
  const startCameraTracking = useCallback(async () => {
    cleanup();
    const myId = activeInitIdRef.current; // The new target ID for this call
    setHandDetected(false);

    try {
      // 1. Skip camera tracking initialization if no DOM video element is currently mounted/available.
      // This prevents the camera from starting on unmounted elements or in the background during page transitions.
      if (!videoRefInternal.current) {
        console.log('No video element mounted, skipping camera tracking initialization.');
        return;
      }

      // 2. Get Camera stream (request ideal 60 FPS from hardware webcam)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: 640, 
          height: 480, 
          facingMode: 'user',
          frameRate: { ideal: 60, min: 30 }
        },
      });

      // Check if a newer initialization has started since we started waiting for getUserMedia
      if (myId !== activeInitIdRef.current) {
        console.log('A newer camera tracking initialization started. Cleaning up stale stream.');
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      videoRefInternal.current.srcObject = stream;
      setCameraActive(true);

      // 3. Load CDN scripts
      await loadScript(MEDIAPIPE_HANDS_CDN);
      await loadScript(MEDIAPIPE_CAMERA_CDN);

      if (myId !== activeInitIdRef.current) {
        console.log('A newer camera tracking initialization started. Aborting CDN loading.');
        return;
      }

      // 4. Initialize MediaPipe Hands
      if (!mediaPipeHandsRef.current && window.Hands) {
        const hands = new window.Hands({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });
        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1, // Changed back to Full for maximum fingertip tracking precision
          minDetectionConfidence: 0.6,
          minTrackingConfidence: 0.6,
        });
        hands.onResults(onResults);
        mediaPipeHandsRef.current = hands;
      }

      if (myId !== activeInitIdRef.current) {
        console.log('A newer camera tracking initialization started. Aborting hands setup.');
        return;
      }

      // 5. Initialize MediaPipe Camera Loop
      if (videoRefInternal.current && mediaPipeHandsRef.current && window.Camera) {
        const cameraObj = new window.Camera(videoRefInternal.current, {
          onFrame: async () => {
            if (activeModeRef.current !== TRACKING_MODES.CAMERA || !mediaPipeHandsRef.current) return;
            // Only process frames if the video element is still active/mounted
            if (videoRefInternal.current) {
              await mediaPipeHandsRef.current.send({ image: videoRefInternal.current });
            }
          },
          width: 640,
          height: 480,
          fps: 60 // Request 60 FPS from the webcam stream
        });
        mediaPipeCameraRef.current = cameraObj;
        cameraObj.start();
      }
    } catch (err) {
      console.error('Failed to start webcam hand tracking:', err);
      if (myId === activeInitIdRef.current) {
        setTrackingMode(TRACKING_MODES.MOUSE);
      }
    }
  }, [cleanup, onResults]);

  // Start WebSocket client
  const startWebSocketTracking = useCallback(() => {
    cleanup();

    try {
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        setIsConnected(true);
      };

      socket.onmessage = (event) => {
        if (activeModeRef.current !== TRACKING_MODES.WEBSOCKET) return;
        try {
          const data = JSON.parse(event.data);
          
          setHandDetected(!!data.handDetected);
          
          if (data.handDetected) {
            // Mapped NDC position from raspberry
            if (data.cursor) {
              setCursor({ x: data.cursor.x, y: data.cursor.y });
            } else if (data.landmarks && data.landmarks[8]) {
              // Fallback calculations if landmarks are sent
              const indexTip = data.landmarks[8];
              setCursor({ x: 1 - indexTip.x * 2, y: 1 - indexTip.y * 2 });
            }

            if (data.landmarks) {
              setLandmarks(data.landmarks);
              const rot = calculateRotation(data.landmarks);
              setHandRot(rot);
            }

            // Pinch and grab states
            if (data.pinchDistance !== undefined) {
              updatePinchState(data.pinchDistance < 0.075);
            } else if (data.gesture) {
              updatePinchState(data.gesture === 'pinch');
            }

            if (data.gesture) {
              updateFistState(data.gesture === 'fist' || data.gesture === 'grab');
              updatePeaceState(data.gesture === 'peace');
            }
          }
        } catch (e) {
          console.warn('WebSocket message parse error:', e);
        }
      };

      socket.onclose = () => {
        setIsConnected(false);
      };

      socket.onerror = () => {
        setIsConnected(false);
      };
    } catch (e) {
      console.error('WebSocket connection failed:', e);
      setIsConnected(false);
    }
  }, [cleanup, wsUrl, updatePinchState, updateFistState, updatePeaceState]);

  // Start Simulation mode
  const startSimulationMode = useCallback(() => {
    cleanup();
    setHandDetected(true);

    let angle = 0;
    simulationIntervalRef.current = setInterval(() => {
      angle += 0.04;
      
      // Mapped hand landmarks simulation
      const basePos = { x: 0.5 + Math.cos(angle) * 0.25, y: 0.5 + Math.sin(angle) * 0.18, z: -0.1 };
      
      // Simulate index fingertip moving in a circle
      const simulatedCursor = {
        x: Math.cos(angle) * 0.8,
        y: Math.sin(angle) * 0.6,
      };
      setCursor(simulatedCursor);
      
      // 10% chance of pinch toggling
      const isPinchSim = Math.sin(angle * 2.5) > 0.82;
      setIsPinching(isPinchSim);
      
      // Fist check
      const isFistSim = Math.sin(angle * 1.5) < -0.85;
      setIsFist(isFistSim);

      // Peace sign mock (15% chance during loop when angle is in certain range)
      const isPeaceSim = Math.cos(angle * 2.0) > 0.88;
      setIsPeaceSign(isPeaceSim);

      // Rotation simulation
      setHandRot({
        x: Math.sin(angle * 0.8) * 0.2,
        y: Math.cos(angle * 0.8) * 0.2,
        z: Math.sin(angle * 0.4) * 0.1,
      });

      // Construct a fake set of landmarks
      const fakeLandmarks = Array.from({ length: 21 }, (_, idx) => {
        return {
          x: basePos.x + (idx * 0.005),
          y: basePos.y + (idx * 0.005),
          z: basePos.z,
        };
      });
      setLandmarks(fakeLandmarks);
    }, 33); // 30 FPS
  }, [cleanup]);

  // Manage transitions between modes
  useEffect(() => {
    if (trackingMode === TRACKING_MODES.CAMERA) {
      startCameraTracking();
    } else if (trackingMode === TRACKING_MODES.WEBSOCKET) {
      startWebSocketTracking();
    } else if (trackingMode === TRACKING_MODES.SIMULATE) {
      startSimulationMode();
    } else {
      cleanup();
    }

    return () => cleanup();
  }, [trackingMode, elementTrigger, startCameraTracking, startWebSocketTracking, startSimulationMode, cleanup]);

  return (
    <HandTrackingContext.Provider
      value={{
        trackingMode,
        setTrackingMode,
        handDetected,
        cursor,
        setCursor, // Expose for mouse emulation
        isPinching,
        isFist,
        isPeaceSign,
        landmarks,
        isConnected,
        wsUrl,
        setWsUrl,
        handRot,
        cameraActive,
        videoRef: videoRefCallback,
        canvasRef: canvasRefCallback,
      }}
    >
      {children}
    </HandTrackingContext.Provider>
  );
}

export function useHandTracking() {
  const context = useContext(HandTrackingContext);
  if (!context) {
    throw new Error('useHandTracking must be used within a HandTrackingProvider');
  }
  return context;
}
