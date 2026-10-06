const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sonando')
        .setDescription('Muestra la canción que está sonando'),

    async execute(interaction) {
        const player = interaction.client.musicPlayer;

        if (!player) {
            return interaction.reply({
                content: '❌ No hay ninguna canción reproduciéndose.',
                ephemeral: true
            });
        }

        const queue = player.nodes.get(interaction.guild.id);

        if (!queue || !queue.currentTrack) {
            return interaction.reply({
                content: '❌ No hay ninguna canción reproduciéndose.',
                ephemeral: true
            });
        }

        const track = queue.currentTrack;
        const paused = queue.node.isPaused();

        let progreso = 'No disponible';

        try {
            const timestamp = queue.node.getTimestamp(false);

            if (timestamp) {
                progreso =
                    `${timestamp.current.label} / ${timestamp.total.label}`;
            }
        } catch {
            // Si no se puede obtener el progreso, simplemente mostramos la duración.
            progreso = track.duration || 'No disponible';
        }

        const embed = new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle('🎶 Sonando ahora')
            .setDescription(`**[${track.title}](${track.url})**`)
            .addFields(
                {
                    name: '👤 Artista',
                    value: track.author || 'Desconocido',
                    inline: true
                },
                {
                    name: '⏱️ Progreso',
                    value: progreso,
                    inline: true
                },
                {
                    name: '🔊 Estado',
                    value: paused ? '⏸️ Pausada' : '▶️ Reproduciendo',
                    inline: true
                }
            );

        return interaction.reply({
            embeds: [embed]
        });
    }
};