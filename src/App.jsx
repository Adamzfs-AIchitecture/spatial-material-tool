import { useCallback, useEffect, useRef, useState } from "react"
import { Canvas, useThree } from "@react-three/fiber"
import { OrbitControls, Center, useGLTF, PerspectiveCamera, OrthographicCamera } from "@react-three/drei"
import * as THREE from "three"

import { PRESET_BY_ID, PRESETS_BY_FAMILY } from "./materialLibrary"
import { buildMaterialFromPreset } from "./materialUtils"
import { getCategoryFromName, getFamiliesForCategory } from "./categoryMap"
import {
  EXPLORE_CAMERA,
  EXPLORE_ORBIT,
  EXPLORE_HIDDEN,
  INSPECT_WORLD_WIDTH,
  INSPECT_ZOOM_LIMITS,
  INSPECT_VIEWS,
  INSPECT_VIEW_BY_ID,
  applyVisibility,
  setRaycastEnabled,
} from "./viewModes"

// ── Camera manager ────────────────────────────────────────────────────────────
//
// Explore → perspective camera, free orbit.
// Inspect → orthographic camera, locked controls, parallel elevation.
//
// Both camera components are always mounted. makeDefault toggles between them
// when mode changes, which swaps the active camera in the R3F store. This
// component then re-runs its positioning effect when useThree().camera updates.
//
// CameraManager is placed AFTER the camera JSX elements so that drei's
// makeDefault effects run before CameraManager's positioning effect.

