export type CheckinTone = "success" | "warning" | "denied";

let _ctx: AudioContext | null = null;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (_ctx) return _ctx;
  const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Ctor) return null;
  _ctx = new Ctor();
  return _ctx;
}

interface ToneStep {
  freq: number;
  duration: number;
  type?: OscillatorType;
}

const TONES: Record<CheckinTone, ToneStep[]> = {
  success: [
    { freq: 880, duration: 0.07, type: "sine" },
    { freq: 1320, duration: 0.11, type: "sine" },
  ],
  warning: [
    { freq: 660, duration: 0.13, type: "triangle" },
    { freq: 660, duration: 0.13, type: "triangle" },
  ],
  denied: [
    { freq: 220, duration: 0.18, type: "square" },
    { freq: 165, duration: 0.18, type: "square" },
  ],
};

const GAP = 0.03;

function clampVolume(v: number): number {
  if (!Number.isFinite(v)) return 0.8;
  return Math.min(1, Math.max(0, v));
}

export function playCheckinTone(tone: CheckinTone, volume = 0.8): void {
  const ctx = ensureCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
  }

  const steps = TONES[tone];
  const vol = clampVolume(volume);
  if (vol === 0) return;

  let startAt = ctx.currentTime;
  for (const step of steps) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = step.type ?? "sine";
    osc.frequency.value = step.freq;

    const peak = vol * 0.35;
    const attack = 0.01;
    const release = Math.min(0.04, step.duration * 0.4);
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(peak, startAt + attack);
    gain.gain.setValueAtTime(peak, startAt + step.duration - release);
    gain.gain.linearRampToValueAtTime(0, startAt + step.duration);

    osc.connect(gain).connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + step.duration + 0.02);
    startAt += step.duration + GAP;
  }
}

export function unlockAudio(): void {
  const ctx = ensureCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
  }
}
