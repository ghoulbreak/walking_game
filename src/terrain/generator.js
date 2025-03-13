// src/terrain/generator.js
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { getProfile, defaultProfile } from './profiles.js';

export async function generateTerrain(width, depth, height, profileName = defaultProfile) {
  // Get the terrain profile to use
  const profile = getProfile(profileName);
  console.log(`Generating terrain using profile: ${profile.name}`);
  
  // Create a noise generator
  const noise2D = createNoise2D();
  
  // Create geometry
  const geometry = new THREE.PlaneGeometry(width, depth, width - 1, depth - 1);
  geometry.rotateX(-Math.PI / 2); // Rotate to be horizontal
  
  // Create heightmap using profile parameters
  const heightMap = createHeightMapFBM(width, depth, noise2D, height, profile.params);
  
  // Apply heightmap to geometry
  applyHeightMap(geometry, heightMap, width, depth);
  
  // Calculate normals for proper lighting
  geometry.computeVertexNormals();
  
  // Create material with different colors based on height/slope
  const material = createTerrainMaterial();
  
  // Create mesh
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  
  // Create terrain object with helper methods
  const terrain = {
    mesh,
    heightMap,
    width,
    depth,
    profile: profile.name,
    
    // Method to get height at any point
    getHeightAt(x, z) {
      // Convert world coordinates to heightmap indices
      const ix = Math.floor((x + width / 2) / width * (width - 1));
      const iz = Math.floor((z + depth / 2) / depth * (depth - 1));
      
      // Clamp to valid indices
      const clampedIx = Math.max(0, Math.min(width - 1, ix));
      const clampedIz = Math.max(0, Math.min(depth - 1, iz));
      
      // Return height from heightmap
      return heightMap[clampedIz * width + clampedIx];
    },
    
    // Method to check if a point is on a ridge
    isRidge(x, z, threshold = 5) {
      const h = this.getHeightAt(x, z);
      const h1 = this.getHeightAt(x + 1, z);
      const h2 = this.getHeightAt(x - 1, z);
      const h3 = this.getHeightAt(x, z + 1);
      const h4 = this.getHeightAt(x, z - 1);
      
      // Simple ridge detection: higher than neighbors in one axis, similar in other
      const xDiff = (h - h1) * (h - h2);
      const zDiff = (h - h3) * (h - h4);
      
      return (xDiff > 0 && Math.abs(h3 - h4) < threshold) || 
             (zDiff > 0 && Math.abs(h1 - h2) < threshold);
    }
  };
  
  return terrain;
}

// Enhanced Fractal Brownian Motion implementation with profile parameters
function createHeightMapFBM(width, depth, noise2D, heightScale, params) {
  const heightMap = new Float32Array(width * depth);
  
  // Use profile parameters or fallback to defaults
  const octaves = params.octaves || 6;
  const persistence = params.persistence || 0.5;
  const lacunarity = params.lacunarity || 2.0;
  const initialFrequency = params.initialFrequency || 1.0;
  const ridge = params.ridge || 0.8;
  const exponent = params.exponent || 2.0;
  // Scale the heightScale by the profile's desired factor
  const finalHeightScale = heightScale * (params.heightScale / 100);
  // Optional asymmetry for mountain ranges that are steeper on one side
  const asymmetry = params.asymmetry || 0.5; // 0.5 is symmetrical
  
  // Seed position offset (can be randomized)
  const offsetX = Math.random() * 100;
  const offsetZ = Math.random() * 100;
  
  // Fill height map with fBm noise values
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      // Calculate noise coordinates
      const nx = x / width;
      const nz = z / depth;
      
      let amplitude = 1.0;
      let frequency = initialFrequency;
      let noiseHeight = 0;
      let normalization = 0;
      
      // Sum multiple octaves of noise
      for (let o = 0; o < octaves; o++) {
        // Sample noise at current frequency
        const sampleX = (nx * frequency) + offsetX;
        const sampleZ = (nz * frequency) + offsetZ;
        
        // Get noise value (-1 to 1)
        let noiseValue = noise2D(sampleX, sampleZ);
        
        // Ridge noise transformation (for mountain peaks)
        noiseValue = Math.abs(noiseValue);
        noiseValue = ridge - noiseValue;
        noiseValue = noiseValue * noiseValue; // Square for more defined ridges
        
        // Add to height with current amplitude
        noiseHeight += noiseValue * amplitude;
        normalization += amplitude;
        
        // Update frequency and amplitude for next octave
        amplitude *= persistence;
        frequency *= lacunarity;
      }
      
      // Normalize to 0-1 range
      noiseHeight /= normalization;
      
      // Apply asymmetry if set (creates mountains steeper on one side)
      if (asymmetry !== 0.5) {
        // Use X axis for asymmetry - adjust based on normalized position
        const asymmetryFactor = nx < asymmetry ? 
          (nx / asymmetry) : // Gradual side (scale up to 1)
          1.0 + ((nx - asymmetry) / (1 - asymmetry)) * 0.5; // Steeper side (scale from 1 to 1.5)
        
        noiseHeight *= asymmetryFactor;
      }
      
      // Apply nonlinear transformations for more interesting terrain
      noiseHeight = Math.pow(noiseHeight, exponent); // Adjustable exponent
      
      // Apply final height scale
      noiseHeight *= finalHeightScale;
      
      // Store in heightmap
      heightMap[z * width + x] = noiseHeight;
    }
  }
  
  // Apply smoothing passes if requested
  if (params.smoothingPasses && params.smoothingPasses > 0) {
    return applySmoothing(heightMap, width, depth, params.smoothingPasses);
  }
  
  return heightMap;
}

