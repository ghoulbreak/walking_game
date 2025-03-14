// src/terrain/utils/terrain-utils.js
// Unified utilities for terrain generation, analysis and manipulation

import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

/**
 * Creates a set of noise generators with consistent seeds
 * @param {number} seed - The base seed value
 * @param {number} count - Number of generators to create
 * @returns {Array} - Array of noise generator functions
 */
export function createNoiseGenerators(seed, count = 1) {
  const generators = [];
  for (let i = 0; i < count; i++) {
    generators.push(createNoise2D());
  }
  return generators;
}

/**
 * Generates a single noise value using FBM (Fractal Brownian Motion)
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @param {Function} noiseFunc - The noise generator function
 * @param {Object} params - Noise parameters
 * @param {number} heightScale - Height scaling factor
 * @returns {number} - The calculated height value
 */
export function generateHeightValue(x, z, noiseFunc, params, heightScale) {
  const {
    octaves = 6,
    persistence = 0.5,
    lacunarity = 2.0,
    initialFrequency = 1.0,
    ridge = 0.8,
    exponent = 2.0
  } = params;
  
  let amplitude = 1.0;
  let frequency = initialFrequency;
  let noiseHeight = 0;
  let normalization = 0;
  
  // Sum multiple octaves of noise
  for (let o = 0; o < octaves; o++) {
    const sampleX = x * frequency;
    const sampleZ = z * frequency;
    
    // Ridge noise transformation
    let noiseValue = Math.abs(noiseFunc(sampleX, sampleZ));
    noiseValue = ridge - noiseValue;
    noiseValue = noiseValue * noiseValue;
    
    noiseHeight += noiseValue * amplitude;
    normalization += amplitude;
    
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  
  // Normalize and apply transformations
  noiseHeight /= normalization;
  noiseHeight = Math.pow(noiseHeight, exponent);
  noiseHeight *= heightScale;
  
  return noiseHeight;
}

/**
 * Apply nonlinear scaling to exaggerate peaks and flatten lowlands
 * @param {number} height - The input height value
 * @param {Object} nonlinearScaling - Scaling parameters
 * @param {number} maxExpectedHeight - Maximum expected height value
 * @returns {number} - Transformed height value
 */
export function applyNonlinearScaling(height, nonlinearScaling, maxExpectedHeight) {
  if (!nonlinearScaling.enabled) return height;
  
  // Normalize height to 0-1 range
  const normalizedHeight = height / maxExpectedHeight;
  
  // Apply sigmoid-like function to exaggerate high areas and flatten low areas
  const { exponent, inflection, flatteningFactor } = nonlinearScaling;
  
  let scaledHeight;
  if (normalizedHeight < inflection) {
    // Below inflection point - can be flattened
    scaledHeight = normalizedHeight * flatteningFactor / inflection;
  } else {
    // Above inflection point - exaggerate based on exponent
    const t = (normalizedHeight - inflection) / (1.0 - inflection);
    const exaggeration = Math.pow(t, exponent);
    scaledHeight = flatteningFactor + (1.0 - flatteningFactor) * exaggeration;
  }
  
  // Scale back to original range
  return scaledHeight * maxExpectedHeight;
}

/**
 * Generate a heightmap using multi-scale composition of noise
 * @param {number} width - Width of the heightmap
 * @param {number} depth - Depth of the heightmap
 * @param {Array} noiseGenerators - Array of noise generation functions
 * @param {Array} noiseScales - Array of noise configuration objects
 * @param {Object} profileParams - Terrain profile parameters
 * @param {Object} nonlinearScaling - Nonlinear scaling parameters
 * @param {number} heightScale - Overall height scale
 * @param {number} seed - Seed value for noise
 * @returns {Float32Array} - The generated heightmap
 */
export function generateHeightMap(width, depth, noiseGenerators, noiseScales, profileParams, nonlinearScaling, heightScale, seed) {
  const heightMap = new Float32Array(width * depth);
  
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      // Calculate normalized coordinates
      const nx = x / width;
      const nz = z / depth;
      
      let totalHeight = 0;
      let totalWeight = 0;
      
      // Apply noise at each scale
      for (let i = 0; i < noiseScales.length && i < noiseGenerators.length; i++) {
        const scale = noiseScales[i];
        const worldX = nx * scale.scale + seed;
        const worldZ = nz * scale.scale + seed;
        
        // Adjust parameters based on scale
        const scaleParams = {...profileParams};
        scaleParams.octaves = Math.min(profileParams.octaves, scale.octaves);
        
        // Generate height for this scale
        const heightAtScale = generateHeightValue(
          worldX, worldZ, noiseGenerators[i], scaleParams, heightScale
        );
        
        // Add weighted contribution
        totalHeight += heightAtScale * scale.weight;
        totalWeight += scale.weight;
      }
      
      // Normalize by total weight
      const normalizedHeight = totalHeight / totalWeight;
      
      // Apply nonlinear scaling to exaggerate peaks
      heightMap[z * width + x] = applyNonlinearScaling(
        normalizedHeight, 
        nonlinearScaling,
        heightScale * 1.2 // Allow some headroom
      );
    }
  }
  
  return heightMap;
}

