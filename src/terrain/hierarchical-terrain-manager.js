// src/terrain/hierarchical-terrain-manager.js
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { getProfile } from './profiles.js';

export class HierarchicalTerrainManager {
  constructor(scene) {
    this.scene = scene;
    this.macroResolution = 128;      // Resolution of macro (Level A) terrain
    this.macroSize = 4096;           // World size of macro terrain
    this.microResolution = 256;      // Resolution of micro (Level B) chunks
    this.microSize = 256;            // World size of each micro chunk
    this.viewDistance = 3;           // How many micro chunks to render in each direction
    this.heightScale = 150;          // Overall height scale

    // Terrain data structures
    this.macroTerrain = null;        // Level A terrain (low resolution, large area)
    this.microChunks = new Map();    // Level B chunks (high resolution, small area), key: 'x,z'
    this.chunksContainer = new THREE.Object3D();
    this.scene.add(this.chunksContainer);
    
    // Working state
    this.currentChunk = { x: 0, z: 0 }; // Current chunk player is in
    this.activeProfile = 'appalachian';
    this.isGenerating = false;
    this.loadingQueue = [];
    
    // Debug helpers
    this.debugMode = false;
    this.debugMarkers = {};
    
    // Use a seeded noise for deterministic generation
    this.seed = Math.random() * 10000; // Global seed for the world
    this.macroNoise = createNoise2D();
    this.microNoise = createNoise2D();
    
    // Water level for more consistent water across chunks
    this.waterLevel = 1; 
  }
  
  // Initialize the terrain system
  async initialize(profileName = 'appalachian') {
    this.activeProfile = profileName;
    
    // First generate the macro (Level A) terrain
    await this.generateMacroTerrain();
    
    // Then generate the initial micro (Level B) chunks around the origin
    await this.generateInitialChunks(0, 0);
    
    return this;
  }
  
  // Generate the macro (Level A) terrain
  async generateMacroTerrain() {
    const profile = getProfile(this.activeProfile);
    
    // Create a low-resolution heightmap for the entire macro terrain
    const heightMap = new Float32Array(this.macroResolution * this.macroResolution);
    const cellSize = this.macroSize / this.macroResolution;
    
    // Use a promise to allow for async generation
    return new Promise(resolve => {
      // Allow UI to update by using setTimeout with 0 delay
      setTimeout(() => {
        // Generate macro terrain using simplified noise
        for (let z = 0; z < this.macroResolution; z++) {
          for (let x = 0; x < this.macroResolution; x++) {
            const worldX = (x - this.macroResolution / 2) * cellSize;
            const worldZ = (z - this.macroResolution / 2) * cellSize;
            
            // Use a consistent noise scale to avoid repeating patterns
            const nx = worldX * 0.0005 + this.seed;
            const nz = worldZ * 0.0005 + this.seed;
            
            // Simplified noise for macro terrain - fewer octaves for speed
            const params = {...profile.params, octaves: 4};
            heightMap[z * this.macroResolution + x] = this.generateHeightValue(
              nx, nz, this.macroNoise, params, this.heightScale * 0.8
            );
          }
        }
        
        // Store the macro terrain
        this.macroTerrain = {
          heightMap,
          size: this.macroSize,
          resolution: this.macroResolution,
          cellSize
        };
        
        resolve();
      }, 0);
    });
  }
  
  // Generate a single height value using FBM noise
  generateHeightValue(nx, nz, noise2D, params, heightScale) {
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
      const sampleX = nx * frequency;
      const sampleZ = nz * frequency;
      
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
    noiseHeight = Math.pow(noiseHeight, exponent);
    noiseHeight *= heightScale;
    
    return noiseHeight;
  }
  
  // Get the macro height at a given position
  getMacroHeight(worldX, worldZ) {
    if (!this.macroTerrain) return 0;
    
    const { resolution, size, heightMap } = this.macroTerrain;
    
    // Convert world coordinates to grid indices
    const halfSize = size / 2;
    const x = Math.floor((worldX + halfSize) / size * resolution);
    const z = Math.floor((worldZ + halfSize) / size * resolution);
    
    // Check bounds
    if (x < 0 || x >= resolution || z < 0 || z >= resolution) {
      // For positions outside the macro terrain, generate height on-the-fly
      // This ensures we can go beyond macro terrain boundaries
      const nx = worldX * 0.0005 + this.seed;
      const nz = worldZ * 0.0005 + this.seed;
      
      const profile = getProfile(this.activeProfile);
      const params = {...profile.params, octaves: 4};
      return this.generateHeightValue(nx, nz, this.macroNoise, params, this.heightScale * 0.8);
    }
    
    return heightMap[z * resolution + x];
  }
  
