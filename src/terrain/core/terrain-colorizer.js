// src/terrain/core/terrain-colorizer.js
// Handles coloring of terrain based on height, slope, and other features

import * as THREE from 'three';
import { getElevationZone } from './terrain-analysis.js';

/**
 * Applies colors to terrain based on height, slope, and biome zones
 * @param {THREE.Geometry|THREE.BufferGeometry} geometry - The geometry to color
 * @param {Float32Array} heightMap - The heightmap data
 * @param {number} width - Width of the heightmap
 * @param {number} depth - Depth of the heightmap
 * @param {Array} elevationZones - Elevation zone definitions
 * @param {number} waterLevel - Height of water level
 */
export function applyTerrainColors(geometry, heightMap, width, depth, elevationZones, waterLevel) {
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  
  // Find height range
  let minHeight = Infinity, maxHeight = -Infinity;
  for (let i = 0; i < heightMap.length; i++) {
    minHeight = Math.min(minHeight, heightMap[i]);
    maxHeight = Math.max(maxHeight, heightMap[i]);
  }
  
  const heightRange = maxHeight - minHeight > 0 ? maxHeight - minHeight : 1;
  
  // Calculate slopes for better coloring
  const slopes = calculateSlopes(heightMap, width, depth);
  
  // Set colors based on height, slope, and zone
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    const height = heightMap[i];
    const normalizedHeight = (height - minHeight) / heightRange;
    const slope = slopes[i];
    
    const color = getTerrainColor(normalizedHeight, slope, height, waterLevel, elevationZones, i);
    
    // Apply color to vertex
    const colorIndex = i * 3;
    colors[colorIndex] = color.r;
    colors[colorIndex + 1] = color.g;
    colors[colorIndex + 2] = color.b;
  }
}

/**
 * Calculate slope values for each point in the heightmap
 * @param {Float32Array} heightMap - The heightmap data
 * @param {number} width - Width of the heightmap
 * @param {number} depth - Depth of the heightmap
 * @returns {Float32Array} - Array of slope values
 */
function calculateSlopes(heightMap, width, depth) {
  const slopes = new Float32Array(heightMap.length);
  
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      const idx = z * width + x;
      const h = heightMap[idx];
      
      // Calculate slope using neighbors
      let dhdx = 0, dhdz = 0;
      let neighbors = 0;
      
      // Check x neighbors
      if (x > 0) {
        dhdx += h - heightMap[z * width + (x - 1)];
        neighbors++;
      }
      if (x < width - 1) {
        dhdx += heightMap[z * width + (x + 1)] - h;
        neighbors++;
      }
      
      // Check z neighbors
      if (z > 0) {
        dhdz += h - heightMap[(z - 1) * width + x];
        neighbors++;
      }
      if (z < depth - 1) {
        dhdz += heightMap[(z + 1) * width + x] - h;
        neighbors++;
      }
      
      // Average the gradients
      if (neighbors > 0) {
        dhdx /= neighbors * 0.5; // Scale factor for heightmap resolution
        dhdz /= neighbors * 0.5;
      }
      
      // Calculate slope magnitude
      slopes[idx] = Math.sqrt(dhdx * dhdx + dhdz * dhdz);
    }
  }
  
  return slopes;
}

/**
 * Determine color for a terrain point based on various factors
 * @param {number} normalizedHeight - Height normalized to 0-1 range
 * @param {number} slope - Slope value
 * @param {number} height - Actual height value
 * @param {number} waterLevel - Height of water level
 * @param {Array} elevationZones - Elevation zone definitions
 * @param {number} index - Index for noise variation
 * @returns {THREE.Color} - Calculated color
 */
