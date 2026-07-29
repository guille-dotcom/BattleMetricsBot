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

        // Consultamos en paralelo el perfil y las sesiones recientes
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
        const historialNombresSet = new Set();

        for (const item of incluidos) {
            if (item.type === "server") {
                const servidorId = item.id;
                const tiempoServidor = item.meta?.timePlayed || 0;

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
            // Si está offline, tomamos el servidor de su sesión más reciente
            activeServerId = sesiones[0].relationships?.server?.data?.id;
        }

        // Obtener el nombre del servidor activo o último servidor jugado
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

        // --- CÁLCULO ROBUSTO DE ÚLTIMO WIPE Y HORAS DESDE EL WIPE ---
        let ultimoWipeServidor = "Consultar en Web";
        let horasDesdeWipeDecimal = "0.00";

        if (activeServerId) {
            try {
                const serverResponse = await axios.get(
                    `https://api.battlemetrics.com/servers/${activeServerId}`,
                    { headers }
                );

                const serverAttributes = serverResponse.data.data.attributes;
                const details = serverAttributes.details || {};
                
                let fechaWipeFinal = null;

                // 1. Buscar en el array de wipes de la API
                if (Array.isArray(details.rust_wipes) && details.rust_wipes.length > 0) {
                    fechaWipeFinal = new Date(details.rust_wipes[details.rust_wipes.length - 1]);
                }

                // 2. Buscar en propiedades alternativas si el array no existe o está vacío
                if (!fechaWipeFinal || isNaN(fechaWipeFinal.getTime()) || fechaWipeFinal.getFullYear() < 2024) {
                    const rawWipe = details.rust_last_wipe_ent || details.rust_last_wipe;
                    if (rawWipe) {
                        if (typeof rawWipe === "string") {
                            fechaWipeFinal = new Date(rawWipe);
                        } else if (typeof rawWipe === "number") {
                            fechaWipeFinal = new Date(rawWipe < 10000000000 ? rawWipe * 1000 : rawWipe);
                        }
                    }
                }

                // 3. Validar y formatear la fecha final del wipe
                if (fechaWipeFinal && !isNaN(fechaWipeFinal.getTime()) && fechaWipeFinal.getFullYear() >= 2024) {
                    ultimoWipeServidor = fechaWipeFinal.toLocaleDateString("es-ES", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                    });

                    // Calcular la diferencia exacta en horas desde el wipe hasta ahora
                    const diffMs = new Date() - fechaWipeFinal;
                    horasDesdeWipeDecimal = (diffMs / (1000 * 60 * 60)).toFixed(2);
                    if (parseFloat(horasDesdeWipeDecimal) < 0) horasDesdeWipeDecimal = "0.00";
                }
            } catch (err) {
                console.log("No se pudieron obtener los detalles del servidor para el wipe:", err.message);
            }
        }

        return {
            id: player.id,
            nombre: player.attributes?.name || "Desconocido",
            online: online,
            jugando: tiempoJugando,
            totalHoras: horasTotalesCalculadas,
            servidor: nombreServidor,
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