function CameraManager({ mode, inspectPreset, orbitRef }) {
  const { camera, size } = useThree()

  // Keep refs in sync on every render without adding them to effect deps.
  // This lets the effect read the current camera/size values at call-time
  // without treating store-reference churn as a trigger to re-run.
  const cameraRef = useRef(camera)
  const sizeRef   = useRef(size)
  cameraRef.current = camera
  sizeRef.current   = size

  useEffect(() => {
    const cam = cameraRef.current
    const sz  = sizeRef.current

    if (mode === "explore") {
      // Only fires when entering Explore (mode dep changed).
      // User orbit after this point is unaffected — effect won't re-run
      // unless mode changes again.
      if (cam.isPerspectiveCamera) {
        cam.fov = EXPLORE_CAMERA.fov
        cam.updateProjectionMatrix()
      }
      cam.position.set(...EXPLORE_CAMERA.position)
      if (orbitRef.current) {
        orbitRef.current.target.set(...EXPLORE_CAMERA.target)
        orbitRef.current.update()
      }
    } else if (mode === "inspect" && inspectPreset) {
      // Fires when entering Inspect or switching elevation views.
      // Orthographic zoom derived from canvas px width → world-unit framing
      // is canvas-size-independent.
      if (cam.isOrthographicCamera) {
        cam.zoom = sz.width / INSPECT_WORLD_WIDTH
        cam.updateProjectionMatrix()
      }
      cam.position.set(...inspectPreset.camera.position)
      if (orbitRef.current) {
        orbitRef.current.target.set(...inspectPreset.camera.target)
        orbitRef.current.update()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, inspectPreset]) // camera/size intentionally omitted — accessed via refs

  return null
}

// ── Base material palette ─────────────────────────────────────────────────────
//
// Module-level singletons shared across all meshes.
// DEFAULT_MATERIAL  — light neutral gray, applied on load and after reset.
// SELECTED_MATERIAL — dark gray, applied to the active selection.
//
// To adjust: change color / roughness / metalness here.

const DEFAULT_MATERIAL = new THREE.MeshStandardMaterial({
  color:     "#e0e0e0",
  roughness: 0.9,
  metalness: 0.0,
  side:      THREE.DoubleSide,
})

const SELECTED_MATERIAL = new THREE.MeshStandardMaterial({
  color:     "#3d3d3d",
  roughness: 0.85,
  metalness: 0.05,
  side:      THREE.DoubleSide,
})

// ── Room model ────────────────────────────────────────────────────────────────

function RoomModel({ onSelect, lastClickedRef, sceneRef, mode, inspectPreset }) {
  const { scene } = useGLTF("/models/room-v1.glb")

  // Effect 1: Assign base materials on first load. Must run before Effect 2.
  useEffect(() => {
    sceneRef.current = scene
    scene.traverse((obj) => {
      if (!obj.isMesh) return
      obj.material = DEFAULT_MATERIAL
      obj.userData.originalMaterial = DEFAULT_MATERIAL
    })
  }, [scene, sceneRef])

  // Effect 2: Apply mode-appropriate visibility and raycast rules.
  //   Explore — ceiling hidden and non-interactive (roofless shell).
  //   Inspect — static hidden list from the active elevation preset;
  //             ceiling raycast restored so it can be selected normally.
  useEffect(() => {
    if (mode === "explore") {
      applyVisibility(scene, EXPLORE_HIDDEN)
      setRaycastEnabled(scene, EXPLORE_HIDDEN, false)
    } else {
      applyVisibility(scene, inspectPreset?.hidden ?? [])
      setRaycastEnabled(scene, EXPLORE_HIDDEN, true)
    }
  }, [scene, mode, inspectPreset])

  const handleClick = (e) => {
    e.stopPropagation()
    const clicked = e.object
    if (!clicked.visible) return

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

// ── Main app ──────────────────────────────────────────────────────────────────

function App() {
  const [mode,        setMode]        = useState("explore")
  const [inspectView, setInspectView] = useState("front")

  const [selectedObject, setSelectedObject] = useState(null)
  const [config,         setConfig]         = useState({})
  const [savedA,         setSavedA]         = useState(null)
  const [savedB,         setSavedB]         = useState(null)
  const [activeVersion,  setActiveVersion]  = useState(null)

  const lastClickedRef     = useRef(null)
  const sceneRef           = useRef(null)
  const cachedMaterialsRef = useRef({})
  const orbitRef           = useRef(null)

  const inspectPreset = INSPECT_VIEW_BY_ID[inspectView]

  // ── Shared deselect ────────────────────────────────────────────────────────

  const deselect = useCallback(() => {
    if (lastClickedRef.current) {
      const prev = lastClickedRef.current
      prev.material = prev.userData.currentMaterial ?? prev.userData.originalMaterial
      lastClickedRef.current = null
    }
    setSelectedObject(null)
  }, [])

  // ── Mode navigation ────────────────────────────────────────────────────────

  const handleModeChange = (newMode) => {
    if (newMode === mode) return
    // Ceiling is always hidden in Explore — deselect it before switching.
    if (newMode === "explore" && selectedObject) {
      if (selectedObject.name.toLowerCase().includes("ceiling")) deselect()
    }
    setMode(newMode)
  }

  // ── Inspect view navigation ────────────────────────────────────────────────

  const handleInspectViewChange = (viewId) => {
    const preset = INSPECT_VIEW_BY_ID[viewId]
    if (!preset) return
    if (selectedObject && preset.hidden.includes(selectedObject.name)) deselect()
    setInspectView(viewId)
  }

  // ── Scene actions ──────────────────────────────────────────────────────────

  const handleReset = () => {
    if (!sceneRef.current) return
    sceneRef.current.traverse((obj) => {
      if (!obj.isMesh) return
      obj.userData.currentMaterial = null
      obj.material = obj.userData.originalMaterial
      // obj.visible is owned by the mode system — do not touch here.
    })
    lastClickedRef.current = null
    setSelectedObject(null)
    setConfig({})
    setActiveVersion(null)
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
        // obj.visible is owned by the mode system — applyConfig does not touch it.
      })
    )
    lastClickedRef.current = null
    setSelectedObject(null)
    setConfig({ ...cfg })
  }

  // ── Derived UI state ───────────────────────────────────────────────────────

  const selectedCategory = selectedObject?.name
    ? getCategoryFromName(selectedObject.name)
    : null

  const allowedFamilies = selectedCategory
    ? getFamiliesForCategory(selectedCategory)
    : []

  const visiblePresets = allowedFamilies.flatMap((f) => PRESETS_BY_FAMILY[f] ?? [])

  // ── Style constants ────────────────────────────────────────────────────────

  const panel = {
    background:     "rgba(255,255,255,0.9)",
    backdropFilter: "blur(10px)",
    borderRadius:   "12px",
    boxShadow:      "0 2px 16px rgba(0,0,0,0.07)",
    padding:        "16px",
    fontSize:       "13px",
  }

  const btnBase = {
    border:       "1px solid #e0e0e0",
    borderRadius: "6px",
    padding:      "5px 10px",
    fontSize:     "12px",
    cursor:       "pointer",
    background:   "white",
    color:        "#333",
  }

  const btnActive = {
    ...btnBase,
    background:  "#222",
    color:       "white",
    borderColor: "#222",
  }

  const pillBtn = (isActive) => ({
    background:  isActive ? "#222" : "transparent",
    color:       isActive ? "white" : "#666",
    border:      "none",
    borderRadius: "32px",
    padding:     "7px 20px",
    fontSize:    "13px",
    fontWeight:  isActive ? 500 : 400,
    cursor:      "pointer",
    whiteSpace:  "nowrap",
  })

  const pill = {
    display:        "flex",
    background:     "rgba(255,255,255,0.9)",
    backdropFilter: "blur(10px)",
    padding:        "5px",
    borderRadius:   "40px",
    boxShadow:      "0 2px 14px rgba(0,0,0,0.08)",
    gap:            "2px",
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{
      width:      "100vw",
      height:     "100vh",
      position:   "relative",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>

      {/* ── Left panel: Selection + Finish ──────────────────────────────── */}
      <div style={{ position: "absolute", top: 20, left: 20, width: 220, zIndex: 10, ...panel }}>
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
                  fontWeight: 600, marginBottom: 10, fontSize: 10,
                  textTransform: "uppercase", letterSpacing: "0.08em", color: "#aaa",
                }}>
                  Finish
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {visiblePresets.map((p) => (
                    <button key={p.id} onClick={() => applyPreset(p.id)} style={btnBase}>
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

      {/* ── Right panel: Compare ────────────────────────────────────────── */}
      <div style={{ position: "absolute", top: 20, right: 20, width: 180, zIndex: 10, ...panel }}>
        <div style={{
          fontWeight: 600, marginBottom: 14, fontSize: 10,
          textTransform: "uppercase", letterSpacing: "0.08em", color: "#aaa",
        }}>
          Compare
        </div>
        <div style={{ display: "flex", gap: "6px", marginBottom: 8 }}>
          <button style={{ ...btnBase, flex: 1 }} onClick={() => setSavedA({ ...config })}>Save A</button>
          <button style={{ ...btnBase, flex: 1 }} onClick={() => setSavedB({ ...config })}>Save B</button>
        </div>
        <div style={{ display: "flex", gap: "6px", marginBottom: 12 }}>
          <button
            onClick={() => applyConfig(savedA).then(() => setActiveVersion("A"))}
            disabled={!savedA}
            style={{
              ...(activeVersion === "A" ? btnActive : btnBase),
              flex: 1, opacity: savedA ? 1 : 0.35, cursor: savedA ? "pointer" : "default",
            }}
          >A</button>
          <button
            onClick={() => applyConfig(savedB).then(() => setActiveVersion("B"))}
            disabled={!savedB}
            style={{
              ...(activeVersion === "B" ? btnActive : btnBase),
              flex: 1, opacity: savedB ? 1 : 0.35, cursor: savedB ? "pointer" : "default",
            }}
          >B</button>
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

      {/* ── Bottom nav ──────────────────────────────────────────────────── */}
      <div style={{
        position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 8, zIndex: 10,
      }}>
        {mode === "inspect" && (
          <div style={pill}>
            {INSPECT_VIEWS.map((v) => (
              <button
                key={v.id}
                onClick={() => handleInspectViewChange(v.id)}
                style={pillBtn(inspectView === v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}
        <div style={pill}>
          <button onClick={() => handleModeChange("explore")} style={pillBtn(mode === "explore")}>
            Explore
          </button>
          <button onClick={() => handleModeChange("inspect")} style={pillBtn(mode === "inspect")}>
            Inspect
          </button>
        </div>
      </div>

      {/* ── 3D Canvas ───────────────────────────────────────────────────── */}
      <Canvas onPointerMissed={() => deselect()}>
        <color attach="background" args={["#eeece9"]} />

        {/*
          Two cameras always mounted; makeDefault toggles between them on mode change.
          CameraManager runs AFTER these so drei's makeDefault effects fire first,
          ensuring useThree().camera is already the correct type when CameraManager
          repositions it.
        */}
        <PerspectiveCamera
          makeDefault={mode === "explore"}
          fov={EXPLORE_CAMERA.fov}
          position={EXPLORE_CAMERA.position}
          near={0.1}
          far={1000}
        />
        <OrthographicCamera
          makeDefault={mode === "inspect"}
          near={0.1}
          far={2000}
        />
        <CameraManager mode={mode} inspectPreset={inspectPreset} orbitRef={orbitRef} />

        <ambientLight intensity={1.5} />
        <directionalLight position={[6,  8,  6]} intensity={2.0} />
        <directionalLight position={[-4, 5, -2]} intensity={0.6} />

        <Center>
          <RoomModel
            onSelect={setSelectedObject}
            lastClickedRef={lastClickedRef}
            sceneRef={sceneRef}
            mode={mode}
            inspectPreset={inspectPreset}
          />
        </Center>

        <OrbitControls
          ref={orbitRef}
          target={EXPLORE_CAMERA.target}
          // Explore: free perspective orbit within spatial limits.
          // Inspect: zoom only — rotate and pan locked, parallel view preserved.
          //
          // Polar angle clamping: OrbitControls applies min/maxPolarAngle on
          // every update() call regardless of enableRotate. Explore uses a
          // tilted range to keep the camera elevated; Inspect locks both limits
          // to exactly π/2 (horizontal) so the view is always a true elevation
          // with no downward or upward tilt.
          //
          // minZoom/maxZoom apply to the orthographic camera only and are
          // ignored by OrbitControls when the active camera is perspective.
          enableRotate={mode === "explore"}
          enablePan={mode === "explore"}
          enableZoom
          minDistance={EXPLORE_ORBIT.minDistance}
          maxDistance={EXPLORE_ORBIT.maxDistance}
          minPolarAngle={mode === "explore" ? EXPLORE_ORBIT.minPolarAngle : Math.PI / 2}
          maxPolarAngle={mode === "explore" ? EXPLORE_ORBIT.maxPolarAngle : Math.PI / 2}
          minZoom={INSPECT_ZOOM_LIMITS.min}
          maxZoom={INSPECT_ZOOM_LIMITS.max}
          screenSpacePanning
        />
      </Canvas>
    </div>
  )
}

export default App
