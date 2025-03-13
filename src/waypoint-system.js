import * as THREE from 'three';

export class WaypointSystem {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.waypoints = [];
    this.waypointMarkers = [];
    this.pathLine = null;
    this.currentWaypointIndex = 0;
    this.completed = false;
    this.playerStartPosition = new THREE.Vector3(0, 0, 0);
    
    // Audio setup happens on first user interaction
    this.waypointSound = null;
    this.gainNode = null;
    window.addEventListener('click', () => this.setupAudio(), { once: true });
  }
  
  setupAudio() {
    if (this.waypointSound) return;
    
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.waypointSound = audioContext.createOscillator();
      this.waypointSound.type = 'sine';
      this.waypointSound.frequency.setValueAtTime(440, audioContext.currentTime);
      
      this.gainNode = audioContext.createGain();
      this.gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      
      this.waypointSound.connect(this.gainNode);
      this.gainNode.connect(audioContext.destination);
      this.waypointSound.start();
    } catch (e) {
      console.warn("Audio setup failed:", e);
    }
  }
  
  generateWaypoints(count = 8, playerPosition = null) {
    // Clear existing waypoints
    this.clearWaypoints();
    
    // Store player position as reference
    if (playerPosition) {
      this.playerStartPosition.copy(playerPosition);
    }
    
    // Generate waypoints using nearby chunks
    this.generateWaypointsInNearbyChunks(count);
    
    this.currentWaypointIndex = 0;
    this.completed = false;
    
    return this.waypoints;
  }
  
  // Generate waypoints using local terrain features
  generateWaypointsInNearbyChunks(count) {
    // Start at player's position
    const startX = this.playerStartPosition.x;
    const startZ = this.playerStartPosition.z;
    
    // Create waypoints in a roughly circular path
    const radius = 100 + Math.random() * 150; // Random radius between 100-250 units
    const points = [];
    
    // Add first waypoint closer to player
    const firstWaypointDistance = 30 + Math.random() * 30;
    const randomAngle = Math.random() * Math.PI * 2;
    
    const firstPoint = new THREE.Vector3(
      startX + Math.cos(randomAngle) * firstWaypointDistance,
      0,
      startZ + Math.sin(randomAngle) * firstWaypointDistance
    );
    
    // Set y-coordinate based on terrain height
    const firstHeight = this.terrain.getHeightAt(firstPoint.x, firstPoint.z);
    if (firstHeight !== null && !isNaN(firstHeight)) {
      firstPoint.y = firstHeight + 2;
      points.push(firstPoint);
    }
    
    // Create remaining waypoints in a roughly circular pattern
    for (let i = 1; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + randomAngle;
      const jitter = (Math.random() - 0.5) * 0.2; // Random variation
      const actualAngle = angle + jitter;
      
      // Calculate distance from center with some variation
      const distance = radius * (0.8 + Math.random() * 0.4);
      
      const point = new THREE.Vector3(
        startX + Math.cos(actualAngle) * distance,
        0,
        startZ + Math.sin(actualAngle) * distance
      );
      
      // Set y-coordinate based on terrain height
      const terrainHeight = this.terrain.getHeightAt(point.x, point.z);
      if (terrainHeight !== null && !isNaN(terrainHeight)) {
        point.y = terrainHeight + 2; // 2 units above terrain
        points.push(point);
      }
    }
    
    // Make sure we have at least some waypoints
    if (points.length < 3) {
      console.warn("Not enough valid waypoints, adding backup points");
      // Add some fallback waypoints in cardinal directions
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2;
        const backupPoint = new THREE.Vector3(
          startX + Math.cos(angle) * 50,
          0,
          startZ + Math.sin(angle) * 50
        );
        
        const heightAtBackup = this.terrain.getHeightAt(backupPoint.x, backupPoint.z);
        if (heightAtBackup !== null && !isNaN(heightAtBackup)) {
          backupPoint.y = heightAtBackup + 2;
          points.push(backupPoint);
        }
      }
    }
    
    // Create waypoint markers and path
    this.waypoints = points;
    this.waypointMarkers = this.createWaypointMarkers(points);
    this.pathLine = this.createWaypointPath(points);
    
    return this.waypoints;
  }
  
  update(playerPosition, threshold = 10) {
    if (this.completed || this.waypoints.length === 0) return;
    
    const currentWaypoint = this.waypoints[this.currentWaypointIndex];
    if (!currentWaypoint) return;
    
    // Use vector2 to ignore height for distance calculation
    const waypointPos2D = new THREE.Vector2(currentWaypoint.x, currentWaypoint.z);
    const playerPos2D = new THREE.Vector2(playerPosition.x, playerPosition.z);
    const distance = waypointPos2D.distanceTo(playerPos2D);
    
    if (distance < threshold) {
      this.waypointReached();
    }
    
    // If player is very far from waypoints (e.g. after teleporting)
    // regenerate waypoints at new location
    if (distance > 500) {
      this.playerStartPosition.copy(playerPosition);
      this.generateWaypoints(8, playerPosition);
    }
  }
  
  waypointReached() {
    // Play sound effect
    if (this.waypointSound && this.gainNode) {
      const time = this.waypointSound.context.currentTime;
      this.gainNode.gain.setValueAtTime(0, time);
      this.gainNode.gain.linearRampToValueAtTime(0.2, time + 0.05);
      this.gainNode.gain.linearRampToValueAtTime(0, time + 0.3);
      
      const pitch = 440 + (this.currentWaypointIndex * 50);
      this.waypointSound.frequency.setValueAtTime(pitch, time);
    }
    
    // Update waypoint marker color
    const marker = this.waypointMarkers[this.currentWaypointIndex];
    if (marker) {
      marker.material.color.set(0x00ffff); // Cyan for visited
    }
    
    // Move to next waypoint
    this.currentWaypointIndex++;
    
    // Check completion
    if (this.currentWaypointIndex >= this.waypoints.length) {
      this.completed = true;
      
      // Visual feedback
      if (this.pathLine) {
        this.pathLine.material.color.set(0x00ffff);
        this.pathLine.material.linewidth = 3;
      }
      
      // Generate new waypoints after delay
      setTimeout(() => {
        this.clearWaypoints();
        this.generateWaypoints();
      }, 5000);
    }
  }
  
  clearWaypoints() {
    // Clean up markers
    this.waypointMarkers.forEach(marker => {
      this.scene.remove(marker);
      if (marker.geometry) marker.geometry.dispose();
      if (marker.material) marker.material.dispose();
    });
    
    // Clean up path line
    if (this.pathLine) {
      this.scene.remove(this.pathLine);
      if (this.pathLine.geometry) this.pathLine.geometry.dispose();
      if (this.pathLine.material) this.pathLine.material.dispose();
      this.pathLine = null;
    }
    
    this.waypoints = [];
    this.waypointMarkers = [];
  }
  
  // Create the waypoint markers
  createWaypointMarkers(points) {
    const markers = [];
    const colors = [0x00ff00, 0xffff00, 0xff0000]; // Start, middle, end
    
    points.forEach((point, index) => {
      // Determine color based on position in sequence
      const colorIndex = index === 0 ? 0 : (index === points.length - 1 ? 2 : 1);
      
      // Create marker
      const geometry = new THREE.SphereGeometry(1, 16, 16);
      const material = new THREE.MeshBasicMaterial({ color: colors[colorIndex] });
      const marker = new THREE.Mesh(geometry, material);
      
      marker.position.copy(point);
      
      this.scene.add(marker);
      markers.push(marker);
    });
    
    return markers;
  }
  
  // Create a line connecting waypoints
  createWaypointPath(points) {
    if (points.length < 2) return null;
    
    // Create line with elevated points
    const linePoints = points.map(point => {
      const linePoint = point.clone();
      linePoint.y += 0.2; // Slightly above terrain
      return linePoint;
    });
    
    const geometry = new THREE.BufferGeometry().setFromPoints(linePoints);
    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      linewidth: 2
    });
    
    const line = new THREE.Line(geometry, material);
    this.scene.add(line);
    
    return line;
  }
  
  getCurrentWaypoint() {
    if (this.waypoints.length === 0 || this.completed) return null;
    return this.waypoints[this.currentWaypointIndex];
  }
  
  getProgress() {
    if (this.waypoints.length === 0) return 0;
    return this.currentWaypointIndex / this.waypoints.length;
  }
}