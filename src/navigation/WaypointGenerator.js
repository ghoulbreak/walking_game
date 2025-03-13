// src/navigation/WaypointGenerator.js
// Generates waypoints for navigation based on terrain features

import * as THREE from 'three';
import { findLocalPeaks, findLocalRidges } from '../terrain/core/terrain-analysis.js';

/**
 * Generates waypoints for player navigation
 */
export class WaypointGenerator {
  /**
   * Create a new WaypointGenerator
   * @param {Object} terrain - The terrain system
   */
  constructor(terrain) {
    this.terrain = terrain;
  }
  
  /**
   * Generate waypoints in a circular path around the player
   * @param {THREE.Vector3} playerPosition - Current player position
   * @param {number} count - Number of waypoints to generate
   * @returns {Array} - Array of waypoints
   */
  generateCircularPath(playerPosition, count = 8) {
    // Start at player's position
    const startX = playerPosition.x;
    const startZ = playerPosition.z;
    
    // Create waypoints in a roughly circular path
    const radius = 100 + Math.random() * 150; // Random radius between 100-250 units
    const points = [];
    
    // Add first waypoint closer to player
    const firstWaypointDistance = 30 + Math.random() * 30;
    const randomAngle = Math.random() * Math.PI * 2;
    
    const firstPoint = new THREE.Vector3(
      startX + Math.cos(randomAngle) * firstWaypointDistance,
      0,
      startZ + Math.sin(randomAngle) * firstWaypointDistance
    );
    
    // Set y-coordinate based on terrain height
    const firstHeight = this.terrain.getHeightAt(firstPoint.x, firstPoint.z);
    if (firstHeight !== null && !isNaN(firstHeight)) {
      firstPoint.y = firstHeight + 2;
      points.push(firstPoint);
    }
    
    // Create remaining waypoints in a roughly circular pattern
    for (let i = 1; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + randomAngle;
      const jitter = (Math.random() - 0.5) * 0.2; // Random variation
      const actualAngle = angle + jitter;
      
      // Calculate distance from center with some variation
      const distance = radius * (0.8 + Math.random() * 0.4);
      
      const point = new THREE.Vector3(
        startX + Math.cos(actualAngle) * distance,
        0,
        startZ + Math.sin(actualAngle) * distance
      );
      
      // Set y-coordinate based on terrain height
      const terrainHeight = this.terrain.getHeightAt(point.x, point.z);
      if (terrainHeight !== null && !isNaN(terrainHeight)) {
        point.y = terrainHeight + 2; // 2 units above terrain
        points.push(point);
      }
    }
    
    // Make sure we have at least some waypoints
    if (points.length < 3) {
      console.warn("Not enough valid waypoints, adding backup points");
      // Add some fallback waypoints in cardinal directions
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2;
        const backupPoint = new THREE.Vector3(
          startX + Math.cos(angle) * 50,
          0,
          startZ + Math.sin(angle) * 50
        );
        
        const heightAtBackup = this.terrain.getHeightAt(backupPoint.x, backupPoint.z);
        if (heightAtBackup !== null && !isNaN(heightAtBackup)) {
          backupPoint.y = heightAtBackup + 2;
          points.push(backupPoint);
        }
      }
    }
    
    return points;
  }
  
  /**
   * Generate waypoints that follow interesting terrain features
   * @param {THREE.Vector3} playerPosition - Current player position
   * @param {number} count - Number of waypoints to generate
   * @returns {Array} - Array of waypoints
   */
  generateFeaturePath(playerPosition, count = 8) {
    // Get terrain height sampling function
    const getHeightFunc = (x, z) => this.terrain.getHeightAt(x, z);
    
    // Find ridges and peaks
    const ridges = findLocalRidges(getHeightFunc, playerPosition.x, playerPosition.z, 100);
    const peaks = findLocalPeaks(getHeightFunc, playerPosition.x, playerPosition.z, 100);
    
    // Combine interesting points, prioritizing peaks
    const interestPoints = [...peaks];
    
    // Add some ridge points if needed
    if (interestPoints.length < count && ridges.length > 0) {
      // Sort ridges by height
      ridges.sort((a, b) => b.y - a.y);
      
      // Add highest ridges
      const ridgesToAdd = Math.min(ridges.length, count - interestPoints.length);
      for (let i = 0; i < ridgesToAdd; i++) {
        interestPoints.push(ridges[i]);
      }
    }
    
    // If still not enough points, add some random points
    if (interestPoints.length < count) {
      const radius = 100;
      for (let i = interestPoints.length; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 20 + Math.random() * radius;
        
        const x = playerPosition.x + Math.cos(angle) * distance;
        const z = playerPosition.z + Math.sin(angle) * distance;
        const y = this.terrain.getHeightAt(x, z);
        
        if (y !== null && !isNaN(y)) {
          interestPoints.push(new THREE.Vector3(x, y, z));
        }
      }
    }
    
    // Always include a point near the player for path start
    const playerNearbyPoint = new THREE.Vector3(
      playerPosition.x + (Math.random() - 0.5) * 20,
      0,
      playerPosition.z + (Math.random() - 0.5) * 20
    );
    const heightAtPlayer = this.terrain.getHeightAt(playerNearbyPoint.x, playerNearbyPoint.z);
    if (heightAtPlayer !== null && !isNaN(heightAtPlayer)) {
      playerNearbyPoint.y = heightAtPlayer + 2;
      interestPoints.unshift(playerNearbyPoint);
    }
    
    // Create a path from the interest points
    return this.createPath(interestPoints, count);
  }
  
  /**
   * Create a path from a set of points with sensible ordering
   * @param {Array} points - Array of points
   * @param {number} maxPoints - Maximum number of points in the path
   * @returns {Array} - Array of ordered waypoints
   */
  createPath(points, maxPoints) {
    if (points.length <= 2) return points;
    
    // Start with the first point (near player)
    const path = [points[0]];
    const remainingPoints = new Set(points.slice(1));
    
    // Add points to path until we reach the desired length
    while (path.length < maxPoints && remainingPoints.size > 0) {
      const lastPoint = path[path.length - 1];
      let bestPoint = null;
      let bestScore = -Infinity;
      
      // Find the best next point
      for (const point of remainingPoints) {
        const distance = lastPoint.distanceTo(point);
        if (distance < 5) continue; // Too close, skip
        
        // Score based on distance (not too far, not too close)
        const distanceScore = -Math.abs(distance - 50);
        
        // Height difference (prefer more interesting terrain changes)
        const heightDiff = Math.abs(lastPoint.y - point.y);
        const heightScore = heightDiff * 0.5;
        
        const score = distanceScore + heightScore;
        
        if (score > bestScore) {
          bestScore = score;
          bestPoint = point;
        }
      }
      
      if (bestPoint) {
        path.push(bestPoint);
        remainingPoints.delete(bestPoint);
      } else {
        break;
      }
    }
    
    return path;
  }
}