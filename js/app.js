

const apiKey = '5b3ce3597851110001cf624845cfd06eb29d4faf8d5f3a0fea303e83';// Reemplaza con tu clave de OpenRouteService
const apiUrl = "https://api.openrouteservice.org/v2/isochrones/"; // Asegúrate de que está definido correctamente
console.log(apiKey); 
// Inicializar el mapa centrado en Valencia
const map = L.map('map').setView([39.4699, -0.3763], 12);

// Capa base de OpenStreetMap
const openStreetMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
});

// Capa base de Esri World Imagery
const esriWorldImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
});

// Añadir OpenStreetMap por defecto al mapa
openStreetMap.addTo(map);

// Control de capas para alternar entre OpenStreetMap y Esri
const baseLayers = {
    "OpenStreetMap": openStreetMap,
    "Esri World Imagery": esriWorldImagery
};

L.control.layers(baseLayers).addTo(map);



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
let availableIdentifiers = []; // Array para almacenar identificadores disponibles para reutilización

// Definir los colores disponibles para los marcadores
const iconColors = [
    'red',
    'blue',
    'green',
    'orange',
    'yellow',
    'violet',
    'grey',
    'black'
];

// Mapa para almacenar los colores asignados a cada point_id
const pointColorMap = new Map();
let colorIndex = 0; // Controla la rotación de colores

