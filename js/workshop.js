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

  // Reset component hours to 0 and log to workshop log
  async resetComponent(componentId, note = '') {
    const comp = this.components[componentId];
    if (!comp) return;

    const previousHours = comp.currentHours;
    comp.currentHours = 0.0;
    this.saveState();

    // Log to workshop journal
    const logEntry = {
      id: 'log_' + Date.now(),
      date: new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now(),
      componentId,
      componentName: comp.name,
      hoursAtService: previousHours.toFixed(1),
      masterHoursSnapshot: this.masterOdometer.totalHours.toFixed(1),
      note: note.trim() || 'Mantenimiento preventivo completado.'
    };

    await window.BikeM_DB.saveWorkshopLog(logEntry);
    this.renderWorkshopUI();
    this.renderWorkshopLogsUI();
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

  // Render Workshop Journal
  async renderWorkshopLogsUI() {
    const listEl = document.getElementById('workshop-logs-list');
    if (!listEl) return;

    const logs = await window.BikeM_DB.getAllWorkshopLogs();
    if (logs.length === 0) {
      listEl.innerHTML = `
        <div class="text-center py-6 text-gray-500 text-xs">
          No hay registros de servicio en la bitácora aún. Pulsa "Registrar Servicio" al realizar mantenimiento a tus componentes.
        </div>
      `;
      return;
    }

    let html = '';
    for (const log of logs) {
      html += `
        <div class="bg-[#0A0E17] border border-gray-800 rounded-xl p-3 flex items-start justify-between gap-3 text-xs">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="font-bold text-white">${log.componentName}</span>
              <span class="text-[10px] text-gray-500 bg-gray-900 px-1.5 py-0.5 rounded border border-gray-800">${log.date}</span>
            </div>
            <p class="text-gray-300 italic text-[11px]">"${log.note}"</p>
            <div class="text-[10px] text-gray-500">
              Uso al resetear: <span class="text-emerald-400 font-semibold">${log.hoursAtService} hrs</span> | Odómetro Bici: ${log.masterHoursSnapshot} hrs
            </div>
          </div>
          <button onclick="window.BikeM_Workshop.deleteLog('${log.id}')" class="text-gray-500 hover:text-red-400 p-1" title="Eliminar registro">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>
      `;
    }
    listEl.innerHTML = html;
  }

  async deleteLog(id) {
    if (confirm('¿Eliminar este registro de la bitácora?')) {
      await window.BikeM_DB.deleteWorkshopLog(id);
      this.renderWorkshopLogsUI();
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
      hoursEl.innerText = `${comp.currentHours.toFixed(1)} hrs de uso`;
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
}

window.BikeM_Workshop = new WorkshopManager();
