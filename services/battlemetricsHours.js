require("dotenv".config();
const axios = require("axios");

async function getBattleMetricsHours(playerId, targetServerId = null) {
    try {
        const token = process.env.BATTLEMETRICS_TOKEN;
        const headers = {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        };

        // 1. Obtener datos del jugador incluyendo la relación y los datos incluidos del servidor
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

        // Comprobar si hay relaciones de servidor activas en el objeto del jugador
        const serverRelationship = player.relationships?.server?.data;
        if (serverRelationship) {
            onlineServerId = serverRelationship.id;
        }

        // Si tenemos el ID del servidor actual, buscamos su nombre en los elementos 'included' de la respuesta
        if (onlineServerId && playerData.included) {
            const serverInfo = playerData.included.find(inc => inc.type === "server" && inc.id === onlineServerId);
            if (serverInfo) {
                nombreServidorActual = serverInfo.attributes.name || "Desconocido";
            }
        }

        // Si no venía en el 'included', hacemos una consulta directa al servidor por su ID
        if (onlineServerId && nombreServidorActual === "No conectado en ningún servidor") {
            try {
                const serverRes = await axios.get(
                    `https://api.battlemetrics.com/servers/${onlineServerId}`,
                    { headers }
                );
                nombreServidorActual = serverRes.data.data.attributes.name || "Desconocido";
            } catch (err) {
                console.log("Error consultando detalles del servidor actual:", err.message);
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