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

map.on('click', function (e) {
    const marker = L.marker(e.latlng, { draggable: true }).addTo(map);
    points.push(marker);

    marker.bindPopup('Punto seleccionado').openPopup();
    marker.on('contextmenu', function () {
        map.removeLayer(marker);
        points = points.filter(p => p !== marker);
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

    isochronesLayer.clearLayers();
    document.getElementById('isochroneTableBody').innerHTML = '';
    isochronesData = [];
    isochroneLayers = []; // Resetear las capas de isocronas

    try {
        const promises = coords.map((coord, pointIndex) => {
            const pointId = pointIndex + 1;
            return fetchIsochrones(coord, times, pointId, transportMode);
        });

        await Promise.all(promises);

        // Inicializar DataTables después de que todas las filas estén agregadas
        dataTable = $('#isochroneTable').DataTable({
            "language": {
                "url": "//cdn.datatables.net/plug-ins/1.11.5/i18n/Spanish.json"
            },
            "order": [],
            "paging": false,
            "searching": false,
            "info": false,
            "columnDefs": [
                { "type": "natural", "targets": [0, 1, 2] }
            ]
        });
    } catch (error) {
        console.error("Error al generar isocronas:", error);
    }
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
                feature.properties.identifier = `Iso-${pointId}`;

                isochronesData.push({
                    timeInMinutes: feature.properties.timeInMinutes,
                    population: population,
                    geojson: feature
                });

                const isochroneLayer = L.geoJSON(feature, {
                    style: {
                        color: `hsl(${(index * 60) % 360}, 70%, 50%)`,
                        weight: 2,
                        fillOpacity: 0.2
                    }
                }).addTo(isochronesLayer);

                isochroneLayers.push(isochroneLayer);

                isochroneLayer.eachLayer(function (layer) {
                    layer.bindPopup(
                        `${layer.feature.properties.identifier}: ${layer.feature.properties.timeInMinutes} minutos<br>Población: ${layer.feature.properties.population.toLocaleString()} hab.`
                    );
                });
         

                
                // Crear fila para la tabla
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${feature.properties.identifier}</td>
                    <td data-order="${feature.properties.timeInMinutes}">${feature.properties.timeInMinutes} min</td>
                    <td data-order="${population}">${population}</td>
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
    const geojsonData = {
        type: 'FeatureCollection',
        features: isochronesData.map(data => {
            const population = typeof data.population === 'number' ? data.population : parseInt(data.population, 10) || 0;

            return {
                type: 'Feature',
                geometry: data.geojson.geometry,
                properties: {
                    time: `${data.timeInMinutes} min`,
                    total_pop: population
                }
            };
        })
    };

    console.log(geojsonData);

    const blob = new Blob([JSON.stringify(geojsonData, null, 2)], { type: 'application/geo+json' });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'isochrones.geojson';

    link.click();
}

document.addEventListener('DOMContentLoaded', () => {
    const table = document.getElementById('isochroneTable');
    const headers = table.querySelectorAll('th');
    let sortDirection = true; // true for ascending, false for descending

    headers.forEach((header, index) => {
        header.addEventListener('click', () => {
            sortTableByColumn(table, index, sortDirection);
            sortDirection = !sortDirection; // Toggle the sort direction
        });
    });
});

function sortTableByColumn(table, column, ascending = true) {
    const dirModifier = ascending ? 1 : -1;
    const tBody = table.tBodies[0];
    const rows = Array.from(tBody.querySelectorAll('tr'));

    const sortedRows = rows.sort((a, b) => {
        // Obtén los valores de las celdas, usando 'data-order' si está presente
        const aText = a.querySelector(`td:nth-child(${column + 1})`).getAttribute('data-order') || a.querySelector(`td:nth-child(${column + 1})`).textContent.trim();
        const bText = b.querySelector(`td:nth-child(${column + 1})`).getAttribute('data-order') || b.querySelector(`td:nth-child(${column + 1})`).textContent.trim();

        let aValue, bValue;

        // Lógica específica según el índice de la columna
        if (column === 0) { // Columna "Isocrona"
            // Ordenar extrayendo el número después de "Iso-"
            const regex = /Iso-(\d+)/;
            aValue = parseInt(aText.match(regex)?.[1] || 0, 10);
            bValue = parseInt(bText.match(regex)?.[1] || 0, 10);
        } else if (column === 1) { // Columna "Tiempo (min)"
            // Extraer el número antes de "min"
            aValue = parseInt(aText.replace('min', '').trim(), 10);
            bValue = parseInt(bText.replace('min', '').trim(), 10);
        } else if (column === 2) { // Columna "Población"
            // Convertir a número eliminando comas
            aValue = parseFloat(aText.replace(/,/g, '')) || 0;
            bValue = parseFloat(bText.replace(/,/g, '')) || 0;
        } else {
            // Ordenar como cadenas de texto por defecto
            return aText.localeCompare(bText) * dirModifier;
        }

        // Comparar los valores numéricos
        return (aValue - bValue) * dirModifier;
    });

    // Remove all existing TRs from the table
    while (tBody.firstChild) {
        tBody.removeChild(tBody.firstChild);
    }

    // Re-add the newly sorted rows
    tBody.append(...sortedRows);
}

