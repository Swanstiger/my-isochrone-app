const apiKey = '5b3ce3597851110001cf624845cfd06eb29d4faf8d5f3a0fea303e83';
const apiUrl = "https://api.openrouteservice.org/v2/isochrones/";
const ghslUrl = "https://sedac.ciesin.columbia.edu/arcgis/rest/services/ghsl/ghsl_pop/MapServer/0/query"; // GHSL API endpoint

console.log(apiKey);

const map = L.map('map', { drawControl: true }).setView([39.4699, -0.3763], 12);



const openStreetMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
});
const esriWorldImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
});
openStreetMap.addTo(map);

const baseLayers = {
    "OpenStreetMap": openStreetMap,
    "Esri World Imagery": esriWorldImagery
};
L.control.layers(baseLayers).addTo(map);

let isochronesLayer = L.layerGroup().addTo(map);
let points = [];
let isochronesData = [];
let isochroneLayers = [];
let dataTable;
let generatedCombinations = new Set();
const colorMap = {};
const pointIdentifiers = new Map();
let isochroneCounter = 1;
const reservedIdentifiers = new Set();
let availableIdentifiers = [];
let userPolygons = [];
let multiPolygon = { type: "MultiPolygon", coordinates: [] };

const iconColors = ['red', 'blue', 'green', 'orange', 'yellow', 'violet', 'grey', 'black'];
let isochronesEditing = false; 
let currentlyEditingLayer = null; // Keep track of the layer being edited
let drawnItems = L.featureGroup().addTo(map); // Add this line here
let avoidPolygons = []; // Array to store avoidance polygons
// Use a named function for the click handler

const polygonCoordinates = [
    [39.492105420054536, -0.3900049085489087],
    [39.48592442319326, -0.3656061163070862],
    [39.47089113294288, -0.37470527642993556],
    [39.48348202518289, -0.3957685306748607],
    [39.492105420054536, -0.3900049085489087] // Cerrado
];

function convertToGeoJSONCoordinates(coordinates) {
    return coordinates.map(([lat, lng]) => [lng, lat]);
}

const avoidPolygonsGeoJSON = [
    [convertToGeoJSONCoordinates(polygonCoordinates)]
];


function addAvoidPolygonToMap(coordinates) {
    L.polygon(coordinates, { color: 'red' }).addTo(map);
}


addAvoidPolygonToMap(polygonCoordinates);

function addIsochroneMarkerHandler(e) {
    if (!isochronesEditing) {
        addIsochroneMarker(e);
    }
}

// Attach the click handler initially
map.on('click', addIsochroneMarkerHandler);

let isDrawing = false; // Flag to track drawing state

map.on('draw:drawstart', (e) => {
    isDrawing = true; // Set flag when drawing starts
    // Remove the click handler to prevent isochrone markers during drawing
    map.off('click', addIsochroneMarkerHandler);
});

map.on('draw:drawstop', (e) => {
    isDrawing = false; // Reset flag when drawing stops
    // Re-attach the click handler after drawing is complete
    map.on('click', addIsochroneMarkerHandler);
});

map.on('draw:created', function (e) {
    const layer = e.layer;
    drawnItems.addLayer(layer);

    // Convert drawn polygon to GeoJSON and add to userPolygons array
    const polygonGeoJSON = layer.toGeoJSON();
    userPolygons.push(polygonGeoJSON);

    // Update multiPolygon with the new polygon coordinates
    multiPolygon.coordinates.push(polygonGeoJSON.geometry.coordinates);
});

map.on('draw:deleted', function (e) {
    // Remove deleted polygons from userPolygons and multiPolygon
    const layers = e.layers;
    layers.eachLayer(function (layer) {
        const polygonGeoJSON = layer.toGeoJSON();
        userPolygons = userPolygons.filter(polygon => !turf.booleanEqual(polygon, polygonGeoJSON));
        multiPolygon.coordinates = multiPolygon.coordinates.filter(coords => !turf.booleanEqual({ type: "Polygon", coordinates: coords }, polygonGeoJSON));
    });
});

const pointColorMap = new Map();
let colorIndex = 0;

