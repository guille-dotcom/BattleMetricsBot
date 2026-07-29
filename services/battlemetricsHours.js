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

        for (const item of incluidos) {
            if (item.type === "server") {
                const servidorId = item.id;
                const tiempoServidor = item.meta?.timePlayed || 0;

                if (servidoresContados.has(servidorId)) continue;
                servidoresContados.add(servidorId);
                
                segundosTotalesGlobales += tiempoServidor;
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
            activeServerId = sesiones[0].relationships?.server?.data?.id;
        }

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

        return {
            id: player.id,
            nombre: player.attributes?.name || "Desconocido",
            online: online,
            jugando: tiempoJugando,
            totalHoras: horasTotalesCalculadas,
            servidor: nombreServidor,
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