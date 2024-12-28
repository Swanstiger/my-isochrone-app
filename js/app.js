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

$(document).ready(function () {
    if (!$.fn.dataTable.isDataTable('#isochroneTable')) {
        $('#isochroneTable').DataTable({
            "language": {
                "url": "https://cdn.datatables.net/plug-ins/2.1.8/i18n/es-ES.json"
            },
            "order": [], // No ordenar inicialmente
            "paging": false,
            "searching": false,
            "info": false,
            "columns": [
                { "data": "identifier" },   // Columna para 'Isocronas'
                { "data": "timeInMinutes" },            // Columna para 'input'
                { "data": "population" },       // Columna para 'population'
                { "data": "mode" } 
            ]
        });
    }
});



async function generateIsochrones() {
    // Verificar si la tabla ya está inicializada antes de intentar usarla
    let table;
    if ($.fn.dataTable.isDataTable('#isochroneTable')) {
        table = $('#isochroneTable').DataTable();
    } else {
        table = $('#isochroneTable').DataTable({
            "language": {
                "url": "https://cdn.datatables.net/plug-ins/2.1.8/i18n/es-ES.json"
            },
            "order": [], // No ordenar inicialmente
            "paging": false,
            "searching": false,
            "info": false,
            "columns": [
                { "data": "identifier" },   // Columna para 'Isocronas'
                { "data": "timeInMinutes" }, // Columna para 'input'
                { "data": "population" },    // Columna para 'population'
                { "data": "mode" }           // Columna para 'Modo de transporte'
            ]
        });
    }

    const input = document.getElementById('isochroneInput').value;
    const transportMode = document.getElementById('transport-mode').value;

    if (!input || points.length === 0) {
        alert('Introduce los tiempos y selecciona al menos un punto.');
        return;
    }

    let trafficFactor;

    if (transportMode === "driving-car") {
        trafficFactor = 0.55; // Factor para coche
    } else if (transportMode === "foot-walking") {
        trafficFactor = 0.85; // Factor para caminar
    } else {
        trafficFactor = 1; // Sin ajuste para otros modos
    }

    const times = input.split(',').map(t => parseInt(t.trim()) * 60);
    const adjustedTimes = times.map(t => t * trafficFactor); // Aplicar el factor de tráfico aquí
    const coords = points.map(p => p.getLatLng()).map(latlng => [latlng.lng, latlng.lat]);

    // No limpiar las capas de isocronas ni la tabla para mantener los datos anteriores
    isochroneLayers = []; // Resetear las capas de isocronas

    try {
        const promises = coords.flatMap((coord, pointIndex) => {
            const pointId = pointIndex + 1;
            return times.map((time, index) => {
                const combinationKey = `${coord[0]},${coord[1]}-${time}-${transportMode}`;
                if (!generatedCombinations.has(combinationKey)) {
                    generatedCombinations.add(combinationKey);
                    return fetchIsochrones(coord, [adjustedTimes[index]], pointId, transportMode, time);
                }
                return Promise.resolve(); // No hacer nada si ya existe
            });
        });

        await Promise.all(promises);

        // Agregar nuevas filas a la tabla
        isochroneLayers.forEach(layer => {
            const feature = layer.feature;

            // Verificar que el 'feature' tiene las propiedades necesarias
            if (feature && feature.properties) {
                const featureProperties = feature.properties;

                // Crear un objeto con los datos que vas a agregar a la tabla
                const tableRow = {
                    identifier: featureProperties.identifier || 'N/A',
                    timeInMinutes: featureProperties.timeInMinutes || 'Desconocido',
                    population: featureProperties.population || 0,
                    mode: featureProperties.mode || 'Desconocido'
                };

                // Verificar que los datos están correctos antes de agregarlos
                console.log('Añadiendo fila a la tabla:', tableRow);

                // Agregar la fila a la tabla usando DataTables
                table.row.add(tableRow).draw(); // Usar DataTables para agregar la fila
            } else {
                console.error("Propiedades no encontradas en el feature:", feature);
            }
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

async function fetchIsochrones(coord, adjustedTimes, pointId, transportMode, time) {
    try {
        const response = await fetch(`${apiUrl}${transportMode}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: apiKey
            },
            body: JSON.stringify({
                locations: [coord],
                range: adjustedTimes,
                range_type: 'time',
                attributes: ['total_pop']
            })
        });

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        const data = await response.json();
        console.log(data);

        if (data?.features?.length) {
            data.features.forEach((feature) => {
                // Verificación adicional para asegurarse de que `feature` y `feature.properties` están definidos
                if (!feature || !feature.properties) {
                    console.error('Feature o properties no definidos:', feature);
                    return;  // Salir si feature o properties no están definidos
                }

                const properties = feature.properties;
                const population = properties.total_pop ?? 0;
                const timeInMinutes = time / 60;
                const identifier = `Punto ${pointId}`;
                const mode = translateTransportMode(transportMode);

                feature.properties = {
                    ...properties,
                    timeInMinutes: timeInMinutes,
                    population: population,
                    identifier: identifier,
                    mode: mode
                };

                isochronesData.push({
                    timeInMinutes: timeInMinutes,
                    population: population,
                    geojson: feature
                });

                // Crear un color para la isocrona
                const color = getColorForCombination(feature.properties.timeInMinutes, feature.properties.mode);

                // Crear capa GeoJSON para la isocrona
                const isochroneLayer = L.geoJSON(feature, {
                    style: {
                        color: color,
                        weight: 2,
                        fillOpacity: 0.2
                    }
                }).addTo(isochronesLayer);

                isochroneLayers.push(isochroneLayer);

                // Verificación adicional para asegurarse de que la capa tiene las propiedades necesarias
                isochroneLayer.eachLayer(function (layer) {
                    const featureProperties = layer.feature.properties;
                    layer.bindPopup(
                        `${featureProperties.identifier}: ${featureProperties.timeInMinutes} minutos<br>Población: ${featureProperties.population.toLocaleString()} hab.<br>Modo: ${featureProperties.mode}`
                    );
                
                    const tableRow = {
                        identifier: featureProperties.identifier || 'N/A',
                        timeInMinutes: featureProperties.timeInMinutes || 'Desconocido',
                        population: featureProperties.population || 0,
                        mode: featureProperties.mode || 'Desconocido'
                    };
                
                    console.log('Añadiendo fila a la tabla:', tableRow);
                
                    // Usar DataTable API para agregar la fila
                    table.row.add(tableRow).draw(); // Usar DataTables para agregar la fila
                });
                
                
            });
        } else {
            console.warn("No features found in the response");
        }
    } catch (error) {
        console.error("Error al generar isocronas:", error);
    }
}



function resetMap() {
    // Limpiar las capas de isocronas del mapa
    isochronesLayer.clearLayers(); 

    // Eliminar los marcadores del mapa
    points.forEach(p => map.removeLayer(p)); 

    // Vaciar el array de puntos
    points = []; 

    // Verificar si la tabla ya está inicializada
    if ($.fn.dataTable.isDataTable('#isochroneTable')) {
        const table = $('#isochroneTable').DataTable();
        // Limpiar los datos de la tabla sin destruir la instancia
        table.clear().draw();
    }

    // Reiniciar variables
    isochroneCounter = 1; // Reiniciar el contador de isocronas
    availableIdentifiers.length = 0; // Vaciar los identificadores disponibles
    reservedIdentifiers.clear(); // Vaciar los identificadores reservados
    isochronesData = []; // Vaciar el contenido de las isocronas
    isochroneLayers = []; // Limpiar las capas de isocronas almacenadas
    generatedCombinations.clear(); // Vaciar las combinaciones generadas

    console.log("Mapa y datos reseteados correctamente.");
}


function exportData() {
    // Crear un objeto GeoJSON
    const geojson = {
        type: "FeatureCollection",
        features: isochronesData.map((data) => ({
            type:
                 "Feature",
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
let table;

document.addEventListener('DOMContentLoaded', () => {
    // Inicializar DataTable con el orden inicial configurado y la opción de guardar estado
    table = $('#isochroneTable').DataTable({
        "paging": true,
        "searching": true,
        "ordering": true,
        "info": true,
        "autoWidth": false,
        "language": {
            "url": "https://cdn.datatables.net/plug-ins/2.1.8/i18n/es-ES.json"
        },
        "order": [[0, 'asc']], // Orden inicial por la primera columna en orden ascendente
        "stateSave": true,  // Guardar el estado de la tabla (incluyendo el orden)
        "columns": [
            { "data": "identifier" },  // Columna para 'Isocronas'
            { "data": "timeInMinutes" }, // Columna para 'Tiempo'
            { "data": "population" }, // Columna para 'Población'
            { "data": "mode" } // Columna para 'Modo'
        ]
    });
});
