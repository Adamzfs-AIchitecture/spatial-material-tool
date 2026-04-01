/**
 * Curated camera view presets.
 *
 * Each preset defines:
 *   id       — string key used in state
 *   label    — display name shown in the view nav bar
 *   camera   — { position: [x,y,z], target: [x,y,z] }
 *   hidden   — array of exact mesh names to hide; every other mesh is shown
 *
 * ── How to adjust ──────────────────────────────────────────────────────────
 *
 * Camera position / target:
 *   Tweak the [x, y, z] values for each preset and save. The SceneController
 *   component reads these and moves the camera immediately on view change.
 *
 * Hidden objects (overall axon):
 *   The ceiling is always removed for overhead readability.
 *   Add any wall or cabinet name that blocks the chosen axon direction.
 *   Example: if you rotate the axon to face the left side, add "wall_left".
 *
 * Hidden objects (interior elevations):
 *   Typically hide the wall directly behind the camera so it does not clip
 *   or block the view. Add cabinet names if they obstruct the frame.
 *
 * All names must exactly match GLB mesh names:
 *   ceiling, floor, wall_left, wall_front, wall_rear,
 *   cabinet_left, cabinet_right, door
 */

export const VIEW_PRESETS = [
  {
    id: "overall",
    label: "Overall",
    camera: {
      // Outside the room, elevated, looking in from the front-right diagonal.
      // Move x/z further out to zoom out; raise y for a steeper axon angle.
      position: [4.5, 4, 6],
      target:   [0, 1, 0],
    },
    // Ceiling always removed. wall_front faces this camera direction —
    // remove it to see inside. Swap for wall_left/wall_rear if you change
    // the axon angle.
    hidden: ["ceiling", "wall_front"],
  },

  {
    id: "front",
    label: "Front",
    camera: {
      // Standing near the rear of the room, looking at wall_front.
      // Adjust z (move closer to 0) if the room feels too shallow.
      position: [0, 1.4, -2.5],
      target:   [0, 1.4, 2],
    },
    // wall_rear is behind this camera — hide it to avoid clipping.
    hidden: ["wall_rear"],
  },

  {
    id: "rear",
    label: "Rear",
    camera: {
      // Standing near the front of the room, looking at wall_rear.
      position: [0, 1.4, 2.5],
      target:   [0, 1.4, -2],
    },
    hidden: ["wall_front"],
  },

  {
    id: "left",
    label: "Left",
    camera: {
      // Standing toward the right side, looking at wall_left.
      position: [2.5, 1.4, 0],
      target:   [-2, 1.4, 0],
    },
    // Nothing is directly behind this camera; add names here if needed.
    hidden: [],
  },

  {
    id: "right",
    label: "Right",
    camera: {
      // Standing toward the left side, looking at the right side of the room.
      position: [-2.5, 1.4, 0],
      target:   [2, 1.4, 0],
    },
    // wall_left and cabinet_left are behind this camera.
    hidden: ["wall_left", "cabinet_left"],
  },
]

/**
 * Hidden sets for each camera quadrant in the overall view.
 *
 * Axis conventions (derived from GLB mesh positions):
 *   +Z → front of room  (wall_front lives here)
 *   -Z → rear of room   (wall_rear lives here)
 *   -X → left of room   (wall_left, cabinet_left live here)
 *   +X → right of room  (cabinet_right lives here; no named wall_right)
 *
 * Rule: hide ceiling (always) + every shell element that sits between the
 * camera and the room interior — i.e. the corner-facing walls/cabinets.
 *
 * To adjust after visual testing, edit the arrays below.
 * Eligible names: ceiling, wall_left, wall_front, wall_rear, cabinet_left, cabinet_right
 */
export const OVERALL_BLOCKERS = {
  //             camera at +X, +Z  →  front-right corner visible
  "front-right": ["ceiling", "wall_front", "cabinet_right"],
  //             camera at -X, +Z  →  front-left corner visible
  "front-left":  ["ceiling", "wall_front", "wall_left", "cabinet_left"],
  //             camera at +X, -Z  →  rear-right corner visible
  "rear-right":  ["ceiling", "wall_rear", "cabinet_right"],
  //             camera at -X, -Z  →  rear-left corner visible
  "rear-left":   ["ceiling", "wall_rear", "wall_left", "cabinet_left"],
}

/**
 * Classifies the camera into one of four quadrants relative to the orbit target.
 *
 * dx = camera.x - target.x  (positive → right side of room)
 * dz = camera.z - target.z  (positive → front side of room)
 *
 * @param {THREE.Vector3} cameraPos
 * @param {THREE.Vector3} target
 * @returns {"front-right" | "front-left" | "rear-right" | "rear-left"}
 */
export function computeOverallQuadrant(cameraPos, target) {
  const dx = cameraPos.x - target.x
  const dz = cameraPos.z - target.z
  const isFront = dz >= 0
  const isRight = dx >= 0
  if (isFront && isRight)  return "front-right"
  if (isFront && !isRight) return "front-left"
  if (!isFront && isRight) return "rear-right"
  return "rear-left"
}

/** O(1) lookup by view id. */
export const PRESET_BY_VIEW_ID = Object.fromEntries(
  VIEW_PRESETS.map((v) => [v.id, v])
)

/**
 * Applies visibility rules from a view preset to the scene graph.
 *
 * Strategy:
 *   1. Reset all meshes to visible.
 *   2. For each object whose name is in preset.hidden, hide that object AND
 *      its entire subtree via obj.traverse(). This correctly handles GLB files
 *      where a named object (e.g. "ceiling") is a Group with unnamed child
 *      meshes — child meshes are hidden too, preventing invisible geometry
 *      from being hit by raycasting.
 *
 * Uses obj.name for identification; names must match GLB object names exactly.
 *
 * @param {THREE.Object3D}   scene
 * @param {object}           preset — a VIEW_PRESETS entry
 */
export function applyViewVisibility(scene, preset) {
  if (!scene || !preset) return
  const hiddenSet = new Set(preset.hidden)

  // Pass 1: restore all meshes to visible.
  scene.traverse((obj) => {
    if (obj.isMesh) obj.visible = true
  })

  // Pass 2: hide each named hidden object and every descendant it contains.
  scene.traverse((obj) => {
    if (!hiddenSet.has(obj.name)) return
    obj.traverse((child) => { child.visible = false })
  })
}