  // Get the macro height at any position with bilinear interpolation for smoothness
  getInterpolatedMacroHeight(worldX, worldZ) {
    if (!this.macroTerrain) return 0;
    
    const { resolution, size, heightMap } = this.macroTerrain;
    const halfSize = size / 2;
    
    // Convert to normalized coordinates (0 to 1 across the terrain)
    const nx = (worldX + halfSize) / size;
    const nz = (worldZ + halfSize) / size;
    
    // Scale to array indices
    const fx = nx * (resolution - 1);
    const fz = nz * (resolution - 1);
    
    // Get integer and fractional parts
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const fractX = fx - ix;
    const fractZ = fz - iz;
    
    // Check bounds for all four points
    const validIndices = 
      ix >= 0 && ix < resolution - 1 && 
      iz >= 0 && iz < resolution - 1;
    
    if (!validIndices) {
      // For positions outside or on the edge of the macro terrain, fall back to direct generation
      const nx = worldX * 0.0005 + this.seed;
      const nz = worldZ * 0.0005 + this.seed;
      
      const profile = getProfile(this.activeProfile);
      const params = {...profile.params, octaves: 4};
      return this.generateHeightValue(nx, nz, this.macroNoise, params, this.heightScale * 0.8);
    }
    
    // Get the four surrounding heights
    const h00 = heightMap[iz * resolution + ix];
    const h10 = heightMap[iz * resolution + (ix + 1)];
    const h01 = heightMap[(iz + 1) * resolution + ix];
    const h11 = heightMap[(iz + 1) * resolution + (ix + 1)];
    
    // Bilinear interpolation
    const h0 = h00 * (1 - fractX) + h10 * fractX;
    const h1 = h01 * (1 - fractX) + h11 * fractX;
    
    return h0 * (1 - fractZ) + h1 * fractZ;
  }
  
  // Generate initial micro chunks around a position
  async generateInitialChunks(centerX, centerZ) {
    // Calculate which chunk this position belongs to
    this.currentChunk = {
      x: Math.floor(centerX / this.microSize),
      z: Math.floor(centerZ / this.microSize)
    };
    
    await this.generateChunksAroundPosition(this.currentChunk.x, this.currentChunk.z);
  }
  
  // Generate micro chunks around a position
  async generateChunksAroundPosition(chunkX, chunkZ) {
    if (this.isGenerating) {
      // If already generating, queue this request for later
      this.loadingQueue.push({ x: chunkX, z: chunkZ });
      return;
    }
    
    this.isGenerating = true;
    
    // Calculate which chunks should be visible
    const desiredChunks = new Set();
    
    for (let z = chunkZ - this.viewDistance; z <= chunkZ + this.viewDistance; z++) {
      for (let x = chunkX - this.viewDistance; x <= chunkX + this.viewDistance; x++) {
        // Skip chunks that are too far based on circular distance
        const distSq = (x - chunkX) * (x - chunkX) + (z - chunkZ) * (z - chunkZ);
        if (distSq <= this.viewDistance * this.viewDistance) {
          desiredChunks.add(`${x},${z}`);
        }
      }
    }
    
    // Remove chunks that are no longer needed
    const chunksToRemove = [];
    for (const key of this.microChunks.keys()) {
      if (!desiredChunks.has(key)) {
        chunksToRemove.push(key);
      }
    }
    
    chunksToRemove.forEach(key => this.unloadChunk(key));
    
    // Generate new chunks that are needed
    const chunkPromises = [];
    
    for (const key of desiredChunks) {
      if (!this.microChunks.has(key)) {
        const [x, z] = key.split(',').map(Number);
        chunkPromises.push(this.generateMicroChunk(x, z));
      }
    }
    
    // Wait for all chunks to generate
    await Promise.all(chunkPromises);
    
    // Process next item in queue if any
    this.isGenerating = false;
    if (this.loadingQueue.length > 0) {
      const next = this.loadingQueue.shift();
      this.generateChunksAroundPosition(next.x, next.z);
    }
  }
  
