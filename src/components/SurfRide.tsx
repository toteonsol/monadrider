"use client";

/**
 * SurfRide · cartridge 02, 🌊 SURFER. Carve the live chart as a 3D swell.
 *
 * The wave IS the market: a rolling heightfield built from a live ring buffer
 * of the real ETH mid price (LiveFeed, mainnet read-only). Price pumps → the
 * face climbs under you; dumps → the trough opens. BANDS ARE POSITIONS, the
 * vertical remap of Ride's "lanes are positions" law:
 *
 *     LIP (high)   = LONG   · you win when the wave (price) rises
 *     LINE (mid)   = FLAT   · the sanctuary, farms both ways in passenger
 *     TROUGH (low) = SHORT  · you win when it falls
 *
 * Same living-world invariant, translated to ocean: 🐬 dolphins arc on the
 * high side when buyers surge · 🦈 shark fins slice the trough when sellers
 * slam · 💎 gems bob on whale prints · debris (the hazards) floats AGAINST
 * the flow band, exactly like Ride's trucks. Wipeout = spin-out to LINE and
 * the real position auto-flattens, the same safety reflex.
 *
 * Trade wiring is identical to ThreeRide: band changes route into LiveLayer's
 * setTargetRef (+1 lip / 0 line / −1 trough); exit/pause/wipeout flatten.
 */
import { HighlightRecorder } from "@/lib/share";
import { useBroadcast, CastLowerThird, CastToggle, CastCaptions } from "./BroadcastLayer";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { LiveFeed, getRideAsset } from "@/lib/game/liveFeed";
import { sfx, isMuted } from "@/lib/game/sfx";
import { saveRide, coachTip, career, type RideRecord } from "@/lib/game/rideLog";
import { aiCoach } from "@/lib/game/aiCoach";
import { loadGlb, fitTo, tintAll } from "@/lib/game/glb";
import { submitRide } from "@/lib/game/backend";
import { bumpBounty } from "@/lib/game/bounties";

type Band = 0 | 1 | 2; // 0 trough(SHORT) · 1 line(FLAT) · 2 lip(LONG)
const BAND_Y = [-2.3, 0, 2.3];
const BAND_WORD = ["TROUGH · betting price falls", "LINE · farming both ways", "LIP · betting price rises"];

