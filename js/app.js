const apiKey = "5b3ce3597851110001cf624845cfd06eb29d4faf8d5f3a0fea303e83"; // Replace with your OpenRouteService key
const apiUrl = "https://api.openrouteservice.org/v2/isochrones/"; // Ensure this is defined

<script>
    const map = L.map('map').setView([39.4699, -0.3763], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    let isochronesLayer = L.layerGroup().addTo(map);
    let points = [];
    let isochronesData = [];

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

        const times = input.split(',').map(t => parseInt(t.trim()) * 60);
        const coords = points.map(p => p.getLatLng()).map(latlng => [latlng.lng, latlng.lat]);

        isochronesLayer.clearLayers();
        document.getElementById('isochroneTableBody').innerHTML = '';
        isochronesData = [];  // Clear previous data

        for (const coord of coords) {
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

            const data = await response.json();

            if (data && data.features) {
                data.features.forEach((feature, index) => {
                    const totalPop = feature.properties ? feature.properties.total_pop : null;

                    // Ensure totalPop is a number
                    const population = totalPop !== undefined && totalPop !== null ? totalPop : 0;

                    // Store isochrone data
                    isochronesData.push({
                        time: times[index] / 60,
                        population: population,
                        geojson: feature
                    });

                    // Add isochrone layer to map
                    L.geoJSON(feature.geometry, {
                        style: {
                            color: `hsl(${(index * 60) % 360}, 70%, 50%)`,
                            weight: 2,
                            fillOpacity: 0.2
                        }
                    }).bindPopup(`Isocrona: ${times[index] / 60} minutos<br>Población: ${population} hab.`).addTo(isochronesLayer);

                    // Add row to table
                    const row = document.createElement('tr');
                    row.innerHTML = `<td>${times[index] / 60} min</td><td>${population || 'N/A'} hab.</td>`;
                    document.getElementById('isochroneTableBody').appendChild(row);
                });
            }
        }
    }

    function resetMap() {
        isochronesLayer.clearLayers();
        points.forEach(p => map.removeLayer(p));
        points = [];
        document.getElementById('isochroneTableBody').innerHTML = '';
    }

    function exportData() {
        const geojsonData = {
            type: 'FeatureCollection',
            features: isochronesData.map(data => {
                // Ensure population is a number
                const population = typeof data.population === 'number' ? data.population : parseInt(data.population, 10) || 0;

                return {
                    type: 'Feature',
                    geometry: data.geojson.geometry,  // Geometry of the isochrone
                    properties: {
                        time: `${data.time} min`,  // Isochrone time in minutes
                        total_pop: population  // Ensure population is a number
                    }
                };
            })
        };

        // Log data before exporting
        console.log(geojsonData);

        // Create a blob with the data in GeoJSON format
        const blob = new Blob([JSON.stringify(geojsonData, null, 2)], { type: 'application/geo+json' });

        // Create a link for file download
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'isochrones.geojson';

        // Simulate a click to start the download
        link.click();
    }
</script>
