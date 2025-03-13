// src/main.js
import { createScene, resizeHandler } from './scene.js';
import { initPlayer, updatePlayer } from './player.js';
import { generateTerrain } from './terrain/generator.js';
import { TerrainRenderer } from './terrain/renderer.js';
import { WaypointSystem } from './waypoint-system.js';
import { TerrainAnalyzer } from './terrain/analysis.js';
import { TerrainProfiles, defaultProfile } from './terrain/profiles.js';
import { launchTerrainComparison } from './terrain/tester.js';

// Performance monitoring
let lastTime = 0;
let deltaTime = 0;
let fps = 0;

// Current terrain profile
let currentProfile = defaultProfile;

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
  async function regenerateTerrain(profileName) {
    console.log(`Regenerating terrain with ${profileName} profile...`);
    
    // Remove old terrain and waypoints
    scene.remove(terrain.mesh);
    waypointSystem.clearWaypoints();
    
    // Generate new terrain
    currentProfile = profileName;
    const newTerrain = await generateTerrain(terrainWidth, terrainDepth, terrainHeight, profileName);
    scene.add(newTerrain.mesh);
    
    // Update player terrain reference and position
    const playerX = player.position.x;
    const playerZ = player.position.z;
    const newHeight = newTerrain.getHeightAt(playerX, playerZ) + player.height + 2;
    player.position.y = newHeight;
    
    // Update references
    terrain.mesh = newTerrain.mesh;
    terrain.heightMap = newTerrain.heightMap;
    terrain.profile = newTerrain.profile;
    
    // Regenerate waypoints
    waypointSystem.terrain = newTerrain;
    waypointSystem.generateWaypoints(8);
    
    console.log("Terrain regenerated successfully");
  }
  
  // Setup profile selector change event
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

// Start the application when the DOM is loaded
window.addEventListener('DOMContentLoaded', init);