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
    const ridgePoints = [];
    const gridSize = 5; // Check every nth point for performance
    
    for (let z = gridSize; z < this.depth - gridSize; z += gridSize) {
      for (let x = gridSize; x < this.width - gridSize; x += gridSize) {
        // Convert to world coordinates
        const worldX = x - this.width / 2;
        const worldZ = z - this.depth / 2;
        
        if (this.isRidgePoint(x, z, threshold)) {
          const height = this.terrain.getHeightAt(worldX, worldZ);
          ridgePoints.push(new THREE.Vector3(worldX, height, worldZ));
        }
      }
    }
    
    return ridgePoints;
  }
  
  // Check if a point is on a ridge
  isRidgePoint(x, z, threshold) {
    const idx = z * this.width + x;
    const height = this.heightMap[idx];
    
    // Get heights of neighboring points
    const east = this.heightMap[idx + 1] || 0;
    const west = this.heightMap[idx - 1] || 0;
    const north = this.heightMap[idx - this.width] || 0;
    const south = this.heightMap[idx + this.width] || 0;
    
    // Calculate horizontal and vertical differences
    const horizontalDiff = (height - east) * (height - west);
    const verticalDiff = (height - north) * (height - south);
    
    // A ridge point is higher than its east/west neighbors OR north/south neighbors
    return (horizontalDiff > threshold && Math.abs(verticalDiff) < threshold) || 
           (verticalDiff > threshold && Math.abs(horizontalDiff) < threshold);
  }
  
  // Find valleys on the terrain
  findValleys(threshold = 0.5) {
    const valleyPoints = [];
    const gridSize = 5; // Check every nth point for performance
    
    for (let z = gridSize; z < this.depth - gridSize; z += gridSize) {
      for (let x = gridSize; x < this.width - gridSize; x += gridSize) {
        // Convert to world coordinates
        const worldX = x - this.width / 2;
        const worldZ = z - this.depth / 2;
        
        if (this.isValleyPoint(x, z, threshold)) {
          const height = this.terrain.getHeightAt(worldX, worldZ);
          valleyPoints.push(new THREE.Vector3(worldX, height, worldZ));
        }
      }
    }
    
    return valleyPoints;
  }
  
  // Check if a point is in a valley
  isValleyPoint(x, z, threshold) {
    const idx = z * this.width + x;
    const height = this.heightMap[idx];
    
    // Get heights of neighboring points
    const east = this.heightMap[idx + 1] || 0;
    const west = this.heightMap[idx - 1] || 0;
    const north = this.heightMap[idx - this.width] || 0;
    const south = this.heightMap[idx + this.width] || 0;
    
    // Calculate horizontal and vertical differences
    const horizontalDiff = (height - east) * (height - west);
    const verticalDiff = (height - north) * (height - south);
    
    // A valley point is lower than its east/west neighbors OR north/south neighbors
    return (horizontalDiff < -threshold && Math.abs(verticalDiff) < threshold) || 
           (verticalDiff < -threshold && Math.abs(horizontalDiff) < threshold);
  }
  
  // Find peaks on the terrain
  findPeaks(threshold = 5) {
    const peakPoints = [];
    const gridSize = 10; // Check every nth point for performance
    
    for (let z = gridSize; z < this.depth - gridSize; z += gridSize) {
      for (let x = gridSize; x < this.width - gridSize; x += gridSize) {
        // Convert to world coordinates
        const worldX = x - this.width / 2;
        const worldZ = z - this.depth / 2;
        
        if (this.isPeakPoint(x, z, threshold)) {
          const height = this.terrain.getHeightAt(worldX, worldZ);
          peakPoints.push(new THREE.Vector3(worldX, height, worldZ));
        }
      }
    }
    
    return peakPoints;
  }
  
  // Check if a point is a peak
  isPeakPoint(x, z, threshold) {
    const idx = z * this.width + x;
    const height = this.heightMap[idx];
    
    // Check all surrounding points
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue; // Skip center point
        
        const nx = x + dx;
        const nz = z + dz;
        
        // Skip if out of bounds
        if (nx < 0 || nx >= this.width || nz < 0 || nz >= this.depth) continue;
        
        const neighborHeight = this.heightMap[nz * this.width + nx];
        
        // If any neighbor is higher or equal, not a peak
        if (neighborHeight >= height - threshold) {
          return false;
        }
      }
    }
    
    return true;
  }
  
  // Generate a path along ridge lines
  generateRidgePath(numPoints = 10) {
    // Find ridge points
    const ridgePoints = this.findRidges();
    
    // If not enough ridge points, return what we have
    if (ridgePoints.length < numPoints) {
      console.warn(`Only found ${ridgePoints.length} ridge points`);
      return ridgePoints;
    }
    
    // Find points along the longest ridge
    const path = this.findLongestPath(ridgePoints, numPoints);
    return path;
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
      
      // Find nearest point that forms a good path
      let bestPoint = null;
      let bestScore = -Infinity;
      
      // Score each remaining point
      for (const point of remainingPoints) {
        // Calculate distance to last point (closer is better, but not too close)
        const distance = lastPoint.distanceTo(point);
        if (distance < 5) continue; // Too close, skip
        
        // Prioritize points with similar height for ridge traversal
        const heightDiff = Math.abs(lastPoint.y - point.y);
        
        // Score based on distance and height similarity
        // We want points that are relatively close but follow ridges
        const score = -distance * 0.5 - heightDiff * 2;
        
        if (score > bestScore) {
          bestScore = score;
          bestPoint = point;
        }
      }
      
      // If we found a good next point, add it to the path
      if (bestPoint) {
        path.push(bestPoint);
        remainingPoints.delete(bestPoint);
      } else {
        // No good point found, break
        break;
      }
    }
    
    return path;
  }
  
  // Create visual markers for waypoints
  createWaypointMarkers(points, scene) {
    const waypoints = [];
    
    points.forEach((point, index) => {
      // Create a marker geometry
      const geometry = new THREE.SphereGeometry(1, 16, 16);
      
      // Create material (different color for start/end)
      let material;
      if (index === 0) {
        material = new THREE.MeshBasicMaterial({ color: 0x00ff00 }); // Green for start
      } else if (index === points.length - 1) {
        material = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Red for end
      } else {
        material = new THREE.MeshBasicMaterial({ color: 0xffff00 }); // Yellow for middle points
      }
      
      // Create mesh and position it
      const marker = new THREE.Mesh(geometry, material);
      marker.position.copy(point);
      marker.position.y += 2; // Raise slightly above the terrain
      
      // Add to scene and waypoints array
      scene.add(marker);
      waypoints.push(marker);
    });
    
    return waypoints;
  }
  
  // Create a line connecting waypoints
  createWaypointPath(points, scene) {
    // Create points for the line
    const linePoints = [];
    points.forEach(point => {
      // Copy the point and raise it slightly above terrain
      const linePoint = point.clone();
      linePoint.y += 2.2; // Slightly above markers
      linePoints.push(linePoint);
    });
    
    // Create line geometry
    const geometry = new THREE.BufferGeometry().setFromPoints(linePoints);
    
    // Create line material
    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      linewidth: 2
    });
    
    // Create line and add to scene
    const line = new THREE.Line(geometry, material);
    scene.add(line);
    
    return line;
  }
}