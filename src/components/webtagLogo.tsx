import { useEffect, useId, useRef } from "react";

interface WebtagLogoProps {
  compact?: boolean;
  interactive?: boolean;
  className?: string;
}

export function LabelEmojiIcon({ size = 28 }: { size?: number }) {
  const uid = useId();
  const paperId = `${uid}-paper`;
  const edgeId = `${uid}-edge`;
  const ringId = `${uid}-ring`;
  const holeId = `${uid}-hole`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className="wt-brand-mark"
    >
      <defs>
        <linearGradient id={paperId} x1="16" y1="14" x2="54" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fde8a8" />
          <stop offset="55%" stopColor="#f5ce74" />
          <stop offset="100%" stopColor="#dfa94b" />
        </linearGradient>
        <linearGradient id={edgeId} x1="12" y1="12" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fff4ce" />
          <stop offset="100%" stopColor="#b87f2c" />
        </linearGradient>
        <linearGradient id={ringId} x1="20" y1="20" x2="31" y2="31" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#c98e3a" />
          <stop offset="100%" stopColor="#8a5a1d" />
        </linearGradient>
        <mask id={holeId}>
          <rect width="64" height="64" fill="#ffffff" />
          <circle cx="25.5" cy="25.5" r="2.9" fill="#000000" />
        </mask>
      </defs>
      <path
        d="M23 23 C14 14, 7 15, 7 10 C7 5.5, 13.5 5, 19.5 11.5 C22 14.2, 23.8 18.2, 24.8 21.8"
        stroke="#c59454"
        strokeWidth="3.2"
        strokeLinecap="round"
        fill="none"
      />
      <g mask={`url(#${holeId})`}>
        <path
          d="M18.2 18.2 C19.4 17 21.1 16.5 22.8 16.7 L34.2 18.1 C35.5 18.3 36.7 18.9 37.6 19.8 L54.6 36.8 C56.6 38.8 56.6 42 54.6 44 L44 54.6 C42 56.6 38.8 56.6 36.8 54.6 L19.8 37.6 C18.9 36.7 18.3 35.5 18.1 34.2 L16.7 22.8 C16.5 21.1 17 19.4 18.2 18.2 Z"
          fill={`url(#${paperId})`}
          stroke={`url(#${edgeId})`}
          strokeWidth="1.5"
        />
        <line x1="27" y1="36" x2="36" y2="27" stroke="#c98e3a" strokeOpacity="0.28" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="33" y1="42" x2="43" y2="32" stroke="#c98e3a" strokeOpacity="0.22" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="25.5" cy="25.5" r="5.5" fill={`url(#${ringId})`} />
      </g>
      <path
        d="M14.5 14.5 C18.2 17.6, 21.8 20.6, 24.4 24.2"
        stroke="#d6a562"
        strokeWidth="2.8"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function WebtagLogo({ compact = false, interactive = false, className = "" }: WebtagLogoProps) {
  const hostRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!interactive) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // smooth pointer-follow lerp tilt for the landing wordmark
    let mouseX = 0;
    let mouseY = 0;
    let lerpedX = 0;
    let lerpedY = 0;
    let rafId = 0;

    const onMove = (e: MouseEvent) => {
      mouseX = (e.clientX / window.innerWidth) * 18 - 9;
      mouseY = (e.clientY / window.innerHeight) * 14 - 7;
    };

    const tick = () => {
      lerpedX += (mouseX - lerpedX) * 0.05;
      lerpedY += (mouseY - lerpedY) * 0.05;
      if (hostRef.current) {
        hostRef.current.style.transform = `translate3d(${lerpedX.toFixed(2)}px, ${lerpedY.toFixed(2)}px, 0) rotate(${(lerpedX * 0.14).toFixed(2)}deg)`;
      }
      rafId = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    rafId = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(rafId);
    };
  }, [interactive]);

  return (
    <span ref={hostRef} className={`wt-logo ${compact ? "is-compact" : ""} ${className}`}>
      <LabelEmojiIcon size={compact ? 26 : 54} />
      <span className="wt-wordmark">
        <span>web</span>
        <span className="wt-wordmark-accent">tag</span>
      </span>
    </span>
  );
}
