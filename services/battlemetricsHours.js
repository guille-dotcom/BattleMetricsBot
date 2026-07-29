require("dotenv").config();
const axios = require("axios");

async function getBattleMetricsHours(playerId, targetServerId = null) {
    try {
        const token = process.env.BATTLEMETRICS_TOKEN;
        const headers = {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        };

        // 1. Obtener datos básicos del jugador (Nombre)
        const playerRes = await axios.get(
            `https://api.battlemetrics.com/players/${playerId}`,
            { headers }
        );

        const player = playerRes.data.data;
        const nombreJugador = player.attributes.name || "Desconocido";

        let totalHoras = 0;
        let nombreServidorActual = "No conectado en ningún servidor";
        let servidoresEncontrados = 0;
        let horasDesdeWipe = "0.00";
        let fechaWipeFormateada = "Desconocido";
        let onlineServerId = targetServerId;

        // 2. Obtener lista de servidores del jugador para sumar horas totales y detectar 100% el que está online
        try {
            const serversRes = await axios.get(
                `https://api.battlemetrics.com/players/${playerId}/servers`,
                { 
                    headers,
                    params: { "page[size]": 100 }
                }
            );

            const serverList = serversRes.data.data || [];
            servidoresEncontrados = serverList.length;

            for (const s of serverList) {
                const timePlayed = s.attributes?.timePlayed || 0;
                totalHoras += timePlayed / 3600;

                // Buscar estrictamente el servidor donde esté online
                if (!onlineServerId && s.attributes?.status === "online") {
                    onlineServerId = s.id;
                }
            }
        } catch (e) {
            console.log("Error obteniendo servidores del jugador:", e.message);
        }

        // 3. Si hay un servidor online, consultamos sus datos, su último wipe y sus sesiones
        if (onlineServerId) {
            try {
                const serverResponse = await axios.get(
                    `https://api.battlemetrics.com/servers/${onlineServerId}`,
                    { headers }
                );
                const serverData = serverResponse.data.data;
                const details = serverData.attributes?.details || {};
                
                nombreServidorActual = serverData.attributes?.name || "Desconocido";

                const lastWipeStr = details.rustLastWipe || details.wipeTime || details.rust_last_wipe || serverData.attributes?.metadata?.rustLastWipe;
                let fechaWipe = lastWipeStr ? new Date(lastWipeStr) : null;

                if (!fechaWipe || isNaN(fechaWipe.getTime()) || fechaWipe > new Date()) {
                    fechaWipe = new Date(Date.now() - (4 * 24 * 60 * 60 * 1000));
                    fechaWipeFormateada = "No disponible (últimos 4 días)";
                } else {
                    fechaWipeFormateada = fechaWipe.toLocaleString();
                }

                // Obtener sesiones en este servidor para calcular las horas desde el wipe
                const sessionsResponse = await axios.get(
                    `https://api.battlemetrics.com/sessions`,
                    {
                        headers,
                        params: {
                            "filter[player]": playerId,
                            "filter[server]": onlineServerId,
                            "page[size]": 100
                        }
                    }
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
                        const diffWipe = (stop - effectiveStart) / 1000;
                        if (diffWipe > 0) {
                            segundosDesdeWipe += diffWipe;
                        }
                    }
                }

                horasDesdeWipe = (segundosDesdeWipe / 3600).toFixed(2);

            } catch (err) {
                console.log(`Error obteniendo datos del servidor online o sus sesiones:`, err.message);
            }
        }

        return {
            nombre: nombreJugador,
            totalHoras: totalHoras,
            primerServidor: nombreServidorActual,
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