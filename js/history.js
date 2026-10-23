// Bike-M Route History, GPX Exporter & Canvas Sports Story Generator - By Michael NB-γ

// Canvas roundRect polyfill for maximum Android compatibility
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r = 10) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    this.beginPath();
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
  };
}

class HistoryManager {
  constructor() {
    this.currentViewingRoute = null;
  }

  // Render list of saved routes in Pestaña 5
  async renderRoutesListUI() {
    const container = document.getElementById('history-routes-list');
    if (!container) return;

    const routes = await window.BikeM_DB.getAllRoutes();
    if (routes.length === 0) {
      container.innerHTML = `
        <div class="text-center py-8 text-gray-500 text-xs bg-gray-950/40 rounded-2xl border border-gray-800 p-4">
          <svg class="w-8 h-8 mx-auto text-gray-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>
          No hay rutas guardadas aún. Inicia y finaliza una ruta en el Ciclocomputador para ver tu bitácora deportiva aquí.
        </div>
      `;
      return;
    }

    let html = '';
    for (const r of routes) {
      const dateStr = new Date(r.timestamp).toLocaleDateString('es-ES', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      html += `
        <div class="bg-[#0D121F] border border-gray-800 hover:border-gray-700 rounded-2xl p-4 transition-all">
          <div class="flex items-start justify-between gap-2 mb-2">
            <div>
              <h4 class="text-sm font-bold text-white">${r.name || 'Salida MTB'}</h4>
              <span class="text-[11px] text-gray-400">${dateStr}</span>
            </div>
            <div class="flex items-center gap-1.5">
              <button onclick="window.BikeM_History.downloadGPX('${r.id}')" class="text-xs font-semibold px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 rounded-lg flex items-center gap-1" title="Exportar GPX">
                <svg class="w-3.5 h-3.5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                GPX
              </button>
              <button onclick="window.BikeM_History.openSportsCardModal('${r.id}')" class="text-xs font-semibold px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 rounded-lg flex items-center gap-1" title="Generar Tarjeta Gráfica">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                Tarjeta
              </button>
              <button onclick="window.BikeM_History.deleteRoute('${r.id}')" class="text-gray-500 hover:text-red-400 p-1" title="Eliminar ruta">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>
          </div>

          <!-- Stats 4-col Grid -->
          <div class="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-gray-800/80 text-center">
            <div class="bg-[#070A12] p-2 rounded-xl border border-gray-900">
              <span class="text-[10px] text-gray-500 uppercase font-medium block">Distancia</span>
              <span class="text-xs sm:text-sm font-extrabold text-orange-400">${r.distanceKm} km</span>
            </div>
            <div class="bg-[#070A12] p-2 rounded-xl border border-gray-900">
              <span class="text-[10px] text-gray-500 uppercase font-medium block">Tiempo</span>
              <span class="text-xs sm:text-sm font-extrabold text-emerald-400">${r.movingTimeFormatted}</span>
            </div>
            <div class="bg-[#070A12] p-2 rounded-xl border border-gray-900">
              <span class="text-[10px] text-gray-500 uppercase font-medium block">Desnivel</span>
              <span class="text-xs sm:text-sm font-extrabold text-white">+${r.elevationGainMeters}m</span>
            </div>
            <div class="bg-[#070A12] p-2 rounded-xl border border-gray-900">
              <span class="text-[10px] text-gray-500 uppercase font-medium block">Calorías</span>
              <span class="text-xs sm:text-sm font-extrabold text-amber-400">${r.caloriesKcal} kcal</span>
            </div>
          </div>

          <!-- Secondary stats row -->
          <div class="flex items-center justify-between text-[11px] text-gray-400 mt-2 px-1">
            <span>Vel. Media: <strong class="text-gray-200">${r.avgSpeedKmH} km/h</strong></span>
            <span>Vel. Máx: <strong class="text-gray-200">${r.maxSpeedKmH} km/h</strong></span>
            <span>Puntos GPS: <strong class="text-gray-200">${r.trackPoints ? r.trackPoints.length : 0}</strong></span>
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  }

  async deleteRoute(id) {
    if (confirm('¿Deseas eliminar permanentemente esta ruta del historial?')) {
      await window.BikeM_DB.deleteRoute(id);
      this.renderRoutesListUI();
      if (window.BikeM_App) {
        window.BikeM_App.showToast('Ruta eliminada');
      }
    }
  }

  // Generate & Download standard GPX XML file
  async downloadGPX(routeId) {
    const route = await window.BikeM_DB.getRouteById(routeId);
    if (!route || !route.trackPoints || route.trackPoints.length === 0) {
      alert('La ruta seleccionada no contiene puntos GPS grabados.');
      return;
    }

    const gpxContent = this.generateGPXString(route);
    const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bikem-track-${route.timestamp}.gpx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  generateGPXString(route) {
    const pts = route.trackPoints || [];
    let trkpts = '';
    for (const pt of pts) {
      trkpts += `      <trkpt lat="${pt.lat}" lon="${pt.lon}">\n`;
      if (pt.ele !== undefined && pt.ele !== null) {
        trkpts += `        <ele>${pt.ele.toFixed(1)}</ele>\n`;
      }
      if (pt.time) {
        trkpts += `        <time>${pt.time}</time>\n`;
      }
      trkpts += `      </trkpt>\n`;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Bike-M PWA - By Michael NB-γ" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${route.name || 'MTB Route'}</name>
    <desc>Track grabado con Bike-M PWA Telemetry By Michael NB-γ</desc>
    <time>${new Date(route.timestamp).toISOString()}</time>
  </metadata>
  <trk>
    <name>${route.name || 'MTB Route'}</name>
    <trkseg>
${trkpts}    </trkseg>
  </trk>
</gpx>`;
  }

  // -------------------------------------------------------------
  // Generate Sports Card Canvas Image (High-Resolution 1080x1350)
  // Contains Route Telemetry, Rider & Bike from Garage, and "By Michael NB-γ"
  // -------------------------------------------------------------
  async openSportsCardModal(routeId) {
    const route = await window.BikeM_DB.getRouteById(routeId);
    if (!route) return;

    this.currentViewingRoute = route;
    const modal = document.getElementById('modal-sports-card');
    const canvas = document.getElementById('sports-card-canvas');
    if (!modal || !canvas) return;

    modal.classList.remove('hidden');
    this.renderSportsCardOnCanvas(canvas, route);
  }

  renderSportsCardOnCanvas(canvas, route) {
    const ctx = canvas.getContext('2d');
    const width = 1080;
    const height = 1350;
    canvas.width = width;
    canvas.height = height;

    // Retrieve garage info
    let garage = {
      riderName: 'Michael XC Rider',
      bikeModel: 'Specialized Epic EVO Pro',
      fork: 'RockShox SID 120mm',
      drivetrain: 'SRAM GX Eagle 1x12'
    };
    try {
      const g = localStorage.getItem('bike_garage');
      if (g) garage = Object.assign(garage, JSON.parse(g));
    } catch (e) {}

    // 1. OLED Pure Black Background
    ctx.fillStyle = '#070A12';
    ctx.fillRect(0, 0, width, height);

    // Carbon / Cyber Subtle Gradient Grid
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#0F172A');
    grad.addColorStop(0.5, '#070A12');
    grad.addColorStop(1, '#05070B');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Subtle sports neon corner borders
    ctx.strokeStyle = '#10B981';
    ctx.lineWidth = 6;
    ctx.strokeRect(30, 30, width - 60, height - 60);

    // Glowing corner accents
    ctx.strokeStyle = '#F97316';
    ctx.lineWidth = 10;
    // Top-left corner
    ctx.beginPath();
    ctx.moveTo(30, 110);
    ctx.lineTo(30, 30);
    ctx.lineTo(110, 30);
    ctx.stroke();
    // Bottom-right corner
    ctx.beginPath();
    ctx.moveTo(width - 110, height - 30);
    ctx.lineTo(width - 30, height - 30);
    ctx.lineTo(width - 30, height - 110);
    ctx.stroke();

    // 2. Header Branding
    ctx.fillStyle = '#10B981';
    ctx.font = '900 36px "Segoe UI", Roboto, sans-serif';
    ctx.fillText('BIKE-M // MTB TELEMETRY', 70, 100);

    // Date
    const dateFormatted = new Date(route.timestamp).toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    ctx.fillStyle = '#94A3B8';
    ctx.font = '500 24px "Segoe UI", Roboto, sans-serif';
    ctx.fillText(dateFormatted.toUpperCase(), 70, 140);

    // 3. Rider & Bike Garage Strip
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.roundRect(70, 180, width - 140, 110, 20);
    ctx.fill();
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#10B981';
    ctx.font = 'bold 22px "Segoe UI", Roboto, sans-serif';
    ctx.fillText('RIDER & BIKE SETUP', 100, 220);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 30px "Segoe UI", Roboto, sans-serif';
    ctx.fillText(`${garage.riderName}`, 100, 260);

    ctx.fillStyle = '#F97316';
    ctx.font = 'bold 28px "Segoe UI", Roboto, sans-serif';
    const bikeStr = `${garage.bikeModel}  (${garage.drivetrain || ''})`;
    ctx.fillText(bikeStr.length > 32 ? bikeStr.substring(0, 32) + '...' : bikeStr, 440, 260);

    // 4. Primary Huge Metric: DISTANCE
    ctx.fillStyle = '#F97316';
    ctx.font = '900 130px "Segoe UI", Roboto, sans-serif';
    ctx.fillText(`${route.distanceKm}`, 70, 430);

    ctx.fillStyle = '#94A3B8';
    ctx.font = 'bold 44px "Segoe UI", Roboto, sans-serif';
    ctx.fillText('KILÓMETROS', 70, 480);

    // 5. 2x2 Grid of Key Metrics
    const drawStatBox = (x, y, w, h, label, val, unit, color) => {
      ctx.fillStyle = '#0D121F';
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 20);
      ctx.fill();
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#94A3B8';
      ctx.font = 'bold 20px "Segoe UI", Roboto, sans-serif';
      ctx.fillText(label.toUpperCase(), x + 30, y + 45);

      ctx.fillStyle = color;
      ctx.font = '900 52px "Segoe UI", Roboto, sans-serif';
      ctx.fillText(val, x + 30, y + 105);

      ctx.fillStyle = '#64748B';
      ctx.font = 'bold 24px "Segoe UI", Roboto, sans-serif';
      ctx.fillText(unit, x + 30 + ctx.measureText(val).width + 12, y + 105);
    };

    const boxW = 445;
    const boxH = 145;

    // Moving Time
    drawStatBox(70, 520, boxW, boxH, 'Tiempo Pedaleo', route.movingTimeFormatted, '', '#10B981');
    // Elevation Gain
    drawStatBox(565, 520, boxW, boxH, 'Desnivel Positivo', `+${route.elevationGainMeters}`, 'm', '#38BDF8');
    // Average Speed
    drawStatBox(70, 690, boxW, boxH, 'Velocidad Media', `${route.avgSpeedKmH}`, 'km/h', '#F59E0B');
    // Calories
    drawStatBox(565, 690, boxW, boxH, 'Gasto Calórico', `${route.caloriesKcal}`, 'kcal', '#EF4444');

    // 6. Mini Track Elevation / Path Preview Area
    ctx.fillStyle = '#0B0F19';
    ctx.beginPath();
    ctx.roundRect(70, 860, width - 140, 310, 24);
    ctx.fill();
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw Mini GPS Track inside box
    const pts = route.trackPoints || [];
    if (pts.length > 2) {
      let minLat = 999, maxLat = -999, minLon = 999, maxLon = -999;
      for (const p of pts) {
        if (p.lat < minLat) minLat = p.lat;
        if (p.lat > maxLat) maxLat = p.lat;
        if (p.lon < minLon) minLon = p.lon;
        if (p.lon > maxLon) maxLon = p.lon;
      }

      const mapAreaX = 110;
      const mapAreaY = 900;
      const mapAreaW = width - 220;
      const mapAreaH = 230;

      const dLat = (maxLat - minLat) || 0.0001;
      const dLon = (maxLon - minLon) || 0.0001;

      ctx.strokeStyle = '#F97316';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();

      pts.forEach((p, idx) => {
        const nx = (p.lon - minLon) / dLon;
        const ny = 1 - ((p.lat - minLat) / dLat);
        const px = mapAreaX + nx * mapAreaW;
        const py = mapAreaY + ny * mapAreaH;

        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();

      // Start & Finish circles
      const pStart = pts[0];
      const sX = mapAreaX + ((pStart.lon - minLon) / dLon) * mapAreaW;
      const sY = mapAreaY + (1 - (pStart.lat - minLat) / dLat) * mapAreaH;
      ctx.fillStyle = '#10B981';
      ctx.beginPath();
      ctx.arc(sX, sY, 10, 0, Math.PI * 2);
      ctx.fill();

      const pEnd = pts[pts.length - 1];
      const eX = mapAreaX + ((pEnd.lon - minLon) / dLon) * mapAreaW;
      const eY = mapAreaY + (1 - (pEnd.lat - minLat) / dLat) * mapAreaH;
      ctx.fillStyle = '#EF4444';
      ctx.beginPath();
      ctx.arc(eX, eY, 10, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#475569';
      ctx.font = '24px "Segoe UI", Roboto, sans-serif';
      ctx.fillText('Trazado GPS no disponible en esta sesión', 280, 1020);
    }

    // 7. Prominent Required Author Signature Seal: "By Michael NB-γ"
    ctx.fillStyle = '#10B981';
    ctx.beginPath();
    ctx.roundRect(70, 1200, width - 140, 70, 16);
    ctx.fill();

    ctx.fillStyle = '#070A12';
    ctx.font = '900 32px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BIKE-M VERIFIED TELEMETRY • BY MICHAEL NB-γ', width / 2, 1246);
    ctx.textAlign = 'left'; // reset
  }

  downloadCardPNG() {
    const canvas = document.getElementById('sports-card-canvas');
    if (!canvas) return;

    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `bikem-summary-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async shareCard() {
    const canvas = document.getElementById('sports-card-canvas');
    if (!canvas) return;

    if (navigator.share && canvas.toBlob) {
      canvas.toBlob(async (blob) => {
        const file = new File([blob], 'bikem-ride.png', { type: 'image/png' });
        try {
          await navigator.share({
            title: 'Mi Ruta MTB en Bike-M',
            text: '¡Mira las estadísticas de mi salida en bicicleta! By Michael NB-γ',
            files: [file]
          });
        } catch (e) {
          this.downloadCardPNG();
        }
      });
    } else {
      this.downloadCardPNG();
    }
  }

  // -------------------------------------------------------------
  // Full Backup & Restore
  // -------------------------------------------------------------
  async exportJSONBackup() {
    try {
      const json = await window.BikeM_DB.exportFullBackupJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bikem-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Error al generar respaldo JSON: ' + e.message);
    }
  }

  importJSONBackup(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        await window.BikeM_DB.importFullBackupJSON(e.target.result);
        alert('✅ Respaldo restaurado con éxito. Se recargará la aplicación.');
        window.location.reload();
      } catch (err) {
        alert('Error al importar archivo de respaldo: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  // -------------------------------------------------------------
  // Share App with Friends & QR Code
  // -------------------------------------------------------------
  openShareModal() {
    const modal = document.getElementById('modal-share-app');
    const qrContainer = document.getElementById('qrcode-container');
    if (!modal || !qrContainer) return;

    modal.classList.remove('hidden');
    qrContainer.innerHTML = '';

    const currentUrl = window.location.href;
    const urlDisplay = document.getElementById('share-url-text');
    if (urlDisplay) urlDisplay.innerText = currentUrl;

    // Generate QR Code
    if (typeof QRCode !== 'undefined') {
      new QRCode(qrContainer, {
        text: currentUrl,
        width: 180,
        height: 180,
        colorDark: '#070A12',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    }
  }

  shareAppNative() {
    const currentUrl = window.location.href;
    if (navigator.share) {
      navigator.share({
        title: 'Bike-M: Ciclocomputador & Taller MTB',
        text: 'Instala gratis la app Bike-M para telemetría MTB y horómetro de mantenimiento. By Michael NB-γ',
        url: currentUrl
      }).catch(() => {});
    } else {
      // Fallback copy to clipboard
      navigator.clipboard.writeText(currentUrl).then(() => {
        if (window.BikeM_App) {
          window.BikeM_App.showToast('Enlace copiado al portapapeles');
        }
      });
    }
  }
}

window.BikeM_History = new HistoryManager();
