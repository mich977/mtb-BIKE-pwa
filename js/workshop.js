// Bike-M Workshop & Maintenance Hour Meter - By Michael NB-γ
// Master Lifetime Odometer, Component Trackers with Traffic Light, and Workshop Log

class WorkshopManager {
  constructor() {
    this.masterOdometer = {
      totalHours: 0.0, // in hours
      totalKm: 0.0,
      totalElevationGain: 0
    };

    this.components = {
      chain_lube: {
        id: 'chain_lube',
        name: 'Lubricación / Cera de Cadena',
        defaultLimit: 12,
        currentHours: 0.0,
        limitHours: 12,
        icon: 'chain'
      },
      fork_service: {
        id: 'fork_service',
        name: 'Mantenimiento Horquilla (Botellas/Retenes)',
        defaultLimit: 50,
        currentHours: 0.0,
        limitHours: 50,
        icon: 'fork'
      },
      suspension_major: {
        id: 'suspension_major',
        name: 'Servicio Mayor Suspensión / Frenos',
        defaultLimit: 100,
        currentHours: 0.0,
        limitHours: 100,
        icon: 'shock'
      },
      tubeless_sealant: {
        id: 'tubeless_sealant',
        name: 'Recarga Líquido Tubeless (Delantero/Trasero)',
        defaultLimit: 60,
        currentHours: 0.0,
        limitHours: 60,
        icon: 'tire'
      },
      chain_pads_check: {
        id: 'chain_pads_check',
        name: 'Revisión de Cadena y Pastillas de Freno',
        defaultLimit: 80,
        currentHours: 0.0,
        limitHours: 80,
        icon: 'brake'
      }
    };

    this.loadState();
  }

  loadState() {
    try {
      const storedOdo = localStorage.getItem('master_odometer');
      if (storedOdo) {
        this.masterOdometer = Object.assign(this.masterOdometer, JSON.parse(storedOdo));
      }

      const storedComponents = localStorage.getItem('component_meters');
      if (storedComponents) {
        const parsed = JSON.parse(storedComponents);
        for (const key in this.components) {
          if (parsed[key]) {
            this.components[key].currentHours = parseFloat(parsed[key].currentHours) || 0;
            this.components[key].limitHours = parseFloat(parsed[key].limitHours) || this.components[key].defaultLimit;
          }
        }
      }
    } catch (e) {
      console.warn('Error loading workshop state:', e);
    }
  }

  saveState() {
    try {
      localStorage.setItem('master_odometer', JSON.stringify(this.masterOdometer));
      localStorage.setItem('component_meters', JSON.stringify(this.components));
    } catch (e) {
      console.error('Error saving workshop state:', e);
    }
  }

  // Synchronize route data to master odometer and all component meters
  syncFinishedRoute(movingTimeSeconds, distanceKm, elevationGainMeters) {
    const hours = movingTimeSeconds / 3600;

    // Master Odometer update
    this.masterOdometer.totalHours += hours;
    this.masterOdometer.totalKm += parseFloat(distanceKm) || 0;
    this.masterOdometer.totalElevationGain += parseInt(elevationGainMeters, 10) || 0;

    // Component Horometers update
    for (const key in this.components) {
      this.components[key].currentHours += hours;
    }

    this.saveState();
    this.renderWorkshopUI();
  }

  // Update initial master odometer manually
  setMasterOdometer(hours, km, elevation) {
    this.masterOdometer.totalHours = parseFloat(hours) || 0;
    this.masterOdometer.totalKm = parseFloat(km) || 0;
    this.masterOdometer.totalElevationGain = parseInt(elevation, 10) || 0;
    this.saveState();
    this.renderWorkshopUI();
  }

  // Update component target limit
  setComponentLimit(componentId, newLimitHours) {
    if (this.components[componentId]) {
      this.components[componentId].limitHours = parseFloat(newLimitHours) || this.components[componentId].defaultLimit;
      this.saveState();
      this.renderWorkshopUI();
    }
  }

