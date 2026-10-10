/**
 * sfx · synthesized game audio (WebAudio, zero assets, ~1kb).
 * Every sound is generated: coin pings, crash thuds, turbo sweeps, fill
 * cha-chings. Muted state persists (rtn-mute). Safe to call anywhere ·
 * silently no-ops server-side or before the first user gesture.
 */

let ctx: AudioContext | null = null;
const ac = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  return ctx;
};

// iOS unlock · the full ritual. iOS requires the AudioContext to be CREATED
// (not just resumed) inside a real user gesture, and playing a silent buffer
// is the classic kick that opens the hardware channel. Android is lenient.
if (typeof window !== "undefined") {
  let unlocked = false;
  let mediaEl: HTMLAudioElement | null = null;
  const unlock = () => {
    try {
      // iOS SILENT-SWITCH fix: WebAudio counts as "sounds" (muted by the ringer
      // switch) unless a real <audio> element is playing · that flips the audio
      // session to "playback". Loop a silent wav element alongside the context.
      if (!mediaEl) {
        mediaEl = new Audio(
          "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA",
        );
        mediaEl.loop = true;
        mediaEl.volume = 0.01;
        (mediaEl as unknown as { playsInline?: boolean }).playsInline = true;
        void mediaEl.play().catch(() => {
          mediaEl = null; // retry on the next gesture
        });
      }
      if (!ctx) {
        const AC =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AC) ctx = new AC();
      }
      if (!ctx) return;
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
      if (!unlocked && ctx.state !== "closed") {
        // silent one-sample buffer · the iOS hardware-channel opener
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
        unlocked = true;
      }
    } catch {
      /* audio stays best-effort */
    }
  };
  window.addEventListener("touchstart", unlock, { passive: true });
  window.addEventListener("touchend", unlock, { passive: true });
  window.addEventListener("pointerup", unlock, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
  });
}

export const isMuted = () =>
  typeof window !== "undefined" && localStorage.getItem("rtn-mute") === "1";
export const setMuted = (m: boolean) => localStorage.setItem("rtn-mute", m ? "1" : "0");

function tone(
  freq: number,
  dur: number,
  type: OscillatorType = "sine",
  gain = 0.08,
  slideTo?: number,
  delay = 0,
) {
  const a = ac();
  if (!a || isMuted()) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur: number, gain = 0.12, lowpass = 800) {
  const a = ac();
  if (!a || isMuted()) return;
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = lowpass;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start();
}

/** Ambient synth loop · a soft pad arpeggio. start() is idempotent. */
let musicTimer: ReturnType<typeof setInterval> | null = null;
export const music = {
  get playing() {
    return musicTimer != null;
  },
  start() {
    if (musicTimer || typeof window === "undefined") return;
    // synthwave drive: pumping bass eighth-notes, off-beat hats, a slow arp ·
    // A minor, 128bpm-ish. All synthesized, ~0 bytes.
    let barN = 0;
    const bar = () => {
      if (isMuted()) return;
      const roots = [55, 55, 43.65, 65.41]; // A A F C · the night-drive turnaround
      const root = roots[barN % 4];
      barN++;
      const eighth = 0.234;
      for (let i = 0; i < 8; i++) {
        // pumping bass (sidechain feel via short decay)
        tone(root, 0.19, "sawtooth", i % 2 === 0 ? 0.05 : 0.035, undefined, i * eighth);
        // off-beat hat
        if (i % 2 === 1) {
          const d = i * eighth;
          setTimeout(() => !isMuted() && noise(0.03, 0.02, 7000), d * 1000);
        }
      }
      // slow arp over the top (root, 5th, octave, 10th)
      [1, 1.5, 2, 2.4].forEach((m, i) =>
        tone(root * 4 * m, 0.42, "triangle", 0.014, undefined, i * eighth * 2),
      );
      // airy pad root
      tone(root * 2, 1.85, "sine", 0.018);
    };
    bar();
    musicTimer = setInterval(bar, 1875);
  },
  stop() {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
  },
};

