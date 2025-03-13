import * as THREE from 'three';

export function createScene() {
  console.log("Creating scene...");
  
  // Create scene
  const scene = new THREE.Scene();
  
  // Set background to a blue sky color
  scene.background = new THREE.Color(0x87CEEB);
  
  // Add softer fog for distance fade (reduced density for better visibility)
  scene.fog = new THREE.FogExp2(0x87CEEB, 0.002);
  
  // Create camera
  const camera = new THREE.PerspectiveCamera(
    75, 
    window.innerWidth / window.innerHeight, 
    0.1, 
    2000 // Increased far plane for larger terrain
  );
  
  // Initial camera position (will be overridden by player position)
  camera.position.set(0, 50, 50);
  camera.lookAt(0, 0, 0);
  
  // Create renderer with enhanced settings
  const renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });
  
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio for performance
  
  // Enable shadows with better quality
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
  // Set tone mapping for better lighting
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  
  document.body.appendChild(renderer.domElement);
  
  // Add lighting
  addLighting(scene);
  
  // Add a helper grid for development (can be removed in production)
  const gridSize = 512;
  const gridDivisions = 32;
  const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x888888, 0x444444);
  gridHelper.position.y = 0.1; // Raise slightly to avoid z-fighting
  gridHelper.visible = false; // Hidden by default, can be toggled for debugging
  scene.add(gridHelper);
  
  return { scene, camera, renderer };
}

function addLighting(scene) {
  // Ambient light - provides base illumination
  const ambientLight = new THREE.AmbientLight(0xCCDDFF, 0.4);
  scene.add(ambientLight);
  
  // Directional light (sun)
  const sunLight = new THREE.DirectionalLight(0xFFFFDD, 1.0);
  sunLight.position.set(100, 150, 50);
  sunLight.castShadow = true;
  
  // Improve shadow quality
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 500;
  sunLight.shadow.camera.left = -250;
  sunLight.shadow.camera.right = 250;
  sunLight.shadow.camera.top = 250;
  sunLight.shadow.camera.bottom = -250;
  sunLight.shadow.bias = -0.0005;
  
  scene.add(sunLight);
  
  // Hemisphere light - adds sky and ground color influence
  const hemisphereLight = new THREE.HemisphereLight(
    0x87CEEB, // Sky color
    0x3A5F0B, // Ground color
    0.6        // Intensity
  );
  scene.add(hemisphereLight);
}

export function resizeHandler(camera, renderer) {
  // Update camera aspect ratio
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  
  // Update renderer size
  renderer.setSize(window.innerWidth, window.innerHeight);
}