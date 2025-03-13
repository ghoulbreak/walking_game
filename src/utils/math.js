// src/utils/math.js
// Mathematical utility functions

/**
 * Linear interpolation between two values
 * @param {number} a - Start value
 * @param {number} b - End value
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
 * @param {number} fromMin - Input range minimum
 * @param {number} fromMax - Input range maximum
 * @param {number} toMin - Output range minimum
 * @param {number} toMax - Output range maximum
 * @returns {number} - Remapped value
 */
export function mapRange(value, fromMin, fromMax, toMin, toMax) {
  return toMin + (value - fromMin) * (toMax - toMin) / (fromMax - fromMin);
}

/**
 * Clamp a value between min and max
 * @param {number} value - Input value
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @returns {number} - Clamped value
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Check if a point is within a rectangle
 * @param {number} x - Point X coordinate
 * @param {number} y - Point Y coordinate
 * @param {number} rectX - Rectangle X coordinate
 * @param {number} rectY - Rectangle Y coordinate
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
 * @param {number} x1 - First point X coordinate
 * @param {number} y1 - First point Y coordinate
 * @param {number} x2 - Second point X coordinate
 * @param {number} y2 - Second point Y coordinate
 * @returns {number} - Distance between points
 */
export function distance2D(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate the distance between two 3D points
 * @param {number} x1 - First point X coordinate
 * @param {number} y1 - First point Y coordinate
 * @param {number} z1 - First point Z coordinate
 * @param {number} x2 - Second point X coordinate
 * @param {number} y2 - Second point Y coordinate
 * @param {number} z2 - Second point Z coordinate
 * @returns {number} - Distance between points
 */
export function distance3D(x1, y1, z1, x2, y2, z2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Bilinear interpolation of a value in a 2D grid
 * @param {number} x - X interpolation factor (0-1)
 * @param {number} y - Y interpolation factor (0-1)
 * @param {number} q11 - Value at (0,0)
 * @param {number} q12 - Value at (0,1)
 * @param {number} q21 - Value at (1,0)
 * @param {number} q22 - Value at (1,1)
 * @returns {number} - Interpolated value
 */
export function bilinearInterpolation(x, y, q11, q12, q21, q22) {
  const r1 = lerp(q11, q21, x);
  const r2 = lerp(q12, q22, x);
  return lerp(r1, r2, y);
}

/**
 * Calculate the angle between two 2D vectors
 * @param {number} x1 - First vector X component
 * @param {number} y1 - First vector Y component
 * @param {number} x2 - Second vector X component
 * @param {number} y2 - Second vector Y component
 * @returns {number} - Angle in radians
 */
export function angleBetweenVectors(x1, y1, x2, y2) {
  // Normalize vectors
  const mag1 = Math.sqrt(x1 * x1 + y1 * y1);
  const mag2 = Math.sqrt(x2 * x2 + y2 * y2);
  
  if (mag1 === 0 || mag2 === 0) return 0;
  
  const nx1 = x1 / mag1;
  const ny1 = y1 / mag1;
  const nx2 = x2 / mag2;
  const ny2 = y2 / mag2;
  
  // Dot product
  const dotProduct = nx1 * nx2 + ny1 * ny2;
  
  // Clamp to avoid floating point errors
  return Math.acos(clamp(dotProduct, -1, 1));
}

/**
 * Generate a random number between min and max
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} - Random number in range
 */
export function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Generate a random integer between min and max (inclusive)
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} - Random integer in range
 */
export function randomInt(min, max) {
  return Math.floor(randomRange(min, max + 1));
}

/**
 * Calculate the gradient (slope) of a terrain at a point
 * @param {Float32Array} heightMap - Heightmap data
 * @param {number} width - Width of the heightmap
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @returns {number} - Gradient magnitude
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
 * @param {Float32Array} heightMap - Heightmap data
 * @param {number} width - Width of the heightmap
 * @param {number} depth - Depth of the heightmap
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @returns {Object} - Normal vector with x, y, z components
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