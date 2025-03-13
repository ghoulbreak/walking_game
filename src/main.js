// src/main.js
import { createScene, resizeHandler } from './scene.js';
import { initPlayer, updatePlayer } from './player.js';
import { generateTerrain } from './terrain/generator.js';
import { TerrainRenderer } from './terrain/renderer.js';
import { WaypointSystem } from './waypoint-system.js';
import { TerrainAnalyzer } from './terrain/analysis.js';
import { TerrainProfiles, defaultProfile } from './terrain/profiles.js';
import { launchTerrainComparison } from './terrain/tester.js';
import * as THREE from 'three';

// Performance monitoring
let lastTime = 0;
let deltaTime = 0;
let fps = 0;

// Current terrain profile
let currentProfile = defaultProfile;



// Add the debug function somewhere at the top level of main.js
function debugTerrainObject(terrain, label = "Terrain") {
    console.group(`${label} Debug Info`);
    console.log("Has mesh:", !!terrain.mesh);
    console.log("Has heightMap:", !!terrain.heightMap);
    console.log("heightMap length:", terrain.heightMap ? terrain.heightMap.length : "N/A");
    console.log("Has getHeightAt function:", typeof terrain.getHeightAt === "function");
    
    // Test getHeightAt at origin
    if (typeof terrain.getHeightAt === "function") {
      try {
        const centerHeight = terrain.getHeightAt(0, 0);
        console.log("Height at (0,0):", centerHeight);
      } catch (e) {
        console.error("Error getting height at (0,0):", e);
      }
    }
    
    console.groupEnd();
  }

