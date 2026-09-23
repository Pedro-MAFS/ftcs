import { readUserPrefs, writeUserPrefs } from '../config/user-prefs'
import {
  floorThreeQuarters,
  getExploreIntensityLimitsFor,
  resolveExploreIntensity,
  type ExploreIntensity,
  type ExploreIntensityLimits,
} from './explore-intensity-logic'

export type { ExploreIntensity, ExploreIntensityLimits }
export { floorThreeQuarters, resolveExploreIntensity }

export function getExploreIntensity(): ExploreIntensity {
  return resolveExploreIntensity(readUserPrefs().exploreIntensity)
}

export function applyExploreIntensity(intensity: unknown): ExploreIntensity {
  const normalized = resolveExploreIntensity(intensity)
  writeUserPrefs({ exploreIntensity: normalized })
  return normalized
}

export function getExploreIntensityLimits(
  intensity: ExploreIntensity = getExploreIntensity(),
): ExploreIntensityLimits {
  return getExploreIntensityLimitsFor(intensity)
}
