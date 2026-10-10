"use client";

/**
 * ThreeRide · the 3D feel-test. A three.js behind-the-car night runner in the
 * spirit of the reference clip: low-poly volcano world, lane-dodge traffic,
 * coin runs. NO chart. The world still breathes with the REAL market via
 * LiveFeed (flow tints the sky, surges the volcano, biases traffic: green
 * rivals in updrafts, red trucks in dumps).
 *
 * PREVIEW build: score is simulated; the trade reconciler gets wired only if
 * the feel survives contact with players.
 */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import GameIcon from "./brand/GameIcon";
import { riderAlias } from "@/lib/game/riderName";
import Icon from "./brand/Icon";
import { LiveFeed, getRideAsset } from "@/lib/game/liveFeed";
import { loadGlb, loadGlbWithClips, fitTo, tintBody, tintAll } from "@/lib/game/glb";
import { loadSky, type SkyName } from "@/lib/game/sky";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { shareCard, ClipRecorder, HighlightRecorder, postToX } from "@/lib/share";
import { saveRide, coachTip, career, rideNet, type RideRecord } from "@/lib/game/rideLog";
import { Waterfall, Per1M, per1mText, per1mTone } from "./viz/Viz";
import { sfx, music, engine, isMuted, setMuted } from "@/lib/game/sfx";
import { bumpBounty } from "@/lib/game/bounties";
import { submitRide, fetchPercentile, fetchStreak, fetchTop } from "@/lib/game/backend";
import RiderHub from "./RiderHub";
import RaceProgress from "./RaceProgress";
import { inviteLink } from "@/lib/game/referral";

/** Career-volume clubs · the progression ladder. Crossing one mid-ride is a
 *  celebrated moment; the HUD always shows the road to the next. */
import { aiCoach } from "@/lib/game/aiCoach";
import { CLUBS, fmtClub } from "@/lib/game/clubs";

const LANES = [-4.2, 0, 4.2];

/* ═══ THE ROAD BENDS FOR REAL ═══════════════════════════════════════════════
 * Before: the world SWAYED (a sine on the shader bend) while the car snapped
 * between three fixed x positions — "moving like an oscillator left and
 * right", as the rider put it. Now the road is a distance-indexed curvature
 * field: straights, sweepers, S-bends and mountain switchbacks, generated as
 * you drive under a REGIME director (highway · coast · mountain) that the
 * live market leans on (a frantic tape makes the road twistier). The shader
 * bend shows the bend coming; a centrifugal force under the car makes you
 * STEER through it. Units are the shader's own (x += k·z²), so 0.0022 is a
 * corner you feel and 0.0032 is a switchback. */
type Regime = "highway" | "coast" | "mountain";
interface RoadSeg { start: number; len: number; k: number }
const REGIME_LABEL: Record<Regime, string> = {
  highway: "🛣 OPEN HIGHWAY · long straights, the odd sweeper — build speed",
  coast: "🌊 COAST ROAD · rolling S-bends — swerve, don't snap",
  mountain: "⛰ MOUNTAIN PASS · switchbacks and drops — brake into the corners",
};
class RoadPath {
  segs: RoadSeg[] = [{ start: 0, len: 420, k: 0 }];
  regime: Regime = "highway";
  regimeUntil = 1400; // units of distance
  private lastK = 0;
  market = 0; // |flow| 0..1 · a frantic tape bends the road harder
  onRegime?: (r: Regime) => void;
  private end() { const l = this.segs[this.segs.length - 1]; return l.start + l.len; }
  ensure(upTo: number) {
    while (this.end() < upTo) {
      const start = this.end();
      if (start >= this.regimeUntil) {
        const roll = Math.random() + this.market * 0.5; // frenzy tilts toward twisty
        const next: Regime = roll < 0.42 ? "highway" : roll < 0.8 ? "coast" : "mountain";
        this.regime = next;
        this.regimeUntil = start + 1100 + Math.random() * 900;
        this.onRegime?.(next);
      }
      const r = this.regime;
      const sign = this.lastK !== 0 && Math.random() < 0.7 ? -Math.sign(this.lastK) : Math.random() < 0.5 ? -1 : 1;
      let len: number, k: number;
      if (r === "highway") {
        if (Math.random() < 0.6) { len = 300 + Math.random() * 400; k = 0; }
        else { len = 240 + Math.random() * 180; k = sign * (0.0007 + Math.random() * 0.0006); }
      } else if (r === "coast") {
        if (Math.random() < 0.25) { len = 120 + Math.random() * 120; k = 0; }
        else { len = 170 + Math.random() * 160; k = sign * (0.0013 + Math.random() * 0.001); }
      } else {
        if (Math.random() < 0.2) { len = 90 + Math.random() * 90; k = 0; }
        else { len = 110 + Math.random() * 120; k = sign * (0.002 + Math.random() * 0.0013); }
      }
      this.segs.push({ start, len, k });
      if (k !== 0) this.lastK = k;
      if (this.segs.length > 40) this.segs.shift();
    }
  }
  /** curvature at distance s · blended across a 70-unit transition so the
   *  force never steps */
  curvatureAt(s: number) {
    this.ensure(s + 200);
    const segs = this.segs;
    let i = segs.findIndex((g) => s >= g.start && s < g.start + g.len);
    if (i < 0) i = segs.length - 1;
    const g = segs[i];
    const into = s - g.start;
    const T = 70;
    if (into < T && i > 0) {
      const prev = segs[i - 1];
      const u = into / T;
      const e = u * u * (3 - 2 * u);
      return prev.k + (g.k - prev.k) * e;
    }
    return g.k;
  }
  hillAt(s: number) {
    const amp = this.regime === "mountain" ? 0.00016 : this.regime === "coast" ? 0.00007 : 0.00003;
    return Math.sin(s / 260) * amp + Math.sin(s / 610 + 1.3) * amp * 0.5;
  }
}

/** One garage, many worlds: each DEX gets its own atmosphere. Same physics,
 *  same trading guardrails · different planet. */
/* MOODS · per-run time-of-day roll ("not everything is dark in reality").
 * Multiplies each world's palette toward dawn/dusk skies; night stays the
 * signature default. Rolled once per mount; dev-force via rtn-mood. */
const MOODS = {
  night: { skyMul: [1.25, 1.2, 1.25] as const, hemiMul: 1.3, starAlpha: 1.0, skyCap: 0.55, announce: "🌌 night drive · neon hours" },
  dusk: { skyMul: [2.6, 1.5, 1.9] as const, hemiMul: 1.5, starAlpha: 0.45, skyCap: 0.62, announce: "🌆 dusk drive · the sky burns out" },
  dawn: { skyMul: [2.2, 2.1, 2.6] as const, hemiMul: 1.8, starAlpha: 0.25, skyCap: 0.68, announce: "🌄 dawn drive · first light" },
  sunset: { skyMul: [3.6, 2.0, 1.6] as const, hemiMul: 2.1, starAlpha: 0.1, skyCap: 0.8, announce: "🌇 golden hour · sun low and warm" },
  day: { skyMul: [3.4, 3.6, 4.2] as const, hemiMul: 2.9, starAlpha: 0.0, skyCap: 1.0, announce: "🌞 clear day · full visibility" },
} as const;
type MoodId = keyof typeof MOODS;
function rollMood(): MoodId {
  try {
    const forced = localStorage.getItem("rtn-mood") as MoodId | null;
    if (forced && forced in MOODS) return forced;
  } catch {
    /* ignore */
  }
  // real variety ("or is it always dark?") · night is the signature, not the rule
  const r = Math.random();
  return r < 0.34 ? "night" : r < 0.52 ? "dusk" : r < 0.68 ? "dawn" : r < 0.84 ? "sunset" : "day";
}

/* CURVED WORLD · the road sweeps and rolls while gameplay stays straight.
 * View-space quadratic bend injected into every scene material's vertex
 * shader: x += bend·z², y += dip·z². Shared uniform objects let the loop
 * steer curvature smoothly.
 *
 * THE BEND NOW STARTS AT THE CAR'S NOSE (16 units), not 90 out. With the
 * onset at 90 the road under and just ahead of the car was a straight
 * ribbon the car could slide across — "feels like the road itself wasn't
 * curving". Every scene material (road, rails, traffic, coins, props) is bent
 * by the same function, so a truck in the right lane still sits on the right
 * lane of the CURVED road at its depth; gameplay x is untouched, and the
 * collision decision happens at z≈0 where the bend is zero by construction. */
const BEND_UNIFORMS = {
  uBend: { value: 0 },
  uDip: { value: 0 },
};
const BENT = new WeakSet<THREE.Material>();
let BENT_COUNT = 0; // dev probe · how many materials carry the bend patch
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  (window as unknown as { __rtnBend?: unknown }).__rtnBend = Object.assign(
    () => ({
      uBend: BEND_UNIFORMS.uBend.value,
      uDip: BEND_UNIFORMS.uDip.value,
      patched: BENT_COUNT,
    }),
    {
      set(b: number, d: number) {
        BEND_UNIFORMS.uBend.value = b;
        BEND_UNIFORMS.uDip.value = d;
      },
    });
}
function bendMaterial(mat: THREE.Material) {
  if (BENT.has(mat)) return;
  BENT.add(mat);
  BENT_COUNT++;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBend = BEND_UNIFORMS.uBend;
    shader.uniforms.uDip = BEND_UNIFORMS.uDip;
    shader.vertexShader =
      "uniform float uBend;\nuniform float uDip;\n" +
      shader.vertexShader.replace(
        "#include <project_vertex>",
        `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
float bz = clamp(-mvPosition.z - 16.0, 0.0, 260.0);
mvPosition.x += uBend * bz * bz;
mvPosition.y += uDip * bz * bz;
gl_Position = projectionMatrix * mvPosition;`);
  };
  mat.needsUpdate = true;
}

const WORLDS = {
  hotstuff: {
    label: "VOLCANO RUN · Hotstuff",
    base: [0.11, 0.05, 0.07] as const, // warm ember night
    hemiSky: 0x8a4a55,
    hemiGround: 0x140a0c,
    moon: 0xffd9b0,
    rail: 0xff8a4a, // ember orange · matches the volcano's warmth
    rock: 0x2a2226, // basalt with an ember warmth
  },
  hyperliquid: {
    label: "HYPERGRID · Hyperliquid",
    base: [0.03, 0.08, 0.09] as const, // deep mint-teal night
    hemiSky: 0x2a7a6a,
    hemiGround: 0x08110f,
    moon: 0xb0ffe2,
    rail: 0x2ad5a8, // mint-teal · Hyperliquid's own signature glow
    rock: 0x1f2a28, // sea-glass slate
  },
  lighter: {
    label: "LIGHTSPEED · Lighter · zero fees",
    base: [0.04, 0.05, 0.11] as const, // electric indigo night
    hemiSky: 0x5a5ad0,
    hemiGround: 0x0a0a1a,
    moon: 0xd0d0ff,
    rail: 0x8a8aff, // electric violet · lightspeed's own glow
    rock: 0x232338, // indigo-dusted stone
  },
  perpl: {
    label: "MONAD RUN · Perpl",
    base: [0.07, 0.04, 0.12] as const, // deep Monad purple night
    hemiSky: 0x7a4ad0,
    hemiGround: 0x0e0818,
    moon: 0xe0c8ff,
    rail: 0xa855f7, // Monad violet · perpl's signature glow
    rock: 0x2a2234, // amethyst-veined dark
  },
  extended: {
    label: "WALL STREET · Extended · TradFi",
    base: [0.05, 0.09, 0.07] as const, // deep money-green night
    hemiSky: 0x3aa06a,
    hemiGround: 0x08130d,
    moon: 0xd8ffe0,
    rail: 0x35d6a0, // Extended's green · trading-floor glow
    rock: 0x222a26, // granite with a money-green cast
  },
  ondo: {
    label: "THE HARBOR · Ondo · TradFi + airdrop",
    base: [0.03, 0.06, 0.11] as const, // deep ocean-blue night
    hemiSky: 0x2b6fd0,
    hemiGround: 0x06101c,
    moon: 0xc8e4ff,
    rail: 0x38a8ff, // Ondo's ocean blue · tokenized-RWA glow
    rock: 0x1f2732, // wet harbor stone
  },
  phoenix: {
    label: "THE FORGE · Phoenix · Solana on-chain",
    base: [0.09, 0.05, 0.02] as const, // ember-dark, molten warmth
    hemiSky: 0xff7a1a,
    hemiGround: 0x1a0d04,
    moon: 0xffd2a0,
    rail: 0xff7a1a, // Phoenix ember-orange · on-chain flame glow
    rock: 0x2e2218, // scorched forge slag
  },
  arcus: {
    label: "THE ARC · Arcus · Robinhood chain",
    base: [0.04, 0.07, 0.12] as const, // cold dawn blue, the arc before sunrise
    hemiSky: 0x6ab8ff,
    hemiGround: 0x0a1420,
    moon: 0xdbeaff,
    rail: 0x6ab8ff, // Arcus sky-blue · the bow over the chord
    rock: 0x1b2733, // blue-grey shale
  },
  paradex: {
    label: "THE VAULT · Paradex · Starknet",
    base: [0.06, 0.05, 0.11] as const, // violet-dark, cryptographic cold
    hemiSky: 0x8b7dff,
    hemiGround: 0x0c0a1a,
    moon: 0xd9d4ff,
    rail: 0x8b7dff, // Starknet violet · proof-glow over the vault
    rock: 0x24213a, // amethyst basalt
  },
  n1: {
    label: "THE MERIDIAN · N1 · Solana",
    base: [0.03, 0.08, 0.06] as const, // deep meridian green, Solana night
    hemiSky: 0x14f195,
    hemiGround: 0x061a12,
    moon: 0xd6fff0,
    rail: 0x14f195, // Solana green · one line straight through
    rock: 0x123326, // malachite
  },
  nado: {
    label: "THE FUNNEL · Nado · Ink",
    base: [0.05, 0.06, 0.1] as const, // storm-grey blue, the Ink night
    hemiSky: 0x7c5cff,
    hemiGround: 0x0b0d1a,
    moon: 0xe6e0ff,
    rail: 0x7c5cff, // Ink violet · the funnel's spine
    rock: 0x23253d, // slate
  },
  risex: {
    label: "THE ASCENT · RISEx · RISE",
    base: [0.09, 0.05, 0.04] as const, // ember dusk, a climb at sunrise
    hemiSky: 0xff8a3d,
    hemiGround: 0x1a0d08,
    moon: 0xffe0c2,
    rail: 0xff8a3d, // RISE orange · the rising line
    rock: 0x3a2418, // sandstone
  },
  polyperps: {
    label: "THE ODDS ROAD · Polymarket Perps · Polygon",
    base: [0.03, 0.05, 0.12] as const, // Polymarket midnight blue
    hemiSky: 0x2e6bff,
    hemiGround: 0x070c1c,
    moon: 0xdce6ff,
    rail: 0x2e6bff, // Polymarket blue · the line the odds ride on
    rock: 0x17203a, // navy shale
  },
  kalshi: {
    label: "THE CAPITOL · Kalshi Perps · regulated",
    base: [0.04, 0.07, 0.07] as const, // teal dusk, marble and glass
    hemiSky: 0x21c7b0,
    hemiGround: 0x081514,
    moon: 0xd9fff9,
    rail: 0x21c7b0, // Kalshi teal · the regulated line
    rock: 0x1c3331, // green marble
  },
  bulk: {
    label: "THE STACKS · BULK · Solana",
    base: [0.1, 0.07, 0.03] as const, // amber dusk, BULK's own orange at night
    hemiSky: 0xffb457,
    hemiGround: 0x1a1206,
    moon: 0xfff0dc,
    rail: 0xffb457, // BULK amber · one fast line
    rock: 0x3a2a14, // bronze
  },
} as const;
type WorldId = keyof typeof WORLDS;

interface Rival {
  group: THREE.Group;
  lane: number;
  speed: number;
  hostile: boolean; // red = crash hazard, green = draft bonus
  scored: boolean;
}
interface Coin {
  mesh: THREE.Mesh;
  lane: number;
  taken: boolean;
  /** golden-stampede coins pay 5× and announce themselves */
  gold?: boolean;
}

/** Paint jobs · one unlocked per volume club. Pure function of career volume,
 *  nothing to sync; the garage IS the progression made visible. */
const PAINTS: { club: number; name: string; color: number; metal?: number }[] = [
  { club: 0, name: "Street Ember", color: 0xff8c2e },
  { club: 250, name: "Neon Surge", color: 0x27f2a4 },
  { club: 1_000, name: "Royal Violet", color: 0x9d4dff },
  { club: 2_500, name: "Ice Chrome", color: 0xcfe8ff, metal: 0.95 },
  { club: 10_000, name: "Liquid Gold", color: 0xffc02e, metal: 0.95 },
  { club: 50_000, name: "Blood Whale", color: 0xff2e4d, metal: 0.7 },
  { club: 250_000, name: "Void Black", color: 0x15161a, metal: 1 },
];

function buildCar(color: number, isTruck = false): THREE.Group {
  const g = new THREE.Group();
  // automotive clearcoat paint · a glossy show-car finish (a lacquer layer over
  // metallic base) that catches the neon env, reads far more premium than flat.
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.32,
    metalness: 0.7,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.5,
  });
  g.userData.paintMat = mat; // garage can repaint live
  const dark = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.9 });
  if (isTruck) {
    // a menacing dark rig: glossy container + sloped glass cab + RED hazard
    // accents that bloom (reads as danger, not a plain box)
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.4, 4.6), mat);
    box.position.set(0, 1.5, 0.4);
    g.add(box);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.15, 1.5, 1.5), dark);
    cab.position.set(0, 1.0, -2.5);
    g.add(cab);
    const windshield = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.85, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x08121a, roughness: 0.06, metalness: 0.9, envMapIntensity: 2 }));
    windshield.position.set(0, 1.55, -1.9);
    windshield.rotation.x = -0.5;
    g.add(windshield);
    // red hazard stripes down the container sides + a bright tail bar
    const dangerMat = new THREE.MeshStandardMaterial({ color: 0x220206, emissive: 0xff2a3c, emissiveIntensity: 1.6 });
    for (const x of [-1.17, 1.17]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.9, 0.5), dangerMat);
      stripe.position.set(x, 1.5, 0.4);
      g.add(stripe);
    }
    const tl = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.24, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x200205, emissive: 0xff2030, emissiveIntensity: 2.6 }));
    tl.position.set(0, 0.7, 2.72);
    g.add(tl);
  } else {
    // SLEEK COUPE · a real sculpted silhouette (extruded side profile) instead of
    // a box, with reflective metallic paint that mirrors the neon world. The
    // visible leap from "arcade" to "showroom".
    const prof = new THREE.Shape();
    prof.moveTo(-1.95, 0.14); // front bumper base
    prof.lineTo(-1.92, 0.44);
    prof.quadraticCurveTo(-1.5, 0.54, -0.85, 0.6); // low hood
    prof.quadraticCurveTo(-0.4, 0.64, -0.14, 1.22); // raked windshield
    prof.lineTo(0.58, 1.28); // roof
    prof.quadraticCurveTo(1.12, 1.26, 1.36, 0.82); // fastback glass
    prof.quadraticCurveTo(1.7, 0.66, 1.95, 0.62); // rear deck
    prof.lineTo(1.95, 0.14);
    prof.lineTo(-1.95, 0.14); // underbody
    const bodyGeo = new THREE.ExtrudeGeometry(prof, {
      depth: 1.9,
      bevelEnabled: true,
      bevelThickness: 0.14,
      bevelSize: 0.14,
      bevelSegments: 4,
      steps: 1,
    });
    bodyGeo.translate(0, 0, -0.95); // center the width
    bodyGeo.rotateY(Math.PI / 2); // profile length → Z, extrude depth → X
    mat.roughness = 0.24;
    mat.metalness = 0.85;
    mat.envMapIntensity = 1.6;
    const body = new THREE.Mesh(bodyGeo, mat);
    g.add(body);
    // dark glass greenhouse · reflective cabin cap for a real cockpit read
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x08121a,
      roughness: 0.04,
      metalness: 0.95,
      envMapIntensity: 2.2,
    });
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.44, 1.35), glassMat);
    cabin.position.set(0, 1.02, -0.05);
    g.add(cabin);
    // low ducktail spoiler
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.08, 0.34), mat);
    spoiler.position.set(0, 0.86, 1.72);
    g.add(spoiler);
    // emissive tail bar + headlights · bloom turns these into signature glow
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(1.86, 0.12, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x200205, emissive: 0xff1a3c, emissiveIntensity: 2.4 }));
    tail.position.set(0, 0.66, 1.96);
    g.add(tail);
    for (const x of [-0.62, 0.62]) {
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.1, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x1a1a10, emissive: 0xeafff6, emissiveIntensity: 1.8 }));
      head.position.set(x, 0.56, -1.95);
      g.add(head);
    }
  }
  // sleeker wheels · dark tire + a bright rim ring that catches bloom
  const tireGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.3, 20);
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.TorusGeometry(0.24, 0.05, 8, 20);
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x2a2f36,
    metalness: 1,
    roughness: 0.25,
    emissive: 0x0a0f0d,
    envMapIntensity: 1.5,
  });
  for (const [x, z] of [
    [-1.02, 1.28],
    [1.02, 1.28],
    [-1.02, -1.28],
    [1.02, -1.28],
  ]) {
    const w = new THREE.Mesh(tireGeo, dark);
    w.position.set(x, 0.44, z);
    g.add(w);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.y = Math.PI / 2;
    rim.position.set(x + (x > 0 ? 0.16 : -0.16), 0.44, z);
    g.add(rim);
  }
  return g;
}

/* stop live WITHOUT leaving the ride · tap once to confirm, tap again to
 * disarm ("leaving game to arm and stop arm doesn't feel organized"). */
function DisarmPill() {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 3500);
    return () => clearTimeout(t);
  }, [confirm]);
  return (
    <button
      onClick={() => {
        if (confirm) {
          window.dispatchEvent(new Event("rtn-disarm-request"));
          setConfirm(false);
        } else setConfirm(true);
      }}
      className={`pointer-events-auto rounded-sm px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-[0.14em] ${
        confirm
          ? "border border-blood bg-blood/20 text-blood"
          : "animate-[rtn-pulse_1.2s_infinite] bg-chart text-ink"
      }`}
      title="stop live trading right here · closes any open trade as a taker (that crossing pays the fee) and switches the engine OFF · to get out of one trade and keep riding, use cut in the cockpit instead"
    >
      {confirm ? "tap again to stop · closes at market" : "● live · tap to stop"}
    </button>
  );
}

