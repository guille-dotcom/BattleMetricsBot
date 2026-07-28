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

                // Capturamos la fecha de la última vez visto en este servidor
                const lastSeen = item.meta?.lastSeen || item.attributes?.updatedAt || "";

                listaServidores.push({
                    id: servidorId,
                    nombre: item.attributes.name,
                    segundos: tiempo,
                    horas: (tiempo / 3600).toFixed(2),
                    lastSeen: lastSeen
                });
            }
        }

        // Ordenamos los servidores por la fecha más reciente (el que tenga actividad más actual primero)
        listaServidores.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));

        // Verificamos si el más reciente tiene actividad reciente (por ejemplo, en las últimas 2 horas) o cogemos el primero de la lista
        let estadoServidorActual = "🔴 Offline / Desconectado de Rust";
        
        if (listaServidores.length > 0) {
            const primerServidor = listaServidores[0];
            // Si el servidor superior tiene un lastSeen válido, lo mostramos
            if (primerServidor.nombre) {
                estadoServidorActual = primerServidor.nombre;
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