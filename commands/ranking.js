const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const configPath = path.join(__dirname, "..", "data", "config.json");

function formatHoursToHoursMinutes(decimalHours) {
    const totalMinutes = Math.round(parseFloat(decimalHours) * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours === 0 && minutes === 0) return "0m";
    if (hours === 0) return `${minutes}m`;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("ranking")
        .setDescription("Ranking de jugadores con el tiempo total acumulado en el servidor"),

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

            console.log(`[RANKING TOTAL] Consultando miembros y tiempos del servidor ${serverIdConfigurado}...`);
            const inicio = Date.now();

            // Consultar la relación de jugadores del servidor en BattleMetrics (contiene el tiempo total acumulado)
            const response = await axios.get(
                `https://api.battlemetrics.com/servers/${serverIdConfigurado}/relationships/player-server-members`,
                {
                    headers,
                    params: {
                        "include": "player",
                        "page[size]": 25
                    },
                    timeout: 8000
                }
            );

            console.log(`[RANKING TOTAL] Datos recibidos en ${Date.now() - inicio}ms`);

            const membersData = response.data.data || [];
            const included = response.data.included || [];
            const playersMap = {};

            for (const item of included) {
                if (item.type === "player") {
                    playersMap[item.id] = item.attributes?.name || "Desconocido";
                }
            }

            const ranking = [];

            for (const member of membersData) {
                const playerId = member.relationships?.player?.data?.id;
                if (!playerId) continue;

                // timePlayed suele venir en segundos en las estadísticas de miembro del servidor de BattleMetrics
                const segundosTotales = member.attributes?.timePlayed || member.attributes?.time || 0;
                const horas = segundosTotales / 3600;

                ranking.push({
                    id: playerId,
                    name: playersMap[playerId] || "Desconocido",
                    hoursDecimal: horas,
                    formatted: formatHoursToHoursMinutes(horas)
                });
            }

            // Ordenar de mayor a menor tiempo acumulado total
            ranking.sort((a, b) => b.hoursDecimal - a.hoursDecimal);

            let text = "";
            if (ranking.length === 0) {
                text = "No hay registros de tiempo acumulado en el servidor.";
            } else {
                ranking.slice(0, 15).forEach((u, i) => {
                    text += `**${i + 1}.** [${u.name}](https://www.battlemetrics.com/players/${u.id}) — \`${u.formatted}\`\n`;
                });
            }

            const embed = new EmbedBuilder()
                .setTitle("🏆 Top 15 — Horas Totales Acumuladas")
                .setDescription(text)
                .setColor("#57F287")
                .setTimestamp()
                .setFooter({ text: "RustLogix" });

            return await interaction.editReply({ 
                content: null,
                embeds: [embed] 
            });

        } catch (error) {
            console.log("ERROR API Ranking Total:", error.response?.data || error.message);
            return await interaction.editReply({ 
                content: "❌ Hubo un error al obtener las horas acumuladas del servidor." 
            });
        }
    }
};