export default function SurfRide({
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
    m: 0,
    speed: 0,
    score: 0,
    coins: 0,
    band: 1 as Band,
    carve: 0, // −1 trough … +1 lip · where the board really is
    combo: 1,
    wipes: 0,
    flow: 0,
    connected: false,
    ghost: null as number | null, // meters vs your best-run pace · + = ghost ahead
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
  const [over, setOver] = useState<null | {
    m: number;
    score: number;
    coins: number;
    bestM: number | null;
  }>(null);
  const [paused, setPaused] = useState(false);
  // 🧭 the co-driver's read of the set · AI when it answers, the rule-based
  // line otherwise — the same voice the car's run-over card has
  const [overRec, setOverRec] = useState<RideRecord | null>(null);
  const [aiTip, setAiTip] = useState<string | null>(null);
  // first-open card · one idea, plain words (mirrors Ride's rtn-3d-tut)
  const [tut, setTut] = useState(
    () => typeof window !== "undefined" && !localStorage.getItem("rtn-surf-tut"));
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
    scene.background = new THREE.Color(0x070a14);
    scene.fog = new THREE.Fog(0x070a14, 60, 240);
    // surf framing: camera rides OFF-AXIS (left of the line) so the crest runs
    // diagonally through the shot instead of impaling the lens dead-center
    const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
    camera.position.set(-4.6, 7, 12);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    wrap.appendChild(renderer.domElement);
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.55, 0.3);
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

    const hemi = new THREE.HemisphereLight(0x2a3f66, 0x050810, 0.9);
    scene.add(hemi);
    const moonLight = new THREE.DirectionalLight(0x9db8ff, 0.7);
    moonLight.position.set(-30, 40, -60);
    scene.add(moonLight);

    // the MOON · a huge low disc that bloom turns into a night-surf poster
    const moon = new THREE.Mesh(
      new THREE.CircleGeometry(14, 48),
      new THREE.MeshBasicMaterial({ color: 0xbfd2ff }));
    moon.position.set(-38, 26, -180);
    scene.add(moon);
    // HORIZON · dark island silhouettes + a working lighthouse beacon, the
    // ocean has a coastline now, not just an empty edge
    const islandMat = new THREE.MeshBasicMaterial({ color: 0x05070d, fog: false });
    for (const [ix, iz, is] of [
      [-70, -230, 26],
      [55, -250, 34],
      [95, -215, 18],
      [-110, -260, 40],
    ] as const) {
      const isl = new THREE.Mesh(new THREE.IcosahedronGeometry(is, 1), islandMat);
      isl.scale.y = 0.28;
      isl.position.set(ix, -2, iz);
      scene.add(isl);
    }
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false });
    const beaconTower = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.3, 9, 8), islandMat);
    beaconTower.position.set(55, 8, -250);
    scene.add(beaconTower);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 10), beaconMat);
    beacon.position.set(55, 13.5, -250);
    scene.add(beacon);
    // 🌴 the SHORELINE · real palms slide past both banks of the swell, you're
    // riding a coast now, not an abstract water strip (swell is ±23 wide)
    /* 🌊 SEA WEATHER (parity with Ride's living sky) · three states rotate on a
     * rare-but-guaranteed clock: SQUALL (rain streaks, heavy fog), BIOLUM NIGHT
     * (the water glows teal, stars flare), GOLDEN SUNRISE (warm bright break).
     * All visual-only; announced through the existing feed. */
    const rainN = 220;
    const rainPos = new Float32Array(rainN * 3);
    for (let i = 0; i < rainN; i++) {
      rainPos[i * 3] = (Math.random() - 0.5) * 90;
      rainPos[i * 3 + 1] = 8 + Math.random() * 40;
      rainPos[i * 3 + 2] = -10 - Math.random() * 160;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
    const rainMat = new THREE.PointsMaterial({ color: 0x9db8d8, size: 0.35, transparent: true, opacity: 0 });
    scene.add(new THREE.Points(rainGeo, rainMat));
    let seaWeather: "squall" | "biolum" | "sunrise" | null = null;
    let seaWeatherT = 0;
    let seaWeatherNext = 70_000 + Math.random() * 50_000;
    const baseFogFar = 240;
    const seaFog = scene.fog as THREE.Fog; // constructed as THREE.Fog above
    const palms: THREE.Object3D[] = [];
    void loadGlb("/models/palm.glb")
      .then((m) => {
        for (let i = 0; i < 8; i++) {
          const p = m.clone(true);
          fitTo(p, 5 + Math.random() * 3, "y");
          const side = i % 2 === 0 ? 1 : -1;
          p.position.set(side * (26 + Math.random() * 8), -0.5, -20 - i * 30 - Math.random() * 10);
          p.rotation.y = Math.random() * Math.PI * 2;
          p.rotation.z = (Math.random() - 0.5) * 0.12; // wind-leant trunks
          scene.add(p);
          palms.push(p);
        }
      })
      .catch(() => {});
    // 🪨 shoreline rocks between the palms · the banks read as a real coast
    void Promise.all([loadGlb("/models/rocks.glb"), loadGlb("/models/rock-large.glb")])
      .then(([small, large]) => {
        for (let i = 0; i < 10; i++) {
          const r = (i % 3 === 0 ? large : small).clone(true);
          fitTo(r, i % 3 === 0 ? 3.2 + Math.random() * 1.6 : 1.4 + Math.random() * 1.2, "x");
          const side = i % 2 === 0 ? 1 : -1;
          r.position.set(side * (25 + Math.random() * 10), -0.8, -8 - i * 24 - Math.random() * 12);
          r.rotation.y = Math.random() * Math.PI * 2;
          scene.add(r);
          palms.push(r); // recycle with the same conveyor
        }
      })
      .catch(() => {});
    // 🕊 seabirds · a small flock wheels over the break, alive against the moon
    const birds: { g: THREE.Object3D; r: number; h: number; sp: number; ph: number }[] = [];
    void loadGlb("/models/bird.glb")
      .then((m) => {
        tintAll(m, 0x1a2232, 0.15);
        for (let i = 0; i < 5; i++) {
          const b = m.clone(true);
          fitTo(b, 1.6 + Math.random() * 0.9, "x");
          scene.add(b);
          birds.push({
            g: b,
            r: 14 + Math.random() * 22, // orbit radius
            h: 10 + Math.random() * 9,
            sp: 0.25 + Math.random() * 0.2, // rad/s
            ph: Math.random() * Math.PI * 2,
          });
        }
      })
      .catch(() => {});
    // stars
    const starN = 260;
    const starPos = new Float32Array(starN * 3);
    for (let i = 0; i < starN; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 400;
      starPos[i * 3 + 1] = 15 + Math.random() * 120;
      starPos[i * 3 + 2] = -60 - Math.random() * 260;
    }
    const stars = new THREE.Points(
      new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(starPos, 3)),
      new THREE.PointsMaterial({ color: 0xcfe0ff, size: 0.5, sizeAttenuation: true, transparent: true, opacity: 0.8 }));
    scene.add(stars);

    /* --------------------------- the WAVE ------------------------------ */
    // ring buffer of the real mid · normalized over a rolling window into the
    // swell heights. The market literally sculpts the water.
    const N = 120; // heightfield rows toward the horizon
    const DZ = 2.2; // meters between rows
    const heights = new Float32Array(N).fill(0);
    let priceMin = Infinity, priceMax = -Infinity;
    const priceWin: number[] = [];
    const pushPrice = (p: number) => {
      if (!p) return;
      priceWin.push(p);
      if (priceWin.length > 600) priceWin.shift();
      priceMin = Math.min(...priceWin);
      priceMax = Math.max(...priceWin);
      const span = Math.max(priceMax - priceMin, p * 0.0005); // floor: waves never flatline
      const h = ((p - priceMin) / span) * 5.2 + 0.6; // 0.6..5.8
      // scroll: newest row enters at the horizon
      for (let i = 0; i < N - 1; i++) heights[i] = heights[i + 1];
      heights[N - 1] = h;
    };

    // swell surface · heightfield plane, rows follow the buffer
    const surfGeo = new THREE.PlaneGeometry(46, N * DZ, 1, N - 1);
    surfGeo.rotateX(-Math.PI / 2);
    const surfMat = new THREE.MeshStandardMaterial({
      color: 0x0a1526,
      roughness: 0.35,
      metalness: 0.55,
      emissive: 0x0a2233,
      emissiveIntensity: 0.55,
      side: THREE.DoubleSide,
    });
    const surf = new THREE.Mesh(surfGeo, surfMat);
    scene.add(surf);
    // glowing crest ribbon · a narrow strip pinned to the surface centerline
    const crestGeo = new THREE.PlaneGeometry(0.7, N * DZ, 1, N - 1);
    crestGeo.rotateX(-Math.PI / 2);
    const crestMat = new THREE.MeshStandardMaterial({
      color: 0x062018,
      emissive: 0x27f2a4,
      emissiveIntensity: 1.1,
      side: THREE.DoubleSide,
    });
    const crest = new THREE.Mesh(crestGeo, crestMat);
    crest.position.y = 0.06;
    scene.add(crest);

    const surfaceYAt = (row: number) => heights[Math.max(0, Math.min(N - 1, row))];
    // player row sits NEAR the field's front edge: the nearest row must stay
    // well in front of the camera (z≈12) or the crest ribbon impales the lens
    const PLAYER_ROW = 3;
    const rowToZ = (i: number) => (PLAYER_ROW - i) * DZ; // player row → z=0, horizon → −z

    const applyHeights = () => {
      const pos = surfGeo.attributes.position as THREE.BufferAttribute;
      const cpos = crestGeo.attributes.position as THREE.BufferAttribute;
      // plane rows: 2 verts per row (x=±23) · row 0 = farthest after rotation
      for (let i = 0; i < N; i++) {
        const y = heights[i];
        const z = rowToZ(i);
        for (const vi of [i * 2, i * 2 + 1]) {
          pos.setY(vi, y - Math.abs(pos.getX(vi)) * 0.08); // slight side fall-off
          pos.setZ(vi, z);
        }
        // crest ribbon only exists AHEAD · near-field rows dive under the water
        // so the glow line vanishes before it can cross the camera plane
        const crestY = i > PLAYER_ROW + 5 ? y + 0.05 : y - 0.8;
        for (const vi of [i * 2, i * 2 + 1]) {
          cpos.setY(vi, crestY);
          cpos.setZ(vi, z);
        }
      }
      pos.needsUpdate = true;
      cpos.needsUpdate = true;
      surfGeo.computeVertexNormals();
    };

    /* ----------------------------- surfer ------------------------------ */
    const surfer = new THREE.Group();
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.1, 2.3),
      new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.4, metalness: 0.5, emissive: 0xff7a1a, emissiveIntensity: 0.55 }));
    surfer.add(board);
    // real board (CC0) swaps under the rider when loaded · procedural fallback
    void loadGlb("/models/board.glb")
      .then((m) => {
        fitTo(m, 2.4, "z");
        tintAll(m, 0xff7a1a, 0.5);
        board.visible = false;
        surfer.add(m);
      })
      .catch(() => {});
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.8 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.72, 0.3), bodyMat);
    torso.position.y = 0.55;
    surfer.add(torso);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x0e1216, roughness: 0.3, metalness: 0.6, emissive: 0x27f2a4, emissiveIntensity: 0.5 }));
    head.position.y = 1.05;
    surfer.add(head);
    const armGeo = new THREE.BoxGeometry(0.12, 0.5, 0.12);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(armGeo, bodyMat);
      arm.position.set(0.3 * s, 0.6, 0);
      arm.rotation.z = -s * 0.6;
      surfer.add(arm);
    }
    scene.add(surfer);
    // spray · a small emitter that breathes with speed + carving
    const sprayN = 90;
    const sprayPos = new Float32Array(sprayN * 3);
    const sprayLife = new Float32Array(sprayN).fill(0);
    const spray = new THREE.Points(
      new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(sprayPos, 3)),
      new THREE.PointsMaterial({ color: 0xbfe8ff, size: 0.22, transparent: true, opacity: 0.85 }));
    scene.add(spray);

    /* ------------------------ entities of the sea ---------------------- */
    interface Bob { mesh: THREE.Object3D; band: Band; taken?: boolean; kind: "coin" | "gem" | "debris"; }
    const bobs: Bob[] = [];
    const coinGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.12, 18);
    coinGeo.rotateX(Math.PI / 2);
    const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd24a, emissive: 0xcf8b00, emissiveIntensity: 0.9, metalness: 0.9, roughness: 0.15 });
    const gemGeo = new THREE.OctahedronGeometry(0.7, 0);
    const gemMat = new THREE.MeshStandardMaterial({ color: 0x241f4a, emissive: 0xa9a3ff, emissiveIntensity: 2.4, metalness: 0.4, roughness: 0.15 });
    const debrisGeo = new THREE.IcosahedronGeometry(0.6, 0);
    const debrisMat = new THREE.MeshStandardMaterial({ color: 0x220206, emissive: 0xff2a3c, emissiveIntensity: 1.6, roughness: 0.6 });
    const spawnBob = (kind: Bob["kind"], band: Band, row = N - 2) => {
      const mesh = new THREE.Mesh(kind === "coin" ? coinGeo : kind === "gem" ? gemGeo : debrisGeo, kind === "coin" ? coinMat : kind === "gem" ? gemMat : debrisMat);
      mesh.position.set((Math.random() - 0.5) * 1.4, 0, rowToZ(row));
      mesh.userData.row = row;
      mesh.userData.band = band;
      scene.add(mesh);
      bobs.push({ mesh, band, kind });
    };

    // 🐬 / 🦈 · the ocean's market fauna (dolphin pods on buy surges arcing on
    // the lip side · shark fins slicing the trough on sell pressure)
    interface Fin { mesh: THREE.Object3D; kind: "dolphin" | "shark"; t: number; row: number; scored: boolean; }
    const fins: Fin[] = [];
    const dolphinMat = new THREE.MeshStandardMaterial({ color: 0x11202c, roughness: 0.45, metalness: 0.5, emissive: 0x27f2a4, emissiveIntensity: 0.7 });
    const sharkMat = new THREE.MeshStandardMaterial({ color: 0x1a0d10, roughness: 0.6, emissive: 0xff4d5e, emissiveIntensity: 1.1 });
    // REAL fauna models (CC0 Quaternius) swap in when loaded · procedural
    // silhouettes remain the instant default and the permanent fallback
    const faunaTpl: { dolphin?: THREE.Object3D; shark?: THREE.Object3D } = {};
    void loadGlb("/models/dolphin.glb")
      .then((m) => {
        fitTo(m, 1.8, "z");
        tintAll(m, 0x27f2a4, 0.25);
        faunaTpl.dolphin = m;
      })
      .catch(() => {});
    void loadGlb("/models/shark.glb")
      .then((m) => {
        fitTo(m, 2.4, "z");
        tintAll(m, 0xff4d5e, 0.3);
        faunaTpl.shark = m;
      })
      .catch(() => {});
    const makeDolphin = () => {
      const g = new THREE.Group();
      if (faunaTpl.dolphin) {
        g.add(faunaTpl.dolphin.clone(true));
        return g;
      }
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.2, 4, 10), dolphinMat);
      body.rotation.z = Math.PI / 2;
      g.add(body);
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 6), dolphinMat);
      fin.position.y = 0.4;
      g.add(fin);
      return g;
    };
    const makeShark = () => {
      const g = new THREE.Group();
      if (faunaTpl.shark) {
        g.add(faunaTpl.shark.clone(true));
        return g;
      }
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.1, 4), sharkMat);
      fin.scale.z = 0.4;
      g.add(fin);
      return g;
    };
    const spawnPod = (kind: "dolphin" | "shark") => {
      for (let i = 0; i < 3; i++) {
        const mesh = kind === "dolphin" ? makeDolphin() : makeShark();
        const row = PLAYER_ROW + 6 + i * 5;
        mesh.position.set(kind === "dolphin" ? 5.5 + Math.random() : -5.5 - Math.random(), 0, rowToZ(row));
        scene.add(mesh);
        fins.push({ mesh, kind, t: Math.random() * Math.PI * 2, row, scored: false });
      }
      pushB(kind === "dolphin" ? "🐬 buyers surging · the pod runs the LIP, ride high with them" : "🦈 sellers in the water · fins in the TROUGH, ride low with them");
    };

    /* --------------------------- game state ---------------------------- */
    /* ═══ THE CARVE MODEL ═══ the board's height on the face is CONTINUOUS
       now: a rail with weight, vertical momentum, the swell's own shove, and
       the lip and the trough as rails you can actually hit. The BAND (the
       trade side) is DERIVED from where the board really is, with hysteresis,
       so every trade rule downstream keeps working unchanged while the
       surfer finally carves instead of snapping between three heights. */
    let band: Band = 1; // derived · the trade side
    let carve = 0; // −1 trough … +1 lip · where the board really is
    let carveV = 0; // vertical momentum · face units per second
    let rail = 0; // the edge you are holding · smoothed
    let railIn = 0; // raw analog input −1..1 (held keys / a vertical drag)
    let seekC: number | null = null; // tap-to-band target · a PD controller carves to it
    let bandY = 0; // world-space height the mesh actually sits at
    let railHitCd = 0;
    let prevBaseY: number | null = null;
    let shove = 0; // the swell pushing you where price goes · decays
    const FACE_HALF = 1.28; // past the lip you go over the falls · past the trough you bog
    const BAND_C = [-1, 0, 1]; // band centres in carve units
    let speed = 14;
    let meters = 0;
    let score = 0;
    let coins = 0;
    let combo = 1;
    let comboT = 0;
    let wipes = 0;
    let wipeT = 0;
    let airT = 0;
    let gameOver = false;
    let coinCd = 2, debrisCd = 3.4, podCd = 0, gemCd = 10, alignT = 0;
    let openerDone = false, runT = 0, gemEver = false, finPrevFlow = 0;
    const buzzq: string[] = [];
    const pushB = (m: string) => {
      buzzq.unshift(m);
      if (buzzq.length > 3) buzzq.pop();
      setBuzz([...buzzq]);
      pushCastRef.current?.(m); // 📺 the broadcast hears every call
    };
    const bumpCombo = (v: number) => {
      combo = Math.min(5, combo + v);
      comboT = 4;
    };
    const pops: { txt: string; color: string; id: number }[] = [];
    const [, forcePop] = [0, () => {}];
    const doPop = (txt: string, color: string) => {
      pops.unshift({ txt, color, id: Date.now() + Math.random() });
      if (pops.length > 1) pops.pop();
      setPop(pops[0] ?? null);
      setTimeout(() => setPop((p) => (p && p.id === pops[0]?.id ? null : p)), 950);
    };
    void forcePop;

    const BAND_COLOR = ["#6ab8ff", "#d8e4de", "#27f2a4"];
    /* the trade side follows the BOARD, with hysteresis, so a carve that
       brushes a band edge does not flicker a real position on and off */
    const bandFromCarve = (): Band => {
      const enter = 0.55, leave = 0.32;
      if (band === 1) return carve > enter ? 2 : carve < -enter ? 0 : 1;
      if (band === 2) return carve >= leave ? 2 : carve < -enter ? 0 : 1;
      return carve <= -leave ? 0 : carve > enter ? 2 : 1;
    };
    /** a tap / the autopilot ASKS for a band · the board carves there (a
     *  real arc, not a snap) and the side commits when it actually arrives */
    const setBand = (b: Band) => {
      startOcean(); // first gesture wakes the sea (autoplay policy)
      if (gameOver || pausedRef.current) return;
      if (modeRef.current === "passenger") b = 1; // autopilot keeps the LINE
      seekC = BAND_C[Math.max(0, Math.min(2, b))];
      railIn = 0;
    };
    const commitBand = (b: Band) => {
      if (b === band) return;
      band = b;
      setTargetRef?.current?.(b === 2 ? 1 : b === 0 ? -1 : 0);
      sfx.dodge();
      // narrate every move · the newbie always knows what their money is doing
      const live = armedRef.current;
      doPop(
        b === 1
          ? `→ ${BAND_WORD[1]}${live ? " · closing real position…" : ""}`
          : `→ ${BAND_WORD[b]}${live ? " · placing real trade…" : ""}`,
        BAND_COLOR[b]);
    };

    /* ----------------------------- controls -----------------------------
     * HOLD ▲▼ to carve (analog, the rail bites harder the longer you hold),
     * a quick TAP hops one band as a real carve. On touch the thumb IS the
     * rail: drag up or down and the board follows proportionally; a quick
     * tap on the top or bottom third hops a band, the middle third is the
     * aerial. */
    const keyDownAt = new Map<string, number>();
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === "p" || e.key === "P" || e.key === "Escape") return togglePause();
      if (e.key === " ") {
        e.preventDefault();
        jump();
        return;
      }
      if (gameOver || pausedRef.current || modeRef.current === "passenger") return;
      if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
        startOcean();
        keyDownAt.set("U", performance.now());
        railIn = 1;
        seekC = null;
      }
      if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
        startOcean();
        keyDownAt.set("D", performance.now());
        railIn = -1;
        seekC = null;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const dir =
        e.key === "ArrowUp" || e.key === "w" || e.key === "W" ? "U" : e.key === "ArrowDown" || e.key === "s" || e.key === "S" ? "D" : null;
      if (!dir) return;
      const held = performance.now() - (keyDownAt.get(dir) ?? 0);
      keyDownAt.delete(dir);
      railIn = 0;
      // a quick tap = one band over, carved for real; a hold already carved
      if (held < 170 && !gameOver && !pausedRef.current && modeRef.current !== "passenger")
        setBand((dir === "U" ? band + 1 : band - 1) as Band);
    };
    addEventListener("keydown", onKey);
    addEventListener("keyup", onKeyUp);
    let dragged = false;
    let downY = 0;
    let pointerDown = false;
    renderer.domElement.style.touchAction = "none";
    const onDown = (e: PointerEvent) => {
      startOcean();
      if (gameOver || pausedRef.current) return;
      pointerDown = true;
      dragged = false;
      downY = e.clientY;
    };
    const onMove = (e: PointerEvent) => {
      if (!pointerDown || gameOver || pausedRef.current || modeRef.current === "passenger") return;
      const dy = e.clientY - downY;
      if (!dragged && Math.abs(dy) > 14) {
        dragged = true;
        seekC = null;
      }
      // drag UP climbs the face · the thumb is the rail
      if (dragged) railIn = Math.max(-1, Math.min(1, -dy / (window.innerHeight * 0.18)));
    };
    const onUp = (e: PointerEvent) => {
      if (!pointerDown) return;
      pointerDown = false;
      if (dragged) {
        dragged = false;
        railIn = 0; // thumb lifted · the rail releases
        return;
      }
      if (gameOver || pausedRef.current) return;
      const frac = e.clientY / window.innerHeight;
      if (frac < 0.38) setBand(Math.min(2, band + 1) as Band);
      else if (frac > 0.64) setBand(Math.max(0, band - 1) as Band);
      else jump();
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointercancel", onUp);
    const jump = () => {
      if (airT > 0 || gameOver || pausedRef.current) return;
      airT = 0.7;
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
    const priceTimer = setInterval(() => {
      if (!pausedRef.current && !gameOver) pushPrice(feed.mid);
    }, 240); // ~29s of price across the field · the swell is REAL history

    /* ------------------------- ocean sound bed --------------------------
     * A brown-noise wash through a lowpass · gain + cutoff SWELL with the
     * real tape and your speed, an LFO gives it the wave rhythm. Honors the
     * app mute; starts on the first gesture (autoplay policy). */
    let oc: AudioContext | null = null;
    let ocGain: GainNode | null = null;
    let ocFilter: BiquadFilterNode | null = null;
    const startOcean = () => {
      if (oc || isMuted()) return;
      try {
        oc = new AudioContext();
        const len = oc.sampleRate * 2;
        const buf = oc.createBuffer(1, len, oc.sampleRate);
        const d = buf.getChannelData(0);
        let lp = 0;
        for (let i = 0; i < len; i++) {
          const w = Math.random() * 2 - 1;
          lp = lp * 0.94 + w * 0.06;
          d[i] = lp * 3;
        }
        const src = oc.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        ocFilter = oc.createBiquadFilter();
        ocFilter.type = "lowpass";
        ocFilter.frequency.value = 380;
        ocGain = oc.createGain();
        ocGain.gain.value = 0;
        src.connect(ocFilter).connect(ocGain).connect(oc.destination);
        src.start();
      } catch {
        /* audio unavailable */
      }
    };

    /* --------------------------- 🌀 THE BARREL ---------------------------
     * The set-piece: sustained HOT real flow (same law as Ride's eruption)
     * opens the set wave. Curling arcs sweep overhead on the flow side; hold
     * the aligned band through the tube, "in the barrel" pays a trickle and
     * making it out pays big + surges the combo. Wrong band = closed out. */
    let barrelT = 0, barrelCd = 24, barrelHot = 0, barrelHold = 0, barrelTick = 0, arcSpawnCd = 0;
    let barrelSide: Band = 2;
    const barrelArcs: THREE.Mesh[] = [];
    const arcGeo = new THREE.TorusGeometry(4.4, 0.22, 8, 26, Math.PI);
    const arcMatBull = new THREE.MeshStandardMaterial({ color: 0x062018, emissive: 0x27f2a4, emissiveIntensity: 1.8, transparent: true, opacity: 0.85 });
    const arcMatBear = new THREE.MeshStandardMaterial({ color: 0x220206, emissive: 0xff4d5e, emissiveIntensity: 1.8, transparent: true, opacity: 0.85 });
    const startBarrel = (side: Band) => {
      if (barrelT > 0) return;
      barrelT = 6;
      barrelHold = 0;
      barrelTick = 0;
      barrelSide = side;
      sfx.cascade();
      pushB(
        side === 2
          ? "🌀 SET WAVE · the barrel opens on the LIP, get HIGH and hold it"
          : "🌀 SET WAVE · the barrel grinds the TROUGH, get LOW and hold it");
    };
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __rtnSurf?: unknown }).__rtnSurf = {
        barrel: (s: number) => startBarrel(s > 0 ? 2 : 0),
        // dev probe · the carve model, readable from the console/verification
        carve: () => ({ carve, carveV, rail, railIn, seekC, band, shove, airT, wipes }),
        finish: () => finishRun(),
      };
    }

    /* 👻 GHOST · race your own best-distance curve; passing it mid-run pays
     * once; out-surfing it at the flag writes the new ghost. */
    interface GhostSave {
      m: number;
      curve: [number, number][];
    }
    let ghostBest: GhostSave | null = null;
    try {
      ghostBest = JSON.parse(localStorage.getItem("rtn-ghostsurf") ?? "null");
    } catch {
      /* no ghost yet */
    }
    const ghostSamples: [number, number][] = [];
    let ghostSampleCd = 0;
    let ghostPassed = false;
    let ghostDeltaM: number | null = null;
    const ghostMat = new THREE.MeshStandardMaterial({
      color: 0x14122e,
      emissive: 0xa9a3ff,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.28,
    });
    const ghostSurfer = new THREE.Group();
    {
      const gBoard = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 2.3), ghostMat);
      ghostSurfer.add(gBoard);
      const gTorso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.72, 0.3), ghostMat);
      gTorso.position.y = 0.55;
      ghostSurfer.add(gTorso);
      const gHead = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 10), ghostMat);
      gHead.position.y = 1.05;
      ghostSurfer.add(gHead);
    }
    ghostSurfer.visible = false;
    scene.add(ghostSurfer);
    const ghostMAt = (tt: number): number => {
      const cv = ghostBest?.curve;
      if (!cv || cv.length === 0) return 0;
      if (tt <= cv[0][0]) return cv[0][1];
      for (let i = 1; i < cv.length; i++)
        if (tt <= cv[i][0]) {
          const [t0, m0] = cv[i - 1];
          const [t1, m1] = cv[i];
          return m0 + (m1 - m0) * ((tt - t0) / Math.max(0.001, t1 - t0));
        }
      return cv[cv.length - 1][1];
    };

    /* ------------------------------ loop -------------------------------- */
    let last = performance.now();
    let alive = true;
    const finishRun = () => {
      if (gameOver) return;
      gameOver = true;
      flattenRef?.current?.();
      const real = realRef?.current;
      const rec = saveRide({
        mode: "surf",
        live: armedRef.current,
        sim: { volume: Math.round(score), coins, dodges: 0, bestStreak: 0, crashes: wipes },
        real: real
          ? { fills: real.fills, volume: real.volume, fees: real.fees, pnl: real.pnl }
          : { fills: 0, volume: 0, fees: 0, pnl: 0 },
      });
      submitRide(rec);
      setOverRec(rec);
      void aiCoach(rec, career()).then(setAiTip).catch(() => {});
      bumpBounty("surf_m", Math.round(meters));
      // 👻 out-surfed the ghost? the new pace curve becomes the rival
      const hadBest = ghostBest?.m ?? 0;
      if (meters > hadBest && ghostSamples.length > 3) {
        ghostBest = { m: meters, curve: [...ghostSamples] };
        try {
          localStorage.setItem("rtn-ghostsurf", JSON.stringify(ghostBest));
        } catch {
          /* private mode · the run still counts */
        }
      }
      setOver({
        m: Math.round(meters),
        score: Math.round(score),
        coins,
        bestM: hadBest > 0 ? Math.round(hadBest) : null,
      });
    };

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
      speed = 13 + Math.abs(flow) * 9;
      meters += speed * dt;

      // combo decay
      if (comboT > 0) comboT -= dt;
      else combo = Math.max(1, combo - dt * 0.5);

      /* the swell rolls · re-apply heights every frame (cheap: 240 verts) */
      applyHeights();

      /* ═══ THE CARVE MODEL ═══ a rail with lag, vertical momentum, the
         swell's shove, and a lip and a trough you can actually hit. */
      const baseY = surfaceYAt(PLAYER_ROW);
      if (modeRef.current === "passenger") {
        // the autopilot holds the LINE · it carves back if the sea shoves it
        railIn = 0;
        if (seekC == null && Math.abs(carve) > 0.06) seekC = 0;
      }
      let railTarget = railIn;
      if (seekC != null) {
        // tap-to-band: a PD controller works the rail so the board ARCS there
        const err = seekC - carve;
        railTarget = Math.max(-1, Math.min(1, err * 2.4 - carveV * 0.35));
        if (Math.abs(err) < 0.04 && Math.abs(carveV) < 0.25) {
          seekC = null;
          railTarget = 0;
        }
      }
      rail += (railTarget - rail) * Math.min(1, dt * 11); // the rail has bite
      // THE SWELL SHOVES YOU WHERE PRICE GOES · the water under the board
      // rising (a pump) lifts you toward the lip, dropping (a dump) pulls you
      // toward the trough. Transient and capped: the sea can nudge you, it
      // can never carry you into a trade on its own (the band edge is 0.55,
      // the biggest shove moves you ~0.3).
      if (prevBaseY != null) shove += (baseY - prevBaseY) * 6;
      prevBaseY = baseY;
      shove = Math.max(-1.5, Math.min(1.5, shove));
      shove -= shove * Math.min(1, dt * 3);
      carveV += (rail * 9 + shove) * dt;
      carveV -= carveV * Math.min(1, dt * 5.2); // the water's grip · a hold climbs ~1.7 bands/s
      carve += carveV * dt;
      if (railHitCd > 0) railHitCd -= dt;
      if (carve > FACE_HALF || carve < -FACE_HALF) {
        const overLip = carve > FACE_HALF;
        carve = Math.max(-FACE_HALF, Math.min(FACE_HALF, carve));
        if (Math.abs(carveV) > 0.6 && railHitCd <= 0) {
          railHitCd = 0.6;
          combo = Math.max(1, combo - 0.3);
          sfx.dodge();
          doPop(overLip ? "⚡ OVER THE LIP · ease off the rail" : "⚡ BOGGED IN THE TROUGH · lift the nose", "#ffd166");
        }
        carveV *= -0.35; // the face throws you back onto it
      }
      const nb = bandFromCarve();
      if (nb !== band) commitBand(nb);
      const carving = Math.abs(carve) > 0.3 || Math.abs(carveV) > 0.8;
      const targetY = baseY + carve * 2.3 * (0.55 + baseY * 0.12);
      if (airT > 0) {
        airT -= dt;
        bandY += dt * 3.2; // rising float
        if (airT <= 0) {
          score += Math.round(60 * combo);
          bumpCombo(0.4);
          doPop(`🌀 AERIAL +$${Math.round(60 * combo)}`, "#a9a3ff");
          bumpBounty("surf_air", 1);
        }
      } else {
        bandY += (targetY - bandY) * Math.min(1, dt * 9);
      }
      surfer.position.set(0, Math.max(0.4, bandY), 0);
      const slope = surfaceYAt(PLAYER_ROW - 2) - surfaceYAt(PLAYER_ROW + 2);
      // nose up when climbing, down when dropping in · bank INTO the carve
      surfer.rotation.x = slope * 0.06 - carveV * 0.18;
      surfer.rotation.z = -carve * 0.22 - rail * 0.12;
      camera.position.y += (surfer.position.y + 5.8 - camera.position.y) * Math.min(1, dt * 3);
      camera.lookAt(1.2, surfer.position.y + 0.8, -26);

      // wipeout shake · settles back to the off-axis frame
      if (wipeT > 0) {
        wipeT -= dt;
        camera.position.x = -4.6 + (Math.random() - 0.5) * 0.5;
      } else camera.position.x += (-4.6 - camera.position.x) * Math.min(1, dt * 4);

      /* alignment · riding the band the flow endorses = carving with the swell */
      const flowBand: Band = flow > 0.15 ? 2 : flow < -0.15 ? 0 : 1;
      if (band === flowBand && band !== 1) {
        alignT += dt;
        if (alignT > 2.2) {
          alignT = 0;
          const gain = Math.round(45 * combo);
          score += gain;
          bumpCombo(0.25);
          sfx.draft();
          doPop(`🌊 CARVING WITH THE SWELL +$${gain}`, "#27f2a4");
        }
      } else alignT = 0;

      /* fauna · the ocean's truth-tellers */
      podCd -= dt;
      if (!openerDone && runT > 7) {
        openerDone = true;
        spawnPod(flow >= 0 ? "dolphin" : "shark");
        podCd = 16;
      }
      if (podCd <= 0) {
        if (finPrevFlow < 0.5 && flow >= 0.5) {
          spawnPod("dolphin");
          podCd = 16;
        } else if (finPrevFlow > -0.5 && flow <= -0.5) {
          spawnPod("shark");
          podCd = 16;
        }
      }
      // whale gem on a real flow jerk (+ first-gem guarantee)
      gemCd -= dt;
      if ((gemCd <= 0 && Math.abs(flow - finPrevFlow) > 0.5) || (!gemEver && runT > 40)) {
        gemEver = true;
        spawnBob("gem", flow > 0 ? 2 : 0);
        pushB(flow > 0 ? "💎 whale BUY print · gem up on the LIP" : "💎 whale SELL print · gem down in the TROUGH");
        gemCd = 24;
      }
      finPrevFlow = flow;
      for (let i = fins.length - 1; i >= 0; i--) {
        const f = fins[i];
        f.t += dt * (f.kind === "dolphin" ? 2.2 : 1.1);
        f.row -= dt * 2.4; // glide toward the player
        const z = rowToZ(f.row);
        const y = surfaceYAt(Math.round(f.row));
        if (f.kind === "dolphin") {
          f.mesh.position.set(f.mesh.position.x, y + Math.max(0, Math.sin(f.t)) * 2.2 + 0.4, z);
          f.mesh.rotation.x = Math.cos(f.t) * 0.7;
        } else {
          f.mesh.position.set(f.mesh.position.x, y + 0.25, z);
          f.mesh.rotation.y = Math.sin(f.t * 0.7) * 0.3;
        }
        // alignment bonus as they pass
        if (!f.scored && Math.abs(z) < 4) {
          const side: Band = f.kind === "dolphin" ? 2 : 0;
          if (band === side) {
            f.scored = true;
            const gain = Math.round(60 * combo);
            score += gain;
            bumpCombo(0.3);
            sfx.draft();
            doPop(f.kind === "dolphin" ? `🐬 RIDING WITH THE POD +$${gain}` : `🦈 HUNTING WITH THE FINS +$${gain}`, f.kind === "dolphin" ? "#27f2a4" : "#6ab8ff");
          }
        }
        if (f.row < -6) {
          scene.remove(f.mesh);
          fins.splice(i, 1);
        }
      }

      /* 🌀 the barrel · sustained hot flow opens the set wave */
      barrelCd -= dt;
      if (barrelT <= 0 && barrelCd <= 0) {
        if (Math.abs(flow) > 0.7) barrelHot += dt;
        else barrelHot = 0;
        if (barrelHot > 1) {
          barrelHot = 0;
          barrelCd = 45 + Math.random() * 25;
          startBarrel(flow > 0 ? 2 : 0);
        }
      }
      if (barrelT > 0) {
        barrelT -= dt;
        arcSpawnCd -= dt;
        if (arcSpawnCd <= 0) {
          arcSpawnCd = 0.45;
          const m = new THREE.Mesh(arcGeo, barrelSide === 2 ? arcMatBull : arcMatBear);
          // spawn CLOSE (a few seconds out) so the tube envelops the rider
          // DURING the event, the horizon is too far for a 6s set-piece
          m.userData.row = PLAYER_ROW + 15 + Math.random() * 5;
          scene.add(m);
          barrelArcs.push(m);
        }
        (scene.fog as THREE.Fog).near = 40; // the tube tightens the world
        if (band === barrelSide) {
          barrelHold += dt;
          barrelTick += dt;
          if (barrelTick > 0.8) {
            barrelTick = 0;
            const gain = Math.round(35 * combo);
            score += gain;
            doPop(`🌀 IN THE BARREL +$${gain}`, barrelSide === 2 ? "#27f2a4" : "#6ab8ff");
            sfx.draft();
          }
        } else {
          score = Math.max(0, score - 8 * dt); // it's closing out on you
        }
        if (barrelT <= 0) {
          (scene.fog as THREE.Fog).near = 60;
          if (barrelHold > 4) {
            const gain = Math.round(400 * combo);
            score += gain;
            bumpCombo(1);
            sfx.coin();
            doPop(`🌀 MADE IT OUT +$${gain}`, "#ffd24a");
            hlRefCall.current?.("barrel-made-it");
          } else {
            doPop("🌀 CLOSED OUT · the set rolled you", "#ff8a70");
          }
        }
      }
      for (let i = barrelArcs.length - 1; i >= 0; i--) {
        const a = barrelArcs[i];
        a.userData.row = (a.userData.row as number) - dt * (speed / DZ);
        const row = a.userData.row as number;
        a.position.set(0, surfaceYAt(Math.round(row)) + 0.2, rowToZ(row));
        if (row < -4) {
          scene.remove(a);
          barrelArcs.splice(i, 1);
        }
      }

      /* coins · pay the flow band most (positioned = paid, same as Ride) */
      coinCd -= dt;
      if (coinCd <= 0) {
        const b: Band = flow > 0.1 ? 2 : flow < -0.1 ? 0 : (Math.random() < 0.5 ? 0 : 2);
        for (let k = 0; k < 4; k++) spawnBob("coin", b, N - 2 - k * 3);
        coinCd = 2.6 + Math.random() * 2 - Math.min(1, Math.abs(flow));
      }
      debrisCd -= dt;
      if (debrisCd <= 0) {
        // debris floats AGAINST the flow · the wrong band is the risky band
        const b: Band = flow > 0.1 ? 0 : flow < -0.1 ? 2 : (Math.random() < 0.5 ? 0 : 2);
        spawnBob("debris", b);
        debrisCd = 1.6 + Math.random() * 1.6 - Math.min(0.6, Math.abs(flow) * 0.6);
      }
      for (let i = bobs.length - 1; i >= 0; i--) {
        const b = bobs[i];
        b.mesh.userData.row -= dt * (speed / DZ);
        const row = b.mesh.userData.row as number;
        const z = rowToZ(row);
        const y = surfaceYAt(Math.round(row)) + BAND_Y[b.band] * 0.5 + 0.7;
        b.mesh.position.z = z;
        b.mesh.position.y = y + Math.sin(now2 / 300 + i) * 0.15;
        b.mesh.rotation.y += dt * 2;
        if (!b.taken && Math.abs(z) < 1.6 && band === b.band && airT <= 0) {
          b.taken = true;
          if (b.kind === "coin") {
            coins++;
            const gain = Math.round(25 * combo);
            score += gain;
            bumpCombo(0.12);
            sfx.coin();
            bumpBounty("surf_coins", 1);
          } else if (b.kind === "gem") {
            const gain = Math.round(250 * combo);
            score += gain;
            bumpCombo(0.8);
            sfx.coin();
            doPop(`💎 WHALE GEM +$${gain}`, "#a9a3ff");
            bumpBounty("gems", 1);
          } else {
            // WIPEOUT · spin to the LINE + the real position closes (safety reflex)
            wipes++;
            wipeT = 1;
            combo = 1;
            score = Math.max(0, score - 100);
            sfx.crash();
            doPop(wipes >= 3 ? "🌊 WIPED OUT · SET OVER" : `🌊 WIPEOUT (${wipes}/3)`, "#ff4d5e");
            // spun back to the LINE · the rail keeps whatever the thumb or
            // key is STILL doing (zeroing it left a held key dead until
            // re-pressed)
            band = 1;
            carve = 0;
            carveV = 0;
            seekC = null;
            bandY = surfaceYAt(PLAYER_ROW);
            setTargetRef?.current?.(0);
            flattenRef?.current?.();
            if (navigator.vibrate) navigator.vibrate(80);
            if (wipes >= 3) finishRun();
          }
          if (b.kind !== "debris") {
            scene.remove(b.mesh);
            bobs.splice(i, 1);
            continue;
          }
        }
        if (row < -4) {
          scene.remove(b.mesh);
          bobs.splice(i, 1);
        }
      }

      /* spray · breathes with speed, doubles while carving off-line */
      const sp = spray.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < sprayN; i++) {
        sprayLife[i] -= dt;
        if (sprayLife[i] <= 0 && carving && airT <= 0) {
          sprayLife[i] = 0.4 + Math.random() * 0.4;
          sp.setXYZ(i, (Math.random() - 0.5) * 0.8, surfer.position.y - 0.1, 1 + Math.random());
        } else {
          sp.setY(i, sp.getY(i) + dt * 2.2);
          sp.setZ(i, sp.getZ(i) + dt * speed * 0.6);
        }
      }
      sp.needsUpdate = true;
      (spray.material as THREE.PointsMaterial).opacity = carving ? 0.85 : 0.25;

      /* ocean bed · the wash swells with the tape, the tube roars louder */
      if (oc && ocGain && ocFilter) {
        const swell =
          0.045 + Math.abs(flow) * 0.05 + Math.sin(now2 / 1400) * 0.015 + (barrelT > 0 ? 0.055 : 0);
        ocGain.gain.value = isMuted() ? 0 : Math.max(0, swell);
        ocFilter.frequency.value = 320 + Math.abs(flow) * 600 + speed * 6;
      }

      /* 👻 ghost race · sample my pace, surf the rival at the live delta */
      ghostSampleCd -= dt;
      if (ghostSampleCd <= 0) {
        ghostSampleCd = 2;
        if (ghostSamples.length < 400) ghostSamples.push([runT, meters]);
      }
      if (ghostBest) {
        const gd = ghostMAt(runT) - meters; // meters · positive = ghost ahead
        ghostDeltaM = Math.round(gd);
        const gz = Math.max(-70, Math.min(5, -gd * 0.3));
        const gRow = Math.round(PLAYER_ROW - gz / DZ);
        ghostSurfer.visible = true;
        ghostSurfer.position.set(3.4, Math.max(0.4, surfaceYAt(gRow) + 0.2), gz);
        ghostSurfer.rotation.z = Math.sin(now2 / 520) * 0.12;
        if (!ghostPassed && gd <= 0 && runT > 5) {
          ghostPassed = true;
          score += 150;
          bumpCombo(0.3);
          sfx.coin();
          doPop("👻 AHEAD OF YOUR BEST +$150", "#a9a3ff");
        }
      } else {
        ghostDeltaM = null;
        ghostSurfer.visible = false;
      }

      // the lighthouse breathes · slow sweep pulse on the horizon
      beaconMat.color.setHSL(0.11, 0.85, 0.45 + 0.3 * Math.max(0, Math.sin(now2 / 900)));
      // the coast slides past · palms wrap like the water does
      for (const p of palms) {
        p.position.z += speed * dt * 0.9;
        if (p.position.z > 16) p.position.z -= 260;
      }
      // seabirds wheel in slow circles ahead, banking into their turns
      for (const b of birds) {
        const a = now2 / 1000 * b.sp + b.ph;
        b.g.position.set(Math.cos(a) * b.r, b.h + Math.sin(a * 2.3) * 1.2, -70 + Math.sin(a) * b.r * 0.6);
        b.g.rotation.y = -a + Math.PI / 2;
        b.g.rotation.z = 0.3; // banked wings
      }
      // 🌊 sea weather engine · pick, run, release
      if (!seaWeather && now2 > seaWeatherNext) {
        seaWeather = (["squall", "biolum", "sunrise"] as const)[Math.floor(Math.random() * 3)];
        seaWeatherT = seaWeather === "squall" ? 22 : seaWeather === "biolum" ? 18 : 14;
        pushB(
          seaWeather === "squall"
            ? "🌧 SQUALL rolling in · rain on the face, hold your line"
            : seaWeather === "biolum"
              ? "🌌 the water starts to GLOW · bioluminescent night"
              : "🌅 GOLDEN SUNRISE breaking over the islands");
      }
      if (seaWeather) {
        seaWeatherT -= dt;
        const k = Math.min(1, dt * 1.6);
        if (seaWeather === "squall") {
          rainMat.opacity += (0.9 - rainMat.opacity) * k;
          seaFog.far += (150 - seaFog.far) * k;
          hemi.intensity += (0.55 - hemi.intensity) * k;
          for (let i = 0; i < rainN; i++) {
            rainPos[i * 3 + 1] -= dt * 46;
            if (rainPos[i * 3 + 1] < 0) rainPos[i * 3 + 1] = 40;
          }
          rainGeo.attributes.position.needsUpdate = true;
        } else if (seaWeather === "biolum") {
          crestMat.emissiveIntensity += (2.6 - crestMat.emissiveIntensity) * k;
          surfMat.emissiveIntensity = (surfMat.emissiveIntensity ?? 0) + (0.5 - (surfMat.emissiveIntensity ?? 0)) * k;
          hemi.intensity += (0.7 - hemi.intensity) * k;
        } else {
          hemi.intensity += (1.7 - hemi.intensity) * k;
          moonLight.intensity += (1.2 - moonLight.intensity) * k;
        }
        if (seaWeatherT <= 0) {
          if (seaWeather === "sunrise") pushB("🌊 the night settles back over the swell");
          seaWeather = null;
          seaWeatherNext = now2 + 90_000 + Math.random() * 80_000;
        }
      } else {
        // ease everything home between events
        const k = Math.min(1, dt * 0.8);
        rainMat.opacity += (0 - rainMat.opacity) * k;
        seaFog.far += (baseFogFar - seaFog.far) * k;
        hemi.intensity += (0.9 - hemi.intensity) * k;
        moonLight.intensity += (0.7 - moonLight.intensity) * k;
        crestMat.emissiveIntensity += (Math.min(crestMat.emissiveIntensity, 2.0) - crestMat.emissiveIntensity) * k;
      }

      /* sky mood · flow tints the night, crest glows with the tape's side */
      (scene.background as THREE.Color).setRGB(
        0.03 + Math.max(0, -flow) * 0.1,
        0.04 + Math.max(0, flow) * 0.07,
        0.08);
      scene.fog!.color.copy(scene.background as THREE.Color);
      crestMat.emissive.setHex(flow >= 0 ? 0x27f2a4 : 0xff4d5e);
      crestMat.emissiveIntensity = 1.4 + Math.abs(flow) * 1.6;

      setHud({
        m: Math.round(meters),
        speed: Math.round(speed * 3),
        score: Math.round(score),
        coins,
        band,
        carve: Math.round(carve * 100) / 100,
        combo: Math.round(combo * 10) / 10,
        wipes,
        flow,
        connected: feed.connected,
        ghost: ghostDeltaM,
      });
      composer.render();
    };
    // prime the field so the first frames aren't a flatline
    for (let i = 0; i < N; i++) heights[i] = 2 + Math.sin(i * 0.15) * 0.8;
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
      clearInterval(priceTimer);
      feed.stop();
      void oc?.close().catch(() => {});
      if (modeRef.current !== "passenger") flattenRef?.current?.();
      renderer.dispose();
      wrap.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [pop, setPop] = useState<null | { txt: string; color: string; id: number }>(null);

  return (
    <div className="fixed inset-0 z-[70] bg-ink">
      <div ref={wrapRef} className="absolute inset-0" />
      {/* odometer */}
      <div className="pointer-events-none absolute left-4 top-[max(12px,env(safe-area-inset-top))] rounded-xl border border-hairline bg-ink/70 px-4 py-2.5 backdrop-blur-md">
        <div className="whitespace-nowrap text-[12px] uppercase tracking-[0.12em] text-flat">
          surfed · {armed ? "LIVE" : "practice"}
        </div>
        <div className="font-telemetry text-2xl font-extrabold text-bone min-[640px]:text-3xl">
          {hud.m} <span className="text-lg">m</span>
        </div>
        <div className="font-telemetry mt-0.5 whitespace-nowrap text-[12px] text-flat min-[640px]:text-[12px]">
          {hud.speed} km/h · ${hud.score.toLocaleString()} · ◈{hud.coins}
          {hud.combo > 1 && <span className="text-amber"> · ×{hud.combo}</span>}
        </div>
        {hud.ghost != null && (
          <div className={`font-telemetry mt-0.5 whitespace-nowrap text-[12px] ${hud.ghost > 0 ? "text-lav" : "text-chart"}`}>
            ghost · {hud.ghost > 0 ? `best +${hud.ghost}m ahead` : `you lead by ${-hud.ghost}m`}
          </div>
        )}
      </div>
      {/* status chips */}
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
            "● live · bands place real trades"
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
          {hud.flow >= 0 ? "▲ buyers pushing" : "▼ sellers pushing"} · live {getRideAsset()} swell
        </span>
        <span className="rounded-sm bg-ink/70 px-2 py-0.5 text-[11.5px] font-bold uppercase tracking-[0.12em] text-flat">
          NIGHT SWELL · SURFER
        </span>
      </div>
      {/* pop */}
      {pop && (
        <div key={pop.id} className="pointer-events-none absolute inset-x-0 top-[30%] flex justify-center px-5">
          <span className="max-w-[92vw] animate-[rtn-pop_0.9s_ease-out_forwards] text-center text-xl font-extrabold leading-tight" style={{ color: pop.color, textShadow: "0 2px 12px rgba(0,0,0,.8)" }}>
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
      {/* buzz feed · above the engine status card (104px + height) so toasts
          never render through it on phones */}
      <div className="pointer-events-none absolute bottom-[164px] left-4 flex max-w-[70vw] flex-col gap-1.5">
        {buzz.map((b, i) => (
          <span key={i} className={`rounded-lg border border-amber/30 bg-ink/70 px-2.5 py-1 text-[12px] font-bold text-amber backdrop-blur-sm ${i > 0 ? "opacity-50" : ""}`}>
            {b}
          </span>
        ))}
      </div>
      {/* band readout · the committed side, and under it the board's REAL
          place on the face: the marker slides continuously, the two ticks are
          the edges where a side commits (trough left, lip right) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-14 flex flex-col items-center gap-1.5">
        <div className="flex justify-center gap-2.5">
          {(["TROUGH", mode === "passenger" ? "AUTOPILOT" : "LINE", "LIP"] as const).map((label, i) => (
            <span
              key={label}
              className={`w-24 rounded-xl border py-2 text-center text-[12.5px] font-extrabold uppercase tracking-[0.04em] backdrop-blur-sm transition ${
                hud.band === i
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
        <div className="relative h-[5px] w-[308px] max-w-[92vw] rounded-full bg-ink/60 ring-1 ring-hairline" role="img" aria-label="where the board is on the face">
          <span className="absolute inset-y-0 left-[28.5%] w-px bg-bone/30" />
          <span className="absolute inset-y-0 left-[71.5%] w-px bg-bone/30" />
          <span
            className="absolute -top-[3px] h-[11px] w-[3px] rounded-sm bg-papaya shadow-[0_0_8px_var(--papaya)] transition-[left] duration-75"
            style={{ left: `calc(${((hud.carve + 1.28) / 2.56) * 100}% - 1.5px)` }}
          />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-[12px] text-flat">
        {mode === "passenger" ? (
          <span><span className="text-amber">PASSENGER</span> · autopilot holds the LINE · the grid farms while you watch the sea</span>
        ) : (
          <>
            <span className="sm:hidden">
              drag up/down = carve · <span className="text-bone">tap top/bottom = hop a band</span> ·{" "}
              <span className="text-amber">tap middle = aerial</span> · ride <span className="text-chart">with the swell</span>
            </span>
            <span className="hidden sm:inline">
              hold ▲▼ = carve · <span className="text-bone">tap = hop a band</span> ·{" "}
              <span className="text-amber">SPACE aerial</span> · <span className="text-bone">P pause</span> · ride{" "}
              <span className="text-chart">with the swell</span>, dodge <span className="text-blood">red debris</span> · wipeout = auto-flat
            </span>
          </>
        )}
      </div>
      {/* top-right controls */}
      <div className="absolute right-4 top-[max(60px,calc(env(safe-area-inset-top)+48px))] mt-16 flex flex-col items-end gap-2">
        <button onClick={() => setPaused((p) => { pausedRef.current = !p ? true : false; return !p; })} className="rounded-full border border-hairline bg-ink/70 px-3 py-1.5 text-[12px] font-bold text-bone backdrop-blur-md hover:border-papaya">
          {paused ? "▶ resume" : "❚❚ pause"}
        </button>
        <button onClick={onExit} className="rounded-full border border-hairline bg-ink/70 px-3 py-1.5 text-[12px] font-bold text-bone backdrop-blur-md hover:border-papaya">
          ✕ exit
        </button>
      </div>
      {/* run over */}
      {/* first-surf card · the ONE idea: the wave IS the market */}
      {tut && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-ink/85 p-5 backdrop-blur-sm">
          <div className="w-full max-w-[400px] rounded-xl border border-hairline bg-ink-soft p-5 text-center">
            <div className="text-lg font-extrabold text-bone">The wave is the market.</div>
            <div className="mt-1 text-[12px] leading-snug text-flat">
              That swell is the <b className="text-bone">live {getRideAsset()} chart on Perpl</b> rolling at you. Your
              height on the face is your position:
            </div>
            <div className="mx-auto mt-3 flex justify-center gap-2">
              <span className="w-24 rounded-md border border-chart bg-chart/20 py-2 text-[12px] font-bold text-chart">
                LIP ▲<div className="text-[10.5px] font-normal opacity-80">high = LONG</div>
              </span>
              <span className="w-24 rounded-md border border-bone/40 bg-ink py-2 text-[12px] font-bold text-bone">
                LINE
                <div className="text-[10.5px] font-normal opacity-80">middle = FLAT</div>
              </span>
              <span className="w-24 rounded-md border border-sky bg-sky/20 py-2 text-[12px] font-bold text-sky">
                TROUGH ▼<div className="text-[10.5px] font-normal opacity-80">low = SHORT</div>
              </span>
            </div>
            <ul className="mx-auto mt-4 max-w-[320px] space-y-1.5 text-left text-[12px] leading-snug text-flat">
              <li>
                <b className="text-bone">Hold ▲▼</b> (or drag) to carve the face, a quick tap hops
                a band · <b className="text-bone">SPACE</b> = aerial · the swell shoves you where
                price goes · dolphins run with buyers, sharks with sellers · ride WITH them
              </li>
              <li>
                When the <b className="text-bone">barrel</b> opens, hold the side it names, making it out pays big
              </li>
              <li>
                Wipeout = spun to <b className="text-bone">LINE</b>, position closed, capped
                small. <b className="text-bone">Same money rules as Ride: tiny clips, auto-closed.</b>
              </li>
            </ul>
            <button
              onClick={() => {
                localStorage.setItem("rtn-surf-tut", "1");
                setTut(false);
              }}
              className="mt-4 w-full rounded-lg bg-chart py-3 text-[13px] font-extrabold tracking-[0.08em] text-ink"
            >
              GOT IT · DROP IN →
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
            <div className="font-telemetry mt-2 text-4xl font-extrabold text-bone">{over.m}m</div>
            <div className="mt-1 text-[13px] text-flat">
              ${over.score.toLocaleString()} · ◈{over.coins} coins
            </div>
            {over.bestM == null ? (
              <div className="mt-2 text-[12px] text-lav">your ghost now surfs this pace, beat it next set</div>
            ) : over.m > over.bestM ? (
              <div className="mt-2 text-[12px] text-amber">NEW BEST · the ghost just got faster</div>
            ) : (
              <div className="mt-2 text-[12px] text-lav">
                {over.bestM - over.m}m short of your best, run it back
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
