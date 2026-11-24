/* =========================================================
   SDO · Mapa de Solicitudes de Obra
   App 100 % estática (GitHub Pages). Los datos se guardan en
   el navegador (localStorage) y se pueden importar/exportar.
   ========================================================= */
(() => {
  "use strict";

  const CAT = window.SDO_CAT;
  const STORE_KEY = "sdo.solicitudes.v1";
  const PREFS_KEY = "sdo.prefs.v1";

  /* ---------------- Utilidades ---------------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const fmtNum = (n) => new Intl.NumberFormat("es-MX").format(n || 0);
  const fmtMoney = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n || 0);
  const fmtMoneyShort = (n) => {
    n = n || 0;
    if (n >= 1e9) return "$" + (n / 1e9).toFixed(1) + " mmd";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + " M";
    if (n >= 1e3) return "$" + Math.round(n / 1e3) + " mil";
    return fmtMoney(n);
  };
  const fmtDate = (d) => (d ? new Date(d + (d.length === 10 ? "T12:00:00" : "")).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "—");
  const fmtDateTime = (d) => new Date(d).toLocaleString("es-MX", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const today = () => new Date().toISOString().slice(0, 10);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const svgPath = (d, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  const tipoOf = (k) => CAT.tipos[k] || CAT.tipos.otro;
  const estOf = (k) => CAT.estatus[k] || CAT.estatus.recibida;

  /* ---------------- Toasts y confirmación ---------------- */
  function toast(msg, type = "ok", action) {
    const el = document.createElement("div");
    el.className = "toast " + type;
    el.innerHTML = `<span>${esc(msg)}</span>`;
    if (action) {
      const b = document.createElement("button");
      b.textContent = action.label;
      b.onclick = () => { action.fn(); el.remove(); };
      el.appendChild(b);
    }
    $("#toasts").appendChild(el);
    setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 300); }, action ? 6000 : 3200);
  }

  function confirmDialog(title, text, okLabel = "Confirmar") {
    return new Promise((resolve) => {
      const dlg = $("#confirmModal");
      $("#confirmTitle").textContent = title;
      $("#confirmText").textContent = text;
      $("#confirmOk").textContent = okLabel;
      const done = (v) => { dlg.close(); cleanup(); resolve(v); };
      const ok = () => done(true);
      const cancel = () => done(false);
      const cleanup = () => { $("#confirmOk").removeEventListener("click", ok); $$("[data-close]", dlg).forEach((b) => b.removeEventListener("click", cancel)); dlg.removeEventListener("cancel", cancel); };
      $("#confirmOk").addEventListener("click", ok);
      $$("[data-close]", dlg).forEach((b) => b.addEventListener("click", cancel));
      dlg.addEventListener("cancel", cancel);
      dlg.showModal();
    });
  }

  /* ---------------- Persistencia ---------------- */
  let items = [];
  const prefs = Object.assign({ theme: "light", basemap: "positron", view: "cluster", legend: true, layers: null }, safeJSON(localStorage.getItem(PREFS_KEY)));
  // v4: Positron pasa a ser el mapa base por defecto para todos
  if (prefs.bmv !== 4) { prefs.basemap = "positron"; prefs.bmv = 4; }

  function safeJSON(s) { try { return JSON.parse(s) || {}; } catch { return {}; } }
  function loadItems() {
    try { const v = JSON.parse(localStorage.getItem(STORE_KEY)); items = Array.isArray(v) ? v : []; } catch { items = []; }
  }
  function saveItems() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(items)); return true; }
    catch (e) {
      toast("No se pudo guardar: el almacenamiento del navegador está lleno. Exporta tus datos o reduce las fotos.", "err");
      return false;
    }
  }
  const savePrefs = () => localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));

  function nextFolio() {
    const y = new Date().getFullYear();
    const max = items.reduce((m, it) => {
      const r = /SDO-(\d{4})-(\d+)/.exec(it.folio || "");
      return r && +r[1] === y ? Math.max(m, +r[2]) : m;
    }, 0);
    return `SDO-${y}-${String(max + 1).padStart(4, "0")}`;
  }

  /* ---------------- Tema ---------------- */
  const THEMES = ["light", "dark", "contrast"];
  const THEME_LABEL = { light: "claro", dark: "oscuro", contrast: "alto contraste" };
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    $('meta[name="theme-color"]').content = t === "dark" ? "#1b1c15" : "#773357";
  }

  /* ---------------- Mapa ---------------- */
  const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/";
  const BASEMAPS = {
    // Positron (estilo minimalista de CARTO/OpenMapTiles) servido por OpenFreeMap: vectorial y sin API key.
    // Los mosaicos raster de basemaps.cartocdn.com ya exigen API key y devuelven "API KEY REQUIRED".
    positron: { label: "Positron", gl: "https://tiles.openfreemap.org/styles/positron", attr: '&copy; <a href="https://openfreemap.org">OpenFreeMap</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', thumb: ESRI + "Canvas/World_Light_Gray_Base/MapServer/tile/12/1828/919" },
    voyager: { label: "Calles", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', thumb: "https://tile.openstreetmap.org/12/919/1828.png", retina: false },
    sat: { label: "Satélite", url: ESRI + "World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: "Imágenes &copy; Esri, Maxar, Earthstar Geographics", thumb: ESRI + "World_Imagery/MapServer/tile/12/1828/919", overlay: ESRI + "Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" },
    topo: { label: "Relieve", url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", attr: '&copy; OpenStreetMap, <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)', thumb: "https://a.tile.opentopomap.org/11/459/914.png", sub: "abc", maxZoom: 17 },
    dark: { label: "Noche", url: ESRI + "Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", attr: "&copy; Esri, HERE, Garmin, OpenStreetMap", thumb: ESRI + "Canvas/World_Dark_Gray_Base/MapServer/tile/12/1828/919", overlay: ESRI + "Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}", maxZoom: 16 }
  };

  const map = L.map("map", {
    center: CAT.center, zoom: CAT.zoom, zoomControl: false, preferCanvas: false, maxZoom: 19,
    maxBounds: L.latLngBounds(CAT.bounds).pad(0.6), minZoom: 8
  });
  L.control.zoom({ position: "topleft", zoomInTitle: "Acercar", zoomOutTitle: "Alejar" }).addTo(map);
  L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
  map.attributionControl.setPrefix(false);

  let baseLayer = null, labelLayer = null;
  function setBasemap(key) {
    const b = BASEMAPS[key] || BASEMAPS.positron;
    if (baseLayer) map.removeLayer(baseLayer);
    if (labelLayer) { map.removeLayer(labelLayer); labelLayer = null; }
    if (b.gl && L.maplibreGL) baseLayer = L.maplibreGL({ style: b.gl, attribution: b.attr, interactive: false }).addTo(map);
    else if (b.gl) return setBasemap("voyager"); // MapLibre no cargó: usa calles OSM
    else baseLayer = L.tileLayer(b.url, { attribution: b.attr, subdomains: b.sub || "abc", maxZoom: 19, maxNativeZoom: b.maxZoom || 19 }).addTo(map);
    if (b.overlay) {
      labelLayer = L.tileLayer(b.overlay, { maxZoom: 19, maxNativeZoom: b.maxZoom || 19, pane: "overlayPane" }).addTo(map);
    }
    prefs.basemap = key; savePrefs();
    $$(".basemap").forEach((el) => el.classList.toggle("active", el.dataset.key === key));
  }
  $("#basemaps").innerHTML = Object.entries(BASEMAPS).map(([k, b]) =>
    `<button class="basemap" data-key="${k}" title="${b.label}"><span class="thumb-bm" style="background-image:url('${b.thumb}')"></span><span>${b.label}</span></button>`).join("");
  $("#basemaps").addEventListener("click", (e) => { const b = e.target.closest(".basemap"); if (b) setBasemap(b.dataset.key); });

  // Capas de solicitudes
  const clusterLayer = L.markerClusterGroup({ showCoverageOnHover: false, spiderfyOnMaxZoom: true, maxClusterRadius: 48, chunkedLoading: true });
  const pointLayer = L.layerGroup();
  let heatLayer = null;
  const markers = new Map();
  let currentView = prefs.view;

  function pinIcon(it, selected = false, draft = false) {
    const t = tipoOf(it.tipo), s = estOf(it.estatus);
    return L.divIcon({
      className: "",
      iconSize: [36, 46], iconAnchor: [18, 44], popupAnchor: [0, -40],
      html: `<div class="pin${selected ? " sel" : ""}${draft ? " draft" : ""}">
        <svg class="shape" viewBox="0 0 36 46"><path fill="${t.color}" d="M18 1C8.6 1 1 8.4 1 17.6 1 30 18 45 18 45s17-15 17-27.4C35 8.4 27.4 1 18 1Z"/></svg>
        ${svgPath(t.icon, "glyph")}
        ${draft ? "" : `<span class="st" style="background:${s.color}"></span>`}
      </div>`
    });
  }

  function popupHTML(it) {
    const t = tipoOf(it.tipo), s = estOf(it.estatus);
    return `<div class="pop">
      ${it.fotos?.[0] ? `<img class="pop-img" src="${it.fotos[0]}" alt="">` : ""}
      <div class="pop-folio">${esc(it.folio)}</div>
      <div class="pop-title">${esc(it.titulo)}</div>
      <span class="badge" style="--c:${t.color}">${esc(t.label)}</span>
      <span class="badge" style="--c:${s.color}">${esc(s.label)}</span>
      <div class="pop-meta">${esc(it.municipio || "")}${it.localidad ? " · " + esc(it.localidad) : ""}${it.monto ? "<br>" + fmtMoney(it.monto) : ""}</div>
      <div class="pop-actions">
        <button class="btn btn-sm btn-primary" data-pop="detail" data-id="${it.id}">Ver detalle</button>
        <button class="btn btn-sm btn-on-surface" data-pop="edit" data-id="${it.id}">Editar</button>
      </div>
    </div>`;
  }

  map.on("popupopen", (e) => {
    const el = e.popup.getElement();
    el.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-pop]");
      if (!b) return;
      map.closePopup();
      if (b.dataset.pop === "detail") openDetail(b.dataset.id);
      else openForm(b.dataset.id);
    });
  });

  /* ---------------- Filtros ---------------- */
  const filters = {
    q: "", tipos: new Set(Object.keys(CAT.tipos)), estatus: new Set(Object.keys(CAT.estatus)),
    prioridad: "", municipio: "", desde: "", hasta: "", onlyInView: false
  };
  const isFiltered = () => filters.tipos.size !== Object.keys(CAT.tipos).length || filters.estatus.size !== Object.keys(CAT.estatus).length || filters.prioridad || filters.municipio || filters.desde || filters.hasta;

  function matches(it, ignoreView = false) {
    if (!filters.tipos.has(CAT.tipos[it.tipo] ? it.tipo : "otro")) return false;
    if (!filters.estatus.has(CAT.estatus[it.estatus] ? it.estatus : "recibida")) return false;
    if (filters.prioridad && it.prioridad !== filters.prioridad) return false;
    if (filters.municipio && it.municipio !== filters.municipio) return false;
    if (filters.desde && (it.fecha || "") < filters.desde) return false;
    if (filters.hasta && (it.fecha || "") > filters.hasta) return false;
    if (filters.q) {
      const hay = norm([it.folio, it.titulo, it.solicitante, it.localidad, it.municipio, it.direccion, it.descripcion, it.dependencia].join(" "));
      if (!norm(filters.q).split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    if (!ignoreView && filters.onlyInView && !map.getBounds().contains([it.lat, it.lng])) return false;
    return true;
  }

  function buildFilterUI() {
    const countBy = (key) => items.reduce((m, it) => ((m[it[key]] = (m[it[key]] || 0) + 1), m), {});
    const ct = countBy("tipo"), ce = countBy("estatus");
    $("#chipsTipo").innerHTML = Object.entries(CAT.tipos).map(([k, t]) =>
      `<button class="chip ${filters.tipos.has(k) ? "on" : ""}" data-f="tipo" data-k="${k}" style="--c:${t.color}" aria-pressed="${filters.tipos.has(k)}"><span class="sw"></span>${t.label}${ct[k] ? ` <small>${ct[k]}</small>` : ""}</button>`).join("");
    $("#chipsEstatus").innerHTML = Object.entries(CAT.estatus).map(([k, s]) =>
      `<button class="chip ${filters.estatus.has(k) ? "on" : ""}" data-f="estatus" data-k="${k}" style="--c:${s.color}" aria-pressed="${filters.estatus.has(k)}"><span class="sw"></span>${s.label}${ce[k] ? ` <small>${ce[k]}</small>` : ""}</button>`).join("");
  }

  $(".sidebar").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (chip) {
      const set = chip.dataset.f === "tipo" ? filters.tipos : filters.estatus;
      set.has(chip.dataset.k) ? set.delete(chip.dataset.k) : set.add(chip.dataset.k);
      render();
      return;
    }
    const all = e.target.closest("[data-toggle-all]");
    if (all) {
      const isT = all.dataset.toggleAll === "tipo";
      const set = isT ? filters.tipos : filters.estatus;
      const keys = Object.keys(isT ? CAT.tipos : CAT.estatus);
      if (set.size === keys.length) set.clear(); else keys.forEach((k) => set.add(k));
      render();
    }
  });

  $("#segPrioridad").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    $$("#segPrioridad button").forEach((x) => x.classList.toggle("active", x === b));
    filters.prioridad = b.dataset.val; render();
  });
  $("#fMunicipio").addEventListener("change", (e) => { filters.municipio = e.target.value; render(); });
  $("#fDesde").addEventListener("change", (e) => { filters.desde = e.target.value; render(); });
  $("#fHasta").addEventListener("change", (e) => { filters.hasta = e.target.value; render(); });
  $("#onlyInView").addEventListener("change", (e) => { filters.onlyInView = e.target.checked; renderList(); });
  $("#sortSelect").addEventListener("change", renderList);
  map.on("moveend", () => { if (filters.onlyInView) renderList(); });

  function resetFilters() {
    filters.tipos = new Set(Object.keys(CAT.tipos)); filters.estatus = new Set(Object.keys(CAT.estatus));
    filters.prioridad = filters.municipio = filters.desde = filters.hasta = filters.q = "";
    $("#searchInput").value = ""; $("#fMunicipio").value = ""; $("#fDesde").value = ""; $("#fHasta").value = "";
    $$("#segPrioridad button").forEach((x) => x.classList.toggle("active", x.dataset.val === ""));
    render();
  }

  /* ---------------- Render ---------------- */
  let selectedId = null;
  let filtered = [];

  function render() {
    filtered = items.filter((it) => matches(it, true));
    renderMarkers();
    renderList();
    renderStats();
    buildFilterUI();
    $("#filterDot").hidden = !isFiltered();
  }

  function renderMarkers() {
    clusterLayer.clearLayers(); pointLayer.clearLayers(); markers.clear();
    const list = filtered.filter((it) => Number.isFinite(it.lat) && Number.isFinite(it.lng));
    const ms = list.map((it) => {
      const m = L.marker([it.lat, it.lng], { icon: pinIcon(it, it.id === selectedId), title: it.titulo, riseOnHover: true, keyboard: true });
      m.bindPopup(() => popupHTML(it), { maxWidth: 280, closeButton: true });
      m.on("click", () => highlight(it.id, false));
      markers.set(it.id, m);
      return m;
    });
    if (currentView === "cluster") clusterLayer.addLayers(ms);
    else ms.forEach((m) => pointLayer.addLayer(m));

    const heatData = list.map((it) => [it.lat, it.lng, 0.4 + 0.2 * ((CAT.prioridades[it.prioridad] || {}).weight || 1)]);
    if (heatLayer) heatLayer.setLatLngs(heatData);
    else if (L.heatLayer) heatLayer = L.heatLayer(heatData, { radius: 28, blur: 22, maxZoom: 13, gradient: { 0.2: "#dfe6c3", 0.45: "#e7b400", 0.7: "#c9779f", 1: "#57183c" } });
    applyView();
  }

  function applyView() {
    [clusterLayer, pointLayer, heatLayer].forEach((l) => l && map.hasLayer(l) && map.removeLayer(l));
    if (currentView === "cluster") map.addLayer(clusterLayer);
    else if (currentView === "points") map.addLayer(pointLayer);
    else if (heatLayer) map.addLayer(heatLayer);
    $$("#segView button").forEach((b) => b.classList.toggle("active", b.dataset.view === currentView));
  }

  $("#segView").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b || b.dataset.view === currentView) return;
    currentView = prefs.view = b.dataset.view; savePrefs();
    renderMarkers();
  });

  const SORTS = {
    recent: (a, b) => (b.fecha || "").localeCompare(a.fecha || "") || (b.creado || "").localeCompare(a.creado || ""),
    priority: (a, b) => ((CAT.prioridades[b.prioridad] || {}).weight || 0) - ((CAT.prioridades[a.prioridad] || {}).weight || 0),
    amount: (a, b) => (b.monto || 0) - (a.monto || 0),
    benef: (a, b) => (b.beneficiarios || 0) - (a.beneficiarios || 0),
    folio: (a, b) => (a.folio || "").localeCompare(b.folio || "")
  };

  function renderList() {
    let list = filtered;
    if (filters.onlyInView) { const bb = map.getBounds(); list = list.filter((it) => bb.contains([it.lat, it.lng])); }
    list = [...list].sort(SORTS[$("#sortSelect").value] || SORTS.recent);
    $("#countBadge").textContent = list.length;
    $("#emptyState").hidden = items.length > 0;
    $("#noMatch").hidden = !(items.length > 0 && list.length === 0);
    $(".list-toolbar").hidden = items.length === 0;

    $("#reqList").innerHTML = list.map((it) => {
      const t = tipoOf(it.tipo), s = estOf(it.estatus);
      return `<li class="req-card${it.id === selectedId ? " active" : ""}" data-id="${it.id}" tabindex="0" role="button" aria-label="${esc(it.titulo)}">
        <div class="req-ico" style="background:${t.color}">${svgPath(t.icon)}</div>
        <div class="req-main">
          <div class="req-folio">${esc(it.folio)}${it.demo ? " · ejemplo" : ""}</div>
          <div class="req-title">${esc(it.titulo)}</div>
          <div class="req-meta"><span class="badge" style="--c:${s.color}">${s.label}</span><span>${esc(it.municipio || "Sin municipio")}</span></div>
          ${it.estatus === "ejecucion" || it.avance ? `<div class="progress" title="Avance ${it.avance || 0}%"><i style="width:${it.avance || 0}%"></i></div>` : ""}
        </div>
        <div class="req-side">
          <span class="prio prio-${esc(it.prioridad)}" title="Prioridad ${esc((CAT.prioridades[it.prioridad] || {}).label || "")}"></span>
          ${it.monto ? `<small class="req-folio">${fmtMoneyShort(it.monto)}</small>` : ""}
        </div>
      </li>`;
    }).join("");
  }

  $("#reqList").addEventListener("click", (e) => { const c = e.target.closest(".req-card"); if (c) openDetail(c.dataset.id, true); });
  $("#reqList").addEventListener("keydown", (e) => { if (e.key === "Enter") { const c = e.target.closest(".req-card"); if (c) openDetail(c.dataset.id, true); } });
  $("#reqList").addEventListener("mouseover", (e) => {
    const c = e.target.closest(".req-card"); if (!c) return;
    const m = markers.get(c.dataset.id); if (m && m._icon) m._icon.querySelector(".pin")?.classList.add("sel");
  });
  $("#reqList").addEventListener("mouseout", (e) => {
    const c = e.target.closest(".req-card"); if (!c || c.dataset.id === selectedId) return;
    const m = markers.get(c.dataset.id); if (m && m._icon) m._icon.querySelector(".pin")?.classList.remove("sel");
  });

  function renderStats() {
    const L_ = filtered;
    const sum = (k) => L_.reduce((a, it) => a + (+it[k] || 0), 0);
    const concl = L_.filter((it) => it.estatus === "concluida").length;
    const alta = L_.filter((it) => it.prioridad === "alta" && !["concluida", "rechazada"].includes(it.estatus)).length;
    $("#kpis").innerHTML = `
      <div class="kpi"><b>${fmtNum(L_.length)}</b><small>Solicitudes</small></div>
      <div class="kpi"><b>${fmtMoneyShort(sum("monto"))}</b><small>Monto estimado</small></div>
      <div class="kpi"><b>${fmtNum(sum("beneficiarios"))}</b><small>Beneficiarios</small></div>
      <div class="kpi"><b>${L_.length ? Math.round((concl / L_.length) * 100) : 0}%</b><small>Concluidas · ${alta} alta prioridad pendientes</small></div>`;

    const byE = Object.keys(CAT.estatus).map((k) => [k, L_.filter((it) => it.estatus === k).length]);
    $("#stackStatus").innerHTML = byE.filter(([, n]) => n).map(([k, n]) => `<i style="flex:${n};background:${CAT.estatus[k].color}" title="${CAT.estatus[k].label}: ${n}"></i>`).join("");
    $("#legendStatus").innerHTML = byE.map(([k, n]) => `<li><i style="background:${CAT.estatus[k].color}"></i>${CAT.estatus[k].label}<b>${n}</b></li>`).join("");

    const bars = (pairs, colorFn, attr) => {
      const max = Math.max(1, ...pairs.map((p) => p[1]));
      return pairs.map(([k, n, label]) => `<button class="bar-row" data-${attr}="${esc(k)}" title="Filtrar por ${esc(label)}"><span>${esc(label)}</span><span class="track"><i style="width:${(n / max) * 100}%;background:${colorFn(k)}"></i></span><b>${n}</b></button>`).join("") || `<p class="hint">Sin datos.</p>`;
    };
    const byT = Object.entries(CAT.tipos).map(([k, t]) => [k, L_.filter((it) => it.tipo === k).length, t.label]).filter((p) => p[1]).sort((a, b) => b[1] - a[1]);
    $("#barsTipo").innerHTML = bars(byT, (k) => CAT.tipos[k].color, "tipo");
    const munC = {}; L_.forEach((it) => it.municipio && (munC[it.municipio] = (munC[it.municipio] || 0) + 1));
    const byM = Object.entries(munC).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => [k, n, k]);
    $("#barsMun").innerHTML = bars(byM, () => "var(--sem-accent-primary)", "mun");
  }

  $("#barsTipo").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tipo]"); if (!b) return;
    filters.tipos = new Set([b.dataset.tipo]); render(); fitToFiltered();
    toast(`Filtrando: ${CAT.tipos[b.dataset.tipo].label}`, "ok", { label: "Quitar", fn: resetFilters });
  });
  $("#barsMun").addEventListener("click", (e) => {
    const b = e.target.closest("[data-mun]"); if (!b) return;
    filters.municipio = b.dataset.mun; $("#fMunicipio").value = b.dataset.mun; render(); fitToFiltered();
    toast(`Filtrando: ${b.dataset.mun}`, "ok", { label: "Quitar", fn: resetFilters });
  });

  /* ---------------- Selección ---------------- */
  function highlight(id, pan = true) {
    const prev = markers.get(selectedId);
    selectedId = id;
    if (prev && prev._icon) prev._icon.querySelector(".pin")?.classList.remove("sel");
    $$(".req-card").forEach((c) => c.classList.toggle("active", c.dataset.id === id));
    const it = items.find((x) => x.id === id);
    const m = markers.get(id);
    if (it && pan) {
      // Deja el marcador visible a la izquierda del panel de detalle (escritorio)
      const pad = () => (innerWidth >= 768 ? { paddingTopLeft: [60, 80], paddingBottomRight: [drawer.offsetWidth + 60, 80] } : { padding: [60, 60] });
      const go = () => { m?._icon?.querySelector(".pin")?.classList.add("sel"); map.panInside([it.lat, it.lng], pad()); };
      if (currentView === "cluster" && m) clusterLayer.zoomToShowLayer(m, go);
      else {
        const z = Math.max(map.getZoom(), 15);
        const pt = map.project([it.lat, it.lng], z).add([innerWidth >= 768 ? drawer.offsetWidth / 2 : 0, 0]);
        map.flyTo(map.unproject(pt, z), z, { duration: 0.6 }); setTimeout(() => m?._icon?.querySelector(".pin")?.classList.add("sel"), 650);
      }
    } else m?._icon?.querySelector(".pin")?.classList.add("sel");
    $$(".req-card.active")[0]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function fitToFiltered() {
    const pts = filtered.map((it) => [it.lat, it.lng]);
    if (pts.length) map.flyToBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 15, duration: 0.7 });
    else map.flyTo(CAT.center, CAT.zoom);
  }

  /* ---------------- Drawer ---------------- */
  const drawer = $("#drawer");
  let draftMarker = null;
  function openDrawer() { drawer.classList.add("open"); document.body.classList.add("drawer-open"); drawer.setAttribute("aria-hidden", "false"); if (innerWidth < 768) $("#sidebar").classList.remove("open"); }
  function closeDrawer() {
    drawer.classList.remove("open"); document.body.classList.remove("drawer-open"); drawer.setAttribute("aria-hidden", "true");
    stopCapture(); removeDraft(); formState = null;
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  }
  $("#btnCloseDrawer").addEventListener("click", async () => {
    if (formState && formDirty && !(await confirmDialog("¿Descartar cambios?", "Hay información capturada que no se ha guardado.", "Descartar"))) return;
    closeDrawer();
  });

  function openDetail(id, pan = true) {
    const it = items.find((x) => x.id === id); if (!it) return;
    removeDraft(); formState = null;
    highlight(id, pan);
    history.replaceState(null, "", "#" + encodeURIComponent(it.folio));
    const t = tipoOf(it.tipo), s = estOf(it.estatus);
    $("#drawerEyebrow").textContent = it.folio + (it.demo ? " · ejemplo" : "");
    $("#drawerTitle").textContent = it.titulo;
    $("#reqForm").hidden = true;
    const v = $("#detailView"); v.hidden = false;
    const tel = it.telefono ? `<a href="tel:${esc(it.telefono.replace(/\s/g, ""))}">${esc(it.telefono)}</a>` : "—";
    v.innerHTML = `
      ${it.fotos?.length ? `<div class="detail-hero">${it.fotos.map((f) => `<img src="${f}" alt="Fotografía de la obra">`).join("")}</div>` : ""}
      <div class="detail-badges">
        <span class="badge" style="--c:${t.color}">${t.label}</span>
        <span class="badge" style="--c:${s.color}">${s.label}</span>
        <span class="badge" style="--c:${it.prioridad === "alta" ? "var(--sem-error)" : it.prioridad === "media" ? "var(--sem-warning)" : "var(--sem-accent-secondary)"}">Prioridad ${esc((CAT.prioridades[it.prioridad] || {}).label || "—")}</span>
      </div>
      ${it.descripcion ? `<p class="detail-desc">${esc(it.descripcion)}</p>` : ""}
      ${it.avance ? `<p class="section-title">Avance físico · ${it.avance}%</p><div class="progress" style="height:8px;margin:0 0 var(--gap-lg)"><i style="width:${it.avance}%"></i></div>` : ""}
      <dl class="dl">
        <div><dt>Monto estimado</dt><dd>${it.monto ? fmtMoney(it.monto) : "—"}</dd></div>
        <div><dt>Beneficiarios</dt><dd>${it.beneficiarios ? fmtNum(it.beneficiarios) : "—"}</dd></div>
        <div><dt>Municipio</dt><dd>${esc(it.municipio || "—")}</dd></div>
        <div><dt>Localidad</dt><dd>${esc(it.localidad || "—")}</dd></div>
        ${it.direccion ? `<div class="full"><dt>Dirección</dt><dd>${esc(it.direccion)}</dd></div>` : ""}
        <div><dt>Solicitante</dt><dd>${esc(it.solicitante || "—")}<br><small>${esc(it.tipoSolicitante || "")}</small></dd></div>
        <div><dt>Contacto</dt><dd>${tel}${it.correo ? `<br><a href="mailto:${esc(it.correo)}">${esc(it.correo)}</a>` : ""}</dd></div>
        <div><dt>Fecha de solicitud</dt><dd>${fmtDate(it.fecha)}</dd></div>
        <div><dt>Responsable</dt><dd>${esc(it.dependencia || "—")}</dd></div>
        <div class="full"><dt>Coordenadas</dt><dd>${it.lat.toFixed(6)}, ${it.lng.toFixed(6)} · <a href="https://www.google.com/maps/search/?api=1&query=${it.lat},${it.lng}" target="_blank" rel="noopener" title="Se abre en una pestaña nueva">Abrir en Google Maps</a></dd></div>
      </dl>
      <p class="section-title">Cambiar estatus</p>
      <div class="status-quick">${Object.entries(CAT.estatus).map(([k, e]) => `<button class="chip ${k === it.estatus ? "on" : ""}" data-quick="${k}" style="--c:${e.color}"><span class="sw"></span>${e.label}</button>`).join("")}</div>
      ${it.historial?.length ? `<p class="section-title">Historial</p><ul class="timeline">${[...it.historial].reverse().map((h) => `<li><time>${fmtDateTime(h.t)}</time>${esc(h.txt)}</li>`).join("")}</ul>` : ""}
      <div class="detail-actions">
        <button class="btn btn-primary" data-act="edit">Editar</button>
        <button class="btn btn-secondary" data-act="share">Copiar enlace</button>
        <div class="grow"></div>
        <button class="btn btn-alert-low" data-act="delete">Eliminar</button>
      </div>`;
    openDrawer();
  }

  $("#detailView").addEventListener("click", async (e) => {
    const it = items.find((x) => x.id === selectedId); if (!it) return;
    const q = e.target.closest("[data-quick]");
    if (q && q.dataset.quick !== it.estatus) {
      const from = estOf(it.estatus).label;
      it.estatus = q.dataset.quick;
      if (it.estatus === "concluida") it.avance = 100;
      log(it, `Estatus: ${from} → ${estOf(it.estatus).label}`);
      saveItems(); render(); openDetail(it.id, false);
      toast("Estatus actualizado");
      return;
    }
    const a = e.target.closest("[data-act]"); if (!a) return;
    if (a.dataset.act === "edit") openForm(it.id);
    if (a.dataset.act === "share") {
      const url = location.origin + location.pathname + "#" + encodeURIComponent(it.folio);
      navigator.clipboard?.writeText(url).then(() => toast("Enlace copiado"), () => toast(url));
    }
    if (a.dataset.act === "delete") {
      if (!(await confirmDialog("¿Eliminar solicitud?", `Se eliminará ${it.folio} · ${it.titulo}.`, "Eliminar"))) return;
      const idx = items.indexOf(it); const backup = items.splice(idx, 1)[0];
      saveItems(); closeDrawer(); selectedId = null; render();
      toast("Solicitud eliminada", "ok", { label: "Deshacer", fn: () => { items.splice(idx, 0, backup); saveItems(); render(); } });
    }
  });

  function log(it, txt) { (it.historial ||= []).push({ t: new Date().toISOString(), txt }); it.actualizado = new Date().toISOString(); }

  /* ---------------- Formulario ---------------- */
  let formState = null;   // { id|null, lat, lng, tipo, prioridad, fotos, step }
  let formDirty = false;
  const form = $("#reqForm");
  const STEPS = 4;

  $("#typeGrid").innerHTML = Object.entries(CAT.tipos).map(([k, t]) =>
    `<button type="button" class="type-opt" role="radio" aria-checked="false" data-tipo="${k}" style="--c:${t.color}"><i>${svgPath(t.icon)}</i>${t.label}</button>`).join("");
  $("#estatus").innerHTML = Object.entries(CAT.estatus).map(([k, s]) => `<option value="${k}">${s.label}</option>`).join("");
  const munOpts = CAT.municipios.map((m) => `<option>${esc(m)}</option>`).join("");
  $("#municipio").insertAdjacentHTML("beforeend", munOpts);
  $("#fMunicipio").insertAdjacentHTML("beforeend", munOpts);

  $("#typeGrid").addEventListener("click", (e) => {
    const b = e.target.closest(".type-opt"); if (!b) return;
    formState.tipo = b.dataset.tipo; formDirty = true;
    $$(".type-opt").forEach((x) => x.setAttribute("aria-checked", x === b ? "true" : "false"));
    b.closest(".field").classList.remove("invalid");
    updateDraft();
  });
  $("#segFormPrioridad").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    formState.prioridad = b.dataset.val; formDirty = true;
    $$("#segFormPrioridad button").forEach((x) => x.classList.toggle("active", x === b));
  });
  $("#avance").addEventListener("input", (e) => { $("#avanceVal").textContent = e.target.value + "%"; });
  form.addEventListener("input", (e) => { formDirty = true; e.target.closest(".field")?.classList.remove("invalid"); });

  function openForm(id = null, latlng = null) {
    const it = id ? items.find((x) => x.id === id) : null;
    formDirty = false;
    formState = {
      id: it?.id || null,
      lat: it?.lat ?? latlng?.lat ?? null, lng: it?.lng ?? latlng?.lng ?? null,
      tipo: it?.tipo || "", prioridad: it?.prioridad || "media", fotos: [...(it?.fotos || [])], step: 0
    };
    form.reset();
    const set = (n, v) => { const el = form.elements[n]; if (el) el.value = v ?? ""; };
    ["titulo", "descripcion", "monto", "beneficiarios", "municipio", "localidad", "direccion", "solicitante", "telefono", "correo", "dependencia"].forEach((k) => set(k, it?.[k]));
    set("tipoSolicitante", it?.tipoSolicitante || "Ciudadano/a");
    set("fecha", it?.fecha || today());
    set("folio", it?.folio || nextFolio());
    set("estatus", it?.estatus || "recibida");
    set("avance", it?.avance || 0); $("#avanceVal").textContent = (it?.avance || 0) + "%";
    $$(".type-opt").forEach((x) => x.setAttribute("aria-checked", x.dataset.tipo === formState.tipo ? "true" : "false"));
    $$("#segFormPrioridad button").forEach((x) => x.classList.toggle("active", x.dataset.val === formState.prioridad));
    $$(".field.invalid", form).forEach((f) => f.classList.remove("invalid"));
    $$(".support.err", form).forEach((f) => f.classList.remove("err"));
    $$("#stepper li").forEach((li) => li.classList.remove("done", "warn"));

    $("#drawerEyebrow").textContent = it ? "Editar · " + it.folio : "Nueva solicitud";
    $("#drawerTitle").textContent = it ? it.titulo : "Captura de información";
    $("#detailView").hidden = true; form.hidden = false;
    renderThumbs(); updateLoc(); goStep(0);
    openDrawer();
    setTimeout(() => form.elements.titulo.focus(), 350);
    if (it) { markers.get(it.id)?.setOpacity(0.25); }
    updateDraft();
  }

  function goStep(n) {
    formState.step = Math.max(0, Math.min(STEPS - 1, n));
    $$(".step", form).forEach((s) => (s.hidden = +s.dataset.step !== formState.step));
    $$("#stepper li").forEach((li) => {
      const i = +li.dataset.step;
      li.classList.toggle("active", i === formState.step);
      if (i < formState.step && validateStep(i, false)) li.classList.add("done");
    });
    $("#btnPrev").style.visibility = formState.step === 0 ? "hidden" : "visible";
    $("#btnNext").hidden = formState.step === STEPS - 1;
    $("#btnSave").hidden = formState.step !== STEPS - 1 && !formState.id;
    if (formState.step === 1 && formState.lat == null) startCapture();
    form.scrollTop = 0;
  }
  $("#btnNext").addEventListener("click", () => { if (validateStep(formState.step, true)) goStep(formState.step + 1); });
  $("#btnPrev").addEventListener("click", () => goStep(formState.step - 1));
  $("#stepper").addEventListener("click", (e) => { const li = e.target.closest("li"); if (li) goStep(+li.dataset.step); });

  function validateStep(i, show) {
    const errs = [];
    const need = (name) => { const el = form.elements[name]; if (!el.value.trim()) errs.push(el.closest(".field")); };
    if (i === 0) {
      need("titulo");
      if (!formState.tipo) errs.push($("#typeGrid").closest(".field"));
    } else if (i === 1) {
      need("municipio");
      if (formState.lat == null) errs.push("ubicacion");
    } else if (i === 2) {
      need("solicitante");
      const c = form.elements.correo;
      if (c.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.value)) errs.push(c.closest(".field"));
    }
    if (show) {
      errs.forEach((f) => (f === "ubicacion" ? $('[data-error-for="ubicacion"]').classList.add("err") : f.classList.add("invalid")));
      if (errs.length) {
        const first = errs[0] === "ubicacion" ? $("#locCard") : errs[0];
        first.scrollIntoView({ block: "center", behavior: "smooth" });
        first.querySelector?.("input,select,textarea,button")?.focus({ preventScroll: true });
      }
    }
    return errs.length === 0;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    for (let i = 0; i < STEPS; i++) {
      if (!validateStep(i, false)) {
        goStep(i); validateStep(i, true);
        $(`#stepper li[data-step="${i}"]`).classList.add("warn");
        toast("Revisa los campos marcados", "err");
        return;
      }
    }
    const f = form.elements;
    const data = {
      titulo: f.titulo.value.trim(), tipo: formState.tipo, descripcion: f.descripcion.value.trim(),
      monto: +f.monto.value || 0, beneficiarios: +f.beneficiarios.value || 0,
      lat: formState.lat, lng: formState.lng,
      municipio: f.municipio.value, localidad: f.localidad.value.trim(), direccion: f.direccion.value.trim(),
      solicitante: f.solicitante.value.trim(), tipoSolicitante: f.tipoSolicitante.value,
      telefono: f.telefono.value.trim(), correo: f.correo.value.trim(), fotos: formState.fotos,
      fecha: f.fecha.value || today(), prioridad: formState.prioridad, estatus: f.estatus.value,
      avance: +f.avance.value || 0, dependencia: f.dependencia.value.trim()
    };
    const nota = f.nota.value.trim();
    let it;
    if (formState.id) {
      it = items.find((x) => x.id === formState.id);
      const prevEst = it.estatus;
      Object.assign(it, data);
      if (prevEst !== data.estatus) log(it, `Estatus: ${estOf(prevEst).label} → ${estOf(data.estatus).label}`);
      if (nota) log(it, nota); else if (prevEst === data.estatus) log(it, "Información actualizada");
    } else {
      it = { id: uid(), folio: f.folio.value, creado: new Date().toISOString(), historial: [], ...data };
      log(it, "Solicitud registrada");
      if (nota) log(it, nota);
      items.push(it);
    }
    if (!saveItems()) return;
    const isNew = !formState.id;
    removeDraft(); formState = null; formDirty = false;
    render();
    openDetail(it.id, false);
    toast(isNew ? `Solicitud ${it.folio} registrada` : "Cambios guardados");
  });

  /* Fotos */
  const MAX_FOTOS = 4;
  function compress(file) {
    return new Promise((res, rej) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const s = Math.min(1, 900 / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = rej; img.src = url;
    });
  }
  async function addFiles(files) {
    const imgs = [...files].filter((f) => f.type.startsWith("image/"));
    for (const f of imgs) {
      if (formState.fotos.length >= MAX_FOTOS) { toast(`Máximo ${MAX_FOTOS} fotografías`, "err"); break; }
      try { formState.fotos.push(await compress(f)); formDirty = true; } catch { toast("No se pudo leer una imagen", "err"); }
    }
    renderThumbs();
  }
  function renderThumbs() {
    $("#thumbs").innerHTML = formState.fotos.map((src, i) => `<div class="thumb"><img src="${src}" alt="Foto ${i + 1}"><button type="button" data-rm="${i}" aria-label="Quitar foto ${i + 1}">${svgPath("M6 6l12 12M18 6 6 18")}</button></div>`).join("");
  }
  $("#fotos").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });
  $("#thumbs").addEventListener("click", (e) => { const b = e.target.closest("[data-rm]"); if (b) { formState.fotos.splice(+b.dataset.rm, 1); renderThumbs(); } });
  const zone = $("#uploadZone");
  ["dragenter", "dragover"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove("drag"); }));
  zone.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));

  /* Ubicación / marcador borrador */
  function updateLoc() {
    $("#locCoords").textContent = formState.lat != null ? `${formState.lat.toFixed(6)}, ${formState.lng.toFixed(6)}` : "Sin ubicación";
    if (formState.lat != null) $('[data-error-for="ubicacion"]').classList.remove("err");
  }
  function updateDraft() {
    if (!formState || formState.lat == null) return;
    const fake = { tipo: formState.tipo || "otro", estatus: "recibida" };
    if (!draftMarker) {
      draftMarker = L.marker([formState.lat, formState.lng], { draggable: true, icon: pinIcon(fake, true, true), zIndexOffset: 2000 }).addTo(map);
      draftMarker.on("dragend", () => { const p = draftMarker.getLatLng(); setLoc(p.lat, p.lng, false); });
    } else {
      draftMarker.setLatLng([formState.lat, formState.lng]); draftMarker.setIcon(pinIcon(fake, true, true));
    }
  }
  function removeDraft() {
    if (draftMarker) { map.removeLayer(draftMarker); draftMarker = null; }
    markers.forEach((m) => m.setOpacity(1));
  }
  function setLoc(lat, lng, pan = true) {
    formState.lat = lat; formState.lng = lng; formDirty = true;
    updateLoc(); updateDraft();
    if (pan) map.panTo([lat, lng]);
  }

  /* ---------------- Modo captura ---------------- */
  let capturing = false;
  function startCapture() {
    capturing = true; document.body.classList.add("capturing"); $("#captureBanner").hidden = false;
    if (innerWidth < 768) { drawer.classList.remove("open"); }
  }
  function stopCapture() {
    capturing = false; document.body.classList.remove("capturing"); $("#captureBanner").hidden = true;
  }
  map.on("click", (e) => {
    if (measuring) return addMeasurePoint(e.latlng);
    if (!capturing) return;
    stopCapture();
    if (!formState) { openForm(null, e.latlng); goStep(0); }
    else { setLoc(e.latlng.lat, e.latlng.lng, false); openDrawer(); }
    toast("Ubicación fijada · puedes arrastrar el marcador para ajustar");
  });
  map.on("mousemove", (e) => { $("#coords").textContent = `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`; });

  function newRequest() {
    resetSelection();
    openForm(null, null);
    startCapture();
  }
  $("#btnNew").addEventListener("click", newRequest);
  $("#btnPickMap").addEventListener("click", startCapture);
  $("#btnCancelCapture").addEventListener("click", () => { stopCapture(); if (formState) openDrawer(); });

  function resetSelection() {
    const m = markers.get(selectedId); m?._icon?.querySelector(".pin")?.classList.remove("sel");
    selectedId = null; $$(".req-card.active").forEach((c) => c.classList.remove("active"));
  }

  function geolocate(cb) {
    if (!navigator.geolocation) return toast("Tu navegador no permite geolocalización", "err");
    toast("Obteniendo ubicación…");
    navigator.geolocation.getCurrentPosition(
      (p) => cb(p.coords.latitude, p.coords.longitude, p.coords.accuracy),
      () => toast("No se pudo obtener tu ubicación", "err"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }
  let locMarker = null;
  $("#btnLocate").addEventListener("click", () => geolocate((lat, lng, acc) => {
    if (locMarker) map.removeLayer(locMarker);
    locMarker = L.layerGroup([
      L.circle([lat, lng], { radius: acc, color: "#3266cb", weight: 1, fillOpacity: 0.1 }),
      L.circleMarker([lat, lng], { radius: 7, color: "#fff", weight: 3, fillColor: "#3266cb", fillOpacity: 1 })
    ]).addTo(map);
    map.flyTo([lat, lng], 16);
  }));
  $("#btnUseGps").addEventListener("click", () => geolocate((lat, lng) => {
    stopCapture();
    if (!formState) openForm(null, { lat, lng }); else { setLoc(lat, lng); openDrawer(); }
    map.flyTo([lat, lng], 17);
  }));

  /* Geocodificación inversa (OpenStreetMap Nominatim) */
  $("#btnReverse").addEventListener("click", async () => {
    if (formState?.lat == null) return toast("Primero ubica la obra en el mapa", "err");
    const btn = $("#btnReverse"); btn.disabled = true; btn.textContent = "Buscando…";
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${formState.lat}&lon=${formState.lng}&zoom=18&addressdetails=1&accept-language=es`);
      const j = await r.json(); const a = j.address || {};
      const f = form.elements;
      const candidates = [a.county, a.city, a.town, a.municipality, a.village].filter(Boolean).map(norm);
      const mun = CAT.municipios.find((m) => candidates.some((c) => c.includes(norm(m)) || norm(m).includes(c)));
      if (mun && !f.municipio.value) f.municipio.value = mun;
      if (!f.localidad.value) f.localidad.value = a.suburb || a.neighbourhood || a.village || a.town || a.city || a.hamlet || "";
      if (!f.direccion.value) f.direccion.value = [a.road, a.house_number].filter(Boolean).join(" ");
      formDirty = true;
      toast(mun ? "Dirección detectada" : "Dirección detectada; verifica el municipio");
    } catch { toast("No se pudo consultar la dirección", "err"); }
    btn.disabled = false; btn.textContent = "Detectar dirección";
  });

  /* ---------------- Búsqueda ---------------- */
  const sInput = $("#searchInput"), sRes = $("#searchResults");
  let placeResults = [], hlIndex = -1;
  const searchPlaces = debounce(async (q) => {
    if (q.length < 3) { placeResults = []; return drawSearch(); }
    try {
      const b = CAT.bounds;
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=mx&accept-language=es&viewbox=${b[0][1]},${b[1][0]},${b[1][1]},${b[0][0]}&bounded=1&q=${encodeURIComponent(q)}`);
      placeResults = sInput.value.trim() === q ? await r.json() : placeResults;
    } catch { placeResults = []; }
    drawSearch();
  }, 450);

  function drawSearch() {
    const q = sInput.value.trim();
    if (!q) { sRes.hidden = true; return; }
    const reqs = filtered.slice(0, 6);
    let html = "";
    if (reqs.length) html += `<p class="sr-group">Solicitudes</p>` + reqs.map((it) => `<button data-req="${it.id}"><span class="req-ico" style="background:${tipoOf(it.tipo).color};width:28px;height:28px">${svgPath(tipoOf(it.tipo).icon)}</span><span>${esc(it.titulo)}<small>${esc(it.folio)} · ${esc(it.municipio)}</small></span></button>`).join("");
    const lh = legacyHits(q); sRes._legacy = lh;
    if (lh.length) html += `<p class="sr-group">Mapa SDO original</p>` + lh.map((x, i) => {
      const fl = x.f.properties.fields, mun = fl.MUNICIPIO || fl.Municipio || "";
      return `<button data-legacy="${i}"><span class="req-ico" style="background:${x.f.properties.color};width:28px;height:28px;border-radius:50%"></span><span>${esc(x.f.properties.name || "Sin nombre")}<small>${esc(x.layer.name)}${mun ? " · " + esc(mun) : ""}</small></span></button>`;
    }).join("");
    if (placeResults.length) html += `<p class="sr-group">Lugares</p>` + placeResults.map((p, i) => `<button data-place="${i}">${svgPath("M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12Z")}<span>${esc(p.name || p.display_name.split(",")[0])}<small>${esc(p.display_name)}</small></span></button>`).join("");
    if (!html) html = `<p class="sr-group">Sin coincidencias</p>`;
    sRes.innerHTML = html; sRes.hidden = false; hlIndex = -1;
  }
  sInput.addEventListener("input", () => {
    filters.q = sInput.value.trim();
    render(); drawSearch(); searchPlaces(filters.q);
  });
  sInput.addEventListener("focus", drawSearch);
  sInput.addEventListener("keydown", (e) => {
    const btns = $$("button", sRes);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); if (!btns.length) return;
      hlIndex = (hlIndex + (e.key === "ArrowDown" ? 1 : -1) + btns.length) % btns.length;
      btns.forEach((b, i) => b.classList.toggle("hl", i === hlIndex));
    } else if (e.key === "Enter") { e.preventDefault(); (btns[hlIndex] || btns[0])?.click(); }
    else if (e.key === "Escape") { sRes.hidden = true; sInput.blur(); }
  });
  sRes.addEventListener("click", (e) => {
    const r = e.target.closest("[data-req]"), p = e.target.closest("[data-place]"), lg = e.target.closest("[data-legacy]");
    if (r) openDetail(r.dataset.req);
    if (lg) {
      const x = sRes._legacy[+lg.dataset.legacy];
      map.once("moveend", () => x.lyr.openPopup());
      map.flyTo(x.lyr.getLatLng(), Math.max(map.getZoom(), 15), { duration: 0.6 });
      sInput.value = ""; filters.q = ""; render();
    }
    if (p) {
      const pl = placeResults[+p.dataset.place];
      if (pl.boundingbox) { const bb = pl.boundingbox.map(Number); map.flyToBounds([[bb[0], bb[2]], [bb[1], bb[3]]], { maxZoom: 17 }); }
      else map.flyTo([+pl.lat, +pl.lon], 16);
      sInput.value = ""; filters.q = ""; render();
    }
    sRes.hidden = true;
  });
  document.addEventListener("click", (e) => { if (!e.target.closest(".search-pill")) sRes.hidden = true; });

  /* ---------------- Medición ---------------- */
  let measuring = false, mPts = [], mLine = null, mGroup = L.layerGroup();
  function addMeasurePoint(ll) {
    mPts.push(ll);
    L.circleMarker(ll, { radius: 5, color: "#fff", weight: 2, fillColor: "#773357", fillOpacity: 1 }).addTo(mGroup);
    if (mLine) mLine.setLatLngs(mPts); else mLine = L.polyline(mPts, { color: "#773357", weight: 3, dashArray: "6 6" }).addTo(mGroup);
    let d = 0; for (let i = 1; i < mPts.length; i++) d += mPts[i - 1].distanceTo(mPts[i]);
    $("#measureValue").textContent = d >= 1000 ? (d / 1000).toFixed(2) + " km" : Math.round(d) + " m";
  }
  function toggleMeasure(on = !measuring) {
    measuring = on;
    $("#btnMeasure").setAttribute("aria-pressed", on);
    $("#measureBanner").hidden = !on;
    document.body.classList.toggle("capturing", on || capturing);
    if (on) { stopCapture(); mGroup.addTo(map); $("#measureValue").textContent = "0 m"; }
    else { mGroup.clearLayers(); map.removeLayer(mGroup); mPts = []; mLine = null; }
  }
  $("#btnMeasure").addEventListener("click", () => toggleMeasure());
  $("#btnMeasureClear").addEventListener("click", () => toggleMeasure(false));

  /* ---------------- Otros controles ---------------- */
  $("#btnFit").addEventListener("click", fitToFiltered);
  $("#btnFullscreen").addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.();
  });
  $("#btnTheme").addEventListener("click", () => {
    prefs.theme = THEMES[(THEMES.indexOf(prefs.theme) + 1) % THEMES.length]; savePrefs(); applyTheme(prefs.theme);
    toast("Tema " + THEME_LABEL[prefs.theme]);
  });
  $("#btnSidebar").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  $(".sidebar .tabs").addEventListener("click", (e) => {
    const t = e.target.closest(".tab"); if (!t) return;
    $$(".tab").forEach((x) => { x.classList.toggle("active", x === t); x.setAttribute("aria-selected", x === t); });
    $$(".tab-panel").forEach((p) => (p.hidden = p.dataset.panel !== t.dataset.tab));
    if (innerWidth < 768) $("#sidebar").classList.add("open");
  });

  // Simbología
  $("#legendBody").innerHTML =
    Object.values(CAT.tipos).map((t) => `<div class="lg"><i style="background:${t.color}">${svgPath(t.icon)}</i>${t.label}</div>`).join("") +
    `<div class="lg-sep">Punto de estatus</div>` +
    Object.values(CAT.estatus).map((s) => `<div class="lg"><span class="ring" style="--c:${s.color}"></span>${s.label}</div>`).join("");
  const setLegend = (open) => { $("#btnLegend").setAttribute("aria-expanded", open); $("#legendBody").hidden = !open; prefs.legend = open; savePrefs(); };
  $("#btnLegend").addEventListener("click", () => setLegend($("#btnLegend").getAttribute("aria-expanded") !== "true"));

  // Menú de datos
  const menu = $("#menuData");
  $("#btnData").addEventListener("click", (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; $("#btnData").setAttribute("aria-expanded", !menu.hidden); });
  document.addEventListener("click", (e) => { if (!e.target.closest(".menu-wrap")) { menu.hidden = true; $("#btnData").setAttribute("aria-expanded", "false"); } });
  menu.addEventListener("click", (e) => { if (e.target.closest("button")) menu.hidden = true; });

  // Mapa original
  $("#btnLegacy").addEventListener("click", () => {
    const dlg = $("#legacyModal"), fr = $("iframe", dlg);
    if (!fr.src) fr.src = fr.dataset.src;
    dlg.showModal();
  });
  $$("#legacyModal [data-close]").forEach((b) => b.addEventListener("click", () => $("#legacyModal").close()));

  // Acciones del estado vacío
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-action]"); if (!a) return;
    ({ new: newRequest, import: () => $("#importFile").click(), seed: seedDemo, "reset-filters": resetFilters })[a.dataset.action]?.();
  });

  // Teclado
  document.addEventListener("keydown", (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (e.key === "/" && !typing) { e.preventDefault(); sInput.focus(); }
    if ((e.key === "n" || e.key === "N") && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !formState && !document.querySelector("dialog[open]")) newRequest();
    if (e.key === "Escape") {
      if (measuring) toggleMeasure(false);
      else if (capturing) { stopCapture(); if (formState) openDrawer(); }
      else if (drawer.classList.contains("open") && !document.querySelector("dialog[open]")) $("#btnCloseDrawer").click();
    }
  });

  /* ---------------- Exportar ---------------- */
  const FIELDS = ["folio", "titulo", "tipo", "estatus", "prioridad", "avance", "municipio", "localidad", "direccion", "lat", "lng", "monto", "beneficiarios", "solicitante", "tipoSolicitante", "telefono", "correo", "dependencia", "fecha", "descripcion"];
  function download(name, content, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const exportRows = () => (isFiltered() || filters.q ? filtered : items);

  menu.addEventListener("click", (e) => {
    const b = e.target.closest("[data-export]"); if (!b) return;
    const rows = exportRows();
    if (!rows.length) return toast("No hay solicitudes para exportar", "err");
    const kind = b.dataset.export;
    const plain = (it) => ({ ...Object.fromEntries(FIELDS.map((k) => [k, it[k] ?? ""])), tipo_label: tipoOf(it.tipo).label, estatus_label: estOf(it.estatus).label });
    if (kind === "csv") {
      const cols = [...FIELDS, "tipo_label", "estatus_label"];
      const cell = (v) => { const s = String(v ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const csv = "﻿" + cols.join(",") + "\n" + rows.map((it) => { const p = plain(it); return cols.map((c) => cell(p[c])).join(","); }).join("\n");
      download(`solicitudes-obra-${stamp()}.csv`, csv, "text/csv;charset=utf-8");
    } else if (kind === "geojson") {
      const gj = { type: "FeatureCollection", features: rows.map((it) => ({ type: "Feature", geometry: { type: "Point", coordinates: [it.lng, it.lat] }, properties: { ...plain(it), historial: it.historial || [], fotos: it.fotos || [] } })) };
      download(`solicitudes-obra-${stamp()}.geojson`, JSON.stringify(gj, null, 1), "application/geo+json");
    } else if (kind === "kml") {
      const x = (s) => esc(s);
      const kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Solicitudes de obra</name>\n` +
        Object.entries(CAT.tipos).map(([k, t]) => `<Style id="t-${k}"><IconStyle><color>ff${t.color.slice(5, 7)}${t.color.slice(3, 5)}${t.color.slice(1, 3)}</color><Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon></IconStyle></Style>`).join("\n") +
        rows.map((it) => { const p = plain(it); return `<Placemark><name>${x(it.titulo)}</name><styleUrl>#t-${CAT.tipos[it.tipo] ? it.tipo : "otro"}</styleUrl><description>${x(`${it.folio} · ${p.tipo_label} · ${p.estatus_label}\n${it.descripcion || ""}`)}</description><ExtendedData>${FIELDS.filter((k) => !["lat", "lng"].includes(k)).map((k) => `<Data name="${k}"><value>${x(p[k])}</value></Data>`).join("")}</ExtendedData><Point><coordinates>${it.lng},${it.lat},0</coordinates></Point></Placemark>`; }).join("\n") +
        `\n</Document></kml>`;
      download(`solicitudes-obra-${stamp()}.kml`, kml, "application/vnd.google-earth.kml+xml");
    }
    toast(`${rows.length} solicitudes exportadas${rows !== items ? " (con filtros)" : ""}`);
  });

  /* ---------------- Importar ---------------- */
  $("#btnImport").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", async (e) => {
    const file = e.target.files[0]; e.target.value = "";
    if (!file) return;
    if (/\.kmz$/i.test(file.name)) return toast("Exporta como .KML (no .KMZ) desde Google My Maps", "err");
    try {
      const text = await file.text();
      let recs = [];
      if (/\.kml$/i.test(file.name) || text.trim().startsWith("<")) recs = parseKML(text);
      else if (/\.csv$/i.test(file.name)) recs = parseCSV(text);
      else recs = parseGeoJSON(JSON.parse(text));
      recs = recs.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
      if (!recs.length) return toast("No se encontraron puntos con coordenadas en el archivo", "err");
      const existing = new Set(items.map((i) => i.folio));
      let added = 0, updated = 0;
      recs.forEach((r) => {
        const norm_ = normalizeRecord(r);
        const prev = r.folio && items.find((i) => i.folio === r.folio);
        if (prev) { Object.assign(prev, norm_, { id: prev.id, historial: prev.historial }); log(prev, "Actualizada por importación"); updated++; }
        else {
          if (!norm_.folio || existing.has(norm_.folio)) norm_.folio = nextFolioAfter(existing);
          existing.add(norm_.folio);
          norm_.historial = [{ t: new Date().toISOString(), txt: `Importada desde ${file.name}` }];
          items.push(norm_); added++;
        }
      });
      saveItems(); render(); fitToFiltered();
      toast(`Importación: ${added} nuevas${updated ? `, ${updated} actualizadas` : ""}`);
    } catch (err) {
      console.error(err); toast("No se pudo leer el archivo", "err");
    }
  });

  function nextFolioAfter(set) {
    const y = new Date().getFullYear(); let n = 1;
    set.forEach((f) => { const r = /SDO-(\d{4})-(\d+)/.exec(f); if (r && +r[1] === y) n = Math.max(n, +r[2] + 1); });
    return `SDO-${y}-${String(n).padStart(4, "0")}`;
  }

  function guessTipo(s) {
    const t = norm(s);
    if (!t) return "otro";
    for (const [k, v] of Object.entries(CAT.tipos)) if (k === t || norm(v.label) === t) return k;
    const rules = [["agua", /agua|pozo|tanque|hidraul|potable/], ["drenaje", /drenaje|alcantar|sanitari|colector|pluvial/], ["pavimentacion", /pavimen|asfalt|bache|calle|concreto|adoquin|banqueta/], ["alumbrado", /alumbr|luminar|lampara|electrific/], ["educacion", /escuela|aula|educa|primaria|secundaria|kinder|preparatoria/], ["salud", /salud|clinica|hospital|centro de salud/], ["espacio", /parque|plaza|cancha|deport|jardin|espacio/], ["vivienda", /vivienda|casa|techo|piso firme/], ["puente", /puente|camino|carretera|vado|brecha/]];
    return (rules.find(([, re]) => re.test(t)) || ["otro"])[0];
  }
  function guessEstatus(s) {
    const t = norm(s);
    for (const [k, v] of Object.entries(CAT.estatus)) if (k === t || norm(v.label) === t) return k;
    if (/conclu|terminad|finaliz/.test(t)) return "concluida";
    if (/ejecu|proceso|obra/.test(t)) return "ejecucion";
    if (/aprob|autoriz/.test(t)) return "aprobada";
    if (/revis|analisis|validac/.test(t)) return "revision";
    if (/rechaz|cancel|improced/.test(t)) return "rechazada";
    return "recibida";
  }
  function guessMunicipio(s) {
    const t = norm(s); if (!t) return "";
    return CAT.municipios.find((m) => norm(m) === t) || CAT.municipios.find((m) => t.includes(norm(m))) || "";
  }
  function normalizeRecord(r) {
    const text = [r.titulo, r.descripcion, r.tipo, r.folder].join(" ");
    return {
      id: uid(), folio: r.folio || "", titulo: (r.titulo || "Solicitud sin nombre").slice(0, 140),
      tipo: CAT.tipos[r.tipo] ? r.tipo : guessTipo(r.tipo || r.tipo_label || r.folder || text),
      estatus: CAT.estatus[r.estatus] ? r.estatus : guessEstatus(r.estatus || r.estatus_label || ""),
      prioridad: CAT.prioridades[r.prioridad] ? r.prioridad : (/alta/i.test(r.prioridad) ? "alta" : /baja/i.test(r.prioridad) ? "baja" : "media"),
      avance: +r.avance || 0, lat: +r.lat, lng: +r.lng,
      municipio: guessMunicipio(r.municipio) || guessMunicipio(text), localidad: r.localidad || "", direccion: r.direccion || "",
      monto: +String(r.monto || "").replace(/[^\d.]/g, "") || 0, beneficiarios: +String(r.beneficiarios || "").replace(/[^\d]/g, "") || 0,
      solicitante: r.solicitante || "", tipoSolicitante: r.tipoSolicitante || "", telefono: r.telefono || "", correo: r.correo || "",
      dependencia: r.dependencia || "", fecha: /^\d{4}-\d{2}-\d{2}/.test(r.fecha || "") ? r.fecha.slice(0, 10) : today(),
      descripcion: r.descripcion || "", fotos: Array.isArray(r.fotos) ? r.fotos.slice(0, MAX_FOTOS) : [],
      creado: new Date().toISOString()
    };
  }

  function parseKML(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("KML inválido");
    return [...doc.getElementsByTagName("Placemark")].map((pm) => {
      const get = (tag) => pm.getElementsByTagName(tag)[0]?.textContent?.trim() || "";
      const coordsTxt = pm.getElementsByTagName("Point")[0]?.getElementsByTagName("coordinates")[0]?.textContent?.trim()
        || pm.getElementsByTagName("coordinates")[0]?.textContent?.trim() || "";
      const first = coordsTxt.split(/\s+/)[0] || "";
      const [lng, lat] = first.split(",").map(Number);
      const rec = { titulo: get("name"), lat, lng };
      [...pm.getElementsByTagName("Data")].forEach((d) => {
        const k = d.getAttribute("name"); const v = d.getElementsByTagName("value")[0]?.textContent?.trim() || "";
        const key = matchField(k); if (key) rec[key] = v;
      });
      const desc = get("description").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
      if (!rec.descripcion) rec.descripcion = desc;
      const folder = pm.parentElement?.tagName === "Folder" ? pm.parentElement.getElementsByTagName("name")[0]?.textContent : "";
      rec.folder = folder || "";
      return rec;
    });
  }
  const ALIASES = {
    folio: ["folio", "id", "clave"], titulo: ["titulo", "nombre", "name", "obra", "nombre de la obra"], tipo: ["tipo", "tipo de obra", "categoria", "rubro"],
    estatus: ["estatus", "status", "estado", "situacion"], prioridad: ["prioridad"], avance: ["avance", "avance fisico"],
    municipio: ["municipio"], localidad: ["localidad", "colonia", "comunidad"], direccion: ["direccion", "domicilio", "calle", "ubicacion"],
    lat: ["lat", "latitud", "latitude", "y"], lng: ["lng", "lon", "long", "longitud", "longitude", "x"],
    monto: ["monto", "costo", "importe", "inversion", "presupuesto"], beneficiarios: ["beneficiarios", "poblacion", "habitantes"],
    solicitante: ["solicitante", "peticionario", "responsable de la solicitud"], tipoSolicitante: ["tiposolicitante", "tipo de solicitante"],
    telefono: ["telefono", "tel", "celular"], correo: ["correo", "email", "e-mail"], dependencia: ["dependencia", "area", "ejecutor"],
    fecha: ["fecha", "fecha de solicitud"], descripcion: ["descripcion", "description", "observaciones", "necesidad"],
    tipo_label: ["tipo_label"], estatus_label: ["estatus_label"]
  };
  function matchField(k) { const n = norm(k).replace(/_/g, " "); return Object.keys(ALIASES).find((f) => ALIASES[f].some((a) => norm(a) === n) || norm(f) === norm(k)); }

  function parseCSV(text) {
    text = text.replace(/^﻿/, "");
    const delim = (text.split("\n")[0].match(/;/g) || []).length > (text.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
    const rows = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === delim) { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const head = rows.shift().map(matchField);
    return rows.filter((r) => r.some((c) => c.trim())).map((r) => {
      const o = {}; head.forEach((h, i) => { if (h) o[h] = r[i]?.trim(); });
      o.lat = parseFloat(String(o.lat).replace(",", ".")); o.lng = parseFloat(String(o.lng).replace(",", "."));
      return o;
    });
  }
  function parseGeoJSON(gj) {
    const feats = gj.type === "FeatureCollection" ? gj.features : gj.type === "Feature" ? [gj] : Array.isArray(gj) ? gj : [];
    return feats.map((f) => {
      if (f.lat != null) return f; // arreglo de registros planos
      if (f.geometry?.type !== "Point") return null;
      const o = {}; Object.entries(f.properties || {}).forEach(([k, v]) => { const m = matchField(k); if (m) o[m] = v; });
      if (f.properties?.historial) o.historial = f.properties.historial;
      if (f.properties?.fotos) o.fotos = f.properties.fotos;
      o.lng = f.geometry.coordinates[0]; o.lat = f.geometry.coordinates[1];
      return o;
    }).filter(Boolean);
  }

  /* ---------------- Borrar todo ---------------- */
  $("#btnClear").addEventListener("click", async () => {
    if (!items.length) return toast("No hay solicitudes", "err");
    if (!(await confirmDialog("¿Borrar todas las solicitudes?", `Se eliminarán ${items.length} solicitudes de este navegador. Te recomendamos exportar antes un respaldo.`, "Borrar todo"))) return;
    const backup = items; items = []; saveItems(); closeDrawer(); render();
    toast("Solicitudes borradas", "ok", { label: "Deshacer", fn: () => { items = backup; saveItems(); render(); } });
  });

  /* ---------------- Datos de ejemplo ---------------- */
  function seedDemo() {
    if (items.some((i) => i.demo)) return toast("Los datos de ejemplo ya están cargados", "err");
    const seats = [["Cuernavaca", 18.9186, -99.2342], ["Cuautla", 18.8121, -98.9548], ["Jiutepec", 18.8823, -99.1775], ["Temixco", 18.854, -99.225], ["Yautepec", 18.8838, -99.0667], ["Jojutla", 18.615, -99.18], ["Emiliano Zapata", 18.842, -99.184], ["Ayala", 18.765, -98.985], ["Xochitepec", 18.78, -99.23], ["Tepoztlán", 18.985, -99.099], ["Puente de Ixtla", 18.615, -99.32], ["Zacatepec", 18.655, -99.19], ["Yecapixtla", 18.883, -98.865], ["Axochiapan", 18.503, -98.752], ["Tlaltizapán de Zapata", 18.685, -99.118], ["Huitzilac", 19.029, -99.267]];
    const names = { pavimentacion: ["Pavimentación de calle principal", "Rehabilitación de vialidad", "Bacheo y carpeta asfáltica"], agua: ["Ampliación de red de agua potable", "Rehabilitación de pozo", "Tanque de almacenamiento"], drenaje: ["Red de drenaje sanitario", "Colector pluvial", "Rehabilitación de alcantarillado"], alumbrado: ["Alumbrado público LED", "Electrificación de colonia"], educacion: ["Construcción de aula", "Techumbre en escuela primaria", "Rehabilitación de sanitarios escolares"], salud: ["Ampliación de centro de salud", "Rehabilitación de consultorio comunitario"], espacio: ["Rehabilitación de cancha", "Parque de bolsillo", "Mejora de plaza cívica"], vivienda: ["Programa de techo firme", "Mejoramiento de vivienda"], puente: ["Puente peatonal", "Rehabilitación de camino rural", "Vado en barranca"], otro: ["Mercado municipal", "Panteón: barda perimetral"] };
    const tk = Object.keys(CAT.tipos), ek = Object.keys(CAT.estatus), pk = Object.keys(CAT.prioridades);
    const rnd = (a) => a[Math.floor(Math.random() * a.length)];
    const existing = new Set(items.map((i) => i.folio));
    for (let i = 0; i < 48; i++) {
      const [mun, la, ln] = rnd(seats), tipo = rnd(tk), est = rnd(ek);
      const d = new Date(Date.now() - Math.random() * 300 * 864e5).toISOString().slice(0, 10);
      const folio = nextFolioAfter(existing); existing.add(folio);
      items.push({
        id: uid(), folio, demo: true, titulo: rnd(names[tipo]), tipo, estatus: est, prioridad: rnd(pk),
        avance: est === "concluida" ? 100 : est === "ejecucion" ? 10 + Math.round(Math.random() * 17) * 5 : 0,
        lat: la + (Math.random() - 0.5) * 0.05, lng: ln + (Math.random() - 0.5) * 0.05,
        municipio: mun, localidad: "Localidad de ejemplo", direccion: "", monto: Math.round(Math.random() * 90 + 2) * 50000,
        beneficiarios: Math.round(Math.random() * 3000 + 50), solicitante: "Solicitante de ejemplo", tipoSolicitante: rnd(["Ciudadano/a", "Comité vecinal", "Ayudantía municipal", "Ayuntamiento"]),
        telefono: "", correo: "", dependencia: "", fecha: d, descripcion: "Registro de ejemplo para explorar el mapa. Puedes eliminarlo cuando quieras.", fotos: [],
        creado: new Date().toISOString(), historial: [{ t: new Date().toISOString(), txt: "Registro de ejemplo" }]
      });
    }
    saveItems(); render(); fitToFiltered();
    toast("48 solicitudes de ejemplo cargadas", "ok", { label: "Quitar", fn: () => { items = items.filter((i) => !i.demo); saveItems(); render(); } });
  }
  $("#btnSeed").addEventListener("click", seedDemo);

  /* ---------------- Capas del mapa SDO original (Google My Maps) ---------------- */
  map.createPane("legacyPoly").style.zIndex = 380;
  map.createPane("legacyPts").style.zIndex = 590;
  const legacy = { layers: [], groups: new Map(), feats: [] };
  const LABEL_FIX = (n) => n.replace(/^3do /, "3er ").trim();
  const isMoney = (k) => /monto/i.test(k);
  const prettyKey = (k) => (k === k.toUpperCase() ? k.charAt(0) + k.slice(1).toLowerCase() : k.replace(/_/g, " "));
  const TITLE_KEYS = ["NOMBRE DE LA OBRA", "PLANEACION", "PETICIÓN O ASUNTO", "OBRA", "Plantel"];

  function legacyPopup(f, layer) {
    const p = f.properties, fl = p.fields || {};
    const tk = TITLE_KEYS.find((k) => fl[k]);
    const desc = tk ? fl[tk] : "";
    const rest = Object.entries(fl).filter(([k]) => k !== tk);
    return `<div class="pop pop-legacy">
      <div class="pop-folio"><i class="lg-dot" style="background:${p.color}"></i>${esc(layer.name)}</div>
      <div class="pop-title">${esc(p.name || "Sin nombre")}</div>
      ${desc ? `<p class="pop-desc">${esc(desc)}</p>` : ""}
      ${rest.length ? `<dl class="pop-dl">${rest.map(([k, v]) => `<dt>${esc(prettyKey(k))}</dt><dd${isMoney(k) ? ' class="money"' : ""}>${esc(v)}</dd>`).join("")}</dl>` : ""}
    </div>`;
  }

  function buildLegacy(data) {
    legacy.layers = data.layers.map((l) => ({ ...l, name: LABEL_FIX(l.name) }));
    const saved = prefs.layers || {};
    for (const l of legacy.layers) {
      const feats = data.features.filter((f) => f.properties.layer === l.id);
      const isBase = /capa base/i.test(l.name);
      l.isBase = isBase;
      const g = L.geoJSON(feats, {
        pane: l.kind === "point" ? "legacyPts" : "legacyPoly",
        pointToLayer: (f, ll) => L.circleMarker(ll, { pane: "legacyPts", radius: 7, color: "#fff", weight: 2, fillColor: f.properties.color, fillOpacity: 0.95 }),
        style: (f) => isBase
          ? { color: "#773357", weight: 1.2, opacity: 0.6, fillColor: "#773357", fillOpacity: 0.02, dashArray: "4 3" }
          : { color: f.properties.color, weight: 1.5, opacity: 0.9, fillColor: f.properties.color, fillOpacity: 0.22 },
        onEachFeature: (f, lyr) => {
          if (isBase) {
            const mun = CAT.municipios.find((m) => norm(m).startsWith(norm(f.properties.name).slice(0, 6))) || f.properties.name;
            if (mun) lyr.bindTooltip(esc(mun), { sticky: true, className: "legacy-tip", opacity: 0.95 });
          } else {
            lyr.bindPopup(() => legacyPopup(f, l), { maxWidth: 320, className: "legacy-popup" });
            if (f.properties.name) lyr.bindTooltip(esc(f.properties.name), { sticky: l.kind !== "point", direction: "top", className: "legacy-tip", opacity: 0.95 });
            if (l.kind !== "point") {
              lyr.on("mouseover", () => lyr.setStyle({ fillOpacity: 0.4, weight: 2.5 }));
              lyr.on("mouseout", () => g.resetStyle(lyr));
            }
          }
          legacy.feats.push({ f, lyr, layer: l });
        }
      });
      legacy.groups.set(l.id, g);
      l.visible = saved[l.id] !== false;
      if (l.visible) g.addTo(map);
    }
    const nPts = data.features.filter((f) => f.geometry.type === "Point").length;
    $("#layersMeta").textContent = `${nPts} puntos y ${data.features.length - nPts} polígonos${data.updated ? " · " + data.updated : ""}`;
    drawLayerList();
  }

  function drawLayerList() {
    $("#layerList").innerHTML = legacy.layers.map((l) => {
      const colors = [...new Set(legacy.feats.filter((x) => x.layer.id === l.id).map((x) => x.f.properties.color))].slice(0, 4);
      const sw = l.kind === "point"
        ? `<span class="ly-sw">${colors.map((c) => `<i class="lg-dot" style="background:${c}"></i>`).join("")}</span>`
        : `<span class="ly-sw"><i class="ly-poly${l.isBase ? " dashed" : ""}" style="--c:${l.isBase ? "#773357" : colors[0]}"></i></span>`;
      return `<div class="ly-row${l.visible ? " on" : ""}" data-ly="${l.id}">
        <label class="ly-label"><input type="checkbox" ${l.visible ? "checked" : ""}>${sw}<span class="ly-name">${esc(l.name)}<small>${l.count} ${l.kind === "point" ? "puntos" : "polígonos"}</small></span></label>
        <button class="ly-zoom" type="button" title="Acercar a la capa" aria-label="Acercar a ${esc(l.name)}">${svgPath("M21 21l-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM8 11h6M11 8v6")}</button>
      </div>`;
    }).join("");
  }
  function setLayerVisible(id, on) {
    const l = legacy.layers.find((x) => x.id === id), g = legacy.groups.get(id); if (!l || !g) return;
    l.visible = on; if (on) g.addTo(map); else map.removeLayer(g);
    prefs.layers = Object.fromEntries(legacy.layers.map((x) => [x.id, x.visible])); savePrefs();
  }
  $("#layerList").addEventListener("change", (e) => {
    const row = e.target.closest(".ly-row"); if (!row) return;
    setLayerVisible(row.dataset.ly, e.target.checked); row.classList.toggle("on", e.target.checked);
  });
  $("#layerList").addEventListener("click", (e) => {
    const z = e.target.closest(".ly-zoom"); if (!z) return;
    const id = z.closest(".ly-row").dataset.ly, g = legacy.groups.get(id);
    if (!legacy.layers.find((x) => x.id === id).visible) { setLayerVisible(id, true); drawLayerList(); }
    map.flyToBounds(g.getBounds().pad(0.1), { maxZoom: 15, duration: 0.6 });
  });
  const setAllLayers = (on) => { legacy.layers.forEach((l) => setLayerVisible(l.id, on)); drawLayerList(); };
  $("#btnLayersAll").addEventListener("click", () => setAllLayers(true));
  $("#btnLayersNone").addEventListener("click", () => setAllLayers(false));

  // La búsqueda también encuentra puntos de las capas originales visibles
  function legacyHits(q) {
    const n = norm(q); if (n.length < 2) return [];
    return legacy.feats.filter((x) => x.f.geometry.type === "Point" && x.layer.visible &&
      norm([x.f.properties.name, ...Object.values(x.f.properties.fields || {})].join(" ")).includes(n)).slice(0, 6);
  }

  fetch("data/sdo-original.geojson?v=4").then((r) => r.json()).then(buildLegacy)
    .catch(() => { $("#layersMeta").textContent = "No se pudieron cargar las capas originales."; });

  /* ---------------- Arranque ---------------- */
  applyTheme(prefs.theme);
  setBasemap(prefs.basemap);
  loadItems();
  setLegend(prefs.legend !== false && innerWidth >= 768 && items.length > 0);
  render();
  if (items.length) map.fitBounds(L.latLngBounds(items.map((i) => [i.lat, i.lng])).pad(0.15), { maxZoom: 14 });
  else map.fitBounds(CAT.bounds);
  // Sin solicitudes capturadas aún: abre la pestaña de capas para que se vea qué hay en el mapa
  if (!items.length) $('.tab[data-tab="layers"]').click();

  // Enlace directo: #SDO-2026-0001
  const openFromHash = () => {
    const f = decodeURIComponent(location.hash.slice(1)); if (!f) return;
    const it = items.find((i) => i.folio === f); if (it && it.id !== selectedId) openDetail(it.id);
  };
  window.addEventListener("hashchange", openFromHash);
  setTimeout(openFromHash, 300);
})();
