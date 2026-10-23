// Bike-M Garage & Technical Sheet - By Michael NB-γ

class GarageManager {
  constructor() {
    this.garage = {
      riderName: 'Michael XC Rider',
      riderWeight: 75,
      bikeModel: 'Specialized Epic EVO Pro',
      bikeWeight: 11.8,
      frameType: 'full', // 'full' or 'hardtail'
      shock: 'RockShox SIDLuxe Ultimate 190x40',
      fork: 'RockShox SID Ultimate Charger Race Day',
      forkTravel: 120,
      drivetrain: 'SRAM GX Eagle AXS 1x12 (32T / 10-52T)',
      frontTire: 'Maxxis Ground Control Grid 29x2.35',
      frontPsi: 21,
      rearTire: 'Maxxis Fast Trak Grid 29x2.35',
      rearPsi: 23
    };

    this.loadState();
  }

  loadState() {
    try {
      const stored = localStorage.getItem('bike_garage');
      if (stored) {
        this.garage = Object.assign(this.garage, JSON.parse(stored));
      }
    } catch (e) {
      console.warn('Error loading garage state:', e);
    }
  }

  saveState() {
    try {
      localStorage.setItem('bike_garage', JSON.stringify(this.garage));
      this.updateHeaderBadge();
      // Also notify workshop to refresh dynamic component names
      if (window.BikeM_Workshop) {
        window.BikeM_Workshop.renderWorkshopUI();
      }
    } catch (e) {
      console.error('Error saving garage state:', e);
    }
  }

  updateHeaderBadge() {
    const riderBadge = document.getElementById('header-rider-bike');
    if (riderBadge) {
      const rName = this.garage.riderName || 'Rider';
      const bModel = this.garage.bikeModel || 'Bici MTB';
      riderBadge.innerHTML = `
        <span class="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-200">
          <span class="text-emerald-400">🚴</span>
          <span class="truncate max-w-[100px] sm:max-w-[140px]">${rName}</span>
          <span class="text-gray-600">|</span>
          <span class="text-orange-400 truncate max-w-[110px] sm:max-w-[160px]">${bModel}</span>
        </span>
      `;
    }
  }

  populateForm() {
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val !== undefined && val !== null ? val : '';
    };

    setVal('garage-rider-name', this.garage.riderName);
    setVal('garage-rider-weight', this.garage.riderWeight);
    setVal('garage-bike-model', this.garage.bikeModel);
    setVal('garage-bike-weight', this.garage.bikeWeight);
    setVal('garage-frame-type', this.garage.frameType);
    setVal('garage-shock', this.garage.shock);
    setVal('garage-fork', this.garage.fork);
    setVal('garage-fork-travel', this.garage.forkTravel);
    setVal('garage-drivetrain', this.garage.drivetrain);
    setVal('garage-front-tire', this.garage.frontTire);
    setVal('garage-front-psi', this.garage.frontPsi);
    setVal('garage-rear-tire', this.garage.rearTire);
    setVal('garage-rear-psi', this.garage.rearPsi);

    this.toggleShockFieldVisibility();
    this.updatePreviewCard();
  }

  toggleShockFieldVisibility() {
    const frameTypeEl = document.getElementById('garage-frame-type');
    const shockContainer = document.getElementById('garage-shock-container');
    if (frameTypeEl && shockContainer) {
      if (frameTypeEl.value === 'hardtail') {
        shockContainer.classList.add('opacity-40');
      } else {
        shockContainer.classList.remove('opacity-40');
      }
    }
  }

  saveFromForm() {
    const getVal = (id) => {
      const el = document.getElementById(id);
      return el ? el.value.trim() : '';
    };

    this.garage.riderName = getVal('garage-rider-name') || 'Rider MTB';
    this.garage.riderWeight = parseFloat(getVal('garage-rider-weight')) || 75;
    this.garage.bikeModel = getVal('garage-bike-model') || 'MTB Bike';
    this.garage.bikeWeight = parseFloat(getVal('garage-bike-weight')) || 12;
    this.garage.frameType = getVal('garage-frame-type') || 'full';
    this.garage.shock = getVal('garage-shock') || 'N/A';
    this.garage.fork = getVal('garage-fork') || 'Horquilla MTB';
    this.garage.forkTravel = parseInt(getVal('garage-fork-travel'), 10) || 120;
    this.garage.drivetrain = getVal('garage-drivetrain') || '1x12';
    this.garage.frontTire = getVal('garage-front-tire') || 'Neumático Delantero';
    this.garage.frontPsi = parseFloat(getVal('garage-front-psi')) || 22;
    this.garage.rearTire = getVal('garage-rear-tire') || 'Neumático Trasero';
    this.garage.rearPsi = parseFloat(getVal('garage-rear-psi')) || 24;

    this.saveState();
    this.updatePreviewCard();

    // Show toast
    if (window.BikeM_App) {
      window.BikeM_App.showToast('✅ Ficha técnica de la bicicleta guardada');
    }
  }

  updatePreviewCard() {
    const cardEl = document.getElementById('garage-summary-badge');
    if (!cardEl) return;

    const totalWeight = (parseFloat(this.garage.riderWeight) + parseFloat(this.garage.bikeWeight)).toFixed(1);
    cardEl.innerHTML = `
      <div class="flex items-center justify-between text-xs text-gray-300">
        <div>
          <span class="text-emerald-400 font-bold">${this.garage.riderName}</span>
          <span class="text-gray-500"> | </span>
          <span class="text-orange-400 font-bold">${this.garage.bikeModel}</span>
        </div>
        <div class="text-[11px] bg-gray-900 border border-gray-800 px-2 py-0.5 rounded text-gray-400">
          Peso Sistema: <strong class="text-white">${totalWeight} kg</strong>
        </div>
      </div>
      <div class="mt-2 grid grid-cols-2 gap-2 text-[11px] text-gray-400">
        <div class="bg-[#070A12] p-2 rounded border border-gray-800/80">
          <span class="text-gray-500 block">Neumático Del:</span>
          <span class="text-gray-200 font-semibold truncate block">${this.garage.frontTire}</span>
          <span class="text-emerald-400 font-mono font-bold">${this.garage.frontPsi} PSI</span>
        </div>
        <div class="bg-[#070A12] p-2 rounded border border-gray-800/80">
          <span class="text-gray-500 block">Neumático Tras:</span>
          <span class="text-gray-200 font-semibold truncate block">${this.garage.rearTire}</span>
          <span class="text-emerald-400 font-mono font-bold">${this.garage.rearPsi} PSI</span>
        </div>
      </div>
    `;
  }
}

window.BikeM_Garage = new GarageManager();
