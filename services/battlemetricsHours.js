require("dotenv").config();
const axios = require("axios");

async function getBattleMetricsHours(playerId) {
    try {
        console.log("CONSULTANDO DATOS DEL JUGADOR...");

        const token = process.env.BATTLEMETRICS_TOKEN;

        const response = await axios.get(
            `https://api.battlemetrics.com/players/${playerId}?include=server`,
            {
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const player = response.data.data;
        const included = response.data.included || [];

        const nombreJugador = player.attributes.name || "Desconocido";

        // Mapear los servidores del array included
        const servidoresMap = new Map();
        for (const item of included) {
            if (item.type === "server") {
                servidoresMap.set(item.id, item);
            }
        }

        let segundosTotales = 0;
        let listaServidores = [];
        const servidoresContados = new Set();

        for (const item of included) {
            if (item.type === "server") {
                const servidorId = item.id;
                if (servidoresContados.has(servidorId)) continue;
                servidoresContados.add(servidorId);

                const tiempo = item.meta?.timePlayed || 0;
                segundosTotales += tiempo;

                listaServidores.push({
                    id: servidorId,
                    nombre: item.attributes.name,
                    segundos: tiempo,
                    horas: (tiempo / 3600).toFixed(2)
                });
            }
        }

        // Comprobamos si está en una sesión activa (Current Server)
        let estadoServidorActual = "🔴 Offline / Desconectado de Rust";
        
        const relationships = player.relationships?.server?.data;
        if (relationships) {
            const relArray = Array.isArray(relationships) ? relationships : [relationships];
            if (relArray.length > 0 && relArray[0].id) {
                const currentServerId = relArray[0].id;
                const servidorActualObj = servidoresMap.get(currentServerId);
                if (servidorActualObj) {
                    estadoServidorActual = servidorActualObj.attributes.name;
                }
            }
        }

        const horasTotales = (segundosTotales / 3600).toFixed(2);

        return {
            nombre: nombreJugador,
            totalHoras: horasTotales,
            primerServidor: estadoServidorActual,
            servidores: {
                rust: {
                    horas: horasTotales,
                    datos: {
                        servidoresEncontrados: listaServidores.length,
                        lista: listaServidores
                    }
                }
            }
        };

    } catch (error) {
        console.log("ERROR API:", error.response?.data || error.message);

        return {
            nombre: "Desconocido",
            totalHoras: "0.00",
            primerServidor: "🔴 Offline / Desconectado de Rust",
            servidores: {
                rust: {
                    horas: "0.00",
                    datos: {
                        servidoresEncontrados: 0,
                        lista: []
                    }
                }
            }
        };
    }
}

module.exports = {
    getBattleMetricsHours
};