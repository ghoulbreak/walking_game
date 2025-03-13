import { createScene, resizeHandler } from './scene.js';
import { initPlayer, updatePlayer } from './player.js';
import { generateTerrain } from './terrain/generator.js';
import { TerrainRenderer } from './terrain/renderer.js';
import { WaypointSystem } from './waypoint-system.js';
import { TerrainAnalyzer } from './terrain/analysis.js';

// Performance monitoring
let lastTime = 0;
let deltaTime = 0;
let fps = 0;

// Initialize the application
async function init() {
  // Get DOM elements
  const fpsDisplay = document.getElementById('fps');
  const positionDisplay = document.getElementById('position');

  // Create the Three.js scene
  const { scene, camera, renderer } = createScene();
  console.log("Scene created successfully");
  
  // Add window resize handler
  window.addEventListener('resize', () => resizeHandler(camera, renderer));
  
  // Generate procedural terrain using fBm
  console.log("Generating terrain using fBm...");
  const terrainWidth = 512; // Increased for larger terrain
  const terrainDepth = 512;
  const terrainHeight = 80; // Increased for more dramatic mountains
  
  const terrain = await generateTerrain(terrainWidth, terrainDepth, terrainHeight);
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
    
    // Update player position and camera
    updatePlayer(player, deltaTime, terrain);
    
    // Update waypoint system
    waypointSystem.update(player.position);
    
    // Update position display
    if (positionDisplay) {
      const pos = player.position;
      positionDisplay.textContent = `Position: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`;
    }
    
    // Render the scene
    renderer.render(scene, camera);
  }
  
  // Start animation loop
  animate();
}

// Start the application when the DOM is loaded
window.addEventListener('DOMContentLoaded', init);