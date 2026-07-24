const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Importamos de forma directa el servicio que acabamos de corregir arriba
// Modifica la ruta si tu archivo se llama de otra forma (ej: ../services/trackerService)
const { obtenerJugadorServidor, obtenerServidor } = require('./trackerService'); 

const configFile = path.join(__dirname, '..', 'data', 'config.json');
const BATTLEMETRICS_TOKEN = process.env.BATTLEMETRICS_TOKEN;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tracker')
        .setDescription('Rastrea las estadísticas de un jugador de Rust en NUESTRO servidor')
        .addStringOption(option => 
            option.setName('steamid')
                .setDescription('La SteamID64 de 17 dígitos del jugador')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply();

        const steamId = interaction.options.getString('steamid').trim();
        const guildId = interaction.guild.id; 

        // 1. Cargar el servidor de Rust configurado
        let battleMetricsServerId = null;
        try {
            if (fs.existsSync(configFile)) {
                const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
                if (config[guildId] && config[guildId].battlemetricsServer) {
                    battleMetricsServerId = config[guildId].battlemetricsServer;
                }
            }
        } catch (error) {
            console.error('ERROR LEYENDO CONFIG EN TRACKER:', error.message);
            return interaction.editReply('❌ Ocurrió un error al leer la configuración local del servidor.');
        }

        if (!battleMetricsServerId) {
            return interaction.editReply('❌ Este servidor de Discord aún no ha sido vinculado a un servidor de Rust. Usa primero `/configurar-servidor`.');
        }

        if (!/^\d{17}$/.test(steamId)) {
            return interaction.editReply('❌ Por favor, introduce una SteamID64 válida de 17 dígitos.');
        }

        try {
            // Convertimos la SteamID64 en el Player ID interno de BattleMetrics de forma legal filtrando por tu servidor
            const searchUrl = 'https://battlemetrics.com';
            const response = await axios.get(searchUrl, {
                headers: { 'Authorization': `Bearer ${BATTLEMETRICS_TOKEN}` },
                params: {
                    'filter[identifiers][type]': 'steamId',
                    'filter[identifiers][value]': steamId,
                    'filter[servers]': battleMetricsServerId
                }
            });

            if (!response.data || !response.data.data || response.data.data.length === 0) {
                return interaction.editReply('❌ No se encontró ningún registro de esa SteamID64 dentro de nuestro servidor de Rust.');
            }

            // Extraemos el ID interno de BattleMetrics para pasárselo al servicio
            const bmPlayerId = response.data.data[0].id;

            // 2. LLAMAMOS AL SERVICIO UNIFICADO PARA EXTRAER EL ESTADO Y PLAY TIME
            const jugador = await obtenerJugadorServidor(battleMetricsServerId, bmPlayerId);
            const servidor = await obtenerServidor(battleMetricsServerId);

            if (jugador.online === null) {
                return interaction.editReply('⚠️ Ocurrió un problema de comunicación al leer los logs del jugador.');
            }

            const statusText = jugador.online ? '🟢 Online' : '🔴 Offline';
            const embedColor = jugador.online ? 0x2ecc71 : 0xe74c3c;

            // Ocultamos el nombre del servidor mediante el formato de spoiler de Discord
            const hiddenServerText = `||${servidor.nombre || 'Nuestro Servidor de Rust'}||`;

            // 3. Crear el diseño visual interactivo
            const trackerEmbed = new EmbedBuilder()
                .setColor(embedColor)
                .setTitle(`🎯 Monitoreo de Jugador: ${jugador.nombreReal}`)
                .setURL(`https://battlemetrics.com{jugador.idInterno}`)
                .addFields(
                    { name: '👤 Nombre detectado', value: jugador.nombreReal, inline: true },
                    { name: '🆔 SteamID64', value: `\`${steamId}\``, inline: true },
                    { name: '📊 Estado', value: statusText, inline: true },
                    { name: '⏱️ Play time (Sesión)', value: `\`${jugador.playtime}\``, inline: true },
                    { name: '🖥️ Servidor actual (Haz click para revelar)', value: hiddenServerText, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: `${interaction.guild.name} - Control Interno` });

            await interaction.editReply({ embeds: [trackerEmbed] });

        } catch (error) {
            console.error('ERROR EN COMANDO TRACKER UNIFICADO:', error.message);
            await interaction.editReply('⚠️ Ocurrió un error inesperado al procesar el comando con el servicio de BattleMetrics.');
        }
    },
};