function getTerrainColor(normalizedHeight, slope, height, waterLevel, elevationZones, index) {
  let color = new THREE.Color();
  
  // Determine the elevation zone
  const zoneName = getElevationZone(normalizedHeight, elevationZones);
  
  if (height <= waterLevel + 0.1) {
    // Water - deeper blue in deeper areas, lighter in shallow areas
    const depthFactor = Math.max(0, Math.min(1, (waterLevel - height) * 2));
    const deepWater = new THREE.Color(0.0, 0.2, 0.5);  // Deep water
    const shallowWater = new THREE.Color(0.2, 0.5, 0.9); // Shallow water
    color.copy(shallowWater).lerp(deepWater, depthFactor);
  } 
  else if (zoneName === "lowlands" && normalizedHeight < 0.25) {
    // Beach/sand transition - closer to water is more sandy
    const sandColor = new THREE.Color(0.76, 0.7, 0.5);
    const grassColor = new THREE.Color(0.4, 0.7, 0.3);
    
    // Mix sand and grass based on height
    const sandFactor = 1.0 - (normalizedHeight - 0.15) / 0.1;
    color.copy(grassColor).lerp(sandColor, Math.max(0, Math.min(1, sandFactor)));
  }
  else if (zoneName === "lowlands") {
    // Lowlands - green with variation based on noise and slope
    const baseGreenColor = new THREE.Color(0.3, 0.65, 0.3);
    const dirtColor = new THREE.Color(0.5, 0.4, 0.3);
    const darkerGreenColor = new THREE.Color(0.2, 0.5, 0.2);
    
    // Create variety in the grass color using a simplified noise function
    const noiseFactor = (Math.sin(index * 0.1) + Math.cos(index * 0.17)) * 0.25 + 0.5;
    const grassColor = new THREE.Color().copy(baseGreenColor)
                          .lerp(darkerGreenColor, noiseFactor * 0.5);
    
    // More dirt on slopes
    const slopeFactor = Math.min(1, slope * 2.5);
    color.copy(grassColor).lerp(dirtColor, slopeFactor * 0.7);
  }
  else if (zoneName === "foothills") {
    // Foothills - transition from grass to rocky
    const grassColor = new THREE.Color(0.3, 0.55, 0.25);
    const rockColor = new THREE.Color(0.5, 0.45, 0.35);
    
    // Mix based on normalized height within the foothills zone
    const t = (normalizedHeight - 0.35) / 0.25;
    const baseMix = Math.max(0, Math.min(1, t));
    
    // Add slope factor - more rocky on steeper slopes
    const slopeFactor = Math.min(1, slope * 2);
    const finalMix = Math.min(1, baseMix + slopeFactor * 0.3);
    
    color.copy(grassColor).lerp(rockColor, finalMix);
  }
  else if (zoneName === "mountains") {
    // Mountains - rocky with some vegetation in lower parts
    const rockColor = new THREE.Color(0.55, 0.52, 0.5);
    const darkRockColor = new THREE.Color(0.4, 0.38, 0.36);
    const alpineColor = new THREE.Color(0.45, 0.5, 0.4);
    
    // Mix different rock colors based on noise pattern
    const noiseMix = (Math.sin(index * 0.3) + Math.cos(index * 0.23)) * 0.25 + 0.5;
    const baseRockColor = new THREE.Color().copy(rockColor)
                          .lerp(darkRockColor, noiseMix);
    
    // Add some green/alpine variation in lower parts of mountain zone
    const t = (normalizedHeight - 0.6) / 0.2;
    let alpineMix = Math.max(0, 1.0 - Math.min(1, t * 2));
    
    // Reduce alpine color on very steep slopes
    alpineMix *= (1.0 - Math.min(1, slope * 1.5));
    
    color.copy(baseRockColor).lerp(alpineColor, alpineMix * 0.5);
  }
  else if (zoneName === "peaks") {
    // Mountain peaks - transition to snow
    const rockColor = new THREE.Color(0.6, 0.58, 0.56);
    const snowColor = new THREE.Color(0.95, 0.95, 0.97);
    
    // Calculate snow cover based on height
    const snowLine = 0.8;
    const snowTransitionWidth = 0.2;
    const t = (normalizedHeight - snowLine) / snowTransitionWidth;
    let snowCover = Math.max(0, Math.min(1, t));
    
    // Adjust snow cover based on slope - less snow on steeper slopes
    const maxSnowSlope = 0.8; // Max slope that can hold full snow
    const slopeEffect = Math.max(0, Math.min(1, (slope - maxSnowSlope) / (1 - maxSnowSlope)));
    snowCover *= (1.0 - slopeEffect * 0.8);
    
    // Add noise variation to snow cover for more natural look
    const noiseVariation = (Math.sin(index * 0.41) + Math.cos(index * 0.27)) * 0.15;
    snowCover = Math.max(0, Math.min(1, snowCover + noiseVariation));
    
    color.copy(rockColor).lerp(snowColor, snowCover);
  }
  
  return color;
}