/**
 * Apply smoothing to a heightmap
 * @param {Float32Array} heightMap - The heightmap to smooth
 * @param {number} width - Width of the heightmap
 * @param {number} depth - Depth of the heightmap
 * @param {number} passes - Number of smoothing passes
 * @returns {Float32Array} - The smoothed heightmap
 */
export function smoothHeightMap(heightMap, width, depth, passes = 1) {
  if (passes <= 0) return heightMap;
  
  const smoothed = new Float32Array(heightMap.length);
  
  for (let pass = 0; pass < passes; pass++) {
    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) {
        const idx = z * width + x;
        let sum = heightMap[idx]; // Include center point
        let count = 1;
        
        // Simple 3x3 kernel
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dz === 0) continue;
            
            const nx = x + dx;
            const nz = z + dz;
            
            if (nx >= 0 && nx < width && nz >= 0 && nz < depth) {
              sum += heightMap[nz * width + nx];
              count++;
            }
          }
        }
        
        smoothed[idx] = sum / count;
      }
    }
    
    // Copy back for next pass
    for (let i = 0; i < heightMap.length; i++) {
      heightMap[i] = smoothed[i];
    }
  }
  
  return heightMap;
}

/**
 * Apply heightmap values to geometry vertices
 * @param {THREE.BufferGeometry} geometry - The geometry to modify
 * @param {Float32Array} heightMap - The heightmap data
 * @returns {THREE.BufferGeometry} - The modified geometry
 */
export function applyHeightMap(geometry, heightMap) {
  const positions = geometry.attributes.position.array;
  
  for (let i = 0; i < positions.length / 3; i++) {
    positions[i * 3 + 1] = heightMap[i];
  }
  
  geometry.attributes.position.needsUpdate = true;
  return geometry;
}

/**
 * Determines which elevation zone a height value belongs to
 * @param {number} normalizedHeight - Normalized height value (0-1)
 * @param {Array} elevationZones - Array of elevation zone definitions
 * @returns {string} - The name of the elevation zone
 */
export function getElevationZone(normalizedHeight, elevationZones) {
  for (const zone of elevationZones) {
    if (normalizedHeight <= zone.threshold) {
      return zone.name;
    }
  }
  return "peaks"; // Default to peaks if above all thresholds
}

/**
 * Get detail noise parameters appropriate for each elevation zone
 * @param {string} zoneName - Name of the elevation zone
 * @param {Object} baseParams - Base terrain parameters
 * @returns {Object} - Modified parameters for detail generation
 */
export function getDetailParamsForElevation(zoneName, baseParams) {
  // Create a copy of the base parameters
  const params = {...baseParams};
  
  switch (zoneName) {
    case "water":
      // Very subtle, smooth variation for water
      params.detailScale = 0.02;
      params.persistence = 0.3;
      params.lacunarity = 1.8;
      params.octaves = 2;
      params.exponent = 1.0;
      break;
      
    case "lowlands":
      // Gentle rolling hills, more rounded
      params.detailScale = 0.1;
      params.persistence = 0.4;
      params.lacunarity = 1.9;
      params.octaves = 3;
      params.exponent = 1.5;
      break;
      
    case "foothills":
      // More varied terrain, medium detail
      params.detailScale = 0.15;
      params.persistence = 0.5;
      params.lacunarity = 2.0;
      params.octaves = 4;
      params.exponent = 1.8;
      break;
      
    case "mountains":
      // Rugged terrain with sharper features
      params.detailScale = 0.2;
      params.persistence = 0.55;
      params.lacunarity = 2.2;
      params.octaves = 4;
      params.exponent = 2.0;
      break;
      
    case "peaks":
      // Jagged peaks with dramatic details
      params.detailScale = 0.25;
      params.persistence = 0.6;
      params.lacunarity = 2.5;
      params.octaves = 3; // Less octaves for more dramatic shapes
      params.exponent = 2.3;
      break;
      
    default:
      // Default parameters
      params.detailScale = 0.2;
  }
  
  return params;
}

