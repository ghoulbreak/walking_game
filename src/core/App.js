// src/core/App.js
// Main application controller that manages the game lifecycle

import * as THREE from 'three';
import { createScene, resizeHandler } from './Scene.js';
import { InputController } from './InputController.js';
import { UIController } from './UIController.js';
import { PlayerController } from '../player/PlayerController.js';
import { TerrainManager } from '../terrain/terrain-manager.js';
import { WaypointSystem } from '../navigation/WaypointSystem.js';
import { defaultProfile } from '../terrain/profiles.js';

/**
 * Main application class that manages the game loop and coordinates
 * all the different systems
 */
export class App {
  /**
   * Create a new App instance
   */
  constructor() {
    this.lastTime = 0;
    this.deltaTime = 0;
    this.fps = 0;
    this.running = false;
    
    // Core systems
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.inputController = null;
    this.uiController = null;
    
    // Game systems
    this.terrain = null;
    this.player = null;
    this.waypointSystem = null;
    
    // Game state
    this.activeProfile = defaultProfile;
  }
  
  /**
   * Initialize the application
   * @returns {Promise} Resolves when initialization is complete
   */
  async initialize() {
    // Show loading screen via UI controller
    this.uiController = new UIController();
    this.uiController.showLoadingScreen();
    
    // Update loading progress periodically
    this.uiController.updateLoadingProgress(10, "Creating scene...");
    
    // Initialize scene, camera, and renderer
    const sceneData = createScene();
    this.scene = sceneData.scene;
    this.camera = sceneData.camera;
    this.renderer = sceneData.renderer;
    
    // Add window resize handler
    window.addEventListener('resize', () => resizeHandler(this.camera, this.renderer));
    
    // Generate terrain
    this.uiController.updateLoadingProgress(30, "Generating terrain...");
    this.terrain = new TerrainManager(this.scene);
    await this.terrain.initialize(this.activeProfile);
    
    // Create terrain interface object for player and waypoints
    const terrainInterface = {
      getHeightAt: (x, z) => this.terrain.getHeightAt(x, z),
      isRidge: (x, z, threshold) => this.terrain.isRidge(x, z, threshold),
      profile: this.activeProfile
    };
    
    // Make terrain accessible globally (for backward compatibility)
    window.terrain = terrainInterface;
    
    // Initialize player
    this.uiController.updateLoadingProgress(80, "Setting up player...");
    this.initializePlayer(terrainInterface);
    
    // Initialize input controller
    this.inputController = new InputController(this.player, this.camera);
    
    // Initialize waypoint system
    this.uiController.updateLoadingProgress(90, "Creating waypoints...");
    this.waypointSystem = new WaypointSystem(this.scene, terrainInterface);
    this.waypointSystem.generateWaypoints(8, this.player.position);
    
    // Set up keyboard shortcuts
    this.setupKeyboardShortcuts();
    
    // Complete loading
    this.uiController.updateLoadingProgress(100, "Ready!");
    
    // Start the game after a short delay
    return new Promise(resolve => {
      setTimeout(() => {
        // Try multiple approaches to ensure loading screen is hidden
        this.uiController.hideLoadingScreen();
        
        // Aggressive backup approach - directly manipulate DOM
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
          console.log("Force-hiding loading screen as backup");
          // Force immediate hide with inline styles
          loadingScreen.style.cssText = `
            opacity: 0 !important;
            display: none !important;
            visibility: hidden !important;
            z-index: -1 !important;
          `;
        }
        
        // Additional check - remove the element entirely if still visible
        setTimeout(() => {
          const stillVisibleScreen = document.getElementById('loading-screen');
          if (stillVisibleScreen && 
              (getComputedStyle(stillVisibleScreen).display !== 'none' || 
              getComputedStyle(stillVisibleScreen).opacity !== '0')) {
            console.log("Loading screen still visible, removing it from DOM");
            stillVisibleScreen.parentNode.removeChild(stillVisibleScreen);
          }
        }, 1000);
        
        resolve();
      }, 1000);
    });
  }
  
  /**
   * Initialize the player
   * @param {Object} terrainInterface - Interface to the terrain system
   */
  initializePlayer(terrainInterface) {
    // Create new player controller
    this.player = new PlayerController(this.camera, terrainInterface);
    
    // Position player at a valid starting point
    const startX = 0;
    const startZ = 0;
    const heightAtStart = terrainInterface.getHeightAt(startX, startZ);
    this.player.setPosition(startX, heightAtStart + this.player.height + 5, startZ);
  }
  
  /**
   * Set up keyboard shortcuts for the game
   */
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
      // Profile switching (1-5)
      if (event.code >= 'Digit1' && event.code <= 'Digit5') {
        const profileIndex = parseInt(event.code.slice(-1)) - 1;
        const profiles = Object.keys(TerrainProfiles);
        
        if (profileIndex >= 0 && profileIndex < profiles.length) {
          this.changeTerrainProfile(profiles[profileIndex]);
        }
      }
      
      // Teleport (T key)
      if (event.code === 'KeyT') {
        this.findAndTeleportToFlatArea();
      }
      
      // Debug view (F key)
      if (event.code === 'KeyF') {
        this.terrain.toggleDebug();
      }
    });
  }
  
  /**
   * Start the application
   */
  start() {
    this.running = true;
    requestAnimationFrame(this.animate.bind(this));
  }
  
  /**
   * Stop the application
   */
  stop() {
    this.running = false;
  }
  
  /**
   * Animation loop
   * @param {number} currentTime - Current timestamp
   */
  animate(currentTime) {
    if (!this.running) return;
    
    // Request next frame
    requestAnimationFrame(this.animate.bind(this));
    
    // Calculate delta time and FPS
    if (this.lastTime > 0) {
      this.deltaTime = (currentTime - this.lastTime) / 1000;
      this.fps = 1 / this.deltaTime;
    }
    this.lastTime = currentTime;
    
    // Cap delta time to prevent huge jumps
    this.deltaTime = Math.min(this.deltaTime, 0.1);
    
    // Update player
    this.player.update(this.deltaTime);
    
    // Update terrain chunks based on player position
    this.terrain.updatePlayerPosition(
      this.player.position.x, 
      this.player.position.z
    );
    
    // Update waypoint system
    this.waypointSystem.update(this.player.position);
    
    // Update UI
    this.uiController.update({
      fps: this.fps,
      player: this.player,
      terrain: this.terrain,
      waypointSystem: this.waypointSystem
    });
    
    // Render the scene
    this.renderer.render(this.scene, this.camera);
  }
  
  /**
   * Change the active terrain profile
   * @param {string} profileName - Name of the terrain profile
   */
  async changeTerrainProfile(profileName) {
    // Show a loading overlay
    this.uiController.showOverlay(`Generating ${profileName} terrain...`);
    
    // Store player position
    const playerPosition = this.player.position.clone();
    
    // Change terrain profile
    this.activeProfile = profileName;
    await this.terrain.changeProfile(profileName);
    
    // Update global terrain reference
    window.terrain.profile = profileName;
    
    // Reposition player safely
    const heightAtPlayerPos = this.terrain.getHeightAt(playerPosition.x, playerPosition.z);
    this.player.setPosition(playerPosition.x, heightAtPlayerPos + this.player.height + 5, playerPosition.z);
    
    // Regenerate waypoints
    this.waypointSystem.generateWaypoints(8, this.player.position);
    
    // Hide loading overlay
    setTimeout(() => {
      this.uiController.hideOverlay();
    }, 300);
  }
  
  /**
   * Find a flat area on the terrain and teleport the player there
   */
  findAndTeleportToFlatArea() {
    const centerX = this.player.position.x;
    const centerZ = this.player.position.z;
    
    // Larger search area for better spots
    const searchRadius = 1000; 
    const attempts = 30;
    
    for (let i = 0; i < attempts; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * searchRadius;
      
      const x = centerX + Math.cos(angle) * distance;
      const z = centerZ + Math.sin(angle) * distance;
      const height = this.terrain.getHeightAt(x, z);
      
      // Check surrounding heights to find a flat area
      const samples = [
        this.terrain.getHeightAt(x + 5, z),
        this.terrain.getHeightAt(x - 5, z),
        this.terrain.getHeightAt(x, z + 5),
        this.terrain.getHeightAt(x, z - 5)
      ];
      
      // Skip areas with water
      if (height <= this.terrain.waterLevel + 1) {
        continue;
      }
      
      // Calculate max slope
      let maxSlope = 0;
      for (const sample of samples) {
        if (sample === null) continue;
        const slope = Math.abs(height - sample);
        maxSlope = Math.max(maxSlope, slope);
      }
      
      // If slope is less than 3 units, it's relatively flat
      if (maxSlope < 3) {
        this.player.teleport(x, z);
        
        // Generate new waypoints from this position
        this.waypointSystem.generateWaypoints(8, this.player.position);
        
        // Show notification
        this.uiController.showNotification('Teleported to new location', 1500);
        break;
      }
    }
  }
}