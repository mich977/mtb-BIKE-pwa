// Bike-M Offline Map & GIS Engine - By Michael NB-γ
// Integrated Leaflet.js with IndexedDB Tile Caching, Zone Downloader & Live Track

class BikeMapManager {
  constructor() {
    this.map = null;
    this.currentTileLayer = null;
    this.layers = {};
    this.trackPolyline = null;
    this.riderMarker = null;
    this.followRider = true;
    this.activeLayerKey = 'topo';
    this.cachedTilesCount = 0;
  }

  async init(mapElementId = 'map-container') {
    if (this.map) return;

    // Set Leaflet local image asset path
    if (L.Icon && L.Icon.Default) {
      L.Icon.Default.imagePath = 'vendor/leaflet/images/';
    }

    // Default center (Santiago / Andes foothills or current position if available)
    const defaultCenter = [-33.4489, -70.6693];
    const defaultZoom = 14;

    this.map = L.map(mapElementId, {
      zoomControl: false,
      attributionControl: false,
      maxZoom: 18,
      minZoom: 5
    }).setView(defaultCenter, defaultZoom);

    // Zoom control at bottom right for easy thumb reach on mobile
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    // Setup Custom Offline Caching Tile Layers
    this.setupLayers();
    this.setLayer('topo'); // OpenTopoMap as default MTB map

    // Setup Track Polyline (Racing Neon Orange)
    this.trackPolyline = L.polyline([], {
      color: '#F97316',
      weight: 5,
      opacity: 0.95,
      lineJoin: 'round',
      lineCap: 'round',
      dashArray: null
    }).addTo(this.map);

    // Setup Rider Pulsing Marker
    this.setupRiderMarker(defaultCenter);

    // Listen to user map interactions to temporarily pause follow
    this.map.on('dragstart', () => {
      this.followRider = false;
      this.updateFollowButtonUI();
    });

    // Check connectivity status and update UI
    this.setupConnectivityListener();
    await this.refreshTileCount();
  }

  setupLayers() {
    // 1. OpenTopoMap (MTB Topographic with contour lines & mountain singletracks)
    const topoUrl = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
    // 2. OpenStreetMap (Roads & Streets)
    const osmUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    // 3. Esri World Imagery (Satellite)
    const satUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

    this.layers = {
      topo: this.createOfflineTileLayer(topoUrl, 'topo', { maxZoom: 17, subdomains: 'abc' }),
      osm: this.createOfflineTileLayer(osmUrl, 'osm', { maxZoom: 18, subdomains: 'abc' }),
      sat: this.createOfflineTileLayer(satUrl, 'sat', { maxZoom: 18, subdomains: [] })
    };
  }

  createOfflineTileLayer(urlPattern, layerId, options = {}) {
    const CustomTileLayer = L.TileLayer.extend({
      createTile: function(coords, done) {
        const tile = document.createElement('img');
        tile.alt = '';
        tile.setAttribute('role', 'presentation');

        const key = `tile_${layerId}_${coords.z}_${coords.x}_${coords.y}`;

        // First attempt to load from IndexedDB cache
        window.BikeM_DB.getTile(key).then((blob) => {
          if (blob) {
            const objectUrl = URL.createObjectURL(blob);
            tile.onload = () => {
              URL.revokeObjectURL(objectUrl);
              done(null, tile);
            };
            tile.onerror = () => {
              URL.revokeObjectURL(objectUrl);
              done(null, tile);
            };
            tile.src = objectUrl;
          } else {
            // Not in cache: check online status
            const onlineUrl = this.getTileUrl(coords);
            if (navigator.onLine) {
              // Try fetching as blob to store in cache for future offline trips
              fetch(onlineUrl, { mode: 'cors' })
                .then((res) => {
                  if (res.ok) return res.blob();
                  throw new Error('Tile fetch failed');
                })
                .then((fetchedBlob) => {
                  window.BikeM_DB.saveTile(key, fetchedBlob, coords.z);
                  const objUrl = URL.createObjectURL(fetchedBlob);
                  tile.onload = () => {
                    URL.revokeObjectURL(objUrl);
                    done(null, tile);
                  };
                  tile.onerror = () => {
                    URL.revokeObjectURL(objUrl);
                    done(null, tile);
                  };
                  tile.src = objUrl;
                })
                .catch(() => {
                  // Direct image tag fallback
                  tile.onload = () => done(null, tile);
                  tile.onerror = () => {
                    tile.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="%23070A12"/><path d="M40 40 L216 216 M216 40 L40 216" stroke="%231E293B" stroke-width="2"/><text x="128" y="135" fill="%23475569" font-family="sans-serif" font-size="12" text-anchor="middle">Sin Señal Offline</text></svg>';
                    done(null, tile);
                  };
                  tile.src = onlineUrl;
                });
            } else {
              // Completely offline and tile not cached: render dark placeholder tile
              tile.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="%23070A12"/><rect x="4" y="4" width="248" height="248" fill="none" stroke="%23111827" stroke-width="1"/><text x="128" y="130" fill="%23334155" font-family="sans-serif" font-weight="bold" font-size="11" text-anchor="middle">OFFLINE</text><text x="128" y="148" fill="%231E293B" font-family="sans-serif" font-size="9" text-anchor="middle">Tile no descargado</text></svg>';
              done(null, tile);
            }
          }
        }).catch(() => {
          tile.src = this.getTileUrl(coords);
          done(null, tile);
        });

        return tile;
      }
    });

    return new CustomTileLayer(urlPattern, options);
  }

