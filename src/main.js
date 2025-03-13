// src/main.js
import * as THREE from 'three';

import { createScene, resizeHandler } from './scene.js';
import { initPlayer, updatePlayer, teleportPlayer } from './player.js';
import { HierarchicalTerrainManager } from './terrain/hierarchical-terrain-manager.js';
import { WaypointSystem } from './waypoint-system.js';
import { TerrainProfiles, defaultProfile } from './terrain/profiles.js';
import { launchTerrainComparison } from './terrain/tester.js';

// State tracking
let lastTime = 0;
let deltaTime = 0;
let fps = 0;
let currentProfile = defaultProfile;
let terrainManager, player, waypointSystem;

// Scene elements
let scene, camera, renderer;

// DOM elements
let fpsDisplay, positionDisplay, elevationDisplay, staminaBar;
let chunkInfoDisplay, waypointDistanceDisplay, waypointProgressBar;

// Initialize the application
async function init() {
  // Show loading screen
  const loadingScreen = document.getElementById('loading-screen');
  const loadingBar = document.getElementById('loading-bar');
  const loadingText = document.getElementById('loading-text');
  
  // Loading progress tracking
  let loadingProgress = 0;
  const updateLoadingProgress = (progress, message) => {
    loadingProgress = progress;
    loadingBar.style.width = `${progress}%`;
    if (message) loadingText.textContent = message;
  };
  
  // Get DOM elements
  fpsDisplay = document.getElementById('fps');
  positionDisplay = document.getElementById('position');
  elevationDisplay = document.getElementById('elevation');
  staminaBar = document.getElementById('stamina-bar');
  const profileSelect = document.getElementById('profile-select');
  const compareButton = document.getElementById('compare-profiles');
  
  // Create chunk info display
  chunkInfoDisplay = document.createElement('div');
  chunkInfoDisplay.id = 'chunk-info';
  chunkInfoDisplay.style.position = 'absolute';
  chunkInfoDisplay.style.bottom = '10px';
  chunkInfoDisplay.style.left = '10px';
  chunkInfoDisplay.style.background = 'rgba(0, 0, 0, 0.5)';
  chunkInfoDisplay.style.color = 'white';
  chunkInfoDisplay.style.padding = '10px';
  chunkInfoDisplay.style.fontFamily = 'monospace';
  chunkInfoDisplay.style.borderRadius = '5px';
  document.body.appendChild(chunkInfoDisplay);

  // Waypoint tracking elements
  waypointDistanceDisplay = document.getElementById('waypoint-distance');
  waypointProgressBar = document.getElementById('waypoint-progress-bar');

  updateLoadingProgress(10, "Creating scene...");

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
  
  updateLoadingProgress(30, "Generating macro terrain...");
  
  // Initialize hierarchical terrain manager
  terrainManager = new HierarchicalTerrainManager(scene);
  await terrainManager.initialize(currentProfile);
  
  updateLoadingProgress(80, "Setting up player...");
  
  // Make terrain accessible to player system
  window.terrain = {
    getHeightAt: (x, z) => terrainManager.getHeightAt(x, z),
    isRidge: (x, z, threshold) => terrainManager.isRidge(x, z, threshold),
    profile: currentProfile
  };
  
  // Initialize player
  player = initPlayer(camera, window.terrain);
  player.camera = camera;
  
  // Start at elevated position for better view
  const startX = 0, startZ = 0;
  const heightAtStart = terrainManager.getHeightAt(startX, startZ);
  player.position.set(startX, heightAtStart + player.height + 10, startZ);
  camera.position.copy(player.position);
  
  updateLoadingProgress(90, "Creating waypoints...");
  
  // Create waypoint system - pass terrain interface instead of direct terrain
  waypointSystem = new WaypointSystem(scene, window.terrain);
  waypointSystem.generateWaypoints(8, player.position);
  
  // Set up keyboard shortcuts
  setupKeyboardShortcuts();
  
  // Add extended UI controls
  addExtendedControls();
  
  updateLoadingProgress(100, "Ready!");
  
  // Hide loading screen after a short delay
  setTimeout(() => {
    loadingScreen.style.opacity = '0';
    loadingScreen.style.transition = 'opacity 0.5s';
    setTimeout(() => {
      loadingScreen.style.display = 'none';
    }, 500);
  }, 1000); // Longer delay to ensure terrain is visible
  
  // Start animation loop
  animate(0);
}

