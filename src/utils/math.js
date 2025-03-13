// Math utility functions for terrain generation and analysis

/**
 * Linear interpolation between two values
 * @param {number} a - First value
 * @param {number} b - Second value
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number} - Interpolated value
 */
export function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  
  /**
   * Smooth step function (cubic Hermite interpolation)
   * @param {number} t - Input value (0-1)
   * @returns {number} - Smoothed value
   */
  export function smoothStep(t) {
    return t * t * (3 - 2 * t);
  }
  
  /**
   * Convert a value from one range to another
   * @param {number} value - Input value
   * @param {number} fromMin - Input minimum
   * @param {number} fromMax - Input maximum
   * @param {number} toMin - Output minimum
   * @param {number} toMax - Output maximum
   * @returns {number} - Mapped value
   */
  export function mapRange(value, fromMin, fromMax, toMin, toMax) {
    return toMin + (value - fromMin) * (toMax - toMin) / (fromMax - fromMin);
  }
  
  /**
   * Clamp a value between min and max
   * @param {number} value - Input value
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @returns {number} - Clamped value
   */
  export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  
  /**
   * Check if a point is within a rectangle
   * @param {number} x - Point x coordinate
   * @param {number} y - Point y coordinate
   * @param {number} rectX - Rectangle left edge
   * @param {number} rectY - Rectangle top edge
   * @param {number} rectWidth - Rectangle width
   * @param {number} rectHeight - Rectangle height
   * @returns {boolean} - True if point is within rectangle
   */
  export function pointInRect(x, y, rectX, rectY, rectWidth, rectHeight) {
    return x >= rectX && x <= rectX + rectWidth && 
           y >= rectY && y <= rectY + rectHeight;
  }
  
  /**
   * Calculate the distance between two 2D points
   * @param {number} x1 - First point x coordinate
   * @param {number} y1 - First point y coordinate
   * @param {number} x2 - Second point x coordinate
   * @param {number} y2 - Second point y coordinate
   * @returns {number} - Distance between points
   */
  export function distance2D(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  /**
   * Bilinear interpolation of a value in a 2D grid
   * @param {number} x - X coordinate (0-1)
   * @param {number} y - Y coordinate (0-1)
   * @param {number} q11 - Value at (0,0)
   * @param {number} q12 - Value at (0,1)
   * @param {number} q21 - Value at (1,0)
   * @param {number} q22 - Value at (1,1)
   * @returns {number} - Interpolated value
   */
  export function bilinearInterpolation(x, y, q11, q12, q21, q22) {
    const x1 = 0, x2 = 1;
    const y1 = 0, y2 = 1;
    
    const r1 = lerp(q11, q21, (x - x1) / (x2 - x1));
    const r2 = lerp(q12, q22, (x - x1) / (x2 - x1));
    
    return lerp(r1, r2, (y - y1) / (y2 - y1));
  }
  
  /**
   * Calculate the gradient (slope) of a terrain at a point
   * @param {Float32Array} heightMap - Height map data
   * @param {number} width - Width of height map
   * @param {number} x - X coordinate
   * @param {number} z - Z coordinate
   * @returns {number} - Gradient magnitude (0-1)
   */
  export function calculateGradient(heightMap, width, x, z) {
    const idx = z * width + x;
    const h = heightMap[idx];
    
    // Get heights of neighboring points, defaulting to center if out of bounds
    const left = x > 0 ? heightMap[idx - 1] : h;
    const right = x < width - 1 ? heightMap[idx + 1] : h;
    const up = z > 0 ? heightMap[idx - width] : h;
    const down = z < (heightMap.length / width) - 1 ? heightMap[idx + width] : h;
    
    // Calculate x and z gradients
    const gradX = (right - left) * 0.5;
    const gradZ = (down - up) * 0.5;
    
    // Return gradient magnitude
    return Math.sqrt(gradX * gradX + gradZ * gradZ);
  }
  
  /**
   * Generate a normal vector from a heightmap at a given point
   * @param {Float32Array} heightMap - Height map data
   * @param {number} width - Width of height map
   * @param {number} depth - Depth of height map
   * @param {number} x - X coordinate 
   * @param {number} z - Z coordinate
   * @returns {Object} - Normal vector {x, y, z}
   */
  export function calculateNormal(heightMap, width, depth, x, z) {
    const idx = z * width + x;
    
    // Get heights of neighboring points, defaulting to center if out of bounds
    const h = heightMap[idx];
    const left = x > 0 ? heightMap[idx - 1] : h;
    const right = x < width - 1 ? heightMap[idx + 1] : h;
    const up = z > 0 ? heightMap[idx - width] : h;
    const down = z < depth - 1 ? heightMap[idx + width] : h;
    
    // Calculate normal
    const nx = left - right;
    const nz = up - down;
    const ny = 2.0;  // Scale factor for height
    
    // Normalize
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
    
    return {
      x: nx / length,
      y: ny / length,
      z: nz / length
    };
  }