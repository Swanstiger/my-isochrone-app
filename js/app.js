const apiKey = "5b3ce3597851110001cf624845cfd06eb29d4faf8d5f3a0fea303e83"; // Reemplaza con tu clave de OpenRouteService

// Configura el mapa
const map = L.map("map").setView([39.4699, -0.3763], 12); // Valencia como coordenadas predeterminadas
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
}).addTo(map);

// Variables para punto y capas de isocronas
let currentPoint = null;
let isochronesLayer; // Definir la capa globalmente
const infoPanel = document.getElementById("infoPanel"); // El panel lateral

// Función para eliminar el punto y las isocronas
function removePoint(marker) {
  if (currentPoint === marker) {
    map.removeLayer(marker);
    currentPoint = null;
    if (isochronesLayer) {
      map.removeLayer(isochronesLayer);
      isochronesLayer = null;
    }
  }
}

// Evento de clic en el mapa para agregar un punto
map.on("click", function (event) {
  if (currentPoint) {
    alert("Ya hay un punto seleccionado. Elimínalo antes de añadir otro.");
    return;
  }

  const { lat, lng } = event.latlng;

  // Crear marcador en la ubicación clicada
  currentPoint = L.marker([lat, lng], { draggable: false })
    .addTo(map)
    .bindPopup("Punto seleccionado")
    .openPopup();

  // Evento de clic derecho para eliminar el marcador
  currentPoint.on("contextmenu", function () {
    removePoint(currentPoint);
  });
});

async function generateIsochrones() {
  if (!currentPoint) {
    alert("Por favor, selecciona un punto en el mapa.");
    return;
  }

  const input = document.getElementById("isochroneInput").value;
  const transportMode = document.getElementById("transport-mode").value;

  if (!input) {
    alert("Por favor, introduce los valores de las isocronas en minutos.");
    return;
  }

  if (!transportMode) {
    alert("Por favor, selecciona el modo de transporte.");
    return;
  }

 // Define los factores de tráfico según el modo de transporte
 let trafficFactor;
 if (transportMode === "driving-car") {
   trafficFactor = 0.55; // Factor para coche
 } else if (transportMode === "foot-walking") {
   trafficFactor = 0.85; // Factor para caminar
 } else {
   trafficFactor = 1; // Sin ajuste para otros modos
 }




  const ranges = input
    .split(",")
    .map((value) => parseInt(value.trim()))
    .filter((value) => !isNaN(value) && value > 0)
    .map((minute) => minute * 60 * trafficFactor);

  if (ranges.length === 0) {
    alert("Por favor, introduce valores válidos de isocronas.");
    return;
  }

  const coordinates = currentPoint.getLatLng();

  try {
    const url = `https://api.openrouteservice.org/v2/isochrones/${transportMode}`;
    const trafficFactor = 0.65;
    const body = JSON.stringify({
      locations: [[coordinates.lng, coordinates.lat]],
      range: ranges, // Multiplicamos por 60 para convertir los minutos a segundos
      smoothing:0,
      range_type: "time", // Fijamos el tipo de rango a "time"
      attributes: ["total_pop"]
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey
      },
      body: body
    });

    if (!response.ok) {
      throw new Error(`Error en la API: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();

    // Limpia las capas anteriores y los contenidos del panel
    if (isochronesLayer) {
      map.removeLayer(isochronesLayer);
    }
    infoPanel.innerHTML = "<h2>Detalles de las Isocronas</h2>"; // Limpiar el panel antes de agregar nueva información

    // Crea una nueva capa para las isocronas
    isochronesLayer = L.layerGroup();
    data.features.forEach(({ properties: { total_pop }, geometry }, index) => {
      const color = getColorForRange(index, ranges.length);
      const duration = ranges[index] / 60|| "Desconocido";
      
      const layer = L.geoJSON({ type: "Feature", geometry }, {
        style: {
          fillColor: color,
          weight: 1,
          opacity: 1,
          color: color,
          fillOpacity: 0.4
        }
      }).bindPopup(`Isocrona: ${duration} minutos<br>Población Total: ${total_pop || "No disponible"}`);

      layer.addTo(isochronesLayer);
      addInfoToPanel(duration, total_pop || "No disponible");
    });

    isochronesLayer.addTo(map);

    // Mostrar el panel lateral
    infoPanel.style.display = "block";
  } catch (error) {
    alert(`Error al generar las isocronas: ${error.message}`);
    console.error(error); // Para depuración
  }
}

// Función para agregar la información al panel
function addInfoToPanel(duration, population) {
  const infoDiv = document.createElement("div");
  infoDiv.classList.add("isochrone-info");

  const durationSpan = document.createElement("span");
  durationSpan.textContent = `Isocrona: ${duration} minutos - `;
  infoDiv.appendChild(durationSpan);

  const populationSpan = document.createElement("span");
  populationSpan.textContent = `Población total: ${population}`;
  infoDiv.appendChild(populationSpan);

  infoPanel.appendChild(infoDiv);
}

// Función para obtener un color basado en el índice de la isocrona
function getColorForRange(index, totalRanges) {
  const colorScale = [
    "#FF0000", // rojo
    "#FF7F00", // naranja
    "#FFFF00", // amarillo
    "#00FF00", // verde
    "#0000FF", // azul
    "#800080"  // púrpura
  ];

  return colorScale[index % colorScale.length];
}
