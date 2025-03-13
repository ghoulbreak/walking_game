// Updated TerrainRenderer.js with color fixes

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
    
    // Define colors for different terrain types with more variety
    this.textures = {
      // Multiple grass variants
      lowGrass: new THREE.Color(0x4f7942),    // Forest green for lower valleys
      midGrass: new THREE.Color(0x556b2f),    // Olive green for mid elevations
      highGrass: new THREE.Color(0x8d9a6f),   // Sage green for higher elevations
      
      // Multiple dirt/rock variants
      dirt: new THREE.Color(0x8B4513),        // Brown for gentle slopes
      lightDirt: new THREE.Color(0xa0522d),   // Lighter brown for variety
      rockDark: new THREE.Color(0x696969),    // Dark gray for lower rocks
      rock: new THREE.Color(0x808080),        // Medium gray for mid-level rocks
      rockLight: new THREE.Color(0x909090),   // Light gray for higher rocks
      
      // Snow and sand
      snow: new THREE.Color(0xFFFFFF),        // White for peaks
      snowDirty: new THREE.Color(0xf0f0f0),   // Slightly off-white for lower snow
      sand: new THREE.Color(0xE0C79A),        // Tan for beach areas
      
      // Water features  
      water: new THREE.Color(0x4682B4),       // Water areas
      waterDeep: new THREE.Color(0x36648b)    // Deeper water
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
    
    // CRITICAL FIX: Create material with vertex colors ENABLED and proper settings
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      color: 0xffffff,      // White base color to not tint vertex colors
      roughness: 0.8,
      metalness: 0.1,
      flatShading: false,
      side: THREE.FrontSide,
      shadowSide: THREE.FrontSide
    });
    
    // Create mesh
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    
    // Log color application
    console.log("Terrain mesh created with vertex colors ENABLED");
    
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
  
  // In the applyTerrainColors method, add logging for color values:
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
    console.log(`Terrain height range: ${minHeight.toFixed(1)} to ${maxHeight.toFixed(1)}`);
    
    // Sample some color values for debugging
    let colorSamples = [];
    
    // Set colors based on height and slope
    for (let i = 0; i < positions.length / 3; i++) {
      const x = i % width;
      const z = Math.floor(i / width);
      
      // Get vertex height and normalize to 0-1
      const height = heightMap[i];
      const normalizedHeight = (height - minHeight) / heightRange;
      
      // SIMPLIFIED COLOR APPROACH FOR DEBUGGING
      // Just use a height-based gradient for now
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
      
      // Store a few samples for debugging
      if (i % (width * 20) === 0) {
        colorSamples.push({
          index: i,
          height: height,
          normalizedHeight: normalizedHeight,
          color: [color.r, color.g, color.b]
        });
      }
      
      // Apply color to vertex
      const colorIndex = i * 3;
      colors[colorIndex] = color.r;
      colors[colorIndex + 1] = color.g;
      colors[colorIndex + 2] = color.b;
    }
    
    // Log color samples
    console.log("Color samples:", colorSamples);
    
    console.log(`Applied terrain colors to ${geometry.attributes.position.count} vertices`);
  }
  
  update() {
    // This method could be used for terrain animations or updates
  }
  
  // Method to get the mesh for adding to scene
  getMesh() {
    return this.mesh;
  }
}