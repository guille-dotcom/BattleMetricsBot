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

            console.log(`[RANKING WIPE REAL] Consultando servidor y jugadores activos ${serverIdConfigurado}...`);
            const inicio = Date.now();

            // 1. Obtener detalles del servidor y la fecha del wipe
            const serverResponse = await axios.get(
                `https://api.battlemetrics.com/servers/${serverIdConfigurado}?include=player`,
                { headers, timeout: 6000 }
            );

            const serverData = serverResponse.data.data;
            const details = serverData.attributes?.details || {};
            const lastWipeStr = details.rustLastWipe || details.wipeTime || serverData.attributes?.metadata?.rustLastWipe;
            
            const fechaWipe = lastWipeStr ? new Date(lastWipeStr) : new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));
            const fechaWipeISO = fechaWipe.toISOString();
            console.log(`[RANKING WIPE REAL] Fecha wipe detectada: ${fechaWipeISO}`);

            const included = serverResponse.data.included || [];
            const playersList = [];

            for (const item of included) {
                if (item.type === "player") {
                    playersList.push({
                        id: item.id,
                        name: item.attributes?.name || "Desconocido"
                    });
                }
            }

            // Limitamos a los primeros 30 jugadores activos para optimizar rendimiento y evitar timeouts de Discord
            const playersToProcess = playersList.slice(0, 30);
            const ahora = new Date();
            const ranking = [];

            // 2. Entrar al perfil de cada jugador en este servidor para sumar sus sesiones desde el wipe
            const promises = playersToProcess.map(async (player) => {
                try {
                    const sessionRes = await axios.get(
                        `https://api.battlemetrics.com/players/${player.id}/servers/${serverIdConfigurado}/sessions`,
                        {
                            headers,
                            params: {
                                "filter[start]": `${fechaWipeISO},`,
                                "page[size]": 50
                            },
                            timeout: 4000
                        }
                    );

                    const sessions = sessionRes.data.data || [];
                    let totalSeconds = 0;

                    for (const session of sessions) {
                        const sessionStart = new Date(session.attributes.start);
                        const sessionStop = session.attributes.stop ? new Date(session.attributes.stop) : ahora;

                        if (sessionStop < fechaWipe) continue;

                        const inicioEfectivo = sessionStart < fechaWipe ? fechaWipe : sessionStart;
                        const diff = (sessionStop - inicioEfectivo) / 1000;

                        if (diff > 0) {
                            totalSeconds += diff;
                        }
                    }

                    const hoursDecimal = totalSeconds / 3600;
                    if (hoursDecimal > 0) {
                        ranking.push({
                            id: player.id,
                            name: player.name,
                            hoursDecimal: hoursDecimal,
                            formatted: formatHoursToHoursMinutes(hoursDecimal)
                        });
                    }
                } catch (err) {
                    // Si un jugador falla individualmente, se omite para no romper el ranking general
                }
            });

            await Promise.all(promises);

            console.log(`[RANKING WIPE REAL] Procesado en ${Date.now() - inicio}ms`);

            // Ordenar de mayor a menor tiempo acumulado real
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
                .setTitle("🏆 Top 15 — Horas Acumuladas desde el Último Wipe")
                .setDescription(text)
                .setColor("#57F287")
                .setTimestamp()
                .setFooter({ text: "RustLogix" });

            return await interaction.editReply({ 
                content: null,
                embeds: [embed] 
            });

        } catch (error) {
            console.log("ERROR API Ranking Wipe Real:", error.response?.data || error.message);
            return await interaction.editReply({ 
                content: "❌ Hubo un error al calcular el ranking desde el último wipe." 
            });
        }
    }
};