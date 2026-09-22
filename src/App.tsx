/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { FoundItPreloader } from './components/FoundItPreloader';
import { LandingPage } from './components/LandingPage';
import { AuthProvider } from './context/AuthContext';

export default function App() {
  // Always plays on initial page load / browser refresh
  const [showPreloader, setShowPreloader] = useState<boolean>(true);
  const [reducedMotionActive, setReducedMotionActive] = useState<boolean>(false);

  // Sync with system preference initially
  useEffect(() => {
    try {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReducedMotionActive(mq.matches);
    } catch {
      // ignore
    }
  }, []);

  const handlePreloaderComplete = useCallback(() => {
    setShowPreloader(false);
  }, []);

  return (
    <AuthProvider>
      <div className="relative min-h-screen bg-[#F6F3EC] text-[#1B1812] font-sans antialiased">
        {/* Self-contained preloader at the root level; plays automatically on every mount/load and unmounts when complete */}
        {showPreloader && (
          <FoundItPreloader
            onComplete={handlePreloaderComplete}
            onSkip={handlePreloaderComplete}
            reducedMotionOverride={reducedMotionActive}
          />
        )}

        {/* Landing page revealed underneath */}
        <LandingPage
          reducedMotionActive={reducedMotionActive}
        />
      </div>
    </AuthProvider>
  );
}