/**
 * Calculate slope (gradient) at a point in terrain
 * @param {Function} getHeightFunc - Function to sample height at any point
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @param {number} sampleDist - Distance to sample for gradient calculation
 * @returns {number} - Calculated slope magnitude
 */
export function calculateSlope(getHeightFunc, x, z, sampleDist = 5) {
  const h = getHeightFunc(x, z);
  const hN = getHeightFunc(x, z - sampleDist);
  const hS = getHeightFunc(x, z + sampleDist);
  const hE = getHeightFunc(x + sampleDist, z);
  const hW = getHeightFunc(x - sampleDist, z);
  
  // Skip if any height sample is invalid
  if (h === null || hN === null || hS === null || hE === null || hW === null) {
    return 0;
  }
  
  const gradX = (hE - hW) / (2 * sampleDist);
  const gradZ = (hS - hN) / (2 * sampleDist);
  
  return Math.sqrt(gradX * gradX + gradZ * gradZ);
}

/**
 * Calculate the gradient (slope) of a terrain at a point using the heightmap
 * @param {Float32Array} heightMap - Heightmap data
 * @param {number} width - Width of the heightmap
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @returns {number} - Gradient magnitude
 */
export function calculateGradientFromHeightmap(heightMap, width, x, z) {
  const idx = z * width + x;
  const h = heightMap[idx];
  
  // Get heights of neighboring points
  const left = x > 0 ? heightMap[idx - 1] : h;
  const right = x < width - 1 ? heightMap[idx + 1] : h;
  const up = z > 0 ? heightMap[idx - width] : h;
  const down = z < (heightMap.length / width) - 1 ? heightMap[idx + width] : h;
  
  // Calculate x and z gradients
  const gradX = (right - left) * 0.5;
  const gradZ = (down - up) * 0.5;
  
  // Return gradient magnitude
  return Math.sqrt(gradX * gradX + gradZ * gradZ);
}

/**
 * Detect if a point is on a ridge
 * @param {Function} getHeightFunc - Function to sample height at any point
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @param {number} threshold - Threshold for ridge detection
 * @returns {boolean} - True if point is on a ridge
 */
export function isRidge(getHeightFunc, x, z, threshold = 5) {
  const sampleDist = 2.0;
  const h = getHeightFunc(x, z);
  
  if (h === null) return false;
  
  const hN = getHeightFunc(x, z - sampleDist);
  const hS = getHeightFunc(x, z + sampleDist);
  const hE = getHeightFunc(x + sampleDist, z);
  const hW = getHeightFunc(x - sampleDist, z);
  
  if (hN === null || hS === null || hE === null || hW === null) return false;
  
  const horizontalDiff = (h - hE) * (h - hW);
  const verticalDiff = (h - hN) * (h - hS);
  
  // Detect ridge points (local maxima in at least one direction)
  return (horizontalDiff > 0 && Math.abs(verticalDiff) < threshold) || 
         (verticalDiff > 0 && Math.abs(horizontalDiff) < threshold);
}

/**
 * Find peaks in a local area of terrain
 * @param {Function} getHeightFunc - Function to sample height at any point
 * @param {number} centerX - Center X coordinate
 * @param {number} centerZ - Center Z coordinate
 * @param {number} radius - Radius to search for peaks
 * @param {number} sampleSize - Distance between sample points
 * @returns {Array} - Array of peak points as THREE.Vector3
 */
