const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('detener')
        .setDescription('Detiene la música y desconecta el bot'),

    async execute(interaction) {
        const player = interaction.client.musicPlayer;

        if (!player) {
            return interaction.reply({
                content: '❌ No hay música reproduciéndose.',
                ephemeral: true
            });
        }

        const queue = player.nodes.get(interaction.guild.id);

        if (!queue) {
            return interaction.reply({
                content: '❌ No hay ninguna reproducción activa.',
                ephemeral: true
            });
        }

        queue.delete();

        return interaction.reply(
            '⏹️ Música detenida y cola eliminada.'
        );
    }
};