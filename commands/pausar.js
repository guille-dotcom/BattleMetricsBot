const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pausar')
        .setDescription('Pausa la música'),

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

        if (queue.node.isPaused()) {
            return interaction.reply({
                content: '⏸️ La música ya está pausada.',
                ephemeral: true
            });
        }

        queue.node.pause();

        return interaction.reply('⏸️ Música pausada.');
    }
};