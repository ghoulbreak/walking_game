// src/terrain/index.js
// Main export file for the terrain system

// Re-export the main terrain manager
export { TerrainManager } from './terrain-manager.js';

// Re-export core functionality
export { terrainConstants } from './core/terrain-types.js';
export {
  createNoiseGenerators,
  generateHeightValue,
  generateHeightMap,
  applyNonlinearScaling,
  smoothHeightMap
} from './core/noise-generator.js';

// Re-export terrain profiles
export {
  TerrainProfiles,
  defaultProfile,
  getProfile,
  blendProfiles
} from './profiles.js';

// Re-export visualization tools
export {
  createHeightScalingVisualizer,
  createTerrainConfigPanel
} from './visualization/visualization-tools.js';

// Re-export testing tools
export {
  createTerrainSample,
  createComparisonScene,
  launchTerrainComparison
} from './terrain-tester.js';

// Re-export terrain analysis functions
export {
  getElevationZone,
  getDetailParamsForElevation,
  calculateSlope,
  isRidge,
  findLocalPeaks,
  findLocalRidges
} from './core/terrain-analysis.js';

// Re-export mesh building functions
export {
  createTerrainMesh,
  applyHeightMap,
  createTerrainChunk,
  createDebugMarkers
} from './core/terrain-mesh-builder.js';