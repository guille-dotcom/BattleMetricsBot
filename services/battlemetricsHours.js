require("dotenv").config();
const axios = require("axios");

async function getBattleMetricsHours(playerId, targetServerId = null) {
    try {
        const token = process.env.BATTLEMETRICS_TOKEN;
        const headers = {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        };

        // 1. Obtener datos del jugador y su servidor actual mediante include=server
        const playerRes = await axios.get(
            `https://api.battlemetrics.com/players/${playerId}`,
            { 
                headers,
                params: {
                    "include": "server"
                }
            }
        );

        const playerData = playerRes.data;
        const player = playerData.data;
        const nombreJugador = player.attributes.name || "Desconocido";

        let nombreServidorActual = "No conectado en ningún servidor";
        let onlineServerId = null;

        // Comprobar si el jugador está conectado y BattleMetrics incluye el servidor actual
        if (playerData.included) {
            const activeServer = playerData.included.find(inc => inc.type === "server");
            if (activeServer) {
                nombreServidorActual = activeServer.attributes.name || "Desconocido";
                onlineServerId = activeServer.id;
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