  // Reset component hours to 0 and log permanent historical entry to workshop log
  async resetComponent(componentId, note = '') {
    const comp = this.components[componentId];
    if (!comp) return;

    const previousHours = comp.currentHours;
    comp.currentHours = 0.0;
    this.saveState();

    // Calculate historical service cycle number for this component
    const existingLogs = await window.BikeM_DB.getAllWorkshopLogs();
    const componentServicesCount = existingLogs.filter((l) => l.componentId === componentId).length + 1;
    const spec = this.getGarageComponentName(componentId);

    const logEntry = {
      id: 'log_' + Date.now(),
      serviceCycle: componentServicesCount,
      serviceType: 'RESETEO_HOROMETRO',
      date: new Date().toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      timestamp: Date.now(),
      componentId,
      componentName: comp.name,
      componentSpec: spec,
      hoursAtService: previousHours.toFixed(1),
      limitHours: comp.limitHours.toFixed(0),
      percentUsage: Math.round((previousHours / comp.limitHours) * 100),
      masterHoursSnapshot: this.masterOdometer.totalHours.toFixed(1),
      masterKmSnapshot: this.masterOdometer.totalKm.toFixed(1),
      note: note.trim() || 'Mantenimiento preventivo completado y contador reseteado a 0.0h.'
    };

    await window.BikeM_DB.saveWorkshopLog(logEntry);
    this.renderWorkshopUI();
    this.renderWorkshopLogsUI();

    if (window.BikeM_App) {
      window.BikeM_App.showToast(`✅ ${comp.name} reseteado y registrado en la bitácora`);
    }
  }

  // Open modal for manual workshop maintenance entry
  openManualLogModal() {
    const modal = document.getElementById('modal-manual-workshop-log');
    const inpHours = document.getElementById('input-manual-log-hours');
    const inpKm = document.getElementById('input-manual-log-km');
    const inpNote = document.getElementById('input-manual-log-note');

    if (modal) {
      if (inpHours) inpHours.value = `${this.masterOdometer.totalHours.toFixed(1)} hrs`;
      if (inpKm) inpKm.value = `${this.masterOdometer.totalKm.toFixed(1)} km`;
      if (inpNote) inpNote.value = '';
      modal.classList.remove('hidden');
    }
  }

  // Save manual maintenance entry into permanent history
  async saveManualLogEntry() {
    const compSelect = document.getElementById('input-manual-log-comp');
    const inpHours = document.getElementById('input-manual-log-hours');
    const inpKm = document.getElementById('input-manual-log-km');
    const inpNote = document.getElementById('input-manual-log-note');

    const compName = compSelect ? compSelect.value : 'Servicio General';
    const hoursVal = inpHours && inpHours.value ? inpHours.value.replace(/[^0-9.]/g, '') : this.masterOdometer.totalHours.toFixed(1);
    const kmVal = inpKm && inpKm.value ? inpKm.value.replace(/[^0-9.]/g, '') : this.masterOdometer.totalKm.toFixed(1);
    const noteVal = inpNote && inpNote.value.trim() ? inpNote.value.trim() : 'Mantenimiento registrado manualmente.';

    const logEntry = {
      id: 'log_' + Date.now(),
      serviceCycle: null,
      serviceType: 'SERVICIO_MANUAL',
      date: new Date().toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      timestamp: Date.now(),
      componentId: 'manual',
      componentName: compName,
      componentSpec: 'Mantenimiento / Ajuste de Taller',
      hoursAtService: hoursVal,
      limitHours: '-',
      percentUsage: '-',
      masterHoursSnapshot: hoursVal,
      masterKmSnapshot: kmVal,
      note: noteVal
    };

    await window.BikeM_DB.saveWorkshopLog(logEntry);
    this.renderWorkshopLogsUI();

    const modal = document.getElementById('modal-manual-workshop-log');
    if (modal) modal.classList.add('hidden');

    if (window.BikeM_App) {
      window.BikeM_App.showToast('✅ Servicio guardado en la bitácora');
    }
  }

