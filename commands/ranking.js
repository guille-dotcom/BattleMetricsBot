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
        .setDescription("Ranking de jugadores con el tiempo acumulado desde el último wipe"),

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

            console.log(`[RANKING] Consultando servidor ${serverIdConfigurado}...`);
            const inicio = Date.now();

            // Pedimos el servidor con inclusión de sesiones y jugadores en una sola llamada rápida
            const response = await axios.get(
                `https://api.battlemetrics.com/servers/${serverIdConfigurado}?include=session,player`,
                { headers, timeout: 7000 }
            );

            console.log(`[RANKING] Respuesta recibida en ${Date.now() - inicio}ms`);

            const serverData = response.data.data;
            const details = serverData.attributes?.details || {};
            
            const lastWipeStr = details.rustLastWipe || details.wipeTime || serverData.attributes?.metadata?.rustLastWipe;
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

            // Sumar todas las sesiones del payload que ocurrieron desde el wipe
            for (const session of sessions) {
                const playerId = session.relationships?.player?.data?.id;
                if (!playerId) continue;

                const sessionStart = new Date(session.attributes.start);
                const sessionStop = session.attributes.stop ? new Date(session.attributes.stop) : ahora;

                // Si la sesión terminó antes del wipe, la ignoramos
                if (sessionStop < fechaWipe) continue;

                // Recortar si empezó antes del wipe
                const inicioEfectivo = sessionStart < fechaWipe ? fechaWipe : sessionStart;
                const diffSegundos = (sessionStop - inicioEfectivo) / 1000;

                if (diffSegundos > 0) {
                    playerSeconds[playerId] = (playerSeconds[playerId] || 0) + diffSegundos;
                }
            }

            const ranking = [];
            for (const [playerId, segundos] of Object.entries(playerSeconds)) {
                const horas = segundos / 3600;
                ranking.push({
                    id: playerId,
                    name: playersMap[playerId] || "Desconocido",
                    hoursDecimal: horas,
                    formatted: formatHoursToHoursMinutes(horas)
                });
            }

            // Ordenar de mayor a menor tiempo acumulado
            ranking.sort((a, b) => b.hoursDecimal - a.hoursDecimal);

            let text = "";
            if (ranking.length === 0) {
                text = "No hay registros de tiempo acumulado desde el último wipe.";
            } else {
                ranking.slice(0, 15).forEach((u, i) => {
                    text += `**${i + 1}.** [${u.name}](https://www.battlemetrics.com/players/${u.id}) — \`${u.formatted}\`\n`;
                });
            }

            const embed = new EmbedBuilder()
                .setTitle("🏆 Top 15 — Horas Totales desde el Último Wipe")
                .setDescription(text)
                .setColor("#57F287")
                .setTimestamp()
                .setFooter({ text: "RustLogix" });

            return await interaction.editReply({ 
                content: null,
                embeds: [embed] 
            });

        } catch (error) {
            console.log("ERROR API Ranking:", error.response?.data || error.message);
            return await interaction.editReply({ 
                content: "❌ Hubo un error al calcular el ranking desde el último wipe." 
            });
        }
    }
};