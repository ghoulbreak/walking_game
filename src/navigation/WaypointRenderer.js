// src/navigation/WaypointRenderer.js
// Handles visual representation of waypoints

import * as THREE from 'three';

/**
 * Renders waypoints and paths in the 3D scene
 */
export class WaypointRenderer {
  /**
   * Create a new WaypointRenderer
   * @param {THREE.Scene} scene - The scene to add waypoints to
   */
  constructor(scene) {
    this.scene = scene;
    this.waypointMarkers = [];
    this.pathLine = null;
    
    // Define colors for different waypoint types
    this.colors = {
      start: 0x00ff00,      // Green
      waypoint: 0xffff00,    // Yellow
      end: 0xff0000,         // Red
      visited: 0x00ffff,     // Cyan
      completed: 0x00ffff    // Cyan
    };
  }
  
  /**
   * Create visual markers for waypoints
   * @param {Array} waypoints - Array of waypoint positions
   */
  createWaypointMarkers(waypoints) {
    // Clear any existing markers first
    this.clearWaypoints();
    
    waypoints.forEach((point, index) => {
      // Determine color based on position in sequence
      let color;
      if (index === 0) {
        color = this.colors.start;
      } else if (index === waypoints.length - 1) {
        color = this.colors.end;
      } else {
        color = this.colors.waypoint;
      }
      
      // Create marker
      const geometry = new THREE.SphereGeometry(1, 16, 16);
      const material = new THREE.MeshBasicMaterial({ color });
      const marker = new THREE.Mesh(geometry, material);
      
      marker.position.copy(point);
      
      this.scene.add(marker);
      this.waypointMarkers.push(marker);
    });
  }
  
  /**
   * Create a line connecting waypoints
   * @param {Array} waypoints - Array of waypoint positions
   */
  createWaypointPath(waypoints) {
    if (waypoints.length < 2) return null;
    
    // Create line with elevated points
    const linePoints = waypoints.map(point => {
      const linePoint = point.clone();
      linePoint.y += 0.2; // Slightly above terrain
      return linePoint;
    });
    
    const geometry = new THREE.BufferGeometry().setFromPoints(linePoints);
    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      linewidth: 2
    });
    
    this.pathLine = new THREE.Line(geometry, material);
    this.scene.add(this.pathLine);
    
    return this.pathLine;
  }
  
  /**
   * Mark a waypoint as visited
   * @param {number} index - Index of the waypoint
   */
  markWaypointVisited(index) {
    const marker = this.waypointMarkers[index];
    if (marker) {
      marker.material.color.set(this.colors.visited);
    }
  }
  
  /**
   * Mark the waypoint path as completed
   */
  markPathCompleted() {
    if (this.pathLine) {
      this.pathLine.material.color.set(this.colors.completed);
      this.pathLine.material.linewidth = 3;
    }
  }
  
  /**
   * Clear all waypoint visuals
   */
  clearWaypoints() {
    // Clean up markers
    this.waypointMarkers.forEach(marker => {
      this.scene.remove(marker);
      if (marker.geometry) marker.geometry.dispose();
      if (marker.material) marker.material.dispose();
    });
    this.waypointMarkers = [];
    
    // Clean up path line
    if (this.pathLine) {
      this.scene.remove(this.pathLine);
      if (this.pathLine.geometry) this.pathLine.geometry.dispose();
      if (this.pathLine.material) this.pathLine.material.dispose();
      this.pathLine = null;
    }
  }
}