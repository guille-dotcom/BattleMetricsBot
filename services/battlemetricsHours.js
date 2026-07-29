require("dotenv").config();
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const configPath = path.join(__dirname, "..", "..", "data", "config.json");

async function getBattleMetricsHours(playerId, targetServerId = null) {
    try {
        const token = process.env.BATTLEMETRICS_TOKEN;
        const headers = {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        };

        // Si no se pasa el servidor por parámetro, leerlo del config.json
        if (!targetServerId) {
            try {
                let resolvedConfigPath = configPath;
                if (!fs.existsSync(resolvedConfigPath)) {
                    resolvedConfigPath = path.join(__dirname, "..", "data", "config.json");
                }
                if (fs.existsSync(resolvedConfigPath)) {
                    const config = JSON.parse(fs.readFileSync(resolvedConfigPath, "utf-8"));
                    if (config.battlemetricsServer) {
                        targetServerId = config.battlemetricsServer;
                    }
                }
            } catch (e) {
                console.log("Error leyendo config en el servicio:", e.message);
            }
        }

        // 1. Obtener datos básicos del jugador
        const playerRes = await axios.get(
            `https://api.battlemetrics.com/players/${playerId}`,
            { headers }
        );

        const player = playerRes.data.data;
        const nombreJugador = player.attributes.name || "Desconocido";

        let totalHoras = 0;
        let primerServidor = "Ninguno / Desconocido";
        let servidoresEncontrados = 0;
        let horasDesdeWipe = "0.00";
        let fechaWipeFormateada = "Desconocido";

        if (targetServerId) {
            try {
                // 2. Obtener datos del servidor y su fecha de wipe
                const serverResponse = await axios.get(
                    `https://api.battlemetrics.com/servers/${targetServerId}`,
                    { headers }
                );
                const serverData = serverResponse.data.data;
                const details = serverData.attributes?.details || {};
                
                primerServidor = serverData.attributes?.name || "Desconocido";

                const lastWipeStr = details.rustLastWipe || details.wipeTime || details.rust_last_wipe || serverData.attributes?.metadata?.rustLastWipe;
                let fechaWipe = lastWipeStr ? new Date(lastWipeStr) : null;

                if (!fechaWipe || isNaN(fechaWipe.getTime()) || fechaWipe > new Date()) {
                    fechaWipe = new Date(Date.now() - (4 * 24 * 60 * 60 * 1000));
                    fechaWipeFormateada = "No disponible (últimos 4 días)";
                } else {
                    fechaWipeFormateada = fechaWipe.toLocaleString();
                }

                // 3. Obtener el listado de servidores y tiempo de juego del jugador desde sus relaciones
                const relRes = await axios.get(
                    `https://api.battlemetrics.com/players/${playerId}/relationships/servers`,
                    { 
                        headers,
                        params: { "page[size]": 100 }
                    }
                );

                const serverRelationships = relRes.data.data || [];
                servidoresEncontrados = serverRelationships.length;

                // Buscar el servidor específico dentro de las relaciones
                const serverEntry = serverRelationships.find(s => s.id === targetServerId);
                if (serverEntry && serverEntry.attributes && serverEntry.attributes.timePlayed) {
                    totalHoras = serverEntry.attributes.timePlayed / 3600;
                }

            } catch (err) {
                console.log(`Error obteniendo datos del servidor objetivo:`, err.message);
            }
        } else {
            // Si no hay servidor objetivo, al menos obtenemos la cantidad de servidores jugados
            try {
                const relRes = await axios.get(
                    `https://api.battlemetrics.com/players/${playerId}/relationships/servers`,
                    { headers }
                );
                servidoresEncontrados = relRes.data.data?.length || 0;
            } catch (e) {
                servidoresEncontrados = 0;
            }
        }

        return {
            nombre: nombreJugador,
            totalHoras: totalHoras,
            primerServidor: primerServidor,
            ultimoWipe: fechaWipeFormateada,
            horasDesdeWipe: horasDesdeWipe,
            servidores: {
                rust: {
                    datos: {
                        servidoresEncontrados: servidoresEncontrados
                    }
                }
            }
        };

    } catch (error) {
        console.log("ERROR API battlemetricsHours:", error.response?.data || error.message);
        return {
            nombre: "Desconocido",
            totalHoras: 0,
            primerServidor: "Desconocido",
            ultimoWipe: "Desconocido",
            horasDesdeWipe: "0.00",
            servidores: { rust: { datos: { servidoresEncontrados: 0 } } }
        };
    }
}

module.exports = { getBattleMetricsHours };