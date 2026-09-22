import React, { useEffect, useState, useRef, useCallback } from 'react';

export interface FoundItPreloaderProps {
  onComplete?: () => void;
  forcePlay?: boolean;
  onSkip?: () => void;
  reducedMotionOverride?: boolean;
}

interface LetterDef {
  char: string;
  scatterX: number;
  scatterY: number;
  scatterRot: number;
}

const LETTERS: LetterDef[] = [
  { char: 'F', scatterX: -24, scatterY: -22, scatterRot: -9 },
  { char: 'o', scatterX: 16, scatterY: 24, scatterRot: 12 },
  { char: 'u', scatterX: -18, scatterY: 26, scatterRot: -11 },
  { char: 'n', scatterX: 20, scatterY: -20, scatterRot: 9 },
  { char: 'd', scatterX: -14, scatterY: 22, scatterRot: -13 },
  { char: 'I', scatterX: 18, scatterY: -25, scatterRot: 14 },
  { char: 't', scatterX: -14, scatterY: 20, scatterRot: -8 },
];

export const FoundItPreloader: React.FC<FoundItPreloaderProps> = ({
  onComplete,
  onSkip,
  reducedMotionOverride = false,
}) => {
  const [isUnmounted, setIsUnmounted] = useState(false);
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  const [snappedLetters, setSnappedLetters] = useState<boolean[]>([
    false,
    false,
    false,
    false,
    false,
    false,
    false,
  ]);
  const [sweepProgress, setSweepProgress] = useState(0); // 0 = left start, 1 = right finish
  const [glassVisible, setGlassVisible] = useState(false);
  const [overlayFading, setOverlayFading] = useState(false);

  const wordmarkRef = useRef<HTMLDivElement>(null);
  const letterRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [wordmarkWidth, setWordmarkWidth] = useState(380);

  const prefersReducedMotion = systemReducedMotion || reducedMotionOverride;

  // Measure wordmark width for responsive positioning
  const updateDimensions = useCallback(() => {
    if (wordmarkRef.current) {
      const rect = wordmarkRef.current.getBoundingClientRect();
      if (rect.width > 0) {
        setWordmarkWidth(rect.width);
      }
    }
  }, []);

  useEffect(() => {
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [updateDimensions]);

  // Detect system prefers-reduced-motion
  useEffect(() => {
    try {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setSystemReducedMotion(mediaQuery.matches);
      const listener = (e: MediaQueryListEvent) =>
        setSystemReducedMotion(e.matches);
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    } catch {
      // media query unsupported
    }
  }, []);

  // Main Orchestrated Animation
  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    // Ensure fonts and initial layout render
    updateDimensions();

    if (prefersReducedMotion) {
      // Respect prefers-reduced-motion: wordmark fades in with NO sweep
      setGlassVisible(false);
      setSnappedLetters([true, true, true, true, true, true, true]);

      // Holds wordmark for 0.5s then smoothly fades out
      timers.push(
        setTimeout(() => {
          setOverlayFading(true);
        }, 750)
      );

      timers.push(
        setTimeout(() => {
          setIsUnmounted(true);
          onComplete?.();
        }, 1200)
      );

      return () => timers.forEach(clearTimeout);
    }

    // Standard Single Orchestrated Animation:
    // Total duration: ~2.2 seconds (strictly under 2.5 seconds)

    // T = 0.08s: Magnifying glass appears on left and starts sweep across
    timers.push(
      setTimeout(() => {
        setGlassVisible(true);
        setSweepProgress(1);
      }, 80)
    );

    // Letter snap timestamps (strictly synced with the sweep passing over each letter)
    // Sweep duration is 1.16s (from t = 80ms to t = 1240ms)
    // The letters F, o, u, n, d, I, t are reached in sequence:
    const snapDelays = [260, 410, 560, 710, 860, 1010, 1160];

    snapDelays.forEach((delay, index) => {
      timers.push(
        setTimeout(() => {
          setSnappedLetters((prev) => {
            const next = [...prev];
            next[index] = true;
            return next;
          });
        }, delay)
      );
    });

    // T = 1.25s: Magnifying glass finishes sweeping past 't' and fades out
    timers.push(
      setTimeout(() => {
        setGlassVisible(false);
      }, 1250)
    );

    // T = 1.25s - 1.75s: Assembled wordmark holds for half a second (0.50s)
    // T = 1.75s: Whole preloader begins smooth fade out (420ms)
    timers.push(
      setTimeout(() => {
        setOverlayFading(true);
      }, 1750)
    );

    // T = 2.18s: Fade out complete; unmount preloader and reveal landing page
    timers.push(
      setTimeout(() => {
        setIsUnmounted(true);
        onComplete?.();
      }, 2180)
    );

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [prefersReducedMotion, onComplete, updateDimensions]);

  // Keyboard shortcut (Esc or Space) to skip instantly
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ') {
        setIsUnmounted(true);
        onSkip?.();
        onComplete?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSkip, onComplete]);

  if (isUnmounted) {
    return null;
  }

  // Magnifying glass dimensions and sweep geometry:
  // Lens center is at (32, 32) inside the 80x80 SVG
  const leadPadding = 90;
  const startX = -leadPadding;
  const endX = wordmarkWidth + leadPadding - 32;
  const currentX = sweepProgress === 0 ? startX : endX;

  return (
    <div
      id="foundit-preloader"
      aria-label="FoundIt intro animation"
      role="status"
      className={`fixed inset-0 z-50 flex items-center justify-center bg-[#F6F3EC] select-none transition-opacity duration-400 ease-out ${
        overlayFading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      style={{
        backgroundColor: '#F6F3EC',
        willChange: 'opacity',
      }}
    >
      {/* Skip button in top corner */}
      <button
        type="button"
        id="skip-preloader-button"
        onClick={() => {
          setIsUnmounted(true);
          onSkip?.();
          onComplete?.();
        }}
        className="absolute top-6 right-6 text-xs uppercase tracking-widest text-[#1B1812]/40 hover:text-[#1B1812] transition-colors py-1.5 px-3 rounded-full border border-[#1B1812]/10 hover:border-[#1B1812]/30 cursor-pointer"
        title="Skip intro animation"
      >
        Skip [Esc]
      </button>

      {/* Stage: Wordmark & Sweeping Magnifying Glass */}
      <div className="relative inline-flex items-center justify-center p-6 sm:p-10 max-w-full">
        {/* Wordmark Container */}
        <div
          ref={wordmarkRef}
          id="wordmark-container"
          className="relative inline-flex items-baseline font-fraunces text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-[450] text-[#1B1812] tracking-[-0.03em] leading-none"
        >
          {LETTERS.map((item, index) => {
            const isSnapped = snappedLetters[index];

            return (
              <span
                key={`${item.char}-${index}`}
                ref={(el) => {
                  letterRefs.current[index] = el;
                }}
                id={`letter-${item.char.toLowerCase()}-${index}`}
                className="inline-block relative will-change-transform will-change-opacity"
                style={{
                  transform: isSnapped
                    ? 'translate3d(0px, 0px, 0px) rotate(0deg)'
                    : `translate3d(${item.scatterX}px, ${item.scatterY}px, 0px) rotate(${item.scatterRot}deg)`,
                  opacity: isSnapped ? 1 : 0.22,
                  filter: isSnapped ? 'none' : 'blur(0.35px)',
                  transition: prefersReducedMotion
                    ? 'opacity 0.4s ease-out'
                    : 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.24s cubic-bezier(0.16, 1, 0.3, 1), filter 0.24s ease-out',
                }}
              >
                {item.char}
              </span>
            );
          })}
        </div>

        {/* Magnifying Glass (Line-art only, no fill, amber stroke #E8A33D) */}
        {!prefersReducedMotion && (
          <div
            id="magnifying-glass-tracker"
            className="absolute left-0 pointer-events-none will-change-transform"
            style={{
              top: '50%',
              opacity: glassVisible ? 1 : 0,
              // Translate by currentX, subtracting lens center (32px) so lens centers on letters
              transform: `translate3d(${currentX - 32}px, calc(-50% + 2px), 0)`,
              transition:
                sweepProgress === 0
                  ? 'none'
                  : 'transform 1.16s cubic-bezier(0.35, 0, 0.25, 1), opacity 0.2s ease-out',
            }}
          >
            <svg
              id="magnifying-glass-svg"
              width="80"
              height="80"
              viewBox="0 0 80 80"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="overflow-visible"
              aria-hidden="true"
            >
              {/* Circular Lens - Clean line-art, no fill, amber #E8A33D stroke */}
              <circle
                cx="32"
                cy="32"
                r="20"
                stroke="#E8A33D"
                strokeWidth="2.75"
                fill="none"
              />
              {/* Line Handle - Clean line-art at 45-degree angle, amber #E8A33D */}
              <line
                x1="46.5"
                y1="46.5"
                x2="69"
                y2="69"
                stroke="#E8A33D"
                strokeWidth="3.25"
                strokeLinecap="round"
              />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
};

export default FoundItPreloader;

