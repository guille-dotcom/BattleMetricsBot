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
        const servidores = response.data.included || [];

        const nombreJugador = player.attributes.name || "Desconocido";

        let segundosTotales = 0;
        let listaServidores = [];
        const servidoresContados = new Set();

        // Buscamos si el jugador tiene servidores en las relaciones o en los datos del jugador
        for (const servidor of servidores) {
            if (servidor.type !== "server") continue;

            const servidorId = servidor.id;

            if (servidoresContados.has(servidorId)) {
                continue;
            }

            servidoresContados.add(servidorId);

            const tiempo = servidor.meta?.timePlayed || 0;
            segundosTotales += tiempo;

            // Extraemos la fecha de última vez visto si existe
            const lastSeen = servidor.attributes?.updatedAt || servidor.meta?.lastSeen || "";

            listaServidores.push({
                id: servidorId,
                nombre: servidor.attributes.name,
                segundos: tiempo,
                horas: (tiempo / 3600).toFixed(2),
                lastSeen: lastSeen
            });
        }

        // Ordenamos los servidores para que el más reciente/actual quede primero
        // BattleMetrics suele incluir un campo de metadatos o fecha en las relaciones
        listaServidores.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));

        const primerServidorActual = listaServidores.length > 0 ? listaServidores[0].nombre : "Ninguno / Desconectado";

        const horasTotales = (segundosTotales / 3600).toFixed(2);

        return {
            nombre: nombreJugador,
            totalHoras: horasTotales,
            primerServidor: primerServidorActual, // Este será ahora el verdadero primer servidor
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
            primerServidor: "Desconocido",
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