// src/terrain/core/noise-generator.js
// Core noise generation utilities for terrain

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