  setLayer(layerKey) {
    if (!this.layers[layerKey]) return;
    if (this.currentTileLayer) {
      this.map.removeLayer(this.currentTileLayer);
    }
    this.currentTileLayer = this.layers[layerKey];
    this.activeLayerKey = layerKey;
    this.currentTileLayer.addTo(this.map);

    // Update layer selector button styles
    const layerBtns = document.querySelectorAll('[data-map-layer]');
    layerBtns.forEach((b) => {
      if (b.getAttribute('data-map-layer') === layerKey) {
        b.className = 'px-2.5 py-1 rounded-lg font-bold transition-all text-emerald-400 bg-gray-800/80 border border-emerald-500/30';
      } else {
        b.className = 'px-2.5 py-1 rounded-lg font-semibold text-gray-400 hover:text-white hover:bg-gray-800 transition-all';
      }
    });
  }

  setupRiderMarker(centerCoords) {
    const riderPulseIcon = L.divIcon({
      className: 'rider-gps-marker',
      html: `
        <div class="relative flex items-center justify-center w-8 h-8">
          <div class="absolute w-8 h-8 bg-emerald-500 rounded-full opacity-40 animate-ping"></div>
          <div class="relative w-4 h-4 bg-emerald-400 border-2 border-white rounded-full shadow-[0_0_12px_#10B981]"></div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    this.riderMarker = L.marker(centerCoords, { icon: riderPulseIcon }).addTo(this.map);
  }

  updateRiderPosition(lat, lon, accuracy = 5) {
    if (!this.map) return;

    const latLng = [lat, lon];
    if (this.riderMarker) {
      this.riderMarker.setLatLng(latLng);
    }
    if (this.trackPolyline) {
      this.trackPolyline.addLatLng(latLng);
    }

    if (this.followRider) {
      this.map.panTo(latLng, { animate: true, duration: 0.5 });
    }
  }

  centerOnRider() {
    this.followRider = true;
    if (this.riderMarker) {
      const pos = this.riderMarker.getLatLng();
      this.map.setView(pos, 16, { animate: true });
    }
    this.updateFollowButtonUI();
  }

  clearTrack() {
    if (this.trackPolyline) {
      this.trackPolyline.setLatLngs([]);
    }
  }

  updateFollowButtonUI() {
    const btn = document.getElementById('btn-center-map');
    if (btn) {
      if (this.followRider) {
        btn.classList.add('bg-emerald-500', 'text-black', 'border-emerald-400');
        btn.classList.remove('bg-gray-900', 'text-gray-300', 'border-gray-700');
      } else {
        btn.classList.remove('bg-emerald-500', 'text-black', 'border-emerald-400');
        btn.classList.add('bg-gray-900', 'text-gray-300', 'border-gray-700');
      }
    }
  }

  setupConnectivityListener() {
    const updateStatus = () => {
      const badge = document.getElementById('map-offline-badge');
      const headerNetBadge = document.getElementById('header-network-badge');
      const isOnline = navigator.onLine;

      if (badge) {
        if (isOnline) {
          badge.className = 'px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 flex items-center gap-1.5 shadow-[0_0_10px_rgba(16,185,129,0.2)]';
          badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> ONLINE (Caché Activo)';
        } else {
          badge.className = 'px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-950/80 text-amber-400 border border-amber-500/40 flex items-center gap-1.5 shadow-[0_0_10px_rgba(245,158,11,0.2)]';
          badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-400"></span> MODO OFFLINE (Desde Memoria)';
        }
      }

      if (headerNetBadge) {
        if (isOnline) {
          headerNetBadge.className = 'text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-400 border border-emerald-500/30';
          headerNetBadge.innerText = 'ONLINE';
        } else {
          headerNetBadge.className = 'text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-900/60 text-amber-400 border border-amber-500/30';
          headerNetBadge.innerText = 'OFFLINE';
        }
      }
    };

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    updateStatus();
  }

  async refreshTileCount() {
    this.cachedTilesCount = await window.BikeM_DB.countTiles();
    const countEl = document.getElementById('offline-tile-count');
    if (countEl) {
      countEl.innerText = `${this.cachedTilesCount} tiles en memoria`;
    }
  }

  // Download all tiles within visible bounds for zoom levels 13 to 16
  async downloadVisibleZone(onProgress) {
    if (!this.map) throw new Error('Mapa no inicializado');
    if (!navigator.onLine) {
      throw new Error('Debes estar conectado a Internet para descargar la zona en caché.');
    }

    const bounds = this.map.getBounds();
    const north = bounds.getNorth();
    const south = bounds.getSouth();
    const east = bounds.getEast();
    const west = bounds.getWest();

    const zooms = [13, 14, 15, 16];
    const tilesToFetch = [];

    const latLonToTile = (lat, lon, z) => {
      const x = Math.floor(((lon + 180) / 360) * Math.pow(2, z));
      const latRad = (lat * Math.PI) / 180;
      const y = Math.floor(
        ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * Math.pow(2, z)
      );
      return { x, y };
    };

    for (const z of zooms) {
      const nw = latLonToTile(north, west, z);
      const se = latLonToTile(south, east, z);

      const minX = Math.min(nw.x, se.x);
      const maxX = Math.max(nw.x, se.x);
      const minY = Math.min(nw.y, se.y);
      const maxY = Math.max(nw.y, se.y);

      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          tilesToFetch.push({ z, x, y });
        }
      }
    }

    // Safety limit to prevent device crash: 350 tiles max per single click
    const maxSafeTiles = 350;
    const finalQueue = tilesToFetch.slice(0, maxSafeTiles);
    const total = finalQueue.length;

    let completed = 0;
    const layerId = this.activeLayerKey;

    // Concurrency pool of 4 workers
    const concurrency = 4;
    let index = 0;

    const worker = async () => {
      while (index < finalQueue.length) {
        const item = finalQueue[index++];
        const key = `tile_${layerId}_${item.z}_${item.x}_${item.y}`;

        // Check if already in DB
        const existing = await window.BikeM_DB.getTile(key);
        if (!existing) {
          let url = '';
          if (layerId === 'topo') {
            const sub = ['a', 'b', 'c'][Math.floor(Math.random() * 3)];
            url = `https://${sub}.tile.opentopomap.org/${item.z}/${item.x}/${item.y}.png`;
          } else if (layerId === 'osm') {
            const sub = ['a', 'b', 'c'][Math.floor(Math.random() * 3)];
            url = `https://${sub}.tile.openstreetmap.org/${item.z}/${item.x}/${item.y}.png`;
          } else {
            url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${item.z}/${item.y}/${item.x}`;
          }

          try {
            const res = await fetch(url, { mode: 'cors' });
            if (res.ok) {
              const blob = await res.blob();
              await window.BikeM_DB.saveTile(key, blob, item.z);
            }
          } catch (e) {
            // Ignore single tile fetch failure
          }
        }

        completed++;
        if (onProgress) {
          const pct = Math.round((completed / total) * 100);
          onProgress(completed, total, pct);
        }
      }
    };

    const workers = [];
    for (let i = 0; i < concurrency; i++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    await this.refreshTileCount();
    return { totalDownloaded: total, truncated: tilesToFetch.length > maxSafeTiles };
  }
}

window.BikeM_Map = new BikeMapManager();
