import { useEffect, useRef, useState } from "react"
import { Canvas } from "@react-three/fiber"
import { OrbitControls, Center, useGLTF } from "@react-three/drei"
import * as THREE from "three"

const MATERIAL_OPTIONS = {
  wall: [
    { label: "Warm White", color: "#F3EFE6" },
    { label: "Soft Gray", color: "#D6D3CE" },
    { label: "Clay Beige", color: "#D8C1A0" },
  ],
  floor: [
    { label: "Light Oak", color: "#C9A679", textureType: "wood" },
    { label: "Walnut", color: "#7A5A3A", textureType: "wood" },
    { label: "Concrete", color: "#8C8C88", textureType: "concrete" },
  ],
  cabinet: [
    { label: "White Matte", color: "#F4F2EE" },
    { label: "Ash Wood", color: "#B99973", textureType: "wood" },
    { label: "Charcoal", color: "#444444" },
  ],
  door: [
    { label: "White", color: "#EFEDE8" },
    { label: "Wood", color: "#8B6A4E", textureType: "wood" },
    { label: "Dark", color: "#3A3A3A" },
  ],
}

function getTextureTypeFromColor(category, color) {
  const options = MATERIAL_OPTIONS[category] || []
  const opt = options.find((o) => o.color === color)
  return opt?.textureType || null
}

function seededRng(seed) {
  let s = (seed * 1664525 + 1013904223) & 0x7fffffff
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff
    return s / 0x7fffffff
  }
}

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

function generateWoodTexture(hexColor) {
  const size = 512
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  const rng = seededRng(parseInt(hexColor.replace("#", ""), 16))
  const [r, g, b] = hexToRgb(hexColor)

  ctx.fillStyle = hexColor
  ctx.fillRect(0, 0, size, size)

  // Subtle tonal wash — plank-level light variation
  const wash = ctx.createLinearGradient(0, 0, size, 0)
  wash.addColorStop(0,   `rgba(${Math.min(255,r+10)},${Math.min(255,g+7)},${Math.min(255,b+4)},0.10)`)
  wash.addColorStop(0.5, `rgba(${Math.max(0,r-7)},${Math.max(0,g-5)},${Math.max(0,b-3)},0.07)`)
  wash.addColorStop(1,   `rgba(${Math.min(255,r+8)},${Math.min(255,g+5)},${Math.min(255,b+3)},0.09)`)
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, size, size)

  // Major grain bands — fewer, wider, softer alpha
  const grainCount = 20
  for (let i = 0; i < grainCount; i++) {
    const x = (i / grainCount) * size + (rng() - 0.5) * 14
    const lineWidth = 5 + rng() * 12
    const bright = (rng() - 0.5) * 18
    const gr = Math.max(0, Math.min(255, r + bright))
    const gg = Math.max(0, Math.min(255, g + bright))
    const gb = Math.max(0, Math.min(255, b + bright))

    ctx.beginPath()
    ctx.strokeStyle = `rgba(${gr},${gg},${gb},0.28)`
    ctx.lineWidth = lineWidth
    let cx = x
    ctx.moveTo(cx, 0)
    for (let y = 0; y <= size; y += size / 5) {
      cx += (rng() - 0.5) * 3
      ctx.lineTo(cx, y)
    }
    ctx.stroke()
  }

  // Fine grain — sparse, barely visible
  for (let i = 0; i < 30; i++) {
    const x = rng() * size
    const bright = (rng() - 0.5) * 10
    const gr = Math.max(0, Math.min(255, r + bright))
    const gg = Math.max(0, Math.min(255, g + bright))
    const gb = Math.max(0, Math.min(255, b + bright))

    ctx.beginPath()
    ctx.strokeStyle = `rgba(${gr},${gg},${gb},0.11)`
    ctx.lineWidth = 0.5 + rng() * 0.8
    ctx.moveTo(x, 0)
    ctx.lineTo(x + (rng() - 0.5) * 10, size)
    ctx.stroke()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
}

