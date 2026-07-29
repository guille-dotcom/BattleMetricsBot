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
        // 1. Respondemos inmediatamente a Discord para evitar el error de "comando obsoleto"
        await interaction.deferReply();

        if (!fs.existsSync(file)) {
            return await interaction.editReply({ 
                content: "❌ No hay datos de usuarios registrados para el ranking." 
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
        const ranking = [];

        // 2. Procesamos cada usuario con una pequeña pausa para no saturar la API
        for (const id of Object.keys(users)) {
            const u = users[id];
            try {
                const h = await getBattleMetricsHours(u.battlemetricsId, serverIdConfigurado);
                
                const horasWipeNum = Number(h.horasDesdeWipe || 0);

                // MODIFICACIÓN: Solo agregar al ranking si tiene horas mayores a 0 en este wipe
                if (horasWipeNum > 0) {
                    const nombreJugador = u.discord || h.nombre || "Desconocido";
                    ranking.push({ discord: nombreJugador, hours: horasWipeNum });
                }

                // Pequeña pausa de 300ms-500ms entre cada petición para cuidar la API y evitar bloqueos
                await new Promise(resolve => setTimeout(resolve, 300));
            } catch (err) {
                console.log(`Error obteniendo datos para ID ${u.battlemetricsId}:`, err.message);
            }
        }

        // Ordenar de mayor a menor y limitar a 10 jugadores
        ranking.sort((a, b) => b.hours - a.hours);

        let text = "";
        if (ranking.length === 0) {
            text = "No hay jugadores con horas registradas en este servidor desde el último wipe.";
        } else {
            ranking.slice(0, 10).forEach((u, i) => {
                text += `**${i + 1}.** ${u.discord} — **${u.hours.toFixed(2)}h** desde el wipe\n`;
            });
        }

        const embed = new EmbedBuilder()
            .setTitle("⏱️ Ranking: Horas desde el Último Wipe")
            .setDescription(text)
            .setColor("#57F287")
            .setTimestamp()
            .setFooter({ text: "RustLogix" });

        return await interaction.editReply({ embeds: [embed] });
    }
};