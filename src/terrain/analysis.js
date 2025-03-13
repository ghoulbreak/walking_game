import * as THREE from 'three';

// Class for analyzing the terrain to find interesting features
export class TerrainAnalyzer {
  constructor(terrain) {
    this.terrain = terrain;
    this.width = terrain.width;
    this.depth = terrain.depth;
    this.heightMap = terrain.heightMap;
  }
  
  // Find ridge lines on the terrain
  findRidges(threshold = 0.5) {
    return this.findTerrainFeature(threshold, (horizontalDiff, verticalDiff) => 
      (horizontalDiff > threshold && Math.abs(verticalDiff) < threshold) || 
      (verticalDiff > threshold && Math.abs(horizontalDiff) < threshold)
    );
  }
  
  // Find valleys on the terrain
  findValleys(threshold = 0.5) {
    return this.findTerrainFeature(threshold, (horizontalDiff, verticalDiff) => 
      (horizontalDiff < -threshold && Math.abs(verticalDiff) < threshold) || 
      (verticalDiff < -threshold && Math.abs(horizontalDiff) < threshold)
    );
  }
  
  // Generic terrain feature finder
  findTerrainFeature(threshold, conditionFn) {
    const points = [];
    const gridSize = 5; // Check every nth point for performance
    
    for (let z = gridSize; z < this.depth - gridSize; z += gridSize) {
      for (let x = gridSize; x < this.width - gridSize; x += gridSize) {
        // Calculate neighbor differences
        const idx = z * this.width + x;
        const height = this.heightMap[idx];
        
        const east = this.heightMap[idx + 1] || 0;
        const west = this.heightMap[idx - 1] || 0;
        const north = this.heightMap[idx - this.width] || 0;
        const south = this.heightMap[idx + this.width] || 0;
        
        const horizontalDiff = (height - east) * (height - west);
        const verticalDiff = (height - north) * (height - south);
        
        if (conditionFn(horizontalDiff, verticalDiff)) {
          // Convert to world coordinates
          const worldX = x - this.width / 2;
          const worldZ = z - this.depth / 2;
          const worldHeight = this.terrain.getHeightAt(worldX, worldZ);
          points.push(new THREE.Vector3(worldX, worldHeight, worldZ));
        }
      }
    }
    
    return points;
  }
  
  // Find peaks on the terrain
  findPeaks(threshold = 5) {
    const peakPoints = [];
    const gridSize = 10; // Check every nth point for performance
    
    for (let z = gridSize; z < this.depth - gridSize; z += gridSize) {
      for (let x = gridSize; x < this.width - gridSize; x += gridSize) {
        const idx = z * this.width + x;
        const height = this.heightMap[idx];
        let isPeak = true;
        
        // Check all surrounding points
        checkNeighbors: 
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dz === 0) continue;
            
            const nx = x + dx;
            const nz = z + dz;
            
            // Skip if out of bounds
            if (nx < 0 || nx >= this.width || nz < 0 || nz >= this.depth) continue;
            
            const neighborHeight = this.heightMap[nz * this.width + nx];
            
            // If any neighbor is higher or equal, not a peak
            if (neighborHeight >= height - threshold) {
              isPeak = false;
              break checkNeighbors;
            }
          }
        }
        
        if (isPeak) {
          const worldX = x - this.width / 2;
          const worldZ = z - this.depth / 2;
          const worldHeight = this.terrain.getHeightAt(worldX, worldZ);
          peakPoints.push(new THREE.Vector3(worldX, worldHeight, worldZ));
        }
      }
    }
    
    return peakPoints;
  }
  
  // Generate a path along ridge lines
  generateRidgePath(numPoints = 10) {
    const ridgePoints = this.findRidges();
    
    // If not enough ridge points, return what we have
    if (ridgePoints.length < numPoints) {
      return ridgePoints;
    }
    
    // Find points along the longest ridge
    return this.findLongestPath(ridgePoints, numPoints);
  }
  
  // Find the longest path through a set of points
  findLongestPath(points, maxPoints) {
    if (points.length <= maxPoints) return points;
    
    // Sort by height for interest
    points.sort((a, b) => b.y - a.y);
    
    // Start with the highest point
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
        
        const heightDiff = Math.abs(lastPoint.y - point.y);
        const score = -distance * 0.5 - heightDiff * 2;
        
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
  
  // Create visual markers for waypoints
  createWaypointMarkers(points, scene) {
    const waypoints = [];
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
      waypoints.push(marker);
    });
    
    return waypoints;
  }
  
  // Create a line connecting waypoints
  createWaypointPath(points, scene) {
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