// Bike-M MTB Telemetry Engine - By Michael NB-γ
// Mathematical formulas: Haversine, Moving Average Speed, Elevation Hysteresis, MTB Caloric Model

class TelemetryEngine {
  constructor() {
    this.reset();
  }

  reset() {
    this.isActive = false;
    this.isPaused = false;
    this.isAutoPaused = false;
    this.autoPauseEnabled = true;

    // Timing
    this.startTime = null;
    this.effectiveMovingSeconds = 0;
    this.lastTickTime = null;

    // Movement & Distance
    this.totalDistanceMeters = 0;
    this.previousPoint = null; // { lat, lon, alt, time, accuracy }
    this.recentSpeeds = []; // sliding window for 3-sample moving average
    this.currentSpeedKmH = 0.0;
    this.maxSpeedKmH = 0.0;

    // Elevation & Slope
    this.currentAltitude = 0;
    this.currentSlope = 0.0;
    this.recentSlopes = [];
    this.climbHysteresisBuffer = 0.0;
    this.totalElevationGainMeters = 0.0;

    // Calories
    this.totalCaloriesKcal = 0.0;

    // Track points for saving / GPX
    this.trackPoints = []; // [{ lat, lon, ele, time, speed, slope }]
  }

  // Calculate distance between two coordinates using Haversine formula
  static calculateHaversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;
    const phi1 = lat1 * toRad;
    const phi2 = lat2 * toRad;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  // Get total combined system weight (rider + bike + gear) from Garaje or default
  getTotalWeightKg() {
    let riderWeight = 75;
    let bikeWeight = 13.5;
    try {
      const garageData = localStorage.getItem('bike_garage');
      if (garageData) {
        const garage = JSON.parse(garageData);
        if (garage.riderWeight && !isNaN(garage.riderWeight)) {
          riderWeight = parseFloat(garage.riderWeight);
        }
        if (garage.bikeWeight && !isNaN(garage.bikeWeight)) {
          bikeWeight = parseFloat(garage.bikeWeight);
        }
      }
    } catch (e) {}
    // 2.5kg for helmet, shoes, hydration pack, tools
    return riderWeight + bikeWeight + 2.5;
  }

  // Process an incoming raw GPS coordinate
  processGPSPosition(rawCoords, timestamp) {
    if (!this.isActive) return null;

    const now = timestamp || Date.now();
    const lat = rawCoords.latitude;
    const lon = rawCoords.longitude;
    const alt = rawCoords.altitude !== null && !isNaN(rawCoords.altitude) ? rawCoords.altitude : 0;
    const accuracy = rawCoords.accuracy !== null && !isNaN(rawCoords.accuracy) ? rawCoords.accuracy : 5;

    // Discard erratic GPS points where accuracy > 25m
    if (accuracy > 25.0) {
      console.warn(`[Telemetry] GPS Point discarded: accuracy ${accuracy.toFixed(1)}m > 25m`);
      return this.getSnapshot();
    }

    // First GPS point received
    if (!this.previousPoint) {
      this.previousPoint = { lat, lon, alt, time: now, accuracy };
      this.currentAltitude = Math.round(alt);
      this.trackPoints.push({
        lat,
        lon,
        ele: alt,
        time: new Date(now).toISOString(),
        speed: 0,
        slope: 0
      });
      return this.getSnapshot();
    }

    // Delta time in seconds
    const deltaTSeconds = (now - this.previousPoint.time) / 1000;
    if (deltaTSeconds < 0.3) {
      // Discard duplicates or sub-millisecond jitter
      return this.getSnapshot();
    }

    // Delta distance using Haversine
    const deltaDMeters = TelemetryEngine.calculateHaversineMeters(
      this.previousPoint.lat,
      this.previousPoint.lon,
      lat,
      lon
    );

    // Filter out micro-jitter when stopped (< 2.5 meters displacement)
    let rawSpeedKmH = 0.0;
    let validMovement = false;

    if (deltaDMeters >= 2.5) {
      validMovement = true;
      rawSpeedKmH = (deltaDMeters / deltaTSeconds) * 3.6;

      // Realistic MTB speed sanity cap: 95 km/h
      if (rawSpeedKmH > 95.0) {
        console.warn(`[Telemetry] Discarding unrealistic speed spike: ${rawSpeedKmH} km/h`);
        rawSpeedKmH = this.currentSpeedKmH;
      }
    } else {
      rawSpeedKmH = 0.0;
    }

    // 3-sample moving average smoothing
    this.recentSpeeds.push(rawSpeedKmH);
    if (this.recentSpeeds.length > 3) {
      this.recentSpeeds.shift();
    }
    const smoothedSpeed = this.recentSpeeds.reduce((a, b) => a + b, 0) / this.recentSpeeds.length;

    // If smoothed speed < 2.5 km/h, treat as stopped (0.0 km/h)
    if (smoothedSpeed < 2.5) {
      this.currentSpeedKmH = 0.0;
    } else {
      this.currentSpeedKmH = smoothedSpeed;
      if (this.currentSpeedKmH > this.maxSpeedKmH) {
        this.maxSpeedKmH = this.currentSpeedKmH;
      }
    }

    // Auto-pause check
    if (this.autoPauseEnabled) {
      this.isAutoPaused = this.currentSpeedKmH < 2.5;
    } else {
      this.isAutoPaused = false;
    }

    // Update cumulative distance only if moving and not paused
    if (validMovement && !this.isPaused && !this.isAutoPaused) {
      this.totalDistanceMeters += deltaDMeters;
    }

    // Altitude & Instantaneous Slope Calculation
    if (alt !== 0) {
      this.currentAltitude = Math.round(alt);
    }

    const deltaAlt = alt - this.previousPoint.alt;
    let instSlope = 0.0;
    if (deltaDMeters >= 2.5) {
      instSlope = (deltaAlt / deltaDMeters) * 100;
      // Clamp extreme noise
      instSlope = Math.max(-40, Math.min(40, instSlope));
      this.recentSlopes.push(instSlope);
      if (this.recentSlopes.length > 3) this.recentSlopes.shift();
      this.currentSlope = this.recentSlopes.reduce((a, b) => a + b, 0) / this.recentSlopes.length;
    }

    // -------------------------------------------------------------
    // Hysteresis Filter for Cumulative Positive Elevation Gain:
    // Only accumulate vertical gain when continuous vertical gain >= 3m
    // and speed > 2.5 km/h (avoiding vertical GPS noise while stopped).
    // -------------------------------------------------------------
    if (this.currentSpeedKmH >= 2.5 && !this.isPaused) {
      if (deltaAlt > 0) {
        this.climbHysteresisBuffer += deltaAlt;
        if (this.climbHysteresisBuffer >= 3.0) {
          this.totalElevationGainMeters += this.climbHysteresisBuffer;
          this.climbHysteresisBuffer = 0.0;
        }
      } else if (deltaAlt < -1.5) {
        // Clear small positive jitter if rider entered a downhill section
        this.climbHysteresisBuffer = 0.0;
      }
    } else {
      // Stopped or auto-paused: reset buffer to avoid counting stationary GPS noise
      this.climbHysteresisBuffer = 0.0;
    }

    // -------------------------------------------------------------
    // Realistic MTB Calorie Consumption (kcal)
    // Combines total mass, rolling resistance, aero drag and gravity power.
    // -------------------------------------------------------------
    if (this.currentSpeedKmH >= 2.5 && !this.isPaused && !this.isAutoPaused) {
      const totalMass = this.getTotalWeightKg();
      const vMetersSec = this.currentSpeedKmH / 3.6;
      const g = 9.81;

      // Rolling resistance on trail (Crr = 0.011)
      const fRolling = 0.011 * totalMass * g;
      // Aero drag (CdA ~ 0.45 m2, air density 1.2 kg/m3)
      const fAero = 0.5 * 1.2 * 0.45 * Math.pow(vMetersSec, 2);
      // Gravity power (positive slope drastically increases effort)
      const slopeRatio = Math.max(0, this.currentSlope / 100);
      const fGravity = totalMass * g * slopeRatio;

      const pMechWatts = (fRolling + fAero + fGravity) * vMetersSec;
      // Cycling human gross efficiency ~ 23% + basal metabolic cost (~120W)
      const pMetabolicWatts = pMechWatts / 0.23 + 120;

      // Energy in Joules for deltaTSeconds -> convert to kcal (1 kcal = 4184 J)
      const kcalInterval = (pMetabolicWatts * deltaTSeconds) / 4184;
      this.totalCaloriesKcal += Math.max(0, kcalInterval);
    }

    // Save breadcrumb for track / GPX
    if (validMovement || this.trackPoints.length === 0) {
      this.trackPoints.push({
        lat,
        lon,
        ele: alt,
        time: new Date(now).toISOString(),
        speed: this.currentSpeedKmH,
        slope: this.currentSlope
      });
    }

    // Update reference point
    this.previousPoint = { lat, lon, alt, time: now, accuracy };

    return this.getSnapshot();
  }

