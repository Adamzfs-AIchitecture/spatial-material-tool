/**
 * viewModes.js
 *
 * Defines the two product interaction modes: Explore and Inspect.
 *
 * ── Tuning guide ───────────────────────────────────────────────────────────
 *
 * EXPLORE_CAMERA
 *   position — default starting angle. Move X/Z further out to zoom out;
 *              raise Y for a steeper axonometric angle.
 *   fov      — field of view for the explore perspective camera (degrees).
 *
 * EXPLORE_ORBIT
 *   minDistance / maxDistance — zoom limits while orbiting.
 *   minPolarAngle             — prevents camera from pointing straight up (radians).
 *   maxPolarAngle             — prevents camera from dipping below floor level (radians).
 *
 * EXPLORE_HIDDEN
 *   Mesh names excluded from Explore mode entirely (not visible, not selectable).
 *   Currently ["ceiling"] — the room is treated as a roofless shell.
 *
 * INSPECT_WORLD_WIDTH
 *   How many world units the orthographic Inspect camera shows horizontally.
 *   Canvas-size-independent: zoom is derived as canvasWidth / INSPECT_WORLD_WIDTH.
 *   Smaller value = fills the wall larger; larger value = more breathing room.
 *   Recommended range: 8–16. Default: 10.
 *
 * INSPECT_VIEWS
 *   camera.position — axis distance (±20) keeps the scene well inside near/far.
 *                     Changing this value has no effect on orthographic framing
 *                     (only near/far clipping matters).
 *   camera.target   — all views share the same target so orbit-target never drifts.
 *   hidden          — mesh names to suppress (usually the wall behind the camera).
 */

// ── Explore mode ─────────────────────────────────────────────────────────────

export const EXPLORE_CAMERA = {
  position: [4.5, 4, 6],
  target:   [0,   1, 0],
  fov:      55,
}

export const EXPLORE_ORBIT = {
  minDistance:   4,
  maxDistance:   40,               // generous zoom-out to see the whole room in context
  minPolarAngle: Math.PI * 0.10,   // ~18° — prevents looking straight down
  maxPolarAngle: Math.PI * 0.42,   // ~76° — keeps camera comfortably elevated
}

/**
 * Objects hidden in Explore mode as a mode-level rule.
 * The room is treated as a roofless shell: ceiling is never visible,
 * never selectable, and never intercepts clicks in Explore mode.
 * In Inspect mode the ceiling returns to normal.
 */
export const EXPLORE_HIDDEN = ["ceiling"]

// ── Inspect mode ─────────────────────────────────────────────────────────────

/**
 * World units visible horizontally in every Inspect elevation view.
 * The orthographic zoom is computed as: canvasPixelWidth / INSPECT_WORLD_WIDTH.
 * This is canvas-resolution-independent — the same room area is always shown
 * regardless of window size.
 *
 * Decrease to zoom in (wall fills more of the screen).
 * Increase for more breathing room around the composition.
 */
export const INSPECT_WORLD_WIDTH = 15

/**
 * Orthographic zoom limits for Inspect mode.
 * OrbitControls enforces these when the active camera is orthographic.
 * They have no effect on the perspective camera used in Explore mode.
 *
 * min — most zoomed-out allowed (lower = more context visible)
 * max — most zoomed-in allowed (higher = more detail visible)
 *
 * Calibrated for typical 1080p–1440p displays.
 * Rule of thumb for a 1440px-wide screen (initial zoom ≈ 144):
 *   min = 70  → shows ~20 world units (roughly 2× backed out)
 *   max = 450 → shows ~3  world units (roughly 3× zoomed in)
 */
export const INSPECT_ZOOM_LIMITS = {
  min: 45,
  max: 450,
}

