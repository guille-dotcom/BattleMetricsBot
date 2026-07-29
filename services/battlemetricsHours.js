require("dotenv").config();
const axios = require("axios");

async function getBattleMetricsHours(playerId) {
    try {
        const token = process.env.BATTLEMETRICS_TOKEN;
        const headers = {
            "Content-Type": "application/json"
        };
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        // Consultamos en paralelo el perfil y las sesiones recientes
        const [playerRes, sessionRes] = await Promise.all([
            axios.get(`https://api.battlemetrics.com/players/${playerId}?include=server,identifier`, { headers }),
            axios.get(`https://api.battlemetrics.com/players/${playerId}/relationships/sessions`, { 
                headers, 
                params: { "page[size]": 20 } 
            }).catch(() => null)
        ]);

        const player = playerRes.data.data;
        if (!player) return null;

        const incluidos = playerRes.data.included || [];
        let segundosTotalesGlobales = 0;
        const servidoresContados = new Set();
        let nombreServidor = "No disponible";
        let activeServerId = null;
        const historialNombresSet = new Set();

        for (const item of incluidos) {
            if (item.type === "server") {
                const servidorId = item.id;
                const tiempoServidor = item.meta?.timePlayed || 0;

                if (servidoresContados.has(servidorId)) continue;
                servidoresContados.add(servidorId);
                
                segundosTotalesGlobales += tiempoServidor;
            }

            if (item.type === "identifier" && item.attributes?.type === "steamID") {
                const nombreSteam = item.attributes?.metadata?.name;
                if (nombreSteam) {
                    historialNombresSet.add(nombreSteam);
                }
            }
        }

        const horasTotalesCalculadas = Math.floor(segundosTotalesGlobales / 3600);

        let online = false;
        let tiempoJugando = "0m";
        const sesiones = sessionRes?.data?.data || [];
        const sesionActiva = sesiones.find(s => s.attributes.stop === null);

        if (sesionActiva) {
            online = true;
            const inicio = new Date(sesionActiva.attributes.start);
            const ahora = new Date();
            const segundos = Math.floor((ahora - inicio) / 1000);
            const h = Math.floor(segundos / 3600);
            const m = Math.floor((segundos % 3600) / 60);
            tiempoJugando = h > 0 ? `${h}h ${m}m` : `${m}m`;

            activeServerId = sesionActiva.relationships?.server?.data?.id;
        } else if (sesiones.length > 0) {
            // Si está offline, tomamos el servidor de su sesión más reciente
            activeServerId = sesiones[0].relationships?.server?.data?.id;
        }

        // Obtener el nombre del servidor activo o último servidor jugado
        if (activeServerId) {
            const servidorIncluido = incluidos.find(s => s.type === "server" && s.id === activeServerId);
            if (servidorIncluido) {
                nombreServidor = servidorIncluido.attributes?.name || "Desconocido";
            } else {
                try {
                    const serverRes = await axios.get(`https://api.battlemetrics.com/servers/${activeServerId}`, { headers });
                    nombreServidor = serverRes.data.data.attributes?.name || "Desconocido";
                } catch (e) {
                    console.log("No se pudo obtener el nombre del servidor");
                }
            }
        }

        // --- CÁLCULO DE ÚLTIMO WIPE Y HORAS DESDE EL WIPE ---
        let ultimoWipeServidor = "Desconocido";
        let segundosDesdeWipe = 0;
        let rawWipeDate = null;

        if (activeServerId) {
            try {
                const serverResponse = await axios.get(
                    `https://api.battlemetrics.com/servers/${activeServerId}`,
                    { headers }
                );

                const serverAttributes = serverResponse.data.data.attributes;
                const details = serverAttributes.details || {};
                
                rawWipeDate = details.rust_lastWipe || details.rust_last_wipe || details.lastWipe || null;

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
                console.log("No se pudieron obtener los detalles del servidor:", err.message);
            }

            if (rawWipeDate) {
                try {
                    const wipeTimeObj = new Date(rawWipeDate);

                    for (const session of sesiones) {
                        const relServer = session.relationships?.server?.data;
                        if (!relServer || relServer.id !== activeServerId) continue;

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
                } catch (sessionErr) {
                    console.log("Error calculando horas desde el wipe:", sessionErr.message);
                }
            }
        }

        const horasDesdeWipeDecimal = (segundosDesdeWipe / 3600).toFixed(2);

        return {
            id: player.id,
            nombre: player.attributes?.name || "Desconocido",
            online: online,
            jugando: tiempoJugando,
            totalHoras: horasTotalesCalculadas,
            servidor: nombreServidor,
            ultimoWipe: ultimoWipeServidor,
            horasDesdeWipe: horasDesdeWipeDecimal,
            servidores: {
                rust: {
                    datos: {
                        servidoresEncontrados: servidoresContados.size
                    }
                }
            }
        };

    } catch (error) {
        console.log("ERROR API battlemetricsHours:", error.response?.data || error.message);
        return null;
    }
}

module.exports = { getBattleMetricsHours };