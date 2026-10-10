/**
 * Social layer · share cards + gameplay clips, all client-side.
 *
 * shareCard(): renders a branded 1080×1350 (4:5, feed-native) PNG stat card
 * on an offscreen canvas and hands it to the OS share sheet (Web Share API)
 * or downloads it. No servers, no cost.
 *
 * ClipRecorder: MediaRecorder over canvas.captureStream() · records real
 * gameplay to a .webm the user can post to TikTok/Reels/X. Auto-stops at 45s.
 */

export interface ShareStats {
  headline: string; // e.g. "$27,400"
  headlineLabel: string; // e.g. "volume farmed"
  lines: [string, string][]; // label/value rows
  mode: string; // e.g. "TURBO 3D · live ETH"
  live: boolean;
}

export async function shareCard(s: ShareStats): Promise<void> {
  const W = 1080;
  const H = 1350;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const x = cv.getContext("2d")!;

  // backdrop · night gradient + faint terrain line + glow sun
  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0b1014");
  bg.addColorStop(0.65, "#0d1512");
  bg.addColorStop(1, "#06090a");
  x.fillStyle = bg;
  x.fillRect(0, 0, W, H);
  const sun = x.createRadialGradient(W * 0.78, H * 0.42, 10, W * 0.78, H * 0.42, 360);
  sun.addColorStop(0, "rgba(39,242,164,.22)");
  sun.addColorStop(1, "rgba(39,242,164,0)");
  x.fillStyle = sun;
  x.fillRect(0, 0, W, H);
  x.strokeStyle = "#27f2a4";
  x.lineWidth = 5;
  x.shadowColor = "#27f2a4";
  x.shadowBlur = 24;
  x.beginPath();
  for (let i = 0; i <= 40; i++) {
    const px = (i / 40) * W;
    const py =
      H * 0.46 + Math.sin(i * 0.55) * 36 + Math.sin(i * 1.7) * 14 - i * 2.2;
    if (i === 0) x.moveTo(px, py);
    else x.lineTo(px, py);
  }
  x.stroke();
  x.shadowBlur = 0;

  const MONO = "'Geist Mono','SFMono-Regular',Menlo,monospace";
  // brand
  x.font = `800 64px ${MONO}`;
  x.fillStyle = "#e8ede9";
  x.fillText("HYPE", 72, 132);
  const w1 = x.measureText("HYPE").width;
  x.fillStyle = "#27f2a4";
  x.fillText("RIDER", 72 + w1, 132);
  x.font = `500 30px ${MONO}`;
  x.fillStyle = "#8a938c";
  x.fillText(s.mode, 72, 184);
  if (s.live) {
    x.fillStyle = "#27f2a4";
    x.fillText("● LIVE TRADES", W - 320, 132);
  }

  // headline stat
  x.font = `500 34px ${MONO}`;
  x.fillStyle = "#8a938c";
  x.fillText(s.headlineLabel.toUpperCase(), 72, H * 0.56);
  x.font = `800 150px ${MONO}`;
  x.fillStyle = "#27f2a4";
  x.shadowColor = "#27f2a4";
  x.shadowBlur = 30;
  x.fillText(s.headline, 66, H * 0.56 + 150);
  x.shadowBlur = 0;

  // stat rows
  let y = H * 0.56 + 240;
  x.font = `500 36px ${MONO}`;
  for (const [label, value] of s.lines) {
    x.fillStyle = "#8a938c";
    x.fillText(label, 72, y);
    x.fillStyle = "#e8ede9";
    x.fillText(value, 520, y);
    y += 62;
  }

  // footer
  x.fillStyle = "#8a938c";
  x.font = `500 32px ${MONO}`;
  x.fillText("ride the market · ride-the-now.vercel.app", 72, H - 72);

  const blob = await new Promise<Blob>((res) => cv.toBlob((b) => res(b!), "image/png"));
  const file = new File([blob], "hyperider-run.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Hyperider", text: "My Hyperider run 🏍️" });
      return;
    } catch {
      /* user cancelled → fall through to download */
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "hyperider-run.png";
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Records gameplay straight off the canvas. One instance per session. */
export class ClipRecorder {
  private rec: MediaRecorder | null = null;
  private mime = "video/webm";
  private chunks: Blob[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  recording = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private onStop?: () => void,
    private maxMs = 45_000,
  ) {}

  start() {
    if (this.recording) return;
    const stream = this.canvas.captureStream(30);
    // mp4 uploads clean everywhere (X/TikTok/Reels); webm is the fallback
    const mime = MediaRecorder.isTypeSupported("video/mp4")
      ? "video/mp4"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";
    this.mime = mime;
    this.rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
    this.chunks = [];
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.onstop = () => {
      const blob = new Blob(this.chunks, { type: this.mime.split(";")[0] });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = this.mime.startsWith("video/mp4") ? "hyperider-clip.mp4" : "hyperider-clip.webm";
      a.click();
      URL.revokeObjectURL(a.href);
      this.recording = false;
      this.onStop?.();
    };
    this.rec.start(1000);
    this.recording = true;
    this.timer = setTimeout(() => this.stop(), this.maxMs); // TikTok-length cap
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    if (this.rec && this.rec.state !== "inactive") this.rec.stop();
  }
}

/** Prefilled X post: run stats + the rider's invite link. Opens the intent. */
export function postToX(headline: string, points: number, volumeUsd: number, link: string) {
  const text =
    `just farmed ${headline} riding live perp markets on HYPERIDER 🏁\n` +
    `⭐ ${points.toLocaleString()} pts · $${Math.round(volumeUsd).toLocaleString()} real volume\n` +
    `the perp game where you can't blow up · ride with me:`;
  window.open(
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`,
    "_blank",
  );
}

/* ── 🎬 AUTO-HIGHLIGHTS · the moment clips itself ─────────────────────────
   A rider mid-passenger (or mid-stream) is not going to reach for a record
   button before a portal chain lands — the clip has to already exist. Two
   MediaRecorders run staggered 40s segments (20s apart), so at any instant
   the older one holds at least 20 seconds of context. When the world
   produces a moment, the older segment records five more seconds — the
   moment AND its payoff — then downloads itself, named for the event.

   MediaRecorder chunks only play from their init segment, which is why this
   rotates whole recorders instead of trying to splice a ring of chunks. */
export class HighlightRecorder {
  private a: MediaRecorder | null = null;
  private b: MediaRecorder | null = null;
  private aChunks: Blob[] = [];
  private bChunks: Blob[] = [];
  private aStart = 0;
  private bStart = 0;
  private rot: ReturnType<typeof setInterval> | null = null;
  private mime = "video/webm";
  private stream: MediaStream | null = null;
  private capturing = false;
  armed = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private onClip?: (name: string) => void,
  ) {}

  private newRec(which: "a" | "b") {
    if (!this.stream) return;
    const rec = new MediaRecorder(this.stream, {
      mimeType: this.mime,
      videoBitsPerSecond: 6_000_000,
    });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    if (which === "a") {
      this.a = rec;
      this.aChunks = chunks;
      this.aStart = Date.now();
    } else {
      this.b = rec;
      this.bChunks = chunks;
      this.bStart = Date.now();
    }
    rec.start(1000);
  }

  arm() {
    if (this.armed) return;
    this.stream = this.canvas.captureStream(30);
    this.mime = MediaRecorder.isTypeSupported("video/mp4")
      ? "video/mp4"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";
    this.newRec("a");
    setTimeout(() => this.armed && this.newRec("b"), 20_000);
    // every 20s, restart whichever segment is OLDER · 40s max each
    this.rot = setInterval(() => {
      if (this.capturing) return; // never rotate away a segment mid-capture
      const which = this.aStart <= this.bStart ? "a" : "b";
      const rec = which === "a" ? this.a : this.b;
      try {
        if (rec && rec.state !== "inactive") {
          rec.onstop = null;
          rec.stop();
        }
      } catch {
        /* a dead recorder is replaced either way */
      }
      this.newRec(which);
    }, 20_000);
    this.armed = true;
  }

  /** The world produced a moment · capture the older segment + 5s of payoff. */
  highlight(name: string) {
    if (!this.armed || this.capturing) return;
    const which = this.aStart <= this.bStart && this.a ? "a" : "b";
    const rec = which === "a" ? this.a : this.b;
    const chunks = which === "a" ? this.aChunks : this.bChunks;
    if (!rec || rec.state === "inactive") return;
    this.capturing = true;
    setTimeout(() => {
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: this.mime.split(";")[0] });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        const ext = this.mime.startsWith("video/mp4") ? "mp4" : "webm";
        a.download = `hyperider-${name}-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}.${ext}`;
        a.click();
        URL.revokeObjectURL(a.href);
        this.onClip?.(name);
        this.newRec(which); // the lane goes straight back into rotation
        this.capturing = false;
      };
      try {
        rec.stop();
      } catch {
        this.capturing = false;
      }
    }, 5_000);
  }

  disarm() {
    this.armed = false;
    if (this.rot) clearInterval(this.rot);
    for (const rec of [this.a, this.b]) {
      try {
        if (rec && rec.state !== "inactive") {
          rec.onstop = null;
          rec.stop();
        }
      } catch {
        /* already gone */
      }
    }
    this.a = this.b = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.capturing = false;
  }
}
