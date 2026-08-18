require("dotenv").config();
const axios = require("axios");

// 1. Buscar jugador online/registrado en el servidor por su nombre de Steam
async function searchBattleMetricsPlayer(playerName, serverId) {
    try {
        const token = process.env.BATTLEMETRICS_TOKEN;
        const response = await axios.get(
            `https://api.battlemetrics.com/servers/${serverId}`,
            {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                params: { include: "player" },
                timeout: 4000
            }
        );

        const players = response.data.included?.filter(item => item.type === "player") || [];
        const nombreBuscado = playerName.toLowerCase().trim();

        const encontrado = players.find(player => {
            const nombreBM = player.attributes?.name?.toLowerCase().trim();
            return nombreBM === nombreBuscado;
        });

        return encontrado || null;
    } catch (error) {
        console.error("Error buscando en BM:", error.message);
        return null;
    }
}

// 2. Obtener estado y horas usando el ID interno de BattleMetrics del jugador encontrado
async function getBattleMetricsPlayerStatus(playerId) {
    try {
        const token = process.env.BATTLEMETRICS_TOKEN;
        const headers = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const [playerRes, sessionRes] = await Promise.all([
            axios.get(`https://api.battlemetrics.com/players/${playerId}?include=server`, { headers, timeout: 4000 }),
            axios.get(`https://api.battlemetrics.com/players/${playerId}/relationships/sessions`, { 
                headers, 
                params: { "page[size]": 10 },
                timeout: 4000
            }).catch(() => null)
        ]);

        const player = playerRes.data.data;
        if (!player) return null;

        const incluidos = playerRes.data.included || [];
        let segundosTotales = 0;
        const servidoresContados = new Set();
        let nombreServidorActual = "Desconocido";
        let activeServerId = player.relationships?.server?.data?.id;

        for (const item of incluidos) {
            if (item.type === "server") {
                const servidorId = item.id;
                
                if (activeServerId && servidorId === activeServerId) {
                    nombreServidorActual = item.attributes?.name || "Desconocido";
                }

                if (servidoresContados.has(servidorId)) continue;
                servidoresContados.add(servidorId);
                
                segundosTotales += item.meta?.timePlayed || 0;
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
            const segundos = Math.floor((new Date() - inicio) / 1000);
            const h = Math.floor(segundos / 3600);
            const m = Math.floor((segundos % 3600) / 60);
            tiempoJugando = h > 0 ? `${h}h ${m}m` : `${m}m`;
        }

        return {
            id: player.id,
            name: player.attributes.name || "Desconocido",
            online: online || player.attributes?.online === true,
            jugando: tiempoJugando,
            horasTotalesBM: horasTotalesCalculadas,
            server: nombreServidorActual,
            historialNombres: []
        };

    } catch (error) {
        console.error("Error obteniendo status BM:", error.message);
        return null;
    }
}

async function getServerLeaderboard(serverId) {
    try {
        const token = process.env.BATTLEMETRICS_TOKEN;
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        const response = await axios.get(
            `https://api.battlemetrics.com/servers/${serverId}`,
            { headers, params: { include: "player" }, timeout: 4000 }
        );

        const included = response.data.included || [];
        const players = included.filter(item => item.type === "player");

        if (players.length === 0) return [];

        const validResults = players.map(player => ({
            id: player.id,
            name: player.attributes?.name || "Desconocido",
            timePlayedSeconds: player.meta?.timePlayed || 0
        }));

        validResults.sort((a, b) => b.timePlayedSeconds - a.timePlayedSeconds);
        return validResults;

    } catch (error) {
        console.error("Error obteniendo ranking del servidor:", error.message);
        return [];
    }
}

module.exports = { 
    searchBattleMetricsPlayer, 
    getBattleMetricsPlayerStatus,
    getServerLeaderboard 
};