// src/terrain/chunk-manager.js
import * as THREE from 'three';
import { generateTerrain } from './generator.js';
import { getProfile } from './profiles.js';

export class TerrainChunkManager {
  constructor(scene, chunkSize = 128, viewDistance = 3) {
    this.scene = scene;
    this.chunkSize = chunkSize;          // Size of each chunk
    this.viewDistance = viewDistance;    // How many chunks to render in each direction
    this.heightScale = 1500;              // Height scale for all chunks
    this.chunks = new Map();             // Map of loaded chunks (key: 'x,z')
    this.currentChunk = { x: 0, z: 0 };  // Current chunk the player is in
    this.activeProfile = 'appalachian';  // Current terrain profile
    this.isGenerating = false;           // Lock to prevent multiple simultaneous generations
    this.loadingQueue = [];              // Queue of chunks to generate
    
    // Create a parent object to hold all chunk meshes
    this.chunksContainer = new THREE.Object3D();
    this.scene.add(this.chunksContainer);
    
    // Debug helpers
    this.debugMode = false;
    this.debugMarkers = {};
  }
  
  // Initialize the system with the first chunks
  async initialize(profileName = 'appalachian') {
    this.activeProfile = profileName;
    await this.generateInitialChunks(0, 0);
    return this;
  }
  
  // Change the active terrain profile
  async changeProfile(profileName) {
    this.activeProfile = profileName;
    
    // Clear all existing chunks
    this.clearAllChunks();
    
    // Regenerate chunks around current position
    await this.generateChunksAroundPosition(this.currentChunk.x, this.currentChunk.z);
  }
  
  // Generate the initial set of chunks around a position
  async generateInitialChunks(centerX, centerZ) {
    console.log(`Generating initial chunks around (${centerX}, ${centerZ})`);
    this.currentChunk = { 
      x: Math.floor(centerX / this.chunkSize), 
      z: Math.floor(centerZ / this.chunkSize) 
    };
    
    return this.generateChunksAroundPosition(this.currentChunk.x, this.currentChunk.z);
  }
  
  // Generate all needed chunks around a position
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
    for (const key of this.chunks.keys()) {
      if (!desiredChunks.has(key)) {
        chunksToRemove.push(key);
      }
    }
    
    chunksToRemove.forEach(key => this.unloadChunk(key));
    
    // Generate new chunks that are needed
    const newChunkPromises = [];
    
    for (const key of desiredChunks) {
      if (!this.chunks.has(key)) {
        const [x, z] = key.split(',').map(Number);
        newChunkPromises.push(this.generateChunk(x, z));
      }
    }
    
    // Wait for all chunks to generate
    await Promise.all(newChunkPromises);
    
