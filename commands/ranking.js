const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { getBattleMetricsHours } = require("../services/battlemetricsHours");

const file = path.join(__dirname, "..", "data", "users.json");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("ranking")
        .setDescription("Ranking de horas jugadas desde el último wipe"),

    async execute(interaction) {
        if (!fs.existsSync(file)) {
            return await interaction.reply({ 
                content: "❌ No hay datos de usuarios registrados para el ranking.", 
                flags: 6 // Equivalente a MessageFlags.Ephemeral si usas discord.js v14+
            });
        }

        const users = JSON.parse(fs.readFileSync(file, "utf-8"));
        await interaction.deferReply();

        const ranking = [];

        for (const id of Object.keys(users)) {
            const u = users[id];
            try {
                // Obtenemos los datos completos del perfil de BattleMetrics del usuario
                const h = await getBattleMetricsHours(u.battlemetricsId);
                
                // Extraemos las horas desde el wipe (asegurándonos de pasarlo a número)
                const horasWipeNum = Number(h.horasDesdeWipe || 0);
                const nombreJugador = u.discord || h.nombre || "Desconocido";

                ranking.push({ discord: nombreJugador, hours: horasWipeNum });
            } catch (err) {
                console.log(`Error obteniendo datos para ID ${u.battlemetricsId}:`, err.message);
            }
        }

        // Ordenamos de mayor a menor según las horas desde el wipe
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
            .setFooter({
                text: "RustLogix"
            });

        await interaction.editReply({ embeds: [embed] });
    }
};