  // Get Garage linked component spec name
  getGarageComponentName(componentId) {
    let garage = {};
    try {
      const g = localStorage.getItem('bike_garage');
      if (g) garage = JSON.parse(g);
    } catch (e) {}

    switch (componentId) {
      case 'chain_lube':
      case 'chain_pads_check':
        return garage.drivetrain ? `Transmisión: ${garage.drivetrain}` : 'Cadena y Transmisión MTB';
      case 'fork_service':
        return garage.fork ? `Horquilla: ${garage.fork} (${garage.forkTravel || '120'}mm)` : 'Horquilla de Suspensión';
      case 'suspension_major':
        return garage.shock ? `Amortiguador: ${garage.shock}` : 'Shock Trasero y Frenos Hidráulicos';
      case 'tubeless_sealant':
        return garage.frontTire || garage.rearTire
          ? `Neumáticos: ${garage.frontTire || 'Delantero'} / ${garage.rearTire || 'Trasero'}`
          : 'Líquido Sellante Tubeless Del/Tras';
      default:
        return '';
    }
  }

  formatHoursToHHMM(decimalHours) {
    const totalMinutes = Math.round(decimalHours * 60);
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hrs}h ${String(mins).padStart(2, '0')}m`;
  }

  // Render workshop cards and master odometer
  renderWorkshopUI() {
    // 1. Master Odometer
    const hoursEl = document.getElementById('odo-total-hours');
    const kmEl = document.getElementById('odo-total-km');
    const eleEl = document.getElementById('odo-total-elevation');

    if (hoursEl) hoursEl.innerText = this.formatHoursToHHMM(this.masterOdometer.totalHours);
    if (kmEl) kmEl.innerText = `${this.masterOdometer.totalKm.toFixed(1)} km`;
    if (eleEl) eleEl.innerText = `+${Math.round(this.masterOdometer.totalElevationGain)} m`;

    // 2. Component Cards
    const container = document.getElementById('components-container');
    if (!container) return;

    let html = '';
    for (const key in this.components) {
      const comp = this.components[key];
      const cur = comp.currentHours;
      const lim = comp.limitHours;
      const pct = Math.min(150, Math.round((cur / lim) * 100));
      const garageDetail = this.getGarageComponentName(key);

      // Semáforo: Green < 75%, Yellow 75%-99%, Red >= 100%
      let statusColor = 'emerald';
      let statusBg = 'bg-emerald-500';
      let statusText = 'Óptimo';
      let borderGlow = 'border-emerald-500/30';
      let badgeBg = 'bg-emerald-950/70 text-emerald-400 border border-emerald-500/40';

      if (pct >= 100) {
        statusColor = 'red';
        statusBg = 'bg-red-500 animate-pulse';
        statusText = '¡VENCIDO - SERVICIO YA!';
        borderGlow = 'border-red-500/60 shadow-[0_0_15px_rgba(239,68,68,0.25)]';
        badgeBg = 'bg-red-950/80 text-red-400 border border-red-500/60 animate-bounce';
      } else if (pct >= 75) {
        statusColor = 'amber';
        statusBg = 'bg-amber-500';
        statusText = 'Atención Próxima';
        borderGlow = 'border-amber-500/40';
        badgeBg = 'bg-amber-950/70 text-amber-400 border border-amber-500/50';
      }

      const progressWidth = Math.min(100, pct);

      html += `
        <div class="bg-[#0D121F] border ${borderGlow} rounded-2xl p-4 transition-all">
          <div class="flex items-start justify-between gap-2 mb-2">
            <div>
              <h4 class="text-sm font-bold text-white tracking-wide">${comp.name}</h4>
              <p class="text-xs text-emerald-400/90 font-medium mt-0.5">${garageDetail}</p>
            </div>
            <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${badgeBg}">
              ${statusText}
            </span>
          </div>

