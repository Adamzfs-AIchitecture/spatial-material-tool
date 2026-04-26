import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Canvas, useThree } from "@react-three/fiber"
import {
  OrbitControls,
  Center,
  useGLTF,
  PerspectiveCamera,
  OrthographicCamera,
} from "@react-three/drei"
import * as THREE from "three"

import { PRESET_BY_ID, PRESETS_BY_FAMILY } from "./materialLibrary"
import { buildMaterialFromPreset } from "./materialUtils"
import { getCategoryFromName, getFamiliesForCategory } from "./categoryMap"
import { deriveRoomPlan } from "./legendUtils"
import InspectLegend from "./InspectLegend"
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

function CameraManager({ mode, inspectPreset, orbitRef }) {
  const { camera, size } = useThree()

  const cameraRef = useRef(camera)
  const sizeRef = useRef(size)

  cameraRef.current = camera
  sizeRef.current = size

  useEffect(() => {
    const cam = cameraRef.current
    const sz = sizeRef.current

    if (mode === "explore") {
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
  }, [mode, inspectPreset])

  return null
}

// ── Base material palette ─────────────────────────────────────────────────────

const DEFAULT_MATERIAL = new THREE.MeshStandardMaterial({
  color: "#e0e0e0",
  roughness: 0.9,
  metalness: 0.0,
  side: THREE.DoubleSide,
})

const SELECTED_MATERIAL = new THREE.MeshStandardMaterial({
  color: "#3d3d3d",
  roughness: 0.85,
  metalness: 0.05,
  side: THREE.DoubleSide,
})

// ── Room model ────────────────────────────────────────────────────────────────

function RoomModel({
  onSelect,
  lastClickedRef,
  sceneRef,
  registerScene,
  mode,
  inspectPreset,
  onPlanReady,
}) {
  const { scene: gltfScene } = useGLTF("/models/room-v1.glb")

  // Important: split view mounts the GLB twice, so each canvas needs its own clone.
  const scene = useMemo(() => gltfScene.clone(true), [gltfScene])

  useEffect(() => {
    sceneRef.current = scene

    scene.traverse((obj) => {
      if (!obj.isMesh) return
      obj.material = DEFAULT_MATERIAL
      obj.userData.originalMaterial = DEFAULT_MATERIAL
    })

    onPlanReady(deriveRoomPlan(scene))

    const unregister = registerScene?.(scene)
    return () => unregister?.()
  }, [scene, sceneRef, onPlanReady, registerScene])

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

// ── Inspect view guide line ───────────────────────────────────────────────────

function InspectViewLine({ inspectPreset, inspectView }) {
  if (!inspectPreset) return null

  const z = inspectPreset.camera.position[2]
  const y = 0.08
  const x0 = -8.2
  const x1 = 8.2

  const lineGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setFromPoints([
      new THREE.Vector3(x0, y, z),
      new THREE.Vector3(x1, y, z),
    ])
    return g
  }, [z])

  const direction = useMemo(() => {
    const [px, , pz] = inspectPreset.camera.position
    const [tx, , tz] = inspectPreset.camera.target

    const v = new THREE.Vector3(tx - px, 0, tz - pz)

    if (v.lengthSq() < 0.0001) {
      return new THREE.Vector3(1, 0, 0)
    }

    return v.normalize()
  }, [inspectPreset])

  const arrow = useMemo(() => {
    const origin = new THREE.Vector3(0, y + 0.08, z)
    const helper = new THREE.ArrowHelper(direction, origin, 2.1, 0xff2d2d, 0.55, 0.32)

    helper.line.material.depthTest = false
    helper.cone.material.depthTest = false
    helper.line.material.transparent = true
    helper.cone.material.transparent = true
    helper.line.material.opacity = 1
    helper.cone.material.opacity = 1
    helper.renderOrder = 999

    return helper
  }, [direction, z])

  return (
    <group>
      <line geometry={lineGeometry} renderOrder={998}>
        <lineBasicMaterial color="#ff2d2d" linewidth={3} depthTest={false} />
      </line>

      <mesh position={[x0, y, z]} renderOrder={998}>
        <boxGeometry args={[0.08, 0.08, 1.0]} />
        <meshBasicMaterial color="#ff2d2d" depthTest={false} />
      </mesh>

      <mesh position={[x1, y, z]} renderOrder={998}>
        <boxGeometry args={[0.08, 0.08, 1.0]} />
        <meshBasicMaterial color="#ff2d2d" depthTest={false} />
      </mesh>

      <primitive object={arrow} />
    </group>
  )
}

