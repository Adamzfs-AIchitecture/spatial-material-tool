import { useEffect, useRef, useState } from "react"
import { Canvas } from "@react-three/fiber"
import { OrbitControls, Center, useGLTF } from "@react-three/drei"
import * as THREE from "three"

import { PRESET_BY_ID, PRESETS_BY_FAMILY } from "./materialLibrary"
import { buildMaterialFromPreset } from "./materialUtils"
import { getCategoryFromName, getFamiliesForCategory } from "./categoryMap"

// ── Highlight material (applied while an object is actively selected) ────────

function createHighlightMaterial() {
  return new THREE.MeshStandardMaterial({
    color: "#F59E0B",
    side: THREE.DoubleSide,
    roughness: 0.5,
    metalness: 0.05,
  })
}

// ── 3-D scene: room model with click handling ────────────────────────────────

function RoomModel({ onSelect, lastClickedRef, sceneRef }) {
  const { scene } = useGLTF("/models/room-v1.glb")

  useEffect(() => {
    sceneRef.current = scene
    scene.traverse((obj) => {
      if (obj.isMesh) obj.userData.originalMaterial = obj.material
    })
  }, [scene, sceneRef])

  const handleClick = (e) => {
    e.stopPropagation()
    const clicked = e.object

    // Restore previous object's material before switching selection.
    if (lastClickedRef.current && lastClickedRef.current !== clicked) {
      const prev = lastClickedRef.current
      prev.material = prev.userData.currentMaterial ?? prev.userData.originalMaterial
    }

    clicked.material = createHighlightMaterial()
    lastClickedRef.current = clicked
    onSelect(clicked)
  }

  return <primitive object={scene} onClick={handleClick} />
}

// ── Main app ─────────────────────────────────────────────────────────────────

function App() {
  const [selectedObject, setSelectedObject] = useState(null)

  // Saved config: { category: presetId }  e.g. { wall: "plaster-warm-white" }
  const [config, setConfig]           = useState({})
  const [savedA, setSavedA]           = useState(null)
  const [savedB, setSavedB]           = useState(null)
  const [activeVersion, setActiveVersion] = useState(null)

  const lastClickedRef    = useRef(null)
  const sceneRef          = useRef(null)
  // Cache built materials by presetId so each is only created once.
  const cachedMaterialsRef = useRef({})

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleReset = () => {
    if (!sceneRef.current) return
    sceneRef.current.traverse((obj) => {
      if (!obj.isMesh) return
      obj.userData.currentMaterial = null
      obj.material = obj.userData.originalMaterial
    })
    lastClickedRef.current = null
    setSelectedObject(null)
    setConfig({})
    setActiveVersion(null)
  }

  const handleBackgroundClick = () => {
    if (lastClickedRef.current) {
      const prev = lastClickedRef.current
      prev.material = prev.userData.currentMaterial ?? prev.userData.originalMaterial
      lastClickedRef.current = null
    }
    setSelectedObject(null)
  }

  /**
   * Applies a preset to the currently selected object.
   * Stores the material in userData.currentMaterial so the highlight/restore
   * cycle keeps working correctly.
   */
  const applyPreset = async (presetId) => {
    if (!selectedObject) return
    const category = getCategoryFromName(selectedObject.name)
    if (!category) return

    const preset = PRESET_BY_ID[presetId]
    if (!preset) return

    const material =
      cachedMaterialsRef.current[presetId] ??
      (await buildMaterialFromPreset(preset))

    selectedObject.userData.currentMaterial = material

    // Keep the highlight visible while the object is still selected.
    if (lastClickedRef.current === selectedObject) {
      selectedObject.material = createHighlightMaterial()
    } else {
      selectedObject.material = material
    }

    setConfig((prev) => ({ ...prev, [category]: presetId }))
    setActiveVersion(null)
  }

  /**
   * Re-applies a saved config (map of category → presetId) to every mesh
   * in the scene. Meshes whose category has no saved preset are reset to
   * their original material.
   *
   * @returns {Promise<void>}
   */
  const applyConfig = async (cfg) => {
    if (!cfg || !sceneRef.current) return Promise.resolve()

    const meshes = []
    sceneRef.current.traverse((obj) => { if (obj.isMesh) meshes.push(obj) })

    await Promise.all(
      meshes.map(async (obj) => {
        const category = getCategoryFromName(obj.name)
        const presetId = category ? cfg[category] : null

        if (presetId) {
          const preset = PRESET_BY_ID[presetId]
          if (!preset) return
          const material =
            cachedMaterialsRef.current[presetId] ??
            (await buildMaterialFromPreset(preset))
          obj.userData.currentMaterial = material
          obj.material = material
        } else {
          obj.userData.currentMaterial = null
          obj.material = obj.userData.originalMaterial
        }
      })
    )

    lastClickedRef.current = null
    setSelectedObject(null)
    setConfig({ ...cfg })
  }

  // ── Derived UI state ──────────────────────────────────────────────────────

  const selectedCategory = selectedObject?.name
    ? getCategoryFromName(selectedObject.name)
    : null

  const allowedFamilies = selectedCategory
    ? getFamiliesForCategory(selectedCategory)
    : []

  // Flatten presets for each allowed family, preserving family order.
  const visiblePresets = allowedFamilies.flatMap((f) => PRESETS_BY_FAMILY[f] ?? [])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>

      {/* ── UI Panel ──────────────────────────────────────────────────── */}
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
        {/* Selection info */}
        <div style={{ fontWeight: "bold", marginBottom: 8 }}>Selected</div>
        <div style={{ marginBottom: 4 }}>
          {selectedObject?.name ?? "nothing selected"}
        </div>
        <div style={{ marginBottom: 12, color: "#666" }}>
          {selectedCategory ? `Category: ${selectedCategory}` : "No category"}
        </div>

        {/* A/B compare */}
        <div style={{ fontWeight: "bold", marginBottom: 8 }}>Compare</div>
        <div style={{ display: "flex", gap: "8px", marginBottom: 12 }}>
          <button onClick={() => setSavedA({ ...config })}>Save A</button>
          <button onClick={() => setSavedB({ ...config })}>Save B</button>
        </div>

        <div style={{ display: "flex", gap: "8px", marginBottom: 10 }}>
          <button
            onClick={() => applyConfig(savedA).then(() => setActiveVersion("A"))}
            disabled={!savedA}
            style={{
              background: activeVersion === "A" ? "#333" : "white",
              color:      activeVersion === "A" ? "white" : "black",
            }}
          >
            View A
          </button>
          <button
            onClick={() => applyConfig(savedB).then(() => setActiveVersion("B"))}
            disabled={!savedB}
            style={{
              background: activeVersion === "B" ? "#333" : "white",
              color:      activeVersion === "B" ? "white" : "black",
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

        {/* Finish options */}
        <div style={{ fontWeight: "bold", marginBottom: 8 }}>Finish Options</div>
        {visiblePresets.length > 0 ? (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {visiblePresets.map((preset) => (
              <button key={preset.id} onClick={() => applyPreset(preset.id)}>
                {preset.label}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ color: "#888" }}>
            Select an object to see finish options
          </div>
        )}
      </div>

      {/* ── 3D Canvas ─────────────────────────────────────────────────── */}
      <Canvas
        camera={{ position: [0, 1.6, 4], fov: 60 }}
        onPointerMissed={handleBackgroundClick}
      >
        <ambientLight intensity={1.6} />
        <directionalLight position={[6, 8, 6]}  intensity={2.2} />
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