  // Generate a single micro chunk at the specified coordinates
  async generateMicroChunk(chunkX, chunkZ) {
    const key = `${chunkX},${chunkZ}`;
    if (this.microChunks.has(key)) return this.microChunks.get(key);
    
    // Calculate world position of chunk
    const worldX = chunkX * this.microSize;
    const worldZ = chunkZ * this.microSize;
    
    // Use a promise to allow for async generation
    return new Promise(resolve => {
      setTimeout(() => {
        // Generate heightmap for this chunk, based on macro data
        const heightMap = this.generateMicroHeightMap(chunkX, chunkZ, worldX, worldZ);
        
        // Create chunk mesh
        const chunk = this.createChunkMesh(heightMap, worldX, worldZ);
        
        // Add to scene and store in map
        this.chunksContainer.add(chunk.mesh);
        this.microChunks.set(key, chunk);
        
        if (this.debugMode) {
          this.addDebugMarker(chunkX, chunkZ);
        }
        
        resolve(chunk);
      }, 0);
    });
  }
  
  // Generate a micro heightmap for a chunk, based on macro terrain
  generateMicroHeightMap(chunkX, chunkZ, worldX, worldZ) {
    const profile = getProfile(this.activeProfile);
    const heightMap = new Float32Array(this.microResolution * this.microResolution);
    
    // Calculate bounds of this chunk with additional overlap to sample
    const halfChunkSize = this.microSize / 2;
    const chunkMinX = worldX - halfChunkSize;
    const chunkMinZ = worldZ - halfChunkSize;
    const cellSize = this.microSize / this.microResolution;
    
    // Calculate a unique seed for this chunk (for consistent generation)
    const chunkSeed = (chunkX * 73856093) ^ (chunkZ * 19349663);
    const detailSeed = this.seed + chunkSeed;
    
    // Get min/max heights from macro terrain for this chunk to help with normalization
    let macroMinHeight = Infinity;
    let macroMaxHeight = -Infinity;
    
    // Sample the macro terrain at a higher resolution grid (for smoother interpolation)
    const sampleResolution = 17; // 17x17 grid of samples
    const macroSamples = new Array(sampleResolution * sampleResolution);
    
    for (let sz = 0; sz < sampleResolution; sz++) {
      for (let sx = 0; sx < sampleResolution; sx++) {
        // Calculate normalized position within the chunk (-1 to 1)
        const normalizedX = (sx / (sampleResolution - 1)) * 2 - 1;
        const normalizedZ = (sz / (sampleResolution - 1)) * 2 - 1;
        
        // Calculate world position with an expanded boundary (1.2x size for better transitions)
        const sampleWorldX = worldX + normalizedX * halfChunkSize * 1.2;
        const sampleWorldZ = worldZ + normalizedZ * halfChunkSize * 1.2;
        
        // Get interpolated height from macro terrain
        const height = this.getInterpolatedMacroHeight(sampleWorldX, sampleWorldZ);
        
        // Store sample
        macroSamples[sz * sampleResolution + sx] = height;
        
        // Track min/max for normalization
        macroMinHeight = Math.min(macroMinHeight, height);
        macroMaxHeight = Math.max(macroMaxHeight, height);
      }
    }
    
    // Loop through all vertices in the micro heightmap
    for (let z = 0; z < this.microResolution; z++) {
      for (let x = 0; x < this.microResolution; x++) {
        // Convert to world coordinates
        const vertexWorldX = chunkMinX + x * cellSize;
        const vertexWorldZ = chunkMinZ + z * cellSize;
        
        // Normalize coordinates within the chunk (-1 to 1)
        const normalizedX = (x / (this.microResolution - 1)) * 2 - 1;
        const normalizedZ = (z / (this.microResolution - 1)) * 2 - 1;
        
        // Get base height from macro terrain using bilinear interpolation
        // Map from -1,1 to sample coordinates
        const sampleX = ((normalizedX + 1) / 2) * (sampleResolution - 1);
        const sampleZ = ((normalizedZ + 1) / 2) * (sampleResolution - 1);
        
        const sampleX0 = Math.floor(sampleX);
        const sampleZ0 = Math.floor(sampleZ);
        const sampleX1 = Math.min(sampleX0 + 1, sampleResolution - 1);
        const sampleZ1 = Math.min(sampleZ0 + 1, sampleResolution - 1);
        
        const fractX = sampleX - sampleX0;
        const fractZ = sampleZ - sampleZ0;
        
        const s00 = macroSamples[sampleZ0 * sampleResolution + sampleX0];
        const s10 = macroSamples[sampleZ0 * sampleResolution + sampleX1];
        const s01 = macroSamples[sampleZ1 * sampleResolution + sampleX0];
        const s11 = macroSamples[sampleZ1 * sampleResolution + sampleX1];
        
        const s0 = s00 * (1 - fractX) + s10 * fractX;
        const s1 = s01 * (1 - fractX) + s11 * fractX;
        
        const baseHeight = s0 * (1 - fractZ) + s1 * fractZ;
        
        // Calculate blend factor - more macro influence at edges
        let blendFactor = 0.8; // 80% macro by default
        
        // Add more macro influence at the edges for smoother transitions
        const edgeDistance = Math.min(
          Math.min(Math.abs(normalizedX + 1), Math.abs(normalizedX - 1)),
          Math.min(Math.abs(normalizedZ + 1), Math.abs(normalizedZ - 1))
        );
        
        if (edgeDistance < 0.1) {
          // Increase macro influence at edges
          blendFactor = 0.8 + (0.1 - edgeDistance) / 0.1 * 0.2; // up to 100% macro at very edge
        }
        
        // Add detail using noise with uniqueness per chunk
        // Scale coordinates for detail noise (higher frequency)
        const nx = vertexWorldX * 0.02 + detailSeed;
        const nz = vertexWorldZ * 0.02 + detailSeed;
        
        // Add detail scale variation based on macro terrain
        const macroHeight = this.getInterpolatedMacroHeight(vertexWorldX, vertexWorldZ);
        const normalizedMacroHeight = (macroHeight - macroMinHeight) / (macroMaxHeight - macroMinHeight);
        
        // Less detail on very low (water) and very high (mountain peaks) areas
        let detailScale = 1.0;
        if (normalizedMacroHeight < 0.2) {
          // Reduce detail in low areas (potential water)
          detailScale = normalizedMacroHeight / 0.2;
        } else if (normalizedMacroHeight > 0.8) {
          // Reduce detail on mountain peaks
          detailScale = 1.0 - (normalizedMacroHeight - 0.8) / 0.2;
        }
        
        // Calculate detail noise
        const detailParams = {...profile.params, octaves: 3, initialFrequency: 2.0, persistence: 0.6};
        const detailHeight = this.generateHeightValue(nx, nz, this.microNoise, detailParams, this.heightScale * 0.2);
        
        // Calculate slope for detail attenuation
        const slopeFactor = this.calculateMacroSlope(vertexWorldX, vertexWorldZ);
        const slopeAttenuationFactor = Math.max(0.2, 1 - slopeFactor * 3); // More attenuation on steep slopes
        
        // Combine macro and detail with weight
        const finalHeight = baseHeight * blendFactor + 
                          detailHeight * detailScale * slopeAttenuationFactor * (1 - blendFactor);
        
        // Store in heightmap
        heightMap[z * this.microResolution + x] = finalHeight;
      }
    }
    
    // Apply post-processing to the heightmap
    this.applyHeightmapPostProcessing(heightMap, this.microResolution);
    
    return heightMap;
  }
  
