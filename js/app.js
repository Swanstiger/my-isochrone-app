const apiKey = "5b3ce3597851110001cf624845cfd06eb29d4faf8d5f3a0fea303e83"; // Reemplaza con tu clave de OpenRouteService

// Configura el mapa
const map = L.map("map").setView([39.4699, -0.3763], 12); // Valencia como coordenadas predeterminadas
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
}).addTo(map);

// Variables para punto y capas de isocronas
let currentPoint = null;
let isochronesLayer; // Definir la capa globalmente
const tableBody = document.querySelector("#isochroneTable tbody"); // Agrega esta línea

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
    const rangeType = document.getElementById("range-type").value;

    if (!input) {
        alert("Por favor, introduce los valores de las isocronas en minutos.");
        return;
    }

    if (!transportMode || !rangeType) {
        alert("Por favor, selecciona el modo de transporte y el tipo de rango.");
        return;
    }

    const ranges = input
        .split(",")
        .map((value) => parseInt(value.trim()))
        .filter((value) => !isNaN(value) && value > 0);

    if (ranges.length === 0) {
        alert("Por favor, introduce valores válidos de isocronas.");
        return;
    }

    const coordinates = currentPoint.getLatLng();

    try {
        const url = `https://api.openrouteservice.org/v2/isochrones/${transportMode}`;
        const body = JSON.stringify({
            locations: [[coordinates.lng, coordinates.lat]],
            range: ranges.map((minute) => minute * 60),
            smoothing : 0.5 ,
            range_type: rangeType,
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

        // Limpia las capas anteriores y las filas de la tabla
        if (isochronesLayer) {
            map.removeLayer(isochronesLayer);
        }
        tableBody.innerHTML = "";

        // Crea una nueva capa para las isocronas
        isochronesLayer = L.layerGroup();
        data.features.forEach(({ properties: { total_pop }, geometry }, index) => {
            const color = getColorForRange(index, ranges.length);
            const duration = ranges[index] || "Desconocido";
            
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
            addRowToTable(duration, total_pop || "No disponible");
        });

        isochronesLayer.addTo(map);
    } catch (error) {
        alert(`Error al generar las isocronas: ${error.message}`);
        console.error(error); // Para depuración
    }
}

// Función para agregar filas a la tabla
function addRowToTable(duration, population) {
    const row = document.createElement("tr");
    const durationCell = document.createElement("td");
    const populationCell = document.createElement("td");

    durationCell.textContent = `${duration} minutos`;
    populationCell.textContent = population || "No disponible";

    row.appendChild(durationCell);
    row.appendChild(populationCell);
    tableBody.appendChild(row);
}

// Función para asignar colores
function getColorForRange(index, totalRanges) {
  const colors = [
    "#FF0000",
    "#FF7F00",
    "#FFFF00",
    "#7FFF00",
    "#00FF00",
    "#00FFFF",
    "#0000FF"
  ];
  return colors[index % colors.length];
}
