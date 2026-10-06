const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('saltar')
        .setDescription('Salta la canción actual'),

    async execute(interaction) {
        const player = interaction.client.musicPlayer;

        if (!player) {
            return interaction.reply({
                content: '❌ No hay música reproduciéndose.',
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

        const currentTrack = queue.currentTrack;

        queue.node.skip();

        return interaction.reply(
            `⏭️ Canción saltada: **${currentTrack.title}**`
        );
    }
};