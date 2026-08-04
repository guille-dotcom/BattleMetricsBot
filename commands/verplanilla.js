const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const ServerConfig = require('../models/ServerConfig');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verplanilla')
        .setDescription('Muestra el enlace de la planilla de Google Sheets de este servidor'),

    async execute(interaction) {
        // Se quita { ephemeral: true } para que la respuesta sea visible para todos
        await interaction.deferReply();

        const guildId = interaction.guild.id;

        try {
            const config = await ServerConfig.findOne({ guildId });

            if (!config || !config.sheetId) {
                return interaction.editReply('❌ Este servidor no tiene configurada ninguna planilla todavía. Usa `/setupsheet` para agregar una.');
            }

            const sheetUrl = `https://docs.google.com/spreadsheets/d/${config.sheetId}/edit`;

            const embed = new EmbedBuilder()
                .setTitle('📊 Planilla de Google Sheets del Servidor')
                .setDescription(`Puedes acceder a la planilla oficial del servidor haciendo clic en el siguiente enlace:\n\n🔗 **[Abrir Google Sheets](${sheetUrl})**`)
                .setColor(0x0F9D58);

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error al obtener la planilla:', error);
            await interaction.editReply('❌ Hubo un error al buscar la planilla de este servidor.');
        }
    },
};