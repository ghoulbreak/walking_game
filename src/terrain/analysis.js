import * as THREE from 'three';

// Modified TerrainAnalyzer to work with chunked terrain
export class TerrainAnalyzer {
  constructor(terrain) {
    this.terrain = terrain;
    
    // For chunked terrain, we work with a virtual grid
    this.sampleSize = 8; // Sample every Nth point for performance
    this.analysisGridSize = 128; // Size of local analysis grid
  }
  
  // Analyze a local area of terrain around a point
  analyzeLocalArea(centerX, centerZ, radius = 64) {
    const halfSize = radius / 2;
    const samples = [];
    
    // Sample points in a grid around the center
    for (let z = -radius; z <= radius; z += this.sampleSize) {
      for (let x = -radius; x <= radius; x += this.sampleSize) {
        const worldX = centerX + x;
        const worldZ = centerZ + z;
        
        // Get height at this point
        const height = this.terrain.getHeightAt(worldX, worldZ);
        
        if (height !== null && !isNaN(height)) {
          samples.push({
            x: worldX,
            z: worldZ,
            y: height,
            // Store grid coordinates for analysis
            gridX: Math.floor((x + radius) / this.sampleSize),
            gridZ: Math.floor((z + radius) / this.sampleSize)
          });
        }
      }
    }
    
    return samples;
  }
  
  // Find ridge lines in the local area
  findLocalRidges(centerX, centerZ, radius = 64, threshold = 5) {
    const samples = this.analyzeLocalArea(centerX, centerZ, radius);
    const gridSize = Math.floor(radius * 2 / this.sampleSize);
    const heightGrid = Array(gridSize).fill().map(() => Array(gridSize).fill(null));
    
    // Fill height grid
    for (const sample of samples) {
      if (sample.gridX >= 0 && sample.gridX < gridSize && 
          sample.gridZ >= 0 && sample.gridZ < gridSize) {
        heightGrid[sample.gridZ][sample.gridX] = sample.y;
      }
    }
    
    // Find ridge points
    const ridgePoints = [];
    
    for (const sample of samples) {
      const { gridX, gridZ } = sample;
      
      // Skip edge points
      if (gridX < 1 || gridX >= gridSize - 1 || gridZ < 1 || gridZ >= gridSize - 1) {
        continue;
      }
      
      // Get heights of neighbors
      const height = heightGrid[gridZ][gridX];
      const west = heightGrid[gridZ][gridX - 1];
      const east = heightGrid[gridZ][gridX + 1];
      const north = heightGrid[gridZ - 1][gridX];
      const south = heightGrid[gridZ + 1][gridX];
      
      // Skip if any neighbor is null
      if (west === null || east === null || north === null || south === null) {
        continue;
      }
      
      const horizontalDiff = (height - east) * (height - west);
      const verticalDiff = (height - north) * (height - south);
      
      // Detect ridge points (local maxima in at least one direction)
      if ((horizontalDiff > 0 && Math.abs(verticalDiff) < threshold) || 
          (verticalDiff > 0 && Math.abs(horizontalDiff) < threshold)) {
        ridgePoints.push(new THREE.Vector3(sample.x, sample.y, sample.z));
      }
    }
    
    return ridgePoints;
  }
  
  // Find significant peaks in the local area
  findLocalPeaks(centerX, centerZ, radius = 64, threshold = 5) {
    const samples = this.analyzeLocalArea(centerX, centerZ, radius);
    const gridSize = Math.floor(radius * 2 / this.sampleSize);
    const heightGrid = Array(gridSize).fill().map(() => Array(gridSize).fill(null));
    
    // Fill height grid
    for (const sample of samples) {
      if (sample.gridX >= 0 && sample.gridX < gridSize && 
          sample.gridZ >= 0 && sample.gridZ < gridSize) {
        heightGrid[sample.gridZ][sample.gridX] = sample.y;
      }
    }
    
    // Find peak points
    const peakPoints = [];
    
    for (const sample of samples) {
      const { gridX, gridZ } = sample;
      
      // Skip edge points
      if (gridX < 1 || gridX >= gridSize - 1 || gridZ < 1 || gridZ >= gridSize - 1) {
        continue;
      }
      
      // Get heights of neighbors (8-connected)
      const height = heightGrid[gridZ][gridX];
      let isPeak = true;
      
      // Check all 8 neighbors
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          
          const nx = gridX + dx;
          const nz = gridZ + dz;
          
          if (nx < 0 || nx >= gridSize || nz < 0 || nz >= gridSize) continue;
          
          const neighborHeight = heightGrid[nz][nx];
          if (neighborHeight === null) continue;
          
          // If any neighbor is higher, not a peak
          if (neighborHeight >= height) {
            isPeak = false;
            break;
          }
        }
        if (!isPeak) break;
      }
      
