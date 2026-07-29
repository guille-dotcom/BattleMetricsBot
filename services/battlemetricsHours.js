require("dotenv").config();
const axios = require("axios");

async function getBattleMetricsHours(playerId, targetServerId = null) {
    try {
        const token = process.env.BATTLEMETRICS_TOKEN;
        const headers = {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        };

        // 1. Obtener datos básicos del jugador
        const playerRes = await axios.get(
            `https://api.battlemetrics.com/players/${playerId}`,
            { headers }
        );

        const player = playerRes.data.data;
        const nombreJugador = player.attributes.name || "Desconocido";

        let totalHoras = 0;
        let primerServidor = "Ninguno / Desconocido";
        let servidoresEncontrados = 0;
        let horasDesdeWipe = "0.00";
        let fechaWipeFormateada = "Desconocido";

        if (targetServerId) {
            try {
                // 2. Obtener datos del servidor configurado y su fecha de wipe
                const serverResponse = await axios.get(
                    `https://api.battlemetrics.com/servers/${targetServerId}`,
                    { headers }
                );
                const serverData = serverResponse.data.data;
                const details = serverData.attributes?.details || {};
                
                primerServidor = serverData.attributes?.name || "Desconocido";

                const lastWipeStr = details.rustLastWipe || details.wipeTime || serverData.attributes?.metadata?.rustLastWipe;
                let fechaWipe = lastWipeStr ? new Date(lastWipeStr) : null;

                if (!fechaWipe || isNaN(fechaWipe.getTime()) || fechaWipe > new Date()) {
                    fechaWipe = new Date(Date.now() - (4 * 24 * 60 * 60 * 1000)); // 4 días atrás por defecto
                    fechaWipeFormateada = "No disponible (últimos 4 días)";
                } else {
                    fechaWipeFormateada = fechaWipe.toLocaleString();
                }

                // 3. Consultar las sesiones del jugador en este servidor específico
                const sessionsResponse = await axios.get(
                    `https://api.battlemetrics.com/players/${playerId}/servers/${targetServerId}/sessions`,
                    {
                        headers,
                        params: { "page[size]": 100 }
                    }
                );

                const sessions = sessionsResponse.data.data || [];
                let segundosDesdeWipe = 0;
                let segundosTotalesServidor = 0;
                const ahora = new Date();

                for (const session of sessions) {
                    const attributes = session.attributes || {};
                    const start = new Date(attributes.start);
                    const stop = attributes.stop ? new Date(attributes.stop) : ahora;

                    const diffServer = (stop - start) / 1000;
                    if (diffServer > 0) {
                        segundosTotalesServidor += diffServer;
                    }

                    if (stop >= fechaWipe) {
                        const effectiveStart = start < fechaWipe ? fechaWipe : start;
                        const diffWipe = (stop - effectiveStart) / 1000;
                        if (diffWipe > 0) {
                            segundosDesdeWipe += diffWipe;
                        }
                    }
                }

                totalHoras = segundosTotalesServidor / 3600;
                horasDesdeWipe = (segundosDesdeWipe / 3600).toFixed(2);

            } catch (err) {
                console.log(`Error obteniendo sesiones del servidor objetivo:`, err.message);
            }
        }

        // Obtener cantidad total de servidores jugados
        try {
            const relRes = await axios.get(
                `https://api.battlemetrics.com/players/${playerId}/relationships/servers`,
                { headers }
            );
            servidoresEncontrados = relRes.data.data?.length || 0;
        } catch (e) {
            servidoresEncontrados = 0;
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
        console.log("ERROR API battlemetricsHours:", error.response?.data || error.message);
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