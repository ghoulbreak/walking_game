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

    // Enhance the directional light for more dramatic shadows
    const sunLight = new THREE.DirectionalLight(0xFFFFDD, 1.2); // Increased intensity
    sunLight.position.set(150, 200, 80); // Higher angle for longer shadows
    sunLight.castShadow = true;

    // Improve shadow quality
    sunLight.shadow.mapSize.width = 4096;  // Increased from 2048
    sunLight.shadow.mapSize.height = 4096; // Increased from 2048
    sunLight.shadow.bias = -0.0003; // Adjusted to reduce shadow acne
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
    const waterLevel = 0.06;
    const sandLevel = 0.09;
    const lowGrassLevel = 0.25;
    const midGrassLevel = 0.40;
    const highGrassLevel = 0.55;
    const rockLevel = 0.70;
    const snowLineBase = 0.78;
    
    // Slope thresholds
    const lowSlopeThreshold = 0.2;
    const midSlopeThreshold = 0.4;
    const highSlopeThreshold = 0.6;
    
    // Noise function for color variation
    const colorNoise = (x, z, scale = 0.05) => {
      return Math.sin(x * scale) * Math.cos(z * scale) * 0.5 + 0.5;
    };
    
    // Set colors based on height and slope
    for (let i = 0; i < positions.length / 3; i++) {
      const x = i % width;
      const z = Math.floor(i / width);
      
      // Get vertex height and normalize to 0-1
      const height = heightMap[i];
      const normalizedHeight = (height - minHeight) / heightRange;
      
      // Calculate gradient (steepness)
      const gradient = calculateGradient(heightMap, width, x, z);
      
      // Get noise value for this position (for color variation)
      const noise = colorNoise(x, z);
      
      // Determine color based on height and gradient
      let color = new THREE.Color();
      
      if (normalizedHeight < waterLevel) {
        // Water features - vary by depth
        const waterMix = normalizedHeight / waterLevel;
        color.copy(this.textures.waterDeep).lerp(this.textures.water, waterMix);
      } 
      else if (normalizedHeight < sandLevel) {
        // Sand/Beach areas
        color.copy(this.textures.sand);
        
        // Add slight variation
        const sandVariation = noise * 0.1;
        color.multiplyScalar(1.0 + sandVariation);
      } 
      else if (gradient > midSlopeThreshold) {
        // Darken color based on slope
        const shadowFactor = 1.0 - (gradient - midSlopeThreshold) * 0.5;
        color.multiplyScalar(shadowFactor);
      }
      
      else if (normalizedHeight > snowLineBase) {
        // Snow regions - transition from rock to snow
        const snowiness = (normalizedHeight - snowLineBase) / (1 - snowLineBase);
        
        // Use noise to make snow line irregular
        const adjustedSnowiness = Math.min(1, snowiness + (noise - 0.5) * 0.3);
        
        // Less snow on steep slopes
        const slopeSnowFactor = Math.max(0, 1 - gradient * 2);
        const finalSnowiness = adjustedSnowiness * slopeSnowFactor;
        
        if (finalSnowiness < 0.4) {
          // Rocky areas near snow line
          color.copy(this.textures.rockLight);
        } else if (finalSnowiness < 0.7) {
          // Partially snowy areas - dirty snow
          color.copy(this.textures.rockLight).lerp(this.textures.snowDirty, (finalSnowiness - 0.4) / 0.3);
        } else {
          // Fully snow-covered areas
          color.copy(this.textures.snowDirty).lerp(this.textures.snow, (finalSnowiness - 0.7) / 0.3);
        }
      } 
      else if (gradient > lowSlopeThreshold) {
        // Sloped areas - mix of rock, dirt and grass based on steepness and height
        if (gradient > midSlopeThreshold) {
          // Steeper slopes - more rocky
          const rockiness = (gradient - midSlopeThreshold) / (highSlopeThreshold - midSlopeThreshold);
          color.copy(this.textures.dirt).lerp(this.textures.rockDark, rockiness);
        } else {
          // Gentler slopes - more dirt/grass mix
          const dirtiness = (gradient - lowSlopeThreshold) / (midSlopeThreshold - lowSlopeThreshold);
          
          // Choose grass color based on elevation
          let grassColor;
          if (normalizedHeight > highGrassLevel) {
            grassColor = this.textures.highGrass;
          } else if (normalizedHeight > midGrassLevel) {
            grassColor = this.textures.midGrass;
          } else {
            grassColor = this.textures.lowGrass;
          }
          
          // Mix between appropriate grass and dirt
          color.copy(grassColor).lerp(this.textures.dirt, dirtiness);
        }
        
        // Add noise variation
        const variation = (noise - 0.5) * 0.15;
        color.r = Math.max(0, Math.min(1, color.r + variation));
        color.g = Math.max(0, Math.min(1, color.g + variation));
        color.b = Math.max(0, Math.min(1, color.b + variation));
      } 
      else {
        // Flatter areas - grass with height-based variation
        if (normalizedHeight > highGrassLevel) {
          color.copy(this.textures.highGrass);
        } else if (normalizedHeight > midGrassLevel) {
          // Transition between mid and high grass
          const grassMix = (normalizedHeight - midGrassLevel) / (highGrassLevel - midGrassLevel);
          color.copy(this.textures.midGrass).lerp(this.textures.highGrass, grassMix);
        } else if (normalizedHeight > lowGrassLevel) {
          // Transition between low and mid grass
          const grassMix = (normalizedHeight - lowGrassLevel) / (midGrassLevel - lowGrassLevel);
          color.copy(this.textures.lowGrass).lerp(this.textures.midGrass, grassMix);
        } else {
          // Lowest areas - mix between sand and low grass
          const grassMix = (normalizedHeight - sandLevel) / (lowGrassLevel - sandLevel);
          color.copy(this.textures.sand).lerp(this.textures.lowGrass, grassMix);
        }
        
        // Add noise-based variation for natural look
        const variation = (noise - 0.5) * 0.1;
        color.r = Math.max(0, Math.min(1, color.r + variation));
        color.g = Math.max(0, Math.min(1, color.g + variation));
        color.b = Math.max(0, Math.min(1, color.b + variation));
      }
    }
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