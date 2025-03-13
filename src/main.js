// src/main.js
import { createScene, resizeHandler } from './scene.js';
import { initPlayer, updatePlayer, teleportPlayer } from './player.js';
import { generateTerrain } from './terrain/generator.js';
import { WaypointSystem } from './waypoint-system.js';
import { TerrainProfiles, defaultProfile } from './terrain/profiles.js';
import { launchTerrainComparison } from './terrain/tester.js';

// State tracking
let lastTime = 0;
let deltaTime = 0;
let fps = 0;
let currentProfile = defaultProfile;
let terrain, player, waypointSystem;

// Scene elements
let scene, camera, renderer;

// DOM elements
let fpsDisplay, positionDisplay, elevationDisplay, staminaBar;

// Initialize the application
async function init() {
  // Get DOM elements
  fpsDisplay = document.getElementById('fps');
  positionDisplay = document.getElementById('position');
  elevationDisplay = document.getElementById('elevation');
  staminaBar = document.getElementById('stamina-bar');
  const profileSelect = document.getElementById('profile-select');
  const compareButton = document.getElementById('compare-profiles');

  // Set up UI controls
  if (profileSelect) setupProfileSelector(profileSelect);
  if (compareButton) {
    compareButton.addEventListener('click', launchTerrainComparison);
  }

  // Create scene - store references globally
  const sceneData = createScene();
  scene = sceneData.scene;
  camera = sceneData.camera;
  renderer = sceneData.renderer;
  
  // Add window resize handler
  window.addEventListener('resize', () => resizeHandler(camera, renderer));
  
  // Generate terrain
  const terrainWidth = 1024;
  const terrainDepth = 1024;
  const terrainHeight = 150;
  
  terrain = await generateTerrain(terrainWidth, terrainDepth, terrainHeight, currentProfile);
  scene.add(terrain.mesh);
  
  // Make terrain accessible to player system
  window.terrain = terrain;
  
  // Initialize player
  player = initPlayer(camera, terrain);
  player.camera = camera;
  
  // Start at elevated position for better view
  const startX = 0, startZ = -50;
  const heightAtStart = terrain.getHeightAt(startX, startZ);
  player.position.set(startX, heightAtStart + player.height + 2, startZ);
  camera.position.copy(player.position);
  
  // Create waypoint system
  waypointSystem = new WaypointSystem(scene, terrain);
  waypointSystem.generateWaypoints(8);
  
  // Set up keyboard shortcuts
  setupKeyboardShortcuts(terrainWidth, terrainDepth);
  
  // Start animation loop
  animate(0);
}

// Regenerate terrain with a new profile
async function regenerateTerrain(profileName) {
  // Store player position
  const playerPosition = player.position.clone();
  
  // Remove old terrain
  scene.remove(terrain.mesh);
  
  // Clear waypoints
  if (waypointSystem) {
    waypointSystem.clearWaypoints();
  }
  
  // Generate new terrain
  currentProfile = profileName;
  const terrainWidth = terrain.width;
  const terrainDepth = terrain.depth;
  const newTerrain = await generateTerrain(terrainWidth, terrainDepth, 150, profileName);
  
  // Update scene
  scene.add(newTerrain.mesh);
  
  // Replace terrain object
  Object.assign(terrain, newTerrain);
  window.terrain = terrain;
  
  // Reposition player safely
  const heightAtPlayerPos = terrain.getHeightAt(playerPosition.x, playerPosition.z);
  player.position.y = heightAtPlayerPos + player.height + 2;
  player.velocity.set(0, 0, 0);
  player.isOnGround = true;
  
  // Update camera
  player.camera.position.copy(player.position);
  
  // Regenerate waypoints
  if (waypointSystem) {
    waypointSystem.terrain = terrain;
    waypointSystem.generateWaypoints(8);
  }
}

// Set up profile selector dropdown
function setupProfileSelector(selectElement) {
  selectElement.innerHTML = '';
  
  for (const [key, profile] of Object.entries(TerrainProfiles)) {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = profile.name;
    option.selected = (key === defaultProfile);
    selectElement.appendChild(option);
  }
  
  selectElement.addEventListener('change', (e) => {
    regenerateTerrain(e.target.value);
  });
}

// Set up keyboard shortcuts
function setupKeyboardShortcuts(terrainWidth, terrainDepth) {
  document.addEventListener('keydown', (event) => {
    const profileNames = Object.keys(TerrainProfiles);
    
    // Number keys 1-5 for different profiles
    if (event.code >= 'Digit1' && event.code <= 'Digit5') {
      const profileIndex = parseInt(event.code.slice(-1)) - 1;
      if (profileIndex >= 0 && profileIndex < profileNames.length) {
        regenerateTerrain(profileNames[profileIndex]);
      }
    }
    
    // Teleport feature (T key)
    if (event.code === 'KeyT') {
      findAndTeleportToFlatArea(terrainWidth, terrainDepth);
    }
  });
}

// Find a flat area and teleport there
function findAndTeleportToFlatArea(terrainWidth, terrainDepth) {
  const attempts = 20;
  
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
      teleportPlayer(player, x, z, terrain);
      break;
    }
  }
}

// Animation loop
function animate(currentTime) {
  requestAnimationFrame(animate);
  
  // Calculate delta time and FPS
  if (lastTime > 0) {
    deltaTime = (currentTime - lastTime) / 1000;
    fps = 1 / deltaTime;
  }
  lastTime = currentTime;
  
  // Update FPS display
  if (fpsDisplay) {
    fpsDisplay.textContent = `FPS: ${fps.toFixed(1)}`;
  }
  
  // Update player
  updatePlayer(player, deltaTime, terrain);
  
  // Update waypoint system
  if (waypointSystem) {
    waypointSystem.update(player.position);
  }
  
  // Update UI displays
  updateUI();
  
  // Render the scene
  renderer.render(scene, camera);
}

// Update UI elements
function updateUI() {
  if (!player) return;
  
  // Position display
  if (positionDisplay) {
    const pos = player.position;
    positionDisplay.textContent = `Position: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`;
  }
  
  // Elevation display
  if (elevationDisplay && terrain) {
    const groundHeight = terrain.getHeightAt(player.position.x, player.position.z);
    elevationDisplay.textContent = `Elevation: ${groundHeight.toFixed(1)}m | Profile: ${terrain.profile}`;
  }
  
  // Stamina bar
  if (staminaBar) {
    const staminaPercent = (player.stamina.current / player.stamina.max) * 100;
    staminaBar.style.width = `${staminaPercent}%`;
    staminaBar.classList.toggle('stamina-low', staminaPercent < 30);
  }
}

// Start the application when DOM is loaded
window.addEventListener('DOMContentLoaded', init);