const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('continuar')
        .setDescription('Continúa la música pausada'),

    async execute(interaction) {
        const player = interaction.client.musicPlayer;

        if (!player) {
            return interaction.reply({
                content: '❌ No hay música para continuar.',
                ephemeral: true
            });
        }

        const queue = player.nodes.get(interaction.guild.id);

        if (!queue || !queue.currentTrack) {
            return interaction.reply({
                content: '❌ No hay ninguna canción en reproducción.',
                ephemeral: true
            });
        }

        if (!queue.node.isPaused()) {
            return interaction.reply({
                content: '▶️ La música ya está reproduciéndose.',
                ephemeral: true
            });
        }

        queue.node.resume();

        return interaction.reply('▶️ Música reanudada.');
    }
};