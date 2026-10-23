// Bike-M Main Application Coordinator - By Michael NB-γ
// Screen Wake Lock, Navigation, Geolocation Watcher & UI State Machine

class BikeMApp {
  constructor() {
    this.currentTab = 'ciclocomputador';
    this.wakeLock = null;
    this.geoWatchId = null;
    this.tickIntervalId = null;
    this.deferredInstallPrompt = null;
    this.initialWeatherFetched = false;
  }

  async init() {
    // 1. Initialize DB
    await window.BikeM_DB.initDB();

    // 2. Setup Navigation
    this.setupTabsNavigation();

    // 3. Setup UI Header & Garage
    window.BikeM_Garage.updateHeaderBadge();
    window.BikeM_Garage.populateForm();

    // 4. Setup Workshop UI
    window.BikeM_Workshop.renderWorkshopUI();
    window.BikeM_Workshop.renderWorkshopLogsUI();

    // 5. Setup History UI
    window.BikeM_History.renderRoutesListUI();

    // 6. Setup Leaflet Map (defer slightly for DOM readiness)
    setTimeout(() => {
      window.BikeM_Map.init('map-container');
    }, 200);

    // 7. Start second-by-second telemetry ticker
    this.startTicker();

    // 8. Setup Auto-Pause toggle
    this.setupAutoPauseUI();

    // 9. Setup GPS watcher (standby listening for GPS signal indicator)
    this.startGPSWatcher();

    // 10. Listen for PWA Install Prompt
    this.setupInstallPrompt();

    // 11. Battery status if supported
    this.setupBatteryIndicator();

    // 12. Register Service Worker
    this.registerServiceWorker();

    console.log('Bike-M Initialized Successfully - By Michael NB-γ');
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('[PWA] Service Worker registrado correctamente'))
        .catch((err) => console.warn('[PWA] Error registrando SW:', err));
    }
  }

  setupTabsNavigation() {
    const tabs = ['ciclocomputador', 'mapa', 'taller', 'garaje', 'clima-historial'];

    tabs.forEach((tabId) => {
      const btn = document.getElementById(`nav-${tabId}`);
      if (btn) {
        btn.addEventListener('click', () => this.switchTab(tabId));
      }
    });
  }

  switchTab(tabId) {
    this.currentTab = tabId;

    // Hide all tab panels
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.classList.add('hidden');
    });

    // Show active tab panel
    const activePanel = document.getElementById(`panel-${tabId}`);
    if (activePanel) {
      activePanel.classList.remove('hidden');
    }

    // Update bottom nav button active states
    const tabs = ['ciclocomputador', 'mapa', 'taller', 'garaje', 'clima-historial'];
    tabs.forEach((id) => {
      const btn = document.getElementById(`nav-${id}`);
      if (btn) {
        if (id === tabId) {
          btn.classList.add('text-emerald-400');
          btn.classList.remove('text-gray-500');
          const dot = btn.querySelector('.active-dot');
          if (dot) dot.classList.remove('opacity-0');
        } else {
          btn.classList.remove('text-emerald-400');
          btn.classList.add('text-gray-500');
          const dot = btn.querySelector('.active-dot');
          if (dot) dot.classList.add('opacity-0');
        }
      }
    });

    // Handle tab-specific activations
    if (tabId === 'mapa') {
      setTimeout(() => {
        if (window.BikeM_Map && window.BikeM_Map.map) {
          window.BikeM_Map.map.invalidateSize();
        }
      }, 100);
    } else if (tabId === 'taller') {
      window.BikeM_Workshop.renderWorkshopUI();
      window.BikeM_Workshop.renderWorkshopLogsUI();
    } else if (tabId === 'garaje') {
      window.BikeM_Garage.populateForm();
    } else if (tabId === 'clima-historial') {
      window.BikeM_History.renderRoutesListUI();
      if (window.BikeM_Telemetry.previousPoint) {
        window.BikeM_Weather.fetchWeather(
          window.BikeM_Telemetry.previousPoint.lat,
          window.BikeM_Telemetry.previousPoint.lon
        );
      } else {
        // Fallback default coordinates if GPS not yet established
        window.BikeM_Weather.fetchWeather(-33.4489, -70.6693);
      }
    }
  }

  // -------------------------------------------------------------
  // Screen Wake Lock API (keeps screen awake during ride)
  // -------------------------------------------------------------
  async requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.updateWakeLockUI(true);

        this.wakeLock.addEventListener('release', () => {
          this.updateWakeLockUI(false);
        });

        // Re-acquire on visibility change if app comes back to foreground
        document.addEventListener('visibilitychange', async () => {
          if (this.wakeLock !== null && document.visibilityState === 'visible' && window.BikeM_Telemetry.isActive) {
            try {
              this.wakeLock = await navigator.wakeLock.request('screen');
              this.updateWakeLockUI(true);
            } catch (e) {}
          }
        });
      } catch (err) {
        console.warn('Wake Lock error:', err);
        this.updateWakeLockUI(false);
      }
    }
  }

  releaseWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release().then(() => {
        this.wakeLock = null;
        this.updateWakeLockUI(false);
      }).catch(() => {});
    }
  }

  updateWakeLockUI(isActive) {
    const badge = document.getElementById('wakelock-status-badge');
    if (badge) {
      if (isActive) {
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  }

  // -------------------------------------------------------------
  // Geolocation & Movement Feed
  // -------------------------------------------------------------
  startGPSWatcher() {
    if (!('geolocation' in navigator)) {
      console.warn('Geolocation not supported');
      this.updateGPSAccuracyUI(null);
      return;
    }

    const options = {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 10000
    };

    this.geoWatchId = navigator.geolocation.watchPosition(
      (position) => {
        this.handleNewPosition(position);
      },
      (error) => {
        console.warn('GPS position error:', error.message);
        this.updateGPSAccuracyUI(null);
      },
      options
    );
  }

  handleNewPosition(position) {
    const coords = position.coords;
    const accuracy = coords.accuracy;

    this.updateGPSAccuracyUI(accuracy);

    // Initial weather fetch on first real fix
    if (!this.initialWeatherFetched && coords.latitude && coords.longitude) {
      this.initialWeatherFetched = true;
      window.BikeM_Weather.fetchWeather(coords.latitude, coords.longitude);
    }

    // Process through telemetry if route is active
    if (window.BikeM_Telemetry.isActive) {
      const snap = window.BikeM_Telemetry.processGPSPosition(coords, position.timestamp);
      if (snap) {
        this.renderTelemetrySnapshot(snap);
      }

      // Feed Map
      if (window.BikeM_Map) {
        window.BikeM_Map.updateRiderPosition(coords.latitude, coords.longitude, accuracy);
      }
    } else {
      // In standby: just update rider marker position without tracking
      if (window.BikeM_Map && window.BikeM_Map.riderMarker) {
        window.BikeM_Map.riderMarker.setLatLng([coords.latitude, coords.longitude]);
      }
    }
  }

  updateGPSAccuracyUI(accuracy) {
    const el = document.getElementById('header-gps-badge');
    if (!el) return;

    if (accuracy === null || accuracy === undefined) {
      el.className = 'text-[10px] font-bold px-2 py-0.5 rounded bg-gray-900 text-gray-500 border border-gray-800';
      el.innerText = 'GPS: Standby';
    } else if (accuracy <= 10) {
      el.className = 'text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-500/40';
      el.innerText = `GPS: ±${Math.round(accuracy)}m`;
    } else if (accuracy <= 25) {
      el.className = 'text-[10px] font-bold px-2 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-500/40';
      el.innerText = `GPS: ±${Math.round(accuracy)}m`;
    } else {
      el.className = 'text-[10px] font-bold px-2 py-0.5 rounded bg-red-950/80 text-red-400 border border-red-500/60';
      el.innerText = `GPS Débil (±${Math.round(accuracy)}m)`;
    }
  }

  // -------------------------------------------------------------
  // Telemetry Second Ticker
  // -------------------------------------------------------------
  startTicker() {
    this.tickIntervalId = setInterval(() => {
      if (window.BikeM_Telemetry.isActive) {
        window.BikeM_Telemetry.tickSecond();
        const snap = window.BikeM_Telemetry.getSnapshot();
        this.renderTelemetrySnapshot(snap);
      }
    }, 1000);
  }

  renderTelemetrySnapshot(snap) {
    // 1. Current Instant Speed (Huge number)
    const speedEl = document.getElementById('telemetry-speed-giant');
    if (speedEl) speedEl.innerText = snap.currentSpeedKmH;

    // 2. Metrics Grid
    const setInner = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.innerText = val;
    };

    setInner('metric-time', snap.movingTimeFormatted);
    setInner('metric-dist', `${snap.distanceKm} km`);
    setInner('metric-avg-speed', `${snap.avgSpeedKmH} km/h`);
    setInner('metric-max-speed', `${snap.maxSpeedKmH} km/h`);
    setInner('metric-altitude', `${snap.altitudeMeters} m`);
    setInner('metric-elevation', `+${snap.elevationGainMeters} m`);
    setInner('metric-slope', `${snap.slopePercent}%`);
    setInner('metric-calories', `${snap.caloriesKcal} kcal`);

    // Auto-Pause alert badge
    const autoPauseBadge = document.getElementById('auto-pause-indicator');
    if (autoPauseBadge) {
      if (snap.isAutoPaused) {
        autoPauseBadge.classList.remove('hidden');
      } else {
        autoPauseBadge.classList.add('hidden');
      }
    }
  }

  // -------------------------------------------------------------
  // Session Controls (Start, Pause, Resume, Finish)
  // -------------------------------------------------------------
  startRoute() {
    window.BikeM_Telemetry.startSession();
    this.requestWakeLock();
    if (window.BikeM_Map) {
      window.BikeM_Map.clearTrack();
    }

    // Toggle Button Panels: Standby -> Active
    document.getElementById('standby-control-panel').classList.add('hidden');
    document.getElementById('active-control-panel').classList.remove('hidden');

    this.showToast('🚀 Ruta Iniciada. ¡A rodar!');
  }

  pauseRoute() {
    window.BikeM_Telemetry.pauseSession();
    const btn = document.getElementById('btn-pause-route');
    if (btn) {
      btn.innerHTML = `
        <svg class="w-6 h-6 text-black" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        <span>REANUDAR</span>
      `;
      btn.classList.remove('bg-amber-500', 'hover:bg-amber-400');
      btn.classList.add('bg-emerald-500', 'hover:bg-emerald-400');
    }
    this.showToast('⏸️ Ruta en Pausa');
  }

  resumeRoute() {
    window.BikeM_Telemetry.resumeSession();
    const btn = document.getElementById('btn-pause-route');
    if (btn) {
      btn.innerHTML = `
        <svg class="w-6 h-6 text-black" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
        <span>PAUSAR</span>
      `;
      btn.classList.add('bg-amber-500', 'hover:bg-amber-400');
      btn.classList.remove('bg-emerald-500', 'hover:bg-emerald-400');
    }
    this.showToast('▶️ Ruta Reanudada');
  }

  togglePauseResume() {
    if (window.BikeM_Telemetry.isPaused) {
      this.resumeRoute();
    } else {
      this.pauseRoute();
    }
  }

  openFinishRouteModal() {
    const snap = window.BikeM_Telemetry.getSnapshot();
    const modal = document.getElementById('modal-finish-route');
    if (!modal) return;

    // Fill summary in modal
    const setInner = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.innerText = val;
    };

    setInner('finish-modal-dist', `${snap.distanceKm} km`);
    setInner('finish-modal-time', snap.movingTimeFormatted);
    setInner('finish-modal-ele', `+${snap.elevationGainMeters} m`);
    setInner('finish-modal-kcal', `${snap.caloriesKcal} kcal`);

    const inputName = document.getElementById('finish-modal-route-name');
    if (inputName) {
      const today = new Date().toLocaleDateString('es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      inputName.value = `Sendero MTB ${today}`;
    }

    modal.classList.remove('hidden');
  }

  closeFinishRouteModal() {
    const modal = document.getElementById('modal-finish-route');
    if (modal) modal.classList.add('hidden');
  }

  async confirmSaveRoute() {
    const snap = window.BikeM_Telemetry.getSnapshot();
    const inputName = document.getElementById('finish-modal-route-name');
    const routeName = inputName && inputName.value.trim() ? inputName.value.trim() : 'Ruta MTB';

    const routeRecord = {
      id: 'route_' + Date.now(),
      name: routeName,
      timestamp: Date.now(),
      distanceKm: snap.distanceKm,
      movingTimeFormatted: snap.movingTimeFormatted,
      movingTimeSeconds: snap.movingTimeSeconds,
      avgSpeedKmH: snap.avgSpeedKmH,
      maxSpeedKmH: snap.maxSpeedKmH,
      elevationGainMeters: snap.elevationGainMeters,
      caloriesKcal: snap.caloriesKcal,
      trackPoints: [...window.BikeM_Telemetry.trackPoints]
    };

    // 1. Save to Routes IndexedDB
    await window.BikeM_DB.saveRoute(routeRecord);

    // 2. Synchronize automatically to Workshop Master Odometer & Component Meters!
    window.BikeM_Workshop.syncFinishedRoute(
      snap.movingTimeSeconds,
      snap.distanceKm,
      snap.elevationGainMeters
    );

    // 3. Stop simulation if active
    if (window.BikeM_Simulation.isRunning) {
      window.BikeM_Simulation.stopDemo();
    }

    // 4. Release WakeLock
    this.releaseWakeLock();

    // 5. Reset Telemetry Engine
    window.BikeM_Telemetry.reset();

    // 6. Reset UI to Standby
    this.closeFinishRouteModal();
    document.getElementById('standby-control-panel').classList.remove('hidden');
    document.getElementById('active-control-panel').classList.add('hidden');

    // Reset big speed
    const speedEl = document.getElementById('telemetry-speed-giant');
    if (speedEl) speedEl.innerText = '0.0';
    this.renderTelemetrySnapshot(window.BikeM_Telemetry.getSnapshot());

    // Refresh history
    window.BikeM_History.renderRoutesListUI();

    this.showToast('✅ ¡Ruta guardada y sincronizada con el Taller!');

    // Offer to view summary card
    setTimeout(() => {
      window.BikeM_History.openSportsCardModal(routeRecord.id);
    }, 600);
  }

  // -------------------------------------------------------------
  // Auto-Pause UI Setup
  // -------------------------------------------------------------
  setupAutoPauseUI() {
    const chk = document.getElementById('toggle-autopause');
    if (chk) {
      chk.checked = window.BikeM_Telemetry.autoPauseEnabled;
      chk.addEventListener('change', () => {
        window.BikeM_Telemetry.autoPauseEnabled = chk.checked;
        this.showToast(chk.checked ? 'Auto-Pausa activada (< 2.5 km/h)' : 'Auto-Pausa desactivada');
      });
    }
  }

  // -------------------------------------------------------------
  // PWA Install Prompt Banner
  // -------------------------------------------------------------
  setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e;
      const banner = document.getElementById('pwa-install-banner');
      if (banner) banner.classList.remove('hidden');
    });

    const btnInstall = document.getElementById('btn-pwa-install');
    if (btnInstall) {
      btnInstall.addEventListener('click', async () => {
        if (this.deferredInstallPrompt) {
          this.deferredInstallPrompt.prompt();
          const { outcome } = await this.deferredInstallPrompt.userChoice;
          console.log('[PWA] User response to install:', outcome);
          this.deferredInstallPrompt = null;
          const banner = document.getElementById('pwa-install-banner');
          if (banner) banner.classList.add('hidden');
        }
      });
    }
  }

  // -------------------------------------------------------------
  // Battery API (shows live phone battery in header)
  // -------------------------------------------------------------
  setupBatteryIndicator() {
    const el = document.getElementById('header-battery-badge');
    if (!el) return;

    if ('getBattery' in navigator) {
      navigator.getBattery().then((battery) => {
        const updateBat = () => {
          const lvl = Math.round(battery.level * 100);
          const isCharging = battery.charging;
          el.innerText = `🔋 ${lvl}%${isCharging ? ' ⚡' : ''}`;
        };
        updateBat();
        battery.addEventListener('levelchange', updateBat);
        battery.addEventListener('chargingchange', updateBat);
      }).catch(() => {
        el.classList.add('hidden');
      });
    } else {
      el.classList.add('hidden');
    }
  }

  // -------------------------------------------------------------
  // Global Toast Notifications
  // -------------------------------------------------------------
  showToast(message, duration = 3000) {
    const toast = document.getElementById('global-toast');
    const toastMsg = document.getElementById('toast-message');
    if (!toast || !toastMsg) return;

    toastMsg.innerText = message;
    toast.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-4');
    toast.classList.add('opacity-100', 'translate-y-0');

    setTimeout(() => {
      toast.classList.add('opacity-0', 'pointer-events-none', 'translate-y-4');
      toast.classList.remove('opacity-100', 'translate-y-0');
    }, duration);
  }
}

window.BikeM_App = new BikeMApp();

// Boot application upon DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.BikeM_App.init();
});
