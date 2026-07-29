require("dotenv").config();
const axios = require("axios");

async function getBattleMetricsHours(playerId, targetServerId = null) {
    try {
        const token = process.env.BATTLEMETRICS_TOKEN;
        const headers = {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        };

        // 1. Obtener datos del jugador y relaciones (incluyendo servidores donde ha estado)
        const response = await axios.get(
            `https://api.battlemetrics.com/players/${playerId}?include=identifier,server`,
            { headers }
        );

        const player = response.data.data;
        const nombreJugador = player.attributes.name || "Desconocido";
        const included = response.data.included || [];

        let totalHoras = 0;
        let primerServidor = "Ninguno / Desconocido";
        let servidoresEncontrados = 0;

        // Buscar información en los datos incluidos
        for (const item of included) {
            if (item.type === "server") {
                servidoresEncontrados++;
                // Tomamos el primer servidor activo o registrado como referencia
                if (primerServidor === "Ninguno / Desconocido" && item.attributes?.name) {
                    primerServidor = item.attributes.name;
                }
            }
        }

        // Si el jugador tiene metadata o estadísticas generales en el perfil
        if (player.attributes.timePlayed) {
            totalHoras = player.attributes.timePlayed / 3600;
        }

        let horasDesdeWipe = "0.00";
        let fechaWipeFormateada = "Desconocido";

        if (targetServerId) {
            try {
                // Obtener datos del servidor configurado
                const serverResponse = await axios.get(`https://api.battlemetrics.com/servers/${targetServerId}`, { headers });
                const serverAttributes = serverResponse.data.data.attributes;
                const details = serverAttributes.details || {};
                
                primerServidor = serverAttributes.name || primerServidor;

                const rawWipeDate = details.rustLastWipe || details.rust_lastWipe || details.wipeTime || serverAttributes.metadata?.rustLastWipe;
                let fechaWipe = rawWipeDate ? new Date(rawWipeDate) : null;

                if (!fechaWipe || isNaN(fechaWipe.getTime())) {
                    fechaWipe = new Date();
                    fechaWipe.setDate(fechaWipe.getDate() - 4); // Respaldo de 4 días
                    fechaWipeFormateada = "No disponible (últimos 4 días)";
                } else {
                    fechaWipeFormateada = fechaWipe.toLocaleString();
                }

                // Consultar sesiones filtradas por el servidor objetivo
                const sessionsResponse = await axios.get(
                    `https://api.battlemetrics.com/players/${playerId}/relationships/sessions?filter[servers]=${targetServerId}&page[size]=100`,
                    { headers }
                );

                const sessions = sessionsResponse.data.data || [];
                let segundosDesdeWipe = 0;
                const ahora = new Date();

                for (const session of sessions) {
                    const attributes = session.attributes || {};
                    const start = new Date(attributes.start);
                    const stop = attributes.stop ? new Date(attributes.stop) : ahora;

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
            totalHoras: totalHoras,
            primerServidor: primerServidor,
            ultimoWipe: fechaWipeFormateada,
            horasDesdeWipe: horasDesdeWipe,
            servidores: {
                rust: {
                    datos: {
                        servidoresEncontrados: servidoresEncontrados
                    }
                }
            }
        };

    } catch (error) {
        console.log("ERROR API:", error.response?.data || error.message);
        return {
            nombre: "Desconocido",
            totalHoras: 0,
            primerServidor: "Desconocido",
            ultimoWipe: "Desconocido",
            horasDesdeWipe: "0.00",
            servidores: { rust: { datos: { servidoresEncontrados: 0 } } }
        };
    }
}

module.exports = { getBattleMetricsHours };