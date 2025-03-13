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
    
    // Create terrain analyzer
    this.analyzer = new TerrainAnalyzer(terrain);
    
    // Audio feedback
    this.waypointSound = null;
    this.setupAudio();
  }
  
  setupAudio() {
    // Set up audio context and sounds when user interacts
    const setupSound = () => {
      if (this.waypointSound) return;
      
      // Create audio context
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Create waypoint reached sound
      this.waypointSound = audioContext.createOscillator();
      this.waypointSound.type = 'sine';
      this.waypointSound.frequency.setValueAtTime(440, audioContext.currentTime);
      
      // Create gain node to control volume
      this.gainNode = audioContext.createGain();
      this.gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      
      // Connect nodes
      this.waypointSound.connect(this.gainNode);
      this.gainNode.connect(audioContext.destination);
      
      // Start oscillator
      this.waypointSound.start();
    };
    
    // Set up sound on user interaction
    window.addEventListener('click', setupSound, { once: true });
  }
  
  generateWaypoints(count = 10) {
    // Find ridges and create a path
    const ridgePath = this.analyzer.generateRidgePath(count);
    this.waypoints = ridgePath;
    
    // Create visual markers
    this.waypointMarkers = this.analyzer.createWaypointMarkers(ridgePath, this.scene);
    
    // Create path line
    this.pathLine = this.analyzer.createWaypointPath(ridgePath, this.scene);
    
    // Reset state
    this.currentWaypointIndex = 0;
    this.completed = false;
    
    return ridgePath;
  }
  
  update(playerPosition, threshold = 10) {
    if (this.completed || this.waypoints.length === 0) return;
    
    // Get current waypoint
    const currentWaypoint = this.waypoints[this.currentWaypointIndex];
    
    // Calculate distance to waypoint (ignoring Y to allow for height differences)
    const waypointPosition = new THREE.Vector2(currentWaypoint.x, currentWaypoint.z);
    const playerPositionFlat = new THREE.Vector2(playerPosition.x, playerPosition.z);
    const distance = waypointPosition.distanceTo(playerPositionFlat);
    
    // Check if player reached waypoint
    if (distance < threshold) {
      this.waypointReached();
    }
    
    // Update target indicator (if implemented)
    this.updateTargetIndicator(currentWaypoint, playerPosition);
  }
  
  waypointReached() {
    // Play sound
    if (this.waypointSound && this.gainNode) {
      const time = this.waypointSound.context.currentTime;
      
      // Quick beep
      this.gainNode.gain.setValueAtTime(0, time);
      this.gainNode.gain.linearRampToValueAtTime(0.2, time + 0.05);
      this.gainNode.gain.linearRampToValueAtTime(0, time + 0.3);
      
      // Increase pitch for each waypoint
      const pitch = 440 + (this.currentWaypointIndex * 50);
      this.waypointSound.frequency.setValueAtTime(pitch, time);
    }
    
    // Update waypoint marker color to show completion
    const marker = this.waypointMarkers[this.currentWaypointIndex];
    if (marker) {
      marker.material.color.set(0x00ffff); // Cyan for visited waypoints
    }
    
    // Move to next waypoint
    this.currentWaypointIndex++;
    
    // Check if all waypoints are completed
    if (this.currentWaypointIndex >= this.waypoints.length) {
      this.completed = true;
      this.onCompletion();
    }
  }
  
  onCompletion() {
    console.log('All waypoints reached!');
    
    // Visual feedback - change path color
    if (this.pathLine) {
      this.pathLine.material.color.set(0x00ffff);
      this.pathLine.material.linewidth = 3;
    }
    
    // Could trigger a new set of waypoints, show score, etc.
    // For now, just generate new waypoints after a delay
    setTimeout(() => {
      // Remove old waypoints
      this.clearWaypoints();
      
      // Generate new waypoints
      this.generateWaypoints();
    }, 5000);
  }
  
  clearWaypoints() {
    // Remove waypoint markers from scene
    this.waypointMarkers.forEach(marker => {
      this.scene.remove(marker);
      marker.geometry.dispose();
      marker.material.dispose();
    });
    
    // Remove path line
    if (this.pathLine) {
      this.scene.remove(this.pathLine);
      this.pathLine.geometry.dispose();
      this.pathLine.material.dispose();
      this.pathLine = null;
    }
    
    // Clear arrays
    this.waypoints = [];
    this.waypointMarkers = [];
  }
  
  updateTargetIndicator(waypoint, playerPosition) {
    // This would update some UI or 3D indicator pointing to the next waypoint
    // Could be implemented as an arrow, compass, or distance meter
    
    // For now, just calculate direction and distance
    const direction = new THREE.Vector3()
      .subVectors(waypoint, playerPosition)
      .normalize();
      
    const distance = playerPosition.distanceTo(waypoint);
    
    // You could use these values to update a UI element
    return { direction, distance };
  }
  
  // Get the current waypoint
  getCurrentWaypoint() {
    if (this.waypoints.length === 0 || this.completed) return null;
    return this.waypoints[this.currentWaypointIndex];
  }
  
  // Get progress information
  getProgress() {
    if (this.waypoints.length === 0) return 0;
    return this.currentWaypointIndex / this.waypoints.length;
  }
}