map.on('click', function (e) {
    let identifier;
    
    if (availableIdentifiers.length > 0) {
        const safeIdentifiers = availableIdentifiers.filter(id => 
            !isochronesData.some(data => data.geojson.properties.identifier_simp === id)
        );
        
        if (safeIdentifiers.length > 0) {
            identifier = safeIdentifiers[0];
            // Modificar el array usando métodos de array en lugar de reasignación
            availableIdentifiers = availableIdentifiers.filter(id => id !== identifier);
        } else {
            identifier = `ISO-${isochroneCounter++}`;
        }
    } else {
        identifier = `ISO-${isochroneCounter++}`;
    }

    // Asignar un color al identificador si no tiene uno
    if (!pointColorMap.has(identifier)) {
        pointColorMap.set(identifier, iconColors[colorIndex % iconColors.length]);
        colorIndex++;
    }

    // Crear un icono personalizado con el color asignado
    const customIcon = L.icon({
        iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${pointColorMap.get(identifier)}.png`,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
        shadowSize: [41, 41],
        shadowAnchor: [12, 41]
    });

    const marker = L.marker(e.latlng, { 
        draggable: true,
        icon: customIcon 
    }).addTo(map);
    
    points.push(marker);
    pointIdentifiers.set(marker, identifier);
    marker.bindPopup(identifier).openPopup();

    // Cerrar el popup después de 1 segundo
    setTimeout(() => {
        marker.closePopup();
    }, 1000);

    marker.on('contextmenu', function () {
        const markerId = pointIdentifiers.get(marker);
        
        // Verificar si el punto tiene isocronas asociadas
        const hasIsochrones = isochronesData.some(data => 
            data.geojson.properties.identifier_simp === markerId
        );

        if (!hasIsochrones) {
            // Si no tiene isocronas, podemos reutilizar el identificador
            availableIdentifiers.push(markerId);
        } else {
            // Si tiene isocronas, lo marcamos como reservado
            reservedIdentifiers.add(markerId);
        }

        map.removeLayer(marker);
        points = points.filter(p => p !== marker);
        pointIdentifiers.delete(marker);
    });
});

// Ensure DataTable is initialized
$(document).ready(function () {
    dataTable = $('#isochroneTable').DataTable({
        "language": {
            "url": "https://cdn.datatables.net/plug-ins/2.1.8/i18n/es-ES.json"
        },
        "order": [],
        "paging": false,
        "searching": true,
        "info": false,
        "columns": [
            { "data": "identifier_simp" },
            { "data": "timeInMinutes" },
            { "data": "population" },
            { "data": "mode" }
        ]
    });

    
 // Eventos de la tabla
 $('#isochroneTable tbody').on('mouseenter', 'tr', function() {
    const data = dataTable.row(this).data();
    if (data) {
        const matchingLayer = isochroneLayers.find(layer => 
            layer.feature && 
            layer.feature.properties && 
            layer.feature.properties.identifier === data.identifier
        );
        
        if (matchingLayer) {
            const originalColor = getColorForCombination(
                matchingLayer.feature.properties.timeInMinutes, 
                matchingLayer.feature.properties.mode
            );
            
            matchingLayer.setStyle({
                weight: 4,
                color: originalColor, // Usar el color original
                opacity: 1,
                fillOpacity: 0.5
            });
            matchingLayer.bringToFront();
        }
    }
});

$('#isochroneTable tbody').on('mouseleave', 'tr', function() {
    const data = dataTable.row(this).data();
    if (data) {
        const matchingLayer = isochroneLayers.find(layer => 
            layer.feature && 
            layer.feature.properties && 
            layer.feature.properties.identifier === data.identifier
        );
        
        if (matchingLayer) {
            matchingLayer.setStyle({
                weight: 2,
                color: getColorForCombination(matchingLayer.feature.properties.timeInMinutes, 
                                            matchingLayer.feature.properties.mode),
                opacity: 1,
                fillOpacity: 0.2
            });
        }
    }
});
});






// Función para inicializar o recuperar la tabla de datos
function initializeIsochroneTable(selector = '#isochroneTable') {
    if (!$.fn.dataTable.isDataTable(selector)) {
        return $(selector).DataTable({
            paging: false,
            searching: true,
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
    const input = document.getElementById('isochroneInput').value;
    const transportMode = document.getElementById('transport-mode').value;

    if (!input || points.length === 0) {
        alert('Introduce los tiempos y selecciona al menos un punto.');
        return;
    }

    let trafficFactor = transportMode === "driving-car" ? 0.55 : 0.80;
    const times = input.split(',').map(t => parseInt(t.trim()) * 60);
    const adjustedTimes = times.map(t => t * trafficFactor);
    const coords = points.map(p => p.getLatLng()).map(latlng => [latlng.lng, latlng.lat]);

    try {
        const initialDataSize = isochronesData.length;

        const promises = coords.flatMap((coord, pointIndex) => {
            const pointId = pointIdentifiers.get(points[pointIndex]);
            return times.map((time, index) => {
                const timeInMinutes = time / 60;
                const combinationKey = `${coord[0]},${coord[1]}-${time}-${transportMode}`;
                if (!generatedCombinations.has(combinationKey)) {
                    generatedCombinations.add(combinationKey);
                    return fetchIsochrones(coords, [adjustedTimes[index]], pointId, transportMode, time); // Asegúrate de pasar "time" aquí
                }
                return Promise.resolve();
            });
        });
        

        await Promise.all(promises);

        const newData = isochronesData.slice(initialDataSize);
        if (newData.length > 0) {
            newData.forEach(data => {
                const rowData = {
                    identifier: data.geojson.properties.identifier,
                    identifier_simp: data.geojson.properties.identifier_simp,
                    timeInMinutes: data.timeInMinutes,
                    population: data.population,
                    mode: data.geojson.properties.mode
                };
                dataTable.row.add(rowData);
            });
            dataTable.draw();
        }

    } catch (error) {
        console.error('Error al generar isocronas:', error);
    }
}

// Define la función directamente en el contexto global
function translateTransportMode(mode) {
    switch (mode) {
        case 'foot-walking':
            return 'foot-walking'; // Para OpenRouteService
        case 'driving-car':
            return 'driving-car'; // Para OpenRouteService
        default:
            return null;  // Retorna null si el modo no es válido
    }
}

// Asegúrate de que esté disponible globalmente
window.translateTransportMode = translateTransportMode;


function getColorForCombination(time, mode) {
    const key = `${time}-${mode}`;
    if (!colorMap[key]) {
        // Generar un color único basado en el tiempo y el modo
        const hue = (Object.keys(colorMap).length * 137) % 360; // Distribuir colores en el espectro
        colorMap[key] = `hsl(${hue}, 70%, 50%)`;
    }
    return colorMap[key];
}

async function fetchIsochrones(coords,times, pointId, transportMode) {
    console.log('Iniciando solicitud a la API');

    console.log('Datos enviados:', { coords, times, pointId, transportMode});

    try {
        const response = await fetch('/api/ors', { 
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ coords, times, transportMode  })
        })


        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        const data = await response.json();
        console.log('Respuesta de la API:', data);

        if (data?.features?.length) {
            data.features.forEach((feature) => {
                const properties = feature.properties;
                const population = properties.total_pop ?? 0;
                const timeInMinutes = time / 60;
                const identifier = `${pointId}-${timeInMinutes}min-${Date.now()}`; // Identificador interno único
                const identifier_simp = `${pointId}`;
                const mode = translateTransportMode(transportMode);

                const newProperties = {
                    ...properties,
                    timeInMinutes: timeInMinutes,
                    population: population,
                    identifier: identifier,
                    identifier_simp: identifier_simp,
                    mode: mode
                };

                feature.properties = newProperties;

                const isochroneLayer = L.geoJSON(feature, {
                    style: function(feature) {
                        return {
                            color: getColorForCombination(feature.properties.timeInMinutes, feature.properties.mode),
                            weight: 2,
                            opacity: 1,
                            fillOpacity: 0.2,
                            fillColor: getColorForCombination(feature.properties.timeInMinutes, feature.properties.mode)
                        };
                    }
                }).addTo(isochronesLayer);

                isochroneLayer.feature = feature;
                isochroneLayers.push(isochroneLayer);

                const isochroneData = {
                    timeInMinutes: timeInMinutes,
                    population: population,
                    geojson: feature
                };
                isochronesData.push(isochroneData);

                isochroneLayer.bindPopup(
                    `Iso: ${identifier_simp}<br>Tiempo: ${timeInMinutes} minutos<br>Población: ${population.toLocaleString()} hab.<br>Modo: ${mode}`
                );
            });
        }
    } catch (error) {
        console.error("Error al generar isocronas:", error);
    }
}

function highlightIsochrone(identifier) {
    const layer = isochroneLayers.find(layer => layer.feature.properties.identifier === identifier);
    if (layer) {
        layer.setStyle({
            weight: 5,
            color: getColorForCombination(layer.feature.properties.timeInMinutes, layer.feature.properties.mode),
            fillOpacity: 0.5
        });
    }
}

function resetIsochroneHighlight(identifier) {
    const layer = isochroneLayers.find(layer => layer.feature.properties.identifier === identifier);
    if (layer) {
        layer.setStyle({
            weight: 2,
            color: getColorForCombination(layer.feature.properties.timeInMinutes, layer.feature.properties.mode),
            fillOpacity: 0.2
        });
    }
}
function resetMap() {
    isochronesLayer.clearLayers();
    points.forEach(p => map.removeLayer(p));
    points = [];

    dataTable.clear().draw();

    isochroneCounter = 1;
    availableIdentifiers.length = 0;
    reservedIdentifiers.clear();
    isochronesData = [];
    isochroneLayers = [];
    generatedCombinations.clear();
    pointIdentifiers.clear();

    console.log("Mapa y datos reseteados correctamente.");
}

function exportData() {
    const geojson = {
        type: "FeatureCollection",
        features: isochronesData.map((data) => ({
            type: "Feature",
            properties: {
                id: data.geojson.properties.identifier_simp, // Usar el ID simplificado para la exportación
                Tiempo: data.timeInMinutes,
                Población: data.population,
                Modo: data.geojson.properties.mode
            },
            geometry: data.geojson.geometry
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

