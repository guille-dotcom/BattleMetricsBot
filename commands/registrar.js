const { SlashCommandBuilder } = require('discord.js');
const { agregarFilaAPlanilla } = require('../services/sheets');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('registrar')
        .setDescription('Registra un jugador en la planilla de Google Sheets')
        .addStringOption(option =>
            option.setName('battlemetrics')
                .setDescription('Enlace de BattleMetrics o ID del jugador')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('motivo')
                .setDescription('Motivo (ej. cheat, ss/ cheat)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('steam_id')
                .setDescription('SteamID64 del jugador')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('stream_mode')
                .setDescription('Nombre en stream mode (opcional)')
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const battlemetrics = interaction.options.getString('battlemetrics');
        const motivo = interaction.options.getString('motivo');
        const steamId = interaction.options.getString('steam_id');
        const streamMode = interaction.options.getString('stream_mode') || '';
        const guildId = interaction.guild.id;

        const exito = await agregarFilaAPlanilla(guildId, battlemetrics, motivo, streamMode, steamId);

        if (exito) {
            await interaction.editReply('✅ ¡Jugador registrado correctamente en la planilla de este servidor!');
        } else {
            await interaction.editReply('❌ Error al registrar. Asegúrate de haber configurado la planilla con `/setupsheet` y de que la cuenta de servicio (`bot-rustlogix...`) tenga permisos de **Editor** en tu Google Sheets.');
        }
    },
};