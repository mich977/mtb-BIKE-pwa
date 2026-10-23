// Bike-M Route Weather & Trail Condition Estimator - By Michael NB-γ
// Integration with Open-Meteo API & Offline Cache

class WeatherManager {
  constructor() {
    this.cachedData = null;
    this.lastCoords = null;
    this.loadCache();
  }

  loadCache() {
    try {
      const stored = localStorage.getItem('bike_weather_cache');
      if (stored) {
        this.cachedData = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Weather cache error:', e);
    }
  }

  saveCache(data) {
    try {
      this.cachedData = data;
      localStorage.setItem('bike_weather_cache', JSON.stringify(data));
    } catch (e) {}
  }

  async fetchWeather(lat, lon) {
    this.lastCoords = { lat, lon };

    if (!navigator.onLine) {
      if (this.cachedData) {
        this.renderWeatherUI(this.cachedData, true);
        return;
      }
      this.renderOfflineNoData();
      return;
    }

    try {
      // Query Open-Meteo with current, hourly, daily and past 2 days precipitation for trail estimator
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,wind_direction_10m,uv_index&hourly=temperature_2m,precipitation_probability,precipitation&daily=sunset,sunrise&past_days=2&forecast_days=2&timezone=auto`;

      const response = await fetch(url);
      if (!response.ok) throw new Error('Error al consultar clima');
      const data = await response.json();
      data._fetchTimestamp = Date.now();
      data._lat = lat;
      data._lon = lon;

      this.saveCache(data);
      this.renderWeatherUI(data, false);
    } catch (err) {
      console.warn('Error fetching weather:', err);
      if (this.cachedData) {
        this.renderWeatherUI(this.cachedData, true);
      } else {
        this.renderOfflineNoData();
      }
    }
  }

  getWindDirectionCompass(degrees) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const idx = Math.round(degrees / 22.5) % 16;
    return directions[idx];
  }

  renderOfflineNoData() {
    const container = document.getElementById('weather-content-container');
    if (!container) return;
    container.innerHTML = `
      <div class="text-center py-8 text-gray-400 bg-gray-950/40 rounded-2xl border border-gray-800 p-4">
        <svg class="w-10 h-10 mx-auto text-amber-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z"/></svg>
        <p class="text-sm font-bold text-white">Sin datos meteorológicos</p>
        <p class="text-xs text-gray-500 mt-1">Conecta a Internet una vez para precargar el pronóstico de la zona.</p>
      </div>
    `;
  }

  renderWeatherUI(data, isFromCache) {
    const container = document.getElementById('weather-content-container');
    if (!container || !data.current) return;

    const cur = data.current;
    const temp = Math.round(cur.temperature_2m);
    const feelsLike = Math.round(cur.apparent_temperature);
    const windSpeed = Math.round(cur.wind_speed_10m);
    const windDir = this.getWindDirectionCompass(cur.wind_direction_10m);
    const humidity = Math.round(cur.relative_humidity_2m);
    const uvIndex = cur.uv_index !== undefined ? cur.uv_index.toFixed(1) : 'N/D';

    // 1. Trail Condition Estimator (Precipitation in past 48 hours)
    let past48hPrecip = 0;
    if (data.hourly && data.hourly.precipitation) {
      // The first 48 hours in response represent past 2 days
      const pastSlice = data.hourly.precipitation.slice(0, 48);
      past48hPrecip = pastSlice.reduce((a, b) => a + (b || 0), 0);
    }

    let trailStatusText = 'Terreno Seco / Compacto';
    let trailSub = 'Polvo fino y grip predecible. Rápido.';
    let trailBadge = 'bg-emerald-950 text-emerald-400 border-emerald-500/40';
    let trailIcon = '☀️';

    if (past48hPrecip > 8.0) {
      trailStatusText = 'Alerta de Barro';
      trailSub = `${past48hPrecip.toFixed(1)}mm en 48h. Raíces resbaladizas y lodo acumulado.`;
      trailBadge = 'bg-red-950 text-red-400 border-red-500/60 animate-pulse';
      trailIcon = '⚠️';
    } else if (past48hPrecip >= 1.0) {
      trailStatusText = 'Terreno Húmedo (Grip Ideal)';
      trailSub = `${past48hPrecip.toFixed(1)}mm en 48h. Tierra negra "hero dirt" con máxima tracción.`;
      trailBadge = 'bg-cyan-950 text-cyan-400 border-cyan-500/50';
      trailIcon = '🌲';
    }

    // 2. Daylight / Sunset Countdown
    let daylightString = 'Cálculo de luz disponible';
    if (data.daily && data.daily.sunset && data.daily.sunset.length > 0) {
      // Find today's sunset
      const todaySunsetIso = data.daily.sunset[data.daily.sunset.length - 1]; // or matching date
      const sunsetDate = new Date(todaySunsetIso);
      const now = new Date();
      const diffMs = sunsetDate.getTime() - now.getTime();

      if (diffMs > 0) {
        const hrs = Math.floor(diffMs / (1000 * 60 * 60));
        const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        daylightString = `Quedan <strong class="text-orange-400 font-bold">${hrs}h ${mins}m</strong> de sol (Ocaso: ${sunsetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
      } else {
        daylightString = `<span class="text-amber-400 font-semibold">Noche cerrada 🌙</span> (Ocaso fue a las ${sunsetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}) - Requiere foco`;
      }
    }

    // 3. Hourly Forecast for Next 6 Hours
    let hourlyHtml = '';
    if (data.hourly && data.hourly.time) {
      const nowIso = new Date().toISOString().slice(0, 13);
      let startIndex = data.hourly.time.findIndex((t) => t.startsWith(nowIso));
      if (startIndex === -1) startIndex = 48; // fallback to start of today

      const next6 = data.hourly.time.slice(startIndex, startIndex + 6);
      for (let i = 0; i < next6.length; i++) {
        const idx = startIndex + i;
        const timeStr = new Date(data.hourly.time[idx]).toLocaleTimeString([], { hour: '2-digit', minute: '00' });
        const hTemp = Math.round(data.hourly.temperature_2m[idx]);
        const hRainProb = data.hourly.precipitation_probability ? data.hourly.precipitation_probability[idx] : 0;

        hourlyHtml += `
          <div class="bg-[#0A0E17] border border-gray-800 rounded-xl p-2.5 flex flex-col items-center justify-between min-w-[70px] text-center">
            <span class="text-[11px] text-gray-400 font-medium">${timeStr}</span>
            <span class="text-base font-extrabold text-white my-1">${hTemp}°</span>
            <div class="flex items-center gap-1 text-[10px] ${hRainProb > 30 ? 'text-cyan-400 font-bold' : 'text-gray-500'}">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"/></svg>
              <span>${hRainProb}%</span>
            </div>
          </div>
        `;
      }
    }

    let cacheBadge = isFromCache
      ? `<span class="text-[10px] font-semibold bg-amber-950/80 text-amber-400 border border-amber-500/40 px-2 py-0.5 rounded-full">Caché Offline</span>`
      : `<span class="text-[10px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded-full">En Vivo GPS</span>`;

    container.innerHTML = `
      <!-- Status & Cache pill -->
      <div class="flex items-center justify-between mb-3">
        <span class="text-xs text-gray-400">Condición Meteo de Ruta</span>
        ${cacheBadge}
      </div>

      <!-- Main Weather Card -->
      <div class="bg-gradient-to-br from-[#0D121F] to-[#080B14] border border-gray-800/80 rounded-2xl p-4 shadow-xl">
        <div class="flex items-center justify-between">
          <div>
            <div class="flex items-baseline gap-2">
              <span class="text-4xl font-extrabold text-white">${temp}°C</span>
              <span class="text-xs text-gray-400">Sensación: <strong class="text-gray-200">${feelsLike}°C</strong></span>
            </div>
            <p class="text-xs text-gray-400 mt-1 flex items-center gap-1">
              <span>Viento: <strong class="text-white">${windSpeed} km/h</strong> (${windDir})</span>
              <span class="text-gray-600">•</span>
              <span>Humedad: <strong class="text-white">${humidity}%</strong></span>
            </p>
          </div>
          <div class="text-right">
            <div class="inline-block px-2.5 py-1 rounded-lg bg-gray-900 border border-gray-800 text-center">
              <span class="text-[10px] text-gray-400 block font-medium">Índice UV</span>
              <span class="text-sm font-black ${uvIndex > 6 ? 'text-red-400' : uvIndex > 3 ? 'text-amber-400' : 'text-emerald-400'}">${uvIndex}</span>
            </div>
          </div>
        </div>

        <!-- Daylight Countdown -->
        <div class="mt-4 pt-3 border-t border-gray-800/60 flex items-center gap-2 text-xs text-gray-300">
          <svg class="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
          <div>${daylightString}</div>
        </div>
      </div>

      <!-- Trail Condition Estimator -->
      <div class="mt-3 bg-[#0D121F] border border-gray-800 rounded-2xl p-4">
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Estado del Sendero (Últimas 48h)</span>
          <span class="text-xs px-2.5 py-0.5 rounded-full border font-bold ${trailBadge}">
            ${trailIcon} ${trailStatusText}
          </span>
        </div>
        <p class="text-xs text-gray-300 mt-1">${trailSub}</p>
      </div>

      <!-- 6-Hour Forecast Horizontal Scroller -->
      <div class="mt-4">
        <h4 class="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">Proyección Próximas 6 Horas</h4>
        <div class="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          ${hourlyHtml}
        </div>
      </div>
    `;
  }
}

window.BikeM_Weather = new WeatherManager();
