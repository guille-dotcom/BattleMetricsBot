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

// 2. Obtener perfil completo, tiempo de sesión actual Y HORAS TOTALES de todos los servidores
async function getBattleMetricsPlayerStatus(playerId) {
    try {
        const token = process.env.BATTLEMETRICS_TOKEN;

        // Pedimos la información del jugador incluyendo su relación con los servidores
        const response = await axios.get(
            `https://api.battlemetrics.com/players/${playerId}`,
            {
                headers: { Authorization: `Bearer ${token}` },
                params: { include: "server" }
            }
        );

        const player = response.data.data;
        if (!player) return null;

        // 1. Sumar el tiempo jugado (timePlayed en segundos) en TODOS los servidores registrados en BM
        let segundosTotalesBM = 0;
        const relacionesServidores = response.data.included?.filter(item => item.type === "server") || [];

        // Si la relación "server" viene dentro del payload del objeto player
        if (player.relationships?.servers?.data) {
            player.relationships.servers.data.forEach(srv => {
                if (srv.meta && srv.meta.timePlayed) {
                    segundosTotalesBM += srv.meta.timePlayed;
                }
            });
        }

        const horasTotalesBM = Math.floor(segundosTotalesBM / 3600);

        // 2. Obtener el tiempo de la SESIÓN ACTIVA actual
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
            jugando: tiempoJugando,
            horasTotalesBM: horasTotalesBM
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