// src/main.js
// Entry point for the application

import { App } from './core/App.js';

/**
 * Initialize the application when the DOM content is loaded
 */
window.addEventListener('DOMContentLoaded', async () => {
  // Create and initialize the application
  const app = new App();
  
  try {
    // Initialize all systems
    await app.initialize();
    
    // Start the application
    app.start();
    
    // Store the app instance globally for debugging
    window.app = app;
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
    `;
    document.body.appendChild(errorDiv);
  }
});