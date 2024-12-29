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
    // Inicialización de la tabla
    if (!$.fn.dataTable.isDataTable('#isochroneTable')) {
        dataTable = $('#isochroneTable').DataTable({
            "language": {
                "url": "https://cdn.datatables.net/plug-ins/2.1.8/i18n/es-ES.json"
            },
            "order": [],
            "paging": false,
            "searching": false,
            "info": false,
            "columns": [
                { "data": "identifier" },
                { "data": "timeInMinutes" },
                { "data": "population" },
                { "data": "mode" }
            ]
        });
    }
});


// Función para inicializar o recuperar la tabla de datos
function initializeIsochroneTable(selector = '#isochroneTable') {
    if (!$.fn.dataTable.isDataTable(selector)) {
        return $(selector).DataTable({
            paging: true,
            searching: false,
            ordering: true,
            info: false,
            language: {
                paginate: {
                    previous: "Anterior",
                    next: "Siguiente"
                },
                url: "https://cdn.datatables.net/plug-ins/2.1.8/i18n/es-ES.json"
            },
            columns: [
                { data: "identifier" },
                { data: "timeInMinutes" },
                { data: "population" },
                { data: "mode" }
            ]
        });
    }
    return $(selector).DataTable(); // Devuelve la instancia existente
}





async function generateIsochrones() {
    const table = initializeIsochroneTable(); 
    console.log('Tabla inicializada:', table);

    const input = document.getElementById('isochroneInput').value;
    const transportMode = document.getElementById('transport-mode').value;

    if (!input || points.length === 0) {
        alert('Introduce los tiempos y selecciona al menos un punto.');
        return;
    }

    let trafficFactor = transportMode === "driving-car" ? 0.55 : 0.85;
    const times = input.split(',').map(t => parseInt(t.trim()) * 60);
    const adjustedTimes = times.map(t => t * trafficFactor);
    const coords = points.map(p => p.getLatLng()).map(latlng => [latlng.lng, latlng.lat]);

    isochroneLayers = [];
    isochronesData = []; // Limpiar los datos previos

    try {
        const promises = coords.flatMap((coord, pointIndex) => {
            const pointId = pointIndex + 1;
            return times.map((time, index) => {
                const combinationKey = `${coord[0]},${coord[1]}-${time}-${transportMode}`;
                if (!generatedCombinations.has(combinationKey)) {
                    generatedCombinations.add(combinationKey);
                    return fetchIsochrones(coord, [adjustedTimes[index]], pointId, transportMode, time);
                }
                return Promise.resolve(); // Si la combinación ya fue generada, no realizar la petición
            });
        });
        await Promise.all(promises);

        if (isochronesData.length === 0) {
            console.warn('No se generaron isocronas, pero la respuesta de la API parece estar vacía.');
            return;
        }

        // Actualizar la tabla con los nuevos datos
       
        isochronesData.forEach(data => {
            table.row.add({
                identifier: data.geojson.properties.identifier,
                timeInMinutes: data.timeInMinutes,
                population: data.population,
                mode: data.geojson.properties.mode
            });
        });
        table.draw(); // Redibujar la tabla para mostrar los nuevos datos

        isochroneLayers.forEach(layer => {
            const feature = layer.feature;
            console.log('Feature:', feature);  // Añadido para depurar la estructura del feature

            if (feature && feature.properties) {
                console.log('Propiedades de la característica:', feature.properties);
                const isochroneLayer = L.geoJSON(feature, {
                    style: {
                        color: getColorForCombination(feature.properties.timeInMinutes, feature.properties.mode),
                        weight: 2,
                        fillOpacity: 0.2
                    }
                }).addTo(isochronesLayer); // Asegúrate de añadir la capa a la capa de isocronas

                isochroneLayer.eachLayer(function (layer) {
                    const featureProperties = layer.feature.properties;
                    console.log('Properties:', featureProperties);

                    layer.bindPopup(
                        `${featureProperties.identifier}: ${featureProperties.timeInMinutes} minutos<br>Población: ${featureProperties.population.toLocaleString()} hab.<br>Modo: ${featureProperties.mode}`
                    );
                });
            } else {
               // console.warn("Feature or properties not found",feature.properties);
            }
        });

    } catch (error) {
        console.error('Error al generar isocronas:', error);
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

        if (data?.features?.length) {
            data.features.forEach((feature) => {
                console.log('Feature:', feature);
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

                // Crear una capa de la isocrona
                const color = getColorForCombination(feature.properties.timeInMinutes, feature.properties.mode);

                const isochroneLayer = L.geoJSON(feature, {
                    style: {
                        color: color,
                        weight: 2,
                        fillOpacity: 0.2
                    }
                }).addTo(isochronesLayer);

                isochroneLayers.push(isochroneLayer);

                // Añadir un popup a cada capa
                isochroneLayer.eachLayer(function (layer) {
                    console.log(layer);
                    const featureProperties = layer.feature.properties;
                    console.log(featureProperties);
                    if (featureProperties) {
                        layer.bindPopup(
                            `${featureProperties.identifier}: ${featureProperties.timeInMinutes} minutos<br>Población: ${featureProperties.population.toLocaleString()} hab.<br>Modo: ${featureProperties.mode}`
                        );

                        // Asegúrate de que la tabla esté bien referenciada
                        const table = document.getElementById('isochroneTable'); // Cambia 'miTabla' por el ID correcto de tu tabla

                        // Agregar una fila a la tabla
                        addRowToTable(table, {
                            identifier: featureProperties.identifier,
                            timeInMinutes: featureProperties.timeInMinutes,
                            population: featureProperties.population,
                            mode: featureProperties.mode
                        });
                    } else {
                        console.warn("No properties found for feature");
                    }
                });
            });
        } else {
            console.warn("No features found in the response");
        }
    } catch (error) {
        console.error("Error al generar isocronas:", error);
    }
}

function addRowToTable(table, data) {
    if (!table) {
        console.error("La tabla no se encontró");
        return;
    }
    const row = table.insertRow();
    Object.keys(data).forEach((key) => {
        const cell = row.insertCell();
        cell.textContent = data[key];
    });
}





function resetMap() {
    // Limpiar las capas de isocronas del mapa
    isochronesLayer.clearLayers();
    points.forEach(p => map.removeLayer(p));
    points = [];

    const table = initializeIsochroneTable();
    console.log('Tabla inicializada:', table);
    table.clear().draw(); // Limpiar datos de la tabla

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

let table;

document.addEventListener('DOMContentLoaded', () => {
    initializeIsochroneTable(); // Llamar a la función para inicializar la tabla
    });