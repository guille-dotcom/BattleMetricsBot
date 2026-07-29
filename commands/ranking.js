const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const configPath = path.join(__dirname, "..", "data", "config.json");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("ranking")
        .setDescription("Ranking de jugadores con más horas acumuladas desde el último wipe"),

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

            console.log(`[RANKING WIPE] Consultando servidor y sesiones en BattleMetrics...`);
            const inicio = Date.now();

            const response = await axios.get(
                `https://api.battlemetrics.com/servers/${serverIdConfigurado}?include=session,player`,
                { headers, timeout: 7000 }
            );

            console.log(`[RANKING WIPE] Respuesta recibida en ${Date.now() - inicio}ms`);

            const serverData = response.data.data;
            const details = serverData.attributes?.details || {};
            
            // Intentar obtener la fecha del último wipe desde los detalles del servidor en BattleMetrics
            const lastWipeStr = details.rustLastWipe || details.wipeTime || serverData.attributes?.metadata?.rustLastWipe;
            
            // Si el servidor no expone la fecha exacta, tomamos un respaldo de 7 días o la fecha actual menos las horas de la sesión más larga
            const fechaWipe = lastWipeStr ? new Date(lastWipeStr) : new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));

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

            const playerSeconds = {};
            const ahora = new Date();

            for (const session of sessions) {
                const playerId = session.relationships?.player?.data?.id;
                if (!playerId) continue;

                const sessionStart = new Date(session.attributes.start);
                const sessionStop = session.attributes.stop ? new Date(session.attributes.stop) : ahora;

                // Si la sesión terminó antes del wipe, la ignoramos por completo
                if (sessionStop < fechaWipe) continue;

                // Si empezó antes del wipe, recortamos el inicio a partir del wipe
                const inicioEfectivo = sessionStart < fechaWipe ? fechaWipe : sessionStart;
                const diffSegundos = (sessionStop - inicioEfectivo) / 1000;

                if (diffSegundos > 0) {
                    playerSeconds[playerId] = (playerSeconds[playerId] || 0) + diffSegundos;
                }
            }

            const ranking = [];
            for (const [playerId, segundos] of Object.entries(playerSeconds)) {
                ranking.push({
                    discord: playersMap[playerId] || "Desconocido",
                    hours: segundos / 3600
                });
            }

            // Ordenar de mayor a menor tiempo acumulado
            ranking.sort((a, b) => b.hours - a.hours);

            let text = "";
            if (ranking.length === 0) {
                text = "No hay registros de tiempo desde el último wipe.";
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
                content: "❌ Hubo un error al calcular las horas desde el último wipe." 
            });
        }
    }
};