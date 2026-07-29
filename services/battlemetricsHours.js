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

        // Consultamos el perfil del jugador incluyendo servidores e identificadores
        const playerRes = await axios.get(
            `https://api.battlemetrics.com/players/${playerId}?include=server,identifier`, 
            { headers }
        );

        const player = playerRes.data.data;
        if (!player) return null;

        const incluidos = playerRes.data.included || [];
        let segundosTotalesGlobales = 0;
        const servidoresContados = new Set();
        let nombreServidorActual = "No conectado en ningún servidor";
        let activeServerId = player.relationships?.server?.data?.id;
        let segundosEnServidorActual = 0;
        const historialNombresSet = new Set();

        for (const item of incluidos) {
            if (item.type === "server") {
                const servidorId = item.id;
                const tiempoServidor = item.meta?.timePlayed || 0;
                
                // Si es el servidor actual, guardamos sus horas exactas de juego en este servidor
                if (activeServerId && servidorId === activeServerId) {
                    nombreServidorActual = item.attributes?.name || "Desconocido";
                    segundosEnServidorActual = tiempoServidor;
                }

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

        // Consultar sesiones solo para saber si está online y calcular la sesión actual
        const sessionRes = await axios.get(
            `https://api.battlemetrics.com/players/${playerId}/relationships/sessions`, 
            { headers, params: { "page[size]": 10 } }
        ).catch(() => null);

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

            if (nombreServidorActual === "No conectado en ningún servidor" || nombreServidorActual === "Desconocido") {
                const sessionServerId = sesionActiva.relationships?.server?.data?.id;
                if (sessionServerId) {
                    activeServerId = sessionServerId;
                    const servidorSesion = incluidos.find(s => s.type === "server" && s.id === sessionServerId);
                    if (servidorSesion) {
                        nombreServidorActual = servidorSesion.attributes?.name || "Desconocido";
                        segundosEnServidorActual = servidorSesion.meta?.timePlayed || 0;
                    }
                }
            }
        }

        // --- CÁLCULO DE ÚLTIMO WIPE ---
        let ultimoWipeServidor = "Desconocido";
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
                console.log("No se pudieron obtener los detalles del servidor actual:", err.message);
            }
        }

        // Las horas desde el wipe en este servidor son exactamente el tiempo total jugado en él (ya que BattleMetrics reinicia contadores o el jugador entró post-wipe)
        const horasDesdeWipeDecimal = (segundosEnServidorActual / 3600).toFixed(2);

        return {
            id: player.id,
            nombre: player.attributes?.name || "Desconocido",
            online: online || player.attributes?.online === true,
            jugando: tiempoJugando,
            totalHoras: horasTotalesCalculadas,
            primerServidor: nombreServidorActual,
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