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
        let primerServidor = "Ninguno / Desconocido (Offline)";
        let servidoresEncontrados = 0;
        let horasDesdeWipe = "0.00";
        let fechaWipeFormateada = "Desconocido";
        let onlineServerId = targetServerId;

        // 2. Obtener lista de servidores del jugador para sumar horas totales y detectar si está online en alguno
        try {
            const relRes = await axios.get(
                `https://api.battlemetrics.com/players/${playerId}/relationships/servers`,
                { 
                    headers,
                    params: { "page[size]": 100 }
                }
            );

            const serverRelationships = relRes.data.data || [];
            servidoresEncontrados = serverRelationships.length;

            for (const serverEntry of serverRelationships) {
                const timePlayed = serverEntry.attributes?.timePlayed || 0;
                totalHoras += timePlayed / 3600;

                // Detectar si el jugador está jugando activamente en este servidor ahora mismo
                if (serverEntry.attributes?.status === "online" && !onlineServerId) {
                    onlineServerId = serverEntry.id;
                }
            }
        } catch (e) {
            console.log("Error obteniendo relaciones de servidores:", e.message);
        }

        // Si no vino un servidor por parámetro y no se detectó uno online, intentar leer del config.json como respaldo
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
                console.log("Error leyendo config en el servicio:", err.message);
            }
        }

        // 3. Si tenemos un servidor online (o el configurado), obtenemos su nombre, su último wipe y las horas desde el wipe
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

                // Obtener sesiones en este servidor para calcular horas desde el wipe
                const sessionsResponse = await axios.get(
                    `https://api.battlemetrics.com/sessions`,
                    {
                        headers,
                        params: {
                            "filter[player]": playerId,
                            "filter[servers]": onlineServerId,
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
                console.log(`Error obteniendo datos del servidor online o sus sesiones:`, err.message);
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