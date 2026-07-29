const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const configPath = path.join(__dirname, "..", "data", "config.json");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("ranking")
        .setDescription("Ranking de los jugadores con más tiempo activo en el servidor de BattleMetrics"),

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

            // Consultar los jugadores incluidos en el servidor
            const response = await axios.get(
                `https://api.battlemetrics.com/servers/${serverIdConfigurado}?include=player`,
                { headers }
            );

            const included = response.data.included || [];
            const ranking = [];

            for (const item of included) {
                if (item.type === "player") {
                    const nombre = item.attributes?.name || "Desconocido";
                    
                    // BattleMetrics almacena el tiempo de juego de la sesión actual en el objeto relacional o metadatos
                    // Si viene en el meta de la relación o atributos de playtime:
                    const tiempoSegundos = item.meta?.timePlayed || item.attributes?.timePlayed || 0;
                    
                    // Si el tiempo viene en 0, intentamos ver si tiene estadísticas de tiempo total o de sesión
                    let horas = tiempoSegundos / 3600;

                    ranking.push({
                        discord: nombre,
                        hours: horas
                    });
                }
            }

            // Ordenar de mayor a menor tiempo
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
                .setTitle("🏆 Top 15 — Jugadores Activos en el Servidor")
                .setDescription(text)
                .setColor("#57F287")
                .setTimestamp()
                .setFooter({ text: "RustLogix" });

            return await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.log("ERROR API Ranking:", error.response?.data || error.message);
            return await interaction.editReply({ 
                content: "❌ Hubo un error al obtener el ranking desde BattleMetrics." 
            });
        }
    }
};