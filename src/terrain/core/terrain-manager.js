// src/terrain/terrain-manager.js
// Main controller for the hierarchical terrain system

import * as THREE from 'three';
import { getProfile } from './profiles.js';
import { terrainConstants } from './core/terrain-types.js';
import {
  createNoiseGenerators,
  generateHeightMap,
  applyNonlinearScaling,
  smoothHeightMap
} from './core/noise-generator.js';
import { 
  createTerrainChunk, 
  createDebugMarkers 
} from './core/terrain-mesh-builder.js';
import { 
  isRidge,
  calculateSlope,
  getElevationZone
} from './core/terrain-analysis.js';

/**
 * Manages terrain generation using a hierarchical approach with two levels:
 * Level A: Macro terrain (low-res large area)
 * Level B: Micro chunks (high-res smaller areas near the player)
 */
export class TerrainManager {
  /**
   * Create a new TerrainManager
   * @param {THREE.Scene} scene - The 3D scene
   */
  constructor(scene) {
    this.scene = scene;
    this.macroResolution = 128;      // Resolution of macro (Level A) terrain
    this.macroSize = 4096;           // World size of macro terrain
    this.microResolution = 256;      // Resolution of micro (Level B) chunks
    this.microSize = 256;            // World size of each micro chunk
    this.viewDistance = terrainConstants.DEFAULT_VIEW_DISTANCE; // Chunks to render in each direction
    this.heightScale = 150;          // Overall height scale

    // Multi-scale terrain noise layers (large, medium, small features)
    this.noiseScales = [...terrainConstants.DEFAULT_NOISE_SCALES];

    // Elevation zones for biome stratification
    this.elevationZones = [...terrainConstants.DEFAULT_ELEVATION_ZONES];

    // Nonlinear height scaling parameters
    this.nonlinearScaling = {...terrainConstants.DEFAULT_NONLINEAR_SCALING};

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
    this.noiseGenerators = [];
    this.createNoiseGenerators();
    
    // Water level for more consistent water across chunks
    this.waterLevel = terrainConstants.WATER_LEVEL; 
  }
  
  /**
   * Create noise generators for the different scales
   */
  createNoiseGenerators() {
    // Create one generator for each noise scale, plus one for details
    this.noiseGenerators = createNoiseGenerators(this.seed, this.noiseScales.length + 1);
    this.detailNoise = this.noiseGenerators[this.noiseGenerators.length - 1];
  }

  /**
   * Initialize the terrain system
   * @param {string} profileName - Name of the terrain profile to use
   * @returns {Promise} - Resolves when initialization is complete
   */
  async initialize(profileName = 'appalachian') {
    this.activeProfile = profileName;
    
    // First generate the macro (Level A) terrain
    await this.generateMacroTerrain();
    
    // Then generate the initial micro (Level B) chunks around the origin
    await this.generateInitialChunks(0, 0);
    
    return this;
  }
  