  // Apply post-processing to heightmap for smoother terrain and consistent water
  applyHeightmapPostProcessing(heightMap, resolution) {
    // First, find min/max heights
    let minHeight = Infinity, maxHeight = -Infinity;
    for (let i = 0; i < heightMap.length; i++) {
      minHeight = Math.min(minHeight, heightMap[i]);
      maxHeight = Math.max(maxHeight, heightMap[i]);
    }
    
    // Apply consistent water level
    for (let i = 0; i < heightMap.length; i++) {
      if (heightMap[i] < this.waterLevel) {
        // Make all water areas flat at the water level
        heightMap[i] = this.waterLevel;
      }
    }
    
    // Apply smoothing to reduce artifacts and make terrain more natural
    this.smoothHeightmap(heightMap, resolution, 1);
  }
  
  // Calculate slope at a point in macro terrain
  calculateMacroSlope(worldX, worldZ) {
    const sampleDist = 5; // Sample 5 units away
    
    const h = this.getInterpolatedMacroHeight(worldX, worldZ);
    const hN = this.getInterpolatedMacroHeight(worldX, worldZ - sampleDist);
    const hS = this.getInterpolatedMacroHeight(worldX, worldZ + sampleDist);
    const hE = this.getInterpolatedMacroHeight(worldX + sampleDist, worldZ);
    const hW = this.getInterpolatedMacroHeight(worldX - sampleDist, worldZ);
    
    const gradX = (hE - hW) / (2 * sampleDist);
    const gradZ = (hS - hN) / (2 * sampleDist);
    
    return Math.sqrt(gradX * gradX + gradZ * gradZ);
  }
  
