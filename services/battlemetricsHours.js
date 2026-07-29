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
        const nombreJugador = player.attributes?.name || "Desconocido";

        let nombreServidorActual = "No conectado en ningún servidor";
        let onlineServerId = targetServerId;

        // 2. Obtener la sesión actual usando el filtro correcto de la API de BattleMetrics
        try {
            const sessionsRes = await axios.get(
                `https://api.battlemetrics.com/sessions`,
                { 
                    headers,
                    params: { 
                        "filter[player]": playerId,
                        "filter[active]": "true",
                        "include": "server"
                    }
                }
            );

            const sessions = sessionsRes.data.data || [];
            const included = sessionsRes.data.included || [];

            const serverMap = {};
            for (const inc of included) {
                if (inc.type === "server") {
                    serverMap[inc.id] = inc.attributes?.name;
                }
            }

            if (sessions.length > 0) {
                const activeSession = sessions[0];
                const serverRel = activeSession.relationships?.server?.data;
                if (serverRel) {
                    onlineServerId = serverRel.id;
                    if (serverMap[onlineServerId]) {
                        nombreServidorActual = serverMap[onlineServerId];
                    }
                }
            }
        } catch (e) {
            console.log("Error consultando sesiones activas:", e.response?.data || e.message);
        }

        // 3. Respaldo por ID de servidor si no se encontró en las activas
        if (onlineServerId && nombreServidorActual === "No conectado en ningún servidor") {
            try {
                const serverRes = await axios.get(
                    `https://api.battlemetrics.com/servers/${onlineServerId}`,
                    { headers }
                );
                nombreServidorActual = serverRes.data.data.attributes?.name || "Desconocido";
            } catch (err) {
                console.log("Error consultando servidor directo:", err.message);
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