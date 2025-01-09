export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    console.log(req.body); // Agrega esto para verificar los datos que llegan

    const apiKey = process.env.ORS_API_KEY;
    const { coords, times, mode } = req.body;
    console.log('API Key:', apiKey);  // Agregar para depurar

    const url = `https://api.openrouteservice.org/v2/isochrones/${mode}`;

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
