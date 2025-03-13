// Math utility functions for terrain generation and analysis

/**
 * Linear interpolation between two values
 */
export function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  
  /**
   * Smooth step function (cubic Hermite interpolation)
   */
  export function smoothStep(t) {
    return t * t * (3 - 2 * t);
  }
  
  /**
   * Convert a value from one range to another
   */
  export function mapRange(value, fromMin, fromMax, toMin, toMax) {
    return toMin + (value - fromMin) * (toMax - toMin) / (fromMax - fromMin);
  }
  
  /**
   * Clamp a value between min and max
   */
  export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  
  /**
   * Check if a point is within a rectangle
   */
  export function pointInRect(x, y, rectX, rectY, rectWidth, rectHeight) {
    return x >= rectX && x <= rectX + rectWidth && 
           y >= rectY && y <= rectY + rectHeight;
  }
  
  /**
   * Calculate the distance between two 2D points
   */
  export function distance2D(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  /**
   * Bilinear interpolation of a value in a 2D grid
   */
  export function bilinearInterpolation(x, y, q11, q12, q21, q22) {
    const r1 = lerp(q11, q21, x);
    const r2 = lerp(q12, q22, x);
    return lerp(r1, r2, y);
  }
  
  /**
   * Calculate the gradient (slope) of a terrain at a point
   */
  export function calculateGradient(heightMap, width, x, z) {
    const idx = z * width + x;
    const h = heightMap[idx];
    
    // Get heights of neighboring points
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
   */
  export function calculateNormal(heightMap, width, depth, x, z) {
    const idx = z * width + x;
    
    // Get heights of neighboring points
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