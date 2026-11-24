/* Catálogos del sistema SDO — edita aquí para ajustar tipos, estatus o municipios. */
window.SDO_CAT = {
  // Centro y límites aproximados del estado de Morelos
  center: [18.75, -99.07],
  zoom: 10,
  bounds: [[18.33, -99.50], [19.14, -98.63]],

  municipios: [
    "Amacuzac", "Atlatlahucan", "Axochiapan", "Ayala", "Coatetelco", "Coatlán del Río",
    "Cuautla", "Cuernavaca", "Emiliano Zapata", "Hueyapan", "Huitzilac", "Jantetelco",
    "Jiutepec", "Jojutla", "Jonacatepec de Leandro Valle", "Mazatepec", "Miacatlán",
    "Ocuituco", "Puente de Ixtla", "Temixco", "Temoac", "Tepalcingo", "Tepoztlán",
    "Tetecala", "Tetela del Volcán", "Tlalnepantla", "Tlaltizapán de Zapata",
    "Tlaquiltenango", "Tlayacapan", "Totolapan", "Xochitepec", "Xoxocotla", "Yautepec",
    "Yecapixtla", "Zacatepec", "Zacualpan de Amilpas"
  ],

  // color: color del marcador · icon: trazo SVG (viewBox 24)
  tipos: {
    pavimentacion: { label: "Pavimentación", color: "#5b4221", icon: "M4 20 9 4h6l5 16M12 6v2M12 11v2M12 16v2" },
    agua:          { label: "Agua potable",  color: "#3266cb", icon: "M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11Z" },
    drenaje:       { label: "Drenaje",       color: "#546250", icon: "M4 8h16M6 8v8a6 6 0 0 0 12 0V8M10 12h4" },
    alumbrado:     { label: "Alumbrado",     color: "#be8800", icon: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5V16h8v-2.5A6 6 0 0 0 12 3Z" },
    educacion:     { label: "Educación",     color: "#773357", icon: "M3 9l9-5 9 5-9 5-9-5ZM7 11v5c3 2 7 2 10 0v-5" },
    salud:         { label: "Salud",         color: "#da3237", icon: "M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z" },
    espacio:       { label: "Espacio público", color: "#039409", icon: "M12 3 7 10h3l-4 6h12l-4-6h3zM12 16v5" },
    vivienda:      { label: "Vivienda",      color: "#8f724d", icon: "M3 11 12 4l9 7M5 10v10h14V10M10 20v-5h4v5" },
    puente:        { label: "Puentes / caminos", color: "#47473e", icon: "M2 16h20M4 16c2-5 14-5 16 0M7 16v-2.5M12 16v-4M17 16v-2.5" },
    otro:          { label: "Otro",          color: "#5d5e5f", icon: "M12 8v5M12 16.5v.5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z" }
  },

  estatus: {
    recibida:   { label: "Recibida",     color: "#5d5e5f" },
    revision:   { label: "En revisión",  color: "#3266cb" },
    aprobada:   { label: "Aprobada",     color: "#71785b" },
    ejecucion:  { label: "En ejecución", color: "#be8800" },
    concluida:  { label: "Concluida",    color: "#1c7d29" },
    rechazada:  { label: "Rechazada",    color: "#da3237" }
  },

  prioridades: {
    alta:  { label: "Alta",  weight: 3 },
    media: { label: "Media", weight: 2 },
    baja:  { label: "Baja",  weight: 1 }
  }
};