// New function to apply Gaussian-like smoothing to the heightmap
function applySmoothing(heightMap, width, depth, passes = 1) {
  // Create a copy of the heightmap to work with
  const smoothedMap = new Float32Array(heightMap);
  const tempMap = new Float32Array(heightMap.length);
  
  // Simple smoothing kernel (can be adjusted for different smoothing effects)
  const kernel = [0.1, 0.2, 0.4, 0.2, 0.1]; // 5x1 kernel
  const kernelRadius = Math.floor(kernel.length / 2);
  
  // Apply multiple passes of smoothing if requested
  for (let pass = 0; pass < passes; pass++) {
    // First smooth horizontally
    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let weightSum = 0;
        
        // Apply kernel
        for (let k = -kernelRadius; k <= kernelRadius; k++) {
          const sampleX = Math.max(0, Math.min(width - 1, x + k));
          const sampleIdx = z * width + sampleX;
          const weight = kernel[k + kernelRadius];
          
          sum += smoothedMap[sampleIdx] * weight;
          weightSum += weight;
        }
        
        // Store horizontally smoothed result
        tempMap[z * width + x] = sum / weightSum;
      }
    }
    
    // Then smooth vertically
    for (let x = 0; x < width; x++) {
      for (let z = 0; z < depth; z++) {
        let sum = 0;
        let weightSum = 0;
        
        // Apply kernel
        for (let k = -kernelRadius; k <= kernelRadius; k++) {
          const sampleZ = Math.max(0, Math.min(depth - 1, z + k));
          const sampleIdx = sampleZ * width + x;
          const weight = kernel[k + kernelRadius];
          
          sum += tempMap[sampleIdx] * weight;
          weightSum += weight;
        }
        
        // Store final smoothed result
        smoothedMap[z * width + x] = sum / weightSum;
      }
    }
  }
  
  return smoothedMap;
}

function applyHeightMap(geometry, heightMap, width, depth) {
  const vertices = geometry.attributes.position.array;
  
  // Set vertex heights from heightmap
  for (let i = 0; i < vertices.length / 3; i++) {
    vertices[i * 3 + 1] = heightMap[i];
  }
  
  // Update position attribute
  geometry.attributes.position.needsUpdate = true;
  
  return geometry;
}

function createTerrainMaterial() {
    // CRITICAL FIX: Enable vertexColors to show the calculated colors
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,     // Use white as base (multiplies with vertex colors)
      flatShading: false,  // Smooth shading
      metalness: 0.0,
      roughness: 0.8,
      vertexColors: true   // CHANGED: Enable vertex colors
    });
  }

// Function to generate waypoints along ridges
export function generateWaypoints(terrain, count = 10) {
  const waypoints = [];
  const width = terrain.width;
  const depth = terrain.depth;
  const attempts = count * 10; // Try more points than needed
  
  for (let i = 0; i < attempts && waypoints.length < count; i++) {
    // Get a random point on the terrain
    const x = Math.random() * width - width / 2;
    const z = Math.random() * depth - depth / 2;
    
    // Check if it's on a ridge
    if (terrain.isRidge(x, z)) {
      const y = terrain.getHeightAt(x, z);
      waypoints.push(new THREE.Vector3(x, y, z));
    }
  }
  
  // Sort waypoints to create a path
  if (waypoints.length > 1) {
    const path = [waypoints[0]];
    const remaining = waypoints.slice(1);
    
    // Simple greedy nearest-neighbor path
    while (remaining.length > 0) {
      const last = path[path.length - 1];
      let nearest = 0;
      let minDist = Infinity;
      
      // Find nearest remaining point
      for (let i = 0; i < remaining.length; i++) {
        const dist = last.distanceTo(remaining[i]);
        if (dist < minDist) {
          minDist = dist;
          nearest = i;
        }
      }
      
      // Add to path and remove from remaining
      path.push(remaining[nearest]);
      remaining.splice(nearest, 1);
    }
    
    return path;
  }
  
  return waypoints;
}