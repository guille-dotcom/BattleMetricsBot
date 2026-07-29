require("dotenv").config();
const axios = require("axios");

async function getBattleMetricsHours(playerId, targetServerId = null) {
    try {
        const token = process.env.BATTLEMETRICS_TOKEN;
        const headers = {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        };

        // 1. Obtener datos del jugador
        const playerRes = await axios.get(
            `https://api.battlemetrics.com/players/${playerId}`,
            { headers }
        );

        const player = playerRes.data.data;
        const nombreJugador = player.attributes.name || "Desconocido";

        let nombreServidorActual = "No conectado en ningún servidor";
        let onlineServerId = null;

        // 2. Para obtener el servidor actual real donde está "last seen now", 
        // consultamos las relaciones activas del jugador en la API
        try {
            const relRes = await axios.get(
                `https://api.battlemetrics.com/players/${playerId}/relationships/server`,
                { headers }
            );
            
            // Si el endpoint de relación directa devuelve un servidor activo
            const relData = relRes.data.data;
            if (relData) {
                onlineServerId = Array.isArray(relData) ? relData[0]?.id : relData.id;
            }
        } catch (e) {
            // Si falla la relación directa, buscamos mediante las sesiones ordenadas por fecha de inicio descendente (-start)
            try {
                const sessionsRes = await axios.get(
                    `https://api.battlemetrics.com/sessions`,
                    { 
                        headers,
                        params: { 
                            "filter[player]": playerId,
                            "page[size]": 5,
                            "sort": "-start"
                        },
                        validateStatus: function (status) {
                            return status < 500; // Evita lanzar excepción si da 400 y nos permite manejarlo
                        }
                    }
                );

                if (sessionsRes.status === 200) {
                    const sessions = sessionsRes.data.data || [];
                    const includedServers = sessionsRes.data.included || [];
                    
                    const serverMap = {};
                    for (const inc of includedServers) {
                        if (inc.type === "server") {
                            serverMap[inc.id] = inc.attributes.name;
                        }
                    }

                    // Buscamos la primera sesión que no tenga 'stop' (es decir, que esté jugando ahora mismo)
                    for (const session of sessions) {
                        const attr = session.attributes || {};
                        const serverRel = session.relationships?.server?.data;
                        if (!attr.stop && serverRel) {
                            onlineServerId = serverRel.id;
                            break;
                        }
                    }

                    // Si ninguna está abierta explícitamente, tomamos la más reciente si ocurrió hace muy poco
                    if (!onlineServerId && sessions.length > 0) {
                        const latest = sessions[0];
                        if (latest.relationships?.server?.data) {
                            onlineServerId = latest.relationships.server.data.id;
                        }
                    }
                }
            } catch (err) {
                console.log("Error buscando sesiones alternativas:", err.message);
            }
        }

        // 3. Obtener el nombre exacto del servidor actual usando su ID
        if (onlineServerId) {
            try {
                const serverRes = await axios.get(
                    `https://api.battlemetrics.com/servers/${onlineServerId}`,
                    { headers }
                );
                nombreServidorActual = serverRes.data.data.attributes.name;
            } catch (err) {
                console.log("Error obteniendo nombre del servidor por ID:", err.message);
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