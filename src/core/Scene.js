// src/core/Scene.js
// Handles scene creation and management

import * as THREE from 'three';

/**
 * Create a new scene with camera, renderer, lighting, and environment
 * @returns {Object} - Object containing the scene, camera, and renderer
 */
export function createScene() {
  // Create scene with blue sky and fog
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);
  
  // Use a softer fog for distance fading - matches better with chunked terrain
  scene.fog = new THREE.FogExp2(0x87CEEB, 0.0008);
  
  // Create camera with larger far plane for better distance viewing
  const camera = new THREE.PerspectiveCamera(
    70, 
    window.innerWidth / window.innerHeight, 
    0.1, 
    5000 // Increased far plane for larger terrain
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
  
  // Add sky with clouds
  addSky(scene);
  
  return { scene, camera, renderer };
}

/**
 * Add lighting to the scene
 * @param {THREE.Scene} scene - The scene to add lighting to
 */
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
  sunLight.shadow.camera.far = 1000;
  
  // Increase shadow camera size for larger terrain
  const shadowSize = 1000;
  sunLight.shadow.camera.left = -shadowSize;
  sunLight.shadow.camera.right = shadowSize;
  sunLight.shadow.camera.top = shadowSize;
  sunLight.shadow.camera.bottom = -shadowSize;
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

/**
 * Add a sky with clouds and distant mountains
 * @param {THREE.Scene} scene - The scene to add the sky to
 */
function addSky(scene) {
  // Create sky dome
  const skyGeometry = new THREE.SphereGeometry(4000, 32, 32);
  // Invert the geometry so that the sky faces inward
  skyGeometry.scale(-1, 1, 1);
  
  // Create gradient sky material
  const vertexShader = `
    varying vec3 vWorldPosition;
    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  
  const fragmentShader = `
    uniform vec3 topColor;
    uniform vec3 bottomColor;
    uniform float offset;
    uniform float exponent;
    varying vec3 vWorldPosition;
    void main() {
      float h = normalize(vWorldPosition + offset).y;
      gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
    }
  `;
  
  const uniforms = {
    topColor: { value: new THREE.Color(0x0077FF) },
    bottomColor: { value: new THREE.Color(0xAAAAAA) },
    offset: { value: 400 },
    exponent: { value: 0.6 }
  };
  
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    side: THREE.BackSide
  });
  
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  scene.add(sky);
  
  // Add distant mountains silhouette
  addDistantMountains(scene);
}

/**
 * Add distant mountains on the horizon
 * @param {THREE.Scene} scene - The scene to add the mountains to
 */
function addDistantMountains(scene) {
  const mountainGeometry = new THREE.PlaneGeometry(8000, 400, 100, 20);
  
  // Create a silhouette profile for distant mountains
  const positions = mountainGeometry.attributes.position.array;
  for (let i = 0; i < positions.length; i += 3) {
    // Skip first and last vertices in each row (keep them at zero height)
    const x = positions[i];
    const vertexIndex = i / 3;
    const columnCount = 101; // Vertices per row in the plane (100 segments + 1)
    const rowIndex = Math.floor(vertexIndex / columnCount);
    const colIndex = vertexIndex % columnCount;
    
    // Only modify height for non-edge vertices
    if (colIndex > 0 && colIndex < columnCount - 1) {
      // Create mountain profile with simplex-like function
      const normalizedX = (x + 4000) / 8000; // 0 to 1 across width
      const baseHeight = Math.sin(normalizedX * Math.PI * 8) * 100;
      const detail1 = Math.sin(normalizedX * Math.PI * 16) * 50;
      const detail2 = Math.sin(normalizedX * Math.PI * 32) * 25;
      
      // Combine different frequencies and make height depend on row
      const rowFactor = 1 - rowIndex / 20; // Higher rows are shorter
      positions[i + 1] = Math.max(0, (baseHeight + detail1 + detail2) * rowFactor);
    }
  }
  
  mountainGeometry.computeVertexNormals();
  
  // Mountain material
  const mountainMaterial = new THREE.MeshLambertMaterial({
    color: 0x306090,
    side: THREE.DoubleSide,
    fog: true,
    transparent: true,
    opacity: 0.8
  });
  
  const mountains = new THREE.Mesh(mountainGeometry, mountainMaterial);
  mountains.position.set(0, 200, -4000);
  mountains.rotation.x = Math.PI / 2;
  scene.add(mountains);
}

/**
 * Handler for window resize events
 * @param {THREE.Camera} camera - The camera to update
 * @param {THREE.WebGLRenderer} renderer - The renderer to resize
 */
export function resizeHandler(camera, renderer) {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}