export function findLocalPeaks(getHeightFunc, centerX, centerZ, radius = 64, sampleSize = 8) {
  const peakPoints = [];
  const gridSize = Math.floor(radius * 2 / sampleSize);
  const heightGrid = Array(gridSize).fill().map(() => Array(gridSize).fill(null));
  
  // Fill height grid with samples
  for (let z = 0; z < gridSize; z++) {
    for (let x = 0; x < gridSize; x++) {
      const worldX = centerX - radius + x * sampleSize;
      const worldZ = centerZ - radius + z * sampleSize;
      
      heightGrid[z][x] = getHeightFunc(worldX, worldZ);
    }
  }
  
  // Find peak points
  for (let z = 1; z < gridSize - 1; z++) {
    for (let x = 1; x < gridSize - 1; x++) {
      const height = heightGrid[z][x];
      if (height === null) continue;
      
      let isPeak = true;
      
      // Check all 8 neighbors
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          
          const neighborHeight = heightGrid[z + dz][x + dx];
          if (neighborHeight === null) continue;
          
          // If any neighbor is higher, not a peak
          if (neighborHeight >= height) {
            isPeak = false;
            break;
          }
        }
        if (!isPeak) break;
      }
      
      if (isPeak) {
        const worldX = centerX - radius + x * sampleSize;
        const worldZ = centerZ - radius + z * sampleSize;
        peakPoints.push(new THREE.Vector3(worldX, height, worldZ));
      }
    }
  }
  
  return peakPoints;
}

/**
 * Find ridges in a local area of terrain
 * @param {Function} getHeightFunc - Function to sample height at any point
 * @param {number} centerX - Center X coordinate
 * @param {number} centerZ - Center Z coordinate
 * @param {number} radius - Radius to search for ridges
 * @param {number} sampleSize - Distance between sample points
 * @param {number} threshold - Threshold for ridge detection
 * @returns {Array} - Array of ridge points as THREE.Vector3
 */
export function findLocalRidges(getHeightFunc, centerX, centerZ, radius = 64, sampleSize = 8, threshold = 5) {
  const ridgePoints = [];
  const gridSize = Math.floor(radius * 2 / sampleSize);
  const heightGrid = Array(gridSize).fill().map(() => Array(gridSize).fill(null));
  
  // Fill height grid with samples
  for (let z = 0; z < gridSize; z++) {
    for (let x = 0; x < gridSize; x++) {
      const worldX = centerX - radius + x * sampleSize;
      const worldZ = centerZ - radius + z * sampleSize;
      
      heightGrid[z][x] = getHeightFunc(worldX, worldZ);
    }
  }
  
  // Find ridge points
  for (let z = 1; z < gridSize - 1; z++) {
    for (let x = 1; x < gridSize - 1; x++) {
      const height = heightGrid[z][x];
      if (height === null) continue;
      
      const west = heightGrid[z][x - 1];
      const east = heightGrid[z][x + 1];
      const north = heightGrid[z - 1][x];
      const south = heightGrid[z + 1][x];
      
      // Skip if any neighbor is null
      if (west === null || east === null || north === null || south === null) {
        continue;
      }
      
      const horizontalDiff = (height - east) * (height - west);
      const verticalDiff = (height - north) * (height - south);
      
      // Detect ridge points
      if ((horizontalDiff > 0 && Math.abs(verticalDiff) < threshold) || 
          (verticalDiff > 0 && Math.abs(horizontalDiff) < threshold)) {
        const worldX = centerX - radius + x * sampleSize;
        const worldZ = centerZ - radius + z * sampleSize;
        ridgePoints.push(new THREE.Vector3(worldX, height, worldZ));
      }
    }
  }
  
  return ridgePoints;
}

/**
 * Linear interpolation between two values
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number} - Interpolated value
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Bilinear interpolation of a value in a 2D grid
 * @param {number} x - X interpolation factor (0-1)
 * @param {number} y - Y interpolation factor (0-1)
 * @param {number} q11 - Value at (0,0)
 * @param {number} q12 - Value at (0,1)
 * @param {number} q21 - Value at (1,0)
 * @param {number} q22 - Value at (1,1)
 * @returns {number} - Interpolated value
 */
export function bilinearInterpolation(x, y, q11, q12, q21, q22) {
  const r1 = lerp(q11, q21, x);
  const r2 = lerp(q12, q22, x);
  return lerp(r1, r2, y);
}

/**
 * Convert a value from one range to another
 * @param {number} value - Input value
 * @param {number} fromMin - Input range minimum
 * @param {number} fromMax - Input range maximum
 * @param {number} toMin - Output range minimum
 * @param {number} toMax - Output range maximum
 * @returns {number} - Remapped value
 */
export function mapRange(value, fromMin, fromMax, toMin, toMax) {
  return toMin + (value - fromMin) * (toMax - toMin) / (fromMax - fromMin);
}

/**
 * Clamp a value between min and max
 * @param {number} value - Input value
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @returns {number} - Clamped value
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}