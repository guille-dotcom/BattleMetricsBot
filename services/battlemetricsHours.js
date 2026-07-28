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
                const online = item.meta?.online || false;

                listaServidores.push({
                    id: servidorId,
                    nombre: item.attributes.name,
                    segundos: tiempo,
                    horas: (tiempo / 3600).toFixed(2),
                    lastSeen: lastSeen,
                    online: online
                });
            }
        }

        // Ordenamos los servidores por la fecha más reciente
        listaServidores.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));

        let estadoServidorActual = "🔴 Offline / Desconectado de Rust";
        let ultimoWipeServidor = "Desconocido";
        let rawWipeDate = null;
        let horasDesdeWipe = "0.00";

        // Verificamos si el servidor más reciente tiene al usuario online actualmente (o fue visto hace menos de 10 min)
        if (listaServidores.length > 0 && listaServidores[0].nombre) {
            const servidorPrincipal = listaServidores[0];
            const now = new Date();
            const lastSeenDate = new Date(servidorPrincipal.lastSeen);
            const diffMinutes = (now - lastSeenDate) / (1000 * 60);

            if (servidorPrincipal.online || diffMinutes <= 10) {
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
                    
                    const wipeDetails = details.rust_last_wipe || details.rust_lastWipe || details.lastWipe || null;
                    const serverUpdatedAt = serverAttributes.updatedAt || null;

                    rawWipeDate = wipeDetails || serverUpdatedAt;

                    if (rawWipeDate) {
                        const fechaWipe = new Date(rawWipeDate);
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

                if (rawWipeDate) {
                    try {
                        console.log(`CONSULTANDO SESIONES GENERALES DEL JUGADOR ${playerId}...`);
                        const wipeTimeObj = new Date(rawWipeDate);

                        const sessionsResponse = await axios.get(
                            `https://api.battlemetrics.com/players/${playerId}/relationships/sessions?page[size]=50`,
                            {
                                headers: {
                                    "Authorization": `Bearer ${token}`,
                                    "Content-Type": "application/json"
                                }
                            }
                        );

                        const sessions = sessionsResponse.data.data || [];
                        let segundosDesdeWipe = 0;

                        for (const session of sessions) {
                            const relServer = session.relationships?.server?.data;
                            if (!relServer || relServer.id !== servidorActualId) continue;

                            const attributes = session.attributes || {};
                            const start = new Date(attributes.start);
                            const stop = attributes.stop ? new Date(attributes.stop) : new Date();

                            if (stop >= wipeTimeObj) {
                                const effectiveStart = start < wipeTimeObj ? wipeTimeObj : start;
                                const diffSeconds = (stop - effectiveStart) / 1000;
                                if (diffSeconds > 0) {
                                    segundosDesdeWipe += diffSeconds;
                                }
                            }
                        }

                        horasDesdeWipe = (segundosDesdeWipe / 3600).toFixed(2);
                        console.log(`HORAS DESDE EL WIPE CALCULADAS: ${horasDesdeWipe}h`);

                    } catch (sessionErr) {
                        console.log("No se pudieron obtener las sesiones del jugador:", sessionErr.message);
                    }
                }
            } else {
                console.log("El jugador se encuentra desconectado actualmente.");
            }
        }

        const horasTotales = (segundosTotales / 3600).toFixed(2);

        return {
            nombre: nombreJugador,
            totalHoras: horasTotales,
            primerServidor: estadoServidorActual,
            ultimoWipe: ultimoWipeServidor,
            horasDesdeWipe: horasDesdeWipe,
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
            horasDesdeWipe: "0.00",
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