import * as THREE from 'three';
import { calculateGradient, calculateNormal } from '../utils/math.js';

export class TerrainRenderer {
  constructor(terrain) {
    this.terrain = terrain;
    this.textures = {};
    
    // Initialize textures
    this.loadTextures();
    
    // Create terrain mesh immediately
    this.mesh = this.createMesh();
    
    console.log("TerrainRenderer constructor complete, mesh created:", !!this.mesh);
  }
  
  loadTextures() {
    console.log("Setting up terrain textures");
    
    // Define colors for different terrain types
    this.textures = {
      grass: new THREE.Color(0x3b7d4e),     // Darker green for low areas
      dirt: new THREE.Color(0x8B4513),      // Brown for slopes
      rock: new THREE.Color(0x808080),      // Gray for steep areas
      snow: new THREE.Color(0xFFFFFF),      // White for peaks
      sand: new THREE.Color(0xE0C79A),      // Sand for beach areas
      water: new THREE.Color(0x4682B4)      // Water areas (if needed)
    };
  }
  
  createMesh() {
    console.log("Creating terrain mesh...");
    const { width, depth, heightMap } = this.terrain;
    
    // Create geometry
    const geometry = new THREE.PlaneGeometry(width, depth, width - 1, depth - 1);
    geometry.rotateX(-Math.PI / 2); // Rotate to be horizontal
    
    // Apply heightmap to geometry
    this.applyHeightMap(geometry, heightMap, width, depth);
    
    // Calculate normals for proper lighting
    geometry.computeVertexNormals();
    
    // Create vertex colors based on height and slope
    this.applyTerrainColors(geometry, heightMap, width, depth);
    
    // Create material with vertex colors and improved appearance
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.8,
      metalness: 0.1,
      flatShading: false, // Set to true for a more polygonal look
      side: THREE.FrontSide
    });
    
    // Create mesh
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    
    // Log mesh creation
    console.log("Terrain mesh created:", this.mesh);
    
    return this.mesh;
  }
  
  applyHeightMap(geometry, heightMap, width, depth) {
    const vertices = geometry.attributes.position.array;
    
    // Set vertex heights from heightmap
    for (let i = 0; i < vertices.length / 3; i++) {
      vertices[i * 3 + 1] = heightMap[i];
    }
    
    // Update position attribute
    geometry.attributes.position.needsUpdate = true;
    
    return geometry;
  }
  
  applyTerrainColors(geometry, heightMap, width, depth) {
    // Create colors attribute for the vertices
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    const colorAttribute = new THREE.BufferAttribute(colors, 3);
    geometry.setAttribute('color', colorAttribute);
    
    const positions = geometry.attributes.position.array;
    
    // Find min and max heights for proper scaling
    let minHeight = Infinity;
    let maxHeight = -Infinity;
    for (let i = 0; i < heightMap.length; i++) {
      minHeight = Math.min(minHeight, heightMap[i]);
      maxHeight = Math.max(maxHeight, heightMap[i]);
    }
    
    const heightRange = maxHeight - minHeight;
    
    // Terrain type thresholds (normalized 0-1)
    const waterLevel = 0.08;
    const sandLevel = 0.12;
    const grassLevel = 0.45;
    const rockLevel = 0.75;
    
    // Slope thresholds
    const lowSlopeThreshold = 0.2;
    const highSlopeThreshold = 0.5;
    
    // Set colors based on height and slope
    for (let i = 0; i < positions.length / 3; i++) {
      const x = i % width;
      const z = Math.floor(i / width);
      
      // Get vertex height and normalize to 0-1
      const height = heightMap[i];
      const normalizedHeight = (height - minHeight) / heightRange;
      
      // Calculate gradient (steepness)
      const gradient = calculateGradient(heightMap, width, x, z);
      
      // Determine color based on height and gradient
      let color = new THREE.Color();
      
      if (normalizedHeight < waterLevel) {
        // Water
        color.copy(this.textures.water);
      } else if (normalizedHeight < sandLevel) {
        // Sand/Beach
        color.copy(this.textures.sand);
      } else if (gradient > highSlopeThreshold) {
        // Very steep areas (rock)
        color.copy(this.textures.rock);
      } else if (normalizedHeight > rockLevel) {
        // Mountain peaks (potential snow)
        // Mix rock and snow based on height
        const snowMix = (normalizedHeight - rockLevel) / (1 - rockLevel);
        color.copy(this.textures.rock).lerp(this.textures.snow, snowMix);
      } else if (gradient > lowSlopeThreshold) {
        // Moderate slopes (mix of dirt and grass)
        const dirtMix = (gradient - lowSlopeThreshold) / (highSlopeThreshold - lowSlopeThreshold);
        color.copy(this.textures.grass).lerp(this.textures.dirt, dirtMix);
      } else {
        // Lower, flatter areas (grass)
        color.copy(this.textures.grass);
      }
      
      // Apply color to vertex
      color.toArray(colors, i * 3);
    }
    
    // Mark colors as needing update
    colorAttribute.needsUpdate = true;
  }
  
  update() {
    // This method could be used for terrain animations or updates
    // For example, waves on water surfaces or swaying grass
  }
  
  // Method to get the mesh for adding to scene
  getMesh() {
    return this.mesh;
  }
}