          <!-- Hours & Limits -->
          <div class="flex items-baseline justify-between mt-3 text-xs">
            <div class="flex items-baseline gap-1">
              <span class="text-xl font-extrabold text-white">${cur.toFixed(1)}</span>
              <span class="text-gray-400">/ ${lim.toFixed(0)} hrs</span>
            </div>
            <span class="font-bold text-sm ${pct >= 100 ? 'text-red-400 font-black' : pct >= 75 ? 'text-amber-400' : 'text-emerald-400'}">
              ${pct}%
            </span>
          </div>

          <!-- Progress Bar -->
          <div class="w-full h-2.5 bg-gray-900 rounded-full overflow-hidden mt-1.5 border border-gray-800">
            <div class="h-full rounded-full transition-all duration-500 ${statusBg}" style="width: ${progressWidth}%"></div>
          </div>

          <!-- Actions -->
          <div class="flex items-center justify-between mt-3 pt-2.5 border-t border-gray-800/60 text-xs">
            <button onclick="window.BikeM_Workshop.openLimitModal('${comp.id}')" class="text-gray-400 hover:text-white flex items-center gap-1 py-1 px-2 rounded bg-gray-800/40 border border-gray-700/50">
              <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/></svg>
              Meta: ${lim}h
            </button>
            <button onclick="window.BikeM_Workshop.openResetModal('${comp.id}')" class="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 font-semibold py-1 px-3 rounded-lg flex items-center gap-1 active:scale-95 transition-all">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              Registrar Servicio (0h)
            </button>
          </div>
        </div>
      `;
    }
    container.innerHTML = html;
  }

  // Render Workshop Journal & Permanent Cumulative History
  async renderWorkshopLogsUI() {
    const listEl = document.getElementById('workshop-logs-list');
    if (!listEl) return;

    const logs = await window.BikeM_DB.getAllWorkshopLogs();
    if (logs.length === 0) {
      listEl.innerHTML = `
        <div class="text-center py-6 text-gray-500 text-xs bg-[#0A0E17] border border-gray-800/80 rounded-2xl p-4">
          <p class="font-bold text-gray-400">No hay registros de servicio en la bitácora aún.</p>
          <p class="mt-1 text-[11px]">Al realizar un mantenimiento o resetear un horómetro a 0h, se guardará aquí el historial permanente acumulativo.</p>
        </div>
      `;
      return;
    }

    let html = '';
    for (const log of logs) {
      const isManual = log.serviceType === 'SERVICIO_MANUAL';
      const cycleBadge = log.serviceCycle ? `Servicio #${log.serviceCycle}` : 'Registro de Taller';
      const hoursText = isManual
        ? `Horas al servicio: <strong class="text-white">${log.hoursAtService} hrs</strong>`
        : `Horas al resetear: <strong class="text-emerald-400">${log.hoursAtService} hrs</strong> / Meta: ${log.limitHours}h (${log.percentUsage}%)`;

