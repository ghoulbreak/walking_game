import * as THREE from 'three';
import { calculateGradient, calculateNormal } from '../utils/math.js';

export class TerrainRenderer {
  constructor(terrain) {
    this.terrain = terrain;
    this.textures = {};
    
    // Initialize directly instead of async
    this.loadTextures();
    
    // Create terrain mesh immediately
    this.mesh = this.createMesh();
    
    console.log("TerrainRenderer constructor complete, mesh created:", !!this.mesh);
  }
  
  loadTextures() {
    // Simplified synchronous texture setup for debugging
    console.log("Setting up terrain textures");
    
    // Just use colors for now
    this.textures = {
      grass: new THREE.Color(0x3b7d4e),
      rock: new THREE.Color(0x808080),
      snow: new THREE.Color(0xffffff)
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
    
    // Create material - first try with a basic material for maximum visibility
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      wireframe: true,  // Add wireframe for debugging
      side: THREE.DoubleSide // Make sure it's visible from both sides
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
    
    // Set colors based on height and slope
    for (let i = 0; i < positions.length / 3; i++) {
      const x = i % width;
      const z = Math.floor(i / width);
      
      // Get vertex height
      const height = heightMap[i];
      
      // Calculate gradient (steepness)
      const gradient = calculateGradient(heightMap, width, x, z);
      
      // Determine color based on height and gradient
      let color = new THREE.Color();
      
      if (gradient > 0.5) {
        // Steep areas (rock)
        color.copy(this.textures.rock);
      } else if (height > 25) {
        // High areas (snow)
        color.copy(this.textures.snow);
      } else {
        // Normal terrain (grass)
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