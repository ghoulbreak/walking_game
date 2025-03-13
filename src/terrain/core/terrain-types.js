// src/terrain/core/terrain-types.js
// Contains type definitions and common structures for the terrain system

/**
 * @typedef {Object} TerrainChunk
 * @property {THREE.Mesh} mesh - The 3D mesh for this chunk
 * @property {Float32Array} heightMap - The raw height data
 * @property {number} worldX - World X position of the chunk
 * @property {number} worldZ - World Z position of the chunk
 * @property {number} size - Size of the chunk in world units
 * @property {number} resolution - Resolution of the heightmap
 * @property {Function} getHeightAt - Function to get height at local coordinates within this chunk
 */

/**
 * @typedef {Object} NoiseLayer
 * @property {number} scale - Scale of the noise (lower values = larger features)
 * @property {number} weight - Weight of this noise layer in the composition
 * @property {number} octaves - Number of octaves to use for FBM noise
 */

/**
 * @typedef {Object} NonlinearScaling
 * @property {boolean} enabled - Whether nonlinear scaling is enabled
 * @property {number} exponent - Exponent for peak exaggeration (higher = more dramatic peaks)
 * @property {number} inflection - Point at which the curve accelerates (0-1)
 * @property {number} flatteningFactor - Controls how much low areas are flattened (0-1)
 */

/**
 * @typedef {Object} ElevationZone
 * @property {number} threshold - Upper height threshold for this zone (0-1, normalized)
 * @property {string} name - Name of the zone (e.g., "water", "lowlands", "mountains")
 */

export const terrainConstants = {
    // Default settings for terrain generation
    DEFAULT_VIEW_DISTANCE: 3,
    WATER_LEVEL: 1,
    
    // Default noise scales for multi-scale terrain
    DEFAULT_NOISE_SCALES: [
      { scale: 0.0005, weight: 0.65, octaves: 4 }, // Macro scale - large landforms
      { scale: 0.002, weight: 0.25, octaves: 3 },  // Medium scale - mountain groups
      { scale: 0.008, weight: 0.1, octaves: 2 }    // Small scale - local features
    ],
    
    // Default elevation zones for biome stratification
    DEFAULT_ELEVATION_ZONES: [
      { threshold: 0.15, name: "water" },
      { threshold: 0.35, name: "lowlands" },
      { threshold: 0.6, name: "foothills" },
      { threshold: 0.8, name: "mountains" },
      { threshold: 1.0, name: "peaks" }
    ],
    
    // Default settings for nonlinear height scaling
    DEFAULT_NONLINEAR_SCALING: {
      enabled: true,
      exponent: 2.2,       // Higher values make peaks more extreme
      inflection: 0.6,     // Point at which the curve accelerates (0-1)
      flatteningFactor: 0.7 // Controls how much low areas are flattened (0-1)
    }
  };