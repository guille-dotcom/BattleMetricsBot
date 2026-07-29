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

        // Si no se pasa el servidor, leerlo del config.json
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

        // 1. Obtener datos básicos del jugador (Nombre y horas generales si vienen en attributes)
        const playerRes = await axios.get(
            `https://api.battlemetrics.com/players/${playerId}`,
            { 
                headers,
                params: { "include": "identifier" }
            }
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

                // 3. Obtener las sesiones del jugador filtradas por este servidor para calcular horas exactas y horas desde el wipe
                const sessionsResponse = await axios.get(
                    `https://api.battlemetrics.com/sessions`,
                    {
                        headers,
                        params: {
                            "filter[player]": playerId,
                            "filter[servers]": targetServerId,
                            "page[size]": 100
                        }
                    }
                );

                const sessions = sessionsResponse.data.data || [];
                let segundosDesdeWipe = 0;
                let segundosTotalesServidor = 0;
                const ahora = new Date();

                for (const session of sessions) {
                    const attributes = session.attributes || {};
                    const start = new Date(attributes.start);
                    const stop = attributes.stop ? new Date(attributes.stop) : ahora;

                    const diffServer = (stop - start) / 1000;
                    if (diffServer > 0) {
                        segundosTotalesServidor += diffServer;
                    }

                    if (stop >= fechaWipe) {
                        const effectiveStart = start < fechaWipe ? fechaWipe : start;
                        const diffWipe = (stop - effectiveStart) / 1000;
                        if (diffWipe > 0) {
                            segundosDesdeWipe += diffWipe;
                        }
                    }
                }

                totalHoras = segundosTotalesServidor / 3600;
                horasDesdeWipe = (segundosDesdeWipe / 3600).toFixed(2);

            } catch (err) {
                console.log(`Error obteniendo sesiones del servidor objetivo:`, err.message);
            }
        }

        // 4. Obtener cantidad total de servidores jugados usando el endpoint correcto de paginación/meta
        try {
            const relRes = await axios.get(
                `https://api.battlemetrics.com/servers`,
                { 
                    headers,
                    params: {
                        "filter[players]": playerId,
                        "page[size]": 1
                    }
                }
            );
            if (relRes.data.meta && relRes.data.meta.total) {
                servidoresEncontrados = relRes.data.meta.total;
            }
        } catch (e) {
            servidoresEncontrados = 0;
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