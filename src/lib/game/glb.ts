/* Tiny GLB pipeline for the cartridges · CC0 models vendored in /public/models
 * (see public/models/LICENSES.md).
 *
 * Contract: the procedural primitives STAY as the instant default; a GLB
 * swaps in when (and only when) it loads. Any failure keeps the procedural
 * look silently, a missing model must never break a game. */

import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/* Every model under /models/q was compressed by scripts/assets/build.mjs
   (meshopt geometry, WebP textures) · the 30 KB decoder three ships turns
   them back into buffers on load; uncompressed GLBs pass straight through. */
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<THREE.Group>>();
const kitCache = new Map<string, Promise<GLTF>>();

/** Load (once) and clone a GLB scene. Rejects on failure, callers ignore. */
export function loadGlb(url: string): Promise<THREE.Group> {
  let p = cache.get(url);
  if (!p) {
    p = new Promise<THREE.Group>((resolve, reject) => {
      loader.load(
        url,
        (g) => resolve(g.scene),
        undefined,
        (e) => reject(e));
    });
    cache.set(url, p);
  }
  return p.then((scene) => {
    const c = scene.clone(true);
    // clone materials so per-instance tints never bleed across users
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material) {
        m.material = Array.isArray(m.material)
          ? m.material.map((x) => x.clone())
          : m.material.clone();
        m.castShadow = false;
        m.receiveShadow = false;
      }
    });
    return c;
  });
}

/** A merged KIT (one GLB, one scene per piece · see build.mjs) · loads once,
 *  hands out a clone of the named piece with its own materials. Missing
 *  piece → rejects, callers keep their fallback. */
export function loadKitPiece(url: string, name: string): Promise<THREE.Group> {
  let p = kitCache.get(url);
  if (!p) {
    p = new Promise<GLTF>((resolve, reject) => loader.load(url, resolve, undefined, reject));
    kitCache.set(url, p);
  }
  return p.then((g) => {
    const scene = g.scenes.find((s) => s.name === name) ?? g.scenes.find((s) => s.name.replace(/\./g, "_") === name.replace(/\./g, "_"));
    if (!scene) throw new Error(`kit ${url} has no piece "${name}"`);
    const c = scene.clone(true);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material) {
        m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone();
        m.castShadow = false;
        m.receiveShadow = false;
      }
    });
    return c;
  });
}

/** The animations that came with a model (the bull's gallop) · same cache,
 *  the caller mixes them onto its own clone. */
export function loadGlbWithClips(url: string): Promise<{ scene: THREE.Group; clips: THREE.AnimationClip[] }> {
  let p = kitCache.get(url);
  if (!p) {
    p = new Promise<GLTF>((resolve, reject) => loader.load(url, resolve, undefined, reject));
    kitCache.set(url, p);
  }
  return p.then((g) => ({ scene: g.scene, clips: g.animations }));
}

/** Uniform-scale so the object's size along `axis` equals `target`, and rest
 *  its base on y=0. Returns the same object for chaining. */
export function fitTo(obj: THREE.Object3D, target: number, axis: "x" | "y" | "z" = "z"): THREE.Object3D {
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  box.getSize(size);
  const s = size[axis] > 0 ? target / size[axis] : 1;
  obj.scale.setScalar(s);
  const box2 = new THREE.Box3().setFromObject(obj);
  obj.position.y -= box2.min.y; // wheels on the ground
  /* CENTER THE BODY ON THE PIVOT — by moving the CHILDREN, never the object.
     Kenney models often pivot off-center, so a "centered" car hung to one
     side of its lane: the rider steered by where the BODY was while the game
     scored by where the ORIGIN was ("I think I am in middle lane and I am
     not" — literally true). The first attempt shifted obj.position, which a
     later rotation.y = π then flips internally while the compensation stays
     put — DOUBLING the error instead of fixing it (call sites rotate after
     fitting). Shifting the children centers the geometry around the pivot
     itself, so any later rotation spins a centered body and stays centered. */
  const cx = (box2.min.x + box2.max.x) / 2;
  const cz = (box2.min.z + box2.max.z) / 2;
  if (Math.abs(cx) > 1e-6 || Math.abs(cz) > 1e-6) {
    for (const ch of obj.children) {
      ch.position.x -= cx / (obj.scale.x || 1);
      ch.position.z -= cz / (obj.scale.z || 1);
    }
  }
  return obj;
}

/** Multiply the LARGEST mesh's material color (≈ the body panel on flat-color
 *  kit models), how the garage paint applies to a real model. */
export function tintBody(obj: THREE.Object3D, colorHex: number): void {
  let best: THREE.Mesh | null = null;
  let bestCount = 0;
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) {
      const n = m.geometry.getAttribute("position")?.count ?? 0;
      if (n > bestCount) {
        bestCount = n;
        best = m;
      }
    }
  });
  if (!best) return;
  const mats = Array.isArray((best as THREE.Mesh).material)
    ? ((best as THREE.Mesh).material as THREE.Material[])
    : [(best as THREE.Mesh).material as THREE.Material];
  for (const mat of mats) {
    const std = mat as THREE.MeshStandardMaterial;
    if (std.color) std.color.multiply(new THREE.Color(colorHex));
  }
}

/** Tint EVERY material (venue liveries on the depot fleet). */
export function tintAll(obj: THREE.Object3D, colorHex: number, strength = 0.55): void {
  const tint = new THREE.Color(colorHex);
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.material) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const std = mat as THREE.MeshStandardMaterial;
      if (std.color) std.color.lerp(tint, strength);
    }
  });
}
