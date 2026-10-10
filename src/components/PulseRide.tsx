"use client";

/**
 * PulseRide · cartridge 03, 🎵 PULSE. The market's heartbeat as a rhythm run.
 *
 * A neon tunnel whose TEMPO is the tape: BPM breathes with real |flow|
 * (calm ≈ 80, frenzy ≈ 150). Pads land on the beat in three lanes and the
 * lanes are the SAME honest positions as every cartridge:
 *
 *     LEFT = SHORT · CENTER = FLAT · RIGHT = LONG
 *
 * The flow-aligned lane grows pay-pads; the against-flow lane grows red
 * BARRIERS (the tunnel's trucks). Hit pads on the beat, PERFECT inside the
 * tight window pays double. Three barrier strikes end the run and the real
 * position auto-flattens, the same safety reflex as a crash or a wipeout.
 * 💎 gems drop on real flow jerks · the tunnel shifts hue on regime flips.
 *
 * Trade wiring identical to Ride/Surfer: lane changes route into LiveLayer's
 * setTargetRef (+1 right / 0 center / −1 left); exit/pause/strike flatten.
 */
import { HighlightRecorder } from "@/lib/share";
import { useBroadcast, CastLowerThird, CastToggle, CastCaptions } from "./BroadcastLayer";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { LiveFeed } from "@/lib/game/liveFeed";
import { loadGlb, fitTo, tintAll } from "@/lib/game/glb";
import { sfx, isMuted } from "@/lib/game/sfx";
import { saveRide, coachTip, career, type RideRecord } from "@/lib/game/rideLog";
import { aiCoach } from "@/lib/game/aiCoach";
import { submitRide } from "@/lib/game/backend";
import { bumpBounty } from "@/lib/game/bounties";

type Lane = 0 | 1 | 2; // 0 SHORT · 1 FLAT · 2 LONG
const LANE_X = [-3.1, 0, 3.1];

