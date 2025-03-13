import * as THREE from 'three';

// Player state configuration
const player = {
  position: new THREE.Vector3(0, 0, 0),
  velocity: new THREE.Vector3(0, 0, 0),
  direction: new THREE.Vector3(0, 0, 1),
  rotation: { x: 0, y: 0 },
  speed: 10,
  sprintSpeed: 20,
  isRunning: false,
  jumpForce: 12,
  gravity: 25,
  isOnGround: false,
  height: 1.6,
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
    recoveryRate: 10,
    drainRate: 15
  }
};

export function initPlayer(camera, terrain) {
  // Set initial position
  const startX = 0;
  const startZ = 0;
  const heightAtStart = terrain.getHeightAt(startX, startZ);
  player.position.set(startX, heightAtStart + player.height, startZ);
  camera.position.copy(player.position);
  
  setupKeyboardControls();
  setupMouseControls(camera);
  
  return player;
}

function setupKeyboardControls() {
  const keyDownHandler = (event) => {
    switch (event.code) {
      case 'KeyW': player.keys.forward = true; break;
      case 'KeyS': player.keys.backward = true; break;
      case 'KeyA': player.keys.left = true; break;
      case 'KeyD': player.keys.right = true; break;
      case 'Space':
        if (player.isOnGround) {
          player.velocity.y = player.jumpForce;
          player.isOnGround = false;
        }
        break;
      case 'ShiftLeft': player.keys.sprint = true; break;
      case 'KeyT': 
        if (window.terrain) teleportPlayer(player, 100, 100, window.terrain);
        break;
    }
  };
  
  const keyUpHandler = (event) => {
    switch (event.code) {
      case 'KeyW': player.keys.forward = false; break;
      case 'KeyS': player.keys.backward = false; break;
      case 'KeyA': player.keys.left = false; break;
      case 'KeyD': player.keys.right = false; break;
      case 'ShiftLeft': player.keys.sprint = false; break;
    }
  };
  
  document.addEventListener('keydown', keyDownHandler);
  document.addEventListener('keyup', keyUpHandler);
}

function setupMouseControls(camera) {
  document.addEventListener('click', () => {
    if (!player.mouse.locked) document.body.requestPointerLock();
  });
  
  document.addEventListener('pointerlockchange', () => {
    player.mouse.locked = document.pointerLockElement !== null;
  });
  
  document.addEventListener('mousemove', (event) => {
    if (!player.mouse.locked) return;
    
    player.rotation.y -= event.movementX * player.mouse.sensitivity;
    player.rotation.x -= event.movementY * player.mouse.sensitivity;
    
    // Limit vertical look angle
    player.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, player.rotation.x));
    
    // Update camera rotation
    camera.rotation.order = 'YXZ';
    camera.rotation.x = player.rotation.x;
    camera.rotation.y = player.rotation.y;
  });
}

