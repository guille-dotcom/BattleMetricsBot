const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const Tracker = require("../models/TrackerSchema");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("trackers-activos")
        .setDescription("Muestra los perfiles de BattleMetrics que están siendo vigilados"),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            // Buscamos en MongoDB los trackers que coincidan con este canal
            const filtrados = await Tracker.find({ canalId: interaction.channel.id });

            if (!filtrados || filtrados.length === 0) {
                return await interaction.editReply(
                    "📋 No hay jugadores siendo trackeados en este canal."
                );
            }

            const embed = new EmbedBuilder()
                .setTitle("🎯 Trackers Activos")
                .setDescription("Perfiles BattleMetrics actualmente bajo vigilancia.")
                .setColor(0x5865F2)
                .setTimestamp()
                .setFooter({
                    text: "RustLogix"
                });

            const botones = [];
            // Discord permite un máximo de 25 botones por mensaje
            const limiteFiltrados = filtrados.slice(0, 25);

            limiteFiltrados.forEach((data, index) => {
                const tiempoRestante = Math.max(
                    0,
                    new Date(data.expiresAt).getTime() - Date.now()
                );

                const horas = Math.floor(tiempoRestante / 3600000);
                const minutos = Math.floor((tiempoRestante % 3600000) / 60000);

                embed.addFields({
                    name: `${index + 1}. 👤 ${data.nombre || "Desconocido"}`,
                    value: `🔗 **Perfil BattleMetrics**\nhttps://www.battlemetrics.com/players/${data.battlemetricsId}\n\n📡 **Estado:** ${(data.ultimoEstado || "desconocido").toUpperCase()}\n\n⏳ **Tracker restante:** ${horas}h ${minutos}m`,
                    inline: false
                });

                botones.push(
                    new ButtonBuilder()
                        .setCustomId(`eliminar_tracker_${data._id}`)
                        .setLabel(`❌ Eliminar ${data.nombre || data.battlemetricsId}`.slice(0, 80))
                        .setStyle(ButtonStyle.Danger)
                );
            });

            const componentes = [];
            for (let i = 0; i < botones.length; i += 5) {
                componentes.push(
                    new ActionRowBuilder()
                        .addComponents(botones.slice(i, i + 5))
                );
            }

            await interaction.editReply({
                embeds: [embed],
                components: componentes
            });

        } catch (error) {
            console.error("ERROR EN TRACKERS ACTIVOS:", error);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply("❌ Ocurrió un error al cargar los trackers activos.");
            } else {
                await interaction.reply({
                    content: "❌ Ocurrió un error al cargar los trackers activos.",
                    ephemeral: true
                });
            }
        }
    }
};