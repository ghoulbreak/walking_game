// Draw the scaling function
function drawScalingFunction() {
    const canvas = document.getElementById('scaling-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Draw axes
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    
    // X axis
    ctx.beginPath();
    ctx.moveTo(10, height - 20);
    ctx.lineTo(width - 10, height - 20);
    ctx.stroke();
    
    // Y axis
    ctx.beginPath();
    ctx.moveTo(10, height - 20);
    ctx.lineTo(10, 10);
    ctx.stroke();
    
    // X axis labels
    ctx.fillStyle = '#888';
    ctx.font = '10px Arial';
    ctx.fillText('0', 8, height - 5);
    ctx.fillText('1', width - 15, height - 5);
    ctx.fillText('Input Height', width / 2 - 30, height - 5);
    
    // Y axis label
    ctx.save();
    ctx.translate(5, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Output Height', 0, 0);
    ctx.restore();
    
    // Draw linear reference line (gray)
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(10, height - 20);
    ctx.lineTo(width - 10, 10);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Calculate and draw the nonlinear scaling function
    const { enabled, exponent, inflection, flatteningFactor } = terrainManager.nonlinearScaling;
    
    if (enabled) {
      ctx.strokeStyle = '#4CAF50';
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      // Draw function curve
      const steps = 100;
      for (let i = 0; i <= steps; i++) {
        const normalizedHeight = i / steps;
        let scaledHeight;
        
        if (normalizedHeight < inflection) {
          // Below inflection point - can be flattened
          scaledHeight = normalizedHeight * flatteningFactor / inflection;
        } else {
          // Above inflection point - exaggerate based on exponent
          const t = (normalizedHeight - inflection) / (1.0 - inflection);
          const exaggeration = Math.pow(t, exponent);
          scaledHeight = flatteningFactor + (1.0 - flatteningFactor) * exaggeration;
        }
        
        // Convert to canvas coordinates
        const x = 10 + (width - 20) * normalizedHeight;
        const y = height - 20 - (height - 30) * scaledHeight;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      
      ctx.stroke();
      
      // Draw inflection point
      const inflectionX = 10 + (width - 20) * inflection;
      const inflectionY = height - 20 - (height - 30) * flatteningFactor;
      
      ctx.fillStyle = '#FF5722';
      ctx.beginPath();
      ctx.arc(inflectionX, inflectionY, 4, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw text label for inflection point
      ctx.fillStyle = '#FF5722';
      ctx.font = '10px Arial';
      ctx.fillText('Inflection', inflectionX - 20, inflectionY - 10);
    } else {
      // If disabled, just show linear function
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(10, height - 20);
      ctx.lineTo(width - 10, 10);
      ctx.stroke();
      
      ctx.fillStyle = '#FFD700';
      ctx.font = '12px Arial';
      ctx.fillText('Linear scaling (disabled)', width / 2 - 60, height / 2);
    }
  }
  
  // Initial draw
  drawScalingFunction();
  
  // Update whenever terrain parameters change
  function updateVisualizer() {
    drawScalingFunction();
  }
  
  // Return an interface to control the visualizer
  return {
    container,
    update: updateVisualizer,
    toggle: () => {
      container.classList.toggle('visualizer-collapsed');
      toggleButton.textContent = container.classList.contains('visualizer-collapsed') ? 'Show' : 'Hide';
    }
  };