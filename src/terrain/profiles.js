// src/terrain/profiles.js
// Terrain profile system for different mountain range types

// Define terrain profiles for different types of mountains
export const TerrainProfiles = {
    // Appalachian Mountains - older, more weathered, rounded mountains
    appalachian: {
      name: "Appalachian Mountains",
      description: "Older, weathered mountains with rounded tops and dense forests",
      params: {
        octaves: 5,              // Fewer octaves for smoother, less detailed terrain
        persistence: 0.4,        // Lower persistence for gentler height variations
        lacunarity: 1.9,         // Slightly lower lacunarity for more stretched out features
        initialFrequency: 0.8,   // Lower initial frequency for larger base features
        ridge: 0.7,              // Lower ridge factor for rounder mountain tops
        exponent: 1.8,           // Gentler exponent for more gradual elevation changes
        heightScale: 90,         // Lower height scale for more weathered mountains
        smoothingPasses: 2       // Apply more smoothing to create weathered appearance
      }
    },
    
    // Rocky Mountains - more dramatic, jagged peaks with higher elevation
    rocky: {
      name: "Rocky Mountains",
      description: "Younger, more dramatic mountains with higher peaks and rugged terrain",
      params: {
        octaves: 7,              // More octaves for sharper details
        persistence: 0.5,        // Higher persistence for more dramatic height variations
        lacunarity: 2.1,         // Higher lacunarity for more varied frequency changes
        initialFrequency: 1.0,   // Standard initial frequency
        ridge: 0.85,             // Moderate ridge factor for defined but not extreme peaks
        exponent: 2.2,           // Higher exponent for more dramatic mountains
        heightScale: 130,        // Higher scale for taller mountains
        smoothingPasses: 0       // No smoothing for rugged appearance
      }
    },
    
    // Sierra Nevada - steep on one side, gradual on the other with high granite formations
    sierra: {
      name: "Sierra Nevada",
      description: "Asymmetrical range with steep eastern slopes and granite formations",
      params: {
        octaves: 8,              // High detail for granite formations
        persistence: 0.55,       // Higher persistence for dramatic terrain
        lacunarity: 2.3,         // Higher variation in frequencies
        initialFrequency: 1.1,   // Slightly higher base frequency
        ridge: 0.9,              // Higher ridge factor for sharper granite peaks
        exponent: 2.3,           // Higher exponent for dramatic elevation changes
        heightScale: 150,        // Taller mountains
        smoothingPasses: 0,      // No smoothing for sharp features
        asymmetry: 0.6           // Asymmetrical east-west slopes (>0.5 means steeper east)
      }
    },
    
    // Rolling Hills - gentle terrain with minimal peaks
    hills: {
      name: "Rolling Hills",
      description: "Gentle, rolling terrain with minimal elevation changes",
      params: {
        octaves: 4,              // Lower detail for smoother hills
        persistence: 0.35,       // Low persistence for gentle height changes
        lacunarity: 1.6,         // Lower lacunarity for stretched out features
        initialFrequency: 0.7,   // Lower frequency for broader features
        ridge: 0.5,              // Low ridge factor for very rounded hilltops
        exponent: 1.4,           // Low exponent for gentler slopes
        heightScale: 40,         // Much lower height scale
        smoothingPasses: 3       // More smoothing for very gentle terrain
      }
    },
    
    // Original settings from the project for reference and backward compatibility
    original: {
      name: "Original Terrain",
      description: "Original terrain settings from the project",
      params: {
        octaves: 9,
        persistence: 0.5,
        lacunarity: 2.1,
        initialFrequency: 1,
        ridge: 0.97,
        exponent: 2.5,
        heightScale: 150,
        smoothingPasses: 0
      }
    }
  };
  
  // Default profile to use if none specified
  export const defaultProfile = "appalachian";
  
  // Helper function to get a profile by name
  export function getProfile(profileName) {
    if (TerrainProfiles[profileName]) {
      return TerrainProfiles[profileName];
    }
    
    console.warn(`Profile "${profileName}" not found, using "${defaultProfile}" instead`);
    return TerrainProfiles[defaultProfile];
  }
  
  // Helper to blend between two profiles with a weight factor (0-1)
  export function blendProfiles(profile1Name, profile2Name, blendFactor = 0.5) {
    const profile1 = getProfile(profile1Name).params;
    const profile2 = getProfile(profile2Name).params;
    
    // Clamp blend factor between 0 and 1
    const factor = Math.max(0, Math.min(1, blendFactor));
    
    // Linear interpolation between parameter values
    const blendedParams = {};
    
    for (const key in profile1) {
      if (profile2.hasOwnProperty(key)) {
        blendedParams[key] = profile1[key] * (1 - factor) + profile2[key] * factor;
      } else {
        blendedParams[key] = profile1[key];
      }
    }
    
    // Add any parameters from profile2 that aren't in profile1
    for (const key in profile2) {
      if (!profile1.hasOwnProperty(key)) {
        blendedParams[key] = profile2[key];
      }
    }
    
    // Return a new profile with blended parameters
    return {
      name: `Blend of ${getProfile(profile1Name).name} and ${getProfile(profile2Name).name}`,
      description: `A ${Math.round(factor * 100)}% blend between two terrain types`,
      params: blendedParams
    };
  }