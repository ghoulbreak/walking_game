// src/navigation/WaypointSystem.js
// Handles waypoint generation, visualization, and tracking

import * as THREE from 'three';
import { WaypointGenerator } from './WaypointGenerator.js';
import { WaypointRenderer } from './WaypointRenderer.js';

/**
 * Manages waypoints for player navigation
 */
export class WaypointSystem {
  /**
   * Create a new WaypointSystem
   * @param {THREE.Scene} scene - The scene to add waypoints to
   * @param {Object} terrain - The terrain system
   */
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.waypoints = [];
    this.currentWaypointIndex = 0;
    this.completed = false;
    this.playerStartPosition = new THREE.Vector3(0, 0, 0);
    
    // Create waypoint generator and renderer
    this.generator = new WaypointGenerator(terrain);
    this.renderer = new WaypointRenderer(scene);
    
    // Audio setup happens on first user interaction
    this.setupAudioOnInteraction();
  }
  
  /**
   * Set up audio system on first user interaction
   */
  setupAudioOnInteraction() {
    this.waypointSound = null;
    this.gainNode = null;
    
    // Set up audio on first click (due to browser autoplay policies)
    window.addEventListener('click', () => {
      if (this.waypointSound) return;
      
      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.waypointSound = audioContext.createOscillator();
        this.waypointSound.type = 'sine';
        this.waypointSound.frequency.setValueAtTime(440, audioContext.currentTime);
        
        this.gainNode = audioContext.createGain();
        this.gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        
        this.waypointSound.connect(this.gainNode);
        this.gainNode.connect(audioContext.destination);
        this.waypointSound.start();
      } catch (e) {
        console.warn("Audio setup failed:", e);
      }
    }, { once: true });
  }
  
  /**
   * Generate new waypoints
   * @param {number} count - Number of waypoints to generate
   * @param {THREE.Vector3} playerPosition - Current player position
   * @returns {Array} - Array of generated waypoints
   */
  generateWaypoints(count = 8, playerPosition = null) {
    // Clear existing waypoints
    this.clearWaypoints();
    
    // Store player position as reference
    if (playerPosition) {
      this.playerStartPosition.copy(playerPosition);
    }
    
    // Generate new waypoints
    this.waypoints = this.generator.generateCircularPath(
      this.playerStartPosition,
      count
    );
    
    // Create visual waypoint markers
    this.renderer.createWaypointMarkers(this.waypoints);
    this.renderer.createWaypointPath(this.waypoints);
    
    // Reset tracking state
    this.currentWaypointIndex = 0;
    this.completed = false;
    
    return this.waypoints;
  }
  
  /**
   * Update waypoint system based on player position
   * @param {THREE.Vector3} playerPosition - Current player position
   * @param {number} threshold - Distance threshold for reaching waypoints
   */
  update(playerPosition, threshold = 10) {
    if (this.completed || this.waypoints.length === 0) return;
    
    const currentWaypoint = this.waypoints[this.currentWaypointIndex];
    if (!currentWaypoint) return;
    
    // Use vector2 to ignore height for distance calculation
    const waypointPos2D = new THREE.Vector2(currentWaypoint.x, currentWaypoint.z);
    const playerPos2D = new THREE.Vector2(playerPosition.x, playerPosition.z);
    const distance = waypointPos2D.distanceTo(playerPos2D);
    
    if (distance < threshold) {
      this.waypointReached();
    }
    
    // If player is very far from waypoints (e.g. after teleporting)
    // regenerate waypoints at new location
    if (distance > 500) {
      this.playerStartPosition.copy(playerPosition);
      this.generateWaypoints(8, playerPosition);
    }
  }
  
  /**
   * Handle reaching a waypoint
   */
  waypointReached() {
    // Play sound effect
    this.playWaypointSound();
    
    // Update waypoint marker color
    this.renderer.markWaypointVisited(this.currentWaypointIndex);
    
    // Move to next waypoint
    this.currentWaypointIndex++;
    
    // Check completion
    if (this.currentWaypointIndex >= this.waypoints.length) {
      this.completed = true;
      
      // Visual feedback
      this.renderer.markPathCompleted();
      
      // Generate new waypoints after delay
      setTimeout(() => {
        this.clearWaypoints();
        this.generateWaypoints();
      }, 5000);
    }
  }
  
  /**
   * Play waypoint reached sound
   */
  playWaypointSound() {
    if (this.waypointSound && this.gainNode) {
      const time = this.waypointSound.context.currentTime;
      this.gainNode.gain.setValueAtTime(0, time);
      this.gainNode.gain.linearRampToValueAtTime(0.2, time + 0.05);
      this.gainNode.gain.linearRampToValueAtTime(0, time + 0.3);
      
      const pitch = 440 + (this.currentWaypointIndex * 50);
      this.waypointSound.frequency.setValueAtTime(pitch, time);
    }
  }
  
  /**
   * Clear all waypoints
   */
  clearWaypoints() {
    this.renderer.clearWaypoints();
    this.waypoints = [];
    this.currentWaypointIndex = 0;
    this.completed = false;
  }
  
  /**
   * Get the current waypoint
   * @returns {THREE.Vector3|null} - The current waypoint or null if none
   */
  getCurrentWaypoint() {
    if (this.waypoints.length === 0 || this.completed) return null;
    return this.waypoints[this.currentWaypointIndex];
  }
  
  /**
   * Get the progress through the waypoints
   * @returns {number} - Progress from 0 to 1
   */
  getProgress() {
    if (this.waypoints.length === 0) return 0;
    return this.currentWaypointIndex / this.waypoints.length;
  }
}