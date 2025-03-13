// src/terrain/generator.js
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { getProfile, defaultProfile } from './profiles.js';

export async function generateTerrain(width, depth, height, profileName = defaultProfile) {
  const profile = getProfile(profileName);
  const noise2D = createNoise2D();
  
  // Create geometry and material
  const geometry = new THREE.PlaneGeometry(width, depth, width - 1, depth - 1);
  geometry.rotateX(-Math.PI / 2);
  
  const heightMap = createHeightMapFBM(width, depth, noise2D, height, profile.params);
  applyHeightMap(geometry, heightMap);
  geometry.computeVertexNormals();
  
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: false,
    metalness: 0.0,
    roughness: 0.8
  });
  
  // Create mesh and terrain object
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  
  // Simple height-based vertex coloring
  applyTerrainColors(geometry, heightMap, width, depth);
  
  // Create terrain object with helper methods
  return {
    mesh,
    heightMap,
    width,
    depth,
    profile: profile.name,
    
    // Get height at any world coordinate
    getHeightAt(x, z) {
      const ix = Math.floor((x + width / 2) / width * (width - 1));
      const iz = Math.floor((z + depth / 2) / depth * (depth - 1));
      
      const clampedIx = Math.max(0, Math.min(width - 1, ix));
      const clampedIz = Math.max(0, Math.min(depth - 1, iz));
      
      return heightMap[clampedIz * width + clampedIx];
    },
    
    // Check if a point is on a ridge
    isRidge(x, z, threshold = 5) {
      const h = this.getHeightAt(x, z);
      const h1 = this.getHeightAt(x + 1, z);
      const h2 = this.getHeightAt(x - 1, z);
      const h3 = this.getHeightAt(x, z + 1);
      const h4 = this.getHeightAt(x, z - 1);
      
      const xDiff = (h - h1) * (h - h2);
      const zDiff = (h - h3) * (h - h4);
      
      return (xDiff > 0 && Math.abs(h3 - h4) < threshold) || 
             (zDiff > 0 && Math.abs(h1 - h2) < threshold);
    }
  };
}

// Enhanced Fractal Brownian Motion for height map generation
function createHeightMapFBM(width, depth, noise2D, heightScale, params) {
  const heightMap = new Float32Array(width * depth);
  
  // Extract and use parameters with defaults
  const {
    octaves = 6,
    persistence = 0.5,
    lacunarity = 2.0,
    initialFrequency = 1.0,
    ridge = 0.8,
    exponent = 2.0,
    heightScale: profileScale = 100,
    asymmetry = 0.5,
    smoothingPasses = 0
  } = params;
  
  // Scale height by profile setting
  const finalHeightScale = heightScale * (profileScale / 100);
  
  // Seed position offset
  const offsetX = Math.random() * 100;
  const offsetZ = Math.random() * 100;
  
  // Fill height map with fBm noise values
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const nz = z / depth;
      
      let amplitude = 1.0;
      let frequency = initialFrequency;
      let noiseHeight = 0;
      let normalization = 0;
      
      // Sum multiple octaves of noise
      for (let o = 0; o < octaves; o++) {
        const sampleX = (nx * frequency) + offsetX;
        const sampleZ = (nz * frequency) + offsetZ;
        
        // Ridge noise transformation
        let noiseValue = Math.abs(noise2D(sampleX, sampleZ));
        noiseValue = ridge - noiseValue;
        noiseValue = noiseValue * noiseValue;
        
        noiseHeight += noiseValue * amplitude;
        normalization += amplitude;
        
        amplitude *= persistence;
        frequency *= lacunarity;
      }
      
      // Normalize and apply transformations
      noiseHeight /= normalization;
      
      // Apply asymmetry if needed
      if (asymmetry !== 0.5) {
        const asymFactor = nx < asymmetry ? 
          (nx / asymmetry) : 
          1.0 + ((nx - asymmetry) / (1 - asymmetry)) * 0.5;
        
        noiseHeight *= asymFactor;
      }
      
      // Apply exponent for more interesting terrain
      noiseHeight = Math.pow(noiseHeight, exponent);
      
      // Apply final height scale
      noiseHeight *= finalHeightScale;
      
      // Store in heightmap
      heightMap[z * width + x] = noiseHeight;
    }
  }
  
  // Apply smoothing if requested
  return smoothingPasses > 0 ? 
    applySmoothing(heightMap, width, depth, smoothingPasses) : 
    heightMap;
}