export default function ThreeRide({
  onExit,
  onGoLive,
  setTargetRef,
  setLeverRef,
  flattenRef,
  realRef,
  armed = false,
  mode = "turbo",
  world = "hyperliquid",
}: {
  onExit: () => void;
  /** leaves the ride and lands in the cockpit, ready to arm. A free lap that
   *  never shows the door to real farming is a demo, not a funnel. */
  onGoLive?: () => void;
  /** LiveLayer publishes the armed trade-intent fn here; lane changes route in. */
  setTargetRef?: React.RefObject<((side: number) => void) | null>;
  /** throttle-driven clip multiplier (Turbo "leverage"). */
  setLeverRef?: React.RefObject<((m: number) => void) | null>;
  flattenRef?: React.RefObject<(() => void) | null>;
  realRef?: React.RefObject<{
    volume: number;
    fees: number;
    fills: number;
    pnl: number;
    feesInPnl?: boolean;
    race?: { volume: number; net: number; targetUsd: number; maxLossUsd: number; startedAt: number | null };
    last: string | null;
    note?: string | null;
    asset?: string;
    pending?: number | null;
    vol30?: number | null;
    est?: string | null;
  } | null>;
  armed?: boolean;
  /** Cruise = calm auto-glide; Turbo = throttle-driven, rips; Passenger = AFK neutral farm. */
  mode?: "cruise" | "turbo" | "passenger";
  /** which DEX world we're riding · sets the planet's atmosphere. */
  world?: WorldId;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState({
    score: 0,
    coins: 0,
    speed: 0,
    flow: 0,
    crashed: false,
    lane: 1,
    wrecks: 0,
    lever: 1,
    km: 0,
    combo: 1,
    thr: 0,
    ghost: null as number | null, // meters vs your best-run pace · + = ghost ahead
  });
  const [overMeta, setOverMeta] = useState<null | { km: number; best: number; nextClub: number | null; vol: number }>(null);
  const [pop, setPop] = useState<{ txt: string; color: string; id: number } | null>(null);
  const [real, setReal] = useState<{
    volume: number;
    fees: number;
    fills: number;
    pnl: number;
    feesInPnl?: boolean;
    race?: { volume: number; net: number; targetUsd: number; maxLossUsd: number; startedAt: number | null };
  }>({ volume: 0, fees: 0, fills: 0, pnl: 0 });
  // fees once · an equity road's pnl already has them inside (rideNet)
  const realNet = real.feesInPnl ? real.pnl : real.pnl - real.fees;
  const [buzz, setBuzz] = useState<string[]>([]);
  const [over, setOver] = useState<RideRecord | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [aiTip, setAiTip] = useState<string | null>(null);
  // was the engine armed when the run ended? "practice · none of it counted"
  // on an ARMED run whose quotes simply had not filled yet was a lie
  const [overArmed, setOverArmed] = useState(false);
  const [muted, setMutedState] = useState(false);
  // progression: career volume BEFORE this ride (live volume stacks on top)
  const careerVolBase = useRef(0);
  const [streak, setStreak] = useState(0);
  const [top3, setTop3] = useState<{ rider: string; points: number; realVolume: number }[]>([]);
  useEffect(() => {
    careerVolBase.current = career().realVolume;
    fetchStreak().then(setStreak).catch(() => {});
    fetchTop()
      .then((t) => setTop3(t.slice(0, 3)))
      .catch(() => {});
  }, []);
  // FOMO ticker: other riders' feats drip into the buzz feed while you ride ·
  // social proof + a target to chase, refreshed every minute.
  useEffect(() => {
    let i = 0;
    const tick = () =>
      fetchTop()
        .then((top) => {
          if (!top.length) return;
          const t = top[i % Math.min(top.length, 3)];
          i++;
          pushBuzz(
            `${riderAlias(t.rider).name} · ${t.points.toLocaleString()} pts · $${Math.round(t.realVolume).toLocaleString()} vol today. catch them.`);
        })
        .catch(() => {});
    const id = setInterval(tick, 60_000);
    const t0 = setTimeout(tick, 12_000); // first tease shortly after the ride starts
    return () => {
      clearInterval(id);
      clearTimeout(t0);
    };
  }, []);
  const overRef = useRef(false);
  const resetRef = useRef<(() => void) | null>(null);
  useEffect(() => setMutedState(isMuted()), []);
  /* 📺 BROADCAST MODE · passenger footage that holds an audience.
     A stream viewer cannot read a corner chip. Every event the world already
     narrates (fauna, portals, storms, fills) is ALSO shown as a big lower-
     third card, held long enough to read, queued so nothing tramples; and
     when the tape goes quiet the caster fills the air with the market's
     state in plain words. Defaults ON in passenger — that is the mode people
     stream — and stays out of the way everywhere else. */
  const [broadcast, setBroadcast] = useState(true);
  const broadcastRef = useRef(true);
  broadcastRef.current = broadcast;
  const [cast, setCast] = useState<string | null>(null);
  const castQ = useRef<string[]>([]);
  const castBusy = useRef(false);
  const castLastAt = useRef(0);
  const pumpCast = () => {
    if (castBusy.current) return;
    const next = castQ.current.shift();
    if (!next) return;
    castBusy.current = true;
    castLastAt.current = Date.now();
    setCast(next);
    setTimeout(() => {
      setCast(null);
      setTimeout(() => {
        castBusy.current = false;
        pumpCast();
      }, 350);
    }, 3200);
  };
  const pushCast = (m: string) => {
    castQ.current = [...castQ.current.slice(-2), m]; // keep it fresh, never backlog
    pumpCast();
  };
  const pushBuzz = (m: string) => {
    setBuzz((b) => [m, ...b].slice(0, 3));
    pushCast(m);
  };
  // 🔭 the fleet's findings land on the flagship's lower-third too
  useEffect(() => {
    const onFleet = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      if (text) pushCast(text);
    };
    window.addEventListener("rtn-fleet-cast", onFleet);
    return () => window.removeEventListener("rtn-fleet-cast", onFleet);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // ⚡ SIGNAL FLASH · the actionable moments deserve the CENTER of the screen,
  // not a tiny corner chip ("you said signals show but I can't see them").
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushFlash = (m: string) => {
    setFlash(m);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 3800);
  };
  // 🎯 ENGINE STATUS · read the trading layer's truth every 1.5s and translate
  // it to plain words: what asset, what the engine is doing, what to expect
  const [engineStatus, setEngineStatus] = useState<null | { head: string; line: string }>(null);
  useEffect(() => {
    if (!armed) {
      setEngineStatus(null);
      return;
    }
    const iv = setInterval(() => {
      const r = realRef?.current;
      if (!r) return;
      const head = `${r.asset ?? "…"}`;
      let line: string;
      if (r.note) line = r.note;
      else if (r.pending && r.pending > 0)
        line = `${r.pending} quote${r.pending > 1 ? "s" : ""} resting on the book, fills pay the spread · hang tight`;
      else if (r.fills > 0 && r.last) line = `last: ${r.last}`;
      else if (r.vol30 != null && r.est)
        line = `watching the book · ${r.vol30.toFixed(1)}bps · ~${r.est}/$1M this hour`;
      else line = "engine warming up · first action lands within a minute";
      setEngineStatus({ head, line });
    }, 1500);
    return () => clearInterval(iv);
  }, [armed, realRef]);
  const hudRef = useRef(hud);
  hudRef.current = hud;
  // read live mode/world inside the loop without restarting the scene effect
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const worldRef = useRef<WorldId>(world);
  worldRef.current = world;

  const exitAndRecord = () => {
    // Leaving mid-run: close the real position, save the ride, and show the
    // honest closing card (never just vanish · the receipt is the ritual).
    if (!overRef.current) {
      const h = hudRef.current;
      const r = realRef?.current;
      if (modeRef.current !== "passenger") flattenRef?.current?.(); // safety first: no position outlives the ride (passenger: the engine outlives the picture by design)
      const rec = saveRide({
        mode: "3d",
        live: !!r && r.fills > 0,
        sim: { volume: h.score, coins: h.coins, dodges: 0, bestStreak: 0, crashes: h.wrecks },
        real: {
          fills: r?.fills ?? 0,
          volume: r?.volume ?? 0,
          fees: r?.fees ?? 0,
          pnl: r?.pnl ?? 0,
        },
      });
      if (h.score > 0 || (r?.fills ?? 0) > 0) {
        overRef.current = true;
        setOver(rec); // the run-over card doubles as the closing-stats card
        return;
      }
    }
    onExit();
  };
  const [missionTxt, setMissionTxt] = useState("");
  const [menuOpen, setMenuOpen] = useState(false); // mobile top-menu collapse
  // 🏆 HUB · persistent stats/leaderboard/referral panel, viewable anytime
  const [hubOpen, setHubOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const togglePauseRef = useRef<(() => void) | null>(null);
  // the garage: cycle through paints earned by volume clubs, repaint live
  const playerRef = useRef<THREE.Group | null>(null);
  const cyclePaint = () => {
    const vol = careerVolBase.current + (realRef?.current?.volume ?? 0);
    const unlocked = PAINTS.filter((p) => vol >= p.club);
    const cur = localStorage.getItem("rtn-paint") ?? PAINTS[0].name;
    const i = unlocked.findIndex((p) => p.name === cur);
    const next = unlocked[(i + 1) % unlocked.length];
    localStorage.setItem("rtn-paint", next.name);
    const m = playerRef.current?.userData.paintMat as THREE.MeshStandardMaterial | undefined;
    if (m) {
      m.color.setHex(next.color);
      m.metalness = next.metal ?? 0.3;
    }
    const locked = PAINTS.length - unlocked.length;
    pushBuzz(
      `🎨 ${next.name}${locked > 0 ? ` · ${locked} paint${locked > 1 ? "s" : ""} still locked · climb the clubs` : " · full garage!"}`);
  };
  const [tut, setTut] = useState(false);
  const [rec, setRec] = useState(false);
  const recRef = useRef<ClipRecorder | null>(null);
  /* 🎬 auto-highlights ride along whenever the broadcast is on air in
     passenger — the moment clips itself, five seconds of payoff included */
  const hlRef = useRef<HighlightRecorder | null>(null);
  useEffect(() => {
    const on = mode === "passenger" && broadcast;
    if (on && !hlRef.current) {
      const canvas = mountRef.current?.querySelector("canvas");
      if (canvas) {
        hlRef.current = new HighlightRecorder(canvas as HTMLCanvasElement, () =>
          pushBuzz("🎬 highlight saved to your downloads · post it"),
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
  const armedRef = useRef(armed);
  armedRef.current = armed;

  const toggleRec = () => {
    const canvas = mountRef.current?.querySelector("canvas");
    if (!canvas) return;
    if (!recRef.current || !recRef.current.recording) {
      recRef.current = new ClipRecorder(canvas, () => setRec(false));
      recRef.current.start();
      setRec(true);
    } else {
      recRef.current.stop();
    }
  };

  const doShare = () =>
    void shareCard({
      headline: `$${hud.score.toLocaleString()}`,
      headlineLabel: "volume farmed",
      lines: [
        ["coins", String(hud.coins)],
        ["top speed", `${hud.speed} km/h`],
        ...(armed && real.fills > 0
          ? ([
              ["real trades", String(real.fills)],
              ["real volume", `$${Math.round(real.volume).toLocaleString()}`],
            ] as [string, string][])
          : []),
      ],
      mode: `TURBO 3D · live ${getRideAsset()} on Perpl`,
      live: armed && real.fills > 0,
    });

  // First drive: explain the one idea that matters · lanes are positions.
  useEffect(() => {
    if (!localStorage.getItem("rtn-3d-tut")) setTut(true);
  }, []);
  // never leave a recorder running after unmount
  useEffect(() => () => recRef.current?.stop(), []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;

    /* ------------------------------ scene ------------------------------ */
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1c0d12);
    scene.fog = new THREE.Fog(0x1c0d12, 60, 240);

    // Responsive FOV · a fixed vertical FOV makes the car balloon on narrow
    // portrait phones (little horizontal view). Widen the FOV as the screen
    // gets tall-and-thin so the car stays a sensible size and more road shows.
    const fovFor = (w: number, h: number) => {
      const aspect = w / h;
      if (aspect < 0.6) return 82; // tall phones (portrait)
      if (aspect < 0.85) return 74; // narrow / small tablets
      return 62; // desktop / landscape
    };
    const camera = new THREE.PerspectiveCamera(
      fovFor(mount.clientWidth, mount.clientHeight),
      mount.clientWidth / mount.clientHeight,
      0.1,
      600);
    camera.position.set(0, 5.4, 10.5);
    camera.lookAt(0, 1.2, -20);
    const camBaseY = camera.rotation.y; // preserve lookAt pitch/heading; lean adds on top
    let camRoll = 0;
    let camYaw = 0;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    // Filmic color: ACES tone mapping is the single biggest "looks pro" switch ·
    // it rolls highlights off like a camera instead of clipping to white.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05; // slightly richer contrast · cinematic, not washed
    mount.appendChild(renderer.domElement);

    // A soft gradient environment so glossy surfaces (the wet-look road, the car
    // paint) have neon+sky to REFLECT, the single biggest "luxury / ultra-modern"
    // upgrade to the 3D world (a matte scene reads gamey; a reflective one reads
    // premium). Built once from a canvas, PMREM-filtered for smooth reflections.
    const envCv = document.createElement("canvas");
    envCv.width = 16;
    envCv.height = 128;
    const ec = envCv.getContext("2d")!;
    const eg = ec.createLinearGradient(0, 0, 0, 128);
    eg.addColorStop(0, "#0a1620"); // sky
    eg.addColorStop(0.55, "#0c2228");
    eg.addColorStop(0.75, "#123c38"); // neon-teal horizon glow
    eg.addColorStop(1, "#05090c"); // ground
    ec.fillStyle = eg;
    ec.fillRect(0, 0, 16, 128);
    const envTex = new THREE.CanvasTexture(envCv);
    envTex.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(envTex).texture;
    envTex.dispose();
    /* A REAL SKY LIGHTS THE PAINT · the gradient above is the instant
       default; the mood's own sky (a Poly Haven HDRI, tone-mapped and
       re-encoded small) replaces it the moment it lands: a night skyline
       for the neon hours, a real sunset for golden hour. The visible sky
       stays the world's palette — its identity — this is what the car, the
       glass and the wet road REFLECT. */
    const MOOD_SKY: Record<MoodId, SkyName> = { night: "night", dusk: "dusk", dawn: "golden", sunset: "sunset", day: "day" };
    const phoneTier = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 720;
    let skyToken = 0;
    const lightWithSky = (mood: MoodId) => {
      const token = ++skyToken;
      loadSky(renderer, MOOD_SKY[mood], phoneTier ? "1k" : "2k")
        .then(({ env }) => {
          if (token === skyToken) scene.environment = env;
        })
        .catch(() => {});
    };
    lightWithSky(rollMood());

    // Bloom: emissives (coins, crater, headlights, gold stampedes) GLOW.
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(mount.clientWidth, mount.clientHeight),
      0.72, // strength · silkier, more cinematic glow
      0.72, // radius · softer falloff
      0.72, // threshold · lets more neon breathe without smearing
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // per-run time-of-day · night is home, dawn/dusk visit ("like reality")
    const runMood = MOODS[rollMood()];
    /* 🌦 LIVE WEATHER · the sky is no longer a per-run constant (task #30, * "the day just go bright, the sun smiling, the moon shocking come out…
     * suspense everywhere"). moodCur lerps toward moodTgt every frame; a new
     * target rolls every ~2-3 minutes with an announcement, and EVENTS
     * (tornado, meteor shower, eclipse) interrupt on their own clock. A
     * streamer can leave this on screen and the screen does the entertaining. */
    const moodCur = {
      sky: [...runMood.skyMul] as [number, number, number],
      hemi: runMood.hemiMul,
      star: runMood.starAlpha,
      cap: runMood.skyCap,
    };
    let moodTgt = runMood;
    let moodNextAt = 110_000 + Math.random() * 70_000; // first shift ~2-3min in
    const hemi = new THREE.HemisphereLight(0x8a4a55, 0x140a0c, 0.9 * runMood.hemiMul);
    // COCKPIT FILL · a soft pool of light locked over the play area so the CAR
    // and near road stay readable even on the darkest night rolls ("places so
    // dark you can't see the car", user-verified). Tight falloff: the deep
    // scene keeps its night; only the stage is lit.
    const cockpitFill = new THREE.PointLight(0xfff2e0, 26, 34, 1.8);
    cockpitFill.position.set(0, 9, 2);
    scene.add(cockpitFill);
    scene.add(hemi);
    const moon = new THREE.DirectionalLight(0xffd9b0, 0.7);
    moon.position.set(-30, 60, -40);
    scene.add(moon);
    let lastWorld: WorldId | null = null; // applied lazily in the loop
    let lastPropWorld: WorldId | null = null; // the rider's own pick · a change ends any portal tour

    /* ------------------------------- road ------------------------------ */
    const texCv = document.createElement("canvas");
    texCv.width = 256;
    texCv.height = 256;
    const tc = texCv.getContext("2d")!;
    tc.fillStyle = "#22242c";
    tc.fillRect(0, 0, 256, 256);
    tc.strokeStyle = "rgba(245,240,220,.8)";
    tc.lineWidth = 5;
    tc.setLineDash([46, 40]);
    for (const x of [88, 168]) {
      tc.beginPath();
      tc.moveTo(x, 0);
      tc.lineTo(x, 256);
      tc.stroke();
    }
    tc.setLineDash([]);
    tc.strokeStyle = "#f5c542";
    tc.lineWidth = 7;
    for (const x of [8, 248]) {
      tc.beginPath();
      tc.moveTo(x, 0);
      tc.lineTo(x, 256);
      tc.stroke();
    }
    const roadTex = new THREE.CanvasTexture(texCv);
    roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
    roadTex.repeat.set(1, 40);
    /* THE ROAD MUST HAVE VERTICES TO BEND. The curve is a vertex shader
       (x += k·z² in view space), so a strip with two vertices along its
       length can only tilt — its far end moved while everything between
       stayed a straight diagonal, which is why the props traced the corner
       and the tarmac did not ("I see the curve motion but the road itself
       doesn't reflect the curves"). A vertex every 4 m lets the surface,
       its markings and its edges follow the same parabola the car feels. */
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(15, 520, 1, 130),
      // wet-luxury asphalt · low roughness + a little metalness so the env +
      // neon rails reflect off it like a rain-slick showroom floor
      new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.42, metalness: 0.55, envMapIntensity: 1.1 }));
    /* REAL ASPHALT under the drawn lines · a Poly Haven surface (normal +
       roughness, CC0, WebP) so the reflections break over grain and cracks
       instead of sliding over a flat slab. Colour stays the canvas: the lane
       lines are game truth. Phones get the 512 maps. */
    {
      const tier = (window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 720) ? "512" : "1k";
      const tl = new THREE.TextureLoader();
      const load = (u: string) =>
        new Promise<THREE.Texture>((res, rej) => tl.load(u, res, undefined, rej)).then((t) => {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.repeat.set(2.2, 76); // ~7 m per tile along a 520 m strip
          return t;
        });
      Promise.all([load(`/tex/asphalt-nor-${tier}.webp`), load(`/tex/asphalt-rough-${tier}.webp`)])
        .then(([nor, rough]) => {
          const m = road.material as THREE.MeshStandardMaterial;
          m.normalMap = nor;
          m.normalScale.set(0.55, 0.55);
          m.roughnessMap = rough;
          m.roughness = 0.62; // × the map (0.4–0.9) · still wet, no longer a mirror
          m.needsUpdate = true;
        })
        .catch(() => {});
    }
    road.rotation.x = -Math.PI / 2;
    road.position.z = -200;
    scene.add(road);

    // glowing road-edge rails · with bloom they read as neon barriers and
    // anchor the road at speed
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x101418,
      emissive: 0x2ad5a8,
      emissiveIntensity: 0.9,
    });
    for (const x of [-7.6, 7.6]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 520, 1, 1, 130), railMat); // subdivided · the neon edge bends with the tarmac
      rail.position.set(x, 0.25, -200);
      scene.add(rail);
    }
    // passing light poles · sleek brushed-metal streetlights (tapered post +
    // curved arm + glowing capsule head) · THE speed cue at velocity
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x20262e,
      metalness: 0.9,
      roughness: 0.32,
      envMapIntensity: 1.2,
    });
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0x30281a,
      emissive: 0xffca7a,
      emissiveIntensity: 2.6,
    });
    // shared sleek geometries (reused across all 16 poles)
    const postGeo = new THREE.CylinderGeometry(0.09, 0.16, 7.6, 14);
    const armGeo = new THREE.CylinderGeometry(0.07, 0.07, 2.3, 10);
    const headGeo = new THREE.CapsuleGeometry(0.16, 0.7, 4, 10);
    const poles: THREE.Group[] = [];
    for (let i = 0; i < 16; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const g = new THREE.Group();
      const post = new THREE.Mesh(postGeo, poleMat);
      post.position.y = 3.8;
      g.add(post);
      const arm = new THREE.Mesh(armGeo, poleMat);
      arm.rotation.z = Math.PI / 2;
      arm.rotation.x = -side * 0.12; // slight rake for a modern cantilever
      arm.position.set(-side * 1.05, 7.45, 0);
      g.add(arm);
      const head = new THREE.Mesh(headGeo, lampMat);
      head.rotation.z = Math.PI / 2;
      head.position.set(-side * 2.15, 7.3, 0);
      g.add(head);
      g.position.set(side * 9.4, 0, -30 - i * 32);
      scene.add(g);
      poles.push(g);
    }
    /* the procedural post + arm were a cylinder and a stick; the head keeps
       glowing (bloom) while a real modern light post takes over the body */
    void loadGlb("/models/kenney/lightpost.glb")
      .then((tpl) => {
        const dress = (g: THREE.Group, side: number) => {
          for (const ch of [...g.children]) {
            const m = ch as THREE.Mesh;
            if (m.geometry === postGeo || m.geometry === armGeo) m.visible = false;
          }
          const post = cloneModel(tpl);
          fitTo(post, 7.9, "y");
          post.rotation.y = side === 1 ? Math.PI / 2 : -Math.PI / 2; // arm over the road
          g.add(post);
        };
        poles.forEach((g, i) => dress(g, i % 2 === 0 ? -1 : 1));
        segPoles.forEach((g, i) => dress(g, i % 2 === 0 ? 1 : -1));
      })
      .catch(() => {});

    /* SCENE SEGMENTS · the road travels through PLACES, not one endless set.
     * Every ~45s the roadside becomes a different stretch: open range (the
     * rock hills) → crystal fields → a dense light corridor. Ground retints,
     * the buzz names the place. World identity (landmarks/palette) rides on
     * top unchanged. */
    const segCrystals: THREE.Object3D[] = [];
    void loadGlb("/models/crystal.glb")
      .then((m) => {
        for (let i = 0; i < 12; i++) {
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
                // dark body + strong emissive → they GLOW against the night
                // (0.7 over the pale base read as grey blocks, verified)
                if (std.color) std.color.setHex(0x0c2624);
                if (std.emissive) {
                  std.emissive.setHex(0x4ad0c0);
                  std.emissiveIntensity = 1.05;
                }
              }
            }
          });
          const side = i % 2 === 0 ? -1 : 1;
          c.scale.multiplyScalar(1.4 + Math.random() * 2.4);
          c.position.set(side * (12 + Math.random() * 22), 0, -20 - i * 38 - Math.random() * 14);
          c.visible = false;
          scene.add(c);
          segCrystals.push(c);
        }
      })
      .catch(() => {});
    const segPoles: THREE.Group[] = [];
    for (let i = 0; i < 10; i++) {
      const side = i % 2 === 0 ? 1 : -1; // mirrored vs the base set → both sides dense
      const g = new THREE.Group();
      const post = new THREE.Mesh(postGeo, poleMat);
      post.position.y = 3.8;
      g.add(post);
      const head = new THREE.Mesh(headGeo, lampMat);
      head.rotation.z = Math.PI / 2;
      head.position.set(-side * 1.6, 7.3, 0);
      g.add(head);
      g.position.set(side * 9.4, 0, -46 - i * 48);
      g.visible = false;
      scene.add(g);
      segPoles.push(g);
    }
    /* REAL SCENERY · sourced CC0 low-poly models (poly.pizza, see
     * public/models/LICENSES.md) replace the procedural blobs. Procedural
     * rocks stay ONLY as the instant fallback until the GLBs arrive. */
    /* PERFECT 3D PROPS · every roadside object is a real CC0 model now
       (Kenney Nature / Racing / City kits, see public/models/LICENSES.md).
       cloneModel() = the one clone-with-own-materials pattern, so a tint on
       one prop can never bleed into its siblings. */
    const cloneModel = (tpl: THREE.Object3D) => {
      const c = tpl.clone(true);
      c.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && mesh.material) {
          mesh.material = Array.isArray(mesh.material)
            ? mesh.material.map((x) => x.clone())
            : (mesh.material as THREE.Material).clone();
        }
      });
      return c;
    };
    const rangeProps: THREE.Object3D[] = []; // trees + rock formations
    const corridorBuildings: THREE.Object3D[] = []; // the city stretch
    let sceneryReady = false;
    // mountain ring · a REAL horizon in every segment, from frame one
    void loadGlb("/models/mountains.glb")
      .then((m) => {
        for (const [mx, mw] of [
          [-210, 320],
          [70, 380],
          [310, 300],
        ] as const) {
          const g = m.clone(true);
          g.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh && mesh.material) {
              mesh.material = Array.isArray(mesh.material)
                ? mesh.material.map((x) => x.clone())
                : (mesh.material as THREE.Material).clone();
            }
          });
          fitTo(g, mw, "x");
          tintAll(g, 0x1c2230, 0.55); // night-blue distance haze
          g.position.set(mx, -0.4, -470);
          unfog(g);
          scene.add(g);
        }
      })
      .catch(() => {});
    // roadside range population · trees + rocks, scrolled like the road
    void Promise.all([
      loadGlb("/models/tree.glb"),
      loadGlb("/models/pine-cluster.glb"),
      loadGlb("/models/rocks.glb"),
      loadGlb("/models/rock-large.glb"),
      loadGlb("/models/kenney/pine-tall.glb"),
      loadGlb("/models/kenney/pine-round.glb"),
      loadGlb("/models/kenney/oak.glb"),
      loadGlb("/models/kenney/rock-b.glb"),
      loadGlb("/models/kenney/rock-tall.glb"),
      loadGlb("/models/kenney/cliff.glb"),
      loadGlb("/models/kenney/bush.glb"),
    ])
      .then((tpls) => {
        const fits: [number, "x" | "y" | "z"][] = [
          [5.5, "y"],
          [8, "y"],
          [6, "x"],
          [4.5, "y"],
          [9, "y"], // pine-tall
          [6.5, "y"], // pine-round
          [7, "y"], // oak
          [5, "x"], // rock-b
          [6, "y"], // rock-tall
          [14, "x"], // cliff · a real formation, set back
          [2.4, "y"], // bush
        ];
        for (let i = 0; i < 36; i++) {
          const k = i % tpls.length;
          const p = cloneModel(tpls[k]);
          fitTo(p, fits[k][0] * (0.8 + Math.random() * 0.5), fits[k][1]);
          const side = i % 2 === 0 ? -1 : 1;
          const setBack = k === 9 ? 30 : 0; // cliffs sit behind the tree line
          p.position.x = side * (13 + setBack + Math.random() * 26);
          p.position.z = -14 - i * 14.5 - Math.random() * 8;
          p.rotation.y = Math.random() * Math.PI * 2;
          p.visible = false;
          scene.add(p);
          rangeProps.push(p);
        }
        sceneryReady = true;
        applySegment(segIdx, false); // re-run visibility with the real props in
      })
      .catch(() => {});
    // corridor towers · low-poly buildings close in on both sides
    void Promise.all([
      loadGlb("/models/kenney/city-d.glb"),
      loadGlb("/models/kenney/city-e.glb"),
      loadGlb("/models/kenney/city-g.glb"),
      loadGlb("/models/kenney/skyscraper-a.glb"),
      loadGlb("/models/kenney/skyscraper-e.glb"),
    ])
      .then((tpls) => {
        for (let i = 0; i < 14; i++) {
          const k = i % tpls.length;
          const b = cloneModel(tpls[k]);
          // skyscrapers tower, blocks squat · a real skyline, not one height
          const tower = k === 3 || k === 4;
          fitTo(b, tower ? 26 + (i % 3) * 6 : 13 + (i % 4) * 4.5, "y");
          // keep the FACADE off the asphalt: measure the model's footprint and
          // push the center out so its inner wall clears the road edge (~x 9.5)
          //, "the houses are on the road and the car passes through them" bug
          const bb = new THREE.Box3().setFromObject(b);
          const half = (bb.max.x - bb.min.x) / 2;
          const side = i % 2 === 0 ? 1 : -1;
          // towers are SET BACK a second row deep — up close a 30-unit facade
          // beside the rail reads as a canyon wall, not a city
          b.position.x = side * ((tower ? 24 : 14) + half + (i % 3) * 2);
          b.position.z = -22 - i * 36;
          b.rotation.y = side === 1 ? Math.PI : 0; // face the road
          tintAll(b, 0x232b3a, 0.18); // a touch of night on the facades · the textures stay readable
          b.visible = false;
          scene.add(b);
          corridorBuildings.push(b);
        }
        applySegment(segIdx, false);
      })
      .catch(() => {});

    /* TRACK FURNITURE · barriers right outside the rails and overhead light
       gantries in the city corridor; billboards on the open range. Each piece
       carries its own scroll span so the loop treats them all alike. */
    const furniture: THREE.Object3D[] = [];
    const furnitureSeg = new Map<THREE.Object3D, "range" | "corridor">();
    void Promise.all([
      loadGlb("/models/kenney/barrier-red.glb"),
      loadGlb("/models/kenney/barrier-white.glb"),
      loadGlb("/models/kenney/gantry.glb"),
      loadGlb("/models/kenney/billboard.glb"),
      loadGlb("/models/kenney/pylon.glb"),
    ])
      .then(([red, white, gantry, billboard, pylon]) => {
        /* fit by the model's REAL long axis. Kenney's barrier is long along
           X; fitting its thin Z to 5.6 scaled each one into a 30-unit wall —
           the "canyon" that flanked the corridor. Measure, then orient. */
        const alongRoad = (o: THREE.Object3D, length: number) => {
          const sz = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
          const longX = sz.x >= sz.z;
          fitTo(o, length, longX ? "x" : "z");
          if (longX) o.rotation.y = Math.PI / 2; // long side runs down the road
        };
        // barriers · alternating red/white, both sides, every 12 units
        for (let i = 0; i < 44; i++) {
          const b = cloneModel(i % 2 === 0 ? red : white);
          alongRoad(b, 5.6);
          const side = i < 22 ? -1 : 1;
          const j = i % 22;
          b.position.set(side * 8.9, 0, -8 - j * 12);
          b.userData.wrapAt = 18;
          b.userData.span = 22 * 12;
          b.visible = false;
          scene.add(b);
          furniture.push(b);
          furnitureSeg.set(b, "corridor");
        }
        // overhead light gantries · span the road every 130 units
        for (let i = 0; i < 4; i++) {
          const g = cloneModel(gantry);
          // the gantry spans the road: its longest horizontal side goes across
          const gs = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
          fitTo(g, 19.5, gs.x >= gs.z ? "x" : "z");
          if (gs.z > gs.x) g.rotation.y = Math.PI / 2;
          g.position.set(0, 0, -60 - i * 130);
          g.userData.wrapAt = 24;
          g.userData.span = 4 * 130;
          g.visible = false;
          scene.add(g);
          furniture.push(g);
          furnitureSeg.set(g, "corridor");
        }
        // billboards · the open range's roadside, facing the driver
        for (let i = 0; i < 4; i++) {
          const bb = cloneModel(billboard);
          fitTo(bb, 9, "y");
          const side = i % 2 === 0 ? -1 : 1;
          bb.position.set(side * 17, 0, -70 - i * 125);
          bb.rotation.y = side === 1 ? -Math.PI / 2 - 0.35 : Math.PI / 2 + 0.35;
          bb.userData.wrapAt = 22;
          bb.userData.span = 4 * 125;
          bb.visible = false;
          scene.add(bb);
          furniture.push(bb);
          furnitureSeg.set(bb, "range");
        }
        // pylons · a marker at the range's road edge, every 60 units
        for (let i = 0; i < 16; i++) {
          const py = cloneModel(pylon);
          fitTo(py, 1.1, "y");
          const side = i % 2 === 0 ? -1 : 1;
          py.position.set(side * 8.6, 0, -20 - i * 30);
          py.userData.wrapAt = 16;
          py.userData.span = 16 * 30;
          py.visible = false;
          scene.add(py);
          furniture.push(py);
          furnitureSeg.set(py, "range");
        }
        applySegment(segIdx, false);
      })
      .catch(() => {});

    const SEGMENTS = ["range", "crystalfield", "corridor"] as const;
    // dev/verification: `#seg=range|crystalfield|corridor` opens on that stretch
    const segHash = typeof location !== "undefined" ? /#seg=(range|crystalfield|corridor)/.exec(location.hash)?.[1] : null;
    let segIdx = segHash ? ["range", "crystalfield", "corridor"].indexOf(segHash) : Math.floor(Math.random() * 3); // every run opens somewhere new
    let segT = 0;
    let segNext = 20; // first change comes QUICK, then the slow cadence
    let segAnnounced = false;
    const applySegment = (idx: number, announce: boolean) => {
      const s = SEGMENTS[idx];
      const rangeOn = s === "range";
      for (const r of rocks) r.visible = rangeOn && !sceneryReady; // fallback only
      for (const rp of rangeProps) rp.visible = rangeOn;
      for (const c of segCrystals) c.visible = s === "crystalfield";
      for (const p of segPoles) p.visible = s === "corridor";
      for (const b of corridorBuildings) b.visible = s === "corridor";
      for (const f of furniture) f.visible = furnitureSeg.get(f) === s;
      groundMat.color.setHex(
        s === "range" ? 0x231a16 : s === "crystalfield" ? 0x1a1426 : 0x141a24);
      if (announce)
        pushBuzz(
          s === "range"
            ? "🌲 OPEN RANGE · pines and boulders roll past"
            : s === "crystalfield"
              ? "💠 CRYSTAL FIELDS · the ground glows"
              : "🌆 CITY OUTSKIRTS · towers close in both sides");
    };

    const groundMat = new THREE.MeshStandardMaterial({ color: 0x2a161a, roughness: 1 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 700, 30, 140), groundMat); // subdivided · the shoulders bend and dip with the road
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.06;
    ground.position.z = -200;
    scene.add(ground);

    // rolling hills · smoother sculpted mounds (subdivided) with a faint metallic
    // sheen so they catch the neon env, reads like a stylised range, not rubble
    const rocks: THREE.Mesh[] = [];
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x22282e,
      roughness: 0.7,
      metalness: 0.35,
      envMapIntensity: 0.7,
      flatShading: false,
    });
    for (let i = 0; i < 46; i++) {
      const r = new THREE.Mesh(new THREE.IcosahedronGeometry(2 + Math.random() * 6, 2), rockMat);
      const side = Math.random() < 0.5 ? -1 : 1;
      r.position.set(side * (14 + Math.random() * 60), 0, -Math.random() * 420);
      r.scale.set(1 + Math.random() * 0.4, 0.45 + Math.random() * 0.6, 1 + Math.random() * 0.4);
      scene.add(r);
      rocks.push(r);
    }
    applySegment(segIdx, false); // after rocks exist · random opener per run

    /* ------------------ world landmarks (per-DEX identity) ------------------ */
    // 🌋 Hotstuff: the volcano
    const volcanoGroup = new THREE.Group();
    const volcano = new THREE.Mesh(
      new THREE.ConeGeometry(60, 85, 7),
      new THREE.MeshStandardMaterial({ color: 0x241114, roughness: 1, flatShading: true }));
    volcano.position.set(55, 42, -420);
    volcanoGroup.add(volcano);
    const crater = new THREE.PointLight(0xff6a2a, 60, 400, 1.6);
    crater.position.set(55, 88, -415);
    volcanoGroup.add(crater);
    const craterGlow = new THREE.Mesh(
      new THREE.SphereGeometry(9, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xff7a30 }));
    craterGlow.position.copy(crater.position);
    volcanoGroup.add(craterGlow);
    // embers
    const emberN = 120;
    const emberPos = new Float32Array(emberN * 3);
    for (let i = 0; i < emberN; i++) {
      emberPos[i * 3] = 55 + (Math.random() - 0.5) * 26;
      emberPos[i * 3 + 1] = 88 + Math.random() * 60;
      emberPos[i * 3 + 2] = -415 + (Math.random() - 0.5) * 26;
    }
    const emberGeo = new THREE.BufferGeometry();
    emberGeo.setAttribute("position", new THREE.BufferAttribute(emberPos, 3));
    const embers = new THREE.Points(
      emberGeo,
      new THREE.PointsMaterial({ color: 0xffa040, size: 1.6, sizeAttenuation: true }));
    volcanoGroup.add(embers);
    scene.add(volcanoGroup);

    // 🌊 Hyperliquid: the Hypergrid · a vast glowing ring gate on the horizon
    const hyperGroup = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x37ffd0 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(58, 2.4, 10, 64), ringMat);
    ring.position.set(-40, 60, -440);
    hyperGroup.add(ring);
    const ringInner = new THREE.Mesh(new THREE.TorusGeometry(40, 1.1, 8, 56), ringMat.clone());
    ringInner.position.copy(ring.position);
    hyperGroup.add(ringInner);
    const ringLight = new THREE.PointLight(0x37ffd0, 50, 420, 1.7);
    ringLight.position.copy(ring.position);
    hyperGroup.add(ringLight);
    scene.add(hyperGroup);

    // ⚡ Lighter: the Beacon · a crystal prism sweeping a lighthouse beam
    const lighterGroup = new THREE.Group();
    const prism = new THREE.Mesh(
      new THREE.OctahedronGeometry(13, 0),
      new THREE.MeshStandardMaterial({
        color: 0x16163a,
        emissive: 0x8a8aff,
        emissiveIntensity: 0.7,
        flatShading: true,
      }));
    prism.scale.y = 2.6;
    prism.position.set(-55, 46, -430);
    lighterGroup.add(prism);
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(260, 1.5, 1.5),
      new THREE.MeshBasicMaterial({ color: 0xc8c8ff, transparent: true, opacity: 0.8 }));
    beam.position.set(-55, 78, -430); // pivots at the prism tip
    lighterGroup.add(beam);
    const beaconLight = new THREE.PointLight(0x8a8aff, 45, 420, 1.7);
    beaconLight.position.copy(prism.position);
    lighterGroup.add(beaconLight);
    lighterGroup.visible = false;
    scene.add(lighterGroup);

    // 🟣 Perpl: the Monoliths · a levitating amethyst circle under a violet moon
    const perplGroup = new THREE.Group();
    const monoMat = new THREE.MeshStandardMaterial({
      color: 0x140a1f,
      emissive: 0xa855f7,
      emissiveIntensity: 0.35,
      flatShading: true,
    });
    const perplMonos: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i++) {
      const h = 42 - Math.abs(i - 2) * 4; // tallest in the middle
      const m = new THREE.Mesh(new THREE.BoxGeometry(7, h, 4), monoMat);
      m.position.set(24 + (i - 2) * 26, h / 2 + 8, -418 - Math.abs(i - 2) * 16);
      m.userData.baseY = h / 2 + 8;
      m.rotation.y = (i - 2) * 0.22; // fanned toward the road
      perplGroup.add(m);
      perplMonos.push(m);
    }
    const perplMoon = new THREE.Mesh(
      new THREE.CircleGeometry(30, 40),
      new THREE.MeshBasicMaterial({ color: 0x7a4ad0 }));
    perplMoon.position.set(58, 62, -472);
    perplGroup.add(perplMoon);
    const perplLight = new THREE.PointLight(0xa855f7, 40, 400, 1.7);
    perplLight.position.set(24, 40, -415);
    perplGroup.add(perplLight);
    perplGroup.visible = false;
    scene.add(perplGroup);

    // ◆ Extended: Wall Street · a lit skyline with an index ticker sliding by
    const extGroup = new THREE.Group();
    const towerMat = new THREE.MeshStandardMaterial({
      color: 0x10161a,
      roughness: 0.85,
      metalness: 0.3,
    });
    const bandMat = new THREE.MeshBasicMaterial({ color: 0x35d6a0 });
    for (let i = 0; i < 9; i++) {
      const w = 8 + Math.random() * 7;
      const h = 24 + Math.random() * 46;
      const x = -78 + i * 15 + (Math.random() - 0.5) * 5;
      const z = -438 - Math.random() * 26;
      const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.8), towerMat);
      tower.position.set(x, h / 2, z);
      extGroup.add(tower);
      // lit floors · a few emissive bands say "the desks are still working"
      const floors = 2 + Math.floor(Math.random() * 3);
      for (let f = 0; f < floors; f++) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.9, w * 0.8 + 0.4), bandMat);
        band.position.set(x, 6 + Math.random() * (h - 10), z);
        extGroup.add(band);
      }
    }
    const ticker = new THREE.Mesh(
      new THREE.BoxGeometry(34, 1.4, 1),
      new THREE.MeshBasicMaterial({ color: 0x9dffdc }));
    ticker.position.set(0, 32, -434); // slides across the skyline in the loop
    extGroup.add(ticker);
    const extLight = new THREE.PointLight(0x35d6a0, 36, 420, 1.8);
    extLight.position.set(-24, 34, -420);
    extGroup.add(extLight);
    extGroup.visible = false;
    scene.add(extGroup);

    // 🌊 Ondo: the Harbor · great swells rolling across the horizon
    const ondoGroup = new THREE.Group();
    const ondoSwells: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(46 - i * 11, 1.7, 8, 44, Math.PI),
        new THREE.MeshBasicMaterial({
          color: 0x38a8ff,
          transparent: true,
          opacity: 0.75 - i * 0.18,
        }));
      arc.position.set(-18 + i * 22, -6, -428 - i * 22);
      ondoGroup.add(arc);
      ondoSwells.push(arc);
    }
    const ondoLight = new THREE.PointLight(0x38a8ff, 40, 420, 1.7);
    ondoLight.position.set(-6, 30, -420);
    ondoGroup.add(ondoLight);
    ondoGroup.visible = false;
    scene.add(ondoGroup);

    // 🔥 Phoenix: the Firebird · an ember bird gliding the horizon on slow wings
    const phoenixGroup = new THREE.Group();
    const bird = new THREE.Group();
    const birdBody = new THREE.Mesh(
      new THREE.ConeGeometry(2.4, 15, 5),
      new THREE.MeshBasicMaterial({ color: 0xffc060 }));
    birdBody.rotation.z = -Math.PI / 2; // nose along +x
    bird.add(birdBody);
    const wingMat = new THREE.MeshBasicMaterial({ color: 0xff8a3a, side: THREE.DoubleSide });
    const mkWing = (mirror: 1 | -1) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        "position",
        new THREE.BufferAttribute(
          new Float32Array([0, 0, 0, -7, 0, 26 * mirror, -12, 0, 8 * mirror]),
          3));
      g.computeVertexNormals();
      const pivot = new THREE.Group();
      pivot.add(new THREE.Mesh(g, wingMat));
      bird.add(pivot);
      return pivot;
    };
    const wingL = mkWing(1);
    const wingR = mkWing(-1);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(1.6, 10, 4), wingMat);
    tail.rotation.z = Math.PI / 2; // trailing flame
    tail.position.x = -10;
    bird.add(tail);
    bird.position.set(0, 76, -400);
    phoenixGroup.add(bird);
    const birdLight = new THREE.PointLight(0xff8a3a, 42, 380, 1.7);
    bird.add(birdLight);
    phoenixGroup.visible = false;
    scene.add(phoenixGroup);
    // real winged model (CC0 Quaternius dragon) replaces the triangle bird
    // when loaded · same glide path, real silhouette
    void loadGlb("/models/phoenix.glb")
      .then((m) => {
        // fit by the LARGEST dimension (bind-pose axes are unknowable) and
        // center on the glide origin, never ground-snap a flying model
        const raw = new THREE.Box3().setFromObject(m);
        const rs = new THREE.Vector3();
        raw.getSize(rs);
        const maxDim = Math.max(rs.x, rs.y, rs.z) || 1;
        m.scale.setScalar(26 / maxDim);
        const pbb = new THREE.Box3().setFromObject(m);
        const pc = new THREE.Vector3();
        pbb.getCenter(pc);
        m.position.sub(pc);
        tintAll(m, 0xff8a3a, 0.55);
        m.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const mat of mats) {
              const std = mat as THREE.MeshStandardMaterial;
              if (std.emissive) {
                std.emissive.setHex(0xff6a20);
                std.emissiveIntensity = 0.55;
              }
              std.fog = false;
            }
          }
        });
        [...bird.children].forEach((c) => {
          if (c !== birdLight) c.visible = false;
        });
        bird.add(m);
      })
      .catch(() => {});
    // crystal outcrops dress the Lighter + Perpl roadsides (near-field, fogged)
    void loadGlb("/models/crystal.glb")
      .then((m) => {
        for (const [grp, tint] of [
          [lighterGroup, 0x8a8aff],
          [perplGroup, 0xa855f7],
        ] as const) {
          for (let i = 0; i < 6; i++) {
            const c = m.clone(true);
            c.traverse((o) => {
              const mesh = o as THREE.Mesh;
              if (mesh.isMesh && mesh.material) {
                mesh.material = Array.isArray(mesh.material)
                  ? mesh.material.map((x) => x.clone())
                  : mesh.material.clone();
                const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                for (const mat of mats) {
                  const std = mat as THREE.MeshStandardMaterial;
                  if (std.emissive) {
                    std.emissive.setHex(tint);
                    std.emissiveIntensity = 0.8;
                  }
                  std.fog = true; // near-field props live IN the atmosphere
                }
              }
            });
            const side = i % 2 === 0 ? -1 : 1;
            const s = 1.2 + Math.random() * 2.2;
            c.scale.multiplyScalar(s);
            c.position.set(side * (13 + Math.random() * 26), 0, -40 - i * 45 - Math.random() * 20);
            c.rotation.y = Math.random() * Math.PI * 2;
            grp.add(c);
          }
        }
      })
      .catch(() => {});

    // horizon set-dressing lives BEYOND the fog wall (far=240) · exempt it,
    // or every landmark fogs into nothing, the volcano and hypergrid had
    // silently vanished this way, leaving palette to carry the worlds alone
    const unfog = (root: THREE.Object3D) =>
      root.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
        if (m) m.fog = false;
      });
    [volcanoGroup, hyperGroup, lighterGroup, perplGroup, extGroup, ondoGroup, phoenixGroup].forEach(
      unfog);

    // stars
    const starN = 350;
    const starPos = new Float32Array(starN * 3);
    for (let i = 0; i < starN; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 700;
      starPos[i * 3 + 1] = 40 + Math.random() * 260;
      starPos[i * 3 + 2] = -520;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xd8e4de,
      size: 1.1,
      fog: false,
      transparent: true,
      opacity: runMood.starAlpha, // stars fade toward dawn · live-lerped now
    });
    scene.add(new THREE.Points(starGeo, starMat));

    /* 🌪 WEATHER EVENTS · rare-but-guaranteed spectacle, all visual-only.
     * Tornado: a twisted funnel crossing the horizon. Meteors: streaks in the
     * far sky. Eclipse: the world dims to near-dark and the stars flare. */
    const funnel = new THREE.Group();
    {
      const segs = 9;
      for (let i = 0; i < segs; i++) {
        const r = 2.5 + i * 2.6;
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(r, 0.9 + i * 0.22, 6, 14),
          new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 1, transparent: true, opacity: 0.82 - i * 0.05 }));
        ring.position.y = 4 + i * 7.5;
        ring.rotation.x = Math.PI / 2;
        ring.userData.baseR = r;
        funnel.add(ring);
      }
      funnel.visible = false;
      funnel.position.set(-160, 0, -360);
      unfog(funnel);
      scene.add(funnel);
    }
    const meteorN = 14;
    const meteorPos = new Float32Array(meteorN * 3);
    const meteorGeo = new THREE.BufferGeometry();
    meteorGeo.setAttribute("position", new THREE.BufferAttribute(meteorPos, 3));
    const meteorMat = new THREE.PointsMaterial({ color: 0xffd9a0, size: 2.6, fog: false, transparent: true, opacity: 0 });
    scene.add(new THREE.Points(meteorGeo, meteorMat));
    /* ⛈ STORM · rain that falls, a road that goes slick, lightning that
       whites the sky. Pure Points + material tweaks — no new draw calls of
       consequence. Triggered by the weather director, more likely when the
       tape is frantic (a storm IS the market screaming). */
    const rainN = 700;
    const rainPos = new Float32Array(rainN * 3);
    for (let i = 0; i < rainN; i++) {
      rainPos[i * 3] = (Math.random() - 0.5) * 60;
      rainPos[i * 3 + 1] = Math.random() * 40;
      rainPos[i * 3 + 2] = -Math.random() * 160;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
    const rainMat = new THREE.PointsMaterial({ color: 0xbfd4ee, size: 0.32, fog: false, transparent: true, opacity: 0 });
    const rainPts = new THREE.Points(rainGeo, rainMat);
    rainPts.frustumCulled = false;
    scene.add(rainPts);
    let stormT = 0; // seconds of storm remaining
    let flashT = 0; // lightning · seconds of white left
    let nextFlash = 0;
    const roadMat = road.material as THREE.MeshStandardMaterial;
    const dryRough = roadMat.roughness;
    const dryEnv = roadMat.envMapIntensity;
    let weatherNextAt = 65_000 + Math.random() * 45_000; // first event ~1-2min in
    let weatherKind: "tornado" | "meteors" | "eclipse" | "storm" | null = null;
    let weatherT = 0; // seconds remaining in the active event

    /* ---------------------------- player car --------------------------- */
    const savedPaint = PAINTS.find((p) => p.name === localStorage.getItem("rtn-paint"));
    const player = buildCar((savedPaint ?? PAINTS[0]).color);
    // REAL MODEL swap-in (CC0 Kenney sedan) · procedural stays until loaded,
    // and stays forever if loading fails, models may never break the game
    const playerBodyParts = [...player.children];
    void loadGlb("/models/sedan-sports.glb")
      .then((m) => {
        fitTo(m, 3.6, "z");
        m.rotation.y = Math.PI;
        tintBody(m, (savedPaint ?? PAINTS[0]).color);
        playerBodyParts.forEach((p) => (p.visible = false));
        player.add(m);
      })
      .catch(() => {});
    // rival templates · tinted once, cloned per spawn (shared materials = cheap)
    /* RED MUST NEVER READ AS GREEN. The rider kept bumping rivals because a
       0.45-emissive red car and a 0.4-emissive green one converge under the
       worlds' tinted fog and bloom. Two fixes at once: PUNCH the tints, and
       add SHAPE language that survives any palette (and colorblindness) —
       dangers carry a BLINKING roof beacon, friends a STEADY halo ring.
       Beacons share ONE material per class, so animating two materials in
       the loop animates every clone for free. */
    const dangerBeaconMat = new THREE.MeshBasicMaterial({ color: 0xff2233 });
    const friendHaloMat = new THREE.MeshBasicMaterial({ color: 0x22ff88 });
    const addBeacon = (m: THREE.Object3D, danger: boolean) => {
      const box = new THREE.Box3().setFromObject(m);
      if (danger) {
        const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), dangerBeaconMat);
        b2.position.set(0, box.max.y + 0.25, 0);
        m.add(b2);
      } else {
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 8, 24), friendHaloMat);
        halo.rotation.x = Math.PI / 2;
        halo.position.set(0, box.max.y + 0.45, 0);
        m.add(halo);
      }
    };
    const glbTpl: { truck?: THREE.Object3D; car?: THREE.Object3D; friend?: THREE.Object3D } = {};
    void loadGlb("/models/truck.glb")
      .then((m) => {
        fitTo(m, 4.4, "z");
        m.rotation.y = Math.PI;
        tintAll(m, 0xff2233, 0.95);
        addBeacon(m, true);
        glbTpl.truck = m;
      })
      .catch(() => {});
    void loadGlb("/models/van.glb")
      .then((m) => {
        fitTo(m, 3.6, "z");
        m.rotation.y = Math.PI;
        tintAll(m, 0xff2233, 0.95);
        addBeacon(m, true);
        glbTpl.car = m;
      })
      .catch(() => {});
    void loadGlb("/models/suv.glb")
      .then((m) => {
        fitTo(m, 3.4, "z");
        m.rotation.y = Math.PI;
        tintAll(m, 0x22ff88, 0.9);
        addBeacon(m, false);
        glbTpl.friend = m;
      })
      .catch(() => {});
    if (savedPaint?.metal != null)
      (player.userData.paintMat as THREE.MeshStandardMaterial).metalness = savedPaint.metal;
    playerRef.current = player;
    // underglow · the hero-car signature (bloom halo on the asphalt)
    const underglow = new THREE.PointLight(0x27f2a4, 8, 7, 1.8);
    underglow.position.set(0, 0.25, 0);
    player.add(underglow);
    scene.add(player);
    // neon underglow · the position readout painted onto the road
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(2.6, 24),
      new THREE.MeshBasicMaterial({ color: 0x8a938c, transparent: true, opacity: 0.35 }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.02;
    player.add(glow);
    const headlight = new THREE.SpotLight(0xfff0be, 90, 70, 0.5, 0.55, 1.4);
    headlight.position.set(0, 1.4, -1.6);
    headlight.target.position.set(0, 0, -40);
    player.add(headlight);
    player.add(headlight.target);

    // METEOR pool for cascade boss moments · recognizable flaming rocks with
    // fire trails (was point-sprite "scatter squares"; unreadable). Hidden
    // until an eruption fires.
    // eruption is expressed through the crater flare + sky mood + lane danger ·
    // falling-debris visuals removed (user call: cleaner without them)

    /* ------------------------- market connection ----------------------- */
    const feed = new LiveFeed("ETH", () => {});
    feed.start().catch(() => {});

    /* ------------------------------ state ------------------------------ */
    let lane = 1;
    /* ── THE DRIVE MODEL · a car, not an oscillator ──────────────────────
       Continuous x, lateral velocity, a steering wheel with lag, rails that
       are real, and a lane that is DERIVED from where the car actually is
       (with hysteresis) — so every trade-side rule downstream keeps working
       unchanged while the car finally swerves. */
    let carX = LANES[1];
    let carVx = 0;
    let steer = 0; // the wheel · smoothed
    let steerIn = 0; // raw analog input −1..1 (held keys / touch drag)
    let seekX: number | null = null; // tap-to-lane target · the seek controller swerves to it
    let dragged = false;
    let railHitCd = 0;
    let shakeT = 0;
    let odo = 0; // world units travelled · indexes the curvature field
    let kNow = 0; // curvature under the car this frame
    const ROAD_HALF = 6.4; // rails sit at ±7.6 · the car is ~2.2 wide
    const path = new RoadPath();
    // dev probe · the drive model, readable from the console/verification
    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
      (window as unknown as { __rtnDrive?: () => unknown }).__rtnDrive = () => ({
        carX, carVx, steer, steerIn, seekX, lane, kNow, odo, regime: path.regime, speed, stormT: 0,
      });
    }
    path.onRegime = (r) => {
      pushBuzz(REGIME_LABEL[r]);
      pushFlash(REGIME_LABEL[r].split(" · ")[0].toUpperCase());
    };
    let speed = 46;
    let score = 0;
    let coinsGot = 0;
    let crashT = 0;
    let wrecks = 0;
    let gameOver = false;
    let prevFlow = 0;
    let popId = 0;
    // cascade boss state
    let casT = typeof location !== "undefined" && location.hash === "#fx" ? 9999 : 0;
    let casDir: 1 | -1 = -1;
    let casHot = 0;
    let casCd = 15;
    let casOK = true;

    const finishRun = () => {
      if (gameOver) return;
      gameOver = true;
      overRef.current = true;
      sfx.runOver();
      if (modeRef.current !== "passenger") flattenRef?.current?.(); // real position closes the moment the run ends
      const h = { score: Math.round(score), coins: coinsGot };
      const r = realRef?.current;
      const prevBest = career().bestRidePoints;
      const rec = saveRide({
        mode: "3d",
        live: !!r && r.fills > 0,
        sim: { volume: h.score, coins: h.coins, dodges: 0, bestStreak: 0, crashes: wrecks },
        real: { fills: r?.fills ?? 0, volume: r?.volume ?? 0, fees: r?.fees ?? 0, pnl: r?.pnl ?? 0 },
      });
      if (rec.points > prevBest && prevBest > 0) pushBuzz("🏆 NEW PERSONAL BEST!");
      // daily set · the run's harvest counts toward today's bounties
      bumpBounty("km", dist);
      bumpBounty("coins", coinsGot);
      // 👻 beat the ghost at the flag? the new pace curve becomes the rival
      const hadBest = ghostBest?.km ?? 0;
      if (dist > hadBest && ghostSamples.length > 3) {
        ghostBest = { km: dist, curve: [...ghostSamples] };
        try {
          localStorage.setItem("rtn-ghost3d", JSON.stringify(ghostBest));
        } catch {}
        if (hadBest > 0) {
          pushBuzz("👻 NEW GHOST SET · your best pace is the new rival");
          hlRef.current?.highlight("new-best");
        }
      }
      // the so-close pull · exact distances to the next hooks
      const volNow = career().realVolume;
      const LADDER = [100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];
      setOverMeta({
        km: dist,
        best: Math.max(hadBest, dist),
        nextClub: LADDER.find((x) => volNow < x) ?? null,
        vol: volNow,
      });
      setOverArmed(armedRef.current);
      setOver(rec);
      submitRide(rec); // global board (no-op until backend configured)
      void fetchPercentile(rec.points).then(setPct).catch(() => {});
      void aiCoach(rec, career()).then(setAiTip).catch(() => {});
    };

    // DRIVE AGAIN · reset the run without tearing down the scene
    resetRef.current = () => {
      score = 0;
      coinsGot = 0;
      combo3Done = false;
      wrecks = 0;
      crashT = 0;
      dist = 0;
      goldCd = 40 + Math.random() * 50;
      combo = 1;
      slowT = 0;
      laneHoldT = 0;
      newMission();
      speed = 46;
      gameOver = false;
      overRef.current = false;
      for (const rv of rivals) scene.remove(rv.group);
      rivals.length = 0;
      for (const c of coins) scene.remove(c.mesh);
      coins.length = 0;
      worldTour = null; // a fresh run starts on the rider's own road
      portalStreak = 0;
      // market fauna: the herds, gems and portal never survive a restart
      for (const b of fauna) scene.remove(b.group);
      fauna.length = 0;
      for (const gm of gems) scene.remove(gm.mesh);
      gems.length = 0;
      if (portal) {
        scene.remove(portal.group);
        portal = null;
      }
      faunaRunT = 0;
      herdOpenerDone = false;
      gemEver = false;
      // 👻 fresh race against the (possibly new) ghost
      ghostSamples = [];
      ghostRunT = 0;
      ghostSampleCd = 0;
      ghostPassed = false;
      setOverMeta(null);
      setLane(1);
      setOver(null);
      setPct(null);
      setAiTip(null);
    };
    const rivals: Rival[] = [];
    const coins: Coin[] = [];
    let rivalCd = 1.4;
    let coinCd = 2.2;
    let goldCd = 40 + Math.random() * 50; // rare, unpredictable · that's the hook
    let dist = 0; // odometer (km) · a rider identity stat
    // ---- COMBO HEAT: chained plays build a multiplier; one crash resets it.
    // The "don't break the chain" tension that makes runs feel high-stakes.
    let combo = 1;
    let comboT = 0; // grace window before decay
    let combo3Done = false; // daily-set bounty: first ×3 heat of the run counts
    const bumpCombo = (x: number) => {
      combo = Math.min(5, combo + x);
      comboT = 4;
      if (combo >= 3 && !combo3Done) {
        combo3Done = true;
        bumpBounty("combo3", 1);
      }
    };
    // ---- NEAR-MISS: shaving a truck at the last instant pays big + slow-mo.
    let slowT = 0; // slow-motion timer
    let nearMisses = 0;
    let herdRides = 0; // aligned herd boosts this run · fauna-mission counter
    let gemsGot = 0; // whale gems this run
    let laneHoldT = 0; // continuous seconds in one positioned lane
    let lastHoldLane = -1;
    // ---- RUN MISSIONS: every ride gets one small goal with a bounty.
    let eruSurvived = false;
    let mission: { type: string; target: number; txt: string; done: boolean } = {
      type: "coins",
      target: 25,
      txt: "collect 25 coins",
      done: false,
    };
    const newMission = () => {
      const picks = [
        { type: "coins", target: 25, txt: "collect 25 coins" },
        { type: "km", target: 2.5, txt: "ride 2.5 km" },
        { type: "nearmiss", target: 3, txt: "shave 3 near-misses" },
        { type: "hold", target: 20, txt: "hold one position lane 20s" },
        { type: "erupt", target: 1, txt: "survive an eruption" },
        // fauna bounties · the living market IS the mission
        { type: "fauna", target: 2, txt: "run with 2 herds" },
        { type: "gem", target: 1, txt: "catch a whale gem" },
      ];
      const m = picks[Math.floor(Math.random() * picks.length)];
      mission = { ...m, done: false };
      nearMisses = 0;
      eruSurvived = false;
      herdRides = 0;
      gemsGot = 0;
      setMissionTxt(`🎯 ${m.txt}`);
    };
    newMission();
    let lastFillSeen: string | null = realRef?.current?.last ?? null;
    let lastPnlSeen = realRef?.current?.pnl ?? 0;
    let prevCareerTotal = careerVolBase.current; // for club-crossing detection

    const doPop = (txt: string, color: string) => setPop({ txt, color, id: ++popId });

    // LANES ARE POSITIONS: 0 = SHORT, 1 = FLAT, 2 = LONG. Steering = trading.
    const laneSide = (l: number) => l - 1;
    let laneChangeT = 0;
    let prevLane = 1;
    const LANE_WORD = ["SHORT · betting price falls", "NEUTRAL · farming both ways", "LONG · betting price rises"];
    const LANE_COLOR = ["#6ab8ff", "#d8e4de", "#27f2a4"];
    /* the trade side follows the CAR, with hysteresis so a swerve that
       brushes a lane edge does not flicker a real position on and off */
    const laneFromX = (): number => {
      const enter = 2.15, leave = 1.55;
      if (lane === 1) return carX > enter ? 2 : carX < -enter ? 0 : 1;
      if (lane === 2) return carX >= leave ? 2 : carX < -enter ? 0 : 1;
      return carX <= -leave ? 0 : carX > enter ? 2 : 1;
    };
    /** a tap / the autopilot ASKS for a lane · the car drives there (a real
     *  arc, not a snap) and the side commits when it actually arrives */
    const setLane = (l: number) => {
      const target = Math.max(0, Math.min(2, l));
      seekX = LANES[target];
      steerIn = 0;
    };
    const commitLane = (l: number) => {
      if (l === lane) return;
      prevLane = lane;
      lane = l;
      laneChangeT = performance.now();
      setTargetRef?.current?.(laneSide(l)); // real trade intent (throttled by LiveTrader)
      // narrate every move · the newbie always knows what their money is doing
      const live = armedRef.current;
      doPop(
        l === 1
          ? `→ ${LANE_WORD[1]}${live ? " · closing real position…" : ""}`
          : `→ ${LANE_WORD[l]}${live ? " · placing real trade…" : ""}`,
        LANE_COLOR[l]);
    };

    /**
     * Traffic embodies the market: with buyers pushing (flow>0), red hazards
     * flood the SHORT lane and green drafts run in the LONG lane · and vice
     * versa. The FLAT lane stays safest but earns least. Playing well =
     * positioned with flow = the safe-volume trade.
     */
    const spawnRival = (flow: number) => {
      // FLAT (center) is the sanctuary · traffic only occupies position lanes.
      // Neutral flow = coin-flip sides; strong flow biases hazards against it.
      const withLane = flow > 0.1 ? 2 : flow < -0.1 ? 0 : Math.random() < 0.5 ? 2 : 0;
      const againstLane = 2 - withLane;
      const hostile = Math.random() < 0.28 + Math.min(0.5, Math.abs(flow) * 0.6);
      const r = Math.random();
      const l = hostile
        ? r < 0.72
          ? againstLane
          : withLane
        : r < 0.72
          ? withLane
          : againstLane;
      const isTruckVar = hostile && Math.random() < 0.5;
      const g = buildCar(hostile ? 0xff4d5e : 0x27f2a4, isTruckVar);
      // real-model swap when the template is ready · clone shares materials
      const tpl = hostile ? (isTruckVar ? glbTpl.truck : glbTpl.car) : glbTpl.friend;
      if (tpl) {
        [...g.children].forEach((c) => (c.visible = false));
        g.add(tpl.clone(true));
      }
      g.position.set(LANES[l], 0, -320);
      scene.add(g);
      rivals.push({ group: g, lane: l, speed: 22 + Math.random() * 10, hostile, scored: false });
    };
    const coinGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.14, 18);
    coinGeo.rotateX(Math.PI / 2);
    const coinMat = new THREE.MeshStandardMaterial({
      color: 0xf7c948,
      emissive: 0x8a5a00,
      metalness: 0.7,
      roughness: 0.25,
    });
    const spawnCoins = (flow: number) => {
      // coins pay the flow-aligned lane most · collecting = being positioned
      // right. Never the center: FLAT earns nothing, by design.
      const withLane = flow > 0.1 ? 2 : flow < -0.1 ? 0 : Math.random() < 0.5 ? 2 : 0;
      const l = Math.random() < 0.68 ? withLane : 2 - withLane;
      for (let i = 0; i < 5; i++) {
        const m = new THREE.Mesh(coinGeo, coinMat);
        m.position.set(LANES[l], 1.1, -300 - i * 7);
        scene.add(m);
        coins.push({ mesh: m, lane: l, taken: false });
      }
    };
    // GOLDEN STAMPEDE · the variable-reward event. Pure game (no signal), pure
    // upside (never punishes): a rare glittering run of 5× coins that makes you
    // chase. Rarity is the point · you never know when the next one comes.
    const goldGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.2, 24);
    goldGeo.rotateX(Math.PI / 2);
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xffe14a,
      emissive: 0xcf8b00,
      emissiveIntensity: 0.9,
      metalness: 0.9,
      roughness: 0.12,
    });
    const spawnStampede = () => {
      const l = Math.floor(Math.random() * 3);
      for (let i = 0; i < 12; i++) {
        const m = new THREE.Mesh(goldGeo, goldMat);
        m.position.set(LANES[l], 1.2, -320 - i * 6);
        scene.add(m);
        coins.push({ mesh: m, lane: l, taken: false, gold: true });
      }
      doPop("🐂 GOLDEN STAMPEDE INCOMING", "#ffd24a");
      sfx.coin();
    };

    /* ------------------------- MARKET FAUNA ---------------------------
     * The living market-world: every creature IS a real signal.
     *  🐂 bull herd  · charges up the LONG roadside when real buy-flow surges
     *  🐻 bear pack  · prowls the SHORT roadside when sellers slam
     *  💎 whale gem  · spawns on a real flow JERK (a whale print) · big pay
     *  🌀 portal     · opens when the market REGIME flips (calm ⇄ hot)
     * Riding the lane the fauna runs = riding WITH the flow · that alignment
     * (the safe-volume trade) is what pays, same law as coins and drafts.   */
    interface Beast {
      group: THREE.Group;
      side: 0 | 2; // which position lane it endorses (0 short · 2 long)
      kind: "bull" | "bear";
      speedDelta: number; // + = pulls ahead of the player, − = drifts past
      phase: number; // gallop phase offset
      scored: boolean;
    }
    const fauna: Beast[] = [];
    const gems: { mesh: THREE.Mesh; lane: number; taken: boolean }[] = [];
    let portal: { group: THREE.Group; used: boolean } | null = null;
    /* 🌀 THE PORTAL GOES SOMEWHERE NOW. Crossing a regime portal used to pay
       $150 and vanish — a door that opened onto nothing. It now opens onto
       ANOTHER VENUE'S WORLD: scenery hot-swaps to a random other road (the
       same render-only mechanism the venue pills use), so the aggregator
       thesis is something you FEEL — one garage, many worlds, and the market
       regime is the thing that carries you between them.
       RENDER-ONLY, and the buzz says so: driving, signals and any live trades
       stay exactly where they were. The tour ends when the run does, or the
       moment the rider picks a venue themselves. */
    let worldTour: WorldId | null = null;
    /* 🌀 PORTAL STREAK · regimes rarely flip once. A tape that whips
       calm⇄hot⇄calm produces portal after portal, and chaining them should
       FEEL like surfing the regime, not like collecting the same $150 twice.
       Each crossing inside one run raises the take (150 → 300 → 450…, capped
       ×4) and the buzz names the chain. Honest by construction: streak depth
       IS how many real regime flips this run has carried you through. */
    let portalStreak = 0;
    /* 📺 HERO SHOTS · when the world produces a moment, the broadcast camera
       leans into it: a short eased bias toward the event plus a small FOV
       kick, then back to the drift. Passenger+broadcast only — a driver's
       camera never moves under them. */
    const camEvt = { until: 0, dur: 1, xBias: 0, fovKick: 0 };
    /* 🏷 THE CLIP SIGNS ITSELF. Auto-highlights record the CANVAS — DOM
       overlays (lower-third, scoreboard) never appear in them, so a posted
       clip carried no way back. This burns the door into the scene itself: a
       camera-pinned sprite, bottom-right, visible only while the broadcast is
       on air, so every clip and every stream frame carries the invite. */
    let wmSprite: THREE.Sprite | null = null;
    const ensureWatermark = () => {
      if (wmSprite) return;
      let code = "";
      try {
        code = localStorage.getItem("rtn-mycode") ?? "";
      } catch {}
      const c = document.createElement("canvas");
      c.width = 1024;
      c.height = 96;
      const g = c.getContext("2d")!;
      g.textAlign = "right";
      g.textBaseline = "middle";
      g.font = "700 34px Archivo, system-ui, sans-serif";
      g.fillStyle = "rgba(245,239,226,0.85)";
      g.fillText("ride the now · monad", 1008, 30);
      g.font = "700 26px Archivo, system-ui, sans-serif";
      g.fillStyle = "rgba(255,122,26,0.9)";
      g.fillText(code ? `ride with ${code}` : "drive the market · farm every road", 1008, 68);
      const tex = new THREE.CanvasTexture(c);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
      wmSprite = new THREE.Sprite(mat);
      wmSprite.renderOrder = 999;
      // camera space · bottom-right, sized against a ~2-unit frustum slice
      wmSprite.scale.set(1.7, 0.16, 1);
      wmSprite.position.set(0.98, -0.92, -2);
      camera.add(wmSprite);
      scene.add(camera); // a camera with children must be in the graph
    };
    const dropWatermark = () => {
      if (!wmSprite) return;
      camera.remove(wmSprite);
      wmSprite.material.map?.dispose();
      wmSprite.material.dispose();
      wmSprite = null;
    };
    const heroShot = (xBias: number, fovKick = 4, dur = 1800) => {
      camEvt.until = Date.now() + dur;
      camEvt.dur = dur;
      camEvt.xBias = xBias;
      camEvt.fovKick = fovKick;
    };
    /* world livery for the fauna · each road's rail color worn as flank
       stripes, so a Perpl bull is visibly not a Hotstuff bull — variety
       WITHOUT touching the signal colors (eyes/horns stay the honest tell) */
    /* PER-WORLD SILHOUETTES · each road's herd carries its own body language,
       parametric so it stays cheap and coherent: the volcano breeds stocky
       long-horns, lightspeed runs slim with a speed crest, the monolith world
       walks slabs, Wall Street wears boxy shoulders. The SIGNAL LAW is
       untouched — eyes and horns keep the honest mint/red, sides and rewards
       are exactly as before; only proportions and one accessory vary. */
    const WORLD_BEAST: Record<string, { w: number; h: number; l: number; horn: number; rake: number; crest?: boolean; shoulders?: boolean; tailFin?: boolean }> = {
      hotstuff: { w: 1.2, h: 1.0, l: 1.05, horn: 1.5, rake: 0.4 },
      hyperliquid: { w: 0.85, h: 0.95, l: 1.15, horn: 1.0, rake: 0.8 },
      lighter: { w: 0.72, h: 0.9, l: 1.2, horn: 0.8, rake: 1.0, crest: true },
      perpl: { w: 1.35, h: 1.25, l: 0.95, horn: 0.9, rake: 0.2 },
      extended: { w: 1.1, h: 1.05, l: 0.9, horn: 0.6, rake: 0.3, shoulders: true },
      ondo: { w: 1.0, h: 0.9, l: 1.05, horn: 0.8, rake: 0.5, tailFin: true },
      phoenix: { w: 0.9, h: 1.0, l: 1.0, horn: 1.1, rake: 0.9, crest: true },
      arcus: { w: 0.95, h: 1.1, l: 0.9, horn: 1.2, rake: 0.6 },
      paradex: { w: 1.15, h: 1.0, l: 1.0, horn: 0.9, rake: 0.3, shoulders: true },
    };
    const beastParams = () => WORLD_BEAST[(worldTour ?? worldRef.current) as string] ?? WORLD_BEAST.hotstuff;

    const liveryMats = new Map<number, THREE.MeshStandardMaterial>();
    const liveryFor = () => {
      const wid = (worldTour ?? worldRef.current) as keyof typeof WORLDS;
      const c = (WORLDS[wid] ?? WORLDS.hotstuff).rail;
      let m = liveryMats.get(c);
      if (!m) {
        m = new THREE.MeshStandardMaterial({ color: 0x0c0b10, emissive: c, emissiveIntensity: 1.7 });
        liveryMats.set(c, m);
      }
      return m;
    };

    const hideMat = new THREE.MeshStandardMaterial({ color: 0x12151b, roughness: 0.85 });
    const bearHideMat = new THREE.MeshStandardMaterial({ color: 0x16110f, roughness: 0.9 });
    const hornMat = new THREE.MeshStandardMaterial({
      color: 0x0a2018,
      emissive: 0x27f2a4,
      emissiveIntensity: 2.2,
    });
    const bearEyeMat = new THREE.MeshStandardMaterial({
      color: 0x200205,
      emissive: 0xff4d5e,
      emissiveIntensity: 2.6,
    });
    const legGeo = new THREE.BoxGeometry(0.18, 0.85, 0.24);
    legGeo.translate(0, -0.42, 0); // pivot at the hip so rotation.x = a stride

    /* THE REAL BULL · Quaternius's rigged animal (CC0), meshopt-compressed to
       434 KB with its Gallop and Headbutt clips. It lands in the background;
       until then, and for the bears, the parametric silhouettes keep the
       herd honest. Eyes stay mint: the honest tell of WHICH force is
       running never depends on a download. */
    let bullTpl: { scene: THREE.Group; clips: THREE.AnimationClip[] } | null = null;
    void loadGlbWithClips("/models/q/bull.glb")
      .then((b) => {
        bullTpl = b;
      })
      .catch(() => {});
    /* THE REAL BEAR · a rigged bear from Sketchfab (Nyilonelycompany, CC-BY,
       credited on /credits), 228 KB compressed, its fur pulled toward the
       world's dark hide so it reads as the bull's opposite. Red eyes kept. */
    let bearTpl: { scene: THREE.Group; clips: THREE.AnimationClip[] } | null = null;
    void loadGlbWithClips("/models/q/sf/bear.glb")
      .then((b) => {
        bearTpl = b;
      })
      .catch(() => {});
    const darkHide = new THREE.Color(0x2a1f1a);
    const BULL_LEN = 2.9; // metres nose to tail on the road
    const makeBeast = (kind: "bull" | "bear"): THREE.Group => {
      const rigged = kind === "bull" ? bullTpl : bearTpl;
      if (rigged) {
        const g = new THREE.Group();
        const body = cloneSkinned(rigged.scene) as THREE.Group;
        fitTo(body, kind === "bull" ? BULL_LEN : 2.6, "z");
        body.rotation.y = Math.PI; // the model faces +z · the herd runs toward −z
        body.traverse((o) => {
          const mm = o as THREE.Mesh;
          if (!mm.isMesh) return;
          mm.frustumCulled = false; // a skinned mesh's bind-pose sphere lies about where the gallop puts it
          if (kind === "bear" && mm.material) {
            const mat = (Array.isArray(mm.material) ? mm.material[0] : mm.material) as THREE.MeshStandardMaterial;
            if (mat.color) mat.color.lerp(darkHide, 0.6);
          }
        });
        g.add(body);
        if (process.env.NODE_ENV !== "production") {
          const bb = new THREE.Box3().setFromObject(body);
          (window as unknown as { __rtnBull?: unknown }).__rtnBull = { kind, size: bb.getSize(new THREE.Vector3()).toArray().map((v) => Math.round(v * 100) / 100), min: bb.min.toArray().map((v) => Math.round(v * 100) / 100) };
        }
        const mixer = new THREE.AnimationMixer(body);
        const gallop = rigged.clips.find((c) => c.name === "Gallop") ?? rigged.clips[0];
        if (gallop) {
          const a = mixer.clipAction(gallop);
          a.timeScale = 1.35 + Math.random() * 0.3;
          a.play();
          mixer.update(Math.random() * 2); // no two bulls in step
        }
        // the eyes · two emissive beads at the head, mint or red, the honest tell
        const box = new THREE.Box3().setFromObject(body);
        const eyeGeo = new THREE.SphereGeometry(0.06, 8, 8);
        for (const sx of [-1, 1]) {
          const eye = new THREE.Mesh(eyeGeo, kind === "bull" ? hornMat : bearEyeMat);
          eye.position.set(sx * 0.16, box.max.y - 0.35, box.min.z + 0.12);
          g.add(eye);
        }
        // world livery stripe on the flank · which ROAD this beast belongs to
        const st = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 1.2), liveryFor());
        st.position.set(0, box.max.y - 0.05, 0);
        g.add(st);
        g.userData.legs = [];
        g.userData.mixer = mixer;
        g.userData.bob = false;
        return g;
      }
      const g = new THREE.Group();
      const bull = kind === "bull";
      const P = beastParams();
      const mat = bull ? hideMat : bearHideMat;
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(
          (bull ? 1.35 : 1.55) * P.w,
          (bull ? 1.05 : 1.2) * P.h,
          (bull ? 2.3 : 2.0) * P.l,
        ),
        mat,
      );
      body.position.y = 1.15;
      g.add(body);
      // world livery stripes · which ROAD this beast belongs to
      const stripeGeo = new THREE.BoxGeometry(0.06, 0.2, bull ? 1.6 : 1.4);
      for (const sSide of [-1, 1]) {
        const st = new THREE.Mesh(stripeGeo, liveryFor());
        st.position.set((bull ? 0.71 : 0.81) * sSide, 1.35, 0);
        g.add(st);
      }
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.58, 0.66), mat);
      head.position.set(0, bull ? 1.55 : 1.4, bull ? -1.35 : -1.15);
      g.add(head);
      // eyes read at night · the honest tell of WHICH force is running
      const eyeGeo = new THREE.SphereGeometry(0.07, 8, 8);
      const eyeMat = bull ? hornMat : bearEyeMat;
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(0.18 * s, head.position.y + 0.08, head.position.z - 0.3);
        g.add(eye);
      }
      if (bull) {
        const hornGeo = new THREE.ConeGeometry(0.09, 0.52 * P.horn, 6);
        for (const s of [-1, 1]) {
          const horn = new THREE.Mesh(hornGeo, hornMat);
          horn.position.set(0.3 * s, head.position.y + 0.34, head.position.z);
          horn.rotation.z = -s * 0.55;
          horn.rotation.x = -P.rake * 0.4; // raked horns read as speed
          g.add(horn);
        }
      } else {
        const earGeo = new THREE.BoxGeometry(0.16, 0.16, 0.1);
        for (const s of [-1, 1]) {
          const ear = new THREE.Mesh(earGeo, bearHideMat);
          ear.position.set(0.24 * s, head.position.y + 0.36, head.position.z);
          g.add(ear);
        }
      }
      // world accessories · one silhouette cue each, never a new color story
      if (P.crest) {
        const crest = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.9), liveryFor());
        crest.position.set(0, (bull ? 1.15 : 1.3) + 0.75 * P.h, 0.2);
        g.add(crest);
      }
      if (P.shoulders) {
        for (const sSide of [-1, 1]) {
          const pad = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.5), mat);
          pad.position.set(((bull ? 0.7 : 0.8) * P.w) * sSide, 1.15 + 0.5 * P.h, -0.5);
          g.add(pad);
        }
      }
      if (P.tailFin) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.4), liveryFor());
        fin.position.set(0, 1.2, (bull ? 1.15 : 1.0) * P.l + 0.15);
        fin.rotation.x = 0.5;
        g.add(fin);
      }
      const legs: THREE.Mesh[] = [];
      for (const [lx, lz] of [[-0.5, -0.85], [0.5, -0.85], [-0.5, 0.85], [0.5, 0.85]] as const) {
        const leg = new THREE.Mesh(legGeo, mat);
        leg.position.set(lx, 1.05, lz);
        legs.push(leg);
        g.add(leg);
      }
      g.userData.legs = legs;
      return g;
    };

    /** A herd/pack materializes ROADSIDE on the lane it endorses · pure
     *  spectacle + an alignment bonus, never a hazard (the world rewards
     *  reading it, it doesn't sucker-punch). */
    const spawnHerd = (kind: "bull" | "bear") => {
      const side: 0 | 2 = kind === "bull" ? 2 : 0;
      const x = side === 2 ? 8.4 : -8.4;
      const n = 3;
      for (let i = 0; i < n; i++) {
        const g = makeBeast(kind);
        // choreography: BULLS materialize right BESIDE you and thunder PAST
        // toward the horizon (you feel the charge overtake you) · BEARS loom
        // mid-distance ahead and prowl back toward you (you ride into them)
        const z0 = kind === "bull" ? -3 - i * 7 - Math.random() * 3 : -48 - i * 9 - Math.random() * 5;
        g.position.set(x + (Math.random() - 0.5) * 1.6, 0, z0);
        g.rotation.y = side === 2 ? 0.06 : -0.06;
        scene.add(g);
        if (i === 0) heroShot(side === 2 ? 2.6 : -2.6, 3, 1600); // glance at the herd
        fauna.push({
          group: g,
          side,
          kind,
          // bulls CHARGE ahead of you (the surge outruns the tape) · bears
          // prowl slower so the pack slides past close enough to feel
          speedDelta: kind === "bull" ? 8 + Math.random() * 3 : -(5 + Math.random() * 2),
          phase: Math.random() * Math.PI * 2,
          scored: false,
        });
      }
    };

    const gemGeo = new THREE.OctahedronGeometry(0.72, 0);
    const gemMat = new THREE.MeshStandardMaterial({
      color: 0x241f4a,
      emissive: 0xa9a3ff,
      emissiveIntensity: 2.4,
      metalness: 0.4,
      roughness: 0.15,
    });
    /** A whale print (real flow jerk) drops ONE gem in the flow-aligned lane. */
    const spawnGem = (flow: number) => {
      gemEver = true;
      const l = flow > 0 ? 2 : 0;
      const m = new THREE.Mesh(gemGeo, gemMat);
      m.position.set(LANES[l], 1.5, -300);
      scene.add(m);
      gems.push({ mesh: m, lane: l, taken: false });
      heroShot((l - 1) * 2.2, 3, 1500); // glance toward the whale's lane
      pushBuzz(flow > 0 ? "💎 whale BUY print · gem in the LONG lane" : "💎 whale SELL print · gem in the SHORT lane");
    };

    /** The regime portal · a papaya ring over the road when the market flips
     *  calm ⇄ hot. Driving through banks the shift bonus. */
    const spawnPortal = (hot: boolean) => {
      if (portal) return;
      const g = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(4.6, 0.2, 10, 40),
        new THREE.MeshStandardMaterial({
          color: 0x2a1204,
          emissive: hot ? 0xff7a1a : 0x6ab8ff,
          emissiveIntensity: 2.6,
        }));
      ring.position.y = 4.2;
      g.add(ring);
      const veil = new THREE.Mesh(
        new THREE.CircleGeometry(4.4, 40),
        new THREE.MeshBasicMaterial({
          color: hot ? 0xff7a1a : 0x6ab8ff,
          transparent: true,
          opacity: 0.07,
          side: THREE.DoubleSide,
        }));
      veil.position.y = 4.2;
      g.add(veil);
      g.position.set(0, 0, -340);
      scene.add(g);
      portal = { group: g, used: false };
      heroShot(0, 7, 2200); // the ring deserves a straight-on push-in
      pushBuzz(hot ? "🌀 regime shift · the market is HEATING · portal ahead" : "🌀 regime shift · the market is COOLING · portal ahead");
    };

    // fauna signal trackers (self-contained · the loop's prevFlow is spoken for)
    let faunaPrevFlow = 0;
    let herdCd = 0;
    let gemCd = 6;
    let regimeHot = false;
    let regimeHold = 0;
    let portalCd = 20;
    // GUARANTEED ENCOUNTERS · signals are rare enough that a short session
    // could miss the living world entirely, so every run OPENS with the
    // flow-aligned herd (~8s in) and guarantees a first gem by ~45s. The
    // creatures still tell the truth (they follow the CURRENT flow's side);
    // only their first appearance is scheduled, not invented.
    let faunaRunT = 0;
    let herdOpenerDone = false;
    let gemEver = false;
    // dev-only spawner hooks · lets us verify/tune the fauna without waiting
    // for the real market to produce the signal (never ships to production)
    if (process.env.NODE_ENV !== "production") {
      // temp probe · name every mesh within r units of a world point
      (window as unknown as { __rtnNear?: unknown }).__rtnNear = (
        x = 0,
        z = 0,
        r = 15) => {
        const out: string[] = [];
        const v = new THREE.Vector3();
        scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.getWorldPosition(v);
          if (Math.hypot(v.x - x, v.z - z) < r) {
            const s = new THREE.Vector3();
            new THREE.Box3().setFromObject(mesh).getSize(s);
            out.push(
              `${mesh.name || mesh.geometry?.type} @ (${v.x.toFixed(1)},${v.y.toFixed(1)},${v.z.toFixed(1)}) size ${s.x.toFixed(1)}x${s.y.toFixed(1)}x${s.z.toFixed(1)} vis=${mesh.visible}`);
          }
        });
        return out;
      };
      (window as unknown as { __rtnFauna?: unknown }).__rtnFauna = {
        herd: spawnHerd,
        gem: spawnGem,
        portal: spawnPortal,
        // verify the portal's destination without having to drive through one
        tour: (w: WorldId | null) => {
          worldTour = w;
        },
      };
      (window as unknown as { __rtnSeg?: unknown }).__rtnSeg = (i: number) =>
        applySegment(i % SEGMENTS.length, true);
    }

    /* 👻 BEAT YOUR GHOST · your best run's pace, materialized. The record run
     * saves a (t → km) curve; the translucent car holds the CENTER lane at the
     * live pace delta, so every run is a race against yourself. Passing it
     * mid-run pays once; beating it at the flag writes the new ghost. */
    interface GhostSave {
      km: number;
      curve: [number, number][];
    }
    let ghostBest: GhostSave | null = null;
    try {
      ghostBest = JSON.parse(localStorage.getItem("rtn-ghost3d") ?? "null");
    } catch {
      /* no ghost yet */
    }
    let ghostSamples: [number, number][] = [];
    let ghostSampleCd = 0;
    let ghostRunT = 0;
    let ghostPassed = false;
    let ghostDeltaM: number | null = null;
    const ghostMat = new THREE.MeshStandardMaterial({
      color: 0x14122e,
      emissive: 0xa9a3ff,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.26,
    });
    const ghostCar = new THREE.Group();
    {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.8, 3.4), ghostMat);
      b.position.y = 0.75;
      ghostCar.add(b);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.6), ghostMat);
      cab.position.set(0, 1.35, 0.1);
      ghostCar.add(cab);
    }
    ghostCar.visible = false;
    scene.add(ghostCar);
    const ghostKmAt = (tt: number): number => {
      const cv = ghostBest?.curve;
      if (!cv || cv.length === 0) return 0;
      if (tt <= cv[0][0]) return cv[0][1];
      for (let i = 1; i < cv.length; i++)
        if (tt <= cv[i][0]) {
          const [t0, k0] = cv[i - 1];
          const [t1, k1] = cv[i];
          return k0 + (k1 - k0) * ((tt - t0) / Math.max(0.001, t1 - t0));
        }
      return cv[cv.length - 1][1];
    };

    /* ----------------------------- controls ---------------------------- */
    // throttle: +1 accelerate, -1 brake, 0 coast. Drives speed in the loop.
    let throttle = 0;
    // JUMP · hop over a truck WITHOUT leaving the lane: position, maker quotes
    // and the rebate clock all stay untouched · the fee-optimal skill move.
    let jumpT = 0; // >0 while airborne (seconds remaining)
    let jumpCd = 0; // cooldown so it's a timed skill, not a shield
    const JUMP_DUR = 0.62;
    const doJump = () => {
      if (jumpT > 0 || jumpCd > 0 || gameOver || pausedRef.current) return;
      jumpT = JUMP_DUR;
      jumpCd = 1.6;
      sfx.dodge();
    };
    let lastLever = 1; // last clip-multiplier pushed to the trader
    // PAUSE = safe-flat + freeze: closing the real position first means walking
    // away mid-ride can never leave money on the road.
    const togglePause = () => {
      if (gameOver) return;
      pausedRef.current = !pausedRef.current;
      setPaused(pausedRef.current);
      if (pausedRef.current) {
        throttle = 0;
        setLane(1); // center = flat intent
        /* PASSENGER IS THE ENGINE, THE GAME IS A SKIN. A pause — including
           the auto-pause when the tab is hidden — used to flatten the real
           position at TAKER cost, and the grid then re-opened it: every
           alt-tab to check the venue cost a crossing. The rider's fill log
           showed exactly that pattern (a taker close every 10–20s). The
           autopilot keeps working while the picture is paused. */
        if (modeRef.current !== "passenger") flattenRef?.current?.(); // and the real position closes NOW
      }
    };
    togglePauseRef.current = togglePause;
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
    const key = (e: KeyboardEvent) => {
      if (gameOver) return;
      music.start();
      engine.start(); // idempotent · keyboard players get the motor too
      if (e.code === "KeyP" || e.code === "Escape") return togglePause();
      if (pausedRef.current) return; // frozen · only P/Esc gets through
      if (modeRef.current === "passenger") return; // autopilot · no manual input
      // HOLD to swerve (analog), a quick TAP hops a lane on release
      if (e.code === "ArrowLeft" || e.code === "KeyA") { if (!e.repeat) keyDownAt.set("L", performance.now()); steerIn = -1; seekX = null; }
      if (e.code === "ArrowRight" || e.code === "KeyD") { if (!e.repeat) keyDownAt.set("R", performance.now()); steerIn = 1; seekX = null; }
      if (e.code === "ArrowUp" || e.code === "KeyW") throttle = 1;
      if (e.code === "ArrowDown" || e.code === "KeyS") throttle = -1;
      if (e.code === "Space") {
        e.preventDefault();
        doJump();
      }
    };
    const keyDownAt = new Map<string, number>();
    const keyUp = (e: KeyboardEvent) => {
      if (["ArrowUp", "KeyW", "ArrowDown", "KeyS"].includes(e.code)) throttle = 0;
      const dir = e.code === "ArrowLeft" || e.code === "KeyA" ? "L" : e.code === "ArrowRight" || e.code === "KeyD" ? "R" : null;
      if (!dir) return;
      const held = performance.now() - (keyDownAt.get(dir) ?? 0);
      keyDownAt.delete(dir);
      steerIn = 0;
      // a quick tap = one lane over, driven as a real swerve; a hold already steered
      if (held < 170 && !gameOver && !pausedRef.current && modeRef.current !== "passenger")
        setLane(dir === "L" ? lane - 1 : lane + 1);
    };
    // Mobile controls: TAP steers, HOLD (>220ms) accelerates, release coasts.
    // One thumb does everything · the launch-blocking gap on touch.
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    let holding = false;
    let downX = 0;
    let activePointers = 0;
    const tap = (e: PointerEvent) => {
      music.start(); // first gesture unlocks audio · idempotent
      engine.start(); // the motor comes alive on the same gesture
      if (gameOver || pausedRef.current) return;
      if (modeRef.current === "passenger") return; // autopilot · no touch steering
      activePointers++;
      if (activePointers >= 2) {
        // second finger down while riding = JUMP (keeps the lane)
        doJump();
        return;
      }
      downX = e.clientX;
      dragged = false;
      // hold LOW on the screen = brake, hold anywhere else = throttle
      const brake = e.clientY > window.innerHeight * 0.72;
      holdTimer = setTimeout(() => {
        if (dragged) return; // a drag is steering, not a throttle hold
        holding = true;
        throttle = brake ? -1 : 1;
      }, 220);
    };
    // DRAG to steer · the thumb IS the wheel: slide left/right and the car
    // swerves proportionally; lift and it straightens
    const move = (e: PointerEvent) => {
      if (activePointers < 1 || gameOver || pausedRef.current || modeRef.current === "passenger") return;
      const dx = e.clientX - downX;
      if (!dragged && Math.abs(dx) > 14) {
        dragged = true;
        if (holdTimer) clearTimeout(holdTimer);
        holdTimer = null;
        seekX = null;
      }
      if (dragged) steerIn = Math.max(-1, Math.min(1, dx / (window.innerWidth * 0.16)));
    };
    const tapUp = () => {
      activePointers = Math.max(0, activePointers - 1);
      if (holdTimer) clearTimeout(holdTimer);
      holdTimer = null;
      if (dragged) {
        dragged = false;
        steerIn = 0; // thumb lifted · the wheel straightens
      } else if (holding) {
        holding = false;
        throttle = 0; // released · coast
      } else if (!gameOver && !pausedRef.current) {
        // quick tap = one lane over, as a swerve
        if (downX < window.innerWidth / 2) setLane(lane - 1);
        else setLane(lane + 1);
      }
    };
    addEventListener("keydown", key);
    addEventListener("keyup", keyUp);
    renderer.domElement.addEventListener("pointerdown", tap);
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointerup", tapUp);
    renderer.domElement.addEventListener("pointercancel", tapUp);
    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.fov = fovFor(mount.clientWidth, mount.clientHeight); // keep car sensibly sized on rotate/resize
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      composer.setSize(mount.clientWidth, mount.clientHeight);
    };
    addEventListener("resize", onResize);

    /* ------------------------------- loop ------------------------------ */
    let last = performance.now();
    let hudAcc = 0;
    let raf = 0;
    // CURVED WORLD · patch every scene material with the view-space bend.
    // Materials appear over time (GLB swaps, spawns), sweep now and rarely.
    const patchBend = () => {
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (!m) return;
        for (const mat of Array.isArray(m) ? m : [m]) bendMaterial(mat);
      });
    };
    patchBend();
    let bendSweepAt = 0;
    const bendSeed = Math.random() * 1000;

    const loop = (t: number) => {
      if (disposed) return;
      raf = requestAnimationFrame(loop);
      let dt = Math.min(0.05, (t - last) / 1000 || 0.016);
      last = t;
      if (pausedRef.current) {
        engine.update(0, 0); // idle the motor down
        composer.render(); // hold the frame · world frozen, position flat
        return;
      }
      // near-miss slow-motion: the world dips to 45% speed for a beat
      if (slowT > 0) {
        slowT -= dt;
        dt *= 0.45;
      }
      // combo heat cools after the grace window; one crash zeroes it instantly
      comboT -= dt;
      if (comboT <= 0) combo = Math.max(1, combo - dt * 0.35);
      const flow = feed.flow;
      /* 📺 the caster never lets dead air run · every ~14s of silence in
         passenger, narrate the tape itself, and let the camera breathe:
         a slow lateral drift + gentle FOV swell, plus the market's lean
         steering the gaze. Manual modes keep the locked chase cam — the
         cinema is for the audience, the fixed cam is for the driver. */
      if (!(modeRef.current === "passenger" && broadcastRef.current)) dropWatermark();
      if (modeRef.current === "passenger" && broadcastRef.current) {
        ensureWatermark();
        if (Date.now() - castLastAt.current > 14_000 && castQ.current.length === 0 && !overRef.current) {
          const f = flow;
          pushCast(
            f > 0.45
              ? `▲ buyers pressing hard · flow +${f.toFixed(2)} · the road climbs with them`
              : f < -0.45
                ? `▼ sellers leaning in · flow ${f.toFixed(2)} · the autopilot rides the short side`
                : Math.abs(f) < 0.12
                  ? `〰 quiet tape · flow ${f >= 0 ? "+" : ""}${f.toFixed(2)} · the grid rests both sides and waits`
                  : `driftin' ${f > 0 ? "long" : "short"} · flow ${f >= 0 ? "+" : ""}${f.toFixed(2)} · nothing worth chasing yet`,
          );
        }
        const ct = t / 1000;
        const baseFov = fovFor(mount.clientWidth, mount.clientHeight);
        // hero-shot blend · eased in and out over the event window
        let hx = 0;
        let hf = 0;
        const remain = camEvt.until - Date.now();
        if (remain > 0) {
          const k = Math.sin((1 - remain / camEvt.dur) * Math.PI); // 0→1→0
          hx = camEvt.xBias * k;
          hf = camEvt.fovKick * k;
        }
        camera.position.x = Math.sin(ct * 0.11) * 2.1 + flow * 1.4 + hx;
        camera.position.y = 5.4 + Math.sin(ct * 0.07) * 0.5;
        camera.fov = baseFov + Math.sin(ct * 0.05) * 2.5 + hf;
        camera.updateProjectionMatrix();
      } else if (modeRef.current !== "passenger" && Math.abs(camera.position.x) > 0.01) {
        // hand the wheel back · the fixed chase cam, exactly as before
        camera.position.x = 0;
        camera.position.y = 5.4;
        camera.fov = fovFor(mount.clientWidth, mount.clientHeight);
        camera.updateProjectionMatrix();
      }

      // speed: mode + throttle driven. Turbo demands the throttle to rip up to
      // 120 (coasts down off-gas); Cruise glides itself at a calm ceiling so you
      // can just ride. Flow adds heat, crashes cost.
      const passengerMode = modeRef.current === "passenger";
      const cruiseMode = modeRef.current === "cruise" || passengerMode;
      if (passengerMode && lane !== 1) setLane(1); // autopilot keeps you centered
      const ceil = cruiseMode ? 74 : 120;
      speed += dt * 0.5 + Math.abs(flow) * dt * (cruiseMode ? 1.4 : 3);
      speed += throttle * (cruiseMode ? 8 : 28) * dt;
      if (throttle < 0) speed -= (cruiseMode ? 18 : 34) * dt; // brake bites
      if (!cruiseMode && throttle === 0) speed -= 7 * dt; // turbo coasts off-gas
      speed = Math.max(cruiseMode ? 34 : 30, Math.min(ceil, speed));
      if (crashT > 0) {
        crashT -= dt;
        speed = Math.max(28, speed - 90 * dt);
      }
      engine.update(Math.max(0, (speed - 28) / 92), throttle); // the motor sings with the ride
      // throttle-driven "leverage": faster in Turbo → bigger clip (hard-capped
      // in the engine). Cruise stays 1×. Push only on meaningful change.
      const lever = cruiseMode ? 1 : Math.max(1, Math.min(4, 1 + ((speed - 46) / 74) * 3));
      if (Math.abs(lever - lastLever) > 0.15) {
        lastLever = lever;
        setLeverRef?.current?.(lever);
      }
      // volume only accrues while POSITIONED (long/short lane) · flat earns
      // nothing, exactly like the real thing. Speed still builds while flat.
      if (lane !== 1 && !gameOver) score += speed * dt * 0.35;

      // buzz: narrate real market surges as they cross thresholds
      if (prevFlow < 0.5 && flow >= 0.5) {
        pushBuzz("🌍 world pulse (ETH) · buyers surging · right lane pays");
        pushFlash("⚡ BUYERS SURGING · RIGHT LANE (LONG) PAYS");
      }
      if (prevFlow > -0.5 && flow <= -0.5) {
        pushBuzz("🌍 world pulse (ETH) · sellers slamming · watch for trucks");
        pushFlash("🔻 SELLERS SLAMMING · LEFT LANE (SHORT) PAYS");
      }
      prevFlow = flow;

      // ---- cascade boss: extreme real flow → the volcano ERUPTS
      casCd -= dt;
      if (casT > 0) {
        casT -= dt;
        crater.intensity = 220 + Math.sin(t / 80) * 60;
        // caught in the wrong lane during the storm · it bleeds
        const wrongLane = casDir < 0 ? 2 : 0;
        if (lane === wrongLane && !gameOver) {
          casOK = false;
          score = Math.max(0, score - 40 * dt);
        }
        if (casT <= 0) {
          if (casOK && !gameOver) {
            score += 200;
            eruSurvived = true;
            bumpBounty("erupt", 1);
            bumpCombo(0.8);
            sfx.draft();
            doPop("🏆 ERUPTION SURVIVED +$200", "#ffc15e");
          } else if (!gameOver) {
            combo = 1; // burned · the chain breaks
            doPop("☠ BURNED BY THE ERUPTION", "#ff4d5e");
          }
          casCd = 35 + Math.random() * 25;
        }
      } else if (casCd <= 0 && !gameOver) {
        if (Math.abs(flow) > 0.72) casHot += dt;
        else casHot = 0;
        if (casHot > 0.8) {
          casT = 5;
          casHot = 0;
          casOK = true;
          casDir = flow > 0 ? 1 : -1;
          sfx.cascade();
          pushBuzz(casDir < 0 ? "🌋 ERUPTION · liquidation cascade!" : "🌋 ERUPTION · short squeeze!");
          doPop(
            casDir < 0 ? "🌋 ERUPTION · dodge the SHORT-side lava!" : "🌋 ERUPTION · dodge the LONG-side lava!",
            "#ff5a24");
        }
      }

      // underglow mirrors the position: green long / blue short / dim flat
      (glow.material as THREE.MeshBasicMaterial).color.set(
        lane === 2 ? 0x27f2a4 : lane === 0 ? 0x6ab8ff : 0x555f66);
      (glow.material as THREE.MeshBasicMaterial).opacity = lane === 1 ? 0.18 : 0.4;

      // world scroll
      roadTex.offset.y -= (speed * dt) / 13;
      // light poles sweep past · recycled far ahead
      for (const p of poles) {
        p.position.z += speed * dt;
        if (p.position.z > 14) p.position.z -= 16 * 32;
      }
      for (const r of rocks) {
        r.position.z += speed * dt;
        if (r.position.z > 20) r.position.z -= 440;
      }
      // scene segments scroll + rotate · the road travels through places
      for (const c of segCrystals) {
        c.position.z += speed * dt;
        if (c.position.z > 16) c.position.z -= 470;
      }
      for (const p2 of segPoles) {
        p2.position.z += speed * dt;
        if (p2.position.z > 14) p2.position.z -= 10 * 48;
      }
      for (const rp of rangeProps) {
        rp.position.z += speed * dt;
        if (rp.position.z > 20) rp.position.z -= 540;
      }
      for (const b of corridorBuildings) {
        b.position.z += speed * dt;
        if (b.position.z > 26) b.position.z -= 14 * 36;
      }
      for (const f of furniture) {
        f.position.z += speed * dt;
        if (f.position.z > f.userData.wrapAt) f.position.z -= f.userData.span;
      }
      segT += dt;
      if (!segAnnounced && segT > 2.5) {
        segAnnounced = true;
        pushBuzz(runMood.announce); // name the weather…
        applySegment(segIdx, true); // …and the opening place, a beat into the run
      }
      if (segT > segNext) {
        segT = 0;
        segNext = 45; // first change comes at 20s, the rest every 45s
        segIdx = (segIdx + 1) % SEGMENTS.length;
        applySegment(segIdx, true);
      }
      // embers rise
      const ep = embers.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < emberN; i++) {
        let y = ep.getY(i) + dt * (6 + (i % 5));
        if (y > 165) y = 88;
        ep.setY(i, y);
      }
      ep.needsUpdate = true;
      // volcano + sky breathe with real flow
      const surge = 0.4 + Math.min(1, Math.abs(flow) * 1.5) * 0.9;
      if (casT <= 0) crater.intensity = 60 * surge + Math.sin(t / 300) * 8;
      // the road SWEEPS · slow drifting curvature (view-space, gameplay
      // stays straight), long S-curves with gentle rises and dips
      // a bias term keeps the road ALMOST ALWAYS curving one way or the other
      // (pure sines cross zero and read as "still straight", user-verified)
      /* the road is a PATH now: the eye sees the bend ~70 units ahead, the
         car feels the curvature under it (centrifugal push in the drive
         model), and the regime director decides what kind of road is next */
      void bendSeed;
      odo += speed * dt;
      path.market = Math.min(1, Math.abs(flow));
      kNow = path.curvatureAt(odo);
      const kAhead = path.curvatureAt(odo + 70);
      /* the FORCE uses the full curvature; the EYE gets it capped. Past
         ~0.0022 the z² bend folds the far road off-screen and the lean below
         tips the whole world — a switchback should feel sharp, not tumble. */
      const kSeen = Math.max(-0.0022, Math.min(0.0022, kAhead));
      BEND_UNIFORMS.uBend.value += (kSeen - BEND_UNIFORMS.uBend.value) * Math.min(1, dt * 3);
      BEND_UNIFORMS.uDip.value += (path.hillAt(odo + 70) - BEND_UNIFORMS.uDip.value) * Math.min(1, dt * 2);
      // 🌦 LIVE WEATHER · the sky drifts between moods mid-run, and events land
      const mk = Math.min(1, dt * 0.5);
      moodCur.sky[0] += (moodTgt.skyMul[0] - moodCur.sky[0]) * mk;
      moodCur.sky[1] += (moodTgt.skyMul[1] - moodCur.sky[1]) * mk;
      moodCur.sky[2] += (moodTgt.skyMul[2] - moodCur.sky[2]) * mk;
      moodCur.hemi += (moodTgt.hemiMul - moodCur.hemi) * mk;
      moodCur.star += (moodTgt.starAlpha - moodCur.star) * mk;
      moodCur.cap += (moodTgt.skyCap - moodCur.cap) * mk;
      hemi.intensity = 0.9 * moodCur.hemi;
      starMat.opacity = moodCur.star;
      /* ⛈ storm frame · rain streaks down and wraps, the road turns to glass,
         lightning whites the sky for a few frames; all of it eases in and out */
      {
        const storm = stormT > 0;
        if (storm) stormT -= dt;
        const wet = storm ? Math.min(1, (34 - stormT) / 3) : 0;
        rainMat.opacity += ((storm ? 0.85 : 0) - rainMat.opacity) * Math.min(1, dt * 1.5);
        if (rainMat.opacity > 0.02) {
          const pa = rainGeo.getAttribute("position") as THREE.BufferAttribute;
          for (let i = 0; i < rainN; i++) {
            let y = pa.getY(i) - (52 + (i % 7) * 4) * dt;
            if (y < 0) y += 40;
            pa.setY(i, y);
            pa.setZ(i, pa.getZ(i) + speed * dt * 0.6 > 4 ? -160 : pa.getZ(i) + speed * dt * 0.6);
          }
          pa.needsUpdate = true;
          rainPts.position.x = camera.position.x;
        }
        roadMat.roughness += ((wet ? 0.16 : dryRough) - roadMat.roughness) * Math.min(1, dt * 1.2);
        roadMat.envMapIntensity += ((wet ? 2.4 : dryEnv) - roadMat.envMapIntensity) * Math.min(1, dt * 1.2);
        const fogNearTgt = storm ? 34 : 60;
        const fogObj = scene.fog as THREE.Fog; // linear fog · constructed above
        fogObj.near += (fogNearTgt - fogObj.near) * Math.min(1, dt * 0.8);
        if (storm) {
          nextFlash -= dt;
          if (nextFlash <= 0) {
            flashT = 0.09 + Math.random() * 0.06;
            nextFlash = 2.5 + Math.random() * 6;
          }
        }
        if (flashT > 0) {
          flashT -= dt;
          const f = Math.max(0, flashT / 0.15);
          moon.intensity = 0.7 + 7 * f;
          hemi.intensity = 0.9 * moodCur.hemi + 2.2 * f;
        } else if (moon.intensity !== 0.7) moon.intensity += (0.7 - moon.intensity) * Math.min(1, dt * 6);
      }
      if (t > moodNextAt) {
        moodNextAt = t + 130_000 + Math.random() * 90_000;
        const ids = Object.keys(MOODS) as (keyof typeof MOODS)[];
        const next = MOODS[ids[Math.floor(Math.random() * ids.length)]];
        if (next !== moodTgt) {
          moodTgt = next;
          lightWithSky((Object.keys(MOODS) as MoodId[]).find((k) => MOODS[k] === next) ?? "night");
          pushBuzz(next.announce);
          pushFlash(next.announce.toUpperCase());
        }
      }
      if (!weatherKind && t > weatherNextAt) {
        const stormOdds = 0.25 + Math.min(0.5, Math.abs(flow) * 0.9);
        weatherKind =
          Math.random() < stormOdds
            ? "storm"
            : (["tornado", "meteors", "eclipse"] as const)[Math.floor(Math.random() * 3)];
        weatherT = weatherKind === "tornado" ? 26 : weatherKind === "meteors" ? 9 : weatherKind === "storm" ? 34 : 11;
        if (weatherKind === "storm") {
          stormT = weatherT;
          nextFlash = 2 + Math.random() * 4;
          pushBuzz("⛈ STORM FRONT · rain, lightning, a slick road — the tape is frantic");
          pushFlash("⛈ STORM FRONT · SLICK ROAD");
        }
        if (weatherKind === "tornado") {
          funnel.visible = true;
          funnel.position.x = Math.random() < 0.5 ? -190 : 190;
          funnel.userData.dir = funnel.position.x > 0 ? -1 : 1;
          pushBuzz("🌪 TORNADO on the horizon · it can't touch the road, watch it walk");
          pushFlash("🌪 TORNADO CROSSING THE RANGE");
        } else if (weatherKind === "meteors") {
          for (let i = 0; i < meteorN; i++) {
            meteorPos[i * 3] = (Math.random() - 0.5) * 500;
            meteorPos[i * 3 + 1] = 180 + Math.random() * 120;
            meteorPos[i * 3 + 2] = -500;
          }
          meteorGeo.attributes.position.needsUpdate = true;
          meteorMat.opacity = 1;
          pushBuzz("☄️ meteor shower · look up");
        } else {
          pushBuzz("🌑 ECLIPSE · the light is leaving");
          pushFlash("🌑 ECLIPSE");
        }
      }
      if (weatherKind) {
        weatherT -= dt;
        if (weatherKind === "tornado") {
          funnel.position.x += (funnel.userData.dir as number) * dt * 14;
          funnel.rotation.y += dt * 6;
          funnel.children.forEach((ring, i) => {
            ring.position.x = Math.sin(t / 300 + i) * (1.2 + i * 0.35);
          });
        } else if (weatherKind === "meteors") {
          for (let i = 0; i < meteorN; i++) {
            meteorPos[i * 3] -= dt * 90;
            meteorPos[i * 3 + 1] -= dt * 60;
          }
          meteorGeo.attributes.position.needsUpdate = true;
          meteorMat.opacity = Math.min(1, weatherT / 2);
        } else {
          // eclipse pulls harder than the mood lerp · light collapses, stars flare
          const ek = Math.min(1, dt * 2);
          moodCur.hemi += (0.22 - moodCur.hemi) * ek;
          moodCur.cap += (0.3 - moodCur.cap) * ek;
          starMat.opacity = Math.min(1, starMat.opacity + dt * 1.5);
        }
        if (weatherT <= 0) {
          if (weatherKind === "tornado") funnel.visible = false;
          if (weatherKind === "meteors") meteorMat.opacity = 0;
          if (weatherKind === "eclipse") pushBuzz("🌤 the light returns");
          if (weatherKind === "storm") { stormT = 0; pushBuzz("🌦 the storm passes · the road dries"); }
          weatherKind = null;
          weatherNextAt = t + 130_000 + Math.random() * 110_000;
        }
      }
      if (t > bendSweepAt) {
        bendSweepAt = t + 2500; // catch late-arriving materials (GLBs, spawns)
        patchBend();
      }
      // the rider picking a venue outranks any portal tour, instantly
      if (lastPropWorld !== worldRef.current) {
        lastPropWorld = worldRef.current;
        worldTour = null;
      }
      const effWorld = worldTour ?? worldRef.current;
      const W = WORLDS[effWorld] ?? WORLDS.hotstuff;
      if (lastWorld !== effWorld) {
        lastWorld = effWorld;
        hemi.color.setHex(W.hemiSky);
        hemi.groundColor.setHex(W.hemiGround);
        moon.color.setHex(W.moon);
        // the road-edge rails were hardcoded to Hyperliquid's teal regardless
        // of world · every venue now gets its own glow (ember/teal/violet)
        railMat.emissive.setHex(W.rail);
        rockMat.color.setHex(W.rock); // roadside hills take the world's stone
        volcanoGroup.visible = effWorld === "hotstuff";
        hyperGroup.visible = effWorld === "hyperliquid";
        lighterGroup.visible = effWorld === "lighter";
        perplGroup.visible = effWorld === "perpl";
        extGroup.visible = effWorld === "extended";
        ondoGroup.visible = effWorld === "ondo";
        phoenixGroup.visible = effWorld === "phoenix";
      }
      // hypergrid ring slowly turns and breathes with flow
      if (hyperGroup.visible) {
        ring.rotation.z += dt * 0.15;
        ringInner.rotation.z -= dt * 0.25;
        ringLight.intensity = 40 + Math.min(1, Math.abs(flow) * 1.5) * 40;
      }
      // beacon sweep · the tape's urgency sets the lighthouse tempo
      if (lighterGroup.visible) {
        beam.rotation.y += dt * (0.35 + Math.min(1, Math.abs(flow) * 1.5) * 0.9);
        prism.rotation.y += dt * 0.2;
        beaconLight.intensity = 34 + Math.min(1, Math.abs(flow) * 1.5) * 30;
      }
      // monoliths levitate on slow offset phases · the violet moon holds still
      if (perplGroup.visible) {
        for (let i = 0; i < perplMonos.length; i++) {
          perplMonos[i].position.y =
            (perplMonos[i].userData.baseY as number) + Math.sin(t / 1400 + i * 1.3) * 1.6;
        }
        perplLight.intensity = 30 + Math.min(1, Math.abs(flow) * 1.5) * 26;
      }
      // the index ticker slides across the skyline · brighter when the tape runs
      if (extGroup.visible) {
        ticker.position.x = ((t / 26) % 190) - 95;
        extLight.intensity = 28 + Math.min(1, Math.abs(flow) * 1.5) * 34;
      }
      // harbor swells roll on staggered phases · the sea breathes with flow
      if (ondoGroup.visible) {
        for (let i = 0; i < ondoSwells.length; i++) {
          ondoSwells[i].position.y = -8 + Math.sin(t / 1500 + i * 1.4) * 5;
        }
        ondoLight.intensity = 30 + Math.min(1, Math.abs(flow) * 1.5) * 30;
      }
      // the firebird glides lane to lane, wings on a slow beat, and banks
      // to face wherever it's heading
      if (phoenixGroup.visible) {
        bird.position.x = Math.sin(t / 9000) * 85;
        bird.position.y = 76 + Math.sin(t / 2600) * 6;
        bird.rotation.y = Math.cos(t / 9000) >= 0 ? 0 : Math.PI;
        const flap = Math.sin(t / 380) * 0.42;
        wingL.rotation.x = flap;
        wingR.rotation.x = -flap;
        birdLight.intensity = 34 + Math.min(1, Math.abs(flow) * 1.5) * 26;
      }
      const bearTint = Math.max(0, -flow);
      (scene.background as THREE.Color).setRGB(
        Math.min(moodCur.cap, W.base[0] * moodCur.sky[0] + bearTint * 0.13),
        Math.min(moodCur.cap * 0.92, W.base[1] * moodCur.sky[1] + Math.max(0, flow) * 0.08),
        Math.min(moodCur.cap, W.base[2] * moodCur.sky[2]));
      scene.fog!.color.copy(scene.background as THREE.Color);

      // player
      if (jumpCd > 0) jumpCd -= dt;
      if (jumpT > 0) jumpT -= dt;
      const airborne = jumpT > 0;
      const jumpPhase = airborne ? 1 - jumpT / JUMP_DUR : 0; // 0→1 across the hop
      /* ═══ THE DRIVE MODEL ═══ a wheel with lag, lateral momentum, grip,
         the road's centrifugal push, and rails you can actually hit. */
      dangerBeaconMat.visible = Math.sin(performance.now() / 110) > -0.2;
      if (modeRef.current === "passenger") {
        // the autopilot DRIVES, every frame: bends push the car outward and
        // the old once-per-lane-change nudge let it drift into traffic
        steerIn = 0;
        if (seekX == null && Math.abs(carX - LANES[1]) > 0.15) seekX = LANES[1];
      }
      let steerTarget = steerIn;
      if (seekX != null) {
        // tap-to-lane: a PD controller drives the wheel so the car ARCS over
        const err = seekX - carX;
        steerTarget = Math.max(-1, Math.min(1, err * 0.55 - carVx * 0.09));
        if (Math.abs(err) < 0.12 && Math.abs(carVx) < 0.6) { seekX = null; steerTarget = 0; }
      }
      steer += (steerTarget - steer) * Math.min(1, dt * 11); // the wheel has weight
      const centrifugal = -kNow * speed * speed * 1.26; // a right bend pushes you LEFT
      carVx += (steer * 40 + centrifugal) * dt;
      carVx -= carVx * Math.min(1, dt * 5.2); // tyre grip · a hold arcs across ~1.5 lanes/s, not into the rail
      carX += carVx * dt;
      if (railHitCd > 0) railHitCd -= dt;
      if (carX > ROAD_HALF || carX < -ROAD_HALF) {
        carX = Math.max(-ROAD_HALF, Math.min(ROAD_HALF, carX));
        if (Math.abs(carVx) > 1.5 && railHitCd <= 0) {
          railHitCd = 0.5;
          speed = Math.max(28, speed - 6);
          shakeT = 0.22;
          sfx.dodge();
          doPop("⚡ RAIL SCRAPE · keep it between the lines", "#ffd166");
        }
        carVx *= -0.35; // the rail throws you back in
      }
      player.position.x = carX;
      const nl = laneFromX();
      if (nl !== lane) commitLane(nl);
      const latN = Math.max(-1, Math.min(1, carVx / 9));
      // bank INTO the turn, and the nose points where the car is really going
      const targetRoll = -latN * (0.26 + Math.min(0.1, speed / 900));
      player.rotation.z += (targetRoll - player.rotation.z) * Math.min(1, dt * 10);
      const heading = Math.atan2(carVx, Math.max(20, speed));
      player.rotation.y += (-heading * 2.2 - player.rotation.y) * Math.min(1, dt * 9);
      player.position.y = airborne
        ? Math.sin(jumpPhase * Math.PI) * 2.6 // the hop arc
        : Math.sin(t / 90) * 0.02;
      player.rotation.x = airborne ? -Math.sin(jumpPhase * Math.PI) * 0.18 : 0;
      camera.position.x += (carX * 0.5 - camera.position.x) * Math.min(1, dt * 4);
      if (shakeT > 0) shakeT -= dt;
      if (crashT > 0 || shakeT > 0) {
        camera.position.x += (Math.random() - 0.5) * 0.3;
        camera.position.y = 5.4 + (Math.random() - 0.5) * 0.2;
      } else camera.position.y = 5.4;
      // CORNERING FEEL · the camera LEANS into the road's live curvature (roll)
      // and the whole view swings with it (yaw). The z² world-bend alone reads
      // as a distant sway ("I don't see the curves"), the lean is what makes a
      // bend FELT from the driver's seat, OutRun-style. Purely visual: lanes,
      // physics and the car's own x are untouched.
      /* roll ONLY. The yaw swung the whole view sideways, so the rider's
         aim and the lanes disagreed at speed ("everything is off") — the
         z²-bend now starts 90m out, so nothing inside decision range ever
         shifts, and the tilt alone carries the cornering feel honestly. */
      const lean = -BEND_UNIFORMS.uBend.value;
      // ≤ ~8° of roll at the tightest visible bend · cornering feel, not vertigo
      const leanTgt = Math.max(-0.14, Math.min(0.14, lean * 60));
      camRoll += (leanTgt - camRoll) * Math.min(1, dt * 2.2);
      camYaw += (0 - camYaw) * Math.min(1, dt * 2.2);
      camera.rotation.z = camRoll;
      camera.rotation.y = camBaseY + camYaw;

      // rivals
      rivalCd -= dt;
      if (rivalCd <= 0 && !gameOver) {
        spawnRival(flow);
        rivalCd = 1.1 + Math.random() * 1.5 - Math.min(0.5, Math.abs(flow) * 0.5);
      }
      for (const rv of rivals) {
        rv.group.position.z += (speed - rv.speed) * dt;
        const dz = rv.group.position.z - player.position.z;
        if (!rv.scored && Math.abs(dz) < 2.6) {
          if (rv.lane === lane && jumpT > 0 && rv.hostile) {
            // cleared it mid-air · lane, position and maker quotes all kept
            rv.scored = true;
            nearMisses++;
            bumpBounty("nearmiss", 1);
            const gain = Math.round(100 * combo);
            score += gain;
            bumpCombo(0.5);
            sfx.coin();
            doPop(`🦘 JUMPED IT +$${gain}`, "#ffd24a");
          } else if (rv.lane === lane) {
            rv.scored = true;
            if (rv.hostile && modeRef.current === "passenger") {
              // THE AUTOPILOT NEVER CRASHES. A passenger crash used to flatten
              // the real position at TAKER cost — the only taker fill in a
              // 10-fill BTC session was exactly that — and then the run-over
              // card called the whole ride practice. The autopilot dodges.
              nearMisses++;
              doPop("🛋 AUTOPILOT DODGED IT", "#a9a3ff");
            } else if (rv.hostile) {
              crashT = 1.1;
              wrecks++;
              combo = 1; // the chain breaks
              score = Math.max(0, score - 120);
              sfx.crash();
              doPop(
                wrecks >= 3 ? "💥 WRECKED · RUN OVER" : `💥 CRASHED · SPUN OUT (${wrecks}/3)`,
                "#ff4d5e");
              setLane(1); // a crash closes the real position · the safety reflex
              flattenRef?.current?.();
              if (navigator.vibrate) navigator.vibrate(80);
              if (wrecks >= 3) finishRun();
            } else {
              const gain = Math.round(80 * combo);
              score += gain;
              bumpCombo(0.4);
              sfx.draft();
              doPop(`💨 DRAFTED +$${gain}${combo > 1.4 ? ` ×${combo.toFixed(1)}` : ""}`, "#27f2a4");
            }
          } else if (!rv.hostile && Math.abs(dz) < 1.4) {
            rv.scored = true; // near-miss on a green still pays a little
            score += 25;
          }
        }
      }
      for (let i = rivals.length - 1; i >= 0; i--) {
        const rv = rivals[i];
        // dodge feedback: you steered out of a hazard's lane and it passed clean
        if (!rv.scored && rv.hostile && rv.group.position.z > 4) {
          rv.scored = true;
          const sinceSwitch = performance.now() - laneChangeT;
          if (rv.lane === prevLane && sinceSwitch < 700) {
            // NEAR MISS · you shaved it at the last instant. Slow-mo + big pay.
            nearMisses++;
            bumpBounty("nearmiss", 1);
            const gain = Math.round(120 * combo);
            score += gain;
            bumpCombo(0.6);
            slowT = 0.5;
            sfx.dodge();
            sfx.coin();
            doPop(`⚡ NEAR MISS +$${gain}`, "#ffd24a");
            if (navigator.vibrate) navigator.vibrate(30);
          } else if (rv.lane === prevLane && sinceSwitch < 2200) {
            const gain = Math.round(40 * combo);
            score += gain;
            bumpCombo(0.25);
            sfx.dodge();
            doPop(`✓ DODGED · loss avoided +$${gain}`, "#d8e4de");
          }
        }
        if (rv.group.position.z > 24) {
          scene.remove(rv.group);
          rivals.splice(i, 1);
        }
      }

      // coins
      coinCd -= dt;
      if (coinCd <= 0 && !gameOver) {
        spawnCoins(flow);
        coinCd = 2.4 + Math.random() * 2 - Math.min(1, Math.abs(flow)); // hotter flow, more coins
      }
      goldCd -= dt;
      if (goldCd <= 0 && !gameOver) {
        spawnStampede();
        goldCd = 55 + Math.random() * 70; // next one: who knows
      }

      // ---- MARKET FAUNA · the world is alive and every creature is a signal
      herdCd -= dt;
      gemCd -= dt;
      portalCd -= dt;
      faunaRunT += dt;
      // the OPENING encounter · every run meets the world early
      if (!herdOpenerDone && faunaRunT > 8 && !gameOver) {
        herdOpenerDone = true;
        spawnHerd(flow >= 0 ? "bull" : "bear");
        pushBuzz(
          flow >= 0
            ? "🐂 the herd runs this road · ride the LONG side with them"
            : "🐻 the pack hunts this road · ride the SHORT side with them");
        herdCd = 14;
      }
      // first-gem guarantee · the treasure layer must be SEEN to be chased
      if (!gemEver && faunaRunT > 45 && !gameOver) {
        spawnGem(flow || 0.6);
        gemCd = 25;
      }
      if (herdCd <= 0 && !gameOver) {
        // the same real thresholds as the buzz feed: a surge births the herd
        if (faunaPrevFlow < 0.5 && flow >= 0.5) {
          spawnHerd("bull");
          herdCd = 18;
        } else if (faunaPrevFlow > -0.5 && flow <= -0.5) {
          spawnHerd("bear");
          herdCd = 18;
        }
      }
      // whale print = a real jerk in the flow between frames → one gem
      if (gemCd <= 0 && !gameOver && Math.abs(flow - faunaPrevFlow) > 0.5) {
        spawnGem(flow);
        gemCd = 25 + Math.random() * 20;
      }
      faunaPrevFlow = flow;
      // regime flip (calm ⇄ hot, sustained) → the portal opens
      const hotNow = Math.abs(flow) > 0.55;
      if (hotNow === regimeHot) regimeHold = 0;
      else {
        regimeHold += dt;
        if (regimeHold > 2.5) {
          regimeHot = hotNow;
          regimeHold = 0;
          if (portalCd <= 0 && !gameOver) {
            spawnPortal(regimeHot);
            portalCd = 60;
          }
        }
      }
      for (let i = fauna.length - 1; i >= 0; i--) {
        const b = fauna[i];
        b.group.position.z -= b.speedDelta * dt; // + charges ahead · − drifts past
        // gallop: diagonal leg pairs + a body bob, faster stride for the charge
        const stride = b.kind === "bull" ? 11 : 6;
        const mixer = b.group.userData.mixer as THREE.AnimationMixer | undefined;
        if (mixer) mixer.update(dt); // the rigged bull gallops on its own clip
        const legs = b.group.userData.legs as THREE.Mesh[];
        for (let li = 0; li < legs.length; li++) {
          legs[li].rotation.x = Math.sin((t / 1000) * stride + b.phase + (li === 1 || li === 2 ? Math.PI : 0)) * (b.kind === "bull" ? 0.6 : 0.38);
        }
        if (!mixer) b.group.position.y = Math.abs(Math.sin((t / 1000) * stride + b.phase)) * (b.kind === "bull" ? 0.14 : 0.07);
        const dz = b.group.position.z - player.position.z;
        // riding the lane the fauna endorses = riding WITH the real flow
        if (!b.scored && Math.abs(dz) < 4 && lane === b.side && !gameOver) {
          b.scored = true;
          herdRides++;
          const gain = Math.round(60 * combo);
          score += gain;
          bumpCombo(0.3);
          sfx.draft();
          doPop(
            b.kind === "bull" ? `🐂 RUNNING WITH THE BULLS +$${gain}` : `🐻 PROWLING WITH THE PACK +$${gain}`,
            b.kind === "bull" ? "#27f2a4" : "#6ab8ff");
        }
        if (b.group.position.z < -190 || b.group.position.z > 26) {
          scene.remove(b.group);
          fauna.splice(i, 1);
        }
      }
      for (let i = gems.length - 1; i >= 0; i--) {
        const gm = gems[i];
        gm.mesh.position.z += speed * dt;
        gm.mesh.rotation.y += dt * 2.2;
        gm.mesh.position.y = 1.5 + Math.sin(t / 260 + i) * 0.25;
        const dz = gm.mesh.position.z - player.position.z;
        if (!gm.taken && Math.abs(dz) < 2.4 && lane === gm.lane && !gameOver) {
          gm.taken = true;
          gemsGot++;
          const gain = Math.round(250 * combo);
          score += gain;
          bumpCombo(0.8);
          sfx.coin();
          doPop(`💎 WHALE GEM +$${gain}`, "#a9a3ff");
          bumpBounty("gems", 1);
          scene.remove(gm.mesh);
          gems.splice(i, 1);
          continue;
        }
        if (gm.mesh.position.z > 16) {
          scene.remove(gm.mesh);
          gems.splice(i, 1);
        }
      }
      if (portal) {
        portal.group.position.z += speed * dt;
        (portal.group.children[0] as THREE.Mesh).rotation.z += dt * 0.6;
        const dz = portal.group.position.z - player.position.z;
        if (!portal.used && Math.abs(dz) < 2 && !gameOver) {
          portal.used = true;
          portalStreak = Math.min(portalStreak + 1, 4);
          const portalPay = 150 * portalStreak;
          score += portalPay;
          slowT = 0.4; // a breath as you cross regimes
          sfx.draft();
          doPop(
            portalStreak > 1
              ? `🌀 REGIME CHAIN ×${portalStreak} +$${portalPay}`
              : `🌀 REGIME CROSSED +$${portalPay}`,
            "#ff7a1a");
          if (portalStreak > 1) {
            bumpCombo(0.5);
            hlRef.current?.highlight(`regime-chain-x${portalStreak}`);
          }
          // the door opens onto another venue's road · scenery only
          {
            const here = worldTour ?? worldRef.current;
            const options = (Object.keys(WORLDS) as (keyof typeof WORLDS)[]).filter((w) => w !== here);
            worldTour = options[Math.floor(Math.random() * options.length)] as WorldId;
            const label = (WORLDS[worldTour as keyof typeof WORLDS] ?? WORLDS.hotstuff).label;
            pushBuzz(`🌀 the portal opened onto ${label} · a tour through the aggregator — scenery only, your driving and any live trades stay put`);
          }
        }
        if (portal.group.position.z > 14) {
          scene.remove(portal.group);
          portal = null;
        }
      }

      dist += (speed * 3 * dt) / 3600; // km at displayed speed

      // 👻 ghost race · sample my pace, place the rival at the live delta
      ghostRunT += dt;
      ghostSampleCd -= dt;
      if (ghostSampleCd <= 0 && !gameOver) {
        ghostSampleCd = 2;
        if (ghostSamples.length < 400) ghostSamples.push([ghostRunT, dist]);
      }
      if (ghostBest && !gameOver) {
        const gd = ghostKmAt(ghostRunT) - dist; // km · positive = ghost ahead
        ghostDeltaM = Math.round(gd * 1000);
        ghostCar.position.z = Math.max(-150, Math.min(9, -gd * 900));
        // dead-heat = the ghost sits INSIDE the player (a glowing shell over
        // the car) · only materialize once it's meaningfully ahead or behind
        ghostCar.visible = Math.abs(ghostCar.position.z) > 6;
        ghostCar.position.x = 0;
        ghostCar.position.y = Math.sin(t / 140) * 0.03;
        if (!ghostPassed && gd <= 0 && ghostRunT > 5) {
          ghostPassed = true;
          score += 150;
          bumpCombo(0.3);
          sfx.draft();
          doPop("👻 AHEAD OF YOUR BEST +$150", "#a9a3ff");
        }
      } else {
        ghostDeltaM = null;
        ghostCar.visible = false;
      }
      // mission: continuous hold in one POSITIONED lane (center doesn't count)
      if (lane !== 1 && lane === lastHoldLane) laneHoldT += dt;
      else {
        laneHoldT = 0;
        lastHoldLane = lane;
      }
      // mission completion · one bounty per run
      if (!mission.done && !gameOver) {
        const hit =
          mission.type === "coins"
            ? coinsGot >= mission.target
            : mission.type === "km"
              ? dist >= mission.target
              : mission.type === "nearmiss"
                ? nearMisses >= mission.target
                : mission.type === "hold"
                  ? laneHoldT >= mission.target
                  : mission.type === "fauna"
                    ? herdRides >= mission.target
                    : mission.type === "gem"
                      ? gemsGot >= mission.target
                      : eruSurvived;
        if (hit) {
          mission.done = true;
          score += 400;
          bumpCombo(1);
          sfx.draft();
          sfx.coin();
          doPop("🎯 MISSION COMPLETE +$400", "#ffd24a");
          setMissionTxt(`✓ ${mission.txt} · done!`);
        }
      }
      for (const c of coins) {
        c.mesh.position.z += speed * dt;
        c.mesh.rotation.y += dt * 5;
        if (!c.taken && c.lane === lane && Math.abs(c.mesh.position.z - player.position.z) < 1.6) {
          c.taken = true;
          c.mesh.visible = false;
          coinsGot += c.gold ? 5 : 1;
          score += Math.round((c.gold ? 75 : 15) * combo);
          bumpCombo(c.gold ? 0.3 : 0.12);
          sfx.coin();
          if (c.gold && Math.random() < 0.25) doPop("🐂 +5 GOLD", "#ffd24a");
        }
      }
      for (let i = coins.length - 1; i >= 0; i--) {
        if (coins[i].mesh.position.z > 24 || coins[i].taken) {
          scene.remove(coins[i].mesh);
          coins.splice(i, 1);
        }
      }

      hudAcc += dt;
      if (hudAcc > 0.12) {
        hudAcc = 0;
        setHud({
          score: Math.round(score),
          coins: coinsGot,
          speed: Math.round(speed * 3),
          flow,
          crashed: crashT > 0,
          lane,
          wrecks,
          lever,
          km: Math.round(dist * 10) / 10,
          combo: Math.round(combo * 10) / 10,
          thr: throttle,
          ghost: ghostDeltaM,
        });
        const r = realRef?.current;
        if (r) {
          setReal(r);
          // receipt for every REAL fill, in-world · trades are never invisible
          if (r.last && r.last !== lastFillSeen) {
            lastFillSeen = r.last;
            sfx.fill();
            if (r.last.includes("⚡ MAKER")) {
              // the cheap fill · celebrate it in gold so cruisers learn the
              // reward organically (rebate offsets the fee, ~4× cheaper)
              sfx.coin();
              doPop("⚡ MAKER FILL · rebate earned!", "#ffd24a");
            } else {
              doPop(`● REAL ${r.last}`, r.last.startsWith("SHORT") ? "#6ab8ff" : "#27f2a4");
            }
            // your own exchange events belong in the feed, not just a pop, // the lower-left log now narrates YOUR trades alongside the world
            pushBuzz(`● your fill · ${r.asset ?? ""} ${r.last}`);
          }
          // wins celebrated individually · even while the total is red
          if (r.pnl - lastPnlSeen > 0.01) {
            doPop(`💚 +$${(r.pnl - lastPnlSeen).toFixed(2)} captured`, "#27f2a4");
            sfx.coin();
          }
          lastPnlSeen = r.pnl;
          // club crossing: career volume ticks over a milestone MID-RIDE · the
          // flywheel's celebrated moment (play → volume → club → play more)
          const careerTotal = careerVolBase.current + r.volume;
          const crossed = CLUBS.find((c) => prevCareerTotal < c && careerTotal >= c);
          if (crossed) {
            sfx.coin();
            doPop(`🏁 ${fmtClub(crossed)} VOLUME CLUB UNLOCKED`, "#ffd24a");
            pushBuzz(`🏁 you just joined the ${fmtClub(crossed)} club · lifetime real volume`);
            const paint = PAINTS.find((p) => p.club === crossed);
            if (paint) pushBuzz(`🎨 NEW PAINT UNLOCKED: ${paint.name} · tap 🎨 to wear it`);
          }
          prevCareerTotal = careerTotal;
        }
      }
      composer.render();
    };
    raf = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      removeEventListener("keydown", key);
      removeEventListener("keyup", keyUp);
      renderer.domElement.removeEventListener("pointerup", tapUp);
      renderer.domElement.removeEventListener("pointercancel", tapUp);
      removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
      if (modeRef.current !== "passenger") flattenRef?.current?.(); // leaving the road closes any real position · passenger keeps farming, the cockpit still shows STOP
      music.stop();
      engine.stop();
      feed.stop();
      composer.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
    // refs are stable across the session; scene boots once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[60] bg-ink">
      <div ref={mountRef} className="absolute inset-0 touch-none" />
      {/* HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4 pt-[max(12px,env(safe-area-inset-top))]">
        {/* ml clears the phone-only exit door pinned at left-3 */}
        <div className="ml-[52px] inline-block rounded-lg border border-hairline bg-ink/80 px-2.5 py-1.5 backdrop-blur-md shadow-[0_6px_24px_rgba(0,0,0,.5)] min-[640px]:ml-0 min-[640px]:rounded-xl min-[640px]:px-3.5 min-[640px]:py-2.5">
          {armed && real.fills > 0 ? (
            <>
              <div className="flex items-center gap-1.5 whitespace-nowrap text-[11px] uppercase tracking-[0.1em] text-chart">
                <span className="h-1.5 w-1.5 rounded-full bg-chart shadow-[0_0_6px_var(--chart)]" />
                real volume
              </div>
              <div className="font-telemetry text-xl min-[640px]:text-3xl font-extrabold text-chart">
                ${Math.round(real.volume).toLocaleString()}
              </div>
              {(() => {
                // ONE net, fees counted once · on Arcus, Lighter and Phoenix the
                // pnl already holds the fees, so "fees · pnl" read as two costs
                const net = realNet;
                return (
                  <div className="font-telemetry mt-0.5 text-[12px] text-flat" title={`after $${real.fees.toFixed(2)} of fees`}>
                    net{" "}
                    <span className={`font-bold ${net >= 0 ? "text-chart" : "text-blood"}`}>
                      {net >= 0 ? "+" : "−"}${Math.abs(net).toFixed(2)}
                    </span>{" "}
                    · fees <span className="text-bone">${real.fees.toFixed(2)}</span> · {real.fills} trades
                    {/* the net on the app's one cost scale, once there is enough volume to mean it */}
                    {real.volume > 500 && (
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px]">
                        <Per1M cost={(-net / real.volume) * 1e6} width={48} />
                        <span>
                          <b className={per1mTone((-net / real.volume) * 1e6)}>{per1mText((-net / real.volume) * 1e6)}</b> per $1M
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}
              <div className="font-telemetry whitespace-nowrap text-[11px] text-flat">
                ◈{hud.coins} · {hud.speed} km/h · {hud.km.toFixed(1)}km
              </div>
              {(() => {
                // the road to the next volume club · always visible, always moving
                const total = careerVolBase.current + real.volume;
                const next = CLUBS.find((c) => total < c);
                if (!next) return null;
                const prev = [...CLUBS].reverse().find((c) => c <= total) ?? 0;
                const pct = Math.min(100, ((total - prev) / (next - prev)) * 100);
                return (
                  <div className="mt-1.5 w-44">
                    <div className="flex justify-between text-[10.5px] text-flat">
                      <span>next: {fmtClub(next)} club</span>
                      <span className="font-telemetry">{Math.round(pct)}%</span>
                    </div>
                    <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-ink/70">
                      <div
                        className="h-full rounded-full bg-amber transition-[width] duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })()}
            </>
          ) : (
            <>
              <div className="whitespace-nowrap text-[12px] uppercase tracking-[0.12em] text-flat">
                distance · practice
              </div>
              <div className="font-telemetry text-2xl min-[640px]:text-3xl font-extrabold text-bone">
                {hud.km.toFixed(1)} <span className="text-lg">km</span>
              </div>
              <div className="font-telemetry mt-0.5 whitespace-nowrap text-[12px] text-flat min-[640px]:text-[12px]">
                ◈{hud.coins} · {hud.speed} km/h · ${hud.score.toLocaleString()}
              </div>
              {hud.ghost != null && (
                <div className={`font-telemetry mt-0.5 whitespace-nowrap text-[12px] ${hud.ghost > 0 ? "text-lav" : "text-chart"}`}>
                  ghost · {hud.ghost > 0 ? `best +${hud.ghost}m ahead` : `you lead by ${-hud.ghost}m`}
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 sm:mt-9">
          {armed ? (
            <DisarmPill />
          ) : (
            <button
              onClick={() => window.dispatchEvent(new Event("rtn-arm-request"))}
              className="pointer-events-auto animate-[rtn-pulse_2.2s_infinite] rounded-sm border border-amber bg-amber/15 px-2.5 py-1 text-[11.5px] font-extrabold uppercase tracking-[0.14em] text-amber hover:bg-amber/30"
              title="go live right here, no need to exit the ride"
            >
              practice · TAP TO GO LIVE
            </button>
          )}
          <span
            className={`rounded-sm px-2 py-0.5 text-[12px] font-bold ${
              hud.flow >= 0 ? "bg-chart/20 text-chart" : "bg-blood/20 text-blood"
            }`}
            title="the world's weather runs on ETH's live tape (the deepest feed) · your live trades ride the market YOU picked"
          >
            {hud.flow >= 0 ? "▲ buyers pushing" : "▼ sellers pushing"} · ETH pulse
            {armed && realRef?.current?.asset && realRef.current.asset !== "ETH" && (
              <> · trades on {realRef.current.asset}</>
            )}
          </span>
          <span className="rounded-sm bg-ink/70 px-2 py-0.5 text-[11.5px] font-bold uppercase tracking-[0.12em] text-flat">
            {WORLDS[world].label}
          </span>
          {hud.lever > 1.05 && (
            <span
              className="rounded-sm bg-amber/20 px-2 py-0.5 text-[12px] font-extrabold tabular-nums text-amber"
              style={{ textShadow: "0 0 10px rgba(255,176,32,.5)" }}
            >
              {hud.lever.toFixed(1)}× leverage
            </span>
          )}
          {streak >= 2 && (
            <span className="rounded-sm bg-ink/70 px-2 py-0.5 text-[11px] font-bold text-amber tabular-nums">
              {streak}-day streak
            </span>
          )}
          {hud.combo >= 1.5 && (
            <span
              className={`rounded-sm px-2 py-0.5 text-[12px] font-extrabold tabular-nums ${
                hud.combo >= 3.5
                  ? "bg-blood/25 text-blood"
                  : hud.combo >= 2.2
                    ? "bg-amber/25 text-amber"
                    : "bg-chart/20 text-chart"
              }`}
              style={{ textShadow: "0 0 10px rgba(255,176,32,.4)" }}
            >
              COMBO ×{hud.combo.toFixed(1)}
            </span>
          )}
        </div>
      </div>
      {/* throttle feedback · you can FEEL acceleration even muted/blocked */}
      {hud.thr !== 0 && !over && !paused && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
          style={{
            background:
              hud.thr > 0
                ? "linear-gradient(to top, rgba(39,242,164,0.22), transparent)"
                : "linear-gradient(to top, rgba(255,77,94,0.25), transparent)",
          }}
        />
      )}
      {/* run mission */}
      {missionTxt && !over && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[104px] flex justify-center">
          <span
            className={`gp-btn display border-2 px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wide ${
              missionTxt.startsWith("✓")
                ? "border-chart/60 bg-chart/15 text-chart"
                : "border-amber/50 bg-ink/70 text-amber"
            }`}
          >
            {missionTxt}
          </span>
        </div>
      )}
      {/* 🎯 ENGINE STATUS · the always-on proof of what's armed and what the
          machine is doing right now ("I rode ANTHROPIC and couldn't tell if it
          selected the right asset or why volume hasn't kicked in") */}
      {armed && engineStatus && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[104px] flex justify-center">
          <div className="max-w-[92vw] rounded-xl border border-chart/40 bg-ink/85 px-3.5 py-1.5 text-center backdrop-blur-md">
            <span className="text-[12.5px] font-extrabold text-chart">{engineStatus.head}</span>
            <span className="ml-2 text-[12px] font-bold text-bone">{engineStatus.line}</span>
          </div>
        </div>
      )}
      {/* lane = position readout · Livery v2 instrument pills. SHORT stays SKY
          (not the blueprint's red): in this world red already means DANGER, lava, crashes, "dodge red", and safety language outranks the livery. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-14 flex justify-center gap-2.5">
        {(["SHORT", mode === "passenger" ? "AUTOPILOT" : mode === "cruise" ? "NEUTRAL" : "FLAT", "LONG"] as const).map((label, i) => (
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
      {pop && (
        <div
          key={pop.id}
          className="pointer-events-none absolute inset-x-0 top-[30%] flex justify-center px-5"
        >
          <span
            className="max-w-[92vw] animate-[rtn-pop_0.9s_ease-out_forwards] whitespace-normal text-center text-xl font-extrabold leading-tight"
            style={{ color: pop.color, textShadow: "0 2px 12px rgba(0,0,0,.8)" }}
          >
            {pop.txt}
          </span>
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-[12px] text-flat">
        {mode === "passenger" ? (
          <span>
            <span className="text-amber">PASSENGER MODE</span> · autopilot farms NEUTRAL ·{" "}
            <span className="text-bone">P pause</span> · sit back and let the grid work
          </span>
        ) : (
          <>
            <span className="sm:hidden">
              tap sides = steer · <span className="text-bone">hold = gas/brake</span> ·{" "}
              <span className="text-amber">2nd finger = jump</span> · ride{" "}
              <span className="text-chart">green</span>, dodge <span className="text-blood">red</span>
            </span>
            <span className="hidden sm:inline">
              ◀▶ steer · <span className="text-bone">▲▼ throttle</span> ·{" "}
              <span className="text-amber">SPACE jump</span> ·{" "}
              <span className="text-bone">P pause</span> · ride the{" "}
              <span className="text-chart">green</span>, dodge{" "}
              <span className="text-blood">red</span>, crash = auto-flat
            </span>
          </>
        )}
      </div>
      {/* wrecks · your three lives */}
      <div className="pointer-events-none absolute left-4 top-[max(12px,env(safe-area-inset-top))] mt-[90px] flex gap-1.5 tracking-widest min-[640px]:mt-[104px]">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`inline-flex ${i < hud.wrecks ? "text-blood opacity-100" : "text-flat opacity-30"}`}>
            <GameIcon name="crash" size={12} />
          </span>
        ))}
      </div>
      {/* ⚡ signal flash · the actionable market moments, center stage */}
      {/* 📺 SPECTATOR SCOREBOARD · the numbers a viewer needs to follow the
             run, sized for a stream: real volume farmed, session net, combo
             heat, distance. Passenger+broadcast only — drivers have the HUD. */}
      {mode === "passenger" && broadcast && (
        <div className="pointer-events-none absolute left-3 top-[30%] z-20 border-l-4 border-papaya bg-ink/80 px-3.5 py-2.5 backdrop-blur-md">
          <div className="display text-[9px] font-black uppercase tracking-[0.28em] text-papaya">
            live session
          </div>
          <div className="mt-1 space-y-0.5 tabular-nums">
            <div className="text-[16px] font-black leading-none text-chart min-[640px]:text-[22px]">
              ${Math.round(real.volume).toLocaleString()}
              <span className="ml-1 text-[9px] font-bold uppercase text-flat">real volume</span>
            </div>
            <div className={`text-[13px] font-bold leading-tight min-[640px]:text-[15px] ${realNet >= 0 ? "text-chart" : "text-blood"}`}>
              {realNet >= 0 ? "+" : "−"}${Math.abs(realNet).toFixed(2)}
              <span className="ml-1 text-[9px] font-bold uppercase text-flat">net</span>
            </div>
            {/* 🏁 the plan's finish line and fuel, in the drive itself */}
            {real.race && (real.race.targetUsd > 0 || real.race.maxLossUsd > 0) && (
              <div className="w-[150px] pt-1 min-[640px]:w-[190px]">
                <RaceProgress compact {...real.race} />
              </div>
            )}
            <div className="text-[11px] font-bold text-bone">
              ×{hud.combo.toFixed(1)} <span className="text-flat">combo</span>
              <span className="ml-2 text-bone">{hud.km.toFixed(1)}km</span>
            </div>
          </div>
        </div>
      )}
      {/* the caption channel · screen readers speak it today, and an OBS
          browser source can scrape the same line for stream captions */}
      <div aria-live="polite" className="sr-only">
        {cast?.replace(/^[^\p{L}\p{N}]+/u, "")}
      </div>
      {/* 📺 THE LOWER THIRD · broadcast's voice. Big enough to read on a
             stream at 480p, timed so nothing tramples, gone when the driver
             takes the wheel back. */}
      {mode === "passenger" && broadcast && cast && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[16%] z-20 flex justify-center px-4">
          <div className="animate-[rtn-pop_0.4s_ease-out] max-w-[92vw] border-l-4 border-papaya bg-ink/85 px-5 py-3 backdrop-blur-md min-[640px]:max-w-[720px]">
            <div className="display text-[9px] font-black uppercase tracking-[0.3em] text-papaya">
              ride the now · live tape
            </div>
            <div className="mt-0.5 text-[15px] font-bold leading-snug text-bone min-[640px]:text-[20px]">
              {cast}
            </div>
          </div>
        </div>
      )}
      {mode === "passenger" && (
        <button
          onClick={() => setBroadcast((b) => !b)}
          className={`pointer-events-auto absolute right-3 top-[30%] z-20 border px-2 py-1 text-[10px] font-bold uppercase tracking-wide backdrop-blur-sm ${
            broadcast ? "border-papaya/70 text-papaya" : "border-steel text-flat"
          }`}
          title="broadcast mode · big narration + cinematic camera for streaming"
        >
          <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${broadcast ? "bg-blood" : "bg-flat"}`} aria-hidden />{broadcast ? "on air" : "cast off"}
        </button>
      )}
      {flash && (
        <div className="pointer-events-none absolute inset-x-0 top-[24%] z-20 flex justify-center">
          <div
            className={`animate-[rtn-pop_0.5s_ease-out] rounded-xl border-2 px-5 py-2.5 text-center text-[15px] font-extrabold tracking-[0.06em] backdrop-blur-md min-[640px]:text-[19px] ${
              flash.startsWith("⚡")
                ? "border-chart bg-chart/15 text-chart shadow-[0_0_40px_rgba(61,220,151,.4)]"
                : flash.startsWith("🔻") || flash.startsWith("🌪") || flash.startsWith("🌑")
                  ? "border-blood bg-blood/15 text-blood shadow-[0_0_40px_rgba(255,77,94,.4)]"
                  : "border-amber bg-amber/15 text-amber shadow-[0_0_40px_rgba(255,176,32,.35)]"
            }`}
          >
            {flash}
          </div>
        </div>
      )}
      {/* buzz feed · anchored ABOVE the whole bottom stack (controls hint 24px,
          lane pills 56-96px, engine status 104-154px), at bottom-24 the toasts
          rendered THROUGH the engine card and lane pills on phones */}
      <div className="pointer-events-none absolute bottom-[164px] left-4 z-10 flex max-w-[46vw] flex-col gap-1">
        {buzz.map((m, i) => (
          <div
            key={`${m}-${i}`}
            className="rounded-sm border-l-2 border-amber/60 bg-ink/70 px-2 py-1 text-[11px] text-bone"
            style={{ opacity: 1 - i * 0.3 }}
          >
            {m}
          </div>
        ))}
      </div>
      <div className="absolute bottom-32 right-3 z-10 flex gap-2 sm:bottom-auto sm:right-4 sm:top-[max(12px,env(safe-area-inset-top))]">
        {/* collapsed by default on phones so the HUD stats stay visible */}
        <button
          onClick={() => setHubOpen(true)}
          className="gp-btn display border-2 border-steel bg-ink/80 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-bone"
          title="your stats, leaderboard & referrals"
        >
          <GameIcon name="trophy" />
        </button>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className={`gp-btn display border-2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide sm:hidden ${
            menuOpen ? "border-chart bg-chart/20 text-chart" : "border-hairline bg-ink/80 text-bone"
          }`}
          title="menu"
        >
          <GameIcon name={menuOpen ? "close" : "menu"} />
        </button>
        <div
          className={`${
            menuOpen
              ? "absolute bottom-10 right-0 flex w-44 flex-col gap-1 rounded-xl border border-hairline bg-ink/95 p-1.5 shadow-2xl backdrop-blur-md sm:bottom-auto sm:top-10"
              : "hidden"
          } sm:static sm:flex sm:w-auto sm:flex-row sm:gap-2 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none`}
        >
        <button
          onClick={() => {
            const m = !muted;
            setMuted(m);
            setMutedState(m);
            if (!m) sfx.click();
          }}
          className="gp-btn display flex w-full items-center gap-2 px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-bone hover:bg-ink sm:w-auto sm:border-2 sm:border-steel sm:bg-ink/80 sm:px-3 sm:py-1.5"
          title="sound on/off"
        >
          <GameIcon name={muted ? "soundOff" : "soundOn"} /> <span className="sm:hidden">sound</span>
        </button>
        <button
          onClick={toggleRec}
          className={`gp-btn display flex w-full items-center gap-2 px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-bone hover:bg-ink sm:w-auto sm:border-2 sm:border-steel sm:bg-ink/80 sm:px-3 sm:py-1.5 ${rec ? "animate-[rtn-pulse_0.8s_infinite] border-blood text-blood" : ""}`}
          title="record a clip for TikTok/Reels (auto-stops at 45s)"
        >
          <GameIcon name={rec ? "stop" : "record"} /> <span className="sm:hidden">{rec ? "stop rec" : "record video"}</span>
          <span className="hidden sm:inline">{rec ? "REC" : "VIDEO"}</span>
        </button>
        <button
          onClick={doShare}
          className="gp-btn display flex w-full items-center gap-2 px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-bone hover:bg-ink sm:w-auto sm:border-2 sm:border-steel sm:bg-ink/80 sm:px-3 sm:py-1.5"
          title="share your run card"
        >
          <GameIcon name="share" /> <span className="sm:hidden">share card</span>
          <span className="hidden sm:inline">SHARE</span>
        </button>
        <button
          onClick={cyclePaint}
          className="gp-btn display flex w-full items-center gap-2 px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-bone hover:bg-ink sm:w-auto sm:border-2 sm:border-steel sm:bg-ink/80 sm:px-3 sm:py-1.5"
          title="car color: cycle paints you unlocked by riding volume"
        >
          <GameIcon name="paint" /> <span className="sm:hidden">car color</span>
        </button>
        <button
          onClick={() => togglePauseRef.current?.()}
          className="gp-btn display flex w-full items-center gap-2 px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-bone hover:bg-ink sm:w-auto sm:border-2 sm:border-steel sm:bg-ink/80 sm:px-3 sm:py-1.5"
          title="pause · closes any real position for safety"
        >
          <GameIcon name="pause" /> <span className="sm:hidden">pause (safe)</span>
        </button>
        <a
          href="/about"
          className="gp-btn display flex w-full items-center gap-2 px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-bone hover:bg-ink sm:w-auto sm:border-2 sm:border-steel sm:bg-ink/80 sm:px-3 sm:py-1.5"
          title="How it works · Perpl + Kuru on Monad"
        >
          <GameIcon name="support" /> <span className="sm:hidden">support</span>
        </a>
        <a
          href="/about"
          className="gp-btn display flex w-full items-center gap-2 px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-bone hover:bg-ink sm:w-auto sm:border-2 sm:border-steel sm:bg-ink/80 sm:px-3 sm:py-1.5"
          title="how Ride the Now works on Monad"
        >
          <GameIcon name="guide" /> <span className="sm:hidden">guide</span>
        </a>
        {/* the door reads as a DOOR · papaya, not one more grey chip in a row of nine */}
        <button
          onClick={exitAndRecord}
          className="gp-btn display flex w-full items-center gap-2 px-2.5 py-2 text-left text-[11px] font-black uppercase tracking-wide text-papaya hover:bg-ink sm:w-auto sm:border-2 sm:border-papaya/70 sm:bg-ink/80 sm:px-3 sm:py-1.5 sm:hover:border-papaya"
        >
          <GameIcon name="exit" /> <span className="sm:hidden">exit ride</span>
          <span className="hidden sm:inline">EXIT</span>
        </button>
        </div>
      </div>
      {/* ⛔ THE WAY OUT LIVES WHERE EVERY APP PUTS IT. The exit existed — a
          small chip inside the bottom control cluster — and the rider reported
          they could not find it, which is the same as it not existing. A door
          belongs top-right, always visible, ≥44px, on both breakpoints. It
          runs the SAME exitAndRecord: real position closes, run records. */}
      {/* gp-btn pins position:relative, so the door needs a positioning shell —
          styling the button absolute directly lands it top-LEFT over the HUD.
          Desktop already shows EXIT in the top bar; this door is the phone's,
          where the old exit hid inside the hamburger. */}
      <div className="pointer-events-auto absolute left-3 top-[max(12px,env(safe-area-inset-top))] z-30 sm:hidden">
        <button
          onClick={exitAndRecord}
          aria-label="exit the ride · closes this ride's own trade and records the run · desk books and positions you opened yourself are untouched"
          title="exit · closes this ride's own trade, records the run · desk books and your own positions are untouched"
          className="gp-btn display flex h-11 w-11 items-center justify-center border-2 border-steel bg-ink/85 text-[16px] font-black text-bone backdrop-blur-sm hover:border-papaya hover:text-papaya"
        >
          ✕
        </button>
      </div>
      {hubOpen && <RiderHub onClose={() => setHubOpen(false)} />}
      {/* PAUSED · world frozen, real position already closed */}
      {paused && !over && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-ink/80 p-5 backdrop-blur-sm">
          <div className="w-full max-w-[340px] rounded-2xl border border-hairline bg-ink-soft p-6 text-center shadow-2xl shadow-black/50">
            <div className="display flex items-center justify-center gap-2 text-2xl font-extrabold text-bone"><GameIcon name="pause" /> PAUSED</div>
            <p className="mt-2 text-[12px] leading-snug text-flat">
              your real position was <span className="text-chart">closed for safety</span> · nothing
              is at risk while you&apos;re away. resume and pick a lane to re-enter.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => togglePauseRef.current?.()}
                className="flex-1 rounded-lg bg-chart py-3 text-[13px] font-extrabold tracking-[0.08em] text-ink"
              >
                ▶ RESUME
              </button>
              <button
                onClick={exitAndRecord}
                className="rounded-lg border border-hairline px-4 text-[13px] font-bold text-bone"
              >
                ✕ EXIT
              </button>
            </div>
          </div>
        </div>
      )}
      {/* RUN OVER · the score arc that makes a run worth bragging about */}
      {over && (
        <div className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-ink/85 p-4 py-[max(20px,env(safe-area-inset-top))] backdrop-blur-sm sm:items-center">
          <div className="my-auto max-h-none w-full max-w-[400px] rounded-2xl border border-hairline bg-ink-soft p-6 text-center shadow-2xl shadow-black/50">
            <div className="flex items-center justify-center gap-2 text-[12px] uppercase tracking-[0.2em] text-blood">
              <span className="flag h-[10px] w-4" aria-hidden /> run over <span className="flag h-[10px] w-4" aria-hidden />
            </div>
            <div className="mt-2 text-[11px] uppercase tracking-[0.16em] text-flat">
              {over.live ? "REAL volume farmed" : overArmed ? "live · no fill landed this run" : "points earned · practice"}
            </div>
            <div className="display text-4xl font-extrabold tabular-nums text-chart">
              {over.live
                ? `$${Math.round(over.real.volume).toLocaleString()}`
                : `${over.points.toLocaleString()} pts`}
            </div>
            <div className="mt-1 text-[13px] font-bold text-amber tabular-nums">
              {over.live
                ? `+${over.points.toLocaleString()} pts`
                : `game score $${over.sim.volume.toLocaleString()} · play money`}
            </div>
            {overMeta && (
              <div className="mt-1.5 text-[12.5px] tabular-nums text-flat">
                {overMeta.km < overMeta.best ? (
                  <>
                    <b className="text-lav">{Math.max(1, Math.round((overMeta.best - overMeta.km) * 1000))}m</b>{" "}
                    short of your ghost, one more run?
                  </>
                ) : (
                  <>that WAS your best · the ghost just got faster</>
                )}
                {overMeta.nextClub && (
                  <>
                    {" "}· the ${overMeta.nextClub.toLocaleString()} club is{" "}
                    <b className="text-papaya">
                      ${Math.max(1, Math.round(overMeta.nextClub - overMeta.vol)).toLocaleString()}
                    </b>{" "}
                    away
                  </>
                )}
              </div>
            )}
            {over.live && (
              (() => {
                // where the run's real money went · price, then fees, to the
                // net · the net is counted once (rideNet), whatever the road
                const net = rideNet(over.venue, over.real);
                const perM = over.real.volume > 500 ? (-net / over.real.volume) * 1e6 : null;
                return (
                  <div className="mt-2 rounded-md border border-sky/40 bg-sky/5 p-2.5 text-left">
                    <Waterfall
                      steps={[
                        { label: "price", value: net + over.real.fees, sub: `${over.real.fills} trades` },
                        { label: "fees", value: -over.real.fees },
                      ]}
                      netLabel="net"
                    />
                    {perM != null && (
                      <div className="mt-1.5 flex items-center gap-2 border-t border-hairline/50 pt-1.5 text-[11px] tabular-nums text-flat">
                        <span>what $1M of this run cost</span>
                        <span className="ml-auto flex items-center gap-1.5">
                          <Per1M cost={perM} width={56} />
                          <b className={per1mTone(perM)}>{per1mText(perM)}</b>
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()
            )}
            {!over.live && overArmed && (
              <div className="mt-2 rounded-md border border-sky/40 bg-sky/5 p-2.5 text-left text-[12px] leading-snug text-bone">
                <b className="text-sky">You were live the whole run.</b> Your quotes rested but none
                filled, so nothing was charged and nothing counted yet. The engine is still live and
                keeps working when you go back to the road.
              </div>
            )}
            {!over.live && !overArmed && (
              // THE conversion moment: they just played, they just scored, and
              // none of it counted. Now · and only now · sell going live.
              <div className="mt-2 rounded-md border border-chart/40 bg-chart/5 p-2.5 text-left text-[12px] leading-snug text-bone">
                <b className="text-chart">That was practice · none of it counted.</b> Connect your
                wallet and the same riding farms <b>real DEX volume</b> toward airdrops: trades stay
                tiny, capped &amp; auto-closed. Tap <b>CONNECT WALLET</b> up top.
              </div>
            )}
            {pct != null && (
              <div className="mt-2 text-[12px] font-bold text-sky">
                better than {pct}% of rides today
              </div>
            )}
            {top3.length > 0 && (
              <div className="mt-2 rounded-md border border-hairline bg-ink/50 p-2 text-left">
                <div className="text-[10.5px] uppercase tracking-[0.16em] text-flat">
                  today&apos;s top riders
                </div>
                {top3.map((r, i) => (
                  <div
                    key={r.rider}
                    className="flex justify-between text-[12px] tabular-nums text-bone"
                  >
                    <span>
                      <span className="mr-1 font-black text-papaya">P{i + 1}</span> {riderAlias(r.rider).name}
                    </span>
                    <span className="text-flat">
                      {r.points.toLocaleString()} pts · ${Math.round(r.realVolume).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {/* 🧭 the same co-driver voice on every game's run-over card */}
            <div className="mt-3 rounded-md border border-lav/40 bg-lav/5 p-2.5 text-left">
              <div className="display text-[10px] font-black uppercase tracking-wider text-lav">co-driver</div>
              <p className="mt-1 text-[12px] leading-snug text-flat">{aiTip ?? coachTip(over)}</p>
            </div>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5 text-[10.5px]">
              {mode === "cruise" ? (
                <span className="rounded-full border border-amber/50 bg-amber/10 px-2 py-0.5 text-amber">
                  try TURBO · the throttle scales trades up to 4×, milestones come faster
                </span>
              ) : (
                <span className="rounded-full border border-chart/50 bg-chart/10 px-2 py-0.5 text-chart">
                  try CRUISE · resting fills, the lowest fees, chill farming
                </span>
              )}
              {top3[0] && (
                <span className="rounded-full border border-sky/40 bg-sky/10 px-2 py-0.5 text-sky">
                  {riderAlias(top3[0].rider).name} put up {top3[0].points.toLocaleString()} pts today · don&apos;t
                  get left behind
                </span>
              )}
              <a href="/about" className="rounded-full border border-hairline px-2 py-0.5 text-flat underline">
                how it works on Monad
              </a>
            </div>
            <p className="mt-2 text-[10.5px] leading-snug text-flat-dim">
              alpha · evolving fast · real trades are small &amp; capped, auto-flattened ·
              volume farming, not a profit machine · support &amp; suggestions:{" "}
              <a href="/about" className="underline">how it works</a>
            </p>
            {/* ═══ THE DOOR · a practice lap that never offers the real thing
                is a demo. This is the one moment the driver has just proven the
                game to themselves, so it is the moment to show what it pays. ═══ */}
            {!over.live && onGoLive && (
              <div className="gp-lit mt-4 border-2 border-papaya bg-ink p-4 text-left">
                <div className="display text-[12px] font-black uppercase tracking-[0.12em] text-papaya">
                  that lap was free
                </div>
                <p className="mt-1.5 text-[12.5px] leading-snug text-bone">
                  Same drive, live: those{" "}
                  <b>${over.sim.volume.toLocaleString()}</b> become real volume on Perpl
                  you pick, each lane a Perpl order on Monad, earning Ride the Now points on the board.
                  Trades stay tiny, capped and auto-closed.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={onGoLive}
                    className="gp-btn gp-btn-primary display bg-papaya px-5 py-2.5 text-[11.5px] font-black uppercase tracking-wide text-ink"
                  >
                    Set up a real ride · 2 min →
                  </button>
                  <a
                    href="/how-it-works"
                    className="gp-btn display border-2 border-steel px-4 py-2.5 text-[11.5px] font-bold uppercase tracking-wide text-flat hover:border-papaya hover:text-papaya"
                  >
                    Is it safe?
                  </a>
                </div>
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => resetRef.current?.()}
                className="gp-btn display flex-1 bg-chart py-3 text-[12px] font-black uppercase tracking-[0.08em] text-ink"
              >
                DRIVE AGAIN →
              </button>
              <button
                onClick={() =>
                  void shareCard({
                    headline: `$${over.sim.volume.toLocaleString()}`,
                    headlineLabel: "volume farmed",
                    lines: [
                      ["points", `${over.points.toLocaleString()}`],
                      ["coins", String(over.sim.coins)],
                      ...(over.live
                        ? ([
                            ["real trades", String(over.real.fills)],
                            ["real volume", `$${Math.round(over.real.volume).toLocaleString()}`],
                            ["fees spent", `$${over.real.fees.toFixed(2)}`],
                          ] as [string, string][])
                        : []),
                    ],
                    mode: `TURBO 3D · live ${getRideAsset()} on Perpl`,
                    live: over.live,
                  })
                }
                className="rounded-lg border border-hairline px-4 text-[13px] font-bold text-bone"
                aria-label="Share your run"
                title="Share your run"
              >
                <Icon name="share" size={16} />
              </button>
              <button
                onClick={() =>
                  postToX(
                    `$${over.sim.volume.toLocaleString()}`,
                    over.points,
                    over.real.volume,
                    inviteLink())
                }
                className="rounded-lg border border-hairline px-4 text-[13px] font-bold text-bone"
                title="post your run on X · your invite link included"
              >
                𝕏
              </button>
              <button
                onClick={onExit}
                aria-label="Exit the ride"
                className="rounded-lg border border-hairline px-4 text-[13px] font-bold text-bone"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
      {/* first-drive tutorial · the ONE idea: your lane is your position */}
      {tut && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-ink/85 p-5 backdrop-blur-sm">
          <div className="w-full max-w-[400px] rounded-xl border border-hairline bg-ink-soft p-5 text-center">
            <div className="text-lg font-extrabold text-bone">Your lane is your trade.</div>
            <div className="mt-1 text-[10.5px] leading-snug text-flat">
              center = <b className="text-bone">NEUTRAL</b> · it trades BOTH ways while you sit ·
              often the cheapest seat · ending a trade: <b className="text-bone">pause</b> /{" "}
              <b className="text-bone">✕ exit</b> / <b className="text-bone">STOP</b> · every exit
              closes your position safely, always
            </div>
            <div className="mx-auto mt-3 flex justify-center gap-2">
              <span className="w-24 rounded-md border border-sky bg-sky/20 py-2 text-[12px] font-bold text-sky">
                ◀ SHORT
                <div className="text-[10.5px] font-normal opacity-80">price falls = win</div>
              </span>
              <span className="w-24 rounded-md border border-bone/40 bg-ink py-2 text-[12px] font-bold text-bone">
                FLAT
                <div className="text-[10.5px] font-normal opacity-80">farms both directions</div>
              </span>
              <span className="w-24 rounded-md border border-chart bg-chart/20 py-2 text-[12px] font-bold text-chart">
                LONG ▶
                <div className="text-[10.5px] font-normal opacity-80">price rises = win</div>
              </span>
            </div>
            <ul className="mx-auto mt-4 max-w-[320px] space-y-1.5 text-left text-[12px] leading-snug text-flat">
              <li>
                <b className="text-blood">Red trucks</b> = the market turning against a side.
                Steer out of their lane · that&apos;s dodging a loss.
              </li>
              <li>
                <b className="text-chart">Green cars & coins</b> gather where the market is
                pushing. Drive with them · that&apos;s riding the trend.
              </li>
              <li>
                Crash? You spin out to <b className="text-bone">FLAT</b> · position closed,
                capped small. <b className="text-bone">No overnight blow-ups, ever.</b>
              </li>
            </ul>
            <button
              onClick={() => {
                localStorage.setItem("rtn-3d-tut", "1");
                setTut(false);
              }}
              className="mt-4 w-full rounded-lg bg-chart py-3 text-[13px] font-extrabold tracking-[0.08em] text-ink"
            >
              GOT IT · DRIVE →
            </button>
            {/* the card covers the game's own exit · leaving must never need a lap first */}
            <button onClick={onExit} className="mt-2 w-full rounded-lg border border-hairline py-2 text-[12px] font-bold text-flat hover:text-bone">
              not now · leave
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
