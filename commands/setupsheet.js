const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const ServerConfig = require('../models/ServerConfig');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setupsheet')
        .setDescription('Configura la planilla de Google Sheets para este servidor')
        .addStringOption(option =>
            option.setName('url_o_id')
                .setDescription('Enlace completo de la hoja de Google Sheets o su ID')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const input = interaction.options.getString('url_o_id');
        const guildId = interaction.guild.id;
        let sheetId = input;

        // Si pegan la URL completa, extraemos el ID automáticamente
        if (input.includes('/d/')) {
            const match = input.match(/\/d\/([a-zA-Z0-9-_]+)/);
            if (match && match[1]) {
                sheetId = match[1];
            }
        }

        try {
            // Actualiza o crea la configuración conservando los demás datos (como battleMetricsServerId)
            await ServerConfig.findOneAndUpdate(
                { guildId },
                { $set: { sheetId } },
                { upsert: true, new: true }
            );

            await interaction.editReply(`✅ ¡Planilla configurada correctamente en la base de datos!\n**ID guardado:** \`${sheetId}\``);
        } catch (error) {
            console.error("Error al guardar la planilla en MongoDB:", error);
            await interaction.editReply('❌ Hubo un error al guardar la configuración de la planilla.');
        }
    },
};