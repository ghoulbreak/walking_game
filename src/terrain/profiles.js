// src/terrain/profiles.js
// Terrain profile system for different mountain range types

// Define terrain profiles
export const TerrainProfiles = {
    // Appalachian Mountains - older, more weathered, rounded mountains
    appalachian: {
      name: "Appalachian Mountains",
      description: "Older, weathered mountains with rounded tops and dense forests",
      params: {
        octaves: 5,
        persistence: 0.4,
        lacunarity: 1.9,
        initialFrequency: 0.8,
        ridge: 0.7,
        exponent: 1.8,
        heightScale: 90,
        smoothingPasses: 2
      }
    },
    
    // Rocky Mountains - more dramatic, jagged peaks with higher elevation
    rocky: {
      name: "Rocky Mountains",
      description: "Younger, more dramatic mountains with higher peaks and rugged terrain",
      params: {
        octaves: 7,
        persistence: 0.5,
        lacunarity: 2.1,
        initialFrequency: 1.0,
        ridge: 0.85,
        exponent: 2.2,
        heightScale: 130,
        smoothingPasses: 0
      }
    },
    
    // Sierra Nevada - steep on one side, gradual on the other with high granite formations
    sierra: {
      name: "Sierra Nevada",
      description: "Asymmetrical range with steep eastern slopes and granite formations",
      params: {
        octaves: 8,
        persistence: 0.55,
        lacunarity: 2.3,
        initialFrequency: 1.1,
        ridge: 0.9,
        exponent: 2.3,
        heightScale: 150,
        smoothingPasses: 0,
        asymmetry: 0.6
      }
    },
    
    // Rolling Hills - gentle terrain with minimal peaks
    hills: {
      name: "Rolling Hills",
      description: "Gentle, rolling terrain with minimal elevation changes",
      params: {
        octaves: 4,
        persistence: 0.35,
        lacunarity: 1.6,
        initialFrequency: 0.7,
        ridge: 0.5,
        exponent: 1.4,
        heightScale: 40,
        smoothingPasses: 3
      }
    },
    
    // Original settings for backward compatibility
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
  
  // Default profile to use
  export const defaultProfile = "appalachian";
  
  // Get a profile by name
  export function getProfile(profileName) {
    if (TerrainProfiles[profileName]) {
      return TerrainProfiles[profileName];
    }
    
    return TerrainProfiles[defaultProfile];
  }
  
  // Blend between two profiles with a weight factor (0-1)
  export function blendProfiles(profile1Name, profile2Name, blendFactor = 0.5) {
    const profile1 = getProfile(profile1Name).params;
    const profile2 = getProfile(profile2Name).params;
    
    // Clamp blend factor
    const factor = Math.max(0, Math.min(1, blendFactor));
    
    // Linear interpolation between parameter values
    const blendedParams = {};
    
    // Blend parameters from both profiles
    const allKeys = new Set([...Object.keys(profile1), ...Object.keys(profile2)]);
    
    for (const key of allKeys) {
      if (profile1[key] !== undefined && profile2[key] !== undefined) {
        blendedParams[key] = profile1[key] * (1 - factor) + profile2[key] * factor;
      } else if (profile1[key] !== undefined) {
        blendedParams[key] = profile1[key];
      } else {
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