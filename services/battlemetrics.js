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

// 2. Obtener estado, sesión actual, servidor, horas totales e historial de nombres
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

        const historialNombres = Array.from(historialNombresSet);

        return {
            id: player.id,
            name: player.attributes.name || "Desconocido",
            online: online || player.attributes?.online === true,
            jugando: tiempoJugando,
            horasTotalesBM: horasTotalesCalculadas,
            server: nombreServidorActual,
            historialNombres: historialNombres
        };

    } catch (error) {
        console.error("Error obteniendo status BM:", error.response?.data || error.message);
        return null;
    }
}

// 3. Obtener el ranking de forma instantánea usando relaciones directas del servidor
async function getServerLeaderboard(serverId) {
    try {
        const token = process.env.BATTLEMETRICS_TOKEN;
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        // Consultamos el servidor incluyendo los "server-players" directamente en una sola petición
        const response = await axios.get(
            `https://api.battlemetrics.com/servers/${serverId}`,
            {
                headers,
                params: { 
                    include: "player,serverPlayer",
                    "page[size]": 100 
                }
            }
        );

        const included = response.data.included || [];
        const playersMap = new Map();
        const timeMap = new Map();

        // Extraemos los datos de tiempo de los registros de serverPlayer
        for (const item of included) {
            if (item.type === "serverPlayer") {
                const playerId = item.relationships?.player?.data?.id;
                const timePlayed = item.attributes?.timePlayed || 0;
                if (playerId) {
                    timeMap.set(playerId, timePlayed);
                }
            }
        }

        // Mapeamos los nombres de los jugadores
        for (const item of included) {
            if (item.type === "player") {
                const playerId = item.id;
                const playerName = item.attributes?.name || "Desconocido";
                const timePlayedSeconds = timeMap.get(playerId) || 0;

                playersMap.set(playerId, {
                    id: playerId,
                    name: playerName,
                    timePlayedSeconds: timePlayedSeconds
                });
            }
        }

        const ranking = Array.from(playersMap.values())
            .sort((a, b) => b.timePlayedSeconds - a.timePlayedSeconds);

        return ranking;

    } catch (error) {
        console.error("Error obteniendo ranking del servidor:", error.response?.data || error.message);
        return [];
    }
}

module.exports = { 
    searchBattleMetricsPlayer, 
    getBattleMetricsPlayerStatus,
    getServerLeaderboard 
};