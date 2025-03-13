import * as THREE from 'three';

export function createScene() {
  // Create scene with blue sky and fog
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);
  scene.fog = new THREE.FogExp2(0x87CEEB, 0.002);
  
  // Create camera
  const camera = new THREE.PerspectiveCamera(
    70, 
    window.innerWidth / window.innerHeight, 
    0.1, 
    2000
  );
  camera.position.set(0, 50, 50);
  camera.lookAt(0, 0, 0);
  
  // Create renderer
  const renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    powerPreference: 'high-performance'
  });
  
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  
  document.body.appendChild(renderer.domElement);
  
  // Add lighting
  addLighting(scene);
  
  // Add helper grid (hidden by default)
  const gridHelper = new THREE.GridHelper(512, 32, 0x888888, 0x444444);
  gridHelper.position.y = 0.1;
  gridHelper.visible = false;
  scene.add(gridHelper);
  
  return { scene, camera, renderer };
}

function addLighting(scene) {
  // Ambient light
  const ambientLight = new THREE.AmbientLight(0xCCDDFF, 0.6);
  scene.add(ambientLight);
  
  // Directional light (sun)
  const sunLight = new THREE.DirectionalLight(0xFFFFDD, 0.8);
  sunLight.position.set(100, 150, 50);
  sunLight.castShadow = true;
  
  // Configure shadows
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
  
  // Hemisphere light
  const hemisphereLight = new THREE.HemisphereLight(
    0x87CEEB, // Sky color
    0x3A5F0B, // Ground color
    0.6
  );
  scene.add(hemisphereLight);
}

export function resizeHandler(camera, renderer) {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}