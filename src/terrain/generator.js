import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

export async function generateTerrain(width, depth, height) {
  // Create a noise generator
  const noise2D = createNoise2D();
  
  // Create geometry
  const geometry = new THREE.PlaneGeometry(width, depth, width - 1, depth - 1);
  geometry.rotateX(-Math.PI / 2); // Rotate to be horizontal
  
  // Create heightmap
  const heightMap = createHeightMap(width, depth, noise2D, height);
  
  // Apply heightmap to geometry
  applyHeightMap(geometry, heightMap, width, depth);
  
  // Calculate normals for proper lighting
  geometry.computeVertexNormals();
  
  // Create material with different colors based on height/slope
  const material = createTerrainMaterial();
  
  // Create mesh
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  
  // Create terrain object with helper methods
  const terrain = {
    mesh,
    heightMap,
    width,
    depth,
    
    // Method to get height at any point
    getHeightAt(x, z) {
      // Convert world coordinates to heightmap indices
      const ix = Math.floor((x + width / 2) / width * (width - 1));
      const iz = Math.floor((z + depth / 2) / depth * (depth - 1));
      
      // Clamp to valid indices
      const clampedIx = Math.max(0, Math.min(width - 1, ix));
      const clampedIz = Math.max(0, Math.min(depth - 1, iz));
      
      // Return height from heightmap
      return heightMap[clampedIz * width + clampedIx];
    },
    
    // Method to check if a point is on a ridge
    isRidge(x, z, threshold = 5) {
      const h = this.getHeightAt(x, z);
      const h1 = this.getHeightAt(x + 1, z);
      const h2 = this.getHeightAt(x - 1, z);
      const h3 = this.getHeightAt(x, z + 1);
      const h4 = this.getHeightAt(x, z - 1);
      
      // Simple ridge detection: higher than neighbors in one axis, similar in other
      const xDiff = (h - h1) * (h - h2);
      const zDiff = (h - h3) * (h - h4);
      
      return (xDiff > 0 && Math.abs(h3 - h4) < threshold) || 
             (zDiff > 0 && Math.abs(h1 - h2) < threshold);
    }
  };
  
  return terrain;
}

function createHeightMap(width, depth, noise2D, heightScale) {
  const heightMap = new Float32Array(width * depth);
  
  // Multiple layers of noise with different frequencies and amplitudes
  const octaves = 6;
  const persistence = 0.5;
  const lacunarity = 2.0;
  
  // Fill height map with noise values
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      // Calculate noise coordinates
      const nx = x / width - 0.5;
      const nz = z / depth - 0.5;
      
      let amplitude = 1.0;
      let frequency = 1.0;
      let noiseHeight = 0;
      
      // Sum multiple octaves of noise
      for (let o = 0; o < octaves; o++) {
        const sampleX = nx * frequency;
        const sampleZ = nz * frequency;
        
        // Get noise value
        const noiseValue = noise2D(sampleX, sampleZ) * 0.5 + 0.5; // Map from [-1,1] to [0,1]
        noiseHeight += noiseValue * amplitude;
        
        // Update frequency and amplitude for next octave
        amplitude *= persistence;
        frequency *= lacunarity;
      }
      
      // Normalize and apply height scale
      noiseHeight = Math.pow(noiseHeight / 2, 2.5) * heightScale;
      
      // Store in heightmap
      heightMap[z * width + x] = noiseHeight;
    }
  }
  
  return heightMap;
}

function applyHeightMap(geometry, heightMap, width, depth) {
  const vertices = geometry.attributes.position.array;
  
  // Set vertex heights from heightmap
  for (let i = 0; i < vertices.length / 3; i++) {
    vertices[i * 3 + 1] = heightMap[i];
  }
  
  // Update position attribute
  geometry.attributes.position.needsUpdate = true;
  
  return geometry;
}

function createTerrainMaterial() {
  // Create material with vertex colors based on height and slope
  return new THREE.MeshStandardMaterial({
    color: 0x3b7d4e,      // Base color (green)
    flatShading: false,    // Smooth shading
    metalness: 0.0,
    roughness: 0.8,
    vertexColors: false    // We'll set colors in a custom shader if needed
  });
}

// Function to generate waypoints along ridges
export function generateWaypoints(terrain, count = 10) {
  const waypoints = [];
  const width = terrain.width;
  const depth = terrain.depth;
  const attempts = count * 10; // Try more points than needed
  
  for (let i = 0; i < attempts && waypoints.length < count; i++) {
    // Get a random point on the terrain
    const x = Math.random() * width - width / 2;
    const z = Math.random() * depth - depth / 2;
    
    // Check if it's on a ridge
    if (terrain.isRidge(x, z)) {
      const y = terrain.getHeightAt(x, z);
      waypoints.push(new THREE.Vector3(x, y, z));
    }
  }
  
  // Sort waypoints to create a path
  if (waypoints.length > 1) {
    const path = [waypoints[0]];
    const remaining = waypoints.slice(1);
    
    // Simple greedy nearest-neighbor path
    while (remaining.length > 0) {
      const last = path[path.length - 1];
      let nearest = 0;
      let minDist = Infinity;
      
      // Find nearest remaining point
      for (let i = 0; i < remaining.length; i++) {
        const dist = last.distanceTo(remaining[i]);
        if (dist < minDist) {
          minDist = dist;
          nearest = i;
        }
      }
      
      // Add to path and remove from remaining
      path.push(remaining[nearest]);
      remaining.splice(nearest, 1);
    }
    
    return path;
  }
  
  return waypoints;
}