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

// 2. Obtener estado, sesión actual, servidor y horas totales
async function getBattleMetricsPlayerStatus(playerId) {
    try {
        const token = process.env.BATTLEMETRICS_TOKEN;
        const headers = {
            "Content-Type": "application/json"
        };
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        // Peticiones paralelas: Perfil con servidores e Historial de Sesiones
        const [playerRes, sessionRes] = await Promise.all([
            axios.get(`https://api.battlemetrics.com/players/${playerId}?include=server`, { headers }),
            axios.get(`https://api.battlemetrics.com/players/${playerId}/relationships/sessions`, { 
                headers, 
                params: { "page[size]": 10 } 
            }).catch(() => null)
        ]);

        const player = playerRes.data.data;
        if (!player) return null;

        const servidores = playerRes.data.included || [];
        let segundosTotales = 0;
        const servidoresContados = new Set();
        let nombreServidorActual = "Desconocido";

        for (const servidor of servidores) {
            if (servidor.type !== "server") continue;

            const servidorId = servidor.id;
            
            // Intentar detectar si este servidor es en el que está jugando actualmente (basado en la relación o el estado)
            // BattleMetrics suele poner metadatos o podemos revisar si coincide con la sesión activa
            const relServer = player.relationships?.server?.data;
            if (relServer && relServer.id === servidorId) {
                nombreServidorActual = servidor.attributes?.name || "Desconocido";
            }

            if (servidoresContados.has(servidorId)) continue;
            servidoresContados.add(servidorId);
            
            const tiempo = servidor.meta?.timePlayed || 0;
            segundosTotales += tiempo;
        }

        // Si por alguna razón no se encontró por relación directa, buscar el primer servidor con sesión activa o el último conocido
        if (nombreServidorActual === "Desconocido" && servidores.length > 0) {
            const serverItem = servidores.find(s => s.type === "server");
            if (serverItem) {
                nombreServidorActual = serverItem.attributes?.name || "Desconocido";
            }
        }

        const horasTotalesCalculadas = Math.floor(segundosTotales / 3600);

        // --- CÁLCULO DE TIEMPO DE LA SESIÓN ACTUAL ---
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
        }

        return {
            id: player.id,
            name: player.attributes.name || "Desconocido",
            online: online || player.attributes?.online === true,
            jugando: tiempoJugando,
            horasTotalesBM: horasTotalesCalculadas,
            server: nombreServidorActual // <--- ¡Aquí devolvemos el nombre real del servidor!
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