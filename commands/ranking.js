const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const configPath = path.join(__dirname, "..", "data", "config.json");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("ranking")
        .setDescription("Ranking de los jugadores con más tiempo activo en el servidor"),

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

            console.log(`[RANKING OPTIMIZADO] Consultando servidor ${serverIdConfigurado}...`);
            const inicio = Date.now();

            // Petición ligera incluyendo únicamente sesiones y jugadores activos
            const response = await axios.get(
                `https://api.battlemetrics.com/servers/${serverIdConfigurado}?include=session,player`,
                { headers, timeout: 6000 }
            );

            console.log(`[RANKING OPTIMIZADO] Respuesta en ${Date.now() - inicio}ms`);

            const included = response.data.included || [];
            const playersMap = {};
            const sessions = [];

            for (const item of included) {
                if (item.type === "player") {
                    playersMap[item.id] = item.attributes?.name || "Desconocido";
                }
                if (item.type === "session" && !item.attributes?.stop) {
                    sessions.push(item);
                }
            }

            const ranking = [];
            const ahora = new Date();

            for (const session of sessions) {
                const playerId = session.relationships?.player?.data?.id;
                const playerName = playerId ? playersMap[playerId] : "Desconocido";
                
                let horas = 0;
                if (session.attributes?.start) {
                    const inicioSesion = new Date(session.attributes.start);
                    const diffSegundos = (ahora - inicioSesion) / 1000;
                    if (diffSegundos > 0) {
                        horas = diffSegundos / 3600;
                    }
                }

                ranking.push({
                    discord: playerName,
                    hours: horas
                });
            }

            ranking.sort((a, b) => b.hours - a.hours);

            let text = "";
            if (ranking.length === 0) {
                text = "No hay jugadores activos en este momento en el servidor.";
            } else {
                ranking.slice(0, 15).forEach((u, i) => {
                    text += `**${i + 1}.** ${u.discord} — **${u.hours.toFixed(2)}h**\n`;
                });
            }

            const embed = new EmbedBuilder()
                .setTitle("🏆 Top 15 — Jugadores Activos")
                .setDescription(text)
                .setColor("#57F287")
                .setTimestamp()
                .setFooter({ text: "RustLogix" });

            return await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.log("ERROR API Ranking:", error.response?.data || error.message);
            return await interaction.editReply({ 
                content: "❌ Hubo un error al obtener el ranking de este servidor (posiblemente la API tardó demasiado)." 
            });
        }
    }
};