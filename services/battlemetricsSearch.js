require("dotenv").config();
const axios = require("axios");

// ---------------------------------------------------- //
// Buscar jugador online en el servidor configurado     //
// por el nombre de Steam (ej. GONE)                     //
// ---------------------------------------------------- //
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
        console.log("BUSCANDO EN BM:", playerName);
        console.log("TOTAL JUGADORES EN SERVIDOR:", players.length);

        const nombreBuscado = playerName.toLowerCase().trim();
        const encontrado = players.find(player => {
            const nombreBM = player.attributes?.name?.toLowerCase().trim();
            return nombreBM === nombreBuscado;
        });

        if (!encontrado) {
            console.log("NO ESTÁ ONLINE EN EL SERVIDOR:", playerName);
            return null;
        }

        console.log("JUGADOR ENCONTRADO EN BM. ID:", encontrado.id);
        return encontrado;
    } catch (error) {
        console.log("ERROR BUSCANDO EN BM:", error.response?.data || error.message);
        return null;
    }
}

// ---------------------------------------------------- //
// Obtener las horas y estado del jugador encontrado    //
// ---------------------------------------------------- //
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
            console.log("ERROR SESIONES BM:", error.response?.data || error.message);
        }

        let online = false;
        let tiempoJugando = "0m";

        // Detectar sesión activa y calcular tiempo de esta sesión
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
        console.log("ERROR STATUS BM:", error.response?.data || error.message);
        return null;
    }
}

module.exports = { 
    searchBattleMetricsPlayer, 
    getBattleMetricsPlayerStatus 
};