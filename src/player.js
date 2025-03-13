import * as THREE from 'three';

// Player state
const player = {
  position: new THREE.Vector3(0, 0, 0),
  velocity: new THREE.Vector3(0, 0, 0),
  direction: new THREE.Vector3(0, 0, 1),
  rotation: {
    x: 0, // Pitch (up/down)
    y: 0  // Yaw (left/right)
  },
  speed: 5, // Movement speed
  jumpForce: 10,
  gravity: 20,
  isOnGround: false,
  height: 1.7, // Player "eye" height
  keys: {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false
  },
  mouse: {
    sensitivity: 0.002,
    locked: false
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

export function updatePlayer(player, deltaTime, terrain) {
  // Handle NaN or undefined deltaTime
  if (!deltaTime || isNaN(deltaTime)) {
    deltaTime = 0.016; // Default to 60fps if deltaTime is invalid
  }
  
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
  
  // Apply movement to velocity (horizontal only)
  player.velocity.x = rotatedDirection.x * player.speed;
  player.velocity.z = rotatedDirection.z * player.speed;
  
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