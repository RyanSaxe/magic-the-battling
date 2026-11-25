/**
 * Compatibility re-export of Pass 2 constrained layout functions and types from
 * web/src/layout/ so existing hook and component imports stay unchanged.
 */
export {
  MIN_ZONE_CARD,
  clampSavedConstraints,
  computeConstrainedFrames,
  computeConstrainedLayout,
  computeConstrainedLayoutState,
  deriveConstraintsFromLayout,
  makeDefaultFrames,
  resolveConstraints,
  type ConstrainedLayoutState,
  type ZoneConstraints,
  type ZoneFrame,
  type ZoneFrameResult,
} from "../layout";
