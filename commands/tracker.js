const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getLivePlayerSession } = require("../services/trackerService");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("tracker")
        .setDescription("Monitorea la actividad de un jugador usando su enlace de BattleMetrics")
        .addStringOption(option => option.setName("link")
            .setDescription("Enlace del perfil (Ej: https://battlemetrics.com...)")
            .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();
        const link = interaction.options.getString("link");

        // Llamar al servicio limpio desde cero
        const player = await getLivePlayerSession(link);

        if (!player) {
            return await interaction.editReply(
                "❌ No se pudo procesar el rastreo. Asegúrate de ingresar un enlace válido y público de BattleMetrics."
            );
        }

        // Definir color del embed según su estado en vivo
        const embedColor = player.isOnline ? 0x2ecc71 : 0xe74c3c;
        const hiddenServerText = `||${player.serverName}||`;

        const embed = new EmbedBuilder()
            .setTitle("🎯 Monitoreo de Perfil en Vivo")
            .setColor(embedColor)
            .addFields(
                { name: "👤 Jugador", value: player.nombre, inline: true },
                { name: "🆔 BattleMetrics ID", value: `\`${player.id}\``, inline: true },
                { name: "📊 Estado Actual", value: player.status, inline: true },
                { name: "⏱️ Tiempo de Juego", value: `\`${player.playtime}\``, inline: true },
                { name: "🖥️ Servidor Detectado (Revelar)", value: hiddenServerText, inline: false }
            )
            .setTimestamp()
            .setFooter({ text: `${interaction.guild.name} - Sistema Interno de Control` });

        await interaction.editReply({ embeds: [embed] });
    }
};
