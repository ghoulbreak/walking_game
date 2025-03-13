import * as THREE from 'three';
import { TerrainAnalyzer } from './terrain/analysis.js';

export class WaypointSystem {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.waypoints = [];
    this.waypointMarkers = [];
    this.pathLine = null;
    this.currentWaypointIndex = 0;
    this.completed = false;
    this.analyzer = new TerrainAnalyzer(terrain);
    
    // Audio setup happens on first user interaction
    this.waypointSound = null;
    this.gainNode = null;
    window.addEventListener('click', () => this.setupAudio(), { once: true });
  }
  
  setupAudio() {
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
  }
  
  generateWaypoints(count = 10) {
    const ridgePath = this.analyzer.generateRidgePath(count);
    this.waypoints = ridgePath;
    
    this.waypointMarkers = this.analyzer.createWaypointMarkers(ridgePath, this.scene);
    this.pathLine = this.analyzer.createWaypointPath(ridgePath, this.scene);
    
    this.currentWaypointIndex = 0;
    this.completed = false;
    
    return ridgePath;
  }
  
  update(playerPosition, threshold = 10) {
    if (this.completed || this.waypoints.length === 0) return;
    
    const currentWaypoint = this.waypoints[this.currentWaypointIndex];
    
    // Use vector2 to ignore height for distance calculation
    const waypointPos2D = new THREE.Vector2(currentWaypoint.x, currentWaypoint.z);
    const playerPos2D = new THREE.Vector2(playerPosition.x, playerPosition.z);
    const distance = waypointPos2D.distanceTo(playerPos2D);
    
    if (distance < threshold) {
      this.waypointReached();
    }
  }
  
  waypointReached() {
    // Play sound effect
    if (this.waypointSound && this.gainNode) {
      const time = this.waypointSound.context.currentTime;
      this.gainNode.gain.setValueAtTime(0, time);
      this.gainNode.gain.linearRampToValueAtTime(0.2, time + 0.05);
      this.gainNode.gain.linearRampToValueAtTime(0, time + 0.3);
      
      const pitch = 440 + (this.currentWaypointIndex * 50);
      this.waypointSound.frequency.setValueAtTime(pitch, time);
    }
    
    // Update waypoint marker color
    const marker = this.waypointMarkers[this.currentWaypointIndex];
    if (marker) {
      marker.material.color.set(0x00ffff); // Cyan for visited
    }
    
    // Move to next waypoint
    this.currentWaypointIndex++;
    
    // Check completion
    if (this.currentWaypointIndex >= this.waypoints.length) {
      this.completed = true;
      
      // Visual feedback
      if (this.pathLine) {
        this.pathLine.material.color.set(0x00ffff);
        this.pathLine.material.linewidth = 3;
      }
      
      // Generate new waypoints after delay
      setTimeout(() => {
        this.clearWaypoints();
        this.generateWaypoints();
      }, 5000);
    }
  }
  
  clearWaypoints() {
    // Clean up markers
    this.waypointMarkers.forEach(marker => {
      this.scene.remove(marker);
      marker.geometry.dispose();
      marker.material.dispose();
    });
    
    // Clean up path line
    if (this.pathLine) {
      this.scene.remove(this.pathLine);
      this.pathLine.geometry.dispose();
      this.pathLine.material.dispose();
      this.pathLine = null;
    }
    
    this.waypoints = [];
    this.waypointMarkers = [];
  }
  
  getCurrentWaypoint() {
    if (this.waypoints.length === 0 || this.completed) return null;
    return this.waypoints[this.currentWaypointIndex];
  }
  
  getProgress() {
    if (this.waypoints.length === 0) return 0;
    return this.currentWaypointIndex / this.waypoints.length;
  }
}