export function updatePlayer(player, deltaTime, terrain) {
  // Safety checks
  if (!deltaTime || isNaN(deltaTime)) deltaTime = 0.016;
  
  // Update stamina
  const isMoving = player.keys.forward || player.keys.backward || player.keys.left || player.keys.right;
  
  if (player.keys.sprint && isMoving) {
    player.stamina.current = Math.max(0, player.stamina.current - player.stamina.drainRate * deltaTime);
    player.isRunning = player.stamina.current > 0;
  } else {
    player.stamina.current = Math.min(player.stamina.max, player.stamina.current + player.stamina.recoveryRate * deltaTime);
    player.isRunning = false;
  }
  
  // Movement direction
  const moveDirection = new THREE.Vector3(0, 0, 0);
  
  if (player.keys.forward) moveDirection.z -= 1;
  if (player.keys.backward) moveDirection.z += 1;
  if (player.keys.left) moveDirection.x -= 1;
  if (player.keys.right) moveDirection.x += 1;
  
  if (moveDirection.length() > 0) moveDirection.normalize();
  
  // Apply rotation
  moveDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), player.rotation.y);
  
  // Calculate speed
  const currentSpeed = player.isRunning ? player.sprintSpeed : player.speed;
  
  // Set velocity
  player.velocity.x = moveDirection.x * currentSpeed;
  player.velocity.z = moveDirection.z * currentSpeed;
  
  // Apply slope physics when on ground and moving
  const isMovingHorizontally = player.velocity.x !== 0 || player.velocity.z !== 0;
  
  if (terrain && player.isOnGround && isMovingHorizontally) {
    try {
      const slopeFactor = calculateSlopeDifficulty(player, player.velocity.x, player.velocity.z, terrain);
      
      if (slopeFactor >= 0) {
        // Normal movement with slope influence
        player.velocity.x *= slopeFactor;
        player.velocity.z *= slopeFactor;
      } else {
        // Sliding downhill - find downhill direction
        const checkDist = 2.0;
        const heightN = terrain.getHeightAt(player.position.x, player.position.z - checkDist);
        const heightS = terrain.getHeightAt(player.position.x, player.position.z + checkDist);
        const heightE = terrain.getHeightAt(player.position.x + checkDist, player.position.z);
        const heightW = terrain.getHeightAt(player.position.x - checkDist, player.position.z);
        
        // Calculate normalized downhill vector
        let downX = 0, downZ = 0;
        
        if (heightE < heightW) downX += 1;
        if (heightW < heightE) downX -= 1;
        if (heightS < heightN) downZ += 1;
        if (heightN < heightS) downZ -= 1;
        
        const downMag = Math.sqrt(downX * downX + downZ * downZ);
        if (downMag > 0) {
          downX /= downMag;
          downZ /= downMag;
          
          // Apply sliding
          const slideSpeed = currentSpeed * Math.abs(slopeFactor) * 1.5;
          player.velocity.x = downX * slideSpeed;
          player.velocity.z = downZ * slideSpeed;
        }
      }
    } catch (e) {
      // Fall back to basic movement (already set)
    }
  }
  
  // Apply gravity when not on ground
  if (!player.isOnGround) {
    player.velocity.y -= player.gravity * deltaTime;
  }
  
  // Update position
  player.position.x += player.velocity.x * deltaTime;
  player.position.y += player.velocity.y * deltaTime;
  player.position.z += player.velocity.z * deltaTime;
  
  // Check ground collision
  if (terrain) {
    try {
      const terrainHeight = terrain.getHeightAt(player.position.x, player.position.z);
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
    } catch (e) {
      // Error handling for terrain issues
    }
  }
  
  // Update camera position
  if (player.camera) {
    player.camera.position.copy(player.position);
  }
}

// Calculate difficulty of moving on slopes
function calculateSlopeDifficulty(player, intendedX, intendedZ, terrain) {
  // Sample terrain height in movement direction
  const currentX = player.position.x;
  const currentZ = player.position.z;
  const currentHeight = terrain.getHeightAt(currentX, currentZ);
  
  const sampleDistance = 1.0;
  const moveDir = new THREE.Vector2(intendedX, intendedZ).normalize();
  
  const sampleX = currentX + moveDir.x * sampleDistance;
  const sampleZ = currentZ + moveDir.y * sampleDistance;
  const sampleHeight = terrain.getHeightAt(sampleX, sampleZ);
  
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

// Teleport player to specific location
export function teleportPlayer(player, x, z, terrain) {
  if (!terrain || typeof terrain.getHeightAt !== 'function') return null;
  
  try {
    const height = terrain.getHeightAt(x, z);
    if (isNaN(height)) return null;
    
    const safetyMargin = 2;
    
    // Set position and reset physics
    player.position.set(x, height + player.height + safetyMargin, z);
    player.velocity.set(0, 0, 0);
    player.isOnGround = true;
    
    // Update camera
    if (player.camera) {
      player.camera.position.copy(player.position);
    }
    
    return {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z
    };
  } catch (error) {
    return null;
  }
}