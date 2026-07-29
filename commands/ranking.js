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
        .setDescription("Ranking de jugadores con el tiempo total acumulado desde el último wipe"),

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

            console.log(`[RANKING WIPE TOTAL] Consultando servidor e historial de sesiones ${serverIdConfigurado}...`);
            const inicio = Date.now();

            // 1. Obtenemos los detalles del servidor para sacar la fecha exacta del último wipe
            const serverResponse = await axios.get(
                `https://api.battlemetrics.com/servers/${serverIdConfigurado}`,
                { headers, timeout: 6000 }
            );

            const serverData = serverResponse.data.data;
            const details = serverData.attributes?.details || {};
            const lastWipeStr = details.rustLastWipe || details.wipeTime || serverData.attributes?.metadata?.rustLastWipe;
            
            // Si el servidor expone el wipe lo usamos, si no, un respaldo prudente de 7 días
            const fechaWipe = lastWipeStr ? new Date(lastWipeStr) : new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));
            const fechaWipeISO = fechaWipe.toISOString();

            console.log(`[RANKING WIPE TOTAL] Fecha de wipe detectada: ${fechaWipeISO}`);

            // 2. Consultamos las sesiones filtrando explícitamente desde la fecha del wipe usando los parámetros de la API de BattleMetrics
            const sessionsResponse = await axios.get(
                `https://api.battlemetrics.com/sessions`,
                {
                    headers,
                    params: {
                        "filter[server]": serverIdConfigurado,
                        "filter[start]": `${fechaWipeISO},`,
                        "include": "player",
                        "page[size]": 100
                    },
                    timeout: 8000
                }
            );

            console.log(`[RANKING WIPE TOTAL] Sesiones históricas obtenidas en ${Date.now() - inicio}ms`);

            const sessionsData = sessionsResponse.data.data || [];
            const included = sessionsResponse.data.included || [];
            const playersMap = {};

            for (const item of included) {
                if (item.type === "player") {
                    playersMap[item.id] = item.attributes?.name || "Desconocido";
                }
            }

            const playerSeconds = {};
            const ahora = new Date();

            // 3. Sumar el tiempo de cada sesión histórica desde el wipe
            for (const session of sessionsData) {
                const playerId = session.relationships?.player?.data?.id;
                if (!playerId) continue;

                const sessionStart = new Date(session.attributes.start);
                // Si la sesión sigue abierta, usa la hora actual; si cerró, usa su hora de cierre
                const sessionStop = session.attributes.stop ? new Date(session.attributes.stop) : ahora;

                // Recortar límites si empezó antes del wipe
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

            // Ordenar de mayor a menor tiempo acumulado total
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
            console.log("ERROR API Ranking Histórico Wipe:", error.response?.data || error.message);
            return await interaction.editReply({ 
                content: "❌ Hubo un error al calcular las horas acumuladas desde el último wipe." 
            });
        }
    }
};