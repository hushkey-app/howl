/**
 * The site's sound design — a tiny Web Audio synth rather than audio files, so
 * there is nothing to download, nothing to cache-bust and no decode latency on
 * the first tap.
 *
 * Everything is short and quiet, pitched around one small set of notes so
 * repeated interaction never turns into noise. There is no mute control: the
 * context cannot start before a gesture anyway, and at these levels a switch
 * for it is more chrome than it is worth.
 */

/** The named voices the UI can trigger. */
export type Voice = "tap" | "hover" | "open" | "close" | "chip-on" | "chip-off";

let audio: AudioContext | null = null;
let master: GainNode | null = null;
let lastHover = 0;

function ensureContext(): AudioContext | null {
  if (typeof globalThis.window === "undefined") return null;

  if (!audio) {
    const Ctor = globalThis.AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audio = new Ctor();
    master = audio.createGain();
    master.gain.value = 0.4;
    // A gentle shelf keeps the clicks from sounding brittle on laptop speakers.
    const shelf = audio.createBiquadFilter();
    shelf.type = "highshelf";
    shelf.frequency.value = 6000;
    shelf.gain.value = -6;
    master.connect(shelf).connect(audio.destination);
  }
  if (audio.state === "suspended") void audio.resume();
  return audio;
}

interface ToneSpec {
  /** Starting frequency in Hz. */
  freq: number;
  /** Frequency glided to over the tone's life, when it should bend. */
  glide?: number;
  /** Peak gain before the envelope decays. */
  gain: number;
  /** Total length in seconds. */
  length: number;
  /** Oscillator shape. */
  type?: OscillatorType;
  /** Seconds to wait before the tone starts — used to build small arpeggios. */
  delay?: number;
}

function tone(ctx: AudioContext, spec: ToneSpec): void {
  const at = ctx.currentTime + (spec.delay ?? 0);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = spec.type ?? "sine";
  osc.frequency.setValueAtTime(spec.freq, at);
  if (spec.glide) osc.frequency.exponentialRampToValueAtTime(spec.glide, at + spec.length);

  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(spec.gain, at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + spec.length);

  osc.connect(gain).connect(master!);
  osc.start(at);
  osc.stop(at + spec.length + 0.02);
}

/** A whisper of filtered noise — the "body" of a physical click. */
function transient(ctx: AudioContext, gainValue: number, length = 0.05): void {
  const at = ctx.currentTime;
  const frames = Math.floor(ctx.sampleRate * length);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 3;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 2200;
  band.Q.value = 1.1;

  const gain = ctx.createGain();
  gain.gain.value = gainValue;

  source.connect(band).connect(gain).connect(master!);
  source.start(at);
}

/**
 * Play one of the named voices. Silent when the browser has no Web Audio or
 * when called during SSR — callers never need to guard.
 */
export function playSound(voice: Voice): void {
  const ctx = ensureContext();
  if (!ctx) return;

  switch (voice) {
    case "tap":
      transient(ctx, 0.05);
      tone(ctx, { freq: 523.25, glide: 392, gain: 0.08, length: 0.09, type: "triangle" });
      break;
    case "hover": {
      // Rate-limited: a grid of cards would otherwise chatter under the cursor.
      const now = performance.now();
      if (now - lastHover < 90) return;
      lastHover = now;
      tone(ctx, { freq: 1244.5, gain: 0.015, length: 0.045 });
      break;
    }
    case "open":
      transient(ctx, 0.035, 0.08);
      tone(ctx, { freq: 392, gain: 0.07, length: 0.16, type: "triangle" });
      tone(ctx, { freq: 587.33, gain: 0.055, length: 0.22, delay: 0.06 });
      break;
    case "close":
      tone(ctx, { freq: 587.33, gain: 0.055, length: 0.14 });
      tone(ctx, { freq: 349.23, gain: 0.05, length: 0.22, type: "triangle", delay: 0.05 });
      break;
    case "chip-on":
      transient(ctx, 0.03, 0.03);
      tone(ctx, { freq: 659.25, glide: 987.77, gain: 0.05, length: 0.1 });
      break;
    case "chip-off":
      transient(ctx, 0.025, 0.03);
      tone(ctx, { freq: 659.25, glide: 415.3, gain: 0.045, length: 0.1 });
      break;
  }
}
