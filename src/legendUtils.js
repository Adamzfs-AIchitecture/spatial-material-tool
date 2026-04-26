/**
 * legendUtils.js — re-export shim
 *
 * Geometry logic lives in planCutUtils.js  (Layer A — plan-cut extraction).
 * Rendering logic lives in InspectLegend.jsx (Layer B — SVG legend).
 *
 * This file re-exports `derivePlanCut` under the name `deriveRoomPlan`
 * so that App.jsx does not need to change import paths.
 */

export { derivePlanCut as deriveRoomPlan, PLAN_CUT_HEIGHT } from "./planCutUtils"
