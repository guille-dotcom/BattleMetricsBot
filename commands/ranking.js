const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { getBattleMetricsHours } = require("../services/battlemetricsHours");

const file = path.join(__dirname, "..", "data", "users.json");
const configPath = path.join(__dirname, "..", "data", "config.json");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("ranking")
        .setDescription("Ranking de los jugadores con más horas desde el último wipe"),

    async execute(interaction) {
        await interaction.deferReply();

        if (!fs.existsSync(file)) {
            return await interaction.editReply({ 
                content: "❌ No hay datos de usuarios registrados para el ranking." 
            });
        }

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
                content: "❌ No hay ningún servidor de BattleMetrics configurado. Usa el comando de configuración del servidor primero." 
            });
        }

        const users = JSON.parse(fs.readFileSync(file, "utf-8"));
        const ranking = [];

        for (const id of Object.keys(users)) {
            const u = users[id];
            try {
                const h = await getBattleMetricsHours(u.battlemetricsId, serverIdConfigurado);
                const horasWipeNum = Number(h.horasDesdeWipe || 0);

                // Añadimos al ranking (incluso si tienen horas, los ordenaremos)
                const nombreJugador = u.discord || h.nombre || "Desconocido";
                ranking.push({ discord: nombreJugador, hours: horasWipeNum });

                await new Promise(resolve => setTimeout(resolve, 300));
            } catch (err) {
                console.log(`Error obteniendo datos para ID ${u.battlemetricsId}:`, err.message);
            }
        }

        // Ordenar de mayor a menor cantidad de horas
        ranking.sort((a, b) => b.hours - a.hours);

        let text = "";
        // Mostramos el top 15
        ranking.slice(0, 15).forEach((u, i) => {
            text += `**${i + 1}.** ${u.discord} — **${u.hours.toFixed(2)}h**\n`;
        });

        const embed = new EmbedBuilder()
            .setTitle("🏆 Top 15 — Horas desde el Último Wipe")
            .setDescription(text || "Sin datos disponibles")
            .setColor("#57F287")
            .setTimestamp()
            .setFooter({ text: "RustLogix" });

        return await interaction.editReply({ embeds: [embed] });
    }
};