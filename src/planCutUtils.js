import * as THREE from "three"

export const PLAN_CUT_HEIGHT = 1.0

const EPS = 1e-5
const ROUND = 0.001

const WALLS = [
  { name: "wall_rear", side: "rear" },
  { name: "wall_right", side: "right" },
  { name: "wall_front", side: "front" },
  { name: "wall_left", side: "left" },
]

function clean(p) {
  return {
    x: Math.round(p.x / ROUND) * ROUND,
    z: Math.round(p.z / ROUND) * ROUND,
  }
}

function samePoint(a, b, eps = 0.03) {
  return Math.hypot(a.x - b.x, a.z - b.z) < eps
}

function intersectTriangleAtY(a, b, c, y) {
  const pts = []
  const edges = [
    [a, b],
    [b, c],
    [c, a],
  ]

  for (const [p, q] of edges) {
    const dp = p.y - y
    const dq = q.y - y

    const pOn = Math.abs(dp) < EPS
    const qOn = Math.abs(dq) < EPS

    if (pOn && qOn) continue

    if (pOn) {
      pts.push({ x: p.x, z: p.z })
    } else if (qOn) {
      pts.push({ x: q.x, z: q.z })
    } else if (dp * dq < 0) {
      const t = dp / (dp - dq)
      pts.push({
        x: p.x + t * (q.x - p.x),
        z: p.z + t * (q.z - p.z),
      })
    }
  }

  const unique = []
  for (const p of pts) {
    if (!unique.some((u) => samePoint(u, p, 0.001))) {
      unique.push(clean(p))
    }
  }

  if (unique.length < 2) return null
  return [unique[0], unique[1]]
}

function collectSegments(obj, cutY = PLAN_CUT_HEIGHT) {
  const segments = []

  obj.traverse((child) => {
    if (!child.isMesh) return

    const geo = child.geometry
    if (!geo?.attributes?.position) return

    const pos = geo.attributes.position
    const idx = geo.index
    const mat = child.matrixWorld

    const getVertex = (i) => {
      const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i))
      return v.applyMatrix4(mat)
    }

    const triCount = idx ? idx.count / 3 : pos.count / 3

    for (let i = 0; i < triCount; i++) {
      const ia = idx ? idx.getX(i * 3) : i * 3
      const ib = idx ? idx.getX(i * 3 + 1) : i * 3 + 1
      const ic = idx ? idx.getX(i * 3 + 2) : i * 3 + 2

      const seg = intersectTriangleAtY(
        getVertex(ia),
        getVertex(ib),
        getVertex(ic),
        cutY
      )

      if (seg && !samePoint(seg[0], seg[1])) {
        segments.push(seg)
      }
    }
  })

  return dedupeSegments(segments)
}