// Apply smoothing to heightmap
function applySmoothing(heightMap, width, depth, passes = 1) {
  const smoothed = new Float32Array(heightMap);
  const temp = new Float32Array(heightMap.length);
  
  // Simple Gaussian-like kernel
  const kernel = [0.1, 0.2, 0.4, 0.2, 0.1];
  const radius = Math.floor(kernel.length / 2);
  
  for (let pass = 0; pass < passes; pass++) {
    // Horizontal smoothing
    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) {
        let sum = 0, weightSum = 0;
        
        for (let k = -radius; k <= radius; k++) {
          const sampleX = Math.max(0, Math.min(width - 1, x + k));
          const idx = z * width + sampleX;
          const weight = kernel[k + radius];
          
          sum += smoothed[idx] * weight;
          weightSum += weight;
        }
        
        temp[z * width + x] = sum / weightSum;
      }
    }
    
    // Vertical smoothing
    for (let x = 0; x < width; x++) {
      for (let z = 0; z < depth; z++) {
        let sum = 0, weightSum = 0;
        
        for (let k = -radius; k <= radius; k++) {
          const sampleZ = Math.max(0, Math.min(depth - 1, z + k));
          const idx = sampleZ * width + x;
          const weight = kernel[k + radius];
          
          sum += temp[idx] * weight;
          weightSum += weight;
        }
        
        smoothed[z * width + x] = sum / weightSum;
      }
    }
  }
  
  return smoothed;
}

// Apply heightmap to geometry
function applyHeightMap(geometry, heightMap) {
  const positions = geometry.attributes.position.array;
  
  for (let i = 0; i < positions.length / 3; i++) {
    positions[i * 3 + 1] = heightMap[i];
  }
  
  geometry.attributes.position.needsUpdate = true;
  return geometry;
}

// Apply vertex colors based on height
function applyTerrainColors(geometry, heightMap, width, depth) {
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  
  // Find min and max heights
  let minHeight = Infinity, maxHeight = -Infinity;
  for (let i = 0; i < heightMap.length; i++) {
    minHeight = Math.min(minHeight, heightMap[i]);
    maxHeight = Math.max(maxHeight, heightMap[i]);
  }
  
  const heightRange = maxHeight - minHeight;
  
  // Set colors based on normalized height
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    const height = heightMap[i];
    const normalizedHeight = (height - minHeight) / heightRange;
    
    let color = new THREE.Color();
    
    if (normalizedHeight < 0.1) {
      // Water - blue
      color.setRGB(0.2, 0.4, 0.8);
    } 
    else if (normalizedHeight < 0.3) {
      // Lowlands - green
      color.setRGB(0.3, 0.7, 0.3);
    }
    else if (normalizedHeight < 0.7) {
      // Mid elevations - transition to brown/rocky
      const t = (normalizedHeight - 0.3) / 0.4;
      color.setRGB(0.3 + t * 0.3, 0.7 - t * 0.4, 0.3 - t * 0.1);
    }
    else {
      // High elevations - snow capped
      const t = (normalizedHeight - 0.7) / 0.3;
      color.setRGB(0.6 + t * 0.4, 0.3 + t * 0.7, 0.2 + t * 0.8);
    }
    
    const colorIndex = i * 3;
    colors[colorIndex] = color.r;
    colors[colorIndex + 1] = color.g;
    colors[colorIndex + 2] = color.b;
  }
}