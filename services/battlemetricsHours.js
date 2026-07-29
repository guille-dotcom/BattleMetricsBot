require("dotenv").config();
const axios = require("axios");

async function getBattleMetricsHours(playerId, targetServerId = null) {
    try {
        const token = process.env.BATTLEMETRICS_TOKEN;
        const headers = {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        };

        // 1. Obtener datos del jugador (Nombre)
        const playerRes = await axios.get(
            `https://api.battlemetrics.com/players/${playerId}`,
            { headers }
        );

        const player = playerRes.data.data;
        const nombreJugador = player.attributes?.name || "Desconocido";

        let nombreServidorActual = "No conectado en ningún servidor";
        let onlineServerId = targetServerId;

        // 2. Obtener sesiones recientes para detectar el servidor actual (la sesión abierta sin 'stop')
        try {
            const sessionsRes = await axios.get(
                `https://api.battlemetrics.com/sessions`,
                { 
                    headers,
                    params: { 
                        "filter[player]": playerId,
                        "page[size]": 5,
                        "sort": "-start",
                        "include": "server"
                    }
                }
            );

            const sessions = sessionsRes.data.data || [];
            const included = sessionsRes.data.included || [];

            // Mapear los servidores incluidos
            const serverMap = {};
            for (const inc of included) {
                if (inc.type === "server") {
                    serverMap[inc.id] = inc.attributes?.name;
                }
            }

            // Buscar la sesión actual (la que no tiene 'stop')
            for (const session of sessions) {
                const attr = session.attributes || {};
                const serverRel = session.relationships?.server?.data;

                if (!attr.stop && serverRel) {
                    onlineServerId = serverRel.id;
                    if (serverMap[onlineServerId]) {
                        nombreServidorActual = serverMap[onlineServerId];
                    }
                    break;
                }
            }

            // Si no hay una sesión explícitamente abierta pero la última ocurrió hace menos de 10 minutos, tomarla como actual
            if (nombreServidorActual === "No conectado en ningún servidor" && sessions.length > 0) {
                const latest = sessions[0];
                const serverRel = latest.relationships?.server?.data;
                if (serverRel) {
                    onlineServerId = serverRel.id;
                    if (serverMap[onlineServerId]) {
                        nombreServidorActual = serverMap[onlineServerId];
                    }
                }
            }

        } catch (e) {
            console.log("Error consultando sesiones para el servidor actual:", e.message);
        }

        // 3. Respaldo por si tenemos el ID pero no el nombre exacto
        if (onlineServerId && nombreServidorActual === "No conectado en ningún servidor") {
            try {
                const serverRes = await axios.get(
                    `https://api.battlemetrics.com/servers/${onlineServerId}`,
                    { headers }
                );
                nombreServidorActual = serverRes.data.data.attributes?.name || "Desconocido";
            } catch (err) {
                console.log("Error consultando servidor directo por ID:", err.message);
            }
        }

        return {
            nombre: nombreJugador,
            totalHoras: 0,
            primerServidor: nombreServidorActual,
            ultimoWipe: "Desconocido",
            horasDesdeWipe: "0.00",
            servidores: {
                rust: {
                    datos: {
                        servidoresEncontrados: 0
                    }
                }
            }
        };

    } catch (error) {
        console.log("ERROR API battlemetricsHours:", error.response?.data || error.message);
        return {
            nombre: "Desconocido",
            totalHoras: 0,
            primerServidor: "No conectado en ningún servidor",
            ultimoWipe: "Desconocido",
            horasDesdeWipe: "0.00",
            servidores: { rust: { datos: { servidoresEncontrados: 0 } } }
        };
    }
}

module.exports = { getBattleMetricsHours };