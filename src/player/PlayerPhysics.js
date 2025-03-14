// src/player/PlayerPhysics.js
// Handles player physics including gravity, movement, and collisions

import * as THREE from 'three';

/**
 * Handles physics calculations for the player
 */
export class PlayerPhysics {
  /**
   * Create a new PlayerPhysics instance
   * @param {Object} terrain - The terrain system
   */
  constructor(terrain) {
    this.terrain = terrain;
    this.gravity = 25;
  }
  
  /**
   * Update player physics
   * @param {PlayerController} player - The player controller
   * @param {number} deltaTime - Time elapsed since last update
   */
  update(player, deltaTime) {
    // Calculate speed based on running state
    const currentSpeed = player.isRunning ? player.sprintSpeed : player.speed;
    
    // Set horizontal velocity based on input direction and speed
    player.velocity.x = player.direction.x * currentSpeed;
    player.velocity.z = player.direction.z * currentSpeed;
    
    // Apply slope physics when on ground and moving
    const isMovingHorizontally = player.velocity.x !== 0 || player.velocity.z !== 0;
    
    if (this.terrain && player.isOnGround && isMovingHorizontally) {
      this.applySlopePhysics(player);
    }
    
    // Apply gravity when not on ground
    //if (!player.isOnGround) {
    //  player.velocity.y -= this.gravity * deltaTime;
    //}
    
    // Update position
    player.position.x += player.velocity.x * deltaTime;
    player.position.y += player.velocity.y * deltaTime;
    player.position.z += player.velocity.z * deltaTime;
    
    // Check ground collision
    this.checkGroundCollision(player);
  }
  
  /**
   * Apply physics adjustments based on terrain slope
   * @param {PlayerController} player - The player controller
   */
  applySlopePhysics(player) {
    try {
      const slopeFactor = this.calculateSlopeDifficulty(
        player,
        player.velocity.x,
        player.velocity.z
      );
      
      if (slopeFactor >= 0) {
        // Normal movement with slope influence
        player.velocity.x *= slopeFactor;
        player.velocity.z *= slopeFactor;
      } else {
        // Sliding downhill - find downhill direction
        const checkDist = 2.0;
        const heightN = this.terrain.getHeightAt(player.position.x, player.position.z - checkDist);
        const heightS = this.terrain.getHeightAt(player.position.x, player.position.z + checkDist);
        const heightE = this.terrain.getHeightAt(player.position.x + checkDist, player.position.z);
        const heightW = this.terrain.getHeightAt(player.position.x - checkDist, player.position.z);
        
        // Calculate normalized downhill vector
        let downX = 0, downZ = 0;
        let validHeights = 0;
        
        if (heightE !== null && heightW !== null) {
          if (heightE < heightW) downX += 1;
          if (heightW < heightE) downX -= 1;
          validHeights++;
        }
        
        if (heightS !== null && heightN !== null) {
          if (heightS < heightN) downZ += 1;
          if (heightN < heightS) downZ -= 1;
          validHeights++;
        }
        
        // Only apply sliding if we have valid heights
        if (validHeights > 0) {
          const downMag = Math.sqrt(downX * downX + downZ * downZ);
          if (downMag > 0) {
            downX /= downMag;
            downZ /= downMag;
            
            // Apply sliding
            const slideSpeed = player.speed * Math.abs(slopeFactor) * 1.5;
            player.velocity.x = downX * slideSpeed;
            player.velocity.z = downZ * slideSpeed;
          }
        }
      }
    } catch (e) {
      // Fall back to basic movement (already set)
      console.warn("Error in slope physics:", e);
    }
  }
  
  /**
   * Check for collision with the ground
   * @param {PlayerController} player - The player controller
   */
  checkGroundCollision(player) {
    if (!this.terrain) return;
    
    try {
      const terrainHeight = this.terrain.getHeightAt(player.position.x, player.position.z);
      
      // Only process collision if we have a valid height
      if (terrainHeight !== null && !isNaN(terrainHeight)) {
        const playerBottom = player.position.y - player.height;
        
        if (playerBottom < terrainHeight) {
          // Move up to terrain level
          player.position.y = terrainHeight + player.height;
          player.velocity.y = 0;
          player.isOnGround = true;
        } else if (Math.abs(playerBottom - terrainHeight) < 0.1) {
          player.isOnGround = true;
        } else {
          player.isOnGround = false;
        }
      } else {
        // No valid height found - we might be outside the terrain
        // Just keep falling with gravity
        player.isOnGround = false;
      }
    } catch (e) {
      // Error handling for terrain issues
      console.warn("Error in terrain collision:", e);
    }
  }
  
  /**
   * Calculate difficulty of moving on slopes
   * @param {PlayerController} player - The player controller
   * @param {number} intendedX - Intended X velocity
   * @param {number} intendedZ - Intended Z velocity
   * @returns {number} - Slope difficulty factor (negative for sliding)
   */
  calculateSlopeDifficulty(player, intendedX, intendedZ) {
    // Sample terrain height in movement direction
    const currentX = player.position.x;
    const currentZ = player.position.z;
    const currentHeight = this.terrain.getHeightAt(currentX, currentZ);
    
    if (currentHeight === null || isNaN(currentHeight)) return 1.0; // Default to normal movement
    
    const sampleDistance = 1.0;
    const moveDir = new THREE.Vector2(intendedX, intendedZ).normalize();
    
    const sampleX = currentX + moveDir.x * sampleDistance;
    const sampleZ = currentZ + moveDir.y * sampleDistance;
    const sampleHeight = this.terrain.getHeightAt(sampleX, sampleZ);
    
    if (sampleHeight === null || isNaN(sampleHeight)) return 1.0; // Default to normal movement
    
    // Calculate slope angle
    const heightDiff = sampleHeight - currentHeight;
    const slopeAngle = Math.atan2(heightDiff, sampleDistance);
    const slopeAngleDegrees = slopeAngle * 180 / Math.PI;
    
    // Slope difficulty thresholds
    const maxUphill = 35;
    const maxDownhill = -45;
    
    // Uphill logic
    if (slopeAngleDegrees > 0) {
      if (slopeAngleDegrees > maxUphill) {
        return 0; // Too steep to climb
      }
      return 1 - (slopeAngleDegrees / maxUphill) * 0.7; // Gradually reduce speed
    } 
    // Downhill logic
    else {
      if (slopeAngleDegrees < maxDownhill) {
        return slopeAngleDegrees / 90; // Negative value for sliding
      }
      return 1 + (Math.abs(slopeAngleDegrees) / 45) * 0.2; // Slight speed boost downhill
    }
  }
}