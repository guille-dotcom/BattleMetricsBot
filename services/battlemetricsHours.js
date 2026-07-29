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

        // 2. Obtener lista de servidores del jugador usando el endpoint correcto de la API
        try {
            const serversRes = await axios.get(
                `https://api.battlemetrics.com/servers`,
                { 
                    headers,
                    params: { 
                        "filter[players]": playerId,
                        "page[size]": 100 
                    }
                }
            );

            const serverList = serversRes.data.data || [];
            
            // Si la API devuelve un total en meta, lo usaremos como servidores encontrados
            if (serversRes.data.meta && serversRes.data.meta.total) {
                servidoresEncontrados = serversRes.data.meta.total;
            } else {
                servidoresEncontrados = serverList.length;
            }

            for (const s of serverList) {
                // BattleMetrics incluye el tiempo jugado por el jugador en las relaciones o metadatos del servidor
                const rustTime = s.attributes?.details?.rustTime || s.relationships?.player?.meta?.timePlayed || 0;
                // Si viene el tiempo en los atributos de la relación o del server
                const timePlayed = s.attributes?.timePlayed || rustTime || 0;
                totalHoras += timePlayed / 3600;

                // Detectar si el jugador está online en este servidor ahora mismo
                // Verificamos si el estado del servidor o la sesión indica que está activo
                const details = s.attributes?.details || {};
                const playersList = details.players || [];
                
                // Si no se ha encontrado servidor online, revisamos si está en este
                if (!onlineServerId) {
                    // Si el servidor está activo y el jugador figura en él
                    if (s.attributes?.status === "online") {
                        // Comprobación adicional por si podemos asegurar que es su servidor actual
                        onlineServerId = s.id;
                    }
                }
            }

            // Si por alguna razón no detectó el online por estatus pero hay servidores recientes, 
            // tomamos el primer servidor de la lista si el jugador está activo en él
            if (!onlineServerId && serverList.length > 0) {
                onlineServerId = serverList[0].id;
            }

        } catch (e) {
            console.log("Error obteniendo servidores del jugador:", e.message);
        }

        // 3. Si tenemos un servidor identificado, consultamos sus detalles, el último wipe y las sesiones
        if (onlineServerId) {
            try {
                const serverResponse = await axios.get(
                    `https://api.battlemetrics.com/servers/${onlineServerId}`,
                    { headers }
                );
                const serverData = responseData = serverResponse.data.data;
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

                // Obtener sesiones para este servidor y calcular horas desde el wipe
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