      if (isPeak) {
        peakPoints.push(new THREE.Vector3(sample.x, sample.y, sample.z));
      }
    }
    
    return peakPoints;
  }
  
  // Generate a path connecting interesting features
  generateFeaturePath(centerX, centerZ, numPoints = 8) {
    // Find ridges and peaks
    const ridges = this.findLocalRidges(centerX, centerZ, 100);
    const peaks = this.findLocalPeaks(centerX, centerZ, 100);
    
    // Combine interesting points, prioritizing peaks
    const interestPoints = [...peaks];
    
    // Add some ridge points if needed
    if (interestPoints.length < numPoints && ridges.length > 0) {
      // Sort ridges by height
      ridges.sort((a, b) => b.y - a.y);
      
      // Add highest ridges
      const ridgesToAdd = Math.min(ridges.length, numPoints - interestPoints.length);
      for (let i = 0; i < ridgesToAdd; i++) {
        interestPoints.push(ridges[i]);
      }
    }
    
    // If still not enough points, add some random points
    if (interestPoints.length < numPoints) {
      const radius = 100;
      for (let i = interestPoints.length; i < numPoints; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 20 + Math.random() * radius;
        
        const x = centerX + Math.cos(angle) * distance;
        const z = centerZ + Math.sin(angle) * distance;
        const y = this.terrain.getHeightAt(x, z);
        
        if (y !== null && !isNaN(y)) {
          interestPoints.push(new THREE.Vector3(x, y, z));
        }
      }
    }
    
    // Always include a point near the player for path start
    const playerNearbyPoint = new THREE.Vector3(
      centerX + (Math.random() - 0.5) * 20,
      0,
      centerZ + (Math.random() - 0.5) * 20
    );
    const heightAtPlayer = this.terrain.getHeightAt(playerNearbyPoint.x, playerNearbyPoint.z);
    if (heightAtPlayer !== null && !isNaN(heightAtPlayer)) {
      playerNearbyPoint.y = heightAtPlayer;
      interestPoints.unshift(playerNearbyPoint);
    }
    
    // Create a path from the interest points
    return this.createPath(interestPoints, numPoints);
  }
  
  // Create a path from a set of points
  createPath(points, maxPoints) {
    if (points.length <= 2) return points;
    
    // Start with the first point (near player)
    const path = [points[0]];
    const remainingPoints = new Set(points.slice(1));
    
    // Add points to path until we reach the desired length
    while (path.length < maxPoints && remainingPoints.size > 0) {
      const lastPoint = path[path.length - 1];
      let bestPoint = null;
      let bestScore = -Infinity;
      
      // Find the best next point
      for (const point of remainingPoints) {
        const distance = lastPoint.distanceTo(point);
        if (distance < 5) continue; // Too close, skip
        
        // Score based on distance (not too far, not too close)
        const distanceScore = -Math.abs(distance - 50);
        
        // Height difference (prefer more interesting terrain changes)
        const heightDiff = Math.abs(lastPoint.y - point.y);
        const heightScore = heightDiff * 0.5;
        
        const score = distanceScore + heightScore;
        
        if (score > bestScore) {
          bestScore = score;
          bestPoint = point;
        }
      }
      
      if (bestPoint) {
        path.push(bestPoint);
        remainingPoints.delete(bestPoint);
      } else {
        break;
      }
    }
    
    return path;
  }
  
  // Helper methods for visualizing the analysis
  createWaypointMarkers(points, scene) {
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
      marker.position.y += 2; // Raise slightly above terrain
      
      scene.add(marker);
      markers.push(marker);
    });
    
    return markers;
  }
  
  createWaypointPath(points, scene) {
    if (points.length < 2) return null;
    
    // Create line with elevated points
    const linePoints = points.map(point => {
      const linePoint = point.clone();
      linePoint.y += 2.2; // Slightly above markers
      return linePoint;
    });
    
    const geometry = new THREE.BufferGeometry().setFromPoints(linePoints);
    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      linewidth: 2
    });
    
    const line = new THREE.Line(geometry, material);
    scene.add(line);
    
    return line;
  }
}