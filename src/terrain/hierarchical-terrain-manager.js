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

    // Multi-scale terrain noise layers
    this.noiseScales = [
      { scale: 0.0005, weight: 0.65, octaves: 4 }, // Macro scale - large landforms
      { scale: 0.002, weight: 0.25, octaves: 3 },  // Medium scale - mountain groups
      { scale: 0.008, weight: 0.1, octaves: 2 }    // Small scale - local features
    ];

    // Elevation zones for biome stratification
    this.elevationZones = [
      { threshold: 0.15, name: "water" },
      { threshold: 0.35, name: "lowlands" },
      { threshold: 0.6, name: "foothills" },
      { threshold: 0.8, name: "mountains" },
      { threshold: 1.0, name: "peaks" }
    ];

    // Nonlinear height scaling parameters
    this.nonlinearScaling = {
      enabled: true,
      exponent: 2.2,      // Higher values make peaks more extreme
      inflection: 0.6,    // Point at which the curve accelerates (0-1)
      flatteningFactor: 0.7 // Controls how much low areas are flattened (0-1)
    };

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
    this.createNoiseGenerators();
    
    // Water level for more consistent water across chunks
    this.waterLevel = 1; 
  }
  
  // Create noise generators for different scales
  createNoiseGenerators() {
    this.noiseGenerators = [];
    for (let i = 0; i < this.noiseScales.length; i++) {
      this.noiseGenerators.push(createNoise2D());
    }
    // Additional noise for detail variations
    this.detailNoise = createNoise2D();
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
        // Generate macro terrain using multi-scale composition
        for (let z = 0; z < this.macroResolution; z++) {
          for (let x = 0; x < this.macroResolution; x++) {
            const worldX = (x - this.macroResolution / 2) * cellSize;
            const worldZ = (z - this.macroResolution / 2) * cellSize;
            
            // Use multi-scale composition for more realistic landforms
            heightMap[z * this.macroResolution + x] = this.generateMultiScaleHeight(
              worldX, worldZ, profile.params
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
  
  // Change the active terrain profile
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
  
  // Set the nonlinear scaling parameters
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
  
  // Regenerate all terrain with current settings
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

  // Generate height using multi-scale composition
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
    return this.applyNonlinearScaling(normalizedHeight, profileParams);
  }
  
  // Apply nonlinear scaling to the height value to exaggerate peaks
  applyNonlinearScaling(height, profileParams) {
    if (!this.nonlinearScaling.enabled) return height;
    
    // Normalize height to 0-1 range (based on max expected height)
    const maxExpectedHeight = this.heightScale * 1.2; // Allow some headroom
    const normalizedHeight = height / maxExpectedHeight;
    
    // Apply sigmoid-like function to exaggerate high areas (mountain peaks)
    // and potentially flatten low areas
    const { exponent, inflection, flatteningFactor } = this.nonlinearScaling;
    
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
      const profile = getProfile(this.activeProfile);
      return this.generateMultiScaleHeight(worldX, worldZ, profile.params);
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
  
  // Generate a micro heightmap for a chunk, using elevation-dependent parameters
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
        
        const elevationZone = this.getElevationZone(normalizedMacroHeight);
        
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
    this.applyHeightmapPostProcessing(heightMap, this.microResolution);
    
    return heightMap;
  }
  
  // Determine which elevation zone a point belongs to
  getElevationZone(normalizedHeight) {
    for (const zone of this.elevationZones) {
      if (normalizedHeight <= zone.threshold) {
        return zone.name;
      }
    }
    return "peaks"; // Default to peaks if above all thresholds
  }
  
  // Get detail noise parameters appropriate for each elevation zone
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
  
  // Create a mesh for a chunk with enhanced coloring for elevation zones
  // Create a mesh for a chunk with enhanced coloring for elevation zones
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
    }
  }

  // Apply colors to terrain based on height, slope, and elevation zones
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
    
    // Set colors based on height zones, slope, and custom elevation zone properties
    for (let i = 0; i < geometry.attributes.position.count; i++) {
        const height = heightMap[i];
        const normalizedHeight = (height - minHeight) / heightRange;
        const slope = slopes[i] / this.heightScale * 10; // Normalize slope
        
        let color = new THREE.Color();
        
        // First determine the elevation zone
        const zoneName = this.getElevationZone(normalizedHeight);
        
        if (height <= this.waterLevel + 0.1) {
        // Water - deeper blue in deeper areas, lighter in shallow areas
        const depthFactor = Math.max(0, Math.min(1, (this.waterLevel - height) * 2));
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
        
        // Create variety in the grass color using a noise function
        // Simplified noise variation through subtle mixing
        const noiseFactor = (Math.sin(i * 0.1) + Math.cos(i * 0.17)) * 0.25 + 0.5;
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
        const noiseMix = (Math.sin(i * 0.3) + Math.cos(i * 0.23)) * 0.25 + 0.5;
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
        const noiseVariation = (Math.sin(i * 0.41) + Math.cos(i * 0.27)) * 0.15;
        snowCover = Math.max(0, Math.min(1, snowCover + noiseVariation));
        
        color.copy(rockColor).lerp(snowColor, snowCover);
        }
        
        // Apply color to vertex
        const colorIndex = i * 3;
        colors[colorIndex] = color.r;
        colors[colorIndex + 1] = color.g;
        colors[colorIndex + 2] = color.b;
    }
  }

  // Add this method to the HierarchicalTerrainManager class
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

}