// src/terrain/terrain-config.js
// A configuration panel to adjust terrain generation parameters

export function createTerrainConfigPanel(terrainManager) {
    // Create the config panel container
    const configPanel = document.createElement('div');
    configPanel.className = 'terrain-config-panel';
    configPanel.innerHTML = `
      <div class="config-header">
        <h3>Terrain Configuration</h3>
        <button id="config-toggle">Hide</button>
      </div>
      <div class="config-content">
        <div class="config-section">
          <h4>Nonlinear Height Scaling</h4>
          <div class="config-control">
            <label for="height-scaling-enabled">
              <input type="checkbox" id="height-scaling-enabled" ${terrainManager.nonlinearScaling.enabled ? 'checked' : ''}>
              Enable nonlinear scaling
            </label>
          </div>
          <div class="config-control">
            <label for="height-exponent">Exponent: <span id="exponent-value">${terrainManager.nonlinearScaling.exponent.toFixed(1)}</span></label>
            <input type="range" id="height-exponent" min="1.0" max="4.0" step="0.1" 
                   value="${terrainManager.nonlinearScaling.exponent}">
            <div class="param-hint">Higher values create more dramatic peaks</div>
          </div>
          <div class="config-control">
            <label for="height-inflection">Inflection: <span id="inflection-value">${terrainManager.nonlinearScaling.inflection.toFixed(1)}</span></label>
            <input type="range" id="height-inflection" min="0.3" max="0.8" step="0.05" 
                   value="${terrainManager.nonlinearScaling.inflection}">
            <div class="param-hint">Point where height scaling accelerates</div>
          </div>
          <div class="config-control">
            <label for="flattening-factor">Flattening: <span id="flattening-value">${terrainManager.nonlinearScaling.flatteningFactor.toFixed(1)}</span></label>
            <input type="range" id="flattening-factor" min="0.2" max="1.0" step="0.05" 
                   value="${terrainManager.nonlinearScaling.flatteningFactor}">
            <div class="param-hint">Lower values create flatter lowlands</div>
          </div>
        </div>
        
        <div class="config-section">
          <h4>Multi-scale Composition</h4>
          <div class="config-scales">
            ${terrainManager.noiseScales.map((scale, index) => `
              <div class="scale-control">
                <h5>Scale ${index + 1}</h5>
                <div class="config-control">
                  <label for="scale-weight-${index}">Weight: <span id="weight-value-${index}">${scale.weight.toFixed(2)}</span></label>
                  <input type="range" id="scale-weight-${index}" min="0.05" max="0.8" step="0.05" 
                         value="${scale.weight}" data-index="${index}" class="scale-weight">
                </div>
              </div>
            `).join('')}
          </div>
          <button id="apply-scales">Apply Scale Weights</button>
          <div class="param-hint">Changing weights affects the balance between large and small features</div>
        </div>
        
        <div class="config-actions">
          <button id="apply-changes">Apply All Changes</button>
          <button id="reset-defaults">Reset Defaults</button>
        </div>
      </div>
    `;
    
    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      .terrain-config-panel {
        position: absolute;
        right: 10px;
        top: 270px;
        width: 300px;
        background: rgba(0, 0, 0, 0.75);
        color: white;
        border-radius: 5px;
        font-family: Arial, sans-serif;
        z-index: 1000;
      }
      .config-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        border-bottom: 1px solid #555;
      }
      .config-header h3 {
        margin: 0;
        font-size: 16px;
      }
      .config-content {
        padding: 10px;
        max-height: 70vh;
        overflow-y: auto;
      }
      .config-section {
        margin-bottom: 16px;
        padding-bottom: 16px;
        border-bottom: 1px solid #444;
      }
      .config-section h4 {
        margin: 0 0 10px 0;
        font-size: 14px;
        color: #aaa;
      }
      .config-control {
        margin-bottom: 10px;
      }
      .config-control label {
        display: block;
        margin-bottom: 5px;
        font-size: 12px;
      }
      .config-control input[type="range"] {
        width: 100%;
        background: #333;
      }
      .scale-control {
        margin-bottom: 12px;
        padding: 8px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 3px;
      }
      .scale-control h5 {
        margin: 0 0 8px 0;
        font-size: 13px;
      }
      .param-hint {
        font-size: 11px;
        color: #aaa;
        font-style: italic;
        margin-top: 3px;
      }
      .config-actions {
        display: flex;
        justify-content: space-between;
      }
      .config-actions button, #apply-scales {
        background: #4CAF50;
        color: white;
        border: none;
        padding: 8px 12px;
        border-radius: 3px;
        cursor: pointer;
        font-size: 12px;
      }
      #reset-defaults {
        background: #f44336;
      }
      #config-toggle {
        background: #555;
        color: white;
        border: none;
        padding: 4px 8px;
        border-radius: 3px;
        cursor: pointer;
        font-size: 12px;
      }
      .config-panel-collapsed .config-content {
        display: none;
      }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(configPanel);
    
    // Set up event listeners
    const heightScalingCheckbox = document.getElementById('height-scaling-enabled');
    const heightExponentSlider = document.getElementById('height-exponent');
    const heightInflectionSlider = document.getElementById('height-inflection');
    const flatteningFactorSlider = document.getElementById('flattening-factor');
    const applyChangesButton = document.getElementById('apply-changes');
    const resetDefaultsButton = document.getElementById('reset-defaults');
    const applyScalesButton = document.getElementById('apply-scales');
    const configToggleButton = document.getElementById('config-toggle');
    
    // Connect value displays to sliders
    heightExponentSlider.addEventListener('input', () => {
      document.getElementById('exponent-value').textContent = parseFloat(heightExponentSlider.value).toFixed(1);
    });
    
    heightInflectionSlider.addEventListener('input', () => {
      document.getElementById('inflection-value').textContent = parseFloat(heightInflectionSlider.value).toFixed(1);
    });
    
    flatteningFactorSlider.addEventListener('input', () => {
      document.getElementById('flattening-value').textContent = parseFloat(flatteningFactorSlider.value).toFixed(1);
    });
    
    // Scale weight sliders
    document.querySelectorAll('.scale-weight').forEach(slider => {
      slider.addEventListener('input', () => {
        const index = parseInt(slider.dataset.index);
        document.getElementById(`weight-value-${index}`).textContent = parseFloat(slider.value).toFixed(2);
      });
    });
    
    // Apply changes button
    applyChangesButton.addEventListener('click', () => {
      // Show loading overlay
      showLoadingOverlay('Applying terrain changes...');
      
      // Apply nonlinear scaling settings
      setTimeout(() => {
        terrainManager.setNonlinearScaling(
          heightScalingCheckbox.checked,
          parseFloat(heightExponentSlider.value),
          parseFloat(heightInflectionSlider.value),
          parseFloat(flatteningFactorSlider.value)
        );
      }, 100);
    });
    
    // Apply scale weights
    applyScalesButton.addEventListener('click', () => {
      showLoadingOverlay('Updating terrain scales...');
      
      setTimeout(() => {
        document.querySelectorAll('.scale-weight').forEach(slider => {
          const index = parseInt(slider.dataset.index);
          terrainManager.noiseScales[index].weight = parseFloat(slider.value);
        });
        
        // Normalize weights
        let totalWeight = 0;
        terrainManager.noiseScales.forEach(scale => {
          totalWeight += scale.weight;
        });
        
        if (totalWeight > 0) {
          terrainManager.noiseScales.forEach(scale => {
            scale.weight /= totalWeight;
          });
        }
        
        terrainManager.regenerateTerrain();
      }, 100);
    });
    
    // Reset defaults
    resetDefaultsButton.addEventListener('click', () => {
      if (confirm('Reset all terrain settings to defaults?')) {
        showLoadingOverlay('Resetting terrain settings...');
        
        setTimeout(() => {
          // Reset nonlinear scaling
          terrainManager.nonlinearScaling = {
            enabled: true,
            exponent: 2.2,
            inflection: 0.6,
            flatteningFactor: 0.7
          };
          
          // Reset noise scales
          terrainManager.noiseScales = [
            { scale: 0.0005, weight: 0.65, octaves: 4 },
            { scale: 0.002, weight: 0.25, octaves: 3 },
            { scale: 0.008, weight: 0.1, octaves: 2 }
          ];
          
          // Update UI
          heightScalingCheckbox.checked = true;
          heightExponentSlider.value = 2.2;
          heightInflectionSlider.value = 0.6;
          flatteningFactorSlider.value = 0.7;
          document.getElementById('exponent-value').textContent = '2.2';
          document.getElementById('inflection-value').textContent = '0.6';
          document.getElementById('flattening-value').textContent = '0.7';
          
          // Update scale weights in UI
          document.querySelectorAll('.scale-weight').forEach(slider => {
            const index = parseInt(slider.dataset.index);
            slider.value = terrainManager.noiseScales[index].weight;
            document.getElementById(`weight-value-${index}`).textContent = 
              terrainManager.noiseScales[index].weight.toFixed(2);
          });
          
          // Regenerate terrain
          terrainManager.regenerateTerrain();
        }, 100);
      }
    });
    
    // Toggle config panel
    configToggleButton.addEventListener('click', () => {
      configPanel.classList.toggle('config-panel-collapsed');
      configToggleButton.textContent = configPanel.classList.contains('config-panel-collapsed') ? 'Show' : 'Hide';
    });
    
    // Helper function to show loading overlay
    function showLoadingOverlay(message) {
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.background = 'rgba(0, 0, 0, 0.7)';
      overlay.style.color = 'white';
      overlay.style.display = 'flex';
      overlay.style.justifyContent = 'center';
      overlay.style.alignItems = 'center';
      overlay.style.zIndex = '2000';
      overlay.innerHTML = `<div>${message}</div>`;
      document.body.appendChild(overlay);
      
      setTimeout(() => {
        document.body.removeChild(overlay);
      }, 1500);
    }
    
    return {
      panel: configPanel,
      toggle: () => {
        configPanel.classList.toggle('config-panel-collapsed');
        configToggleButton.textContent = configPanel.classList.contains('config-panel-collapsed') ? 'Show' : 'Hide';
      }
    };
  }