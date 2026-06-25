import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { HandTrackingProvider } from './utils/useHandTracking';
import GlobalHandCursor from './components/GlobalHandCursor';
import SpatialUI from './pages/SpatialUI';
import './index.css';

// Polyfill to prevent browser crashes from synthetic pointer events (e.g. from OrbitControls)
if (typeof Element !== 'undefined' && Element.prototype) {
  const originalSet = Element.prototype.setPointerCapture;
  const originalRelease = Element.prototype.releasePointerCapture;
  
  if (originalSet) {
    Element.prototype.setPointerCapture = function(pointerId) {
      try {
        originalSet.call(this, pointerId);
      } catch (e) {
        // Suppress pointer capture errors for synthetic pointers
      }
    };
  }
  
  if (originalRelease) {
    Element.prototype.releasePointerCapture = function(pointerId) {
      try {
        originalRelease.call(this, pointerId);
      } catch (e) {
        // Suppress pointer capture errors for synthetic pointers
      }
    };
  }
}

function App() {
  return (
    <HandTrackingProvider>
      <Router>
        <Routes>
          <Route path="/*" element={<SpatialUI />} />
        </Routes>
      </Router>
      <GlobalHandCursor />
    </HandTrackingProvider>
  );
}

export default App;
