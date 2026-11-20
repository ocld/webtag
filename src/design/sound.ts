// web audio oscillator synthesizer for optional ui click feedback

let audioCtx: AudioContext | null = null;
let enabled = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  if (audioCtx && audioCtx.state === "suspended") {
    void audioCtx.resume();
  }
  return audioCtx;
}

export function isSoundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(value: boolean): void {
  enabled = value;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("webtag-sound", value ? "1" : "0");
    } catch {
      // ignore storage quota or privacy mode errors
    }
  }
}

export function initSoundPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    enabled = localStorage.getItem("webtag-sound") === "1";
  } catch {
    enabled = false;
  }
  return enabled;
}

export function playTick(type: "click" | "success" | "pop" | "error" = "click"): void {
  if (!enabled) return;
  const ctx = getCtx();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  if (type === "click") {
    osc.type = "triangle";
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.025);
    gain.gain.setValueAtTime(0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.028);
    osc.start(now);
    osc.stop(now + 0.03);
  } else if (type === "pop") {
    osc.type = "sine";
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.055);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.06);
    osc.start(now);
    osc.stop(now + 0.065);
  } else if (type === "success") {
    osc.type = "sine";
    osc.frequency.setValueAtTime(523.25, now);
    osc.frequency.setValueAtTime(659.25, now + 0.06);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.16);
    osc.start(now);
    osc.stop(now + 0.17);
  } else {
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.09);
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.1);
    osc.start(now);
    osc.stop(now + 0.11);
  }
}
