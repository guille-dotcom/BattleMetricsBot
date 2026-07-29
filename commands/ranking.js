const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const configPath = path.join(__dirname, "..", "data", "config.json");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("ranking")
        .setDescription("Ranking de los jugadores con más tiempo desde el último wipe"),

    async execute(interaction) {
        await interaction.deferReply();

        let serverIdConfigurado = null;
        try {
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
                if (config.battlemetricsServer) {
                    serverIdConfigurado = config.battlemetricsServer;
                }
            }
        } catch (error) {
            console.log("Error leyendo config.json:", error.message);
        }

        if (!serverIdConfigurado) {
            return await interaction.editReply({ 
                content: "❌ No hay ningún servidor de BattleMetrics configurado." 
            });
        }

        try {
            const token = process.env.BATTLEMETRICS_TOKEN;
            const headers = {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            };

            console.log(`[RANKING WIPE] Consultando detalles y sesiones del servidor ${serverIdConfigurado}...`);
            const inicio = Date.now();

            // Consultar el servidor para obtener la fecha del último wipe (suele venir en los detalles/metadatos o se puede estimar)
            // Y traernos las sesiones recientes o activas para acumular el tiempo
            const response = await axios.get(
                `https://api.battlemetrics.com/servers/${serverIdConfigurado}?include=session,player`,
                { headers, timeout: 7000 }
            );

            console.log(`[RANKING WIPE] Respuesta recibida en ${Date.now() - inicio}ms`);

            const serverData = response.data.data;
            // Intentamos obtener la fecha del último wipe desde los detalles del servidor en BattleMetrics
            // Si la API provee details.rustLastWipe o similar, lo usamos; si no, buscamos en los atributos del servidor
            const details = serverData.attributes?.details || {};
            const lastWipeStr = details.rustLastWipe || serverData.attributes?.metadata?.rustLastWipe;
            
            // Si el servidor reporta la fecha de wipe, la usamos. Si no, usamos las últimas 24-48h o el parámetro disponible.
            const fechaWipe = lastWipeStr ? new Date(lastWipeStr) : new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)); // Por defecto una semana si no lo expone

            const included = response.data.included || [];
            const playersMap = {};
            const sessions = [];

            for (const item of included) {
                if (item.type === "player") {
                    playersMap[item.id] = item.attributes?.name || "Desconocido";
                }
                if (item.type === "session") {
                    sessions.push(item);
                }
            }

            const playerHours = {};
            const ahora = new Date();

            // Acumular el tiempo de las sesiones que ocurrieron o se solaparon desde el último wipe
            for (const session of sessions) {
                const playerId = session.relationships?.player?.data?.id;
                if (!playerId) continue;

                const sessionStart = new Date(session.attributes.start);
                // Si la sesión terminó antes del wipe, la ignoramos
                const sessionStop = session.attributes.stop ? new Date(session.attributes.stop) : ahora;

                if (sessionStop < fechaWipe) continue;

                // Recortar el inicio de la sesión si empezó antes del wipe
                const inicioEfectivo = sessionStart < fechaWipe ? fechaWipe : sessionStart;
                const diffSegundos = (sessionStop - inicioEfectivo) / 1000;

                if (diffSegundos > 0) {
                    if (!playerHours[playerId]) {
                        playerHours[playerId] = {
                            name: playersMap[playerId] || "Desconocido",
                            seconds: 0
                        };
                    }
                    playerHours[playerId].seconds += diffSegundos;
                }
            }

            const ranking = Object.values(playerHours).map(p => ({
                discord: p.name,
                hours: p.seconds / 3600
            }));

            // Ordenar de mayor a menor tiempo acumulado desde el wipe
            ranking.sort((a, b) => b.hours - a.hours);

            let text = "";
            if (ranking.length === 0) {
                text = "No hay registros de tiempo desde el último wipe en este momento.";
            } else {
                ranking.slice(0, 15).forEach((u, i) => {
                    text += `**${i + 1}.** ${u.discord} — **${u.hours.toFixed(2)}h**\n`;
                });
            }

            const embed = new EmbedBuilder()
                .setTitle("🏆 Top 15 — Horas desde el Último Wipe")
                .setDescription(text)
                .setColor("#57F287")
                .setTimestamp()
                .setFooter({ text: "RustLogix" });

            return await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.log("ERROR API Ranking Wipe:", error.response?.data || error.message);
            return await interaction.editReply({ 
                content: "❌ Hubo un error al calcular el ranking desde el último wipe." 
            });
        }
    }
};