  // Apply smoothing to heightmap
  smoothHeightmap(heightMap, resolution, passes = 1) {
    if (passes <= 0) return heightMap;
    
    const smoothed = new Float32Array(heightMap.length);
    
    for (let pass = 0; pass < passes; pass++) {
      for (let z = 0; z < resolution; z++) {
        for (let x = 0; x < resolution; x++) {
          const idx = z * resolution + x;
          let sum = heightMap[idx]; // Include center point
          let count = 1;
          
          // Simple 3x3 kernel
          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dz === 0) continue;
              
              const nx = x + dx;
              const nz = z + dz;
              
              if (nx >= 0 && nx < resolution && nz >= 0 && nz < resolution) {
                sum += heightMap[nz * resolution + nx];
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
  
  // Create a mesh for a chunk
  createChunkMesh(heightMap, worldX, worldZ) {
    // Create geometry
    const geometry = new THREE.PlaneGeometry(
      this.microSize, 
      this.microSize, 
      this.microResolution - 1, 
      this.microResolution - 1
    );
    geometry.rotateX(-Math.PI / 2);
    
    // Apply heightmap
    const positions = geometry.attributes.position.array;
    for (let i = 0; i < positions.length / 3; i++) {
      positions[i * 3 + 1] = heightMap[i];
    }
    
    geometry.computeVertexNormals();
    
    // Apply colors based on height and slopes
    this.applyTerrainColors(geometry, heightMap);
    
    // Create material
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: false,
      metalness: 0.0,
      roughness: 0.8
    });
    
    // Create mesh and position it in the world
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(worldX, 0, worldZ);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    
    // Create chunk object with helper methods
    return {
      mesh,
      heightMap,
      worldX,
      worldZ,
      size: this.microSize,
      resolution: this.microResolution,
      
      // Get height at local coordinates within this chunk
      getHeightAt: (x, z) => {
        const localX = x - (worldX - this.microSize / 2);
        const localZ = z - (worldZ - this.microSize / 2);
        
        // Check if point is within chunk
        if (localX < 0 || localX > this.microSize || localZ < 0 || localZ > this.microSize) {
          return null;
        }
        
        // Convert to heightmap indices
        const gridX = Math.floor(localX / this.microSize * this.microResolution);
        const gridZ = Math.floor(localZ / this.microSize * this.microResolution);
        
        // Clamp to valid indices
        const clampedGridX = Math.max(0, Math.min(this.microResolution - 1, gridX));
        const clampedGridZ = Math.max(0, Math.min(this.microResolution - 1, gridZ));
        
        return heightMap[clampedGridZ * this.microResolution + clampedGridX];
      }
    };
  }
  
  // Apply colors to terrain based on height and slope
  applyTerrainColors(geometry, heightMap) {
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
    const slopes = new Float32Array(heightMap.length);
    const resolution = this.microResolution;
    
    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const idx = z * resolution + x;
        const h = heightMap[idx];
        
        // Calculate slope using neighbors
        let dhdx = 0, dhdz = 0;
        let neighbors = 0;
        
        // Check x neighbors
        if (x > 0) {
          dhdx += h - heightMap[z * resolution + (x - 1)];
          neighbors++;
        }
        if (x < resolution - 1) {
          dhdx += heightMap[z * resolution + (x + 1)] - h;
          neighbors++;
        }
        
        // Check z neighbors
        if (z > 0) {
          dhdz += h - heightMap[(z - 1) * resolution + x];
          neighbors++;
        }
        if (z < resolution - 1) {
          dhdz += heightMap[(z + 1) * resolution + x] - h;
          neighbors++;
        }
        
        // Average the gradients
        if (neighbors > 0) {
          dhdx /= neighbors * 0.5; // Scale factor for heightmap resolution
          dhdz /= neighbors * 0.5;
        }
        
        // Calculate slope magnitude
        const slope = Math.sqrt(dhdx * dhdx + dhdz * dhdz);
        slopes[idx] = slope;
      }
    }
    
    // Set colors based on height and slope
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      const height = heightMap[i];
      const normalizedHeight = (height - minHeight) / heightRange;
      const slope = slopes[i] / this.heightScale * 10; // Normalize slope
      
      let color = new THREE.Color();
      
      if (height <= this.waterLevel + 0.1) {
        // Water
        color.setRGB(0.2, 0.4, 0.8);
      } 
      else if (normalizedHeight < 0.2) {
        // Beach/sand
        color.setRGB(0.76, 0.7, 0.5);
      }
      else if (normalizedHeight < 0.5) {
        // Lowlands - grass and dirt mix based on slope
        const grassColor = new THREE.Color(0.3, 0.7, 0.3);
        const dirtColor = new THREE.Color(0.5, 0.4, 0.3);
        
        // More dirt on slopes
        const slopeFactor = Math.min(1, slope * 2);
        color.copy(grassColor).lerp(dirtColor, slopeFactor);
      }
      else if (normalizedHeight < 0.7) {
        // Mid elevations - transition to rocky
        const midColor = new THREE.Color(0.4, 0.4, 0.3);
        const rockColor = new THREE.Color(0.5, 0.5, 0.5);
        
        const t = (normalizedHeight - 0.5) / 0.2;
        color.copy(midColor).lerp(rockColor, t);
      }
      else if (normalizedHeight < 0.9) {
        // Mountain - rock
        color.setRGB(0.6, 0.6, 0.6);
      }
      else {
        // Mountain peaks - snow, with less snow on steep slopes
        const rockColor = new THREE.Color(0.6, 0.6, 0.6);
        const snowColor = new THREE.Color(0.9, 0.9, 0.95);
        
        // Less snow on steep slopes
        const slopeFactor = Math.min(1, slope * 4);
        color.copy(snowColor).lerp(rockColor, slopeFactor);
      }
      
      const colorIndex = i * 3;
      colors[colorIndex] = color.r;
      colors[colorIndex + 1] = color.g;
      colors[colorIndex + 2] = color.b;
    }
  }
  
  // Get terrain height at any world position
  getHeightAt(worldX, worldZ) {
    // Try to get height from the correct chunk
    const chunkX = Math.floor(worldX / this.microSize);
    const chunkZ = Math.floor(worldZ / this.microSize);
    const key = `${chunkX},${chunkZ}`;
    
    const chunk = this.microChunks.get(key);
    if (chunk) {
      const height = chunk.getHeightAt(worldX, worldZ);
      if (height !== null) {
        return height;
      }
    }
    
    // If chunk isn't loaded, check if we're in nearby loaded chunks
    // This helps with boundary conditions
    for (const [, chunk] of this.microChunks) {
      const height = chunk.getHeightAt(worldX, worldZ);
      if (height !== null) {
        return height;
      }
    }
    
    // If no chunk is loaded or point is outside all chunks,
    // fall back to macro terrain
    return this.getInterpolatedMacroHeight(worldX, worldZ);
  }
  
  // Update chunks based on player position
  updatePlayerPosition(worldX, worldZ) {
    const chunkX = Math.floor(worldX / this.microSize);
    const chunkZ = Math.floor(worldZ / this.microSize);
    
    // Check if player moved to a new chunk
    if (chunkX !== this.currentChunk.x || chunkZ !== this.currentChunk.z) {
      this.currentChunk = { x: chunkX, z: chunkZ };
      this.generateChunksAroundPosition(chunkX, chunkZ);
    }
  }
  
  // Unload a chunk by key
  unloadChunk(key) {
    const chunk = this.microChunks.get(key);
    if (!chunk) return;
    
    // Remove from scene
    this.chunksContainer.remove(chunk.mesh);
    
    // Dispose of geometry and materials
    if (chunk.mesh.geometry) chunk.mesh.geometry.dispose();
    if (chunk.mesh.material) {
      if (Array.isArray(chunk.mesh.material)) {
        chunk.mesh.material.forEach(m => m.dispose());
      } else {
        chunk.mesh.material.dispose();
      }
    }
    
    // Clean up debug markers
    if (this.debugMode) {
      const markerKey = key;
      if (this.debugMarkers[markerKey]) {
        this.scene.remove(this.debugMarkers[markerKey]);
        delete this.debugMarkers[markerKey];
      }
      if (this.debugMarkers[markerKey + '_label']) {
        this.scene.remove(this.debugMarkers[markerKey + '_label']);
        delete this.debugMarkers[markerKey + '_label'];
      }
    }
    
    // Remove from map
    this.microChunks.delete(key);
  }
  
  // Change the active terrain profile
  async changeProfile(profileName) {
    this.activeProfile = profileName;
    
    // Generate a new seed for this profile
    this.seed = Math.random() * 10000;
    
    // Clear all existing chunks
    for (const key of this.microChunks.keys()) {
      this.unloadChunk(key);
    }
    
    // Regenerate macro terrain
    await this.generateMacroTerrain();
    
    // Regenerate visible chunks
    await this.generateChunksAroundPosition(this.currentChunk.x, this.currentChunk.z);
  }
  
  // Set view distance
  setViewDistance(distance) {
    this.viewDistance = Math.max(1, Math.min(8, distance));
    this.generateChunksAroundPosition(this.currentChunk.x, this.currentChunk.z);
  }
  
  // Debug visualization of chunks
  addDebugMarker(chunkX, chunkZ) {
    const key = `${chunkX},${chunkZ}`;
    
    if (this.debugMarkers[key]) return;
    
    const worldX = chunkX * this.microSize;
    const worldZ = chunkZ * this.microSize;
    
    // Create marker cube
    const geometry = new THREE.BoxGeometry(2, 20, 2);
    const material = new THREE.MeshBasicMaterial({ 
      color: 0xff0000, 
      wireframe: true 
    });
    
    const marker = new THREE.Mesh(geometry, material);
    marker.position.set(worldX, 5, worldZ);
    
    this.scene.add(marker);
    this.debugMarkers[key] = marker;
    
    // Create label
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.font = '24px Arial';
    ctx.fillText(`Chunk ${chunkX},${chunkZ}`, 10, 64);
    
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.position.set(worldX, 30, worldZ);
    sprite.scale.set(30, 15, 1);
    
    this.scene.add(sprite);
    this.debugMarkers[key + '_label'] = sprite;
  }
  
  // Toggle chunk debug visualization
  toggleDebug() {
    this.debugMode = !this.debugMode;
    
    if (this.debugMode) {
      // Add debug markers for all chunks
      for (const [key] of this.microChunks) {
        const [x, z] = key.split(',').map(Number);
        this.addDebugMarker(x, z);
      }
    } else {
      // Remove all debug markers
      for (const key in this.debugMarkers) {
        this.scene.remove(this.debugMarkers[key]);
      }
      this.debugMarkers = {};
    }
    
    return this.debugMode;
  }
  
  // Get all loaded chunks
  getLoadedChunks() {
    return Array.from(this.microChunks.values());
  }
  
  // Check if a point is on a ridge (used for waypoints)
  isRidge(worldX, worldZ, threshold = 5) {
    // Sample heights in a small cross pattern
    const sample = 5;
    const center = this.getHeightAt(worldX, worldZ);
    const north = this.getHeightAt(worldX, worldZ - sample);
    const south = this.getHeightAt(worldX, worldZ + sample);
    const east = this.getHeightAt(worldX + sample, worldZ);
    const west = this.getHeightAt(worldX - sample, worldZ);
    
    // Ridge detection - higher than neighbors in at least one direction
    const isEWRidge = (center > east && center > west);
    const isNSRidge = (center > north && center > south);
    
    return isEWRidge || isNSRidge;
  }
}