// ── Shared canvas wrapper ─────────────────────────────────────────────────────

function SceneCanvas({
  canvasMode,
  makeExploreDefault,
  makeInspectDefault,
  inspectPreset,
  inspectView,
  orbitRef,
  onSelect,
  lastClickedRef,
  sceneRef,
  registerScene,
  onPlanReady,
  onPointerMissed,
  showInspectLine = false,
}) {
  return (
    <Canvas onPointerMissed={onPointerMissed}>
      <color attach="background" args={["#eeece9"]} />

      <PerspectiveCamera
        makeDefault={makeExploreDefault}
        fov={EXPLORE_CAMERA.fov}
        position={EXPLORE_CAMERA.position}
        near={0.1}
        far={1000}
      />

      <OrthographicCamera makeDefault={makeInspectDefault} near={0.1} far={2000} />

      <CameraManager
        mode={canvasMode}
        inspectPreset={inspectPreset}
        orbitRef={orbitRef}
      />

      <ambientLight intensity={1.5} />
      <directionalLight position={[6, 8, 6]} intensity={2.0} />
      <directionalLight position={[-4, 5, -2]} intensity={0.6} />

      <Center>
        <RoomModel
          onSelect={onSelect}
          lastClickedRef={lastClickedRef}
          sceneRef={sceneRef}
          registerScene={registerScene}
          mode={canvasMode}
          inspectPreset={inspectPreset}
          onPlanReady={onPlanReady}
        />
      </Center>

      {showInspectLine && (
        <InspectViewLine inspectPreset={inspectPreset} inspectView={inspectView} />
      )}

      <OrbitControls
        ref={orbitRef}
        target={EXPLORE_CAMERA.target}
        enableRotate={canvasMode === "explore"}
        enablePan={canvasMode === "explore"}
        enableZoom
        minDistance={EXPLORE_ORBIT.minDistance}
        maxDistance={EXPLORE_ORBIT.maxDistance}
        minPolarAngle={
          canvasMode === "explore" ? EXPLORE_ORBIT.minPolarAngle : Math.PI / 2
        }
        maxPolarAngle={
          canvasMode === "explore" ? EXPLORE_ORBIT.maxPolarAngle : Math.PI / 2
        }
        minZoom={INSPECT_ZOOM_LIMITS.min}
        maxZoom={INSPECT_ZOOM_LIMITS.max}
        screenSpacePanning
      />
    </Canvas>
  )
}

// ── Main app ──────────────────────────────────────────────────────────────────