    // Process next item in queue if any
    this.isGenerating = false;
    if (this.loadingQueue.length > 0) {
      const next = this.loadingQueue.shift();
      this.generateChunksAroundPosition(next.x, next.z);
    }
  }
  
  // Generate a single terrain chunk at the specified coordinates
  async generateChunk(chunkX, chunkZ) {
    const key = `${chunkX},${chunkZ}`;
    if (this.chunks.has(key)) return this.chunks.get(key);
    
    // Calculate world position of chunk
    const worldX = chunkX * this.chunkSize;
    const worldZ = chunkZ * this.chunkSize;
    
    // Generate terrain for this chunk
    const terrain = await generateTerrain(
      this.chunkSize, 
      this.chunkSize, 
      this.heightScale, 
      this.activeProfile
    );
    
    // Position the mesh correctly in world space
    terrain.mesh.position.set(worldX, 0, worldZ);
    terrain.worldOffsetX = worldX;
    terrain.worldOffsetZ = worldZ;
    
    // Update the getHeightAt method to account for chunk offset
    const originalGetHeightAt = terrain.getHeightAt;
    terrain.getHeightAt = (x, z) => {
      // Convert from world coordinates to chunk-local coordinates
      const localX = x - worldX + this.chunkSize / 2;
      const localZ = z - worldZ + this.chunkSize / 2;
      
      // Check if coordinates are within this chunk
      if (localX >= 0 && localX < this.chunkSize && 
          localZ >= 0 && localZ < this.chunkSize) {
        return originalGetHeightAt.call(terrain, localX - this.chunkSize / 2, localZ - this.chunkSize / 2);
      }
      
      return null; // Outside of this chunk
    };
    
    // Add to scene and store in map
    this.chunksContainer.add(terrain.mesh);
    this.chunks.set(key, terrain);
    
    if (this.debugMode) {
      this.addDebugMarker(chunkX, chunkZ);
    }
    
    return terrain;
  }
  
  // Unload a chunk by key
  unloadChunk(key) {
    const chunk = this.chunks.get(key);
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
      this.scene.remove(this.debugMarkers[key]);
      delete this.debugMarkers[key];
    }
    
    // Remove from map
    this.chunks.delete(key);
  }
  
  // Clear all chunks from the scene
  clearAllChunks() {
    for (const key of this.chunks.keys()) {
      this.unloadChunk(key);
    }
  }
  
  // Update chunks based on player position
  updatePlayerPosition(worldX, worldZ) {
    const chunkX = Math.floor(worldX / this.chunkSize);
    const chunkZ = Math.floor(worldZ / this.chunkSize);
    
    // Check if player moved to a new chunk
    if (chunkX !== this.currentChunk.x || chunkZ !== this.currentChunk.z) {
      this.currentChunk = { x: chunkX, z: chunkZ };
      this.generateChunksAroundPosition(chunkX, chunkZ);
    }
  }
  
  // Get terrain height at world position
  getHeightAt(worldX, worldZ) {
    // Calculate which chunk this position belongs to
    const chunkX = Math.floor(worldX / this.chunkSize);
    const chunkZ = Math.floor(worldZ / this.chunkSize);
    const key = `${chunkX},${chunkZ}`;
    
    // Try to get height from the correct chunk
    const chunk = this.chunks.get(key);
    if (chunk) {
      const height = chunk.getHeightAt(worldX, worldZ);
      if (height !== null) return height;
    }
    
    // If chunk isn't loaded or point is outside, try all loaded chunks
    for (const [, chunk] of this.chunks) {
      const height = chunk.getHeightAt(worldX, worldZ);
      if (height !== null) return height;
    }
    
    // Default height if no chunks contain this point
    return 0;
  }
  
  // Check if a point is on a ridge
  isRidge(worldX, worldZ, threshold = 5) {
    // Calculate which chunk this position belongs to
    const chunkX = Math.floor(worldX / this.chunkSize);
    const chunkZ = Math.floor(worldZ / this.chunkSize);
    const key = `${chunkX},${chunkZ}`;
    
    // Try to check ridge on the correct chunk
    const chunk = this.chunks.get(key);
    if (chunk && typeof chunk.isRidge === 'function') {
      // Convert from world to local coordinates
      const localX = worldX - chunk.worldOffsetX;
      const localZ = worldZ - chunk.worldOffsetZ;
      return chunk.isRidge(localX, localZ, threshold);
    }
    
    return false;
  }
  
  // Get all loaded terrain chunks
  getLoadedChunks() {
    return Array.from(this.chunks.values());
  }
  
  // Debug helper to add markers at chunk corners
  addDebugMarker(chunkX, chunkZ) {
    const key = `${chunkX},${chunkZ}`;
    
    if (this.debugMarkers[key]) return;
    
    const worldX = chunkX * this.chunkSize;
    const worldZ = chunkZ * this.chunkSize;
    
    const geometry = new THREE.BoxGeometry(2, 20, 2);
    const material = new THREE.MeshBasicMaterial({ 
      color: 0xff0000, 
      wireframe: true 
    });
    
    const marker = new THREE.Mesh(geometry, material);
    marker.position.set(worldX, 5, worldZ);
    
    this.scene.add(marker);
    this.debugMarkers[key] = marker;
    
    // Add text label
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
    
    // Store both objects
    this.debugMarkers[key + '_label'] = sprite;
  }
  
  // Toggle debug visualization
  toggleDebug() {
    this.debugMode = !this.debugMode;
    
    if (this.debugMode) {
      // Add debug markers for all chunks
      for (const [key] of this.chunks) {
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
  
  // Set the view distance (in chunks)
  setViewDistance(distance) {
    if (distance === this.viewDistance) return;
    
    this.viewDistance = Math.max(1, Math.min(8, distance));
    this.generateChunksAroundPosition(this.currentChunk.x, this.currentChunk.z);
  }
}