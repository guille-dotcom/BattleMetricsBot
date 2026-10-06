const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cola')
        .setDescription('Muestra las canciones pendientes'),

    async execute(interaction) {
        const player = interaction.client.musicPlayer;

        if (!player) {
            return interaction.reply({
                content: '📋 La cola está vacía.',
                ephemeral: true
            });
        }

        const queue = player.nodes.get(interaction.guild.id);

        if (!queue || !queue.currentTrack) {
            return interaction.reply({
                content: '📋 La cola está vacía.',
                ephemeral: true
            });
        }

        const tracks = queue.tracks.toArray();

        const current = queue.currentTrack;

        let description =
            `🎵 **Reproduciendo ahora:**\n` +
            `**[${current.title}](${current.url})**\n\n`;

        if (tracks.length === 0) {
            description += '📭 No hay canciones pendientes.';
        } else {
            description += '📋 **Próximas canciones:**\n';

            tracks.slice(0, 15).forEach((track, index) => {
                description +=
                    `**${index + 1}.** [${track.title}](${track.url})` +
                    ` — ${track.duration || '??:??'}\n`;
            });

            if (tracks.length > 15) {
                description +=
                    `\n... y ${tracks.length - 15} canción(es) más.`;
            }
        }

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📋 Cola de reproducción')
            .setDescription(description)
            .setFooter({
                text: `${tracks.length} canción(es) pendientes`
            });

        return interaction.reply({
            embeds: [embed]
        });
    }
};