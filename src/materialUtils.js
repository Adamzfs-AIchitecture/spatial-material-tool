import * as THREE from "three"

/**
 * Candidate filenames tried in order for each map type.
 * The first filename that loads successfully wins; the rest are skipped.
 * Add more variants here if future texture sets use different naming conventions.
 */
const MAP_CANDIDATES = {
  color:     ["Color.jpg",     "BaseColor.jpg", "Albedo.jpg",    "color.jpg",     "basecolor.jpg", "albedo.jpg"],
  normal:    ["NormalGL.jpg",  "Normal.jpg",    "normal_gl.jpg", "normal.jpg"],
  roughness: ["Roughness.jpg", "roughness.jpg"],
  metalness: ["Metalness.jpg", "Metallic.jpg",  "metalness.jpg", "metallic.jpg"],
}

const loader = new THREE.TextureLoader()

// Cache raw textures by URL so each image is only fetched once.
const textureCache = new Map()

// Cache fully built materials by preset ID so the work is only done once.
const materialCache = new Map()

/**
 * Loads a texture from `url`. Returns the THREE.Texture on success, or null
 * if the request fails (e.g. the file does not exist). Results are cached.
 *
 * @param {string}  url     — absolute URL or Vite public path
 * @param {boolean} isColor — true → mark as sRGB; false → keep linear
 */
function loadTexture(url, isColor) {
  if (textureCache.has(url)) return Promise.resolve(textureCache.get(url))

  return new Promise((resolve) => {
    loader.load(
      url,
      (texture) => {
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        if (isColor) texture.colorSpace = THREE.SRGBColorSpace
        textureCache.set(url, texture)
        resolve(texture)
      },
      undefined,
      () => {
        // File not found or load error — cache null so we don't retry.
        textureCache.set(url, null)
        resolve(null)
      }
    )
  })
}

/**
 * Tries each candidate filename in `basePath` in order and returns the first
 * texture that loads, or null if none succeed.
 *
 * All candidates are fired in parallel so missing files (404s) don't stall
 * each other — we just pick the first non-null result in candidate order.
 */
async function findMap(basePath, candidates, isColor) {
  const results = await Promise.all(
    candidates.map((filename) =>
      loadTexture(`${basePath}/${filename}`, isColor)
    )
  )
  return results.find((t) => t != null) ?? null
}

/**
 * Builds a THREE.MeshStandardMaterial from a preset definition.
 * Results are cached by preset.id — the same instance is reused for all
 * meshes that share the same preset.
 *
 * Missing map types are handled gracefully: the material is still created
 * with whatever maps were found.
 *
 * @param {object} preset — a preset object from materialLibrary.js
 * @returns {Promise<THREE.MeshStandardMaterial>}
 */
export async function buildMaterialFromPreset(preset) {
  if (materialCache.has(preset.id)) return materialCache.get(preset.id)

  const { texturePath, roughness, metalness, normalScale, repeat, fallbackColor } = preset
  const [rx, ry] = repeat ?? [2, 2]

  // Load all map types concurrently.
  const [colorMap, normalMap, roughnessMap, metalnessMap] = await Promise.all([
    findMap(texturePath, MAP_CANDIDATES.color,     true),
    findMap(texturePath, MAP_CANDIDATES.normal,    false),
    findMap(texturePath, MAP_CANDIDATES.roughness, false),
    findMap(texturePath, MAP_CANDIDATES.metalness, false),
  ])

  // Apply tiling repeat to every map that was found.
  for (const map of [colorMap, normalMap, roughnessMap, metalnessMap]) {
    if (map) map.repeat.set(rx, ry)
  }

  const material = new THREE.MeshStandardMaterial({
    color:        colorMap ? "#ffffff" : (fallbackColor ?? "#cccccc"),
    map:          colorMap     ?? null,
    normalMap:    normalMap    ?? null,
    normalScale:  normalMap
                    ? new THREE.Vector2(normalScale ?? 1, normalScale ?? 1)
                    : new THREE.Vector2(1, 1),
    roughnessMap: roughnessMap ?? null,
    roughness:    roughness    ?? 0.8,
    metalnessMap: metalnessMap ?? null,
    metalness:    metalness    ?? 0.0,
    side: THREE.DoubleSide,
  })

  materialCache.set(preset.id, material)
  return material
}

/**
 * Preloads materials for all presets and returns a { presetId → material } map.
 * Call this once at app startup so preset application feels instant.
 *
 * @param {object[]} presets — the full MATERIAL_PRESETS array
 * @returns {Promise<Record<string, THREE.MeshStandardMaterial>>}
 */
export async function preloadAllMaterials(presets) {
  const pairs = await Promise.all(
    presets.map(async (p) => [p.id, await buildMaterialFromPreset(p)])
  )
  return Object.fromEntries(pairs)
}
