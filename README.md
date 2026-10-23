# 🚴 BIKE-M // Telemetría MTB & Horómetro de Taller
### Progressive Web App (PWA) de Alto Rendimiento para Ciclismo de Montaña (MTB XC / Trail)
**Autor:** *By Michael NB-γ* | *created by Michael_NB & IA_Gem*

---

## ⚡ Descripción General
**Bike-M** es una Aplicación Web Progresiva (PWA) diseñada con enfoque **Mobile-First** para ciclistas de montaña (XC, Maratón, Trail y Enduro). Opera en modo pantalla completa en dispositivos **Android**, con una estética **OLED Dark Mode** (`#070A12`) que minimiza el consumo de batería en pantallas AMOLED/OLED bajo luz solar directa.

Todos los datos generados son **100% privados y persistentes** en el dispositivo del usuario mediante `IndexedDB` y `localStorage`, sin requerir cuentas, registros ni servidores externos.

---

## 📐 1. Fórmulas Matemáticas y Telemetría Deportiva

### Distancia por Fórmula de Haversine ($\Delta d$)
Calcula la distancia geodésica real entre dos lecturas GPS consecutivas $(lat_1, lon_1)$ y $(lat_2, lon_2)$:
$$\Delta \phi = (lat_2 - lat_1) \cdot \frac{\pi}{180}, \quad \Delta \lambda = (lon_2 - lon_1) \cdot \frac{\pi}{180}$$
$$a = \sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(lat_1 \cdot \frac{\pi}{180}) \cdot \cos(lat_2 \cdot \frac{\pi}{180}) \cdot \sin^2\left(\frac{\Delta \lambda}{2}\right)$$
$$c = 2 \cdot \operatorname{atan2}(\sqrt{a}, \sqrt{1 - a})$$
$$\Delta d = R \cdot c \quad (R = 6.371.000\text{ metros})$$

- **Filtro de Ruido:** Se descarta la lectura si la precisión GPS es deficiente (`accuracy > 25m`) o si el desplazamiento es menor a $2.5\text{ metros}$.

### Velocidad Instantánea Suavizada ($v$)
$$v_{\text{cruda}} = \left(\frac{\Delta d}{\Delta t}\right) \times 3.6 \quad (\text{km/h})$$
- **Filtro de Media Móvil:** Se promedian los últimos 3 valores para eliminar oscilaciones abruptas.
- **Umbral de Parada:** Si $v_{\text{suavizada}} < 2.5\text{ km/h}$, el velocímetro muestra `0.0 km/h`.

### Velocidad Promedio Efectiva
$$v_{\text{promedio}} = \frac{\text{Distancia Total (km)}}{\text{Tiempo de Pedaleo Efectivo (horas)}}$$

### Altitud, Pendiente y Filtro de Histéresis de Desnivel Positivo (+m)
- **Pendiente Instantánea (%):** $\left(\frac{\Delta \text{altitud}}{\Delta d}\right) \times 100$.
- **Filtro de Histéresis:** Para evitar sumar falso desnivel causado por la oscilación barométrica/GPS mientras el ciclista está detenido, **solo se acumula desnivel positivo cuando la ganancia vertical continua supera los $\ge 3.0\text{ metros}$ con velocidad de avance $> 2.5\text{ km/h}$**.

### Modelo Realista de Gasto Calórico (kcal)
Integra el **Peso del Sistema** (Peso del Rider + Peso de la Bici configurados en *Mi Garaje* + $2.5\text{ kg}$ de equipo/hidratación):
$$P_{\text{mecánica}} = (F_{\text{rodadura}} + F_{\text{aerodinámica}} + F_{\text{gravedad}}) \cdot v$$
- Las subidas con pendiente positiva multiplican exponencialmente la potencia mecánica exigida.
- La energía se integra cada segundo considerando la eficiencia metabólica humana en ciclismo (~23%) más el gasto basal activo.

---

## 🗺️ 2. Sistema de Mapas Offline (GIS)
- **Leaflet.js** integrado con 3 capas:
  1. *Topográfico MTB (OpenTopoMap)* con curvas de nivel y senderos de montaña.
  2. *Calles y Rutas (OpenStreetMap)*.
  3. *Satelital (Esri World Imagery)*.
