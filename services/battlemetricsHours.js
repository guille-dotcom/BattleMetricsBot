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
        let primerServidorActual = "Ninguno / Desconectado";

        for (const servidor of servidores) {
            if (servidor.type !== "server") continue;

            const servidorId = servidor.id;

            // Guarda el primer servidor que aparece en el perfil
            if (primerServidorActual === "Ninguno / Desconectado") {
                primerServidorActual = servidor.attributes.name;
            }

            if (servidoresContados.has(servidorId)) {
                continue;
            }

            servidoresContados.add(servidorId);

            const tiempo = servidor.meta?.timePlayed || 0;
            segundosTotales += tiempo;

            listaServidores.push({
                id: servidorId,
                nombre: servidor.attributes.name,
                segundos: tiempo,
                horas: (tiempo / 3600).toFixed(2)
            });
        }

        const horasTotales = (segundosTotales / 3600).toFixed(2);

        return {
            nombre: nombreJugador,
            totalHoras: horasTotales,
            primerServidor: primerServidorActual,
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