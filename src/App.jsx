import { useEffect, useRef, useState } from "react"
import { Canvas, useThree, useFrame } from "@react-three/fiber"
import { OrbitControls, Center, useGLTF } from "@react-three/drei"
import * as THREE from "three"

import { PRESET_BY_ID, PRESETS_BY_FAMILY } from "./materialLibrary"
import { buildMaterialFromPreset } from "./materialUtils"
import { getCategoryFromName, getFamiliesForCategory } from "./categoryMap"
import { VIEW_PRESETS, PRESET_BY_VIEW_ID, applyViewVisibility, OVERALL_BLOCKERS, computeOverallQuadrant } from "./viewPresets"

// ── Scene utilities (require Canvas / useThree context) ──────────────────────

/**
 * Moves the camera and OrbitControls target when the active view preset changes.
 * Declared inside Canvas so it can use useThree.
 */
function SceneController({ viewPreset, orbitRef }) {
  const { camera } = useThree()

  useEffect(() => {
    const [px, py, pz] = viewPreset.camera.position
    const [tx, ty, tz] = viewPreset.camera.target
    camera.position.set(px, py, pz)
    if (orbitRef.current) {
      orbitRef.current.target.set(tx, ty, tz)
      orbitRef.current.update()
    }
  }, [viewPreset, camera, orbitRef])

  return null
}

/**
 * Dynamically hides the camera-facing enclosure wall as the user orbits in the
 * overall view. Runs every frame but only triggers a scene traversal when the
 * camera crosses into a new quadrant (throttled via lastSideRef).
 */
function DynamicBlockers({ sceneRef, orbitRef }) {
  const { camera } = useThree()
  const lastSideRef = useRef(null)

  useFrame(() => {
    if (!sceneRef.current) return
    const target = orbitRef.current?.target ?? new THREE.Vector3(0, 1, 0)
    const quadrant = computeOverallQuadrant(camera.position, target)
    if (quadrant === lastSideRef.current) return
    lastSideRef.current = quadrant
    applyViewVisibility(sceneRef.current, { hidden: OVERALL_BLOCKERS[quadrant] })
  })

  return null
}

// ── Base material palette ─────────────────────────────────────────────────────
//
// DEFAULT_MATERIAL  — applied to every mesh on load and after reset.
//                     Dark neutral gray; feels architectural, not plastic.
// SELECTED_MATERIAL — replaces the active mesh while it is highlighted.
//                     Lighter gray; clearly different from default without
//                     using any saturated or neon color.
//
// Both are module-level singletons. All meshes can share the same instance
// because we never mutate per-mesh properties on these materials.
// To adjust: change the `color`, `roughness`, or `metalness` values here.

const DEFAULT_MATERIAL = new THREE.MeshStandardMaterial({
  color:     "#e0e0e0",
  roughness: 0.9,
  metalness: 0.0,
  side: THREE.DoubleSide,
})

const SELECTED_MATERIAL = new THREE.MeshStandardMaterial({
  color:     "#3d3d3d",
  roughness: 0.85,
  metalness: 0.05,
  side: THREE.DoubleSide,
})

// ── Room model ────────────────────────────────────────────────────────────────

function RoomModel({ onSelect, lastClickedRef, sceneRef, viewPreset }) {
  const { scene } = useGLTF("/models/room-v1.glb")

  // 1. Override GLB materials with DEFAULT_MATERIAL and store it as the
  //    restore target. Must run before the visibility effect below.
  useEffect(() => {
    sceneRef.current = scene
    scene.traverse((obj) => {
      if (!obj.isMesh) return
      obj.material = DEFAULT_MATERIAL
      obj.userData.originalMaterial = DEFAULT_MATERIAL
    })
  }, [scene, sceneRef])

  // 2. Apply visibility after materials are stored (React runs same-component
  //    effects in declaration order). Re-runs on view change.
  useEffect(() => {
    applyViewVisibility(scene, viewPreset)
  }, [scene, viewPreset])

  const handleClick = (e) => {
    e.stopPropagation()
    const clicked = e.object

    // Guard: skip invisible meshes. Three.js raycasting respects visible=false
    // on the mesh itself, but a GLB Group wrapper may leave child meshes
    // technically visible to the raycaster even when the parent is hidden.
    // This check catches both cases cleanly.
    if (!clicked.visible) return

    // Restore the previous object's display material before moving selection.
    if (lastClickedRef.current && lastClickedRef.current !== clicked) {
      const prev = lastClickedRef.current
      prev.material = prev.userData.currentMaterial ?? prev.userData.originalMaterial
    }

    clicked.material = SELECTED_MATERIAL
    lastClickedRef.current = clicked
    onSelect(clicked)
  }

  return <primitive object={scene} onClick={handleClick} />
}

