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

const PLANAR_TEXTURE_SIZE = {
  "tile-paint-brick": [3.2, 1.6],
  "tile-limestone-light": [1.8, 1.8],
}

const CATEGORY_REPEAT_SCALE = {
  cabinet: {
    wood: 2.6,
  },
  floor: {
    wood: 3.2,
    tile: 2.5,
  },
}

function cloneTextureMap(map) {
  if (!map) return null

  const clone = map.clone()
  clone.needsUpdate = true
  return clone
}

function cloneMaterial(material) {
  const clone = material.clone()

  clone.map = cloneTextureMap(material.map)
  clone.normalMap = cloneTextureMap(material.normalMap)
  clone.roughnessMap = cloneTextureMap(material.roughnessMap)
  clone.metalnessMap = cloneTextureMap(material.metalnessMap)
  clone.needsUpdate = true

  return clone
}

function getPlanarAxes(size, category) {
  if (category === "floor" || category === "ceiling") {
    return ["x", "z"]
  }

  if (category === "wall") {
    return size.x < size.z ? ["z", "y"] : ["x", "y"]
  }

  return size.x >= size.z ? ["x", "y"] : ["z", "y"]
}

function getPlanarAxesFromNormal(normal, category) {
  if (category === "floor" || category === "ceiling") {
    return ["x", "z"]
  }

  const ax = Math.abs(normal.x)
  const ay = Math.abs(normal.y)
  const az = Math.abs(normal.z)

  if (ay > ax && ay > az) return ["x", "z"]
  return ax > az ? ["z", "y"] : ["x", "y"]
}

function writePlanarUvs(obj, preset, category) {
  if (!obj.geometry?.attributes?.position) return

  if (!obj.userData.planarGeometry) {
    obj.geometry = obj.geometry.index
      ? obj.geometry.toNonIndexed()
      : obj.geometry.clone()
    obj.userData.planarGeometry = true
  }

  obj.updateWorldMatrix(true, false)

  const position = obj.geometry.attributes.position
  const worldPoints = []
  const vertex = new THREE.Vector3()
  const box = new THREE.Box3()

  for (let i = 0; i < position.count; i++) {
    vertex
      .set(position.getX(i), position.getY(i), position.getZ(i))
      .applyMatrix4(obj.matrixWorld)

    const point = vertex.clone()
    worldPoints.push(point)
    box.expandByPoint(point)
  }

  const size = new THREE.Vector3()
  box.getSize(size)

  const fallbackAxes = getPlanarAxes(size, category)
  const [textureU, textureV] =
    preset.textureWorldSize ?? PLANAR_TEXTURE_SIZE[preset.id] ?? [2, 2]

  const uv = new Float32Array(position.count * 2)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const ab = new THREE.Vector3()
  const ac = new THREE.Vector3()
  const normal = new THREE.Vector3()

  for (let i = 0; i < position.count; i += 3) {
    a.copy(worldPoints[i])
    b.copy(worldPoints[i + 1])
    c.copy(worldPoints[i + 2])

    ab.subVectors(b, a)
    ac.subVectors(c, a)
    normal.crossVectors(ab, ac)

    const [uAxis, vAxis] =
      normal.lengthSq() > 0.000001
        ? getPlanarAxesFromNormal(normal.normalize(), category)
        : fallbackAxes

    for (let j = 0; j < 3; j++) {
      const p = worldPoints[i + j]

      uv[(i + j) * 2] = (p[uAxis] - box.min[uAxis]) / textureU
      uv[(i + j) * 2 + 1] = (p[vAxis] - box.min[vAxis]) / textureV
    }
  }

  obj.geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2))
  obj.geometry.attributes.uv.needsUpdate = true
}

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

export function buildMaterialForObject(baseMaterial, preset, obj, category) {
  if (!baseMaterial) return baseMaterial

  const repeatScale = CATEGORY_REPEAT_SCALE[category]?.[preset?.family]

  if (repeatScale) {
    const material = cloneMaterial(baseMaterial)

    for (const map of [
      material.map,
      material.normalMap,
      material.roughnessMap,
      material.metalnessMap,
    ]) {
      if (map) map.repeat.multiplyScalar(repeatScale)
    }

    return material
  }

  const shouldUsePlanarMapping =
    preset?.family === "tile" || preset?.id === "plaster-light-blue"

  if (!shouldUsePlanarMapping) return baseMaterial

  writePlanarUvs(obj, preset, category)

  const material = cloneMaterial(baseMaterial)
  for (const map of [
    material.map,
    material.normalMap,
    material.roughnessMap,
    material.metalnessMap,
  ]) {
    if (map) map.repeat.set(1, 1)
  }

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
