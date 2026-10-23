// Bike-M Realistic MTB Trail Simulation Mode - By Michael NB-γ

class SimulationManager {
  constructor() {
    this.isRunning = false;
    this.timerId = null;
    this.currentIndex = 0;
    this.trailPoints = this.generateRealisticTrailData();
  }

  // Pre-generate a mountain singletrack loop with realistic coordinates, elevation profile and speed variations
  generateRealisticTrailData() {
    const baseLat = -33.3650;
    const baseLon = -70.5180;
    const baseEle = 840; // meters

    const points = [];
    const totalSteps = 160;

    for (let i = 0; i < totalSteps; i++) {
      const progress = i / totalSteps;
      const angle = progress * Math.PI * 2;

      // Elliptical mountain singletrack loop with micro-twists
      const radiusLat = 0.006 + 0.0015 * Math.sin(progress * 8);
      const radiusLon = 0.009 + 0.002 * Math.cos(progress * 6);

      const lat = baseLat + Math.sin(angle) * radiusLat;
      const lon = baseLon + Math.cos(angle) * radiusLon;

      // Elevation: climb during first half, descent and rolling hills during second half
      let ele = baseEle;
      if (progress < 0.5) {
        // Sustained climb +110m with slight dips
        ele = baseEle + Math.sin(progress * Math.PI) * 110 + (Math.sin(progress * 20) * 3);
      } else {
        // Downhill technical trail with undulations
        const downhillRatio = (progress - 0.5) * 2;
        ele = (baseEle + 110) - (downhillRatio * 110) + (Math.sin(downhillRatio * 12) * 4);
      }

      points.push({
        latitude: lat,
        longitude: lon,
        altitude: parseFloat(ele.toFixed(1)),
        accuracy: 4.2 + (Math.random() * 1.5) // high precision GPS
      });
    }

    return points;
  }

  toggleDemo() {
    if (this.isRunning) {
      this.stopDemo();
    } else {
      this.startDemo();
    }
  }

  startDemo() {
    if (this.isRunning) return;

    // If ciclocomputador is in standby, auto-start the session
    if (!window.BikeM_Telemetry.isActive) {
      window.BikeM_App.startRoute();
    } else if (window.BikeM_Telemetry.isPaused) {
      window.BikeM_App.resumeRoute();
    }

    this.isRunning = true;
    this.updateDemoUI(true);

    if (window.BikeM_App) {
      window.BikeM_App.showToast('🚀 Modo Simulación MTB Activo');
    }

    this.timerId = setInterval(() => {
      if (!this.isRunning) return;

      const pt = this.trailPoints[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.trailPoints.length;

      // Inject simulated position into application pipeline
      window.BikeM_App.handleNewPosition({
        coords: {
          latitude: pt.latitude,
          longitude: pt.longitude,
          altitude: pt.altitude,
          accuracy: pt.accuracy
        },
        timestamp: Date.now()
      });
    }, 1000);
  }

  stopDemo() {
    this.isRunning = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.updateDemoUI(false);
    if (window.BikeM_App) {
      window.BikeM_App.showToast('⏹️ Simulación Detenida');
    }
  }

  updateDemoUI(active) {
    const btn = document.getElementById('btn-toggle-demo');
    const badge = document.getElementById('demo-active-badge');

    if (btn) {
      if (active) {
        btn.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-orange-400 animate-ping"></span> Detener Demo`;
        btn.classList.add('bg-orange-500/20', 'text-orange-400', 'border-orange-500/50');
        btn.classList.remove('bg-gray-900', 'text-gray-300', 'border-gray-800');
      } else {
        btn.innerHTML = `🎮 Simular Ruta (Demo)`;
        btn.classList.remove('bg-orange-500/20', 'text-orange-400', 'border-orange-500/50');
        btn.classList.add('bg-gray-900', 'text-gray-300', 'border-gray-800');
      }
    }

    if (badge) {
      if (active) badge.classList.remove('hidden');
      else badge.classList.add('hidden');
    }
  }
}

window.BikeM_Simulation = new SimulationManager();
