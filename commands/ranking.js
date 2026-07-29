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

            console.log(`[RANKING ROBUST] Consultando servidor ${serverIdConfigurado}...`);
            const inicio = Date.now();

            // Consultar el servidor incluyendo sesiones y jugadores
            const response = await axios.get(
                `https://api.battlemetrics.com/servers/${serverIdConfigurado}?include=session,player`,
                { headers, timeout: 8000 }
            );

            console.log(`[RANKING ROBUST] Datos recibidos en ${Date.now() - inicio}ms`);

            const serverData = response.data.data;
            const details = serverData.attributes?.details || {};
            
            // Buscar la fecha de wipe real o usar un margen seguro de 7 días atrás si no viene definida
            const lastWipeStr = details.rustLastWipe || details.wipeTime || serverData.attributes?.metadata?.rustLastWipe;
            let fechaWipe = lastWipeStr ? new Date(lastWipeStr) : new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));
            
            // Validación de seguridad: si la fecha del wipe es futura o menor a hace 1 minuto, tomamos por defecto 4 días atrás
            if (isNaN(fechaWipe.getTime()) || fechaWipe > new Date()) {
                fechaWipe = new Date(Date.now() - (4 * 24 * 60 * 60 * 1000));
            }

            console.log(`[RANKING ROBUST] Usando fecha de referencia wipe: ${fechaWipe.toISOString()}`);

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

                if (sessionStop < fechaWipe) continue;

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

            ranking.sort((a, b) => b.hoursDecimal - a.hoursDecimal);

            console.log(`[RANKING ROBUST] Jugadores procesados con tiempo: ${ranking.length}`);

            let text = "";
            if (ranking.length === 0) {
                text = "No hay registros de tiempo acumulado disponibles en este momento.";
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
            console.log("ERROR API Ranking Robust:", error.response?.data || error.message);
            return await interaction.editReply({ 
                content: "❌ Hubo un error al calcular el ranking del servidor." 
            });
        }
    }
};