function generateConcreteTexture(hexColor) {
  const size = 512
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  const rng = seededRng(parseInt(hexColor.replace("#", ""), 16))
  const [r, g, b] = hexToRgb(hexColor)

  ctx.fillStyle = hexColor
  ctx.fillRect(0, 0, size, size)

  // Soft aggregate patches — simulate poured concrete variation
  for (let i = 0; i < 120; i++) {
    const x = rng() * size
    const y = rng() * size
    const w = 10 + rng() * 35
    const h = 10 + rng() * 35
    const v = (rng() - 0.5) * 10
    const cr = Math.max(0, Math.min(255, r + v))
    const cg = Math.max(0, Math.min(255, g + v))
    const cb = Math.max(0, Math.min(255, b + v))
    ctx.fillStyle = `rgba(${cr},${cg},${cb},0.10)`
    ctx.fillRect(x, y, w, h)
  }

  // Sparse fine speckle — just enough to break flatness
  for (let i = 0; i < 2800; i++) {
    const x = rng() * size
    const y = rng() * size
    const v = (rng() - 0.5) * 15
    const cr = Math.max(0, Math.min(255, r + v))
    const cg = Math.max(0, Math.min(255, g + v))
    const cb = Math.max(0, Math.min(255, b + v))
    ctx.fillStyle = `rgba(${cr},${cg},${cb},0.20)`
    ctx.fillRect(x, y, 1 + rng(), 1 + rng())
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
}

function getCategoryFromName(name) {
  if (!name) return null

  const lower = name.toLowerCase()

  if (lower.includes("wall")) return "wall"
  if (lower.includes("floor")) return "floor"
  if (lower.includes("cabinet")) return "cabinet"
  if (lower.includes("door")) return "door"

  return null
}

function createMaterialByCategory(category, color, textureType) {
  let map = null
  if (textureType === "wood") {
    map = generateWoodTexture(color)
    // Floor planks read best at 2×2; cabinet/door panels at 1.5×1.5 (larger = calmer)
    map.repeat.set(category === "floor" ? 2 : 1.5, category === "floor" ? 2 : 1.5)
  } else if (textureType === "concrete") {
    map = generateConcreteTexture(color)
    map.repeat.set(2, 2)
  }

  const base = {
    color: map ? "#ffffff" : color,
    map,
    side: THREE.DoubleSide,
  }

  if (category === "wall") {
    // Matte emulsion paint
    return new THREE.MeshStandardMaterial({ ...base, roughness: 0.93, metalness: 0.0 })
  }

  if (category === "floor") {
    // Lightly finished hardwood / brushed concrete
    return new THREE.MeshStandardMaterial({ ...base, roughness: 0.68, metalness: 0.02 })
  }

  if (category === "cabinet") {
    // Satin lacquer — present but not glossy
    return new THREE.MeshStandardMaterial({ ...base, roughness: 0.65, metalness: 0.03 })
  }

  if (category === "door") {
    // Semi-matte painted or oiled wood
    return new THREE.MeshStandardMaterial({ ...base, roughness: 0.72, metalness: 0.02 })
  }

  return new THREE.MeshStandardMaterial({ ...base, roughness: 0.80, metalness: 0.02 })
}

function createHighlightMaterial() {
  return new THREE.MeshStandardMaterial({
    color: "#F59E0B",
    side: THREE.DoubleSide,
    roughness: 0.5,
    metalness: 0.05,
  })
}

function RoomModel({ onSelect, lastClickedRef, sceneRef }) {
  const { scene } = useGLTF("/models/room-v1.glb")

  useEffect(() => {
    sceneRef.current = scene

    scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.userData.originalMaterial = obj.material
      }
    })
  }, [scene, sceneRef])

  const handleClick = (e) => {
    e.stopPropagation()

    const clicked = e.object

    if (
      lastClickedRef.current &&
      lastClickedRef.current !== clicked &&
      lastClickedRef.current.userData.currentMaterial
    ) {
      lastClickedRef.current.material =
        lastClickedRef.current.userData.currentMaterial
    } else if (
      lastClickedRef.current &&
      lastClickedRef.current !== clicked &&
      lastClickedRef.current.userData.originalMaterial
    ) {
      lastClickedRef.current.material =
        lastClickedRef.current.userData.originalMaterial
    }

    clicked.material = createHighlightMaterial()
    lastClickedRef.current = clicked
    onSelect(clicked)
  }

  return <primitive object={scene} onClick={handleClick} />
}

