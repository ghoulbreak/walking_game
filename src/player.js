import * as THREE from 'three';

// Player state - adjusted for larger terrain scale
const player = {
  position: new THREE.Vector3(0, 0, 0),
  velocity: new THREE.Vector3(0, 0, 0),
  direction: new THREE.Vector3(0, 0, 1),
  rotation: {
    x: 0, // Pitch (up/down)
    y: 0  // Yaw (left/right)
  },
  speed: 10,       // Increased movement speed for larger terrain
  sprintSpeed: 20, // Double speed when sprinting
  isRunning: false, // Track if player is running
  jumpForce: 12,   // Increased jump height
  gravity: 25,     // Stronger gravity
  isOnGround: false,
  height: 1.6,     // Player "eye" height
  keys: {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    sprint: false
  },
  mouse: {
    sensitivity: 0.002,
    locked: false
  },
  stamina: {
    current: 100,
    max: 100,
    recoveryRate: 10,  // Stamina recovered per second
    drainRate: 15      // Stamina used per second while sprinting
  }
};

export function initPlayer(camera, terrain) {
  // Set initial position above terrain
  const startX = 0;
  const startZ = 0;
  const heightAtStart = terrain.getHeightAt(startX, startZ);
  player.position.set(startX, heightAtStart + player.height, startZ);
  camera.position.copy(player.position);
  
  // Set up keyboard controls
  setupKeyboardControls();
  
  // Set up mouse controls for camera
  setupMouseControls(camera);
  
  return player;
}

function setupKeyboardControls() {
  document.addEventListener('keydown', (event) => {
    switch (event.code) {
      case 'KeyW':
        player.keys.forward = true;
        break;
      case 'KeyS':
        player.keys.backward = true;
        break;
      case 'KeyA':
        player.keys.left = true;
        break;
      case 'KeyD':
        player.keys.right = true;
        break;
      case 'Space':
        if (player.isOnGround) {
          player.velocity.y = player.jumpForce;
          player.isOnGround = false;
        }
        break;
      case 'ShiftLeft':
        player.keys.sprint = true;
        break;
        // Add this case to your keydown event listener in setupKeyboardControls
      case 'KeyT':
        // Teleport to a flat area (modify coordinates as needed)
        if (terrain) {
        teleportPlayer(player, 100, 100, terrain);
        }
        break;
    }
  });
  
  document.addEventListener('keyup', (event) => {
    switch (event.code) {
      case 'KeyW':
        player.keys.forward = false;
        break;
      case 'KeyS':
        player.keys.backward = false;
        break;
      case 'KeyA':
        player.keys.left = false;
        break;
      case 'KeyD':
        player.keys.right = false;
        break;
      case 'ShiftLeft':
        player.keys.sprint = false;
        break;
    }
  });
}

function setupMouseControls(camera) {
  // Request pointer lock when clicking on the canvas
  document.addEventListener('click', () => {
    if (!player.mouse.locked) {
      document.body.requestPointerLock();
    }
  });
  
  // Handle pointer lock change
  document.addEventListener('pointerlockchange', () => {
    player.mouse.locked = document.pointerLockElement !== null;
  });
  
  // Handle mouse movement
  document.addEventListener('mousemove', (event) => {
    if (player.mouse.locked) {
      // Update rotation based on mouse movement
      player.rotation.y -= event.movementX * player.mouse.sensitivity;
      player.rotation.x -= event.movementY * player.mouse.sensitivity;
      
      // Limit looking up/down to avoid flipping
      player.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, player.rotation.x));
      
      // Update camera rotation
      camera.rotation.order = 'YXZ';
      camera.rotation.x = player.rotation.x;
      camera.rotation.y = player.rotation.y;
    }
  });
}

// This is the fixed version of the updatePlayer function for src/player.js

