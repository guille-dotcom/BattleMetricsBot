require("dotenv").config();
const axios = require("axios");

// 1. Buscar jugador online por su nombre de Steam en el servidor configurado
async function searchBattleMetricsPlayer(playerName, serverId) {
    try {
        const token = process.env.BATTLEMETRICS_TOKEN;
        const response = await axios.get(
            `https://api.battlemetrics.com/servers/${serverId}`,
            {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                params: { include: "player" }
            }
        );

        const players = response.data.included?.filter(item => item.type === "player") || [];
        const nombreBuscado = playerName.toLowerCase().trim();

        const encontrado = players.find(player => {
            const nombreBM = player.attributes?.name?.toLowerCase().trim();
            return nombreBM === nombreBuscado;
        });

        if (!encontrado) {
            console.log("No está online en el servidor BM:", playerName);
            return null;
        }

        return encontrado;
    } catch (error) {
        console.error("Error buscando en BM:", error.response?.data || error.message);
        return null;
    }
}

// 2. Obtener estado, sesión actual, servidor, horas totales, historial de nombres, último wipe y horas desde el wipe
async function getBattleMetricsPlayerStatus(playerId) {
    try {
        const token = process.env.BATTLEMETRICS_TOKEN;
        const headers = {
            "Content-Type": "application/json"
        };
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        const [playerRes, sessionRes] = await Promise.all([
            axios.get(`https://api.battlemetrics.com/players/${playerId}?include=server,identifier`, { headers }),
            axios.get(`https://api.battlemetrics.com/players/${playerId}/relationships/sessions`, { 
                headers, 
                params: { "page[size]": 50 } 
            }).catch(() => null)
        ]);

        const player = playerRes.data.data;
        if (!player) return null;

        const incluidos = playerRes.data.included || [];
        let segundosTotales = 0;
        const servidoresContados = new Set();
        let nombreServidorActual = "Desconocido";
        let activeServerId = player.relationships?.server?.data?.id;
        const historialNombresSet = new Set();

        for (const item of incluidos) {
            if (item.type === "server") {
                const servidorId = item.id;
                
                if (activeServerId && servidorId === activeServerId) {
                    nombreServidorActual = item.attributes?.name || "Desconocido";
                }

                if (servidoresContados.has(servidorId)) continue;
                servidoresContados.add(servidorId);
                
                const tiempo = item.meta?.timePlayed || 0;
                segundosTotales += tiempo;
            }

            if (item.type === "identifier" && item.attributes?.type === "steamID") {
                const nombreSteam = item.attributes?.metadata?.name;
                if (nombreSteam) {
                    historialNombresSet.add(nombreSteam);
                }
            }
        }

        const horasTotalesCalculadas = Math.floor(segundosTotales / 3600);

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

            if (nombreServidorActual === "Desconocido") {
                const sessionServerId = sesionActiva.relationships?.server?.data?.id;
                if (sessionServerId) {
                    activeServerId = sessionServerId;
                    const servidorSesion = incluidos.find(s => s.type === "server" && s.id === sessionServerId);
                    if (servidorSesion) {
                        nombreServidorActual = servidorSesion.attributes?.name || "Desconocido";
                    }
                }
            }
        }

        // --- CÁLCULO INTELIGENTE DE ÚLTIMO WIPE ---
        let ultimoWipeServidor = "Desconocido";
        let horasDesdeWipe = "0.00";
        let rawWipeDate = null;

        if (activeServerId) {
            try {
                const serverResponse = await axios.get(
                    `https://api.battlemetrics.com/servers/${activeServerId}`,
                    { headers }
                );

                const serverAttributes = serverResponse.data.data.attributes;
                const details = serverAttributes.details || {};
                
                // 1. Intentar obtener la fecha de wipe estándar de Rust
                rawWipeDate = details.rust_last_wipe || details.rust_lastWipe || details.lastWipe || null;

                // 2. Si no existe o es muy antigua (ej. más de 30 días en servidores que wipend diario/semanal), usamos la fecha de actualización/reinicio del servidor en BM como respaldo exacto
                if (rawWipeDate) {
                    const parsedWipe = new Date(rawWipeDate);
                    const now = new Date();
                    const diffDays = (now - parsedWipe) / (1000 * 60 * 60 * 24);
                    
                    if (isNaN(parsedWipe.getTime()) || diffDays > 31) {
                        rawWipeDate = null; // Descartar fecha errónea o colgada
                    }
                }

                if (!rawWipeDate) {
                    // Usamos el campo de estado/reinicio del servidor que BM actualiza al hacer wipe
                    rawWipeDate = serverAttributes.details?.rust_last_wipe || serverAttributes.updatedAt;
                }

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

            if (rawWipeDate) {
                try {
                    const wipeTimeObj = new Date(rawWipeDate);
                    let segundosDesdeWipe = 0;

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

                    horasDesdeWipe = (segundosDesdeWipe / 3600).toFixed(2);
                } catch (sessionErr) {
                    console.log("No se pudieron calcular las horas desde el wipe:", sessionErr.message);
                }
            }
        }

        const historialNombres = Array.from(historialNombresSet);

        return {
            id: player.id,
            name: player.attributes.name || "Desconocido",
            online: online || player.attributes?.online === true,
            jugando: tiempoJugando,
            horasTotalesBM: horasTotalesCalculadas,
            server: nombreServidorActual,
            ultimoWipe: ultimoWipeServidor,
            horasDesdeWipe: horasDesdeWipe,
            historialNombres: historialNombres
        };

    } catch (error) {
        console.error("Error obteniendo status BM:", error.response?.data || error.message);
        return null;
    }
}

module.exports = { 
    searchBattleMetricsPlayer, 
    getBattleMetricsPlayerStatus 
};