function App() {
  const [selectedObject, setSelectedObject] = useState(null)
  const [config, setConfig] = useState({})
  const [savedA, setSavedA] = useState(null)
  const [savedB, setSavedB] = useState(null)
  const [activeVersion, setActiveVersion] = useState(null)

  const lastClickedRef = useRef(null)
  const sceneRef = useRef(null)

  // 🔁 SOFT RESET
  const handleReset = () => {
    if (!sceneRef.current) return

    sceneRef.current.traverse((obj) => {
      if (!obj.isMesh) return

      if (obj.userData.originalMaterial) {
        obj.userData.currentMaterial = null
        obj.material = obj.userData.originalMaterial
      }
    })

    lastClickedRef.current = null
    setSelectedObject(null)
    setConfig({})
    setActiveVersion(null)
  }

  const handleBackgroundClick = () => {
    if (
      lastClickedRef.current &&
      lastClickedRef.current.userData.currentMaterial
    ) {
      lastClickedRef.current.material =
        lastClickedRef.current.userData.currentMaterial
    } else if (
      lastClickedRef.current &&
      lastClickedRef.current.userData.originalMaterial
    ) {
      lastClickedRef.current.material =
        lastClickedRef.current.userData.originalMaterial
    }

    lastClickedRef.current = null
    setSelectedObject(null)
  }

  const getSelectedName = () => {
    if (!selectedObject) return "nothing selected"
    return selectedObject.name || "unnamed object"
  }

  const getSelectedCategory = () => {
    if (!selectedObject?.name) return null
    return getCategoryFromName(selectedObject.name)
  }

  const applyMaterial = (color, textureType) => {
    if (!selectedObject) return

    const category = getSelectedCategory()
    if (!category) return

    const newMaterial = createMaterialByCategory(category, color, textureType)

    selectedObject.userData.currentMaterial = newMaterial
    selectedObject.material = newMaterial

    setConfig((prev) => ({
      ...prev,
      [category]: color,
    }))

    if (lastClickedRef.current === selectedObject) {
      lastClickedRef.current.material = createHighlightMaterial()
    }

    setActiveVersion(null)
  }

  const applyConfig = (cfg) => {
    if (!cfg || !sceneRef.current) return

    sceneRef.current.traverse((obj) => {
      if (!obj.isMesh) return

      const category = getCategoryFromName(obj.name)

      if (category && cfg[category]) {
        const color = cfg[category]
        const newMaterial = createMaterialByCategory(category, color, getTextureTypeFromColor(category, color))
        obj.userData.currentMaterial = newMaterial
        obj.material = newMaterial
      } else if (obj.userData.originalMaterial) {
        obj.userData.currentMaterial = null
        obj.material = obj.userData.originalMaterial
      }
    })

    lastClickedRef.current = null
    setSelectedObject(null)
    setConfig({ ...cfg })
  }

  const selectedCategory = getSelectedCategory()
  const visibleOptions = selectedCategory
    ? MATERIAL_OPTIONS[selectedCategory] || []
    : []

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          zIndex: 10,
          background: "white",
          padding: "12px 16px",
          borderRadius: "8px",
          fontFamily: "sans-serif",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          minWidth: "280px",
        }}
      >
        <div style={{ fontWeight: "bold", marginBottom: 8 }}>Selected</div>
        <div style={{ marginBottom: 4 }}>{getSelectedName()}</div>
        <div style={{ marginBottom: 12, color: "#666" }}>
          {selectedCategory ? `Category: ${selectedCategory}` : "No category"}
        </div>

        <div style={{ fontWeight: "bold", marginBottom: 8 }}>Compare</div>

        <div style={{ display: "flex", gap: "8px", marginBottom: 12 }}>
          <button onClick={() => setSavedA({ ...config })}>Save A</button>
          <button onClick={() => setSavedB({ ...config })}>Save B</button>
        </div>

        <div style={{ display: "flex", gap: "8px", marginBottom: 10 }}>
          <button
            onClick={() => {
              applyConfig(savedA)
              setActiveVersion("A")
            }}
            disabled={!savedA}
            style={{
              background: activeVersion === "A" ? "#333" : "white",
              color: activeVersion === "A" ? "white" : "black",
            }}
          >
            View A
          </button>

          <button
            onClick={() => {
              applyConfig(savedB)
              setActiveVersion("B")
            }}
            disabled={!savedB}
            style={{
              background: activeVersion === "B" ? "#333" : "white",
              color: activeVersion === "B" ? "white" : "black",
            }}
          >
            View B
          </button>

          <button onClick={handleReset}>Reset</button>
        </div>

        <div style={{ marginBottom: 16, fontSize: 12, color: "#666" }}>
          {activeVersion
            ? `Currently viewing Version ${activeVersion}`
            : "No version selected"}
        </div>

        <div style={{ fontWeight: "bold", marginBottom: 8 }}>
          Finish Options
        </div>

        {visibleOptions.length > 0 ? (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {visibleOptions.map((option) => (
              <button
                key={option.label}
                onClick={() => applyMaterial(option.color, option.textureType)}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ color: "#888" }}>
            Select an object to see finish options
          </div>
        )}
      </div>

      <Canvas camera={{ position: [0, 1.6, 4], fov: 60 }} onPointerMissed={handleBackgroundClick}>
        <ambientLight intensity={1.6} />
        <directionalLight position={[6, 8, 6]} intensity={2.2} />
        <directionalLight position={[-4, 5, -2]} intensity={0.8} />

        <Center>
          <RoomModel
            onSelect={setSelectedObject}
            lastClickedRef={lastClickedRef}
            sceneRef={sceneRef}
          />
        </Center>

        <OrbitControls
          target={[0, 1.2, 0]}
          enablePan
          enableZoom
          enableRotate
          screenSpacePanning
        />
      </Canvas>
    </div>
  )
}

export default App