import * as THREE from 'three';

export function createScene() {
  console.log("Creating scene...");
  
  // Create scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb); // Sky blue
  
  // Add fog for distance fade (reduced density for better visibility)
  scene.fog = new THREE.FogExp2(0x87ceeb, 0.005);
  
  // Create camera
  const camera = new THREE.PerspectiveCamera(
    75, 
    window.innerWidth / window.innerHeight, 
    0.1, 
    1000
  );
  
  // Position camera higher and farther back for better initial view
  camera.position.set(0, 30, 50); 
  camera.lookAt(0, 0, 0); // Look at the center of the scene
  
  // Create renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);
  
  // Add lighting
  addLighting(scene);
  
  // Add a helper grid for visualization during development
  const gridHelper = new THREE.GridHelper(200, 50);
  scene.add(gridHelper);
  
  // Add axes helper
  const axesHelper = new THREE.AxesHelper(20);
  scene.add(axesHelper);
  
  // Add a debug sphere at origin to check visibility
  const debugSphere = new THREE.Mesh(
    new THREE.SphereGeometry(5, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xff0000 })
  );
  debugSphere.position.set(0, 20, 0);
  scene.add(debugSphere);
  
  // Log camera position and scene contents
  console.log("Camera position:", camera.position);
  console.log("Scene children:", scene.children.length);
  
  return { scene, camera, renderer };
}

function addLighting(scene) {
  // Ambient light (increased brightness for better visibility)
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  
  // Directional light (sun)
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
  sunLight.position.set(50, 100, 50);
  sunLight.castShadow = true;
  
  // Add a helper to visualize light direction
  const lightHelper = new THREE.DirectionalLightHelper(sunLight, 10);
  scene.add(lightHelper);
  
  // Set up shadow properties
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 500;
  sunLight.shadow.camera.left = -100;
  sunLight.shadow.camera.right = 100;
  sunLight.shadow.camera.top = 100;
  sunLight.shadow.camera.bottom = -100;
  
  scene.add(sunLight);
}

export function resizeHandler(camera, renderer) {
  // Update camera aspect ratio
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  
  // Update renderer size
  renderer.setSize(window.innerWidth, window.innerHeight);
}