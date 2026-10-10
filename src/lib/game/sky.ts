/* Real skies · Poly Haven HDRIs (CC0), tone-mapped and re-encoded as WebP
 * equirects by scripts/assets (2k ≈ 25–140 KB, 1k ≈ 9–40 KB). One file is
 * both the visible sky and the light that lands on paint, glass and wet
 * asphalt (PMREM-filtered). LDR on purpose: the sun's punch comes from the
 * scene's own DirectionalLight, so nothing here needs an .hdr. */
import * as THREE from "three";

export type SkyName = "night" | "dusk" | "golden" | "sunset" | "day";
export type SkyTier = "1k" | "2k";

const cache = new Map<string, Promise<{ env: THREE.Texture; equirect: THREE.Texture }>>();
const texLoader = new THREE.TextureLoader();

/** load once per (sky, tier) · resolves the PMREM environment and the raw
 *  equirect (for `scene.background`) · rejects if the file is missing, so
 *  callers keep whatever sky they painted themselves */
export function loadSky(renderer: THREE.WebGLRenderer, name: SkyName, tier: SkyTier) {
  const key = `${name}-${tier}`;
  let p = cache.get(key);
  if (!p) {
    p = new Promise<THREE.Texture>((resolve, reject) => texLoader.load(`/sky/${key}.webp`, resolve, undefined, reject)).then((equirect) => {
      equirect.mapping = THREE.EquirectangularReflectionMapping;
      equirect.colorSpace = THREE.SRGBColorSpace;
      const pmrem = new THREE.PMREMGenerator(renderer);
      const env = pmrem.fromEquirectangular(equirect).texture;
      pmrem.dispose();
      return { env, equirect };
    });
    cache.set(key, p);
  }
  return p;
}

/** the sky that matches an hour of the local day */
export function skyForHour(h: number): SkyName {
  if (h < 5.5 || h >= 20.5) return "night";
  if (h < 7.5) return "golden";
  if (h < 16.5) return "day";
  if (h < 18.5) return "sunset";
  return "dusk";
}
