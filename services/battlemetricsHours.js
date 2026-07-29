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
        let nombreServidorActual = "No conectado en ningún servidor";
        let servidoresEncontrados = 0;
        let horasDesdeWipe = "0.00";
        let fechaWipeFormateada = "Desconocido";
        let onlineServerId = targetServerId;

        // 2. Obtener sesiones del jugador para calcular horas totales y detectar servidor actual
        try {
            const sessionsRes = await axios.get(
                `https://api.battlemetrics.com/sessions`,
                { 
                    headers,
                    params: { 
                        "filter[player]": playerId,
                        "page[size]": 100,
                        "sort": "-start"
                    }
                }
            );

            const sessions = sessionsRes.data.data || [];
            const uniqueServers = new Set();
            let segundosTotales = 0;
            const ahora = new Date();

            for (const session of sessions) {
                const attr = session.attributes || {};
                const serverRel = session.relationships?.server?.data;
                if (serverRel) {
                    uniqueServers.add(serverRel.id);
                }

                const start = new Date(attr.start);
                const stop = attr.stop ? new Date(attr.stop) : ahora;
                const diff = (stop - start) / 1000;
                if (diff > 0) {
                    segundosTotales += diff;
                }

                // Detectar servidor activo (sesión sin stop)
                if (!attr.stop && serverRel && !onlineServerId) {
                    onlineServerId = serverRel.id;
                }
            }

            totalHoras = segundosTotales / 3600;
            servidoresEncontrados = uniqueServers.size;

            // Respaldo por si la sesión más reciente está activa
            if (!onlineServerId && sessions.length > 0) {
                const latestSession = sessions[0];
                if (!latestSession.attributes?.stop) {
                    onlineServerId = latestSession.relationships?.server?.data?.id;
                }
            }

        } catch (e) {
            console.log("Error obteniendo sesiones del jugador:", e.message);
        }

        // 3. Obtener detalles del servidor actual, su wipe y calcular horas desde el wipe
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

                // Obtener sesiones para este servidor específico y calcular horas desde el wipe
                const serverSessionsRes = await axios.get(
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

                const serverSessions = serverSessionsRes.data.data || [];
                let segundosDesdeWipe = 0;
                const ahora = new Date();

                for (const session of serverSessions) {
                    const attr = session.attributes || {};
                    const start = new Date(attr.start);
                    const stop = attr.stop ? new Date(attr.stop) : ahora;

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
                console.log(`Error obteniendo datos del servidor o sesiones:`, err.message);
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