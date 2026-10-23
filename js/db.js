// Bike-M IndexedDB Database Layer - By Michael NB-γ
const DB_NAME = 'BikeM_Database';
const DB_VERSION = 1;

let dbPromise = null;

function initDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Routes store
      if (!db.objectStoreNames.contains('routes')) {
        const routeStore = db.createObjectStore('routes', { keyPath: 'id' });
        routeStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Offline map tiles store
      if (!db.objectStoreNames.contains('map_tiles')) {
        const tileStore = db.createObjectStore('map_tiles', { keyPath: 'key' });
        tileStore.createIndex('zoom', 'zoom', { unique: false });
      }

      // Workshop logs store
      if (!db.objectStoreNames.contains('workshop_logs')) {
        const logStore = db.createObjectStore('workshop_logs', { keyPath: 'id' });
        logStore.createIndex('date', 'date', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      console.error('IndexedDB open error:', event.target.error);
      reject(event.target.error);
    };
  });

  return dbPromise;
}

// ---------------- ROUTES ----------------
async function dbSaveRoute(route) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('routes', 'readwrite');
    const store = tx.objectStore('routes');
    const req = store.put(route);
    req.onsuccess = () => resolve(route.id);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAllRoutes() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('routes', 'readonly');
    const store = tx.objectStore('routes');
    const req = store.getAll();
    req.onsuccess = () => {
      // Sort newest first
      const routes = req.result || [];
      routes.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      resolve(routes);
    };
    req.onerror = () => reject(req.error);
  });
}

async function dbGetRouteById(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('routes', 'readonly');
    const store = tx.objectStore('routes');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbDeleteRoute(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('routes', 'readwrite');
    const store = tx.objectStore('routes');
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

// ---------------- MAP TILES ----------------
async function dbSaveTile(key, blob, zoom) {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('map_tiles', 'readwrite');
      const store = tx.objectStore('map_tiles');
      const record = { key, blob, zoom: Number(zoom), savedAt: Date.now() };
      const req = store.put(record);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to save tile to DB:', err);
    return false;
  }
}

async function dbGetTile(key) {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('map_tiles', 'readonly');
      const store = tx.objectStore('map_tiles');
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.blob : null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    return null;
  }
}

async function dbCountTiles() {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('map_tiles', 'readonly');
      const store = tx.objectStore('map_tiles');
      const req = store.count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    return 0;
  }
}

async function dbClearTiles() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('map_tiles', 'readwrite');
    const store = tx.objectStore('map_tiles');
    const req = store.clear();
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

// ---------------- WORKSHOP LOGS ----------------
async function dbSaveWorkshopLog(log) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('workshop_logs', 'readwrite');
    const store = tx.objectStore('workshop_logs');
    const req = store.put(log);
    req.onsuccess = () => resolve(log.id);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAllWorkshopLogs() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('workshop_logs', 'readonly');
    const store = tx.objectStore('workshop_logs');
    const req = store.getAll();
    req.onsuccess = () => {
      const logs = req.result || [];
      logs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      resolve(logs);
    };
    req.onerror = () => reject(req.error);
  });
}

async function dbDeleteWorkshopLog(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('workshop_logs', 'readwrite');
    const store = tx.objectStore('workshop_logs');
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

// ---------------- FULL EXPORT / IMPORT ----------------
async function exportFullBackupJSON() {
  const routes = await dbGetAllRoutes();
  const workshopLogs = await dbGetAllWorkshopLogs();

  const backup = {
    appName: 'Bike-M MTB Telemetry',
    author: 'By Michael NB-γ',
    version: '1.0',
    exportDate: new Date().toISOString(),
    localStorage: {
      bike_garage: localStorage.getItem('bike_garage'),
      master_odometer: localStorage.getItem('master_odometer'),
      component_meters: localStorage.getItem('component_meters'),
      app_settings: localStorage.getItem('app_settings')
    },
    routes,
    workshopLogs
  };

  return JSON.stringify(backup, null, 2);
}

async function importFullBackupJSON(jsonString) {
  const backup = JSON.parse(jsonString);

  if (backup.localStorage) {
    if (backup.localStorage.bike_garage) localStorage.setItem('bike_garage', backup.localStorage.bike_garage);
    if (backup.localStorage.master_odometer) localStorage.setItem('master_odometer', backup.localStorage.master_odometer);
    if (backup.localStorage.component_meters) localStorage.setItem('component_meters', backup.localStorage.component_meters);
    if (backup.localStorage.app_settings) localStorage.setItem('app_settings', backup.localStorage.app_settings);
  }

  if (Array.isArray(backup.routes)) {
    for (const route of backup.routes) {
      await dbSaveRoute(route);
    }
  }

  if (Array.isArray(backup.workshopLogs)) {
    for (const log of backup.workshopLogs) {
      await dbSaveWorkshopLog(log);
    }
  }

  return true;
}

window.BikeM_DB = {
  initDB,
  saveRoute: dbSaveRoute,
  getAllRoutes: dbGetAllRoutes,
  getRouteById: dbGetRouteById,
  deleteRoute: dbDeleteRoute,
  saveTile: dbSaveTile,
  getTile: dbGetTile,
  countTiles: dbCountTiles,
  clearTiles: dbClearTiles,
  saveWorkshopLog: dbSaveWorkshopLog,
  getAllWorkshopLogs: dbGetAllWorkshopLogs,
  deleteWorkshopLog: dbDeleteWorkshopLog,
  exportFullBackupJSON,
  importFullBackupJSON
};
