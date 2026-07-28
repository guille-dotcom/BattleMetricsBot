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
        let servidorActualId = null;

        for (const item of included) {
            if (item.type === "server") {
                const servidorId = item.id;
                if (servidoresContados.has(servidorId)) continue;
                servidoresContados.add(servidorId);

                const tiempo = item.meta?.timePlayed || 0;
                segundosTotales += tiempo;

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

        // Ordenamos los servidores por la fecha más reciente
        listaServidores.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));

        let estadoServidorActual = "🔴 Offline / Desconectado de Rust";
        let ultimoWipeServidor = "Desconocido";

        if (listaServidores.length > 0 && listaServidores[0].nombre) {
            const servidorPrincipal = listaServidores[0];
            estadoServidorActual = servidorPrincipal.nombre;
            servidorActualId = servidorPrincipal.id;

            try {
                console.log(`CONSULTANDO DETALLES DEL SERVIDOR ID: ${servidorActualId}...`);
                const serverResponse = await axios.get(
                    `https://api.battlemetrics.com/servers/${servidorActualId}`,
                    {
                        headers: {
                            "Authorization": `Bearer ${token}`,
                            "Content-Type": "application/json"
                        }
                    }
                );

                const serverAttributes = serverResponse.data.data.attributes;
                const details = serverAttributes.details || {};
                
                // Extraemos exactamente rust_last_wipe que viene en los detalles
                const rawWipe = details.rust_last_wipe || details.rust_lastWipe || details.lastWipe || null;

                if (rawWipe) {
                    const fechaWipe = new Date(rawWipe);
                    if (!isNaN(fechaWipe.getTime())) {
                        ultimoWipeServidor = fechaWipe.toLocaleDateString("es-ES", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit"
                        });
                    }
                }
            } catch (err) {
                console.log("No se pudieron obtener los detalles específicos del servidor:", err.message);
            }
        }

        const horasTotales = (segundosTotales / 3600).toFixed(2);

        return {
            nombre: nombreJugador,
            totalHoras: horasTotales,
            primerServidor: estadoServidorActual,
            ultimoWipe: ultimoWipeServidor,
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
            ultimoWipe: "Desconocido",
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