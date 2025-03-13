// src/terrain/tester.js
// Utility for testing and comparing different terrain profiles
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { TerrainProfiles, getProfile, blendProfiles } from './profiles.js';

// Create a small terrain sample with the given profile
export function createTerrainSample(width = 256, depth = 256, height = 50, profileName) {
  const profile = getProfile(profileName);
  const params = profile.params;
  
  // Create a noise generator
  const noise2D = createNoise2D();
  
  // Create geometry
  const geometry = new THREE.PlaneGeometry(width, depth, 100, 100); // Lower resolution for preview
  geometry.rotateX(-Math.PI / 2); // Rotate to be horizontal
  
  // Create heightmap using profile parameters
  const heightMap = createSampleHeightMap(width, depth, noise2D, height, params);
  
  // Apply heightmap to geometry
  applyHeightMap(geometry, heightMap, width, depth);
  
  // Calculate normals for proper lighting
  geometry.computeVertexNormals();
  
  // Create material with wireframe for better visualization
  const material = new THREE.MeshStandardMaterial({
    color: 0x3b7d4e,
    flatShading: false,
    metalness: 0.0,
    roughness: 0.8,
    wireframe: false
  });
  
  // Create mesh
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  
  return {
    mesh,
    profile: profile.name,
    heightMap
  };
}

// Create a scene with multiple terrain samples for comparison
export function createComparisonScene() {
  // Create scene, camera, renderer
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);
  
  // More distant camera to see all samples
  const camera = new THREE.PerspectiveCamera(
    45, 
    window.innerWidth / window.innerHeight, 
    0.1, 
    2000
  );
  camera.position.set(0, 300, 500);
  camera.lookAt(0, 0, 0);
  
  const renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    alpha: true
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);
  
  // Add lighting
  const ambientLight = new THREE.AmbientLight(0xCCDDFF, 0.4);
  scene.add(ambientLight);
  
  const sunLight = new THREE.DirectionalLight(0xFFFFDD, 1.0);
  sunLight.position.set(100, 150, 50);
  sunLight.castShadow = true;
  scene.add(sunLight);
  
  // Create samples of each terrain profile
  const samples = [];
  const sampleSize = 200;
  const spacing = sampleSize + 20;
  const profiles = Object.keys(TerrainProfiles);
  
  // Calculate grid layout
  const cols = Math.ceil(Math.sqrt(profiles.length));
  const rows = Math.ceil(profiles.length / cols);
  
  // Center offset
  const offsetX = (cols - 1) * spacing / 2;
  const offsetZ = (rows - 1) * spacing / 2;
  
  // Create and position each sample
  profiles.forEach((profileName, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    
    const sample = createTerrainSample(sampleSize, sampleSize, 50, profileName);
    sample.mesh.position.set(col * spacing - offsetX, 0, row * spacing - offsetZ);
    scene.add(sample.mesh);
    
    // Add profile name as text
    const textDiv = document.createElement('div');
    textDiv.className = 'terrain-label';
    textDiv.textContent = sample.profile;
    textDiv.style.position = 'absolute';
    textDiv.style.color = 'white';
    textDiv.style.backgroundColor = 'rgba(0,0,0,0.5)';
    textDiv.style.padding = '5px';
    textDiv.style.borderRadius = '3px';
    document.body.appendChild(textDiv);
    
    samples.push({
      mesh: sample.mesh,
      profile: sample.profile,
      label: textDiv
    });
  });
  
  // Add orbit controls for camera
  // Note: This requires OrbitControls.js from Three.js examples
  // const controls = new OrbitControls(camera, renderer.domElement);
  // controls.enableDamping = true;
  
  // Animate function to render scene
  function animate() {
    requestAnimationFrame(animate);
    
    // Update label positions
    samples.forEach(sample => {
      const pos = sample.mesh.position.clone();
      pos.y += 20; // Position above the terrain
      
      // Project 3D position to 2D screen coordinates
      pos.project(camera);
      
      // Convert to CSS coordinates
      const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-pos.y * 0.5 + 0.5) * window.innerHeight;
      
      sample.label.style.transform = `translate(-50%, -100%)`;
      sample.label.style.left = x + 'px';
      sample.label.style.top = y + 'px';
    });
    
    // controls.update();
    renderer.render(scene, camera);
  }
  
  // Handle window resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  
  // Start animation
  animate();
  
  return {
    scene,
    camera,
    renderer,
    samples
  };
}

