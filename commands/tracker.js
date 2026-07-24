const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'data', 'config.json');
const BATTLEMETRICS_TOKEN = process.env.BATTLEMETRICS_TOKEN; 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tracker')
        .setDescription('Rastrea las estadísticas de un jugador en NUESTRO servidor de Rust')
        .addStringOption(option =>
            option.setName('steamid')
                .setDescription('La SteamID64 de 17 dígitos del jugador')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply();

        const steamId = interaction.options.getString('steamid').trim();
        const guildId = interaction.guild.id; 

        // 1. Cargar el servidor de Rust configurado desde el archivo JSON local
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

        if (!battleMetricsServerId) {
            return interaction.editReply('❌ Este servidor de Discord aún no ha sido vinculado a un servidor de Rust. Usa primero `/configurar-servidor`.');
        }

        // Validación estricta del ID de Steam
        if (!/^\d{17}$/.test(steamId)) {
            return interaction.editReply('❌ Por favor, introduce una SteamID64 válida de 17 dígitos (ej: 76561198083832145).');
        }

        try {
            // STEP A: Buscar el identificador de Steam directamente en el motor de BattleMetrics
            const searchUrl = 'https://battlemetrics.com';
            const response = await axios.get(searchUrl, {
                headers: { 'Authorization': `Bearer ${BATTLEMETRICS_TOKEN}` },
                params: {
                    'filter[search]': steamId, // Pasamos el número directamente
                    'include': 'server,session'
                }
            });

            // Si no arroja ninguna coincidencia en la base de datos general
            if (!response.data || !response.data.data || response.data.data.length === 0) {
                return interaction.editReply('❌ No se encontró registro de ese jugador en la base de datos global de BattleMetrics.');
            }

            // Tomamos los datos del jugador encontrado
            const playerData = response.data.data[0]; 
            const includedData = response.data.included || [];
            const playerName = playerData.attributes.name;

            // STEP B: Filtrar las sesiones devueltas para ver si coinciden con tu servidor configurado
            const targetSession = includedData.find(item => 
                item.type === 'session' && 
                item.relationships.server.data.id === battleMetricsServerId
            );

            let status = '🔴 Desconectado de nuestro servidor';
            let sessionTimeText = 'No está jugando actualmente aquí';
            let embedColor = 0xe74c3c; // Rojo

            if (targetSession) {
                // Si la sesión está activa (stop es nulo)
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
                    // Si ya cerró sesión en tu servidor
                    const lastTime = new Date(targetSession.attributes.stop).toLocaleString('es-ES');
                    status = '⚪ Offline (Ha jugado en nuestro servidor antes)';
                    sessionTimeText = `Última vez visto: ${lastTime}`;
                    embedColor = 0x34495e; // Gris oscuro
                }
            } else {
                return interaction.editReply(`❌ El jugador **${playerName}** está registrado en BattleMetrics, pero jamás ha entrado a tu servidor configurado.`);
            }

            // 3. Crear el diseño visual final del Embed
            const trackerEmbed = new EmbedBuilder()
                .setColor(embedColor)
                .setTitle(`🎯 Monitoreo de Jugador: ${playerName}`)
                .setURL(`https://battlemetrics.com{playerData.id}`)
                .addFields(
                    { name: '👤 Nombre detectado', value: playerName, inline: true },
                    { name: '🆔 SteamID64', value: `\`${steamId}\``, inline: true },
                    { name: '📊 Estado en el Servidor', value: status, inline: false },
                    { name: '⏱️ Tiempo de Sesión', value: sessionTimeText, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: `${interaction.guild.name} - Control Interno` });

            await interaction.editReply({ embeds: [trackerEmbed] });

        } catch (error) {
            console.error('ERROR CRÍTICO EN TRACKER NATIVO:', error.message);
            await interaction.editReply('⚠️ Ocurrió un error interno al consultar el registro en BattleMetrics.');
        }
    },
};
