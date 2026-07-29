const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { getBattleMetricsHours } = require("../services/battlemetricsHours");

const file = path.join(__dirname, "..", "data", "users.json");
const configPath = path.join(__dirname, "..", "data", "config.json");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("ranking")
        .setDescription("Ranking de horas jugadas desde el último wipe en el servidor configurado"),

    async execute(interaction) {
        if (!fs.existsSync(file)) {
            return await interaction.reply({ 
                content: "❌ No hay datos de usuarios registrados para el ranking.", 
                ephemeral: true 
            });
        }

        // Obtener el ID del servidor configurado
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

        const users = JSON.parse(fs.readFileSync(file, "utf-8"));
        await interaction.deferReply();

        const ranking = [];

        for (const id of Object.keys(users)) {
            const u = users[id];
            try {
                // Le pasamos el ID del servidor configurado para que busque las horas exactas de ahí
                const h = await getBattleMetricsHours(u.battlemetricsId, serverIdConfigurado);
                
                const horasWipeNum = Number(h.horasDesdeWipe || 0);
                const nombreJugador = u.discord || h.nombre || "Desconocido";

                ranking.push({ discord: nombreJugador, hours: horasWipeNum });
            } catch (err) {
                console.log(`Error obteniendo datos para ID ${u.battlemetricsId}:`, err.message);
            }
        }

        ranking.sort((a, b) => b.hours - a.hours);

        let text = "";
        ranking.slice(0, 10).forEach((u, i) => {
            text += `**${i + 1}.** ${u.discord} — **${u.hours.toFixed(2)}h** desde el wipe\n`;
        });

        const embed = new EmbedBuilder()
            .setTitle("⏱️ Ranking: Horas desde el Último Wipe")
            .setDescription(text || "Sin datos disponibles")
            .setColor("#57F287")
            .setTimestamp()
            .setFooter({ text: "RustLogix" });

        await interaction.editReply({ embeds: [embed] });
    }
};