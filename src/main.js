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
  
  // Generate terrain (simplified version for first run)
  console.log("Generating terrain...");
  const terrainWidth = 256;
  const terrainDepth = 256;
  const terrainHeight = 40;
  
  // Create a more visible heightmap for testing
  const heightMap = new Float32Array(terrainWidth * terrainDepth);
  for (let z = 0; z < terrainDepth; z++) {
    for (let x = 0; x < terrainWidth; x++) {
      // Exaggerated mountain pattern for better visibility
      const nx = x / terrainWidth * 4;
      const nz = z / terrainDepth * 4;
      heightMap[z * terrainWidth + x] = Math.sin(nx * Math.PI) * Math.cos(nz * Math.PI) * 30 + 10;
    }
  }
  
  // Create terrain object
  const terrain = {
    width: terrainWidth,
    depth: terrainDepth,
    heightMap: heightMap,
    
    // Method to get height at any point
    getHeightAt(x, z) {
      try {
        // Convert world coordinates to heightmap indices
        const ix = Math.floor((x + this.width / 2) / this.width * (this.width - 1));
        const iz = Math.floor((z + this.depth / 2) / this.depth * (this.depth - 1));
        
        // Clamp to valid indices
        const clampedIx = Math.max(0, Math.min(this.width - 1, ix));
        const clampedIz = Math.max(0, Math.min(this.depth - 1, iz));
        
        // Return height from heightmap
        return this.heightMap[clampedIz * this.width + clampedIx];
      } catch (e) {
        console.error("Error in getHeightAt:", e);
        return 0; // Return 0 as a fallback
      }
    }
  };
  
  // Create terrain renderer and add mesh to scene
  const terrainRenderer = new TerrainRenderer(terrain);
  if (terrainRenderer.mesh) {
    console.log("Adding terrain mesh to scene");
    scene.add(terrainRenderer.mesh);
  } else {
    console.error("Terrain mesh is null - waiting for initialization");
    // Try again after a short delay
    setTimeout(() => {
      if (terrainRenderer.mesh) {
        console.log("Adding delayed terrain mesh to scene");
        scene.add(terrainRenderer.mesh);
      }
    }, 1000);
  }
  
  // Initialize player controls (simplified for debugging)
  console.log("Initializing player...");
  const player = initPlayer(camera, terrain);
  player.camera = camera; // Add camera reference for updates
  
  // Skip waypoints for initial debugging
  console.log("Skipping waypoints for initial debug");
  
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