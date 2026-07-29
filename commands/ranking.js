const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { getBattleMetricsHours } = require("../services/battlemetricsHours");

const configPath = path.join(__dirname, "..", "data", "config.json");

// Función auxiliar para formatear horas
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
        .setDescription("Ranking de jugadores con más horas desde el último wipe en el servidor"),

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

            console.log(`[RANKING WIPE] Obteniendo jugadores activos del servidor ${serverIdConfigurado}...`);
            const inicio = Date.now();

            // Obtenemos las sesiones activas del servidor actual
            const response = await axios.get(
                `https://api.battlemetrics.com/servers/${serverIdConfigurado}?include=session,player`,
                { headers, timeout: 7000 }
            );

            console.log(`[RANKING WIPE] Respuesta de BM recibida en ${Date.now() - inicio}ms`);

            const included = response.data.included || [];
            const playersMap = {};
            const activePlayerIds = new Set();

            for (const item of included) {
                if (item.type === "player") {
                    playersMap[item.id] = item.attributes?.name || "Desconocido";
                }
                if (item.type === "session" && !item.attributes?.stop) {
                    const playerId = item.relationships?.player?.data?.id;
                    if (playerId) activePlayerIds.add(playerId);
                }
            }

            if (activePlayerIds.size === 0) {
                return await interaction.editReply({
                    content: "❌ No hay jugadores activos en este momento en el servidor para calcular el ranking."
                });
            }

            await interaction.editReply("⏱️ Calculando horas desde el último wipe para los jugadores activos...");

            const rankingData = [];

            // Consultamos las horas de cada jugador activo utilizando el mismo servicio de horasbm
            for (const playerId of activePlayerIds) {
                try {
                    const data = await getBattleMetricsHours(playerId);
                    const horasDecimal = parseFloat(data.horasDesdeWipe || 0);
                    rankingData.log ? null : null; // Evitar warning
                    
                    rankingData.push({
                        name: data.nombre || playersMap[playerId] || "Desconocido",
                        id: playerId,
                        hoursDecimal: horasDecimal,
                        formatted: formatHoursToHoursMinutes(horasDecimal)
                    });
                } catch (err) {
                    console.log(`No se pudieron obtener datos del jugador ${playerId}:`, err.message);
                }
            }

            // Ordenar de mayor a menor según las horas desde el wipe
            rankingData.sort((a, b) => b.hoursDecimal - a.hoursDecimal);

            let text = "";
            if (rankingData.length === 0) {
                text = "No se pudieron calcular las horas de los jugadores.";
            } else {
                rankingData.slice(0, 15).forEach((u, i) => {
                    text += `**${i + 1}.** [${u.name}](https://www.battlemetrics.com/players/${u.id}) — \`${u.formatted}\`\n`;
                });
            }

            const embed = new EmbedBuilder()
                .setTitle("🏆 Top 15 — Horas desde el Último Wipe")
                .setDescription(text)
                .setColor("#57F287")
                .setTimestamp()
                .setFooter({ text: "RustLogix" });

            return await interaction.editReply({ 
                content: null,
                embeds: [embed] 
            });

        } catch (error) {
            console.log("ERROR API Ranking Wipe:", error.response?.data || error.message);
            return await interaction.editReply({ 
                content: "❌ Hubo un error al calcular el ranking desde el último wipe." 
            });
        }
    }
};