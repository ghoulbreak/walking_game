// src/terrain/core/terrain-analysis.js
// Utility functions for analyzing terrain features

import * as THREE from 'three';

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