      html += `
        <div class="bg-[#0A0E17] border border-gray-800 hover:border-gray-700 rounded-2xl p-3.5 space-y-2 text-xs transition-all">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="flex items-center gap-2">
                <span class="font-black text-white text-sm">${log.componentName}</span>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${isManual ? 'bg-sky-950 text-sky-400 border border-sky-500/40' : 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'}">
                  ${cycleBadge}
                </span>
              </div>
              <p class="text-[11px] text-gray-400 font-medium mt-0.5">${log.componentSpec || ''}</p>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] text-gray-500 bg-gray-900 border border-gray-800 px-2 py-0.5 rounded-lg whitespace-nowrap">${log.date}</span>
              <button onclick="window.BikeM_Workshop.deleteLog('${log.id}')" class="text-gray-500 hover:text-red-400 p-1" title="Eliminar registro">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>
          </div>

          <!-- Notes text -->
          <div class="bg-[#070A12] border border-gray-900 rounded-xl p-2.5 text-gray-300 italic text-[11px]">
            "${log.note}"
          </div>

          <!-- Telemetry context snapshot at service -->
          <div class="flex items-center justify-between text-[10px] text-gray-400 pt-1 border-t border-gray-900">
            <span>${hoursText}</span>
            <span>Odómetro Bici: <strong class="text-orange-400 font-bold">${log.masterHoursSnapshot} hrs</strong> | ${log.masterKmSnapshot || '0'} km</span>
          </div>
        </div>
      `;
    }
    listEl.innerHTML = html;
  }

  async deleteLog(id) {
    if (confirm('¿Eliminar permanentemente este registro histórico de la bitácora?')) {
      await window.BikeM_DB.deleteWorkshopLog(id);
      this.renderWorkshopLogsUI();
      if (window.BikeM_App) {
        window.BikeM_App.showToast('Registro eliminado de la bitácora');
      }
    }
  }

  openResetModal(componentId) {
    const comp = this.components[componentId];
    if (!comp) return;

    const modal = document.getElementById('modal-workshop-reset');
    const titleEl = document.getElementById('modal-reset-comp-name');
    const hoursEl = document.getElementById('modal-reset-comp-hours');
    const inputNote = document.getElementById('input-reset-note');
    const confirmBtn = document.getElementById('btn-confirm-reset');

    if (modal && titleEl && hoursEl && confirmBtn) {
      titleEl.innerText = comp.name;
      hoursEl.innerText = `${comp.currentHours.toFixed(1)} hrs de uso / Meta ${comp.limitHours}h`;
      if (inputNote) inputNote.value = '';

      confirmBtn.onclick = async () => {
        const note = inputNote ? inputNote.value : '';
        await this.resetComponent(componentId, note);
        modal.classList.add('hidden');
      };

      modal.classList.remove('hidden');
    }
  }

  openLimitModal(componentId) {
    const comp = this.components[componentId];
    if (!comp) return;

    const newLimit = prompt(`Modificar meta de servicio para ${comp.name} (horas):`, comp.limitHours);
    if (newLimit !== null) {
      const parsed = parseFloat(newLimit);
      if (!isNaN(parsed) && parsed > 0) {
        this.setComponentLimit(componentId, parsed);
      }
    }
  }

  openEditMasterOdometerModal() {
    const modal = document.getElementById('modal-edit-master-odo');
    const inpHours = document.getElementById('input-edit-odo-hours');
    const inpKm = document.getElementById('input-edit-odo-km');
    const inpEle = document.getElementById('input-edit-odo-ele');
    const btnSave = document.getElementById('btn-save-master-odo');

    if (modal && inpHours && inpKm && inpEle && btnSave) {
      inpHours.value = this.masterOdometer.totalHours.toFixed(1);
      inpKm.value = this.masterOdometer.totalKm.toFixed(1);
      inpEle.value = Math.round(this.masterOdometer.totalElevationGain);

      btnSave.onclick = () => {
        this.setMasterOdometer(inpHours.value, inpKm.value, inpEle.value);
        modal.classList.add('hidden');
      };

      modal.classList.remove('hidden');
    }
  }

  // --------------------------------------------------------------------------
  // EXPORT BITÁCORA TO OFFICIAL A4 PDF DOCUMENT (jsPDF + autoTable)
  // --------------------------------------------------------------------------
  async exportWorkshopPDF() {
    const jsPdfLib = window.jspdf ? window.jspdf.jsPDF : window.jsPDF;
    if (!jsPdfLib) {
      alert('Error: Librería jsPDF no disponible para exportar.');
      return;
    }

    // Retrieve Garage data
    let garage = {
      riderName: 'Michael XC Rider',
      riderWeight: 75,
      bikeModel: 'Specialized Epic EVO Pro',
      bikeWeight: 11.8,
      frameType: 'full',
      shock: 'RockShox SIDLuxe Ultimate 190x40',
      fork: 'RockShox SID Ultimate Charger Race Day',
      forkTravel: 120,
      drivetrain: 'SRAM GX Eagle AXS 1x12',
      frontTire: 'Maxxis Ground Control 29x2.35',
      frontPsi: 21,
      rearTire: 'Maxxis Fast Trak 29x2.35',
      rearPsi: 23
    };
    try {
      const g = localStorage.getItem('bike_garage');
      if (g) garage = Object.assign(garage, JSON.parse(g));
    } catch (e) {}

    const logs = await window.BikeM_DB.getAllWorkshopLogs();

    // Initialize A4 Portrait Document (210 x 297 mm)
    const doc = new jsPdfLib({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const primaryColor = [7, 10, 18]; // #070A12
    const emeraldColor = [16, 185, 129]; // #10B981
    const orangeColor = [249, 115, 22]; // #F97316

    // 1. Top Header Banner (Dark Athletic Design)
    doc.setFillColor(...primaryColor);
    doc.rect(10, 10, 190, 24, 'F');

    // Bottom accent line
    doc.setDrawColor(...emeraldColor);
    doc.setLineWidth(1.2);
    doc.line(10, 34, 200, 34);

    // Title & Branding
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...emeraldColor);
    doc.text('BIKE-M // BITÁCORA TÉCNICA DE MANTENIMIENTO', 15, 20);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(148, 163, 184);
    doc.text('HISTORIAL OFICIAL DE HORAS EN SERVICIO Y CONTROL DE TALLER MTB', 15, 26);

    // Signatures Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...orangeColor);
    doc.text('By Michael NB-γ', 195, 20, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text('created by Michael_NB & IA_Gem', 195, 26, { align: 'right' });

    // 2. Rider & Bike Profile Card
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);
    doc.roundedRect(10, 38, 190, 24, 3, 3, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('FICHA TÉCNICA DE LA BICICLETA Y RIDER', 14, 44);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(`Rider: ${garage.riderName || 'Rider MTB'} (${garage.riderWeight || 75} kg)`, 14, 49);
    doc.text(`Bicicleta: ${garage.bikeModel || 'MTB'} (${garage.bikeWeight || 12} kg) | Cuadro: ${garage.frameType === 'full' ? 'Doble Suspensión' : 'Rígida'}`, 14, 54);
    doc.text(`Horquilla: ${garage.fork || 'N/D'} (${garage.forkTravel || 120}mm) | Shock: ${garage.shock || 'N/D'}`, 14, 59);

    const todayStr = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    doc.text(`Transmisión: ${garage.drivetrain || '1x12'}`, 120, 49);
    doc.text(`Neumáticos: Del ${garage.frontPsi || 21} PSI / Tras ${garage.rearPsi || 23} PSI`, 120, 54);
    doc.text(`Fecha Emisión: ${todayStr}`, 120, 59);

    // 3. Master Odometer Summary Strip
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(10, 65, 190, 16, 3, 3, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text('ODÓMETRO MAESTRO:', 14, 71);

    doc.setFontSize(10);
    doc.setTextColor(16, 185, 129);
    doc.text(`Horas Servicio: ${this.formatHoursToHHMM(this.masterOdometer.totalHours)} (${this.masterOdometer.totalHours.toFixed(1)}h)`, 52, 75);

    doc.setTextColor(249, 115, 22);
    doc.text(`Distancia: ${this.masterOdometer.totalKm.toFixed(1)} km`, 115, 75);

    doc.setTextColor(255, 255, 255);
    doc.text(`Desnivel: +${Math.round(this.masterOdometer.totalElevationGain)} m`, 165, 75);

    // 4. Table 1: Current Horometers Status
    const compRows = [];
    for (const key in this.components) {
      const comp = this.components[key];
      const cur = comp.currentHours;
      const lim = comp.limitHours;
      const pct = Math.round((cur / lim) * 100);
      const spec = this.getGarageComponentName(key);

      let statusLabel = 'Óptimo';
      if (pct >= 100) statusLabel = '¡VENCIDO - SERVICIO YA!';
      else if (pct >= 75) statusLabel = 'Atención Próxima';

      compRows.push([
        comp.name,
        spec,
        `${cur.toFixed(1)} hrs`,
        `${lim.toFixed(0)} hrs`,
        `${pct}%`,
        statusLabel
      ]);
    }

    doc.autoTable({
      startY: 85,
      head: [['Componente', 'Especificación en Garaje', 'Horas Uso', 'Meta Límite', 'Desgaste', 'Estado']],
      body: compRows,
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 2.2, textColor: [30, 41, 59] },
      headStyles: { fillColor: [13, 18, 31], textColor: [16, 185, 129], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 50, fontStyle: 'bold' },
        1: { cellWidth: 50 },
        2: { cellWidth: 22, halign: 'center' },
        3: { cellWidth: 22, halign: 'center' },
        4: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
        5: { cellWidth: 26, halign: 'center', fontStyle: 'bold' }
      },
      margin: { left: 10, right: 10 }
    });

    // 5. Table 2: Permanent History of Services & Resets
    const historyRows = [];
    if (logs.length === 0) {
      historyRows.push([
        '-',
        '-',
        'No hay registros archivados todavía',
        '-',
        '-',
        'Al resetear los componentes o añadir registros manuales, quedará aquí el historial permanente.'
      ]);
    } else {
      logs.forEach((l, idx) => {
        const cycleText = l.serviceCycle ? `#${l.serviceCycle}` : 'Taller';
        const usageText = l.hoursAtService ? `${l.hoursAtService} hrs (Meta: ${l.limitHours || '-'}h)` : '-';
        const odoText = `${l.masterHoursSnapshot || '-'}h / ${l.masterKmSnapshot || '-'}km`;

        historyRows.push([
          cycleText,
          l.date || '-',
          `${l.componentName}\n${l.componentSpec || ''}`,
          usageText,
          odoText,
          l.note || '-'
        ]);
      });
    }

    const nextStartY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 8 : 135;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('HISTORIAL ACUMULATIVO DE SERVICIOS Y RESETEOS (CRONOLÓGICO)', 10, nextStartY - 2);

    doc.autoTable({
      startY: nextStartY,
      head: [['#', 'Fecha', 'Componente / Trabajo', 'Uso Previo', 'Odómetro Bici', 'Detalle Técnico / Notas']],
      body: historyRows,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 2.2, textColor: [30, 41, 59] },
      headStyles: { fillColor: [13, 18, 31], textColor: [249, 115, 22], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 28, halign: 'center' },
        2: { cellWidth: 46, fontStyle: 'bold' },
        3: { cellWidth: 26, halign: 'center' },
        4: { cellWidth: 26, halign: 'center' },
        5: { cellWidth: 50 }
      },
      margin: { left: 10, right: 10 }
    });

    // 6. Multi-Page Footers
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.4);
      doc.line(10, 287, 200, 287);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('Bike-M MTB Telemetry System • Bitácora Oficial A4 100% Local y Privada', 10, 292);

      doc.setFont('helvetica', 'bold');
      doc.text('By Michael NB-γ | created by Michael_NB & IA_Gem', 105, 292, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.text(`Página ${i} de ${totalPages}`, 200, 292, { align: 'right' });
    }

    // Save and download PDF
    const safeBikeName = (garage.bikeModel || 'Bici').replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `Bitacora_Mantenimiento_${safeBikeName}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(fileName);

    if (window.BikeM_App) {
      window.BikeM_App.showToast('✅ Bitácora PDF (A4) descargada con éxito');
    }
  }
}

window.BikeM_Workshop = new WorkshopManager();
