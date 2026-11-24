# SDO · Mapa de Solicitudes de Obra

Mapa interactivo para **capturar, filtrar y monitorear solicitudes de obra** en el estado de Morelos.
Es un sitio 100 % estático (funciona en GitHub Pages, sin servidor ni API keys).

## Funciones

**Mapa**
- 5 mapas base: **Positron** (minimalista, por defecto), Calles (OpenStreetMap), Satélite (Esri), Relieve (OpenTopoMap) y Noche.
  Positron se sirve como mapa vectorial desde [OpenFreeMap](https://openfreemap.org) porque los mosaicos de CARTO ya exigen API key.
- **Capas del mapa SDO original** (pestaña *Capas*): los 214 elementos del mapa de Google My Maps
  (2.º y 3.er trimestre, Presupuesto Participativo, INEIEM, polígonos TPBV y límites municipales),
  con su ficha al hacer clic, encendido/apagado por capa y búsqueda. Viven en `data/sdo-original.geojson`.
  Por privacidad, ese archivo no incluye nombres ni teléfonos de personas solicitantes.
- 3 visualizaciones: marcadores agrupados, todos los puntos y mapa de calor.
- Marcadores con icono y color por tipo de obra + punto de color por estatus; simbología plegable.
- Buscador de solicitudes (folio, solicitante, localidad…) y de lugares de Morelos.
- Mi ubicación, ajustar vista a las solicitudes, medir distancias y pantalla completa.

**Captura de información** (formulario en 4 pasos con validación)
1. Obra: nombre, tipo, descripción, monto estimado, beneficiarios.
2. Ubicación: clic en el mapa o GPS, marcador arrastrable, detección de dirección, municipio (36), localidad.
3. Solicitante: nombre, tipo, teléfono, correo y hasta 4 fotografías (se comprimen solas).
4. Seguimiento: folio automático (`SDO-AAAA-0001`), fecha, prioridad, estatus, avance físico, área responsable y nota.

**Seguimiento**
- Ficha de detalle con fotos, datos, cambio rápido de estatus e historial con fecha y hora.
- Enlace directo a cada solicitud (`…/#SDO-2026-0001`).
- Filtros por tipo, estatus, prioridad, municipio y rango de fechas; opción “solo en vista”.
- Resumen: total, monto, beneficiarios, % concluidas, distribución por estatus, por tipo y municipios (clic para filtrar).

**Datos**
- Exportar a Excel/CSV, GeoJSON y KML (respeta los filtros activos).
- Importar KML (Google My Maps), GeoJSON o CSV; reconoce columnas comunes y deduce tipo/estatus/municipio.
- Datos de ejemplo para explorar y el mapa original de Google My Maps disponible desde el menú.

**Accesibilidad / UX**: temas claro, oscuro y alto contraste (Design System Gobierno de Morelos),
diseño responsivo con panel inferior en celular, atajos de teclado (`/` buscar, `N` nueva solicitud, `Esc` cerrar).

## Importante: almacenamiento

Las solicitudes se guardan **en el navegador de cada persona** (`localStorage`). No se comparten
automáticamente entre equipos. Para compartir o respaldar, usa **Exportar** e **Importar**.
Para trabajo multiusuario se recomienda conectar un backend (p. ej. Supabase, Firebase o una API institucional).

### Migrar los puntos del mapa de Google My Maps
1. En Google My Maps: menú ⋮ → *Exportar a KML/KMZ* → marca “Exportar a un archivo .KML”.
2. En SDO: botón de datos (⬇) → *Importar* → elige el `.kml`.

## Estructura

```
index.html        Estructura y componentes
css/styles.css    Tokens del Design System y estilos
js/catalogos.js   Catálogos editables (tipos de obra, estatus, municipios)
js/app.js         Lógica del mapa, captura, filtros, importación/exportación
```

Para probar localmente: `python -m http.server` y abre http://localhost:8000.
