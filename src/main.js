// src/main.js
// Entry point for the application

import { App } from './core/App.js';

/**
 * Initialize the application when the DOM content is loaded
 */
document.addEventListener('DOMContentLoaded', async () => {
  console.log("DOM Content Loaded - Starting application initialization");
  
  try {
    // Dynamically import the App class
    const { App } = await import('./core/App.js');
    
    // Create and initialize the application
    const app = new App();
    console.log("App instance created");
    
    // Force hide any existing loading screen
    const existingLoadingScreen = document.getElementById('loading-screen');
    if (existingLoadingScreen) {
      console.log("Found existing loading screen, removing it");
      existingLoadingScreen.style.display = 'flex'; // Make sure it's visible first for the progress updates
    }
    
    // Initialize all systems
    console.log("Starting app initialization");
    await app.initialize();
    
    // Start the application
    console.log("App initialized, starting game loop");
    app.start();
    
    // Store the app instance globally for debugging
    window.app = app;
    
    // Final force removal of loading screen
    const finalCheck = document.getElementById('loading-screen');
    if (finalCheck && finalCheck.parentNode) {
      console.log("Final removal of loading screen");
      finalCheck.parentNode.removeChild(finalCheck);
    }
  } catch (error) {
    console.error('Error initializing application:', error);
    
    // Display error to user
    const errorDiv = document.createElement('div');
    errorDiv.style.position = 'fixed';
    errorDiv.style.top = '50%';
    errorDiv.style.left = '50%';
    errorDiv.style.transform = 'translate(-50%, -50%)';
    errorDiv.style.backgroundColor = 'rgba(255, 0, 0, 0.8)';
    errorDiv.style.color = 'white';
    errorDiv.style.padding = '20px';
    errorDiv.style.borderRadius = '5px';
    errorDiv.style.zIndex = '1000';
    errorDiv.innerHTML = `
      <h2>Error initializing application</h2>
      <p>${error.message}</p>
      <pre>${error.stack}</pre>
      <button id="restart-button" style="padding: 10px; margin-top: 15px; cursor: pointer;">
        Restart Application
      </button>
    `;
    document.body.appendChild(errorDiv);
    
    // Add restart functionality
    document.getElementById('restart-button').addEventListener('click', () => {
      location.reload();
    });
  }
});