  // Update timer ticks (called every second by interval loop)
  tickSecond() {
    if (this.isActive && !this.isPaused && !this.isAutoPaused) {
      this.effectiveMovingSeconds += 1;
    }
  }

  startSession() {
    this.reset();
    this.isActive = true;
    this.isPaused = false;
    this.isAutoPaused = false;
    this.startTime = Date.now();
  }

  pauseSession() {
    if (this.isActive) {
      this.isPaused = true;
    }
  }

  resumeSession() {
    if (this.isActive) {
      this.isPaused = false;
    }
  }

  toggleAutoPause() {
    this.autoPauseEnabled = !this.autoPauseEnabled;
    if (!this.autoPauseEnabled) {
      this.isAutoPaused = false;
    }
    return this.autoPauseEnabled;
  }

  // Compute average speed: Total Distance (km) / Effective Moving Time (hours)
  getAverageSpeedKmH() {
    if (this.effectiveMovingSeconds < 2) return 0.0;
    const hours = this.effectiveMovingSeconds / 3600;
    const distanceKm = this.totalDistanceMeters / 1000;
    return distanceKm / hours;
  }

  formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }

  getSnapshot() {
    const distKm = this.totalDistanceMeters / 1000;
    const avgSpeed = this.getAverageSpeedKmH();

    return {
      isActive: this.isActive,
      isPaused: this.isPaused,
      isAutoPaused: this.isAutoPaused,
      autoPauseEnabled: this.autoPauseEnabled,
      movingTimeFormatted: this.formatTime(this.effectiveMovingSeconds),
      movingTimeSeconds: this.effectiveMovingSeconds,
      distanceKm: distKm.toFixed(2),
      distanceMeters: this.totalDistanceMeters,
      currentSpeedKmH: this.currentSpeedKmH.toFixed(1),
      avgSpeedKmH: avgSpeed.toFixed(1),
      maxSpeedKmH: this.maxSpeedKmH.toFixed(1),
      altitudeMeters: Math.round(this.currentAltitude),
      elevationGainMeters: Math.round(this.totalElevationGainMeters),
      slopePercent: this.currentSlope.toFixed(1),
      caloriesKcal: Math.round(this.totalCaloriesKcal),
      trackPointsCount: this.trackPoints.length
    };
  }
}

window.BikeM_Telemetry = new TelemetryEngine();
