// src/core/InputController.js
// Handles user input for the player and camera

import * as THREE from 'three';

/**
 * Handles keyboard and mouse input for player control
 */
export class InputController {
  /**
   * Create a new InputController
   * @param {PlayerController} player - The player controller
   * @param {THREE.Camera} camera - The camera
   */
  constructor(player, camera) {
    this.player = player;
    this.camera = camera;
    
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      sprint: false
    };
    
    this.mouse = {
      sensitivity: 0.002,
      locked: false
    };
    
    this.setupKeyboardControls();
    this.setupMouseControls();
  }
  
  /**
   * Set up keyboard event listeners
   */
  setupKeyboardControls() {
    const keyDownHandler = (event) => {
      switch (event.code) {
        case 'KeyW': this.keys.forward = true; break;
        case 'KeyS': this.keys.backward = true; break;
        case 'KeyA': this.keys.left = true; break;
        case 'KeyD': this.keys.right = true; break;
        case 'Space':
          this.keys.jump = true;
          if (this.player.isOnGround) {
            this.player.jump();
          }
          break;
        case 'ShiftLeft': this.keys.sprint = true; break;
      }
      
      // Update player input state
      this.updatePlayerInput();
    };
    
    const keyUpHandler = (event) => {
      switch (event.code) {
        case 'KeyW': this.keys.forward = false; break;
        case 'KeyS': this.keys.backward = false; break;
        case 'KeyA': this.keys.left = false; break;
        case 'KeyD': this.keys.right = false; break;
        case 'Space': this.keys.jump = false; break;
        case 'ShiftLeft': this.keys.sprint = false; break;
      }
      
      // Update player input state
      this.updatePlayerInput();
    };
    
    document.addEventListener('keydown', keyDownHandler);
    document.addEventListener('keyup', keyUpHandler);
  }
  
  /**
   * Set up mouse controls for camera rotation
   */
  setupMouseControls() {
    // Request pointer lock on click
    document.addEventListener('click', () => {
      if (!this.mouse.locked) document.body.requestPointerLock();
    });
    
    // Track pointer lock state
    document.addEventListener('pointerlockchange', () => {
      this.mouse.locked = document.pointerLockElement !== null;
    });
    
    // Handle mouse movement
    document.addEventListener('mousemove', (event) => {
      if (!this.mouse.locked) return;
      
      const rotationY = -event.movementX * this.mouse.sensitivity;
      const rotationX = -event.movementY * this.mouse.sensitivity;
      
      this.player.rotate(rotationX, rotationY);
      
      // Update camera rotation
      this.updateCameraRotation();
    });
  }
  
  /**
   * Update player input state
   */
  updatePlayerInput() {
    // Calculate movement direction
    const moveDirection = new THREE.Vector3(0, 0, 0);
    
    if (this.keys.forward) moveDirection.z -= 1;
    if (this.keys.backward) moveDirection.z += 1;
    if (this.keys.left) moveDirection.x -= 1;
    if (this.keys.right) moveDirection.x += 1;
    
    // Normalize if moving in multiple directions
    if (moveDirection.length() > 0) moveDirection.normalize();
    
    // Apply rotation to movement direction
    moveDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.player.rotation.y);
    
    // Update player input
    this.player.setMovementDirection(moveDirection);
    this.player.setSprinting(this.keys.sprint);
  }
  
  /**
   * Update camera rotation based on player rotation
   */
  updateCameraRotation() {
    // Apply player rotation to camera
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.x = this.player.rotation.x;
    this.camera.rotation.y = this.player.rotation.y;
  }
}