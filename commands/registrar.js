const { SlashCommandBuilder } = require('discord.js');
const { agregarFilaAPlanilla } = require('../services/sheets');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('registrar')
        .setDescription('Registra un jugador en la planilla de Google Sheets')
        .addStringOption(option =>
            option.setName('steamid')
                .setDescription('SteamID64 del jugador (ej: 76561198070173565)')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('battlemetrics')
                .setDescription('Link o ID del perfil de BattleMetrics')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('motivo')
                .setDescription('Motivo del registro')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('stream_mode')
                .setDescription('Estado de Stream Mode (Opcional)')
                .setRequired(false)
        ),

    async execute(interaction) {
        // Se quita { ephemeral: true } para que el indicador de "pensando" sea público
        await interaction.deferReply();

        // Capturar los valores que el usuario escribe en Discord
        const steamId64 = interaction.options.getString('steamid');
        const battlemetricsUrl = interaction.options.getString('battlemetrics');
        const motivo = interaction.options.getString('motivo');
        const streamMode = interaction.options.getString('stream_mode') || 'No especificado';

        // Enviar los datos a la función que guarda en Google Sheets
        const exito = await agregarFilaAPlanilla(
            interaction.guildId, 
            battlemetricsUrl, 
            motivo, 
            streamMode, 
            steamId64
        );

        if (exito) {
            await interaction.editReply('✅ ¡Jugador registrado correctamente en la planilla de este servidor!');
        } else {
            await interaction.editReply('❌ Error al registrar. Asegúrate de haber configurado la planilla con `/setupsheet` y de que la cuenta de servicio tenga permisos de Editor en tu Google Sheets.');
        }
    },
};