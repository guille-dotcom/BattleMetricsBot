require("dotenv").config();
const axios = require("axios");

// 1. Buscar jugador online por su nombre de Steam en el servidor configurado
async function searchBattleMetricsPlayer(playerName, serverId) {
    try {
        const token = process.env.BATTLEMETRICS_TOKEN;
        const response = await axios.get(
            `https://api.battlemetrics.com/servers/${serverId}`,
            {
                headers: { Authorization: `Bearer ${token}` },
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

// 2. Obtener estado y sesiones del jugador por su ID de BM
async function getBattleMetricsPlayerStatus(playerId) {
    try {
        const token = process.env.BATTLEMETRICS_TOKEN;
        const response = await axios.get(
            `https://api.battlemetrics.com/players/${playerId}`,
            {
                headers: { Authorization: `Bearer ${token}` },
                params: { include: "server" }
            }
        );

        const player = response.data.data;
        if (!player) return null;

        let sessionResponse = null;
        try {
            sessionResponse = await axios.get(
                `https://api.battlemetrics.com/players/${playerId}/relationships/sessions`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
        } catch (error) {
            console.error("Error al obtener sesiones BM:", error.response?.data || error.message);
        }

        let online = false;
        let tiempoJugando = "0m";

        const sesiones = sessionResponse?.data?.data || [];
        const sesionActiva = sesiones.find(s => s.attributes.stop === null);

        if (sesionActiva) {
            online = true;
            const inicio = new Date(sesionActiva.attributes.start);
            const ahora = new Date();
            const segundos = Math.floor((ahora - inicio) / 1000);
            const horas = Math.floor(segundos / 3600);
            const minutos = Math.floor((segundos % 3600) / 60);
            tiempoJugando = horas > 0 ? `${horas}h ${minutos}m` : `${minutos}m`;
        }

        return {
            id: player.id,
            name: player.attributes.name,
            online: online || player.attributes?.online === true,
            jugando: tiempoJugando
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