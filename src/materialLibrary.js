/**
 * Curated material preset library.
 *
 * Expected texture folder layout (per preset):
 *   Color.jpg       — albedo / base color (sRGB)
 *   Normal.jpg      — OpenGL normal map (linear)
 *   Roughness.jpg   — roughness map (linear)
 *   Metalness.jpg   — metalness map (linear, optional)
 *
 * All paths are relative to /public, so texturePath="/textures/metal/brushed-aluminum"
 * maps to public/textures/metal/brushed-aluminum/.
 */

export const MATERIAL_PRESETS = [
  // ── Metal ───────────────────────────────────────────────────────────────
  {
    id: "metal-brushed-aluminum",
    label: "Brushed Aluminum",
    family: "metal",
    texturePath: "/textures/metal/brushed-aluminum",
    fallbackColor: "#b8b8b8",
    roughness: 0.25,
    metalness: 0.9,
    normalScale: 0.8,
    repeat: [2, 2],
  },
  {
    id: "metal-hit-aluminum",
    label: "Hit Aluminum",
    family: "metal",
    texturePath: "/textures/metal/hit-aluminum",
    fallbackColor: "#9e9e9e",
    roughness: 0.4,
    metalness: 0.85,
    normalScale: 1.0,
    repeat: [2, 2],
  },

  // ── Plaster ─────────────────────────────────────────────────────────────
  {
    id: "plaster-light-blue",
    label: "Light Blue",
    family: "plaster",
    texturePath: "/textures/plaster/light-blue",
    fallbackColor: "#b8ccd8",
    roughness: 0.9,
    metalness: 0.0,
    normalScale: 0.4,
    repeat: [2, 2],
  },
  {
    id: "plaster-warm-white",
    label: "Warm White",
    family: "plaster",
    texturePath: "/textures/plaster/warm-white",
    fallbackColor: "#f0ece4",
    roughness: 0.92,
    metalness: 0.0,
    normalScale: 0.35,
    repeat: [2, 2],
  },

  // ── Tile ────────────────────────────────────────────────────────────────
  {
    id: "tile-limestone-light",
    label: "Limestone Light",
    family: "tile",
    texturePath: "/textures/tile/limestone-light",
    fallbackColor: "#d8cebc",
    roughness: 0.6,
    metalness: 0.0,
    normalScale: 0.7,
    repeat: [3, 3],
  },
  {
    id: "tile-paint-brick",
    label: "Paint Brick",
    family: "tile",
    texturePath: "/textures/tile/paint-brick",
    fallbackColor: "#c8b8a8",
    roughness: 0.85,
    metalness: 0.0,
    normalScale: 1.0,
    repeat: [2, 2],
  },

  // ── Wood ────────────────────────────────────────────────────────────────
  {
    id: "wood-charcoal-veneer",
    label: "Charcoal Veneer",
    family: "wood",
    texturePath: "/textures/wood/charcoal-veneer",
    fallbackColor: "#3a3530",
    roughness: 0.7,
    metalness: 0.02,
    normalScale: 0.6,
    repeat: [2, 2],
  },
  {
    id: "wood-oak-light",
    label: "Oak Light",
    family: "wood",
    texturePath: "/textures/wood/oak-light",
    fallbackColor: "#c9a679",
    roughness: 0.68,
    metalness: 0.02,
    normalScale: 0.6,
    repeat: [2, 2],
  },
  {
    id: "wood-walnut-mid",
    label: "Walnut Mid",
    family: "wood",
    texturePath: "/textures/wood/walnut-mid",
    fallbackColor: "#7a5a3a",
    roughness: 0.65,
    metalness: 0.02,
    normalScale: 0.7,
    repeat: [2, 2],
  },
]

/** Quick O(1) lookup by preset ID. */
export const PRESET_BY_ID = Object.fromEntries(
  MATERIAL_PRESETS.map((p) => [p.id, p])
)

/** Presets grouped by finish family. */
export const PRESETS_BY_FAMILY = MATERIAL_PRESETS.reduce((acc, p) => {
  if (!acc[p.family]) acc[p.family] = []
  acc[p.family].push(p)
  return acc
}, {})
