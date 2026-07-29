require("dotenv").config();
const axios = require("axios");

async function getBattleMetricsHours(playerId, targetServerId = null) {
    try {
        console.log(`CONSULTANDO DATOS DEL JUGADOR ${playerId} (Servidor objetivo: ${targetServerId || "Automático"})...`);

        const token = process.env.BATTLEMETRICS_TOKEN;
        const headers = {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        };

        const response = await axios.get(
            `https://api.battlemetrics.com/players/${playerId}?include=server`,
            { headers }
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

                listaServidores.push({
                    id: servidorId,
                    nombre: item.attributes.name,
                    segundos: tiempo,
                    horas: (tiempo / 3600).toFixed(2),
                    lastSeen: item.meta?.lastSeen || item.attributes?.updatedAt || "",
                    online: item.meta?.online || false
                });
            }
        }

        // Definir cuál servidor vamos a auditar para las horas desde el wipe
        let servidorIdAUsar = targetServerId;
        let nombreServidorActual = "🔴 Offline / Desconectado de Rust";

        if (!servidorIdAUsar && listaServidores.length > 0) {
            // Si no hay uno forzado, ordenamos por fecha reciente
            listaServidores.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
            const servidorPrincipal = listaServidores[0];
            const now = new Date();
            const diffMinutes = (now - new Date(servidorPrincipal.lastSeen)) / (1000 * 60);

            if (servidorPrincipal.online || diffMinutes <= 10) {
                servidorIdAUsar = servidorPrincipal.id;
            }
        }

        let horasDesdeWipe = "0.00";
        let ultimoWipeServidor = "Desconocido";

        if (servidorIdAUsar) {
            try {
                // Consultar detalles del servidor específico para obtener el wipe
                const serverResponse = await axios.get(`https://api.battlemetrics.com/servers/${servidorIdAUsar}`, { headers });
                const serverAttributes = serverResponse.data.data.attributes;
                nombreServidorActual = serverAttributes.name || nombreServidorActual;

                const details = serverAttributes.details || {};
                const rawWipeDate = details.rust_last_wipe || details.rust_lastWipe || details.lastWipe || serverAttributes.updatedAt;

                if (rawWipeDate) {
                    const fechaWipe = new Date(rawWipeDate);
                    if (!isNaN(fechaWipe.getTime())) {
                        ultimoWipeServidor = fechaWipe.toLocaleDateString("es-ES", {
                            day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
                        });

                        // Consultar sesiones del jugador para ese servidor desde el wipe
                        const sessionsResponse = await axios.get(
                            `https://api.battlemetrics.com/players/${playerId}/relationships/sessions?page[size]=100`,
                            { headers }
                        );

                        const sessions = sessionsResponse.data.data || [];
                        let segundosDesdeWipe = 0;

                        for (const session of sessions) {
                            const relServer = session.relationships?.server?.data;
                            if (!relServer || relServer.id !== servidorIdAUsar) continue;

                            const attributes = session.attributes || {};
                            const start = new Date(attributes.start);
                            const stop = attributes.stop ? new Date(attributes.stop) : new Date();

                            if (stop >= fechaWipe) {
                                const effectiveStart = start < fechaWipe ? fechaWipe : start;
                                const diffSeconds = (stop - effectiveStart) / 1000;
                                if (diffSeconds > 0) {
                                    segundosDesdeWipe += diffSeconds;
                                }
                            }
                        }
                        horasDesdeWipe = (segundosDesdeWipe / 3600).toFixed(2);
                    }
                }
            } catch (err) {
                console.log("Error al calcular horas del servidor específico:", err.message);
            }
        }

        const horasTotales = (segundosTotales / 3600).toFixed(2);

        return {
            nombre: nombreJugador,
            totalHoras: horasTotales,
            primerServidor: nombreServidorActual,
            ultimoWipe: ultimoWipeServidor,
            horasDesdeWipe: horasDesdeWipe,
            servidores: {
                rust: {
                    horas: horasTotales,
                    datos: { servidoresEncontrados: listaServidores.length, lista: listaServidores }
                }
            }
        };

    } catch (error) {
        console.log("ERROR API:", error.response?.data || error.message);
        return {
            nombre: "Desconocido", totalHoras: "0.00", primerServidor: "🔴 Offline", ultimoWipe: "Desconocido", horasDesdeWipe: "0.00",
            servidores: { rust: { horas: "0.00", datos: { servidoresEncontrados: 0, lista: [] } } }
        };
    }
}

module.exports = { getBattleMetricsHours };