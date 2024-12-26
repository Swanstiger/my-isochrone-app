const apiKey = "5b3ce3597851110001cf624845cfd06eb29d4faf8d5f3a0fea303e83"; // Reemplaza con tu clave de OpenRouteService
const apiUrl = "https://api.openrouteservice.org/v2/isochrones/"; // Asegúrate de que está definido correctamente

const map = L.map('map').setView([39.4699, -0.3763], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let isochronesLayer = L.layerGroup().addTo(map);
let points = [];
let isochronesData = [];
let isochroneLayers = [];
let dataTable; // Variable para almacenar la instancia de DataTables
let generatedCombinations = new Set(); // Conjunto para almacenar combinaciones generadas
const colorMap = {}; // Mapa para almacenar colores asignados a combinaciones de tiempo y modo
const pointIdentifiers = new Map(); // Mapa para almacenar identificadores únicos para cada punto
let isochroneCounter = 1; // Contador global para asignar identificadores únicos
const reservedIdentifiers = new Set(); // Conjunto para almacenar identificadores reservados
const availableIdentifiers = []; // Array para almacenar identificadores disponibles para reutilización

map.on('click', function (e) {
    const marker = L.marker(e.latlng, { draggable: true }).addTo(map);
    points.push(marker);

    // Asignar un identificador único al punto si no tiene uno
    if (!pointIdentifiers.has(marker)) {
        let identifier;
        if (availableIdentifiers.length > 0) {
            identifier = availableIdentifiers.pop(); // Reutilizar un identificador disponible
        } else {
            identifier = `ISO-${isochroneCounter++}`;
        }

        pointIdentifiers.set(marker, identifier);
    }

    const isochroneName = pointIdentifiers.get(marker); // Obtener el nombre de la isocrona

    marker.bindPopup(`${isochroneName}`).openPopup(); // Mostrar el nombre de la isocrona
    marker.on('contextmenu', function () {
        map.removeLayer(marker);
        points = points.filter(p => p !== marker);

        const identifier = pointIdentifiers.get(marker);

        // Reservar el identificador si el punto tiene isocronas asociadas
        if (isochronesData.some(data => data.geojson.properties.identifier === identifier)) {
            reservedIdentifiers.add(identifier);
        } else {
            availableIdentifiers.push(identifier); // Hacer disponible el identificador si no tiene isocronas
        }

        pointIdentifiers.delete(marker); // Eliminar el identificador del mapa
    });
});

async function generateIsochrones() {
    const input = document.getElementById('isochroneInput').value;
    const transportMode = document.getElementById('transport-mode').value;

    if (!input || points.length === 0) {
        alert('Introduce los tiempos y selecciona al menos un punto.');
        return;
    }

    // Destruir la instancia existente de DataTables si existe
    if (dataTable) {
        dataTable.destroy();
    }

    const times = input.split(',').map(t => parseInt(t.trim()) * 60);
    const coords = points.map(p => p.getLatLng()).map(latlng => [latlng.lng, latlng.lat]);

    // No limpiar isochronesLayer para mantener las isocronas existentes
    // No limpiar la tabla para mantener las descripciones existentes
    // isochronesData = []; // No resetear para mantener todas las isocronas
    isochroneLayers = []; // Resetear las capas de isocronas

    try {
        const promises = coords.flatMap((coord, pointIndex) => {
            const pointId = pointIndex + 1;
            return times.map(time => {
                const combinationKey = `${coord[0]},${coord[1]}-${time}-${transportMode}`;
                if (!generatedCombinations.has(combinationKey)) {
                    generatedCombinations.add(combinationKey);
                    return fetchIsochrones(coord, [time], pointId, transportMode);
                }
                return Promise.resolve(); // No hacer nada si ya existe
            });
        });

        await Promise.all(promises);

        // Inicializar DataTables después de que todas las filas estén agregadas
        dataTable = $('#isochroneTable').DataTable({
            "language": {
                "url": "//cdn.datatables.net/plug-ins/1.11.5/i18n/Spanish.json"
            },
            "order": [], // Permitir ordenación en todas las columnas
            "paging": false,
            "searching": false,
            "info": false,
            "columnDefs": [
                { "type": "natural", "targets": [0, 1, 2, 3] } // Asegurar ordenación natural
            ]
        });
    } catch (error) {
        console.error("Error al generar isocronas:", error);
    }
}

function translateTransportMode(mode) {
    switch (mode) {
        case 'foot-walking':
            return 'A pie';
        case 'driving-car':
            return 'Coche';
        default:
            return mode;
    }
}

function getColorForCombination(time, mode) {
    const key = `${time}-${mode}`;
    if (!colorMap[key]) {
        // Generar un color único basado en el tiempo y el modo
        const hue = (Object.keys(colorMap).length * 137) % 360; // Distribuir colores en el espectro
        colorMap[key] = `hsl(${hue}, 70%, 50%)`;
    }
    return colorMap[key];
}

async function fetchIsochrones(coord, times, pointId, transportMode) {
    try {
        const response = await fetch(`${apiUrl}${transportMode}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: apiKey
            },
            body: JSON.stringify({
                locations: [coord],
                range: times,
                range_type: 'time',
                attributes: ['total_pop']
            })
        });

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        const data = await response.json();

        if (data && data.features) {
            data.features.forEach((feature, index) => {
                const totalPop = feature.properties ? feature.properties.total_pop : null;
                const population = totalPop !== undefined && totalPop !== null ? totalPop : 0;

                feature.properties.timeInMinutes = times[index] / 60;
                feature.properties.population = population;
                feature.properties.identifier = pointIdentifiers.get(points[pointId - 1]); // Usar el identificador del punto
                feature.properties.mode = translateTransportMode(transportMode); // Usar la función de traducción

                isochronesData.push({
                    timeInMinutes: feature.properties.timeInMinutes,
                    population: population,
                    geojson: feature
                });

                const color = getColorForCombination(feature.properties.timeInMinutes, feature.properties.mode);

                const isochroneLayer = L.geoJSON(feature, {
                    style: {
                        color: color,
                        weight: 2,
                        fillOpacity: 0.2
                    }
                }).addTo(isochronesLayer);

                isochroneLayers.push(isochroneLayer);

                isochroneLayer.eachLayer(function (layer) {
                    layer.bindPopup(
                        `${layer.feature.properties.identifier}: ${layer.feature.properties.timeInMinutes} minutos<br>Población: ${layer.feature.properties.population.toLocaleString()} hab.<br>Modo: ${layer.feature.properties.mode}`
                    );
                });
         
                // Crear fila para la tabla
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${feature.properties.identifier}</td>
                    <td data-order="${feature.properties.timeInMinutes}">${feature.properties.timeInMinutes}</td>
                    <td data-order="${population}">${population}</td>
                    <td>${feature.properties.mode}</td> <!-- Añadir columna de modo -->
                `;
                document.getElementById('isochroneTableBody').appendChild(row);
                
                // Añadir eventos de mouse para resaltar la isocrona
                row.addEventListener('mouseenter', () => {
                    isochroneLayer.setStyle({ weight: 4, fillOpacity: 0.4 });
                });
                row.addEventListener('mouseleave', () => {
                    isochroneLayer.setStyle({ weight: 2, fillOpacity: 0.2 });
                });
            });
        } else {
            console.error("No features found in the response data.");
        }
    } catch (error) {
        console.error("Error en fetchIsochrones:", error);
    }
}

