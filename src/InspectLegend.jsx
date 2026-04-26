import { INSPECT_VIEWS } from "./viewModes"

const SIZE = 100
const INSET = 18

const FILL = {
  footprint: "#d6d6d0",
  stroke: "#7f7f79",
  arrow: "#1a1a1a",
  labelActive: "#555",
  labelInactive: "#bbb",
}

const DOT_R = 2.5
const AH = 7
const AW = 3.5
const ARROW_LEN = 20

const f = (n) => +n.toFixed(2)

const VIEW_ARROW = {
  front: { dx: 0, dy: -1 },
  rear: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
}

function getUpperPartCenter(footprint, mapX, mapZ, bounds) {
  const uniqueZ = [...new Set(footprint.map((p) => +p.z.toFixed(3)))].sort(
    (a, b) => a - b
  )

  const maxZ = bounds.maxZ

  // For the L-shape, middle Z is the notch / bottom of upper rectangle.
  // If not available, fallback to whole-room center.
  const stepZ = uniqueZ.length >= 3 ? uniqueZ[1] : (bounds.minZ + bounds.maxZ) / 2

  return {
    x: mapX((bounds.minX + bounds.maxX) / 2),
    y: (mapZ(maxZ) + mapZ(stepZ)) / 2,
  }
}

export default function InspectLegend({ planData, inspectView }) {
  if (!planData?.footprint?.length) return null

  const { footprint, bounds } = planData

  const worldW = bounds.maxX - bounds.minX
  const worldD = bounds.maxZ - bounds.minZ

  if (worldW <= 0 || worldD <= 0) return null

  const available = SIZE - 2 * INSET
  const scale = Math.min(available / worldW, available / worldD)

  const roomPxW = worldW * scale
  const roomPxD = worldD * scale

  const roomLeft = (SIZE - roomPxW) / 2
  const roomTop = (SIZE - roomPxD) / 2
  const roomRight = roomLeft + roomPxW
  const roomBottom = roomTop + roomPxD

  const svgCX = (roomLeft + roomRight) / 2
  const svgCY = (roomTop + roomBottom) / 2

  const mapX = (wx) => roomLeft + ((wx - bounds.minX) / worldW) * roomPxW
  const mapZ = (wz) => roomTop + ((bounds.maxZ - wz) / worldD) * roomPxD

  const toSvgPts = (poly) =>
    poly.map((p) => ({
      x: mapX(p.x),
      y: mapZ(p.z),
    }))

  const ptsAttr = (pts) => pts.map((p) => `${f(p.x)},${f(p.y)}`).join(" ")

  const viewDef = INSPECT_VIEWS.find((v) => v.id === inspectView)
  if (!viewDef) return null

  const arrow = VIEW_ARROW[inspectView] ?? VIEW_ARROW.front

  // Dot/origin = center of the upper rectangle portion of the L-shape.
  const origin = getUpperPartCenter(footprint, mapX, mapZ, bounds)

  const dotX = origin.x
  const dotY = origin.y

  const tipX = dotX + arrow.dx * ARROW_LEN
  const tipY = dotY + arrow.dy * ARROW_LEN

  const baseX = dotX + arrow.dx * (DOT_R + 1)
  const baseY = dotY + arrow.dy * (DOT_R + 1)

  const shaftEndX = tipX - arrow.dx * AH
  const shaftEndY = tipY - arrow.dy * AH

  const px = -arrow.dy * AW
  const py = arrow.dx * AW

  const arrowPath = [
    `M ${f(tipX)} ${f(tipY)}`,
    `L ${f(tipX - arrow.dx * AH + px)} ${f(tipY - arrow.dy * AH + py)}`,
    `L ${f(tipX - arrow.dx * AH - px)} ${f(tipY - arrow.dy * AH - py)}`,
    "Z",
  ].join(" ")

  const labels = [
    { id: "front", x: svgCX, y: roomTop - 6, text: "F" },
    { id: "rear", x: svgCX, y: roomBottom + 11, text: "Re" },
    { id: "left", x: roomLeft - 9, y: svgCY + 3.5, text: "L" },
    { id: "right", x: roomRight + 9, y: svgCY + 3.5, text: "R" },
  ]

  return (
    <div
      style={{
        position: "absolute",
        bottom: 24,
        left: 20,
        zIndex: 10,
        background: "rgba(255,255,255,0.94)",
        backdropFilter: "blur(10px)",
        borderRadius: "10px",
        padding: "10px 10px 8px",
        boxShadow: "0 2px 14px rgba(0,0,0,0.08)",
      }}
    >
      <svg width={SIZE} height={SIZE} style={{ display: "block" }}>
        <polygon
          points={ptsAttr(toSvgPts(footprint))}
          fill={FILL.footprint}
          stroke={FILL.stroke}
          strokeWidth={1.4}
          strokeLinejoin="round"
        />

        <line
          x1={f(baseX)}
          y1={f(baseY)}
          x2={f(shaftEndX)}
          y2={f(shaftEndY)}
          stroke={FILL.arrow}
          strokeWidth={1.5}
          strokeLinecap="round"
        />

        <path d={arrowPath} fill={FILL.arrow} />

        <circle cx={f(dotX)} cy={f(dotY)} r={DOT_R} fill={FILL.arrow} />

        {labels.map(({ id, x, y, text }) => (
          <text
            key={id}
            x={f(x)}
            y={f(y)}
            textAnchor="middle"
            fontSize="8"
            fontWeight={id === inspectView ? "600" : "400"}
            fill={id === inspectView ? FILL.labelActive : FILL.labelInactive}
            fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
          >
            {text}
          </text>
        ))}
      </svg>

      <div
        style={{
          fontSize: 10,
          color: "#999",
          textAlign: "center",
          letterSpacing: "0.05em",
          marginTop: 2,
        }}
      >
        {viewDef?.label ?? ""}
      </div>
    </div>
  )
}