// Initialize the application
async function init() {
  // Get DOM elements
  const fpsDisplay = document.getElementById('fps');
  const positionDisplay = document.getElementById('position');
  const elevationDisplay = document.getElementById('elevation');
  const staminaBar = document.getElementById('stamina-bar');
  const profileSelect = document.getElementById('profile-select');
  const compareButton = document.getElementById('compare-profiles');

  // Create terrain profile selector if it exists
  if (profileSelect) {
    setupProfileSelector(profileSelect);
  }
  
  // Set up compare button if it exists
  if (compareButton) {
    compareButton.addEventListener('click', () => {
      launchTerrainComparison();
    });
  }

  // Create the Three.js scene
  const { scene, camera, renderer } = createScene();
  console.log("Scene created successfully");
  
  // Add window resize handler
  window.addEventListener('resize', () => resizeHandler(camera, renderer));
  
  // Generate procedural terrain using selected profile
  console.log(`Generating terrain using ${currentProfile} profile...`);
  const terrainWidth = 1024; // Large terrain
  const terrainDepth = 1024;
  const terrainHeight = 150; // Base height scale (will be adjusted by profile)
  
  // Generate terrain with the selected profile
  const terrain = await generateTerrain(terrainWidth, terrainDepth, terrainHeight, currentProfile);
  scene.add(terrain.mesh);

// Add the fixTerrainColors function to main.js (near the top of the file)
function fixTerrainColors() {
    console.log("Applying direct terrain color fix");
    
    // Check if terrain exists
    if (!terrain || !terrain.mesh) {
      console.error("No terrain or mesh available");
      return;
    }
    
    // Get geometry
    const geometry = terrain.mesh.geometry;
    if (!geometry) {
      console.error("No geometry found on terrain mesh");
      return;
    }
    
    // Get vertex count
    const count = geometry.attributes.position.count;
    console.log(`Found ${count} vertices in terrain geometry`);
    
    // Create a simple color buffer
    const colors = new Float32Array(count * 3);
    
    // Apply colors based on height
    const positions = geometry.attributes.position.array;
    for (let i = 0; i < count; i++) {
      // Get Y value (height)
      const height = positions[i * 3 + 1];
      
      // Very simple height-based coloring
      // Normalize to 0-1 range (assuming heights between 0-200)
      const normalizedHeight = Math.max(0, Math.min(1, height / 200));
      
      // Color index
      const colorIndex = i * 3;
      
      // Simple coloring logic
      if (normalizedHeight < 0.1) {
        // Water - blue
        colors[colorIndex] = 0.0;      // R
        colors[colorIndex + 1] = 0.2;  // G
        colors[colorIndex + 2] = 0.8;  // B
      } 
      else if (normalizedHeight < 0.3) {
        // Low land - green
        colors[colorIndex] = 0.0;      // R
        colors[colorIndex + 1] = 0.7;  // G
        colors[colorIndex + 2] = 0.2;  // B
      }
      else if (normalizedHeight < 0.7) {
        // Mountains - brown to gray
        const t = (normalizedHeight - 0.3) / 0.4; // 0-1 in this range
        colors[colorIndex] = 0.4 + t * 0.3;       // R
        colors[colorIndex + 1] = 0.3 - t * 0.1;   // G
        colors[colorIndex + 2] = 0.2;             // B
      }
      else {
        // Snow caps - white
        const t = (normalizedHeight - 0.7) / 0.3; // 0-1 in this range
        colors[colorIndex] = 0.7 + t * 0.3;       // R
        colors[colorIndex + 1] = 0.7 + t * 0.3;   // G
        colors[colorIndex + 2] = 0.7 + t * 0.3;   // B
      }
    }
    
    // Set color attribute on geometry
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    // Make sure the material has vertex colors enabled
    if (terrain.mesh.material) {
      terrain.mesh.material.vertexColors = true;
      
      // Ensure the base color is white
      terrain.mesh.material.color.setRGB(1, 1, 1);
      
      console.log("Updated material:", {
        vertexColors: terrain.mesh.material.vertexColors,
        color: terrain.mesh.material.color.getHexString()
      });
    } else {
      console.error("No material found on terrain mesh");
    }
    
    // Force geometry update
    geometry.attributes.color.needsUpdate = true;
    
    console.log("Direct color fix applied");
  }

  fixTerrainColors();
  
  // Initialize player controls - start at a good viewpoint
  console.log("Initializing player...");
  const player = initPlayer(camera, terrain);
  player.camera = camera; // Add camera reference for updates
  
  // Start at an elevated position for a better view
  const startX = 0;
  const startZ = -50; // Start back from the center
  const heightAtStart = terrain.getHeightAt(startX, startZ) + player.height + 2;
  player.position.set(startX, heightAtStart, startZ);
  camera.position.copy(player.position);
  
  // Create waypoint system for ridge navigation
  console.log("Creating waypoints along ridges...");
  const waypointSystem = new WaypointSystem(scene, terrain);
  const waypoints = waypointSystem.generateWaypoints(8); // Generate 8 waypoints
  
  // Function to regenerate terrain with a new profile
  // The fixed regenerateTerrain function
async function regenerateTerrain(profileName) {
    console.log(`Regenerating terrain with ${profileName} profile...`);
    
    // Debug terrain before regeneration
    debugTerrainObject(terrain, "Before regeneration");
    
    // Store current player position
    const playerX = player.position.x;
    const playerZ = player.position.z;
    
    // Remove old terrain mesh from scene
    scene.remove(terrain.mesh);
    
    // Clear any waypoints
    if (waypointSystem) {
      waypointSystem.clearWaypoints();
    }
    
    // Generate new terrain with selected profile
    currentProfile = profileName;
    const newTerrain = await generateTerrain(terrainWidth, terrainDepth, terrainHeight, profileName);
    
    // Add new terrain to scene
    scene.add(newTerrain.mesh);
    
    // CRITICAL FIX: Replace the entire terrain object with newTerrain
    // Using Object.assign ensures ALL properties and methods are copied
    Object.assign(terrain, newTerrain);
    
    // Debug terrain after regeneration to verify it's correct
    debugTerrainObject(terrain, "After regeneration");
    
    // Now get the correct height at player's position
    const heightAtPlayerPos = terrain.getHeightAt(playerX, playerZ);
    console.log(`Height at player position (${playerX.toFixed(1)}, ${playerZ.toFixed(1)}): ${heightAtPlayerPos.toFixed(1)}`);
    
    const safetyMargin = 2; // Extra units above terrain
    
    // Position player safely above the new terrain
    player.position.y = heightAtPlayerPos + player.height + safetyMargin;
    
    // Reset velocity to prevent falling through terrain
    player.velocity.set(0, 0, 0);
    player.isOnGround = true;
    
    // Update camera position
    if (player.camera) {
      player.camera.position.copy(player.position);
    }
    
    // Regenerate waypoints with the updated terrain
    if (waypointSystem) {
      // Ensure waypoint system uses the same terrain reference
      waypointSystem.terrain = terrain;
      waypointSystem.generateWaypoints(8);
    }

    fixTerrainColors();
    
    console.log(`Terrain regenerated with ${profileName} profile`);
    console.log(`Player positioned at (${playerX.toFixed(1)}, ${player.position.y.toFixed(1)}, ${playerZ.toFixed(1)})`);
  }
  
  // Now make sure this function gets USED in two places:
  
  // 1. In the init function, update the profile selector event listener:
  if (profileSelect) {
    profileSelect.addEventListener('change', (e) => {
      regenerateTerrain(e.target.value);
    });
  }
  
  
  // Add profile switching with number keys (1-5)
  document.addEventListener('keydown', (event) => {
    const profileNames = Object.keys(TerrainProfiles);
    
    // Number keys 1-5 for different profiles
    if (event.code === 'Digit1' && profileNames.length >= 1) {
      regenerateTerrain(profileNames[0]);
    } else if (event.code === 'Digit2' && profileNames.length >= 2) {
      regenerateTerrain(profileNames[1]);
    } else if (event.code === 'Digit3' && profileNames.length >= 3) {
      regenerateTerrain(profileNames[2]);
    } else if (event.code === 'Digit4' && profileNames.length >= 4) {
      regenerateTerrain(profileNames[3]);
    } else if (event.code === 'Digit5' && profileNames.length >= 5) {
      regenerateTerrain(profileNames[4]);
    }
    
    // Teleport feature (T key)
    if (event.code === 'KeyT') {
      // Teleport to a random flat area
      const attempts = 20; // Try up to 20 locations to find a flat spot
      for (let i = 0; i < attempts; i++) {
        const x = (Math.random() - 0.5) * terrainWidth * 0.5;
        const z = (Math.random() - 0.5) * terrainDepth * 0.5;
        const height = terrain.getHeightAt(x, z);
        
        // Check surrounding heights to find a flat area
        const surroundingSlope = Math.max(
          Math.abs(height - terrain.getHeightAt(x + 5, z)),
          Math.abs(height - terrain.getHeightAt(x - 5, z)),
          Math.abs(height - terrain.getHeightAt(x, z + 5)),
          Math.abs(height - terrain.getHeightAt(x, z - 5))
        );
        
        // If slope is less than 3 units, it's relatively flat
        if (surroundingSlope < 3) {
          player.position.set(x, height + player.height + 2, z);
          player.velocity.set(0, 0, 0);
          console.log(`Teleported to (${x.toFixed(1)}, ${height.toFixed(1)}, ${z.toFixed(1)})`);
          break;
        }
      }
    }
  });
  
  // Animation loop
  function animate(currentTime) {
    requestAnimationFrame(animate);
    
    // Calculate delta time and FPS
    if (lastTime > 0) {
      deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
      fps = 1 / deltaTime;
    }
    lastTime = currentTime;
    
    // Update FPS display
    if (fpsDisplay) {
      fpsDisplay.textContent = `FPS: ${fps.toFixed(1)}`;
    }
    
    // Update player movement
    updatePlayer(player, deltaTime, terrain);
    
    // Update waypoint system
    if (waypointSystem) {
      waypointSystem.update(player.position);
    }
    
    // Update position display
    if (positionDisplay) {
      const pos = player.position;
      positionDisplay.textContent = `Position: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`;
    }
    
    // Update elevation display
    if (elevationDisplay && terrain) {
      const groundHeight = terrain.getHeightAt(player.position.x, player.position.z);
      elevationDisplay.textContent = `Elevation: ${groundHeight.toFixed(1)}m | Profile: ${terrain.profile}`;
    }
    
    // Update stamina bar
    if (staminaBar) {
      const staminaPercent = (player.stamina.current / player.stamina.max) * 100;
      staminaBar.style.width = `${staminaPercent}%`;
      
      // Change color when stamina is low
      if (staminaPercent < 30) {
        staminaBar.classList.add('stamina-low');
      } else {
        staminaBar.classList.remove('stamina-low');
      }
    }
    
    // Render the scene
    renderer.render(scene, camera);
  }
  
  // Start animation loop
  animate();
}

// Setup profile selector dropdown
function setupProfileSelector(selectElement) {
  // Clear existing options
  selectElement.innerHTML = '';
  
  // Add options for each profile
  for (const [key, profile] of Object.entries(TerrainProfiles)) {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = profile.name;
    
    // Set default profile as selected
    if (key === defaultProfile) {
      option.selected = true;
    }
    
    selectElement.appendChild(option);
  }
}

// This is the fixed regenerateTerrain function for main.js

// Start the application when the DOM is loaded
window.addEventListener('DOMContentLoaded', init);