  /**
   * Generate the macro (Level A) terrain
   * @returns {Promise} - Resolves when generation is complete
   */
  async generateMacroTerrain() {
    const profile = getProfile(this.activeProfile);
    
    // Create a low-resolution heightmap for the entire macro terrain
    const cellSize = this.macroSize / this.macroResolution;
    
    // Use a promise to allow for async generation
    return new Promise(resolve => {
      // Allow UI to update by using setTimeout with 0 delay
      setTimeout(() => {
        // Generate macro terrain using multi-scale composition
        const heightMap = this.generateMacroHeightMap(profile.params);
        
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
  
  /**
   * Generate the macro heightmap
   * @param {Object} profileParams - Parameters from the terrain profile
   * @returns {Float32Array} - The generated heightmap
   */
  generateMacroHeightMap(profileParams) {
    const heightMap = new Float32Array(this.macroResolution * this.macroResolution);
    const cellSize = this.macroSize / this.macroResolution;
    
    for (let z = 0; z < this.macroResolution; z++) {
      for (let x = 0; x < this.macroResolution; x++) {
        const worldX = (x - this.macroResolution / 2) * cellSize;
        const worldZ = (z - this.macroResolution / 2) * cellSize;
        
        // Use multi-scale composition for more realistic landforms
        heightMap[z * this.macroResolution + x] = this.generateMultiScaleHeight(
          worldX, worldZ, profileParams
        );
      }
    }
    
    return heightMap;
  }
  
  /**
   * Generate height using multi-scale composition of noise
   * @param {number} worldX - World X coordinate
   * @param {number} worldZ - World Z coordinate
   * @param {Object} profileParams - Parameters from the terrain profile
   * @returns {number} - The calculated height value
   */
  generateMultiScaleHeight(worldX, worldZ, profileParams) {
    let totalHeight = 0;
    let totalWeight = 0;
    
    // Apply noise at each scale
    for (let i = 0; i < this.noiseScales.length; i++) {
      const scale = this.noiseScales[i];
      const nx = worldX * scale.scale + this.seed;
      const nz = worldZ * scale.scale + this.seed;
      
      // Adjust parameters based on scale
      const scaleParams = {...profileParams};
      scaleParams.octaves = Math.min(profileParams.octaves, scale.octaves);
      
      // Generate height for this scale
      const heightAtScale = this.generateHeightValue(
        nx, nz, this.noiseGenerators[i], scaleParams, this.heightScale
      );
      
      // Add weighted contribution
      totalHeight += heightAtScale * scale.weight;
      totalWeight += scale.weight;
    }
    
    // Normalize by total weight
    const normalizedHeight = totalHeight / totalWeight;
    
    // Apply nonlinear scaling to exaggerate peaks
    return applyNonlinearScaling(
      normalizedHeight, 
      this.nonlinearScaling,
      this.heightScale * 1.2 // Allow some headroom
    );
  }
  
  /**
   * Generate a single height value using FBM noise
   * @param {number} nx - Noise X coordinate
   * @param {number} nz - Noise Z coordinate
   * @param {Function} noiseFunc - The noise generator function
   * @param {Object} params - Noise parameters
   * @param {number} heightScale - Height scaling factor
   * @returns {number} - The calculated height value
   */
  generateHeightValue(nx, nz, noiseFunc, params, heightScale) {
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
   * Change the active terrain profile
   * @param {string} profileName - Name of the terrain profile to use
   * @returns {Promise} - Resolves when profile change is complete
   */
  async changeProfile(profileName) {
    this.activeProfile = profileName;
    
    // Generate a new seed for this profile
    this.seed = Math.random() * 10000;
    
    // Recreate noise generators for consistent generation
    this.createNoiseGenerators();
    
    // Clear all existing chunks
    for (const key of this.microChunks.keys()) {
      this.unloadChunk(key);
    }
    
    // Regenerate macro terrain
    await this.generateMacroTerrain();
    
    // Regenerate visible chunks
    await this.generateChunksAroundPosition(this.currentChunk.x, this.currentChunk.z);
  }
  
  /**
   * Set the nonlinear scaling parameters
   * @param {boolean} enabled - Whether nonlinear scaling is enabled
   * @param {number} exponent - Exponent for peak exaggeration
   * @param {number} inflection - Point at which the curve accelerates (0-1)
   * @param {number} flatteningFactor - Controls how much low areas are flattened (0-1)
   */
  setNonlinearScaling(enabled, exponent = 2.2, inflection = 0.6, flatteningFactor = 0.7) {
    this.nonlinearScaling = {
      enabled,
      exponent,
      inflection,
      flatteningFactor
    };
    
    // Regenerate terrain with new scaling
    this.regenerateTerrain();
  }
  
  /**
   * Regenerate all terrain with current settings
   * @returns {Promise} - Resolves when regeneration is complete
   */
  async regenerateTerrain() {
    // Clear and regenerate macro terrain
    this.macroTerrain = null;
    await this.generateMacroTerrain();
    
    // Clear all chunks
    for (const key of this.microChunks.keys()) {
      this.unloadChunk(key);
    }
    
    // Regenerate visible chunks
    await this.generateChunksAroundPosition(this.currentChunk.x, this.currentChunk.z);
  }

  /**
   * Unload a terrain chunk
   * @param {string} key - The chunk key (x,z)
   */
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
    
    // Remove debug marker if present
    if (this.debugMode && this.debugMarkers[key]) {
      for (const markerKey in this.debugMarkers[key]) {
        this.scene.remove(this.debugMarkers[key][markerKey]);
      }
      delete this.debugMarkers[key];
    }
    
    // Remove from map
    this.microChunks.delete(key);
  }
  
  /**
   * Get the macro height at a given world position
   * @param {number} worldX - World X coordinate
   * @param {number} worldZ - World Z coordinate
   * @returns {number} - The height at the position
   */
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
      const profile = getProfile(this.activeProfile);
      return this.generateMultiScaleHeight(worldX, worldZ, profile.params);
    }
    
    return heightMap[z * resolution + x];
  }
  
  /**
   * Get the macro height at any position with bilinear interpolation for smoothness
   * @param {number} worldX - World X coordinate
   * @param {number} worldZ - World Z coordinate
   * @returns {number} - The interpolated height value
   */
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
      const profile = getProfile(this.activeProfile);
      return this.generateMultiScaleHeight(worldX, worldZ, profile.params);
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
  
  /**
   * Generate initial micro chunks around a position
   * @param {number} centerX - Center X coordinate
   * @param {number} centerZ - Center Z coordinate
   * @returns {Promise} - Resolves when generation is complete
   */
  async generateInitialChunks(centerX, centerZ) {
    // Calculate which chunk this position belongs to
    this.currentChunk = {
      x: Math.floor(centerX / this.microSize),
      z: Math.floor(centerZ / this.microSize)
    };
    
    await this.generateChunksAroundPosition(this.currentChunk.x, this.currentChunk.z);
  }
  
  /**
   * Generate micro chunks around a position
   * @param {number} chunkX - Chunk X coordinate
   * @param {number} chunkZ - Chunk Z coordinate
   * @returns {Promise} - Resolves when generation is complete
   */
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
  
  /**
   * Generate a single micro chunk at the specified coordinates
   * @param {number} chunkX - Chunk X coordinate
   * @param {number} chunkZ - Chunk Z coordinate
   * @returns {Promise} - Resolves to the generated chunk
   */
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
        const chunk = createTerrainChunk(
          heightMap, 
          worldX, 
          worldZ, 
          this.microSize,
          this.microResolution,
          this.elevationZones,
          this.waterLevel
        );
        
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
  
  /**
   * Generate a micro heightmap for a chunk, using elevation-dependent parameters
   * @param {number} chunkX - Chunk X coordinate
   * @param {number} chunkZ - Chunk Z coordinate
   * @param {number} worldX - World X position of the chunk
   * @param {number} worldZ - World Z position of the chunk
   * @returns {Float32Array} - The generated heightmap
   */
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
        
        // Determine which elevation zone this point belongs to
        const normalizedMacroHeight = (baseHeight - macroMinHeight) / 
                                      (macroMaxHeight - macroMinHeight || 1);
        
        const elevationZone = getElevationZone(normalizedMacroHeight, this.elevationZones);
        
        // Add detail using elevation-dependent noise params
        const detailParams = this.getDetailParamsForElevation(elevationZone, profile.params);
        
        // Scale coordinates for detail noise (higher frequency)
        const nx = vertexWorldX * 0.02 + detailSeed;
        const nz = vertexWorldZ * 0.02 + detailSeed;
        
        // Calculate detail noise with zone-appropriate parameters
        const detailHeight = this.generateHeightValue(
          nx, nz, this.detailNoise, detailParams, 
          this.heightScale * detailParams.detailScale
        );
        
        // Calculate slope for detail attenuation
        const slopeFactor = this.calculateMacroSlope(vertexWorldX, vertexWorldZ);
        const slopeAttenuationFactor = Math.max(0.2, 1 - slopeFactor * 3); // More attenuation on steep slopes
        
        // Combine macro and detail with weight
        const finalHeight = baseHeight * blendFactor + 
                          detailHeight * slopeAttenuationFactor * (1 - blendFactor);
        
        // Store in heightmap
        heightMap[z * this.microResolution + x] = finalHeight;
      }
    }
    
    // Apply post-processing to the heightmap
    this.applyHeightmapPostProcessing(heightMap);
    
    return heightMap;
  }
  
