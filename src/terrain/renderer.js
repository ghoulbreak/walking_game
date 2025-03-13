// Optimized TerrainRenderer.js
import * as THREE from 'three';

export class TerrainRenderer {
  constructor(terrain) {
    this.terrain = terrain;
    this.textures = this.defineColors();
    this.mesh = this.createMesh();
  }
  
  defineColors() {
    // Define colors for different terrain types
    return {
      // Grass variants
      lowGrass: new THREE.Color(0x4f7942),
      midGrass: new THREE.Color(0x556b2f),
      highGrass: new THREE.Color(0x8d9a6f),
      
      // Dirt/rock variants
      dirt: new THREE.Color(0x8B4513),
      rockDark: new THREE.Color(0x696969),
      rock: new THREE.Color(0x808080),
      rockLight: new THREE.Color(0x909090),
      
      // Snow and sand
      snow: new THREE.Color(0xFFFFFF),
      sand: new THREE.Color(0xE0C79A),
      
      // Water features
      water: new THREE.Color(0x4682B4)
    };
  }
  
  createMesh() {
    const { width, depth, heightMap } = this.terrain;
    
    // Create geometry
    const geometry = new THREE.PlaneGeometry(width, depth, width - 1, depth - 1);
    geometry.rotateX(-Math.PI / 2);
    
    // Apply heightmap
    this.applyHeightMap(geometry, heightMap);
    geometry.computeVertexNormals();
    
    // Apply colors
    this.applyTerrainColors(geometry, heightMap);
    
    // Create material with vertex colors enabled
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      color: 0xffffff,
      roughness: 0.8,
      metalness: 0.1,
      flatShading: false
    });
    
    // Create mesh
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    
    return mesh;
  }
  
  applyHeightMap(geometry, heightMap) {
    const vertices = geometry.attributes.position.array;
    
    for (let i = 0; i < vertices.length / 3; i++) {
      vertices[i * 3 + 1] = heightMap[i];
    }
    
    geometry.attributes.position.needsUpdate = true;
    return geometry;
  }
  
  applyTerrainColors(geometry, heightMap) {
    // Create colors attribute
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    // Find height range
    let minHeight = Infinity, maxHeight = -Infinity;
    for (let i = 0; i < heightMap.length; i++) {
      minHeight = Math.min(minHeight, heightMap[i]);
      maxHeight = Math.max(maxHeight, heightMap[i]);
    }
    
    const heightRange = maxHeight - minHeight;
    
    // Set colors based on height
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      const height = heightMap[i];
      const normalizedHeight = (height - minHeight) / heightRange;
      
      // Determine color based on height
      let color = new THREE.Color();
      
      if (normalizedHeight < 0.1) {
        // Water
        color.copy(this.textures.water);
      } 
      else if (normalizedHeight < 0.3) {
        // Lowlands
        color.copy(this.textures.lowGrass);
      }
      else if (normalizedHeight < 0.5) {
        // Mid elevations
        color.copy(this.textures.midGrass);
      }
      else if (normalizedHeight < 0.7) {
        // High grass to rock transition
        const t = (normalizedHeight - 0.5) / 0.2;
        color.copy(this.textures.highGrass).lerp(this.textures.rock, t);
      }
      else if (normalizedHeight < 0.9) {
        // Rocky areas
        const t = (normalizedHeight - 0.7) / 0.2;
        color.copy(this.textures.rock).lerp(this.textures.rockLight, t);
      }
      else {
        // Snow-capped peaks
        const t = (normalizedHeight - 0.9) / 0.1;
        color.copy(this.textures.rockLight).lerp(this.textures.snow, t);
      }
      
      // Apply color to vertex
      const colorIndex = i * 3;
      colors[colorIndex] = color.r;
      colors[colorIndex + 1] = color.g;
      colors[colorIndex + 2] = color.b;
    }
  }
  
  // Get the mesh for adding to scene
  getMesh() {
    return this.mesh;
  }
}