function App() {
  const [mode, setMode] = useState("explore")
  const [inspectView, setInspectView] = useState("front")
  const [showInspectContext, setShowInspectContext] = useState(true)
  const [planData, setPlanData] = useState(null)

  const [selectedObject, setSelectedObject] = useState(null)
  const [config, setConfig] = useState({})
  const [savedA, setSavedA] = useState(null)
  const [savedB, setSavedB] = useState(null)
  const [activeVersion, setActiveVersion] = useState(null)

  const lastClickedRef = useRef(null)
  const sceneRef = useRef(null)
  const sceneSetRef = useRef(new Set())
  const cachedMaterialsRef = useRef({})
  const orbitRef = useRef(null)

  const splitExploreRef = useRef(null)
  const splitInspectRef = useRef(null)

  const handlePlanReady = useCallback((data) => {
    setPlanData(data)
  }, [])

  const registerScene = useCallback((scene) => {
    sceneSetRef.current.add(scene)
    return () => {
      sceneSetRef.current.delete(scene)
    }
  }, [])

  const inspectPreset = INSPECT_VIEW_BY_ID[inspectView]
  const isSplitInspect = mode === "inspect" && showInspectContext

  // ── Shared deselect ────────────────────────────────────────────────────────

  const deselect = useCallback(() => {
    if (lastClickedRef.current) {
      const prev = lastClickedRef.current
      prev.material = prev.userData.currentMaterial ?? prev.userData.originalMaterial
      lastClickedRef.current = null
    }

    setSelectedObject(null)
  }, [])

  // ── Material syncing across all mounted scenes ──────────────────────────────

  const applyMaterialToAllScenesByCategory = useCallback(
    (category, material) => {
      sceneSetRef.current.forEach((scene) => {
        scene.traverse((obj) => {
          if (!obj.isMesh) return

          const objCategory = getCategoryFromName(obj.name)
          if (objCategory !== category) return

          obj.userData.currentMaterial = material
          obj.material = material
        })
      })

      if (lastClickedRef.current) {
        lastClickedRef.current.material = SELECTED_MATERIAL
      }
    },
    []
  )

  // ── Mode navigation ────────────────────────────────────────────────────────

  const handleModeChange = (newMode) => {
    if (newMode === mode) return

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
    sceneSetRef.current.forEach((scene) => {
      scene.traverse((obj) => {
        if (!obj.isMesh) return
        obj.userData.currentMaterial = null
        obj.material = obj.userData.originalMaterial
      })
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

    cachedMaterialsRef.current[presetId] = material

    applyMaterialToAllScenesByCategory(category, material)

    setConfig((prev) => ({ ...prev, [category]: presetId }))
    setActiveVersion(null)
  }

  const applyConfig = async (cfg) => {
    if (!cfg) return Promise.resolve()

    const entries = Object.entries(cfg)

    await Promise.all(
      entries.map(async ([category, presetId]) => {
        const preset = PRESET_BY_ID[presetId]
        if (!preset) return

        const material =
          cachedMaterialsRef.current[presetId] ??
          (await buildMaterialFromPreset(preset))

        cachedMaterialsRef.current[presetId] = material
        applyMaterialToAllScenesByCategory(category, material)
      })
    )

    sceneSetRef.current.forEach((scene) => {
      scene.traverse((obj) => {
        if (!obj.isMesh) return

        const category = getCategoryFromName(obj.name)
        const presetId = category ? cfg[category] : null

        if (presetId) return

        obj.userData.currentMaterial = null
        obj.material = obj.userData.originalMaterial
      })
    })

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

  const visiblePresets = allowedFamilies.flatMap(
    (f) => PRESETS_BY_FAMILY[f] ?? []
  )

  // ── Style constants ────────────────────────────────────────────────────────

  const panel = {
    background: "rgba(255,255,255,0.9)",
    backdropFilter: "blur(10px)",
    borderRadius: "12px",
    boxShadow: "0 2px 16px rgba(0,0,0,0.07)",
    padding: "16px",
    fontSize: "13px",
  }

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

  const pillBtn = (isActive) => ({
    background: isActive ? "#222" : "transparent",
    color: isActive ? "white" : "#666",
    border: "none",
    borderRadius: "32px",
    padding: "7px 20px",
    fontSize: "13px",
    fontWeight: isActive ? 500 : 400,
    cursor: "pointer",
    whiteSpace: "nowrap",
  })

  const pill = {
    display: "flex",
    background: "rgba(255,255,255,0.9)",
    backdropFilter: "blur(10px)",
    padding: "5px",
    borderRadius: "40px",
    boxShadow: "0 2px 14px rgba(0,0,0,0.08)",
    gap: "2px",
  }

  const guideToggleStyle = {
    position: "absolute",
    top: "50%",
    left: showInspectContext ? "50%" : 20,
    transform: showInspectContext ? "translate(-50%, -50%)" : "translateY(-50%)",
    zIndex: 20,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "rgba(255,255,255,0.92)",
    backdropFilter: "blur(10px)",
    borderRadius: 999,
    boxShadow: "0 2px 14px rgba(0,0,0,0.12)",
    padding: showInspectContext ? "9px 10px" : "8px 12px",
    fontSize: 12,
    color: "#555",
    cursor: "pointer",
    whiteSpace: "nowrap",
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        position: "relative",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {/* ── Left panel: Selection + Finish ──────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          width: 220,
          zIndex: 10,
          ...panel,
        }}
      >
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
                <div
                  style={{
                    fontWeight: 600,
                    marginBottom: 10,
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "#aaa",
                  }}
                >
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
          <div
            style={{
              color: "#bbb",
              fontSize: 12,
              textAlign: "center",
              padding: "6px 0",
            }}
          >
            Click a surface to apply a finish
          </div>
        )}
      </div>

      {/* ── Right panel: Compare ────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          width: 180,
          zIndex: 10,
          ...panel,
        }}
      >
        <div
          style={{
            fontWeight: 600,
            marginBottom: 14,
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#aaa",
          }}
        >
          Compare
        </div>

        <div style={{ display: "flex", gap: "6px", marginBottom: 8 }}>
          <button
            style={{ ...btnBase, flex: 1 }}
            onClick={() => setSavedA({ ...config })}
          >
            Save A
          </button>

          <button
            style={{ ...btnBase, flex: 1 }}
            onClick={() => setSavedB({ ...config })}
          >
            Save B
          </button>
        </div>

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

          <button
            style={{ ...btnBase, flex: 1, color: "#888" }}
            onClick={handleReset}
          >
            Reset
          </button>
        </div>

        {activeVersion && (
          <div style={{ fontSize: 11, color: "#bbb", textAlign: "center" }}>
            Version {activeVersion}
          </div>
        )}
      </div>

      {/* ── Inspect orientation legend ──────────────────────────────────── */}
      {mode === "inspect" && (
        <InspectLegend planData={planData} inspectView={inspectView} />
      )}

      {/* ── Inspect guide toggle ────────────────────────────────────────── */}
      {mode === "inspect" && (
        <button
          onClick={() => setShowInspectContext((v) => !v)}
          style={guideToggleStyle}
          title={showInspectContext ? "Hide spatial view guide" : "Show spatial view guide"}
        >
          {showInspectContext ? "◐ Hide Guide" : "◑ Show Guide"}
        </button>
      )}

      {/* ── Bottom nav ──────────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          bottom: 28,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          zIndex: 10,
        }}
      >
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
          <button
            onClick={() => handleModeChange("explore")}
            style={pillBtn(mode === "explore")}
          >
            Explore
          </button>

          <button
            onClick={() => handleModeChange("inspect")}
            style={pillBtn(mode === "inspect")}
          >
            Inspect
          </button>
        </div>
      </div>

      {/* ── 3D Canvas / Inspect split view ─────────────────────────────── */}
      {isSplitInspect ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
          }}
        >
          {/* Left side: spatial context / axon guide */}
          <div
            style={{
              position: "relative",
              borderRight: "1px solid rgba(0,0,0,0.12)",
            }}
          >
            <SceneCanvas
              canvasMode="explore"
              makeExploreDefault
              makeInspectDefault={false}
              inspectPreset={inspectPreset}
              inspectView={inspectView}
              orbitRef={splitExploreRef}
              onSelect={setSelectedObject}
              lastClickedRef={lastClickedRef}
              sceneRef={sceneRef}
              registerScene={registerScene}
              onPlanReady={handlePlanReady}
              onPointerMissed={deselect}
              showInspectLine
            />

            <div
              style={{
                position: "absolute",
                top: 12,
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(255,255,255,0.88)",
                borderRadius: 20,
                padding: "5px 12px",
                fontSize: 12,
                color: "#777",
                boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
                pointerEvents: "none",
                whiteSpace: "nowrap",
              }}
            >
              View Guide · red line = {inspectPreset?.label} view
            </div>
          </div>

          {/* Right side: inspect elevation */}
          <div style={{ position: "relative" }}>
            <SceneCanvas
              canvasMode="inspect"
              makeExploreDefault={false}
              makeInspectDefault
              inspectPreset={inspectPreset}
              inspectView={inspectView}
              orbitRef={splitInspectRef}
              onSelect={setSelectedObject}
              lastClickedRef={lastClickedRef}
              sceneRef={sceneRef}
              registerScene={registerScene}
              onPlanReady={handlePlanReady}
              onPointerMissed={deselect}
            />
          </div>
        </div>
      ) : (
        <SceneCanvas
          canvasMode={mode}
          makeExploreDefault={mode === "explore"}
          makeInspectDefault={mode === "inspect"}
          inspectPreset={inspectPreset}
          inspectView={inspectView}
          orbitRef={orbitRef}
          onSelect={setSelectedObject}
          lastClickedRef={lastClickedRef}
          sceneRef={sceneRef}
          registerScene={registerScene}
          onPlanReady={handlePlanReady}
          onPointerMissed={deselect}
        />
      )}
    </div>
  )
}

export default App