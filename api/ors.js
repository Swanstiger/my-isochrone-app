import { translateTransportMode } from './app';  // Asegúrate de que la ruta sea correcta

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    // Verificar que los datos lleguen correctamente
    console.log('Datos recibidos:', req.body); 

    const apiKey = process.env.ORS_API_KEY;
    const { coords, times, transportMode } = req.body;
    console.log('API Key:', apiKey);  // Agregar para depurar

    // Traducir el modo de transporte
    const translatedMode = translateTransportMode(mode);
    if (!translatedMode) {
        console.error('Modo de transporte no válido');
        return;  // Salir si el modo no es válido
    }

    // Asegurarse de que los datos sean válidos
    if (!coords || !Array.isArray(coords) || coords.length === 0) {
        console.error('Coordenadas no válidas');
        return res.status(400).json({ error: 'Coordenadas no válidas' });
    }

    if (!times || !Array.isArray(times) || times.length === 0) {
        console.error('Tiempos no válidos');
        return res.status(400).json({ error: 'Tiempos no válidos' });
    }

    // Construir la URL con el modo traducido
    const url = `https://api.openrouteservice.org/v2/isochrones/${translatedMode}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                locations: coords,
                range: times
            })
        });

        const text = await response.text(); console.log('Respuesta ORS:', response.status, text);

        if (!response.ok) {
            throw new Error('Error en la solicitud a OpenRouteService');
        }

        const data = await response.json();
        return res.status(200).json(data);
    } catch (error) {
        console.error('Error en la función serverless:', error);
        return res.status(500).json({ error: 'Error al procesar la solicitud' });
    }
}