- **Capa Personalizada con Caché en IndexedDB:** Intercepta cada tile cargado y lo almacena localmente.
- **Herramienta "Descargar Zona para Uso Offline":** Permite descargar la zona visible en pantalla en los niveles de zoom 13 al 16, mostrando una barra de progreso porcentual.
- **Indicador de Conectividad:** Badge dinámico `ONLINE (Caché Activo)` o `MODO OFFLINE (Desde Memoria)`.
- **Trazado en Vivo:** Polilínea naranja neón con marcador pulsante del rider y botón para centrar en pantalla.

---

## 🔧 3. Taller y Horómetro de Servicio
- **Odómetro Maestro Histórico:** Horas Totales (HH:MM), Kilómetros Totales (km) y Desnivel Acumulado (+m), con opción para ingresar valores iniciales si la bicicleta ya tenía uso previo.
- **Sincronización Automática:** Al finalizar y guardar una salida, los datos se sincronizan inmediatamente al odómetro y a los horómetros individuales.
- **Control de 5 Componentes con Semáforo Visual:**
  - 🟢 **Óptimo:** $< 75\%$
  - 🟡 **Atención / Próximo:** $75\% - 99\%$
  - 🔴 **Vencido / Alerta de Servicio:** $\ge 100\%$
  1. Lubricación / Cera de Cadena (12h)
  2. Mantenimiento de Horquilla (50h)
  3. Servicio Mayor Suspensión / Frenos (100h)
  4. Recarga Líquido Tubeless (60h)
  5. Revisión Cadena y Pastillas de Freno (80h)
- **Vinculación Dinámica:** Cada tarjeta muestra los nombres y modelos configurados en *Mi Garaje*.
- **Botón "Registrar Servicio (Reset 0h)" y Bitácora de Taller:** Restablece las horas a `0.0 h` y guarda el registro con fecha, horas de la bici y notas del trabajo realizado.

---

## 🚲 4. Mi Garaje (Ficha Técnica de la Bicicleta)
Formulario persistente en `localStorage`:
- Nombre/Apodo del Rider y Peso Corporal (kg).
- Marca y Modelo de la Bicicleta y Peso (kg).
- Selector de Cuadro: Rígida (Hardtail) o Doble Suspensión (Full Suspension) con modelo de Shock.
- Horquilla: Marca, modelo y recorrido (mm).
- Transmisión / Desviador (ej. SRAM GX Eagle 1x12).
- Neumáticos Delantero y Trasero con presión recomendada en PSI.
- Actualiza en tiempo real el encabezado de la aplicación.

---

## ⛅ 5. Clima, Historial y Compartir
- **Meteo en Ruta (Open-Meteo API con Caché Offline):** Temperatura, sensación térmica, viento, humedad, radiación UV.
- **Proyección de 6 Horas:** Temperatura y probabilidad de precipitación (%).
- **Contador de Luz Solar:** Hora de puesta de sol y cuenta regresiva de luz diurna restante.
- **Estimador de Estado del Sendero:** Analiza la precipitación de las últimas 48h para clasificar el terreno: *Seco/Compacto*, *Húmedo (Grip Ideal)* o *Alerta de Barro*.
- **Historial de Rutas y Exportación GPX:** Genera archivos `.gpx` compatibles con Strava, Garmin Connect o Google Earth.
- **Tarjeta Deportiva Gráfica (Canvas PNG):** Genera una imagen deportiva en alta resolución (1080x1350) con métricas, ficha técnica de la bici, trazado GPS y el sello **"By Michael NB-γ"**.
- **Compartir App:** Botón con `navigator.share` (WhatsApp) y código QR autogenerado en pantalla.

---

## 📱 6. Requisitos Técnicos Android & Simulación
- **Screen Wake Lock API:** Mantiene la pantalla encendida automáticamente mientras la ruta está activa.
- **PWA Standalone:** Cumple con todos los requisitos de instalación en Android Chrome (Service Worker, Web App Manifest, iconos SVG y PNG).
- **Simulador Demo Integrado:** Botón *"Simular Ruta (Demo)"* para recorrer virtualmente un sendero de montaña y comprobar la telemetría, el mapa y el taller sin salir de casa.

---
*Bike-M MTB Telemetry System — By Michael NB-γ | created by Michael_NB & IA_Gem*