// Regenerate terrain with a new profile
async function changeTerrainProfile(profileName) {
  // Show a simple loading screen during profile change
  const loadingOverlay = document.createElement('div');
  loadingOverlay.style.position = 'fixed';
  loadingOverlay.style.top = '0';
  loadingOverlay.style.left = '0';
  loadingOverlay.style.width = '100%';
  loadingOverlay.style.height = '100%';
  loadingOverlay.style.background = 'rgba(0, 0, 0, 0.7)';
  loadingOverlay.style.color = 'white';
  loadingOverlay.style.display = 'flex';
  loadingOverlay.style.justifyContent = 'center';
  loadingOverlay.style.alignItems = 'center';
  loadingOverlay.style.zIndex = '1000';
  loadingOverlay.innerHTML = `<div>Generating ${profileName} terrain...</div>`;
  document.body.appendChild(loadingOverlay);
  
  // Wait a frame to ensure UI updates
  await new Promise(resolve => setTimeout(resolve, 50));
  
  // Store player position
  const playerPosition = player.position.clone();
  
  // Change terrain profile
  currentProfile = profileName;
  await terrainManager.changeProfile(profileName);
  
  // Update terrain reference
  window.terrain.profile = currentProfile;
  
  // Reposition player safely
  const heightAtPlayerPos = terrainManager.getHeightAt(playerPosition.x, playerPosition.z);
  player.position.y = heightAtPlayerPos + player.height + 5;
  player.velocity.set(0, 0, 0);
  player.isOnGround = false;
  
  // Update camera
  player.camera.position.copy(player.position);
  
  // Regenerate waypoints
  if (waypointSystem) {
    waypointSystem.generateWaypoints(8, player.position);
  }
  
  // Remove loading overlay after a short delay
  setTimeout(() => {
    document.body.removeChild(loadingOverlay);
  }, 300);
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
    changeTerrainProfile(e.target.value);
  });
}

// Add extended controls for the chunk system
function addExtendedControls() {
  const controlsDiv = document.createElement('div');
  controlsDiv.className = 'ui-controls extended-controls';
  controlsDiv.style.top = '200px';
  
  // Add view distance slider
  const viewDistanceLabel = document.createElement('label');
  viewDistanceLabel.textContent = 'View Distance: ';
  viewDistanceLabel.setAttribute('for', 'view-distance');
  
  const viewDistanceValue = document.createElement('span');
  viewDistanceValue.id = 'view-distance-value';
  viewDistanceValue.textContent = terrainManager.viewDistance;
  
  const viewDistanceSlider = document.createElement('input');
  viewDistanceSlider.type = 'range';
  viewDistanceSlider.id = 'view-distance';
  viewDistanceSlider.min = '1';
  viewDistanceSlider.max = '6';
  viewDistanceSlider.value = terrainManager.viewDistance;
  viewDistanceSlider.style.width = '100%';
  viewDistanceSlider.style.marginTop = '5px';
  
  viewDistanceSlider.addEventListener('input', (e) => {
    const newDistance = parseInt(e.target.value);
    terrainManager.setViewDistance(newDistance);
    viewDistanceValue.textContent = newDistance;
  });
  
  // Toggle debug mode button
  const debugButton = document.createElement('button');
  debugButton.textContent = 'Toggle Chunk Debug View';
  debugButton.className = 'ui-button';
  debugButton.style.marginTop = '10px';
  
  debugButton.addEventListener('click', () => {
    const isDebug = terrainManager.toggleDebug();
    debugButton.textContent = isDebug ? 'Hide Chunk Debug View' : 'Show Chunk Debug View';
  });
  
  // Teleport button
  const teleportButton = document.createElement('button');
  teleportButton.textContent = 'Teleport to Random Location';
  teleportButton.className = 'ui-button';
  teleportButton.style.marginTop = '10px';
  
  teleportButton.addEventListener('click', () => {
    findAndTeleportToFlatArea();
  });
  
  // Assemble controls
  controlsDiv.appendChild(viewDistanceLabel);
  controlsDiv.appendChild(viewDistanceValue);
  controlsDiv.appendChild(viewDistanceSlider);
  controlsDiv.appendChild(debugButton);
  controlsDiv.appendChild(teleportButton);
  
  document.body.appendChild(controlsDiv);
}

// Set up keyboard shortcuts
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (event) => {
    const profileNames = Object.keys(TerrainProfiles);
    
    // Number keys 1-5 for different profiles
    if (event.code >= 'Digit1' && event.code <= 'Digit5') {
      const profileIndex = parseInt(event.code.slice(-1)) - 1;
      if (profileIndex >= 0 && profileIndex < profileNames.length) {
        changeTerrainProfile(profileNames[profileIndex]);
      }
    }
    
    // Teleport feature (T key)
    if (event.code === 'KeyT') {
      findAndTeleportToFlatArea();
    }
    
    // Toggle debug view (F key)
    if (event.code === 'KeyF') {
      terrainManager.toggleDebug();
    }
  });
}