function dedupeSegments(segments) {
  const map = new Map()

  const keyPt = (p) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`

  for (const [a, b] of segments) {
    const ka = keyPt(a)
    const kb = keyPt(b)
    const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
    if (!map.has(key)) map.set(key, [a, b])
  }

  return [...map.values()]
}

function allPointsFromSegments(segments) {
  return segments.flatMap(([a, b]) => [a, b])
}

function convexHull(points) {
  if (points.length < 3) return points

  const pts = [...points].sort((a, b) => a.x - b.x || a.z - b.z)

  const cross = (o, a, b) =>
    (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x)

  const lower = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop()
    }
    lower.push(p)
  }

  const upper = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop()
    }
    upper.push(p)
  }

  lower.pop()
  upper.pop()

  return lower.concat(upper)
}

function getBounds(points) {
  return {
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minZ: Math.min(...points.map((p) => p.z)),
    maxZ: Math.max(...points.map((p) => p.z)),
  }
}

function isHorizontal(seg) {
  const [a, b] = seg
  return Math.abs(a.z - b.z) < 0.08 && Math.abs(a.x - b.x) > 0.3
}

function isVertical(seg) {
  const [a, b] = seg
  return Math.abs(a.x - b.x) < 0.08 && Math.abs(a.z - b.z) > 0.3
}

function segmentMid(seg) {
  const [a, b] = seg
  return {
    x: (a.x + b.x) / 2,
    z: (a.z + b.z) / 2,
  }
}

function buildSemanticFootprint(wallSegmentsBySide) {
  const allSegments = Object.values(wallSegmentsBySide).flat()
  const allPts = allPointsFromSegments(allSegments)

  if (allPts.length < 3) return null

  const b = getBounds(allPts)
  const width = b.maxX - b.minX
  const depth = b.maxZ - b.minZ

  const frontSegs = wallSegmentsBySide.front ?? []
  const leftSegs = wallSegmentsBySide.left ?? []

  // Step X: usually the inside vertical edge where the lower room begins.
  let stepX = null

  const frontPts = allPointsFromSegments(frontSegs)
  if (frontPts.length) {
    stepX = Math.min(...frontPts.map((p) => p.x))
  }

  const verticalInterior = leftSegs
    .filter(isVertical)
    .map(segmentMid)
    .filter((p) => p.x > b.minX + width * 0.15 && p.x < b.maxX - width * 0.15)

  if (stepX == null && verticalInterior.length) {
    stepX = verticalInterior.sort((a, b) => a.x - b.x)[0].x
  }

  // Step Z: horizontal notch line on the left wall.
  let stepZ = null

  const horizontalInterior = leftSegs
    .filter(isHorizontal)
    .map(segmentMid)
    .filter((p) => p.z > b.minZ + depth * 0.15 && p.z < b.maxZ - depth * 0.15)

  if (horizontalInterior.length) {
    // Pick the lower/interior horizontal ledge.
    horizontalInterior.sort((a, b) => a.z - b.z)
    stepZ = horizontalInterior[0].z
  }

  // Fallbacks if the mesh does not expose a clean notch.
  if (stepX == null) stepX = b.minX + width * 0.45
  if (stepZ == null) stepZ = b.minZ + depth * 0.45

  const footprint = [
    { x: b.minX, z: b.maxZ },
    { x: b.maxX, z: b.maxZ },
    { x: b.maxX, z: b.minZ },
    { x: stepX, z: b.minZ },
    { x: stepX, z: stepZ },
    { x: b.minX, z: stepZ },
  ]

  return footprint.map(clean)
}

function removeSequentialDuplicates(points) {
  const out = []

  for (const p of points) {
    if (!out.length || !samePoint(out[out.length - 1], p)) {
      out.push(clean(p))
    }
  }

  if (out.length > 2 && samePoint(out[0], out[out.length - 1])) {
    out.pop()
  }

  return out
}

export function derivePlanCut(scene) {
  if (!scene) return null

  scene.updateWorldMatrix(true, true)

  const wallSegmentsBySide = {}
  const wallPresence = {
    front: false,
    rear: false,
    left: false,
    right: false,
  }

  for (const { name, side } of WALLS) {
    const obj = scene.getObjectByName(name)
    if (!obj) continue

    const segments = collectSegments(obj, PLAN_CUT_HEIGHT)
    wallSegmentsBySide[side] = segments
    wallPresence[side] = segments.length > 0

    console.log(`[planCutUtils] ${name}: segments=${segments.length}`)
  }

  let footprint = buildSemanticFootprint(wallSegmentsBySide)

  if (!footprint || footprint.length < 3) {
    const allSegments = Object.values(wallSegmentsBySide).flat()
    const pts = allPointsFromSegments(allSegments)

    if (pts.length < 3) {
      console.warn("[planCutUtils] footprint failed")
      return null
    }

    footprint = convexHull(pts)
  }

  footprint = removeSequentialDuplicates(footprint)

  const bounds = getBounds(footprint)

  console.log("[planCutUtils] footprint:", footprint)

  return {
    footprint,
    sections: [],
    bounds,
    wallPresence,
  }
}