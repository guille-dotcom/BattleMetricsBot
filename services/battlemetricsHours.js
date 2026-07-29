require("dotenv").config();
const axios = require("axios");

async function getBattleMetricsHours(playerId, targetServerId = null) {
    try {
        const token = process.env.BATTLEMETRICS_TOKEN;
        const headers = {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        };

        const response = await axios.get(
            `https://api.battlemetrics.com/players/${playerId}`,
            { headers }
        );

        const player = response.data.data;
        const nombreJugador = player.attributes.name || "Desconocido";

        let horasDesdeWipe = "0.00";

        if (targetServerId) {
            try {
                // Obtener datos del servidor
                const serverResponse = await axios.get(`https://api.battlemetrics.com/servers/${targetServerId}`, { headers });
                const serverAttributes = serverResponse.data.data.attributes;
                const details = serverAttributes.details || {};
                
                // Intentamos capturar la fecha del wipe; si no existe, usamos una fecha de respaldo (ej. 7 días atrás o updatedAt del servidor)
                const rawWipeDate = details.rust_last_wipe || details.rust_lastWipe || details.lastWipe;
                let fechaWipe = rawWipeDate ? new Date(rawWipeDate) : null;

                if (!fechaWipe || isNaN(fechaWipe.getTime())) {
                    // Respaldo por defecto: si el servidor no reporta wipe, tomamos los últimos 7 días como rango del ranking
                    fechaWipe = new Date();
                    fechaWipe.setDate(fechaWipe.getDate() - 7); 
                }

                // Consultar sesiones filtradas por el servidor objetivo
                const sessionsResponse = await axios.get(
                    `https://api.battlemetrics.com/players/${playerId}/relationships/sessions?filter[servers]=${targetServerId}&page[size]=100`,
                    { headers }
                );

                const sessions = sessionsResponse.data.data || [];
                let segundosDesdeWipe = 0;

                for (const session of sessions) {
                    const attributes = session.attributes || {};
                    const start = new Date(attributes.start);
                    const stop = attributes.stop ? new Date(attributes.stop) : new Date();

                    if (stop >= fechaWipe) {
                        const effectiveStart = start < fechaWipe ? fechaWipe : start;
                        const diffSeconds = (stop - effectiveStart) / 1000;
                        if (diffSeconds > 0) {
                            segundosDesdeWipe += diffSeconds;
                        }
                    }
                }
                horasDesdeWipe = (segundosDesdeWipe / 3600).toFixed(2);

            } catch (err) {
                console.log(`Error calculando horas para el servidor objetivo:`, err.message);
            }
        }

        return {
            nombre: nombreJugador,
            horasDesdeWipe: horasDesdeWipe
        };

    } catch (error) {
        console.log("ERROR API:", error.response?.data || error.message);
        return {
            nombre: "Desconocido",
            horasDesdeWipe: "0.00"
        };
    }
}

module.exports = { getBattleMetricsHours };