function resetMap() {
    if (dataTable) {
        dataTable.destroy();
    }
    isochronesLayer.clearLayers();
    points.forEach(p => map.removeLayer(p));
    points = [];
    document.getElementById('isochroneTableBody').innerHTML = '';
}

function exportData() {
    // Crear un objeto GeoJSON
    const geojson = {
        type: "FeatureCollection",
        features: isochronesData.map((data) => ({
            type: "Feature",
            properties: {
                id: data.geojson.properties.identifier, // Usar el ID preexistente
                Tiempo: data.timeInMinutes, // Tiempo asociado
                Población: data.population, // Población asociada
                Modo: data.geojson.properties.mode // Añadir modo de transporte
            },
            geometry: data.geojson.geometry // Geometría de la isocrona
        }))
    };

    // Convertir el objeto GeoJSON a una cadena JSON
    const geojsonString = JSON.stringify(geojson);

    // Crear un blob y un enlace para descargar el archivo
    const blob = new Blob([geojsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'isochrones.geojson';
    a.click();
    URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', () => {
    const table = document.getElementById('isochroneTable');
    const isochroneHeader = document.getElementById('isochroneHeader');
    const timeHeader = document.getElementById('timeHeader');
    const populationHeader = document.getElementById('populationHeader');
    const modeHeader = document.getElementById('modeHeader');
    let sortDirection = true; // true for ascending, false for descending

    isochroneHeader.addEventListener('click', () => {
        sortTableByColumn(table, 0, sortDirection, 'isochrone');
        sortDirection = !sortDirection; // Toggle the sort direction
    });

    timeHeader.addEventListener('click', () => {
        sortTableByColumn(table, 1, sortDirection, 'numeric');
        sortDirection = !sortDirection; // Toggle the sort direction
    });

    populationHeader.addEventListener('click', () => {
        sortTableByColumn(table, 2, sortDirection, 'numeric');
        sortDirection = !sortDirection; // Toggle the sort direction
    });

    modeHeader.addEventListener('click', () => {
        sortTableByColumn(table, 3, sortDirection, 'text');
        sortDirection = !sortDirection; // Toggle the sort direction
    });
});

function sortTableByColumn(table, column, ascending = true, type = 'text') {
    const dirModifier = ascending ? 1 : -1;
    const tBody = table.tBodies[0];
    const rows = Array.from(tBody.querySelectorAll('tr'));

    const sortedRows = rows.sort((a, b) => {
        const aText = a.querySelector(`td:nth-child(${column + 1})`).textContent.trim();
        const bText = b.querySelector(`td:nth-child(${column + 1})`).textContent.trim();

        let aValue, bValue;

        if (type === 'numeric') {
            aValue = parseFloat(aText);
            bValue = parseFloat(bText);
        } else if (type === 'isochrone') {
            aValue = parseInt(aText.split('-')[1], 10);
            bValue = parseInt(bText.split('-')[1], 10);
        } else {
            aValue = aText;
            bValue = bText;
        }

        if (aValue < bValue) {
            return -1 * dirModifier;
        }
        if (aValue > bValue) {
            return 1 * dirModifier;
        }
        return 0;
    });

    // Remove all existing TRs from the table
    while (tBody.firstChild) {
        tBody.removeChild(tBody.firstChild);
    }

    // Re-add the newly sorted rows
    tBody.append(...sortedRows);
}