export function updatePlayer(player, deltaTime, terrain) {
    // Handle NaN or undefined deltaTime
    if (!deltaTime || isNaN(deltaTime)) {
      deltaTime = 0.016; // Default to 60fps if deltaTime is invalid
    }
    
    // Update stamina
    if (player.keys.sprint && (player.keys.forward || player.keys.backward || player.keys.left || player.keys.right)) {
      // Drain stamina while sprinting and moving
      player.stamina.current = Math.max(0, player.stamina.current - player.stamina.drainRate * deltaTime);
      player.isRunning = player.stamina.current > 0; // Can only run if we have stamina
    } else {
      // Recover stamina when not sprinting
      player.stamina.current = Math.min(player.stamina.max, player.stamina.current + player.stamina.recoveryRate * deltaTime);
      player.isRunning = false;
    }
    
    // Determine current speed based on sprint state
    const currentSpeed = player.isRunning ? player.sprintSpeed : player.speed;
    
    // Calculate movement direction vector based on keyboard input
    const moveDirection = new THREE.Vector3(0, 0, 0);
    
    // Forward/backward movement in the direction the player is facing
    if (player.keys.forward) {
      moveDirection.z -= 1;
    }
    if (player.keys.backward) {
      moveDirection.z += 1;
    }
    
    // Left/right movement perpendicular to the direction the player is facing
    if (player.keys.left) {
      moveDirection.x -= 1;
    }
    if (player.keys.right) {
      moveDirection.x += 1;
    }
    
    // Normalize movement vector to ensure consistent speed in all directions
    if (moveDirection.length() > 0) {
      moveDirection.normalize();
    }
    
    // Apply rotation to movement vector
    const rotatedDirection = moveDirection.clone();
    rotatedDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), player.rotation.y);
    
    // Calculate intended movement
    const intendedMovementX = rotatedDirection.x * currentSpeed;
    const intendedMovementZ = rotatedDirection.z * currentSpeed;
    
    // Apply basic movement first
    player.velocity.x = intendedMovementX;
    player.velocity.z = intendedMovementZ;
    
    // Apply slope physics if we're actually trying to move and on the ground
    if (terrain && player.isOnGround && (intendedMovementX !== 0 || intendedMovementZ !== 0)) {
      try {
        // Get slope factor
        const slopeFactor = calculateSlopeDifficulty(
          player, intendedMovementX, intendedMovementZ, terrain
        );
        
        if (slopeFactor >= 0) {
          // Normal movement with slope slowdown
          player.velocity.x *= slopeFactor;
          player.velocity.z *= slopeFactor;
        } else {
          // Negative factor means sliding downhill
          // Find downhill direction
          const currentHeight = terrain.getHeightAt(player.position.x, player.position.z);
          
          // Check in 4 directions to find downhill
          const checkDist = 2.0;
          const heightN = terrain.getHeightAt(player.position.x, player.position.z - checkDist);
          const heightS = terrain.getHeightAt(player.position.x, player.position.z + checkDist);
          const heightE = terrain.getHeightAt(player.position.x + checkDist, player.position.z);
          const heightW = terrain.getHeightAt(player.position.x - checkDist, player.position.z);
          
          // Calculate downhill vector (negative because we want to go downhill)
          let downX = 0;
          let downZ = 0;
          
          if (heightE < heightW) downX += 1;
          if (heightW < heightE) downX -= 1;
          if (heightS < heightN) downZ += 1;
          if (heightN < heightS) downZ -= 1;
          
          // Normalize
          const downMag = Math.sqrt(downX * downX + downZ * downZ);
          if (downMag > 0) {
            downX /= downMag;
            downZ /= downMag;
            
            // Apply sliding movement
            const slideSpeed = currentSpeed * Math.abs(slopeFactor) * 1.5;
            player.velocity.x = downX * slideSpeed;
            player.velocity.z = downZ * slideSpeed;
          }
        }
      } catch (e) {
        console.error("Error applying slope physics:", e);
        // We already set up the basic velocity above, so no fallback needed
      }
    }
    
    // Apply gravity
    if (!player.isOnGround) {
      player.velocity.y -= player.gravity * deltaTime;
    }
    
    // Update position based on velocity
    player.position.x += player.velocity.x * deltaTime;
    player.position.y += player.velocity.y * deltaTime;
    player.position.z += player.velocity.z * deltaTime;
    
    // Check ground collision
    if (terrain) {
      try {
        const terrainHeight = terrain.getHeightAt(player.position.x, player.position.z);
        const playerBottom = player.position.y - player.height;
        
        // If below terrain, move up and set grounded
        if (playerBottom < terrainHeight) {
          player.position.y = terrainHeight + player.height;
          player.velocity.y = 0;
          player.isOnGround = true;
        } else if (Math.abs(playerBottom - terrainHeight) < 0.1) {
          // Close enough to consider on ground
          player.isOnGround = true;
        } else {
          player.isOnGround = false;
        }
      } catch (e) {
        console.error("Error checking terrain height:", e);
      }
    }
    
    // Update camera position to match player
    const camera = player.camera;
    if (camera) {
      camera.position.copy(player.position);
    }
  }
  
  // Helper function to calculate slope difficulty
  function calculateSlopeDifficulty(player, intendedX, intendedZ, terrain) {
    // Get current height and positions
    const currentX = player.position.x;
    const currentZ = player.position.z;
    const currentHeight = terrain.getHeightAt(currentX, currentZ);
    
    // Sample point in the direction of movement to determine slope
    const sampleDistance = 1.0; // Distance to check ahead
    const moveDir = new THREE.Vector2(intendedX, intendedZ).normalize();
    
    // Calculate sample position
    const sampleX = currentX + moveDir.x * sampleDistance;
    const sampleZ = currentZ + moveDir.y * sampleDistance;
    const sampleHeight = terrain.getHeightAt(sampleX, sampleZ);
    
    // Calculate slope angle
    const heightDiff = sampleHeight - currentHeight;
    const slopeAngle = Math.atan2(heightDiff, sampleDistance);
    const slopeAngleDegrees = slopeAngle * 180 / Math.PI;
    
    // Slope difficulty thresholds
    const maxUphill = 35; // Maximum degrees uphill player can climb
    const maxDownhill = -45; // Maximum downhill angle before sliding
    
    // Uphill logic
    if (slopeAngleDegrees > 0) {
      if (slopeAngleDegrees > maxUphill) {
        // Too steep to climb
        return 0;
      } else {
        // Gradually reduce speed as slope gets steeper
        return 1 - (slopeAngleDegrees / maxUphill) * 0.7;
      }
    } 
    // Downhill logic
    else {
      if (slopeAngleDegrees < maxDownhill) {
        // Too steep, will slide
        return slopeAngleDegrees / 90; // Negative value indicating sliding
      } else {
        // Downhill is slightly faster
        return 1 + (Math.abs(slopeAngleDegrees) / 45) * 0.2;
      }
    }
  }
// Function to teleport the player to a specific position
export function teleportPlayer(player, x, z, terrain) {
    // Get height at the target position
    const height = terrain.getHeightAt(x, z);
    
    // Set player position
    player.position.set(x, height + player.height, z);
    
    // Reset velocity
    player.velocity.set(0, 0, 0);
    
    // Set as grounded
    player.isOnGround = true;
    
    console.log(`Teleported to position (${x}, ${height + player.height}, ${z})`);
    
    // If the player has a camera reference, update it
    if (player.camera) {
      player.camera.position.copy(player.position);
    }
    
    return { x, y: height + player.height, z };
  }
  
  // You can call this from your main.js file or add a keyboard shortcut
  // For example:
  // teleportPlayer(player, 50, 50, terrain); // Teleport to (50, y, 50)