function addIsochroneMarker(e) {
    let identifier;
    if (availableIdentifiers.length > 0) {
        const safeIdentifiers = availableIdentifiers.filter(
            id => !isochronesData.some(data => data.geojson.properties.identifier_simp === id)
        );
        if (safeIdentifiers.length > 0) {
            identifier = safeIdentifiers[0];
            availableIdentifiers = availableIdentifiers.filter(id => id !== identifier);
        } else {
            identifier = `ISO-${isochroneCounter++}`;
        }
    } else {
        identifier = `ISO-${isochroneCounter++}`;
    }

    if (!pointColorMap.has(identifier)) {
        pointColorMap.set(identifier, iconColors[colorIndex % iconColors.length]);
        colorIndex++;
    }

    const customIcon = L.icon({
        iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${pointColorMap.get(identifier)}.png`,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
        shadowAnchor: [12, 41]
    });

    const marker = L.marker(e.latlng, { draggable: true, icon: customIcon }).addTo(map);

    points.push(marker);
    pointIdentifiers.set(marker, identifier);

    marker.bindPopup(identifier).openPopup();
    setTimeout(() => marker.closePopup(), 1000);

    marker.on('contextmenu', function () {
        const markerId = pointIdentifiers.get(marker);
        const hasIsochrones = isochronesData.some(
            data => data.geojson.properties.identifier_simp === markerId
        );

        if (!hasIsochrones) {
            availableIdentifiers.push(markerId);
        } else {
            reservedIdentifiers.add(markerId);
        }

        map.removeLayer(marker);
        points = points.filter(p => p !== marker);
        pointIdentifiers.delete(marker);
    });
}

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

    $('#isochroneTable tbody').on('mouseenter', 'tr', function () {
        const data = dataTable.row(this).data();
        $('#editIsochroneButton').click(toggleIsochroneEditing);
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
                    color: originalColor,
                    opacity: 1,
                    fillOpacity: 0.5
                });
                matchingLayer.bringToFront();
            }
        }
    });

    $('#isochroneTable tbody').on('mouseleave', 'tr', function () {
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



// Function to add a polygon to the map and the avoidPolygons array
function addAvoidPolygon(coordinates) {
    const polygon = L.polygon(coordinates, { color: 'red' }).addTo(map); // Visualize on map
    avoidPolygons.push(coordinates);
}


// Example usage: Add your polygon coordinates here
avoidPolygons = [
    [
        [
            [-0.3900049085489087, 39.492105420054536],
            [-0.3656061163070862, 39.48592442319326],
            [-0.37470527642993556, 39.47089113294288],
            [-0.3957685306748607, 39.48348202518289],
            [-0.3900049085489087, 39.492105420054536]
        ]
    ]
];










// Function to enable/disable isochrone editing
async function toggleIsochroneEditing() {
    isochronesEditing = !isochronesEditing;

    const editButton = document.getElementById('editIsochroneButton');
    if (editButton) {
        editButton.textContent = isochronesEditing ? 'Finalizar edición' : 'Editar isocrona';
    }


    if (isochronesEditing) {
        if (isochroneLayers.length > 0) {
            const layerToEdit = isochroneLayers[0]; // Edit the first layer for now

            const simplifiedGeoJSON = turf.simplify(layerToEdit.toGeoJSON(), { tolerance: 0.001, highQuality: false });
            const simplifiedLayer = L.geoJSON(simplifiedGeoJSON, {
                pointToLayer: function (geoJsonPoint, latlng) {
                    return null;
                }
            }).addTo(map);

            simplifiedLayer.pm.enable({
                allowRemoval: false,
                draggable: false,
                vertexMarkerClass: 'vertex-marker',
                midLatLngMarker: false
            });

    
                
    

            currentlyEditingLayer = simplifiedLayer;



        } else {
            alert("No hay isocronas para editar.");
            isochronesEditing = false; // Reset editing state
            if (editButton) {
                editButton.textContent = 'Editar isocrona';
            }
        }

    } else if (currentlyEditingLayer) {
        currentlyEditingLayer.pm.disable();
        map.removeLayer(currentlyEditingLayer);
        currentlyEditingLayer = null;
    }
}




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
    return $(selector).DataTable();
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
                    return fetchIsochrones(coord, [adjustedTimes[index]], pointId, transportMode, time);
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
        const hue = (Object.keys(colorMap).length * 137) % 360;
        colorMap[key] = `hsl(${hue}, 70%, 50%)`;
    }
    return colorMap[key];
}

async function fetchIsochrones(coord, adjustedTimes, pointId, transportMode, time) {
    try {
        
        const response = await fetch(`${apiUrl}${transportMode}`, 
        
                {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: apiKey
            },
            body: JSON.stringify({
                locations: [coord],
                range: adjustedTimes,
                smoothing:1,
                range_type: 'time',
                attributes: ['total_pop'],
                options: {
                    avoid_polygons: {
                        type: "MultiPolygon",
                        coordinates: avoidPolygonsGeoJSON
                    }
                }
            })
        });

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }
        const data = await response.json();


        if (data?.features?.length) {
            // Use a for...of loop instead of forEach to allow await
            for (const feature of data.features) {
                const properties = feature.properties;
                const population = properties.total_pop ?? 0;
                const timeInMinutes = time / 60;
                const identifier = `${pointId}-${timeInMinutes}min-${Date.now()}`;
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
                    style: function (feature) {
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
            };
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
                id: data.geojson.properties.identifier_simp,
                Tiempo: data.timeInMinutes,
                Población: data.population,
                Modo: data.geojson.properties.mode
            },
            geometry: data.geojson.geometry
        }))
    };

    const geojsonString = JSON.stringify(geojson);

    const blob = new Blob([geojsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'isochrones.geojson';
    a.click();
    URL.revokeObjectURL(url);
}

function resetPoligons() {
    drawnItems.clearLayers();
    userPolygons = [];
    multiPolygon.coordinates = [];
}