/**
 * Engine · a continuous synthesized motor. Two detuned saws + sub sine through
 * a lowpass; pitch/brightness track speed, a throttle blip revs it. Cheap,
 * assetless, and it makes the car feel ALIVE.
 */
let eng: {
  o1: OscillatorNode;
  o2: OscillatorNode;
  sub: OscillatorNode;
  filt: BiquadFilterNode;
  g: GainNode;
} | null = null;
export const engine = {
  start() {
    const a = ac();
    if (!a || eng) return;
    const o1 = a.createOscillator();
    const o2 = a.createOscillator();
    const sub = a.createOscillator();
    o1.type = "sawtooth";
    o2.type = "sawtooth";
    sub.type = "sine";
    o1.frequency.value = 55;
    o2.frequency.value = 55 * 1.007; // detune = growl
    sub.frequency.value = 27.5;
    const filt = a.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 300;
    filt.Q.value = 2.5;
    const g = a.createGain();
    g.gain.value = 0; // fade in via update()
    o1.connect(filt);
    o2.connect(filt);
    sub.connect(g);
    filt.connect(g).connect(a.destination);
    o1.start();
    o2.start();
    sub.start();
    eng = { o1, o2, sub, filt, g };
  },
  /** speed01 in [0,1]; throttle in {-1,0,1}. Call every frame-ish. */
  update(speed01: number, throttle: number) {
    const a = ac();
    if (!a || !eng) return;
    if (isMuted()) {
      eng.g.gain.value = 0;
      return;
    }
    const rev = throttle > 0 ? 1.13 : throttle < 0 ? 0.94 : 1;
    // simple gear illusion: pitch cycles within bands as speed climbs
    const gearPos = (speed01 * 3.2) % 1;
    const f = (46 + speed01 * 60 + gearPos * 26) * rev;
    const t = a.currentTime;
    eng.o1.frequency.setTargetAtTime(f, t, 0.08);
    eng.o2.frequency.setTargetAtTime(f * 1.007, t, 0.08);
    eng.sub.frequency.setTargetAtTime(f / 2, t, 0.1);
    eng.filt.frequency.setTargetAtTime(240 + speed01 * 900 + (throttle > 0 ? 350 : 0), t, 0.1);
    eng.g.gain.setTargetAtTime(0.028 + speed01 * 0.03 + (throttle > 0 ? 0.012 : 0), t, 0.15);
  },
  stop() {
    const a = ac();
    if (!eng) return;
    const e = eng;
    eng = null;
    if (a) {
      e.g.gain.setTargetAtTime(0, a.currentTime, 0.08);
      setTimeout(() => {
        try {
          e.o1.stop();
          e.o2.stop();
          e.sub.stop();
        } catch {
          /* already stopped */
        }
      }, 350);
    }
  },
};

export const sfx = {
  coin() {
    tone(1046, 0.09, "sine", 0.07);
    tone(1568, 0.12, "sine", 0.06, undefined, 0.06);
  },
  crash() {
    noise(0.35, 0.16, 500);
    tone(110, 0.3, "sawtooth", 0.1, 55);
  },
  dodge() {
    tone(660, 0.08, "triangle", 0.06, 990);
  },
  draft() {
    tone(523, 0.1, "sine", 0.06);
    tone(784, 0.14, "sine", 0.06, undefined, 0.07);
  },
  turbo() {
    tone(200, 0.5, "sawtooth", 0.07, 900);
  },
  cascade() {
    tone(440, 0.18, "square", 0.06);
    tone(349, 0.18, "square", 0.06, undefined, 0.2);
    tone(440, 0.18, "square", 0.06, undefined, 0.4);
  },
  fill() {
    tone(587, 0.07, "sine", 0.07);
    tone(880, 0.12, "sine", 0.07, undefined, 0.05);
  },
  runOver() {
    tone(392, 0.25, "triangle", 0.08);
    tone(311, 0.25, "triangle", 0.08, undefined, 0.22);
    tone(233, 0.45, "triangle", 0.08, undefined, 0.44);
  },
  click() {
    tone(880, 0.04, "square", 0.03);
  },
};