// Simplified heightmap creation for sample previews
function createSampleHeightMap(width, depth, noise2D, heightScale, params) {
  const heightMap = new Float32Array(width * depth);
  
  // Use profile parameters
  const octaves = params.octaves;
  const persistence = params.persistence;
  const lacunarity = params.lacunarity;
  const initialFrequency = params.initialFrequency;
  const ridge = params.ridge;
  const exponent = params.exponent;
  const finalHeightScale = heightScale * (params.heightScale / 100);
  
  // Use fixed seed for consistent comparison
  const offsetX = 42;
  const offsetZ = 42;
  
  // Fill height map
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      // Calculate noise coordinates
      const nx = x / width;
      const nz = z / depth;
      
      let amplitude = 1.0;
      let frequency = initialFrequency;
      let noiseHeight = 0;
      let normalization = 0;
      
      // Sum multiple octaves of noise
      for (let o = 0; o < octaves; o++) {
        const sampleX = (nx * frequency) + offsetX;
        const sampleZ = (nz * frequency) + offsetZ;
        
        let noiseValue = noise2D(sampleX, sampleZ);
        
        // Ridge noise transformation
        noiseValue = Math.abs(noiseValue);
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
      noiseHeight *= finalHeightScale;
      
      // Store in heightmap
      heightMap[z * width + x] = noiseHeight;
    }
  }
  
  // Apply smoothing if specified
  if (params.smoothingPasses && params.smoothingPasses > 0) {
    // Simple box blur for smoothing
    const smoothed = new Float32Array(heightMap.length);
    
    for (let pass = 0; pass < params.smoothingPasses; pass++) {
      for (let z = 0; z < depth; z++) {
        for (let x = 0; x < width; x++) {
          let sum = 0;
          let count = 0;
          
          // 3x3 kernel
          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              const nz = z + dz;
              
              if (nx >= 0 && nx < width && nz >= 0 && nz < depth) {
                sum += heightMap[nz * width + nx];
                count++;
              }
            }
          }
          
          smoothed[z * width + x] = sum / count;
        }
      }
      
      // Copy back for next pass
      for (let i = 0; i < heightMap.length; i++) {
        heightMap[i] = smoothed[i];
      }
    }
  }
  
  return heightMap;
}

function applyHeightMap(geometry, heightMap, width, depth) {
  const vertices = geometry.attributes.position.array;
  const vertexCount = vertices.length / 3;
  
  // Map each vertex to the appropriate heightmap point
  for (let i = 0; i < vertexCount; i++) {
    // Get vertex X and Z positions
    const vertexX = vertices[i * 3];
    const vertexZ = vertices[i * 3 + 2];
    
    // Convert to heightmap indices
    const nx = (vertexX / width + 0.5);
    const nz = (vertexZ / depth + 0.5);
    
    const ix = Math.floor(nx * width);
    const iz = Math.floor(nz * depth);
    
    // Clamp to valid indices
    const clampedIx = Math.max(0, Math.min(width - 1, ix));
    const clampedIz = Math.max(0, Math.min(depth - 1, iz));
    
    // Get height from heightmap
    const height = heightMap[clampedIz * width + clampedIx];
    
    // Apply height to vertex
    vertices[i * 3 + 1] = height;
  }
  
  // Update position attribute
  geometry.attributes.position.needsUpdate = true;
  
  return geometry;
}

// Function to launch the terrain comparison utility
export function launchTerrainComparison() {
  // Create a new page or overlay for the comparison
  const originalContent = document.body.innerHTML;
  document.body.innerHTML = `
    <div id="terrain-comparison">
      <div class="comparison-header">
        <h1>Terrain Profile Comparison</h1>
        <button id="back-button">Return to Simulator</button>
      </div>
      <div id="terrain-samples"></div>
    </div>
  `;
  
  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    body { margin: 0; overflow: hidden; background: #000; }
    .comparison-header {
      position: absolute;
      top: 10px;
      left: 10px;
      z-index: 100;
      color: white;
      background: rgba(0,0,0,0.5);
      padding: 10px;
      border-radius: 5px;
    }
    .comparison-header h1 {
      margin: 0 0 10px 0;
      font-size: 18px;
    }
    #back-button {
      background: #333;
      color: white;
      border: none;
      padding: 8px 15px;
      border-radius: 3px;
      cursor: pointer;
    }
    #back-button:hover {
      background: #555;
    }
    .terrain-label {
      font-family: Arial, sans-serif;
      font-size: 14px;
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);
  
  // Create the comparison scene
  const comparison = createComparisonScene();
  
  // Add back button handler
  document.getElementById('back-button').addEventListener('click', () => {
    // Clean up
    comparison.renderer.dispose();
    document.body.removeChild(comparison.renderer.domElement);
    document.body.innerHTML = originalContent;
    
    // Reload main application
    const script = document.createElement('script');
    script.type = 'module';
    script.src = '/src/main.js';
    document.body.appendChild(script);
  });
}