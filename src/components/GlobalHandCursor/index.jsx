import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { Canvas } from '@react-three/fiber';
import { useHandTracking, TRACKING_MODES } from '../../utils/useHandTracking';
import HandHologram from '../HeroSection3D/HandHologram';

const GlobalCanvasContainer = styled.div`
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 99999;
  background: transparent;
`;

const FloatingCursor = styled.div`
  position: fixed;
  left: ${props => props.$left};
  top: ${props => props.$top};
  width: 24px;
  height: 24px;
  margin-left: -12px;
  margin-top: -12px;
  z-index: 99998;
  pointer-events: none;
  border-radius: 50%;
  border: 2px solid ${props => props.$isPinching ? '#10b981' : '#e7c77e'};
  background: ${props => props.$isPinching ? 'rgba(16, 185, 129, 0.25)' : 'rgba(231, 199, 126, 0.15)'};
  box-shadow: 
    0 0 10px ${props => props.$isPinching ? 'rgba(16, 185, 129, 0.5)' : 'rgba(231, 199, 126, 0.4)'},
    inset 0 0 6px ${props => props.$isPinching ? 'rgba(16, 185, 129, 0.3)' : 'rgba(231, 199, 126, 0.2)'};
  transition: border-color 0.15s, background 0.15s, transform 0.1s ease;
  transform: scale(${props => props.$isPinching ? 0.85 : 1});

  &::after {
    content: '';
    position: absolute;
    inset: 4px;
    border-radius: 50%;
    border: 1px dashed ${props => props.$isPinching ? '#10b981' : '#e7c77e'};
    opacity: 0.65;
  }
`;

const CameraPiP = styled.div`
  position: fixed;
  bottom: 1.5rem;
  left: 1.5rem;
  z-index: 10000;
  width: 140px;
  height: 105px;
  border-radius: 8px;
  border: 1px solid rgba(231, 199, 126, 0.35);
  background: linear-gradient(135deg, rgba(14, 24, 20, 0.88), rgba(26, 20, 15, 0.84));
  box-shadow: 
    0 10px 30px rgba(0, 0, 0, 0.5),
    0 0 12px rgba(231, 199, 126, 0.12);
  overflow: hidden;
  display: ${props => props.$visible ? 'block' : 'none'};
  transition: all 0.3s ease;

  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transform: scaleX(-1); /* Mirror camera stream */
    opacity: 0.85;
  }

  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    transform: scaleX(-1); /* Mirror skeleton overlay to match mirrored video */
  }
`;

const BackHUD = styled.div`
  position: fixed;
  left: 50%;
  top: 12%;
  transform: translateX(-50%);
  z-index: 10001;
  pointer-events: none;
  background: linear-gradient(135deg, rgba(14, 24, 20, 0.92), rgba(26, 20, 15, 0.88));
  border: 1px solid rgba(231, 199, 126, 0.3);
  border-radius: 30px;
  padding: 0.5rem 1.2rem;
  color: #e7c77e;
  font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 0.8rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  box-shadow: 
    0 10px 25px rgba(0, 0, 0, 0.4),
    0 0 12px rgba(231, 199, 126, 0.15);
  animation: fadeIn 0.25s ease-out;

  .progress-bar {
    width: 80px;
    height: 4px;
    background: rgba(231, 199, 126, 0.15);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: #e7c77e;
    box-shadow: 0 0 8px #e7c77e;
    width: ${props => props.$progress}%;
    transition: width 0.05s linear;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translate(-50%, -10px); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }
`;