  /**
   * Get detail noise parameters appropriate for each elevation zone
   * @param {string} zoneName - Name of the elevation zone
   * @param {Object} baseParams - Base terrain parameters
   * @returns {Object} - Modified parameters for detail generation
   */
  getDetailParamsForElevation(zoneName, baseParams) {
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
   * Apply post-processing to the heightmap
   * @param {Float32Array} heightMap - The heightmap to process
   */
  applyHeightmapPostProcessing(heightMap) {
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
    smoothHeightMap(heightMap, this.microResolution, this.microResolution, 1);
  }
  
  /**
   * Calculate slope at a point in macro terrain
   * @param {number} worldX - World X coordinate
   * @param {number} worldZ - World Z coordinate
   * @returns {number} - The calculated slope value
   */
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
  
  /**
   * Add debug markers for a terrain chunk
   * @param {number} chunkX - Chunk X coordinate
   * @param {number} chunkZ - Chunk Z coordinate
   */
  addDebugMarker(chunkX, chunkZ) {
    const key = `${chunkX},${chunkZ}`;
    
    if (this.debugMarkers[key]) return;
    
    const markers = createDebugMarkers(chunkX, chunkZ, this.microSize);
    
    // Add all markers to the scene
    for (const markerKey in markers) {
      this.scene.add(markers[markerKey]);
    }
    
    // Store the markers
    this.debugMarkers[key] = markers;
  }
  
  /**
   * Get height at any world position
   * @param {number} worldX - World X coordinate
   * @param {number} worldZ - World Z coordinate
   * @returns {number|null} - The height at the position, or null if outside terrain
   */
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
  
  /**
   * Update chunks based on player position
   * @param {number} worldX - World X coordinate of the player
   * @param {number} worldZ - World Z coordinate of the player
   */
  updatePlayerPosition(worldX, worldZ) {
    // Calculate which chunk this position belongs to
    const chunkX = Math.floor(worldX / this.microSize);
    const chunkZ = Math.floor(worldZ / this.microSize);
    
    // Check if player moved to a new chunk
    if (chunkX !== this.currentChunk.x || chunkZ !== this.currentChunk.z) {
      this.currentChunk = { x: chunkX, z: chunkZ };
      this.generateChunksAroundPosition(chunkX, chunkZ);
    }
  }
  
  /**
   * Check if a point is on a ridge
   * @param {number} worldX - World X coordinate
   * @param {number} worldZ - World Z coordinate
   * @param {number} threshold - Threshold for ridge detection
   * @returns {boolean} - True if the point is on a ridge
   */
  isRidge(worldX, worldZ, threshold = 5) {
    return isRidge(
      (x, z) => this.getHeightAt(x, z),
      worldX,
      worldZ,
      threshold
    );
  }
  
  /**
   * Get all loaded terrain chunks
   * @returns {Array} - Array of chunk objects
   */
  getLoadedChunks() {
    return Array.from(this.microChunks.values());
  }
  
  /**
   * Set the view distance (in chunks)
   * @param {number} distance - New view distance
   */
  setViewDistance(distance) {
    if (distance === this.viewDistance) return;
    
    this.viewDistance = Math.max(1, Math.min(8, distance));
    this.generateChunksAroundPosition(this.currentChunk.x, this.currentChunk.z);
  }
  
  /**
   * Toggle debug visualization
   * @returns {boolean} - New debug mode state
   */
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
        for (const markerKey in this.debugMarkers[key]) {
          this.scene.remove(this.debugMarkers[key][markerKey]);
        }
      }
      this.debugMarkers = {};
    }
    
    return this.debugMode;
  }
}