/**
 * Fixed interior elevation views for Inspect mode.
 *
 * Camera uses a true orthographic projection — no perspective distortion.
 * Each view is a parallel interior elevation: camera is positioned INSIDE the
 * room, looking outward toward the interior face of the corresponding wall.
 * This is equivalent to standing in the room and reading an elevation drawing.
 *
 * ── Conceptual model ───────────────────────────────────────────────────────
 *
 *   Four cameras arranged around the room centre, each looking outward:
 *
 *        [Front wall +Z]
 *              ↑
 *   [Left -X] ←  ● → [Right +X]
 *              ↓
 *        [Rear wall -Z]
 *
 *   The camera (●) is offset slightly from centre toward the OPPOSITE side,
 *   so the view direction is unambiguous and the near wall is behind the camera.
 *
 * ── Framing ────────────────────────────────────────────────────────────────
 *
 *   Only INSPECT_WORLD_WIDTH (above) controls how much is visible horizontally.
 *   Camera axis-distance from centre does NOT affect scale (orthographic).
 *   Target Y = 1.4 centres the elevation at eye level. Adjust to raise/lower.
 *
 * ── Tuning ─────────────────────────────────────────────────────────────────
 *
 *   camera.position — keep the offset small (≈0.5–1 unit from centre) and
 *     inside the room. For orthographic cameras, only the VIEW DIRECTION
 *     matters, not the distance.
 *   target          — place it well past the target wall so the direction
 *     vector is stable and the wall stays within near/far range.
 *   hidden[]        — the wall behind the camera. Since OrthographicCamera
 *     near=0.1, geometry behind the camera is already outside the frustum,
 *     but hiding prevents raycasting edge cases on close geometry.
 *
 * GLB mesh axis conventions:
 *   +Z → front of room (wall_front)   −Z → rear (wall_rear)
 *   −X → left of room (wall_left, cabinet_left)
 *   +X → right of room (cabinet_right)
 */
export const INSPECT_VIEWS = [
  {
    id:     "front",
    label:  "Front",
    // Camera near rear of room, looking outward toward interior of wall_front (+Z).
    camera: { position: [0, 1.4, 1.8], target: [0, 1.4, 8] },
    hidden: [],
  },
  {
    id:     "rear",
    label:  "Rear",
    // Camera near front of room, looking outward toward interior of wall_rear (−Z).
    camera: { position: [0, 1.4, 0.5], target: [0, 1.4, -5] },
    hidden: [],
  },
  {
    id:     "left",
    label:  "Left",
    // Camera on +X side, looking outward toward interior of wall_left (−X).
    camera: { position: [2.2, 1.4, -0.8],   target: [-8, 1.4, -0.8] },
    hidden: [],
  },
  {
    id:     "right",
    label:  "Right",
    // Camera on −X side, looking outward toward interior of right side (+X).
    camera: { position: [-0.5, 1.4, 0],   target: [5, 1.4, 0] },
    hidden: ["wall_left", "cabinet_left"],
  },
]

/** O(1) lookup for Inspect views by id. */
export const INSPECT_VIEW_BY_ID = Object.fromEntries(
  INSPECT_VIEWS.map((v) => [v.id, v])
)

// ── Shared visibility utility ─────────────────────────────────────────────────

/**
 * Two-pass visibility update. Pass 1 restores all meshes to visible.
 * Pass 2 hides any named object and its entire subtree, which correctly
 * handles GLB Group wrappers where the named node is not itself a mesh.
 *
 * @param {THREE.Object3D} scene
 * @param {string[]}       hiddenNames — exact GLB node names to hide
 */
export function applyVisibility(scene, hiddenNames) {
  if (!scene) return
  const hiddenSet = new Set(hiddenNames)
  scene.traverse((obj) => { if (obj.isMesh) obj.visible = true })
  scene.traverse((obj) => {
    if (!hiddenSet.has(obj.name)) return
    obj.traverse((child) => { child.visible = false })
  })
}

/**
 * Enables or disables raycast participation for all meshes matching targetNames.
 *
 * Three.js raycasting is NOT gated by obj.visible — an invisible mesh can still
 * be hit-tested. This function fixes that gap for mode-excluded objects.
 *
 * enabled = false  →  override raycast with a no-op (mesh becomes non-interactive)
 * enabled = true   →  delete the instance override (prototype method restored)
 *
 * @param {THREE.Object3D} scene
 * @param {string[]}       targetNames — exact GLB node names to target
 * @param {boolean}        enabled
 */
export function setRaycastEnabled(scene, targetNames, enabled) {
  if (!scene) return
  const targetSet = new Set(targetNames)
  scene.traverse((obj) => {
    if (!targetSet.has(obj.name)) return
    obj.traverse((child) => {
      if (!child.isMesh) return
      if (enabled) {
        delete child.raycast          // remove instance override → prototype restored
      } else {
        child.raycast = () => {}      // no-op: raycaster skips this mesh entirely
      }
    })
  })
}
