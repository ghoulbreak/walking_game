// src/terrain/core/terrain-mesh-builder.js
// Creates 3D mesh representations of terrain from heightmaps

import * as THREE from 'three';
import { applyTerrainColors } from './terrain-colorizer.js';

/**
 * Creates a terrain mesh from a heightmap
 * @param {Float32Array} heightMap - The heightmap data
 * @param {number} width - Width of the mesh in world units
 * @param {number} depth - Depth of the mesh in world units
 * @param {number} resolution - Resolution of the heightmap
 * @param {Array} elevationZones - Elevation zone definitions
 * @param {number} waterLevel - Height of water level
 * @returns {THREE.Mesh} - The created terrain mesh
 */
export function createTerrainMesh(heightMap, width, depth, resolution, elevationZones, waterLevel) {
  // Create geometry (plane with subdivisions matching heightmap resolution)
  const geometry = new THREE.PlaneGeometry(
    width, 
    depth, 
    resolution - 1, 
    resolution - 1
  );
  geometry.rotateX(-Math.PI / 2); // Rotate to flat XZ plane
  
  // Apply heightmap
  applyHeightMap(geometry, heightMap);
  
  // Compute normals for lighting
  geometry.computeVertexNormals();
  
  // Apply colors based on height and slopes
  applyTerrainColors(geometry, heightMap, resolution, resolution, elevationZones, waterLevel);
  
  // Create material with vertex colors
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: false,
    metalness: 0.0,
    roughness: 0.8
  });
  
  // Create mesh
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  
  return mesh;
}

/**
 * Apply heightmap values to geometry vertices
 * @param {THREE.BufferGeometry} geometry - The geometry to modify
 * @param {Float32Array} heightMap - The heightmap data
 * @returns {THREE.BufferGeometry} - The modified geometry
 */
export function applyHeightMap(geometry, heightMap) {
  const positions = geometry.attributes.position.array;
  
  for (let i = 0; i < positions.length / 3; i++) {
    positions[i * 3 + 1] = heightMap[i];
  }
  
  geometry.attributes.position.needsUpdate = true;
  return geometry;
}

/**
 * Create a chunk of terrain with associated data and helper methods
 * @param {Float32Array} heightMap - The heightmap data
 * @param {number} worldX - World X position of the chunk
 * @param {number} worldZ - World Z position of the chunk
 * @param {number} size - Size of the chunk in world units
 * @param {number} resolution - Resolution of the heightmap
 * @param {Array} elevationZones - Elevation zone definitions
 * @param {number} waterLevel - Height of water level
 * @returns {Object} - Terrain chunk object with mesh and helper methods
 */
export function createTerrainChunk(heightMap, worldX, worldZ, size, resolution, elevationZones, waterLevel) {
  // Create the mesh
  const mesh = createTerrainMesh(heightMap, size, size, resolution, elevationZones, waterLevel);
  
  // Position the mesh in the world
  mesh.position.set(worldX, 0, worldZ);
  
  // Create a terrain chunk object with helper methods
  return {
    mesh,
    heightMap,
    worldX,
    worldZ,
    size,
    resolution,
    
    // Get height at world coordinates
    getHeightAt(x, z) {
      // Convert from world to local coordinates
      const localX = x - (worldX - size / 2);
      const localZ = z - (worldZ - size / 2);
      
      // Check if point is within chunk
      if (localX < 0 || localX > size || localZ < 0 || localZ > size) {
        return null;
      }
      
      // Convert to heightmap indices
      const gridX = Math.floor(localX / size * resolution);
      const gridZ = Math.floor(localZ / size * resolution);
      
      // Clamp to valid indices
      const clampedGridX = Math.max(0, Math.min(resolution - 1, gridX));
      const clampedGridZ = Math.max(0, Math.min(resolution - 1, gridZ));
      
      return heightMap[clampedGridZ * resolution + clampedGridX];
    }
  };
}

/**
 * Creates visual debug markers for a terrain chunk
 * @param {number} chunkX - Chunk X coordinate
 * @param {number} chunkZ - Chunk Z coordinate
 * @param {number} size - Size of the chunk in world units
 * @returns {Object} - Map containing the created markers
 */
export function createDebugMarkers(chunkX, chunkZ, size) {
  const worldX = chunkX * size;
  const worldZ = chunkZ * size;
  const markers = {};
  
  // Create marker at chunk corner
  const geometry = new THREE.BoxGeometry(2, 20, 2);
  const material = new THREE.MeshBasicMaterial({ 
    color: 0xff0000, 
    wireframe: true 
  });
  
  const marker = new THREE.Mesh(geometry, material);
  marker.position.set(worldX, 5, worldZ);
  markers.cornerMarker = marker;
  
  // Create text label
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
  markers.label = sprite;
  
  // Create wireframe box showing chunk bounds
  const boxGeometry = new THREE.BoxGeometry(size, 50, size);
  const boxMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    wireframe: true,
    opacity: 0.2,
    transparent: true
  });
  
  const box = new THREE.Mesh(boxGeometry, boxMaterial);
  box.position.set(worldX, 25, worldZ);
  markers.boundingBox = box;
  
  return markers;
}