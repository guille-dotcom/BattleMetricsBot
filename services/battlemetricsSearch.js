require("dotenv").config();
const axios = require("axios");

// ---------------------------------------------------- //
// Buscar jugador online en el servidor configurado     //
// ---------------------------------------------------- //
async function searchBattleMetricsPlayer(playerName, serverId) {
    try {
        const token = process.env.BATTLEMETRICS_TOKEN;
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        
        const response = await axios.get(
            `https://api.battlemetrics.com/servers/${serverId}`,
            {
                headers,
                params: { include: "player" }
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
        console.log("ERROR BUSCANDO EN BM:", error.response?.data || error.message);
        return null;
    }
}

// ---------------------------------------------------- //
// Obtener estado, servidor y tiempo del jugador        //
// ---------------------------------------------------- //
async function getBattleMetricsPlayerStatus(playerId) {
    try {
        const token = process.env.BATTLEMETRICS_TOKEN;
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        // 1. Obtener datos básicos del jugador
        const playerResponse = await axios.get(
            `https://api.battlemetrics.com/players/${playerId}`,
            { headers }
        );

        const player = playerResponse.data.data;
        if (!player) return null;

        // 2. Obtener sesiones con el servidor INCLUIDO
        let sessionResponse = null;
        try {
            sessionResponse = await axios.get(
                `https://api.battlemetrics.com/players/${playerId}/relationships/sessions`,
                { 
                    headers,
                    params: { 
                        include: "server",
                        "page[size]": 5 
                    }
                }
            );
        } catch (error) {
            console.log("ERROR SESIONES BM:", error.response?.data || error.message);
        }

        let online = false;
        let tiempoJugando = "0m";
        let nombreServidor = "Desconocido";
        let serverIdReal = null; // ID único del servidor para evitar falsos positivos por nombres

        const sesiones = sessionResponse?.data?.data || [];
        const includedList = sessionResponse?.data?.included || [];

        // Buscar sesión activa (stop es null)
        const sesionActiva = sesiones.find(s => s.attributes && s.attributes.stop === null);

        if (sesionActiva) {
            online = true;

            // Calcular tiempo
            const inicio = new Date(sesionActiva.attributes.start);
            const ahora = new Date();
            const segundos = Math.floor((ahora - inicio) / 1000);
            const horas = Math.floor(segundos / 3600);
            const minutos = Math.floor((segundos % 3600) / 60);
            tiempoJugando = horas > 0 ? `${horas}h ${minutos}m` : `${minutos}m`;

            // Obtener el ID del servidor desde la relación
            serverIdReal = sesionActiva.relationships?.server?.data?.id || null;
            if (serverIdReal) {
                const serverMatch = includedList.find(item => item.type === "server" && item.id === serverIdReal);
                if (serverMatch && serverMatch.attributes?.name) {
                    nombreServidor = serverMatch.attributes.name;
                }
            }
        } else if (sesiones.length > 0) {
            // Si está offline, intentar obtener el último servidor conocido
            const ultimaSesion = sesiones[0];
            serverIdReal = ultimaSesion.relationships?.server?.data?.id || null;
            if (serverIdReal) {
                const serverMatch = includedList.find(item => item.type === "server" && item.id === serverIdReal);
                if (serverMatch && serverMatch.attributes?.name) {
                    nombreServidor = serverMatch.attributes.name;
                }
            }
        }

        return {
            id: player.id,
            name: player.attributes.name,
            online: online || player.attributes?.online === true,
            jugando: tiempoJugando,
            server: nombreServidor,
            serverId: serverIdReal, // 👈 ID numérico único del servidor añadido aquí
            horasTotalesBM: Math.round((player.attributes?.playtime || 0) / 3600)
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