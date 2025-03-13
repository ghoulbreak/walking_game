// src/player/PlayerController.js
// Controls the player's movement, physics, and state

import * as THREE from 'three';
import { PlayerPhysics } from './PlayerPhysics.js';

/**
 * Controls the player character
 */
export class PlayerController {
  /**
   * Create a new PlayerController
   * @param {THREE.Camera} camera - The camera to attach to the player
   * @param {Object} terrain - The terrain system
   */
  constructor(camera, terrain) {
    this.camera = camera;
    this.terrain = terrain;
    
    // Player state
    this.position = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.direction = new THREE.Vector3(0, 0, 0);
    this.rotation = { x: 0, y: 0 };
    this.isOnGround = false;
    this.isRunning = false;
    
    // Player properties
    this.height = 1.6;           // Height of player's eyes from ground
    this.speed = 12;             // Base movement speed
    this.sprintSpeed = 24;       // Sprinting movement speed
    this.jumpForce = 15;         // Force applied when jumping
    
    // Stamina system
    this.stamina = {
      current: 100,
      max: 100,
      recoveryRate: 15,  // Recovery per second
      drainRate: 12      // Drain per second while sprinting
    };
    
    // Create physics system
    this.physics = new PlayerPhysics(terrain);
  }
  
  /**
   * Update the player
   * @param {number} deltaTime - Time elapsed since last update
   */
  update(deltaTime) {
    // Update stamina
    this.updateStamina(deltaTime);
    
    // Apply physics
    this.physics.update(this, deltaTime);
    
    // Update camera position to follow player
    this.updateCamera();
  }
  
  /**
   * Update the player's stamina
   * @param {number} deltaTime - Time elapsed since last update
   */
  updateStamina(deltaTime) {
    // Drain stamina while sprinting and moving
    const isMoving = this.direction.length() > 0;
    
    if (this.isRunning && isMoving) {
      this.stamina.current = Math.max(0, this.stamina.current - this.stamina.drainRate * deltaTime);
      
      // Stop running if out of stamina
      if (this.stamina.current <= 0) {
        this.isRunning = false;
      }
    } else {
      // Recover stamina when not sprinting
      this.stamina.current = Math.min(this.stamina.max, this.stamina.current + this.stamina.recoveryRate * deltaTime);
    }
  }
  
  /**
   * Update the camera to follow the player
   */
  updateCamera() {
    if (this.camera) {
      this.camera.position.copy(this.position);
    }
  }
  
  /**
   * Set the player's movement direction
   * @param {THREE.Vector3} direction - Direction vector
   */
  setMovementDirection(direction) {
    this.direction.copy(direction);
  }
  
  /**
   * Set sprinting state
   * @param {boolean} isSprinting - Whether the player is sprinting
   */
  setSprinting(isSprinting) {
    // Can only sprint if we have stamina
    this.isRunning = isSprinting && this.stamina.current > 0;
  }
  
  /**
   * Make the player jump
   */
  jump() {
    if (this.isOnGround) {
      this.velocity.y = this.jumpForce;
      this.isOnGround = false;
    }
  }
  
  /**
   * Rotate the player
   * @param {number} rotationX - X rotation (pitch)
   * @param {number} rotationY - Y rotation (yaw)
   */
  rotate(rotationX, rotationY) {
    this.rotation.y += rotationY;
    this.rotation.x += rotationX;
    
    // Limit vertical look angle
    this.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.rotation.x));
  }
  
  /**
   * Set the player's position
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} z - Z coordinate
   */
  setPosition(x, y, z) {
    this.position.set(x, y, z);
    this.updateCamera();
  }
  
  /**
   * Teleport the player to a new location
   * @param {number} x - X coordinate
   * @param {number} z - Z coordinate
   */
  teleport(x, z) {
    if (!this.terrain) return null;
    
    try {
      const height = this.terrain.getHeightAt(x, z);
      if (isNaN(height) || height === null) return null;
      
      const safetyMargin = 5;
      
      // Set position and reset physics
      this.position.set(x, height + this.height + safetyMargin, z);
      this.velocity.set(0, 0, 0);
      this.isOnGround = false;
      
      // Update camera
      this.updateCamera();
      
      return this.position.clone();
    } catch (error) {
      console.error("Teleport error:", error);
      return null;
    }
  }
}