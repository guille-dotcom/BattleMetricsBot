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
        let onlineServerId = targetServerId;

        // 2. Obtener la lista de servidores del jugador para sumar horas totales y contar servidores jugados
        try {
            const serversRes = await axios.get(
                `https://api.battlemetrics.com/players/${playerId}/servers`,
                { 
                    headers,
                    params: { "page[size]": 100 }
                }
            );

            const serverList = serversRes.data.data || [];
            servidoresEncontrados = serverList.length;

            for (const s of serverList) {
                const timePlayed = s.attributes?.timePlayed || 0;
                totalHoras += timePlayed / 3600;

                // Detectar si está online actualmente en algún servidor
                if (s.attributes?.status === "online" && !onlineServerId) {
                    onlineServerId = s.id;
                }
            }
        } catch (e) {
            console.log("Error obteniendo servidores del jugador:", e.message);
        }

        // Si no hay servidor online detectado, leer del config.json como respaldo
        if (!onlineServerId) {
            try {
                let resolvedConfigPath = configPath;
                if (!fs.existsSync(resolvedConfigPath)) {
                    resolvedConfigPath = path.join(__dirname, "..", "data", "config.json");
                }
                if (fs.existsSync(resolvedConfigPath)) {
                    const config = JSON.parse(fs.readFileSync(resolvedConfigPath, "utf-8"));
                    if (config.battlemetricsServer) {
                        onlineServerId = config.battlemetricsServer;
                    }
                }
            } catch (err) {
                console.log("Error leyendo config:", err.message);
            }
        }

        // 3. Obtener detalles del servidor actual/online, su último wipe y calcular horas desde el wipe
        if (onlineServerId) {
            try {
                const serverResponse = await axios.get(
                    `https://api.battlemetrics.com/servers/${onlineServerId}`,
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

                // Obtener sesiones para este jugador en este servidor específico
                const sessionsResponse = await axios.get(
                    `https://api.battlemetrics.com/sessions`,
                    {
                        headers,
                        params: {
                            "filter[player]": playerId,
                            "filter[server]": onlineServerId,
                            "page[size]": 100
                        }
                    }
                );

                const sessions = sessionsResponse.data.data || [];
                let segundosDesdeWipe = 0;
                const ahora = new Date();

                for (const session of sessions) {
                    const attributes = session.attributes || {};
                    const start = new Date(attributes.start);
                    const stop = attributes.stop ? new Date(attributes.stop) : ahora;

                    if (stop >= fechaWipe) {
                        const effectiveStart = start < fechaWipe ? fechaWipe : start;
                        const diffWipe = (stop - effectiveStart) / 1000;
                        if (diffWipe > 0) {
                            segundosDesdeWipe += diffWipe;
                        }
                    }
                }

                horasDesdeWipe = (segundosDesdeWipe / 3600).toFixed(2);

            } catch (err) {
                console.log(`Error obteniendo datos del servidor o sesiones:`, err.message);
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