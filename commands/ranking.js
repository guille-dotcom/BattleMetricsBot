const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { getServerLeaderboard } = require("../services/battlemetrics.js");
const ServerConfig = require("../models/ServerConfig"); // <--- Importamos el modelo de MongoDB

function formatSecondsToHoursMinutes(seconds) {
    const totalMinutes = Math.floor(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours === 0) return `${minutes}m`;
    return `${hours}h ${minutes}m`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("ranking")
        .setDescription("Muestra el top de jugadores activos en el servidor según su tiempo de juego"),

    async execute(interaction) {
        await interaction.deferReply();

        let serverId = "433255"; // Valor por defecto si no hay ninguno configurado
        
        try {
            // Buscamos la configuración de este servidor en MongoDB
            const dbConfig = await ServerConfig.findOne({ guildId: interaction.guild.id });
            if (dbConfig && dbConfig.battleMetricsServerId) {
                serverId = dbConfig.battleMetricsServerId;
            }
        } catch (error) {
            console.log("Error consultando MongoDB para el ranking:", error.message);
        }

        try {
            const ranking = await getServerLeaderboard(serverId);

            if (!ranking || ranking.length === 0) {
                return await interaction.editReply("❌ No se pudo obtener el ranking o no hay jugadores en este momento.");
            }

            // Tomamos los primeros 10 jugadores para el top
            const topPlayers = ranking.slice(0, 10);

            let description = "";
            topPlayers.forEach((player, index) => {
                const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `**#${index + 1}**`;
                const tiempoFormateado = formatSecondsToHoursMinutes(player.timePlayedSeconds);
                description += `${medal} [${player.name}](https://www.battlemetrics.com/players/${player.id}) — \`${tiempoFormateado}\`\n`;
            });

            const embed = new EmbedBuilder()
                .setTitle("🏆 Ranking de Tiempo en el Servidor")
                .setColor("#57F287")
                .setDescription(description)
                .setTimestamp()
                .setFooter({ text: "RustLogix" });

            return await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error("Error en comando /ranking:", error);
            if (interaction.deferred || interaction.replied) {
                return await interaction.editReply("❌ Ocurrió un error al procesar el ranking.");
            }
        }
    }
};