// ── Main app ─────────────────────────────────────────────────────────────────

function App() {
  const [selectedObject, setSelectedObject] = useState(null)
  const [config, setConfig]               = useState({})
  const [savedA, setSavedA]               = useState(null)
  const [savedB, setSavedB]               = useState(null)
  const [activeVersion, setActiveVersion] = useState(null)
  const [currentView, setCurrentView]     = useState("overall")

  const lastClickedRef     = useRef(null)
  const sceneRef           = useRef(null)
  const cachedMaterialsRef = useRef({})
  const orbitRef           = useRef(null)

  const viewPreset = PRESET_BY_VIEW_ID[currentView]

  // ── View navigation ───────────────────────────────────────────────────────

  const handleViewChange = (presetId) => {
    const preset = PRESET_BY_VIEW_ID[presetId]
    if (!preset) return

    // Clear selection if the selected object will be hidden in the new view.
    if (selectedObject && preset.hidden.includes(selectedObject.name)) {
      if (lastClickedRef.current) {
        const prev = lastClickedRef.current
        prev.material = prev.userData.currentMaterial ?? prev.userData.originalMaterial
        lastClickedRef.current = null
      }
      setSelectedObject(null)
    }

    setCurrentView(presetId)
  }

  // ── Scene actions ─────────────────────────────────────────────────────────

  const handleReset = () => {
    if (!sceneRef.current) return
    sceneRef.current.traverse((obj) => {
      if (!obj.isMesh) return
      obj.userData.currentMaterial = null
      obj.material = obj.userData.originalMaterial
      // obj.visible is managed by the view preset — do not touch it here.
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
      selectedObject.material = SELECTED_MATERIAL
    } else {
      selectedObject.material = material
    }

    setConfig((prev) => ({ ...prev, [category]: presetId }))
    setActiveVersion(null)
  }

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
        // Visibility is owned by the view preset — applyConfig does not touch it.
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

  const visiblePresets = allowedFamilies.flatMap((f) => PRESETS_BY_FAMILY[f] ?? [])

  // ── Shared button style helpers ───────────────────────────────────────────

  const btnBase = {
    border: "1px solid #e0e0e0",
    borderRadius: "6px",
    padding: "5px 10px",
    fontSize: "12px",
    cursor: "pointer",
    background: "white",
    color: "#333",
  }

  const btnActive = {
    ...btnBase,
    background: "#222",
    color: "white",
    borderColor: "#222",
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      width: "100vw",
      height: "100vh",
      position: "relative",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>

      {/* ── Left panel: Selection + Finish ────────────────────────────── */}
      <div style={{
        position: "absolute",
        top: 20,
        left: 20,
        width: 220,
        background: "rgba(255,255,255,0.9)",
        backdropFilter: "blur(10px)",
        padding: "16px",
        borderRadius: "12px",
        boxShadow: "0 2px 16px rgba(0,0,0,0.07)",
        fontSize: "13px",
        zIndex: 10,
      }}>
        {selectedObject ? (
          <>
            <div style={{ fontWeight: 600, marginBottom: 2, fontSize: 14 }}>
              {selectedObject.name}
            </div>
            <div style={{ color: "#999", marginBottom: 16, fontSize: 11 }}>
              {selectedCategory ?? "uncategorized"}
            </div>

            {visiblePresets.length > 0 ? (
              <>
                <div style={{
                  fontWeight: 600,
                  marginBottom: 10,
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#aaa",
                }}>
                  Finish
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {visiblePresets.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => applyPreset(p.id)}
                      style={btnBase}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ color: "#ccc", fontSize: 12 }}>
                No finish options for this surface.
              </div>
            )}
          </>
        ) : (
          <div style={{ color: "#bbb", fontSize: 12, textAlign: "center", padding: "6px 0" }}>
            Click a surface to apply a finish
          </div>
        )}
      </div>

      {/* ── Right panel: Compare ──────────────────────────────────────── */}
      <div style={{
        position: "absolute",
        top: 20,
        right: 20,
        width: 180,
        background: "rgba(255,255,255,0.9)",
        backdropFilter: "blur(10px)",
        padding: "16px",
        borderRadius: "12px",
        boxShadow: "0 2px 16px rgba(0,0,0,0.07)",
        fontSize: "13px",
        zIndex: 10,
      }}>
        <div style={{
          fontWeight: 600,
          marginBottom: 14,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#aaa",
        }}>
          Compare
        </div>

        {/* Save */}
        <div style={{ display: "flex", gap: "6px", marginBottom: 8 }}>
          <button style={{ ...btnBase, flex: 1 }} onClick={() => setSavedA({ ...config })}>Save A</button>
          <button style={{ ...btnBase, flex: 1 }} onClick={() => setSavedB({ ...config })}>Save B</button>
        </div>

        {/* View */}
        <div style={{ display: "flex", gap: "6px", marginBottom: 12 }}>
          <button
            onClick={() => applyConfig(savedA).then(() => setActiveVersion("A"))}
            disabled={!savedA}
            style={{
              ...(activeVersion === "A" ? btnActive : btnBase),
              flex: 1,
              opacity: savedA ? 1 : 0.35,
              cursor: savedA ? "pointer" : "default",
            }}
          >
            A
          </button>
          <button
            onClick={() => applyConfig(savedB).then(() => setActiveVersion("B"))}
            disabled={!savedB}
            style={{
              ...(activeVersion === "B" ? btnActive : btnBase),
              flex: 1,
              opacity: savedB ? 1 : 0.35,
              cursor: savedB ? "pointer" : "default",
            }}
          >
            B
          </button>
          <button style={{ ...btnBase, flex: 1, color: "#888" }} onClick={handleReset}>
            Reset
          </button>
        </div>

        {activeVersion && (
          <div style={{ fontSize: 11, color: "#bbb", textAlign: "center" }}>
            Version {activeVersion}
          </div>
        )}
      </div>

      {/* ── Bottom nav: View presets ──────────────────────────────────── */}
      <div style={{
        position: "absolute",
        bottom: 28,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        gap: "2px",
        background: "rgba(255,255,255,0.9)",
        backdropFilter: "blur(10px)",
        padding: "5px",
        borderRadius: "40px",
        boxShadow: "0 2px 14px rgba(0,0,0,0.08)",
        zIndex: 10,
      }}>
        {VIEW_PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => handleViewChange(preset.id)}
            style={{
              background: currentView === preset.id ? "#222" : "transparent",
              color: currentView === preset.id ? "white" : "#666",
              border: "none",
              borderRadius: "32px",
              padding: "7px 20px",
              fontSize: "13px",
              fontWeight: currentView === preset.id ? 500 : 400,
              cursor: "pointer",
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* ── 3D Canvas ─────────────────────────────────────────────────── */}
      <Canvas
        camera={{ position: [4.5, 4, 6], fov: 55 }}
        onPointerMissed={handleBackgroundClick}
      >
        {/* Soft neutral scene background */}
        <color attach="background" args={["#eeece9"]} />

        <SceneController viewPreset={viewPreset} orbitRef={orbitRef} />
        {currentView === "overall" && (
          <DynamicBlockers sceneRef={sceneRef} orbitRef={orbitRef} />
        )}

        <ambientLight intensity={1.5} />
        <directionalLight position={[6, 8, 6]}  intensity={2.0} />
        <directionalLight position={[-4, 5, -2]} intensity={0.6} />

        <Center>
          <RoomModel
            onSelect={setSelectedObject}
            lastClickedRef={lastClickedRef}
            sceneRef={sceneRef}
            viewPreset={viewPreset}
          />
        </Center>

        <OrbitControls
          ref={orbitRef}
          target={[0, 1, 0]}
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