export default function GlobalHandCursor() {
  const {
    trackingMode,
    handDetected,
    cursor,
    isPinching,
    isPeaceSign,
    cameraActive,
    videoRef,
    canvasRef
  } = useHandTracking();

  const [backProgress, setBackProgress] = useState(0);
  const backTimerRef = useRef(null);

  const lastElementRef = useRef(null);
  const wasPinchingRef = useRef(false);
  const pinchStartRef = useRef({ x: 0, y: 0, time: 0 });
  const lastClientRef = useRef({ x: 0, y: 0 });

  // 1. Gesture peace sign to navigate back
  useEffect(() => {
    if (isPeaceSign && handDetected && trackingMode !== TRACKING_MODES.MOUSE) {
      if (!backTimerRef.current) {
        const startTime = Date.now();
        backTimerRef.current = setInterval(() => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min((elapsed / 1200) * 100, 100);
          setBackProgress(progress);
          
          if (progress >= 100) {
            clearInterval(backTimerRef.current);
            backTimerRef.current = null;
            // Go back safely
            window.history.back();
          }
        }, 30);
      }
    } else {
      if (backTimerRef.current) {
        clearInterval(backTimerRef.current);
        backTimerRef.current = null;
      }
      setBackProgress(0);
    }

    return () => {
      if (backTimerRef.current) clearInterval(backTimerRef.current);
    };
  }, [isPeaceSign, handDetected, trackingMode]);

  // Helper to dispatch synthetic events with pageX, pageY, offsetX, and offsetY injected
  const dispatchSyntheticEvent = (el, type, cX, cY, isPointer = true) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const offsetX = cX - rect.left;
    const offsetY = cY - rect.top;

    const EventClass = isPointer ? PointerEvent : MouseEvent;
    const ev = new EventClass(type, {
      bubbles: true,
      cancelable: true,
      clientX: cX,
      clientY: cY,
      view: window
    });

    Object.defineProperties(ev, {
      offsetX: { value: offsetX },
      offsetY: { value: offsetY },
      pageX: { value: cX + window.scrollX },
      pageY: { value: cY + window.scrollY }
    });

    el.dispatchEvent(ev);
  };

  // 2. Map cursor NDC coordinates to screen pixel coordinates
  const clientX = (cursor.x + 1) * window.innerWidth / 2;
  const clientY = (1 - cursor.y) * window.innerHeight / 2;

  // 3. Dispatch simulated hover/click/drag pointer events
  useEffect(() => {
    if (trackingMode === TRACKING_MODES.MOUSE || !handDetected) {
      // Clean up hover state when hand is lost
      if (lastElementRef.current) {
        lastElementRef.current.classList.remove('hand-hover');
        lastElementRef.current = null;
      }
      return;
    }

    // Find HTML element at current virtual cursor position
    const el = document.elementFromPoint(clientX, clientY);

    // Hover state management
    if (el !== lastElementRef.current) {
      if (lastElementRef.current) {
        dispatchSyntheticEvent(lastElementRef.current, 'pointerout', clientX, clientY, true);
        dispatchSyntheticEvent(lastElementRef.current, 'pointerleave', clientX, clientY, true);
        lastElementRef.current.classList.remove('hand-hover');
      }
      if (el) {
        dispatchSyntheticEvent(el, 'pointerover', clientX, clientY, true);
        dispatchSyntheticEvent(el, 'pointerenter', clientX, clientY, true);
        el.classList.add('hand-hover');
      }
      lastElementRef.current = el;
    }

    if (el) {
      dispatchSyntheticEvent(el, 'pointermove', clientX, clientY, true);
    }

    // Pinch Down / Pinch Up / Drag-scroll simulation
    if (isPinching && !wasPinchingRef.current) {
      // Transition to Pinching (Pinch Down)
      wasPinchingRef.current = true;
      pinchStartRef.current = { x: clientX, y: clientY, time: Date.now() };
      lastClientRef.current = { x: clientX, y: clientY };

      if (el) {
        dispatchSyntheticEvent(el, 'pointerdown', clientX, clientY, true);
        dispatchSyntheticEvent(el, 'mousedown', clientX, clientY, false);
      }
    } else if (!isPinching && wasPinchingRef.current) {
      // Release Pinch (Pinch Up)
      wasPinchingRef.current = false;
      const duration = Date.now() - pinchStartRef.current.time;
      const dist = Math.hypot(clientX - pinchStartRef.current.x, clientY - pinchStartRef.current.y);

      if (el) {
        dispatchSyntheticEvent(el, 'pointerup', clientX, clientY, true);
        dispatchSyntheticEvent(el, 'mouseup', clientX, clientY, false);
      }

      // If pinch duration is quick and we haven't dragged far, fire a click!
      if (duration < 350 && dist < 20) {
        if (el) {
          dispatchSyntheticEvent(el, 'click', clientX, clientY, false);
          if (typeof el.focus === 'function') el.focus();
        }
      }
    } else if (isPinching && wasPinchingRef.current) {
      // Drag action
      const dy = clientY - lastClientRef.current.y;
      lastClientRef.current = { x: clientX, y: clientY };

      // Scroll page dynamically if not dragging on a 3D Canvas element
      const is3DCanvasActive = el && (el.tagName === 'CANVAS' || el.closest('canvas'));
      if (!is3DCanvasActive) {
        window.scrollBy({ top: -dy * 1.6, behavior: 'auto' });
      }
    }
  }, [clientX, clientY, isPinching, handDetected, trackingMode]);

  // Inject a small style block to style elements under hand hover dynamically
  useEffect(() => {
    const styleId = 'global-hand-hover-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.innerHTML = `
        a.hand-hover, button.hand-hover, .option.hand-hover, .nav-item.hand-hover, .legend-item.hand-hover {
          opacity: 0.85;
          transform: translateY(-2px) scale(1.02);
          box-shadow: 0 4px 12px rgba(231, 199, 126, 0.25) !important;
          border-color: rgba(231, 199, 126, 0.6) !important;
          color: #e7c77e !important;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  const cursorLeft = `${(cursor.x + 1) * 50}%`;
  const cursorTop = `${(1 - cursor.y) * 50}%`;

  if (trackingMode === TRACKING_MODES.MOUSE) return null;

  return (
    <>
      {/* 1. Global full-screen 3D hand skeleton canvas */}
      {handDetected && (
        <GlobalCanvasContainer>
          <Canvas
            camera={{ position: [0, 0.05, 5.9], fov: 48 }}
            gl={{ alpha: true, antialias: true }}
            style={{ pointerEvents: 'none' }}
          >
            <HandHologram />
          </Canvas>
        </GlobalCanvasContainer>
      )}

      {/* 2. Global floating pointer cursor */}
      {handDetected && (
        <FloatingCursor
          $left={cursorLeft}
          $top={cursorTop}
          $isPinching={isPinching}
        />
      )}

      {/* 3. Global Camera PIP Window */}
      <CameraPiP $visible={trackingMode === TRACKING_MODES.CAMERA && cameraActive}>
        <video ref={videoRef} autoPlay playsInline muted />
        <canvas ref={canvasRef} width="640" height="480" />
      </CameraPiP>

      {/* 4. Peace sign "Recall" Back HUD overlay */}
      {backProgress > 0 && (
        <BackHUD $progress={backProgress}>
          <span>◀ 正在汇聚回溯之光...</span>
          <div className="progress-bar">
            <div className="progress-fill" />
          </div>
          <span>{Math.round(backProgress)}%</span>
        </BackHUD>
      )}
    </>
  );
}