// Find a flat area and teleport there
function findAndTeleportToFlatArea() {
  const centerX = player.position.x;
  const centerZ = player.position.z;
  
  // Larger search area for better spots
  const searchRadius = 1000; 
  const attempts = 30;
  
  for (let i = 0; i < attempts; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * searchRadius;
    
    const x = centerX + Math.cos(angle) * distance;
    const z = centerZ + Math.sin(angle) * distance;
    const height = terrainManager.getHeightAt(x, z);
    
    // Check surrounding heights to find a flat area
    const samples = [
      terrainManager.getHeightAt(x + 5, z),
      terrainManager.getHeightAt(x - 5, z),
      terrainManager.getHeightAt(x, z + 5),
      terrainManager.getHeightAt(x, z - 5)
    ];
    
    // Skip areas with water
    if (height <= terrainManager.waterLevel + 1) {
      continue;
    }
    
    // Calculate max slope
    let maxSlope = 0;
    for (const sample of samples) {
      const slope = Math.abs(height - sample);
      maxSlope = Math.max(maxSlope, slope);
    }
    
    // If slope is less than 3 units, it's relatively flat
    if (maxSlope < 3) {
      teleportPlayer(player, x, z, window.terrain);
      
      // Generate new waypoints from this position
      if (waypointSystem) {
        waypointSystem.generateWaypoints(8, player.position);
      }
      
      // Show a brief notification
      const notification = document.createElement('div');
      notification.textContent = 'Teleported to new location';
      notification.style.position = 'fixed';
      notification.style.top = '50%';
      notification.style.left = '50%';
      notification.style.transform = 'translate(-50%, -50%)';
      notification.style.background = 'rgba(0, 0, 0, 0.7)';
      notification.style.color = 'white';
      notification.style.padding = '10px';
      notification.style.borderRadius = '5px';
      notification.style.zIndex = '1000';
      document.body.appendChild(notification);
      
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 1500);
      
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
  
  // Cap delta time to prevent huge jumps
  deltaTime = Math.min(deltaTime, 0.1);
  
  // Update FPS display
  if (fpsDisplay) {
    fpsDisplay.textContent = `FPS: ${fps.toFixed(1)}`;
  }
  
  // Update player
  updatePlayer(player, deltaTime, window.terrain);
  
  // Update terrain chunks based on player position
  terrainManager.updatePlayerPosition(player.position.x, player.position.z);
  
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
  if (elevationDisplay && window.terrain) {
    const groundHeight = window.terrain.getHeightAt(player.position.x, player.position.z);
    elevationDisplay.textContent = `Elevation: ${groundHeight !== null ? groundHeight.toFixed(1) : '?'}m | Profile: ${window.terrain.profile}`;
  }
  
  // Stamina bar
  if (staminaBar) {
    const staminaPercent = (player.stamina.current / player.stamina.max) * 100;
    staminaBar.style.width = `${staminaPercent}%`;
    staminaBar.classList.toggle('stamina-low', staminaPercent < 30);
  }
  
  // Chunk info display
  if (chunkInfoDisplay && terrainManager) {
    const loadedChunks = terrainManager.getLoadedChunks().length;
    const currentChunk = terrainManager.currentChunk;
    
    chunkInfoDisplay.innerHTML = `
      Micro chunks loaded: ${loadedChunks}<br>
      Current chunk: (${currentChunk.x}, ${currentChunk.z})<br>
      View distance: ${terrainManager.viewDistance} chunks<br>
      Chunk size: ${terrainManager.microSize} units
    `;
  }
  
  // Waypoint tracking
  if (waypointSystem && waypointDistanceDisplay && waypointProgressBar) {
    const currentWaypoint = waypointSystem.getCurrentWaypoint();
    
    if (currentWaypoint) {
      // Calculate distance to waypoint
      const waypointPos = new THREE.Vector2(currentWaypoint.x, currentWaypoint.z);
      const playerPos = new THREE.Vector2(player.position.x, player.position.z);
      const distance = waypointPos.distanceTo(playerPos);
      
      // Update distance display
      waypointDistanceDisplay.textContent = `Next waypoint: ${distance.toFixed(1)}m`;
      
      // Update progress bar
      const progress = waypointSystem.getProgress() * 100;
      waypointProgressBar.style.width = `${progress}%`;
    } else {
      waypointDistanceDisplay.textContent = 'No active waypoints';
      waypointProgressBar.style.width = '0%';
    }
  }
}

// Start the application when DOM is loaded
window.addEventListener('DOMContentLoaded', init);