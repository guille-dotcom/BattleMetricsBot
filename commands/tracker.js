const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Apuntamos exactamente al mismo archivo config.json que usa tu configurar-servidor.js
const file = path.join(__dirname, '..', 'data', 'config.json');

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

        const steamId = interaction.options.getString('steamid');
        const guildId = interaction.guild.id; 

        // 1. LEER EL ID DEL SERVIDOR CONFIGURADO DESDE TU ARCHIVO JSON
        let battleMetricsServerId = null;

        try {
            if (fs.existsSync(file)) {
                const config = JSON.parse(fs.readFileSync(file, 'utf8'));
                if (config[guildId] && config[guildId].battlemetricsServer) {
                    battleMetricsServerId = config[guildId].battlemetricsServer;
                }
            }
        } catch (error) {
            console.error('ERROR LEYENDO CONFIG EN TRACKER:', error.message);
            return interaction.editReply('❌ Ocurrió un error al leer la configuración del servidor.');
        }

        // Si no se encuentra configurado para este servidor de Discord
        if (!battleMetricsServerId) {
            return interaction.editReply('❌ Este servidor de Discord aún no ha sido vinculado a un servidor de Rust. Usa primero `/configurar-servidor`.');
        }

        // Validación de que sea una SteamID64 válida (17 números)
        if (!/^\d{17}$/.test(steamId)) {
            return interaction.editReply('❌ Por favor, introduce una SteamID64 válida de 17 dígitos.');
        }

        try {
            const url = 'https://battlemetrics.com';
            
            // Hacemos la consulta filtrando la SteamID64 y limitando la búsqueda a TU servidor de Rust
            const response = await axios.get(url, {
                headers: { 'Authorization': `Bearer ${BATTLEMETRICS_TOKEN}` },
                params: {
                    'filter[search]': steamId,          // BattleMetrics asocia la SteamID64 mediante la búsqueda
                    'filter[servers]': battleMetricsServerId, // TRUCO CLAVE: Forzamos a buscar solo en tu servidor
                    'include': 'server,session'         // Traemos las sesiones e info del servidor
                }
            });

            if (!response.data || !response.data.data || response.data.data.length === 0) {
                return interaction.editReply('❌ No se encontró ningún registro de ese jugador en nuestro servidor de Rust.');
            }

            const playerData = response.data.data[0]; // Tomamos el jugador exacto que arrojó la coincidencia
            const includedData = response.data.included || [];
            const playerName = playerData.attributes.name;

            // Buscamos la sesión del jugador que corresponda a tu servidor configurado
            const targetSession = includedData.find(item => 
                item.type === 'session' && 
                item.relationships.server.data.id === battleMetricsServerId
            );

            // Valores por defecto en caso de que esté offline
            let status = '🔴 Desconectado de nuestro servidor';
            let sessionTimeText = 'No está jugando actualmente aquí';
            let embedColor = 0xe74c3c; // Rojo

            if (targetSession) {
                // Si la sesión no tiene fecha de fin ('stop' === null), está jugando AHORA mismo
                if (targetSession.attributes.stop === null) {
                    status = '🟢 Jugando ahora en nuestro servidor';
                    embedColor = 0x2ecc71; // Verde

                    const startTime = new Date(targetSession.attributes.start);
                    const currentTime = new Date();
                    const diffMs = currentTime - startTime;
                    const diffMinutes = Math.floor(diffMs / 1000 / 60);
                    const hours = Math.floor(diffMinutes / 60);
                    const minutes = diffMinutes % 60;

                    sessionTimeText = hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`;
                } else {
                    // Si tiene fecha 'stop', nos indica su última conexión a tu servidor
                    const lastTime = new Date(targetSession.attributes.stop).toLocaleString('es-ES');
                    status = '⚪ Offline (Ha jugado en nuestro servidor antes)';
                    sessionTimeText = `Última vez visto: ${lastTime}`;
                    embedColor = 0x34495e; // Gris oscuro
                }
            } else {
                return interaction.editReply(`❌ El jugador **${playerName}** nunca ha ingresado a nuestro servidor de Rust.`);
            }

            // 3. Diseño visual del Embed adaptado a tu servidor de Discord
            const trackerEmbed = new EmbedBuilder()
                .setColor(embedColor)
                .setTitle(`🎯 Monitoreo de Jugador: ${playerName}`)
                .setURL(`https://battlemetrics.com{playerData.id}`)
                .addFields(
                    { name: '👤 Nombre de Steam', value: playerName, inline: true },
                    { name: '🆔 SteamID64', value: `\`${steamId}\``, inline: true },
                    { name: '📊 Estado en nuestro Servidor', value: status, inline: false },
                    { name: '⏱️ Tiempo de Sesión / Registro', value: sessionTimeText, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: `${interaction.guild.name} - Control Interno` });

            await interaction.editReply({ embeds: [trackerEmbed] });

        } catch (error) {
            console.error('ERROR EN TRACKER DETALLADO:', error.message);
            await interaction.editReply('⚠️ Ocurrió un error al procesar el rastreo interno del servidor en BattleMetrics.');
        }
    },
};