export default function PulseRide({
  onExit,
  setTargetRef,
  flattenRef,
  realRef,
  armed = false,
  mode = "turbo",
}: {
  onExit: () => void;
  setTargetRef?: React.RefObject<((side: number) => void) | null>;
  flattenRef?: React.RefObject<(() => void) | null>;
  realRef?: React.RefObject<{
    volume: number;
    fees: number;
    fills: number;
    pnl: number;
    last: string | null;
    grid?: unknown;
    note?: string | null;
  } | null>;
  armed?: boolean;
  mode?: "cruise" | "turbo" | "passenger";
}) {
  const wrapRef = useRef<HTMLDivElement>(null);

  // 🎯 ENGINE STATUS (parity with Ride) · plain-words read of the armed engine
  const [engineStatus, setEngineStatus] = useState<null | { head: string; line: string }>(null);
  useEffect(() => {
    if (!armed) {
      setEngineStatus(null);
      return;
    }
    const iv = setInterval(() => {
      const r = realRef?.current as (typeof realRef extends React.RefObject<infer T> ? T : never) | null;
      if (!r) return;
      const rec = r as { asset?: string; note?: string | null; pending?: number | null; fills: number; last: string | null; vol30?: number | null; est?: string | null };
      const head = `${rec.asset ?? "…"}`;
      let line: string;
      if (rec.note) line = rec.note;
      else if (rec.pending && rec.pending > 0) line = `${rec.pending} quote${rec.pending > 1 ? "s" : ""} resting, fills pay the spread · hang tight`;
      else if (rec.fills > 0 && rec.last) line = `last: ${rec.last}`;
      else if (rec.vol30 != null && rec.est) line = `watching the book · ${rec.vol30.toFixed(1)}bps · ~${rec.est}/$1M this hour`;
      else line = "engine warming up · first action lands within a minute";
      setEngineStatus({ head, line });
    }, 1500);
    return () => clearInterval(iv);
  }, [armed, realRef]);
  const [hud, setHud] = useState({
    bars: 0,
    bpm: 80,
    score: 0,
    hits: 0,
    perfects: 0,
    lane: 1 as Lane,
    x: 0, // where the ship really is across the tube · rails at ±3.1
    combo: 1,
    strikes: 0,
    flow: 0,
    ghost: null as number | null, // dollars vs your best-run pace · + = ghost ahead
  });
  const [buzz, setBuzz] = useState<string[]>([]);
  // 📺 shared broadcast voice · same lower-third law as the flagship
  const { broadcast, setBroadcast, cast, pushCast } = useBroadcast(true);
  const pushCastRef = useRef(pushCast);
  pushCastRef.current = pushCast;
  /* 🎬 auto-highlights ride with the broadcast · same law as the flagship */
  const hlRef = useRef<HighlightRecorder | null>(null);
  useEffect(() => {
    const on = mode === "passenger" && broadcast;
    if (on && !hlRef.current) {
      const canvas = wrapRef.current?.querySelector("canvas");
      if (canvas) {
        hlRef.current = new HighlightRecorder(canvas as HTMLCanvasElement, () =>
          pushCastRef.current?.("🎬 highlight saved to your downloads · post it"),
        );
        hlRef.current.arm();
      }
    } else if (!on && hlRef.current) {
      hlRef.current.disarm();
      hlRef.current = null;
    }
    return () => {
      hlRef.current?.disarm();
      hlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, broadcast]);
  const hlRefCall = useRef<((n: string) => void) | null>(null);
  hlRefCall.current = (n: string) => hlRef.current?.highlight(n);
  const [pop, setPop] = useState<null | { txt: string; color: string; id: number }>(null);
  const [over, setOver] = useState<null | {
    bars: number;
    score: number;
    hits: number;
    perfects: number;
    best$: number | null;
  }>(null);
  const [paused, setPaused] = useState(false);
  // 🧭 the co-driver's read of the set · AI when it answers, the rule-based
  // line otherwise — the same voice the car's run-over card has
  const [overRec, setOverRec] = useState<RideRecord | null>(null);
  const [aiTip, setAiTip] = useState<string | null>(null);
  // first-open card · one idea, plain words (mirrors Ride's rtn-3d-tut)
  const [tut, setTut] = useState(
    () => typeof window !== "undefined" && !localStorage.getItem("rtn-pulse-tut"));
  const pausedRef = useRef(false);
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  const armedRef = useRef(armed);
  useEffect(() => {
    armedRef.current = armed;
  }, [armed]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    /* ------------------------------ scene ------------------------------ */
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090714);
    scene.fog = new THREE.Fog(0x090714, 40, 190);
    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 300);
    camera.position.set(0, 0.6, 10);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    wrap.appendChild(renderer.domElement);
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.55, 0.25);
    composer.addPass(bloom);
    const fit = () => {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
    };
    fit();
    addEventListener("resize", fit);
    scene.add(new THREE.AmbientLight(0x334, 1.2));

    /* ------------------------------ tunnel ------------------------------ */
    const RINGS = 26;
    const RING_DZ = 7;
    const ringGeo = new THREE.TorusGeometry(7.2, 0.1, 8, 48);
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < RINGS; i++) {
      const m = new THREE.Mesh(
        ringGeo,
        new THREE.MeshStandardMaterial({ color: 0x0a0a18, emissive: 0x27f2a4, emissiveIntensity: 0.7 }));
      m.position.z = -i * RING_DZ;
      m.rotation.z = i * 0.12;
      scene.add(m);
      rings.push(m);
    }
    // 💠 CRYSTAL GATES · real crystal pillars flank the tunnel every ~45m and
    // sweep past, the tube has LANDMARKS now, not just wireframe rings
    const gates: THREE.Object3D[] = [];
    void loadGlb("/models/crystal.glb")
      .then((m) => {
        for (let i = 0; i < 8; i++) {
          const side = i % 2 === 0 ? -1 : 1;
          const c = m.clone(true);
          c.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh && mesh.material) {
              mesh.material = Array.isArray(mesh.material)
                ? mesh.material.map((x) => x.clone())
                : (mesh.material as THREE.Material).clone();
              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              for (const mat of mats) {
                const std = mat as THREE.MeshStandardMaterial;
                if (std.color) std.color.setHex(0x120a26);
                if (std.emissive) {
                  std.emissive.setHex(0x8a7bff);
                  std.emissiveIntensity = 1.1;
                }
              }
            }
          });
          fitTo(c, 4.6 + (i % 3) * 1.4, "y");
          c.position.set(side * 5.6, -3.8, -20 - i * 22);
          c.rotation.y = Math.random() * Math.PI * 2;
          c.rotation.z = side * 0.18; // leaning INTO the tube like standing stones
          scene.add(c);
          gates.push(c);
        }
      })
      .catch(() => {});
    /* 🎇 TUNNEL EVENTS (parity with Ride's weather) · COLOR STORM: the rings
     * hue-cycle wildly and the dust accelerates. BLACKOUT: the tube goes dark
     * except the crystal gates, then breathes back. Announced via the feed. */
    let tunnelEvent: "colorstorm" | "blackout" | null = null;
    let tunnelT = 0;
    let tunnelNext = 60_000 + Math.random() * 45_000;
    // floor lane guides · three faint rails at the tube's bottom
    const railGeo = new THREE.BoxGeometry(0.14, 0.04, RINGS * RING_DZ);
    const rails: THREE.Mesh[] = [];
    for (const x of LANE_X) {
      const r = new THREE.Mesh(
        railGeo,
        new THREE.MeshStandardMaterial({ color: 0x0a0a18, emissive: 0x2a3550, emissiveIntensity: 1 }));
      r.position.set(x, -4.1, -(RINGS * RING_DZ) / 2 + 10);
      scene.add(r);
      rails.push(r);
    }
    // rushing star dust
    const dustN = 300;
    const dustPos = new Float32Array(dustN * 3);
    for (let i = 0; i < dustN; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 5 + Math.random() * 2.4;
      dustPos[i * 3] = Math.cos(a) * r;
      dustPos[i * 3 + 1] = Math.sin(a) * r;
      dustPos[i * 3 + 2] = -Math.random() * 180;
    }
    const dust = new THREE.Points(
      new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(dustPos, 3)),
      new THREE.PointsMaterial({ color: 0x8fa4c8, size: 0.12, transparent: true, opacity: 0.7 }));
    scene.add(dust);

    /* ------------------------------ runner ------------------------------ */
    const runner = new THREE.Group();
    const shipMat = new THREE.MeshStandardMaterial({
      color: 0x101418,
      roughness: 0.35,
      metalness: 0.6,
      emissive: 0xff7a1a,
      emissiveIntensity: 0.9,
    });
    // A real craft, not a cone: fuselage + canopy + swept wings + twin
    // engine nacelles whose glow IS the throttle read. Same silhouette
    // language as the flagship's cars — recognizable at one glance.
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x181c26, roughness: 0.3, metalness: 0.75 });
    const ship = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.1, 6, 12), shipMat);
    ship.rotation.x = -Math.PI / 2;
    ship.scale.set(1, 1, 0.62); // flattened belly — a hull, not a pill
    runner.add(ship);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.7, 10), hullMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -1.15;
    runner.add(nose);
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.21, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x0a1420, roughness: 0.1, metalness: 0.4, emissive: 0x6ab8ff, emissiveIntensity: 0.7 }));
    canopy.position.set(0, 0.2, -0.28);
    canopy.scale.set(1, 0.8, 1.5);
    runner.add(canopy);
    const wingGeo = new THREE.BoxGeometry(1.05, 0.05, 0.5);
    for (const s of [-1, 1] as const) {
      const wing = new THREE.Mesh(wingGeo, hullMat);
      wing.position.set(s * 0.72, -0.06, 0.32);
      wing.rotation.z = s * 0.16; // dihedral
      wing.rotation.y = s * -0.38; // sweep
      runner.add(wing);
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.3), hullMat);
      fin.position.set(s * 1.12, 0.1, 0.44);
      runner.add(fin);
    }
    const engineMat = new THREE.MeshStandardMaterial({ color: 0x0a0a18, emissive: 0xffa24d, emissiveIntensity: 1.8 });
    const engines: THREE.Mesh[] = [];
    for (const s of [-1, 1] as const) {
      const nac = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.55, 10), hullMat);
      nac.rotation.x = Math.PI / 2;
      nac.position.set(s * 0.42, -0.08, 0.62);
      runner.add(nac);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 8), engineMat);
      flame.rotation.x = Math.PI / 2;
      flame.position.set(s * 0.42, -0.08, 1.05);
      runner.add(flame);
      engines.push(flame);
    }
    runner.position.set(0, -3.4, 0);
    scene.add(runner);
    // trail
    const trailN = 40;
    const trailPos = new Float32Array(trailN * 3);
    const trail = new THREE.Points(
      new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(trailPos, 3)),
      new THREE.PointsMaterial({ color: 0xffa24d, size: 0.2, transparent: true, opacity: 0.8 }));
    scene.add(trail);

    /* ------------------------------ notes ------------------------------ */
    interface Note {
      mesh: THREE.Object3D; // gems may be real crystal models (Groups)
      lane: Lane;
      kind: "pad" | "barrier" | "gem";
      hit: boolean;
    }
    const notes: Note[] = [];
    const padGeo = new THREE.BoxGeometry(2.2, 0.22, 1.1);
    const padMat = new THREE.MeshStandardMaterial({ color: 0x062018, emissive: 0x27f2a4, emissiveIntensity: 1.6 });
    const padMatCold = new THREE.MeshStandardMaterial({ color: 0x081a2a, emissive: 0x6ab8ff, emissiveIntensity: 1.5 });
    const barrierGeo = new THREE.BoxGeometry(2.4, 3.2, 0.5);
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0x220206, emissive: 0xff2a3c, emissiveIntensity: 1.7 });
    const gemGeo = new THREE.OctahedronGeometry(0.65, 0);
    const gemMat = new THREE.MeshStandardMaterial({ color: 0x241f4a, emissive: 0xa9a3ff, emissiveIntensity: 2.2 });
    // whale gems become real crystal clusters when the model lands
    let gemTpl: THREE.Object3D | null = null;
    void loadGlb("/models/crystal.glb")
      .then((m) => {
        fitTo(m, 1.4, "x");
        tintAll(m, 0xa9a3ff, 0.6);
        m.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const mat of mats) {
              const std = mat as THREE.MeshStandardMaterial;
              if (std.emissive) {
                std.emissive.setHex(0xa9a3ff);
                std.emissiveIntensity = 1.8;
              }
            }
          }
        });
        gemTpl = m;
      })
      .catch(() => {});
    const SPAWN_Z = -150;
    const spawnNote = (kind: Note["kind"], lane: Lane) => {
      const mesh: THREE.Object3D =
        kind === "gem" && gemTpl
          ? gemTpl.clone(true)
          : new THREE.Mesh(
              kind === "pad" ? padGeo : kind === "barrier" ? barrierGeo : gemGeo,
              kind === "pad"
                ? Math.random() < 0.5
                  ? padMat
                  : padMatCold
                : kind === "barrier"
                  ? barrierMat
                  : gemMat);
      mesh.position.set(LANE_X[lane], kind === "barrier" ? -2.6 : -3.6, SPAWN_Z);
      scene.add(mesh);
      notes.push({ mesh, lane, kind, hit: false });
    };

    /* --------------------------- beat audio ----------------------------- */
    // a tiny self-contained kit · honors the app's mute flag
    let ac: AudioContext | null = null;
    const kick = () => {
      if (isMuted()) return;
      try {
        ac ??= new AudioContext();
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.frequency.setValueAtTime(120, ac.currentTime);
        o.frequency.exponentialRampToValueAtTime(45, ac.currentTime + 0.09);
        g.gain.setValueAtTime(0.12, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.11);
        o.connect(g).connect(ac.destination);
        o.start();
        o.stop(ac.currentTime + 0.12);
      } catch {
        /* audio unavailable */
      }
    };
    const tickHat = () => {
      if (isMuted()) return;
      try {
        ac ??= new AudioContext();
        const b = ac.createBuffer(1, 1200, ac.sampleRate);
        const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
        const s = ac.createBufferSource();
        const g = ac.createGain();
        g.gain.value = 0.05;
        s.buffer = b;
        s.connect(g).connect(ac.destination);
        s.start();
      } catch {
        /* audio unavailable */
      }
    };

    /* --------------------------- game state ----------------------------- */
    /* ═══ THE DRIVE MODEL ═══ the ship's place across the tube is CONTINUOUS
       now: a stick with lag, lateral momentum, grip, and tube walls you can
       actually scrape. The LANE (the trade side) is DERIVED from where the
       ship really is, with hysteresis, so pads, barriers and the trade rules
       keep working unchanged while the craft finally swerves. */
    let lane: Lane = 1; // derived · the trade side
    let shipX = 0; // where the ship really is · rails sit at ±3.1
    let shipVx = 0; // lateral momentum
    let steer = 0; // the stick · smoothed
    let steerIn = 0; // raw analog input −1..1 (held keys / a sideways drag)
    let seekX: number | null = null; // tap-to-lane target · a PD controller swerves to it
    let wallHitCd = 0;
    const TUBE_HALF = 4.9; // the tube wall at ship height · the ship is ~2.2 wide
    let score = 0, hits = 0, perfects = 0, strikes = 0;
    let combo = 1, comboT = 0;
    let beatT = 0, beatN = 0, bars = 0;
    // SONG STRUCTURE · 8-bar movements keep the run composed, not metronomic:
    //   GROOVE (the pocket) → STAIRS (a lane ladder to climb) → DOUBLES
    //   (half-beat pairs) → STORM (barrier weave · only when the tape is hot,
    //   else another GROOVE) → BREAK (four bars of breath + a guaranteed gem).
    const SECTIONS = ["GROOVE", "STAIRS", "DOUBLES", "STORM", "BREAK"] as const;
    let section: (typeof SECTIONS)[number] = "GROOVE";
    let sectionBar = 0;
    const LADDER: Lane[] = [0, 1, 2, 1];
    let breakGemDropped = false;
    let perfectStreak = 0;
    let phaseT = 0, phaseCd = 0; // phase-jump: slip through one barrier
    let gameOver = false, runT = 0, gemPrev = 0, openerDone = false;
    let speed = 34;
    const buzzq: string[] = [];
    const pushB = (m: string) => {
      buzzq.unshift(m);
      if (buzzq.length > 3) buzzq.pop();
      setBuzz([...buzzq]);
      pushCastRef.current?.(m); // 📺 the broadcast hears every call
    };
    const doPop = (txt: string, color: string) => {
      const p = { txt, color, id: Date.now() + Math.random() };
      setPop(p);
      setTimeout(() => setPop((q) => (q && q.id === p.id ? null : q)), 900);
    };
    const bumpCombo = (v: number) => {
      combo = Math.min(5, combo + v);
      comboT = 4;
    };
    const LANE_WORD = ["SHORT · betting price falls", "FLAT · farming both ways", "LONG · betting price rises"];
    const LANE_COLOR = ["#6ab8ff", "#d8e4de", "#27f2a4"];
    /* the trade side follows the SHIP, with hysteresis, so a swerve that
       brushes a lane edge does not flicker a real position on and off */
    const laneFromX = (): Lane => {
      const enter = 1.6, leave = 1.15;
      if (lane === 1) return shipX > enter ? 2 : shipX < -enter ? 0 : 1;
      if (lane === 2) return shipX >= leave ? 2 : shipX < -enter ? 0 : 1;
      return shipX <= -leave ? 0 : shipX > enter ? 2 : 1;
    };
    /** a tap / the autopilot ASKS for a lane · the ship swerves there (a
     *  real arc, not a snap) and the side commits when it actually arrives */
    const setLane = (l: Lane) => {
      if (gameOver || pausedRef.current) return;
      if (modeRef.current === "passenger") l = 1;
      seekX = LANE_X[Math.max(0, Math.min(2, l))];
      steerIn = 0;
    };
    const commitLane = (l: Lane) => {
      if (l === lane) return;
      lane = l;
      setTargetRef?.current?.(l === 2 ? 1 : l === 0 ? -1 : 0);
      sfx.dodge();
      // narrate every move · the newbie always knows what their money is doing
      const live = armedRef.current;
      doPop(
        l === 1
          ? `→ ${LANE_WORD[1]}${live ? " · closing real position…" : ""}`
          : `→ ${LANE_WORD[l]}${live ? " · placing real trade…" : ""}`,
        LANE_COLOR[l]);
    };

    /* ----------------------------- controls -----------------------------
     * HOLD ◀▶ to swerve (analog), a quick TAP hops one lane as a real swerve.
     * On touch the thumb IS the stick: drag sideways and the ship follows
     * proportionally; a quick tap on the left or right third hops a lane, the
     * middle third phases. */
    const keyDownAt = new Map<string, number>();
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === "p" || e.key === "P" || e.key === "Escape") return togglePause();
      if (e.key === " ") {
        e.preventDefault();
        phase();
        return;
      }
      if (gameOver || pausedRef.current || modeRef.current === "passenger") return;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        keyDownAt.set("L", performance.now());
        steerIn = -1;
        seekX = null;
      }
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        keyDownAt.set("R", performance.now());
        steerIn = 1;
        seekX = null;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const dir =
        e.key === "ArrowLeft" || e.key === "a" || e.key === "A" ? "L" : e.key === "ArrowRight" || e.key === "d" || e.key === "D" ? "R" : null;
      if (!dir) return;
      const held = performance.now() - (keyDownAt.get(dir) ?? 0);
      keyDownAt.delete(dir);
      steerIn = 0;
      // a quick tap = one lane over, swerved for real; a hold already steered
      if (held < 170 && !gameOver && !pausedRef.current && modeRef.current !== "passenger")
        setLane((dir === "L" ? lane - 1 : lane + 1) as Lane);
    };
    addEventListener("keydown", onKey);
    addEventListener("keyup", onKeyUp);
    let dragged = false;
    let downX = 0;
    let pointerDown = false;
    renderer.domElement.style.touchAction = "none";
    const onDown = (e: PointerEvent) => {
      if (gameOver || pausedRef.current) return;
      pointerDown = true;
      dragged = false;
      downX = e.clientX;
    };
    const onMove = (e: PointerEvent) => {
      if (!pointerDown || gameOver || pausedRef.current || modeRef.current === "passenger") return;
      const dx = e.clientX - downX;
      if (!dragged && Math.abs(dx) > 14) {
        dragged = true;
        seekX = null;
      }
      if (dragged) steerIn = Math.max(-1, Math.min(1, dx / (window.innerWidth * 0.16)));
    };
    const onUp = (e: PointerEvent) => {
      if (!pointerDown) return;
      pointerDown = false;
      if (dragged) {
        dragged = false;
        steerIn = 0; // thumb lifted · the stick centres
        return;
      }
      if (gameOver || pausedRef.current) return;
      const fx = e.clientX / window.innerWidth;
      if (fx < 0.35) setLane(Math.max(0, lane - 1) as Lane);
      else if (fx > 0.65) setLane(Math.min(2, lane + 1) as Lane);
      else phase();
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointercancel", onUp);
    if (process.env.NODE_ENV !== "production") {
      // dev probe · the drive model, readable from the console/verification
      (window as unknown as { __rtnPulse?: unknown }).__rtnPulse = {
        drive: () => ({ shipX, shipVx, steer, steerIn, seekX, lane, strikes, phaseT }),
        finish: () => finishRun(),
      };
    }
    const phase = () => {
      if (phaseT > 0 || phaseCd > 0 || gameOver || pausedRef.current) return;
      phaseT = 0.5;
      phaseCd = 2.2;
      sfx.dodge();
    };
    const togglePause = () => {
      if (gameOver) return;
      pausedRef.current = !pausedRef.current;
      setPaused(pausedRef.current);
      // passenger: the grid keeps farming while the picture is paused · a
      // flatten here was a taker close for nothing (see ThreeRide)
      if (pausedRef.current && modeRef.current !== "passenger") flattenRef?.current?.();
    };
    // walking away IS a pause · a hidden tab suspends the frame loop, and a
    // live position must never drift where the player can't see it. Coming
    // BACK auto-resumes (only if the pause was ours, a manual pause stays):
    // without this, every tab-switch left the run silently dead.
    let autoPaused = false;
    const onVis = () => {
      if (document.hidden && !gameOver && !pausedRef.current) {
        togglePause();
        autoPaused = true;
      } else if (!document.hidden && autoPaused) {
        autoPaused = false;
        if (pausedRef.current && !gameOver) togglePause();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    /* ------------------------------ feed -------------------------------- */
    const feed = new LiveFeed("ETH", () => {});
    feed.start().catch(() => {});

    const finishRun = () => {
      if (gameOver) return;
      gameOver = true;
      flattenRef?.current?.();
      const r = realRef?.current;
      const rec = saveRide({
        mode: "pulse",
        live: armedRef.current && !!r && r.fills > 0,
        sim: { volume: Math.round(score), coins: hits, dodges: 0, bestStreak: 0, crashes: strikes },
        real: r
          ? { fills: r.fills, volume: r.volume, fees: r.fees, pnl: r.pnl }
          : { fills: 0, volume: 0, fees: 0, pnl: 0 },
      });
      submitRide(rec);
      setOverRec(rec);
      void aiCoach(rec, career()).then(setAiTip).catch(() => {});
      bumpBounty("pulse_hits", hits);
      bumpBounty("pulse_perfect", perfects);
      // 👻 out-scored the ghost? the new pace curve becomes the rival
      const hadBest = ghostBest?.score ?? 0;
      if (score > hadBest && ghostSamples.length > 3) {
        ghostBest = { score, curve: [...ghostSamples] };
        try {
          localStorage.setItem("rtn-ghostpulse", JSON.stringify(ghostBest));
        } catch {
          /* private mode · the run still counts */
        }
      }
      setOver({
        bars,
        score: Math.round(score),
        hits,
        perfects,
        best$: hadBest > 0 ? Math.round(hadBest) : null,
      });
    };

    /* 👻 GHOST · race your own best score-pace curve; passing it mid-run pays
     * once; out-scoring it at the flag writes the new ghost. */
    interface GhostSave {
      score: number;
      curve: [number, number][];
    }
    let ghostBest: GhostSave | null = null;
    try {
      ghostBest = JSON.parse(localStorage.getItem("rtn-ghostpulse") ?? "null");
    } catch {
      /* no ghost yet */
    }
    const ghostSamples: [number, number][] = [];
    let ghostSampleCd = 0;
    let ghostPassed = false;
    let ghostDelta$: number | null = null;
    const ghostMat = new THREE.MeshStandardMaterial({
      color: 0x14122e,
      emissive: 0xa9a3ff,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.28,
    });
    const ghostRunner = new THREE.Group();
    {
      const gShip = new THREE.Mesh(new THREE.ConeGeometry(0.44, 1.5, 6), ghostMat);
      gShip.rotation.x = -Math.PI / 2;
      ghostRunner.add(gShip);
      const gHalo = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 8, 24), ghostMat);
      gHalo.rotation.x = Math.PI / 2;
      ghostRunner.add(gHalo);
    }
    ghostRunner.position.set(0, -3.4, 0);
    ghostRunner.visible = false;
    scene.add(ghostRunner);
    const ghostScoreAt = (tt: number): number => {
      const cv = ghostBest?.curve;
      if (!cv || cv.length === 0) return 0;
      if (tt <= cv[0][0]) return cv[0][1];
      for (let i = 1; i < cv.length; i++)
        if (tt <= cv[i][0]) {
          const [t0, s0] = cv[i - 1];
          const [t1, s1] = cv[i];
          return s0 + (s1 - s0) * ((tt - t0) / Math.max(0.001, t1 - t0));
        }
      return cv[cv.length - 1][1];
    };

    /* ------------------------------ loop -------------------------------- */
    let last = performance.now();
    let alive = true;
    const tick = () => {
      if (!alive) return;
      requestAnimationFrame(tick);
      const now2 = performance.now();
      const dt = Math.min(0.05, (now2 - last) / 1000);
      last = now2;
      if (pausedRef.current || gameOver) {
        composer.render();
        return;
      }
      const flow = feed.flow;
      runT += dt;
      // THE TEMPO IS THE TAPE · calm grooves, frenzy races
      const bpm = 80 + Math.min(1, Math.abs(flow) * 1.4) * 70;
      speed = 30 + Math.abs(flow) * 18;
      if (comboT > 0) comboT -= dt;
      else combo = Math.max(1, combo - dt * 0.5);
      if (phaseT > 0) phaseT -= dt;
      if (phaseCd > 0) phaseCd -= dt;

      /* the beat clock · quantized spawns + the pulse of the whole world */
      beatT += dt * (bpm / 60);
      if (beatT >= 1) {
        beatT -= 1;
        beatN++;
        if (beatN % 4 === 0) {
          bars++;
          kick();
          // ── movement change · every 8 bars (BREAK is a short 4) ──
          sectionBar++;
          const sectionLen = section === "BREAK" ? 4 : 8;
          if (sectionBar >= sectionLen) {
            sectionBar = 0;
            breakGemDropped = false;
            const next: Record<(typeof SECTIONS)[number], (typeof SECTIONS)[number]> = {
              GROOVE: "STAIRS",
              STAIRS: "DOUBLES",
              // the STORM only rolls in when the tape is actually hot
              DOUBLES: Math.abs(flow) > 0.4 ? "STORM" : "BREAK",
              STORM: "BREAK",
              BREAK: "GROOVE",
            };
            section = next[section];
            pushB(
              section === "GROOVE"
                ? "▶ GROOVE · sit in the pocket"
                : section === "STAIRS"
                  ? "▶ STAIRS · follow the ladder"
                  : section === "DOUBLES"
                    ? "▶ DOUBLES · half-beat pairs incoming"
                    : section === "STORM"
                      ? "▶ STORM · barriers weave, FLAT is the shelter"
                      : "▶ BREAK · four bars of breath, a gem waits inside");
          }
        } else tickHat();
        // bar-16 fill · a quick hat flourish rounds the phrase
        if (beatN % 16 === 15) {
          setTimeout(tickHat, 70);
          setTimeout(tickHat, 140);
        }
        // ── the movement writes the chart · aligned pays, against threatens ──
        const alignedLane: Lane = flow > 0.12 ? 2 : flow < -0.12 ? 0 : 1;
        const againstLane: Lane = alignedLane === 2 ? 0 : alignedLane === 0 ? 2 : Math.random() < 0.5 ? 0 : 2;
        if (section === "GROOVE") {
          if (beatN % 2 === 0) spawnNote("pad", alignedLane);
          if (beatN % 4 === 2 && Math.abs(flow) > 0.1) spawnNote("barrier", againstLane);
          if (beatN % 8 === 5) spawnNote("pad", Math.floor(Math.random() * 3) as Lane);
        } else if (section === "STAIRS") {
          spawnNote("pad", LADDER[beatN % LADDER.length]);
        } else if (section === "DOUBLES") {
          if (beatN % 2 === 0) {
            spawnNote("pad", alignedLane);
            // the pair · a second pad half a beat behind (pure geometry)
            const m2 = new THREE.Mesh(padGeo, Math.random() < 0.5 ? padMat : padMatCold);
            m2.position.set(LANE_X[alignedLane], -3.6, SPAWN_Z - speed * (30 / bpm));
            scene.add(m2);
            notes.push({ mesh: m2, lane: alignedLane, kind: "pad", hit: false });
          }
        } else if (section === "STORM") {
          // barriers sweep the position lanes · FLAT pays through the middle, // in a storm, going flat IS the trade
          if (beatN % 2 === 0) spawnNote("barrier", (beatN % 4 === 0 ? 0 : 2) as Lane);
          else spawnNote("pad", 1);
        } else if (section === "BREAK") {
          if (sectionBar === 2 && !breakGemDropped) {
            breakGemDropped = true;
            spawnNote("gem", 1);
          }
        }
      }
      // opening welcome + gems on real jerks
      if (!openerDone && runT > 4) {
        openerDone = true;
        pushB("🎵 the tempo is the tape · calm grooves, frenzy races");
      }
      if (Math.abs(flow - gemPrev) > 0.5 && runT > 8) {
        spawnNote("gem", flow > 0 ? 2 : 0);
        pushB(flow > 0 ? "💎 whale BUY print · gem on the LONG rail" : "💎 whale SELL print · gem on the SHORT rail");
        // THE TAPE JERKS THE SHIP · a real flow jerk kicks you toward its side.
        // One transient nudge (~0.4 across), never enough to cross a lane
        // edge on its own: the market can shove, it cannot trade for you.
        if (modeRef.current !== "passenger") shipVx += flow > 0 ? 2.2 : -2.2;
      }
      gemPrev = flow;

      /* world motion */
      for (const r of rings) {
        r.position.z += speed * dt;
        if (r.position.z > 12) r.position.z -= RINGS * RING_DZ;
        const d = 1 - Math.min(1, Math.abs(r.position.z) / 40);
        (r.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.45 + d * (0.5 + (1 - beatT) * 0.9);
        r.rotation.z += dt * 0.15 * (flow >= 0 ? 1 : -1);
      }
      const ringHue = flow >= 0 ? 0x27f2a4 : 0xff4d5e;
      for (const r of rings) (r.material as THREE.MeshStandardMaterial).emissive.setHex(ringHue);
      // crystal gates sweep past + wrap
      for (const g of gates) {
        g.position.z += speed * dt;
        if (g.position.z > 14) g.position.z -= 8 * 22;
      }
      // 🎇 tunnel events
      const nowMs = performance.now();
      if (!tunnelEvent && nowMs > tunnelNext) {
        tunnelEvent = Math.random() < 0.5 ? "colorstorm" : "blackout";
        tunnelT = tunnelEvent === "colorstorm" ? 12 : 9;
        pushB(tunnelEvent === "colorstorm" ? "🎇 COLOR STORM · the tunnel goes wild" : "🌑 BLACKOUT · only the crystals hold the light");
      }
      if (tunnelEvent) {
        tunnelT -= dt;
        if (tunnelEvent === "colorstorm") {
          rings.forEach((r, i) => {
            (r.material as THREE.MeshStandardMaterial).emissive.setHSL(((nowMs / 900 + i * 0.04) % 1), 0.9, 0.55);
            (r.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2;
          });
        } else {
          rings.forEach((r) => {
            const m = r.material as THREE.MeshStandardMaterial;
            m.emissiveIntensity += (0.06 - m.emissiveIntensity) * Math.min(1, dt * 3);
          });
          gates.forEach((g) =>
            g.traverse((o) => {
              const mm = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
              if (mm && mm.emissiveIntensity !== undefined)
                mm.emissiveIntensity += (2.4 - mm.emissiveIntensity) * Math.min(1, dt * 2);
            }));
        }
        if (tunnelT <= 0) {
          if (tunnelEvent === "blackout") {
            pushB("💡 the light returns to the tube");
            gates.forEach((g) =>
              g.traverse((o) => {
                const mm = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
                if (mm && mm.emissiveIntensity !== undefined) mm.emissiveIntensity = 1.1;
              }));
          }
          tunnelEvent = null;
          tunnelNext = nowMs + 80_000 + Math.random() * 70_000;
        }
      }
      const dp = dust.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < dustN; i++) {
        let z = dp.getZ(i) + speed * dt * 1.4;
        if (z > 10) z = -180;
        dp.setZ(i, z);
      }
      dp.needsUpdate = true;

      /* ═══ THE DRIVE MODEL ═══ a stick with lag, lateral momentum, grip,
         and tube walls you can actually scrape. */
      if (modeRef.current === "passenger") {
        // the autopilot holds FLAT · it swerves back if the tape kicks it
        steerIn = 0;
        if (seekX == null && Math.abs(shipX) > 0.1) seekX = 0;
      }
      let steerTarget = steerIn;
      if (seekX != null) {
        // tap-to-lane: a PD controller drives the stick so the ship ARCS over
        const err = seekX - shipX;
        steerTarget = Math.max(-1, Math.min(1, err * 0.7 - shipVx * 0.1));
        if (Math.abs(err) < 0.1 && Math.abs(shipVx) < 0.5) {
          seekX = null;
          steerTarget = 0;
        }
      }
      steer += (steerTarget - steer) * Math.min(1, dt * 12); // the stick has weight
      shipVx += steer * 34 * dt;
      shipVx -= shipVx * Math.min(1, dt * 5.5); // grip · a hold arcs across ~2 lanes/s, not into the wall
      shipX += shipVx * dt;
      if (wallHitCd > 0) wallHitCd -= dt;
      if (shipX > TUBE_HALF || shipX < -TUBE_HALF) {
        shipX = Math.max(-TUBE_HALF, Math.min(TUBE_HALF, shipX));
        if (Math.abs(shipVx) > 1.2 && wallHitCd <= 0) {
          wallHitCd = 0.5;
          combo = Math.max(1, combo - 0.3);
          sfx.dodge();
          doPop("⚡ WALL SCRAPE · keep it in the tube", "#ffd166");
        }
        shipVx *= -0.35; // the wall throws you back in
      }
      const nl = laneFromX();
      if (nl !== lane) commitLane(nl);
      runner.position.x = shipX;
      runner.position.y = -3.4 + Math.sin(now2 / 260) * 0.08 + (1 - beatT) * 0.06;
      (ship.material as THREE.MeshStandardMaterial).emissiveIntensity = phaseT > 0 ? 2.6 : 0.9;
      // engines breathe with the beat and flare in phase · the throttle you can SEE
      const engT = phaseT > 0 ? 3.2 : 1.4 + Math.sin(now2 / 130) * 0.5;
      for (const e of engines) {
        (e.material as THREE.MeshStandardMaterial).emissiveIntensity = engT;
        e.scale.y = 0.8 + (engT / 3.2) * 0.7 + Math.random() * 0.12; // flame flicker
      }
      // bank INTO the swerve like an aircraft, and the nose points where the
      // ship is really going
      const latN = Math.max(-1, Math.min(1, shipVx / 7));
      runner.rotation.z += (-latN * 0.42 - runner.rotation.z) * Math.min(1, dt * 10);
      const heading = Math.atan2(shipVx, Math.max(20, speed));
      runner.rotation.y += (-heading * 2.2 - runner.rotation.y) * Math.min(1, dt * 9);
      camera.position.x += (shipX * 0.42 - camera.position.x) * Math.min(1, dt * 5);
      camera.lookAt(shipX * 0.4, -1.4, -24);
      const tp = trail.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = trailN - 1; i > 0; i--) {
        tp.setXYZ(i, tp.getX(i - 1), tp.getY(i - 1), tp.getZ(i - 1) + speed * dt * 0.5);
      }
      tp.setXYZ(0, runner.position.x, runner.position.y, 0.6);
      tp.needsUpdate = true;

      /* notes advance + judgment */
      for (let i = notes.length - 1; i >= 0; i--) {
        const n = notes[i];
        n.mesh.position.z += speed * dt;
        if (n.kind === "gem") n.mesh.rotation.y += dt * 2.4;
        const dz = n.mesh.position.z - runner.position.z;
        if (!n.hit && Math.abs(dz) < 2.4) {
          if (n.kind === "pad" && n.lane === lane) {
            n.hit = true;
            const perfect = Math.abs(dz) < 0.9;
            const gain = Math.round((perfect ? 90 : 45) * combo);
            score += gain;
            hits++;
            if (perfect) {
              perfects++;
              perfectStreak++;
            } else perfectStreak = 0;
            bumpCombo(perfect ? 0.4 : 0.2);
            sfx.coin();
            // FLOW STATE · every 5 consecutive perfects is its own event
            if (perfect && perfectStreak > 0 && perfectStreak % 5 === 0) {
              score += 250;
              bumpCombo(0.6);
              doPop(`◉◉◉ FLOW STATE ×${perfectStreak} +$250`, "#a9a3ff");
              hlRefCall.current?.(`flow-state-x${perfectStreak}`);
            } else {
              doPop(perfect ? `◉ PERFECT +$${gain}` : `● ON BEAT +$${gain}`, perfect ? "#ffd24a" : "#27f2a4");
            }
            scene.remove(n.mesh);
            notes.splice(i, 1);
            continue;
          }
          if (n.kind === "gem" && n.lane === lane) {
            n.hit = true;
            const gain = Math.round(250 * combo);
            score += gain;
            bumpCombo(0.8);
            sfx.coin();
            doPop(`💎 WHALE GEM +$${gain}`, "#a9a3ff");
            bumpBounty("gems", 1);
            scene.remove(n.mesh);
            notes.splice(i, 1);
            continue;
          }
          if (n.kind === "barrier" && n.lane === lane && phaseT <= 0) {
            n.hit = true;
            strikes++;
            combo = 1;
            perfectStreak = 0;
            score = Math.max(0, score - 120);
            sfx.crash();
            doPop(strikes >= 3 ? "⛔ FLATLINED · RUN OVER" : `⛔ STRIKE (${strikes}/3)`, "#ff4d5e");
            // back to the centre · the stick keeps whatever the thumb or key
            // is STILL doing (zeroing it here left a held key dead until
            // re-pressed, which read as "the ship stopped listening")
            lane = 1;
            shipX = 0;
            shipVx = 0;
            seekX = null;
            setTargetRef?.current?.(0);
            flattenRef?.current?.();
            if (navigator.vibrate) navigator.vibrate(80);
            if (strikes >= 3) finishRun();
          } else if (n.kind === "barrier" && n.lane === lane && phaseT > 0 && !n.hit) {
            n.hit = true;
            const gain = Math.round(70 * combo);
            score += gain;
            bumpCombo(0.3);
            sfx.draft();
            doPop(`⚡ PHASED THROUGH +$${gain}`, "#a9a3ff");
          }
        }
        if (n.mesh.position.z > 8) {
          if (n.kind === "pad" && !n.hit) perfectStreak = 0; // a let-through breaks the flow
          scene.remove(n.mesh);
          notes.splice(i, 1);
        }
      }

      /* 👻 ghost race · sample my score pace, run the rival at the live delta */
      ghostSampleCd -= dt;
      if (ghostSampleCd <= 0) {
        ghostSampleCd = 2;
        if (ghostSamples.length < 400) ghostSamples.push([runT, score]);
      }
      if (ghostBest) {
        const gd = ghostScoreAt(runT) - score; // dollars · positive = ghost ahead
        ghostDelta$ = Math.round(gd);
        ghostRunner.visible = true;
        ghostRunner.position.z = Math.max(-60, Math.min(6, -gd * 0.02));
        ghostRunner.position.y = -3.4 + Math.sin(now2 / 300) * 0.08;
        if (!ghostPassed && gd <= 0 && runT > 5) {
          ghostPassed = true;
          score += 150;
          bumpCombo(0.3);
          sfx.coin();
          doPop("👻 AHEAD OF YOUR BEST PACE +$150", "#a9a3ff");
        }
      } else {
        ghostDelta$ = null;
        ghostRunner.visible = false;
      }

      /* sky mood */
      (scene.background as THREE.Color).setRGB(
        0.035 + Math.max(0, -flow) * 0.09,
        0.03 + Math.max(0, flow) * 0.06,
        0.08);
      scene.fog!.color.copy(scene.background as THREE.Color);

      setHud({
        bars,
        bpm: Math.round(bpm),
        score: Math.round(score),
        hits,
        perfects,
        lane,
        x: Math.round(shipX * 100) / 100,
        combo: Math.round(combo * 10) / 10,
        strikes,
        flow,
        ghost: ghostDelta$,
      });
      composer.render();
    };
    tick();

    return () => {
      alive = false;
      removeEventListener("keydown", onKey);
      removeEventListener("keyup", onKeyUp);
      removeEventListener("resize", fit);
      document.removeEventListener("visibilitychange", onVis);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointercancel", onUp);
      feed.stop();
      if (modeRef.current !== "passenger") flattenRef?.current?.();
      void ac?.close().catch(() => {});
      renderer.dispose();
      wrap.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[70] bg-ink">
      <div ref={wrapRef} className="absolute inset-0" />
      {/* odometer */}
      <div className="pointer-events-none absolute left-4 top-[max(12px,env(safe-area-inset-top))] rounded-xl border border-hairline bg-ink/70 px-4 py-2.5 backdrop-blur-md">
        <div className="whitespace-nowrap text-[12px] uppercase tracking-[0.12em] text-flat">
          bars · {armed ? "LIVE" : "practice"}
        </div>
        <div className="font-telemetry text-2xl font-extrabold text-bone min-[640px]:text-3xl">
          {hud.bars} <span className="text-lg">bars</span>
        </div>
        <div className="font-telemetry mt-0.5 whitespace-nowrap text-[12px] text-flat min-[640px]:text-[12px]">
          {hud.bpm} bpm · ${hud.score.toLocaleString()} · ●{hud.hits}
          {hud.perfects > 0 && <span className="text-amber"> · ◉{hud.perfects}</span>}
          {hud.combo > 1 && <span className="text-amber"> · ×{hud.combo}</span>}
        </div>
        {hud.ghost != null && (
          <div className={`font-telemetry mt-0.5 whitespace-nowrap text-[12px] ${hud.ghost > 0 ? "text-lav" : "text-chart"}`}>
            ghost · {hud.ghost > 0 ? `best +$${hud.ghost.toLocaleString()} ahead` : `you lead by $${(-hud.ghost).toLocaleString()}`}
          </div>
        )}
      </div>
      {/* chips */}
      {/* 🎯 ENGINE STATUS · parity with Ride, the machine narrates here too */}
      {armed && engineStatus && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[104px] z-10 flex justify-center">
          <div className="max-w-[92vw] rounded-xl border border-chart/40 bg-ink/85 px-3.5 py-1.5 text-center backdrop-blur-md">
            <span className="text-[12.5px] font-extrabold text-chart">{engineStatus.head}</span>
            <span className="ml-2 text-[12px] font-bold text-bone">{engineStatus.line}</span>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute right-4 top-[max(12px,env(safe-area-inset-top))] flex flex-col items-end gap-1.5">
        <span className={`rounded-sm border px-2 py-0.5 text-[11.5px] font-bold uppercase tracking-[0.14em] ${armed ? "bg-chart text-ink" : "border-amber/50 text-amber"}`}>
          {armed ? (
            "● live · lanes place real trades"
          ) : (
            <button
              onClick={() => window.dispatchEvent(new Event("rtn-arm-request"))}
              className="pointer-events-auto font-extrabold underline decoration-amber/60 underline-offset-2"
              title="go live right here, no need to exit"
            >
              practice · TAP TO GO LIVE
            </button>
          )}
        </span>
        <span className={`rounded-sm px-2 py-0.5 text-[12px] font-bold ${hud.flow >= 0 ? "bg-chart/20 text-chart" : "bg-blood/20 text-blood"}`}>
          {hud.flow >= 0 ? "▲ buyers pushing" : "▼ sellers pushing"} · the tempo is the tape
        </span>
        <span className="rounded-sm bg-ink/70 px-2 py-0.5 text-[11.5px] font-bold uppercase tracking-[0.12em] text-flat">
          NEON PULSE · RHYTHM RUN
        </span>
      </div>
      {pop && (
        <div key={pop.id} className="pointer-events-none absolute inset-x-0 top-[30%] flex justify-center px-5">
          <span className="animate-[rtn-pop_0.9s_ease-out_forwards] text-center text-xl font-extrabold" style={{ color: pop.color, textShadow: "0 2px 12px rgba(0,0,0,.8)" }}>
            {pop.txt}
          </span>
        </div>
      )}
      {/* 📺 broadcast · shared voice with the flagship cartridge */}
      {mode === "passenger" && broadcast && <CastLowerThird cast={cast} />}
      {mode === "passenger" && (
        <CastToggle broadcast={broadcast} onToggle={() => setBroadcast((b) => !b)} />
      )}
      <CastCaptions cast={mode === "passenger" && broadcast ? cast : null} />
      <div className="pointer-events-none absolute bottom-[164px] left-4 flex max-w-[70vw] flex-col gap-1.5">
        {buzz.map((b, i) => (
          <span key={i} className={`rounded-lg border border-amber/30 bg-ink/70 px-2.5 py-1 text-[12px] font-bold text-amber backdrop-blur-sm ${i > 0 ? "opacity-50" : ""}`}>
            {b}
          </span>
        ))}
      </div>
      {/* lane readout · the committed side, and under it the ship's REAL
          place across the tube: the marker slides continuously, the two ticks
          are the edges where a side commits */}
      <div className="pointer-events-none absolute inset-x-0 bottom-14 flex flex-col items-center gap-1.5">
        <div className="flex justify-center gap-2.5">
          {(["SHORT", mode === "passenger" ? "AUTOPILOT" : "FLAT", "LONG"] as const).map((label, i) => (
            <span
              key={label}
              className={`w-24 rounded-xl border py-2 text-center text-[12.5px] font-extrabold uppercase tracking-[0.04em] backdrop-blur-sm transition ${
                hud.lane === i
                  ? i === 0
                    ? "border-sky bg-sky/25 text-sky shadow-[0_0_26px_rgba(106,184,255,.35)]"
                    : i === 2
                      ? "border-chart bg-chart/25 text-chart shadow-[0_0_26px_rgba(39,242,164,.35)]"
                      : mode === "passenger"
                        ? "border-lav bg-lav/25 text-lav shadow-[0_0_26px_rgba(169,163,255,.35)]"
                        : "border-bone/40 bg-ink/60 text-bone"
                  : "border-hairline bg-ink/45 text-flat"
              }`}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="relative h-[5px] w-[308px] max-w-[92vw] rounded-full bg-ink/60 ring-1 ring-hairline" role="img" aria-label="where the ship is across the tube">
          <span className="absolute inset-y-0 left-[33.7%] w-px bg-bone/30" />
          <span className="absolute inset-y-0 left-[66.3%] w-px bg-bone/30" />
          <span
            className="absolute -top-[3px] h-[11px] w-[3px] rounded-sm bg-papaya shadow-[0_0_8px_var(--papaya)] transition-[left] duration-75"
            style={{ left: `calc(${((hud.x + 4.9) / 9.8) * 100}% - 1.5px)` }}
          />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-[12px] text-flat">
        {mode === "passenger" ? (
          <span><span className="text-amber">PASSENGER</span> · autopilot holds FLAT · the grid farms while the tunnel plays</span>
        ) : (
          <>
            <span className="sm:hidden">
              drag = swerve · <span className="text-bone">tap sides = hop a lane</span> ·{" "}
              <span className="text-amber">tap middle = phase</span> · hit <span className="text-chart">pads on the beat</span>
            </span>
            <span className="hidden sm:inline">
              hold ◀▶ = swerve · <span className="text-bone">tap = hop a lane</span> · hit{" "}
              <span className="text-chart">pads on the beat</span> · <span className="text-amber">SPACE = phase</span> through one
              barrier · <span className="text-bone">P pause</span> · 3 strikes = out
            </span>
          </>
        )}
      </div>
      <div className="absolute right-4 top-[max(60px,calc(env(safe-area-inset-top)+48px))] mt-16 flex flex-col items-end gap-2">
        <button onClick={() => { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); }} className="rounded-full border border-hairline bg-ink/70 px-3 py-1.5 text-[12px] font-bold text-bone backdrop-blur-md hover:border-papaya">
          {paused ? "▶ resume" : "❚❚ pause"}
        </button>
        <button onClick={onExit} className="rounded-full border border-hairline bg-ink/70 px-3 py-1.5 text-[12px] font-bold text-bone backdrop-blur-md hover:border-papaya">
          ✕ exit
        </button>
      </div>
      {/* first-run card · the ONE idea: the tempo IS the tape */}
      {tut && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-ink/85 p-5 backdrop-blur-sm">
          <div className="w-full max-w-[400px] rounded-xl border border-hairline bg-ink-soft p-5 text-center">
            <div className="text-lg font-extrabold text-bone">The tempo is the tape.</div>
            <div className="mt-1 text-[12px] leading-snug text-flat">
              The tunnel&apos;s beat is <b className="text-bone">live market intensity</b>, calm
              tape grooves slow, frenzy races. Rails are positions:
            </div>
            <div className="mx-auto mt-3 flex justify-center gap-2">
              <span className="w-24 rounded-md border border-sky bg-sky/20 py-2 text-[12px] font-bold text-sky">
                ◀ SHORT
              </span>
              <span className="w-24 rounded-md border border-bone/40 bg-ink py-2 text-[12px] font-bold text-bone">
                FLAT
              </span>
              <span className="w-24 rounded-md border border-chart bg-chart/20 py-2 text-[12px] font-bold text-chart">
                LONG ▶
              </span>
            </div>
            <ul className="mx-auto mt-4 max-w-[320px] space-y-1.5 text-left text-[12px] leading-snug text-flat">
              <li>
                ● Hit the glowing <b className="text-chart">pads ON the beat</b>, dead-center =
                ◉ PERFECT, ×2 · chains of 5 = FLOW STATE
              </li>
              <li>
                <b className="text-bone">Hold ◀▶</b> (or drag) to swerve, a quick tap hops a lane ·
                dodge <b className="text-blood">red barriers</b> · <b className="text-bone">SPACE</b>{" "}
                phases through one · movements: GROOVE → STAIRS → DOUBLES → STORM → BREAK
              </li>
              <li>
                3 strikes = set over, <b className="text-bone">position closed safely</b>. Same
                money rules everywhere: tiny capped clips, auto-closed.
              </li>
            </ul>
            <button
              onClick={() => {
                localStorage.setItem("rtn-pulse-tut", "1");
                setTut(false);
              }}
              className="mt-4 w-full rounded-lg bg-chart py-3 text-[13px] font-extrabold tracking-[0.08em] text-ink"
            >
              GOT IT · DROP THE BEAT →
            </button>
            {/* the card covers the game's own exit · leaving must never need a lap first */}
            <button onClick={onExit} className="mt-2 w-full rounded-lg border border-hairline py-2 text-[12px] font-bold text-flat hover:text-bone">
              not now · leave
            </button>
          </div>
        </div>
      )}
      {over && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink/85 p-5 backdrop-blur-md">
          <div className="w-full max-w-[380px] rounded-2xl border border-hairline bg-ink-soft p-5 text-center">
            <div className="text-[13px] uppercase tracking-[0.2em] text-flat">set over</div>
            <div className="font-telemetry mt-2 text-4xl font-extrabold text-bone">{over.bars} bars</div>
            <div className="mt-1 text-[13px] text-flat">
              ${over.score.toLocaleString()} · ●{over.hits} hits · ◉{over.perfects} perfect
            </div>
            {over.best$ == null ? (
              <div className="mt-2 text-[12px] text-lav">your ghost now runs this pace, beat it next set</div>
            ) : over.score > over.best$ ? (
              <div className="mt-2 text-[12px] text-amber">NEW BEST · the ghost just got faster</div>
            ) : (
              <div className="mt-2 text-[12px] text-lav">
                ${(over.best$ - over.score).toLocaleString()} short of your best, run it back
              </div>
            )}
            {overRec && (
              <div className="mt-3 rounded-md border border-lav/40 bg-lav/5 p-2.5 text-left">
                <div className="display text-[10px] font-black uppercase tracking-wider text-lav">co-driver</div>
                <p className="mt-1 text-[12px] leading-snug text-flat">{aiTip ?? coachTip(overRec)}</p>
              </div>
            )}
            <button onClick={onExit} className="mt-4 w-full rounded-xl bg-gradient-to-br from-papaya to-papaya-hot py-3 text-[14px] font-extrabold uppercase text-ink">
              back to the arcade
            </button>
          </div>
        </div>
      )}
      {paused && !over && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <span className="rounded-xl border border-hairline bg-ink/80 px-5 py-3 text-[15px] font-extrabold text-bone">
            ❚❚ paused · position closed safely
          </span>
        </div>
      )}
    </div>
  );
}
