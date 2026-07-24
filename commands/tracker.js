const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

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

        const steamId = interaction.options.getString('steamid').trim();
        const guildId = interaction.guild.id; 

        // 1. Cargar el ID del servidor de Rust configurado desde el config.json
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
            return interaction.editReply('❌ Por favor, introduce una SteamID64 válida de 17 dígitos.');
        }

        try {
            // Buscamos el jugador filtrando estrictamente dentro de tu servidor de Rust configurado
            const searchUrl = 'https://battlemetrics.com';
            const response = await axios.get(searchUrl, {
                headers: { 'Authorization': `Bearer ${BATTLEMETRICS_TOKEN}` },
                params: {
                    'filter[search]': steamId,
                    'filter[servers]': battleMetricsServerId, 
                    'include': 'server,session'
                }
            });

            // Si el jugador nunca ha pisado tu servidor configurado
            if (!response.data || !response.data.data || response.data.data.length === 0) {
                return interaction.editReply('❌ No se encontró ningún registro de actividad de ese jugador en nuestro servidor de Rust.');
            }

            const playerData = response.data.data[0]; // Tomamos el primer jugador que coincide en tu servidor
            const includedData = response.data.included || [];
            const playerName = playerData.attributes.name;

            // Buscamos si el jugador tiene una sesión activa ejecutándose en este instante
            const targetSession = includedData.find(item => 
                item.type === 'session' && 
                item.relationships.server.data.id === battleMetricsServerId
            );

            let status = '🔴 Offline';
            let sessionTimeText = '00:00'; // Formato por defecto si está desconectado
            let serverName = 'Nuestro Servidor de Rust';
            let embedColor = 0xe74c3c; // Rojo por defecto si está offline

            // Buscar el nombre real del servidor en los datos incluidos para taparlo con spoiler
            const serverInfo = includedData.find(item => item.type === 'server' && item.id === battleMetricsServerId);
            if (serverInfo && serverInfo.attributes?.name) {
                serverName = serverInfo.attributes.name;
            }

            if (targetSession) {
                // Si la sesión no tiene fecha de parada ('stop'), significa que está ONLINE jugando ahora
                if (targetSession.attributes.stop === null) {
                    status = '🟢 Online';
                    embedColor = 0x2ecc71; // Cambia a verde

                    // FORMATO EXCLUSIVO BATTLEMETRICS (Play time de la sesión actual: HH:MM)
                    const startTime = new Date(targetSession.attributes.start);
                    const currentTime = new Date();
                    const diffMs = currentTime - startTime;
                    const diffMinutes = Math.floor(diffMs / 1000 / 60);
                    
                    const hours = Math.floor(diffMinutes / 60);
                    const minutes = diffMinutes % 60;

                    // Añade un cero a la izquierda si el número es menor a 10 (ej: 02 en vez de 2)
                    const formattedHours = String(hours).padStart(2, '0');
                    const formattedMinutes = String(minutes).padStart(2, '0');

                    sessionTimeText = `${formattedHours}:${formattedMinutes}`;
                } else {
                    // Si el jugador ya se desconectó, muestra su última hora de conexión
                    const lastTime = new Date(targetSession.attributes.stop).toLocaleString('es-ES', { timeZone: 'America/Santiago' });
                    status = '🔴 Offline';
                    sessionTimeText = `Última vez visto: ${lastTime}`;
                    embedColor = 0xe74c3c; 
                }
            }

            // Aplicamos el formato de Spoiler de Discord ||texto|| para tapar el servidor
            const hiddenServerText = `||${serverName}||`;

            // 3. Crear el diseño visual del Embed interactivo
            const trackerEmbed = new EmbedBuilder()
                .setColor(embedColor)
                .setTitle(`🎯 Monitoreo de Jugador: ${playerName}`)
                .setURL(`https://battlemetrics.com{playerData.id}`)
                .addFields(
                    { name: '👤 Nombre detectado', value: playerName, inline: true },
                    { name: '🆔 SteamID64', value: `\`${steamId}\``, inline: true },
                    { name: '📊 Estado', value: status, inline: true },
                    { name: '⏱️ Play time (Sesión)', value: `\`${sessionTimeText}\``, inline: true },
                    { name: '🖥️ Servidor actual (Haz click para revelar)', value: hiddenServerText, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: `${interaction.guild.name} - Control Interno` });

            await interaction.editReply({ embeds: [trackerEmbed] });

        } catch (error) {
            console.error('ERROR EN TRACKER ENLAZADO:', error.message);
            await interaction.editReply('⚠️ Ocurrió un error al procesar la solicitud en BattleMetrics filtrada por tu servidor.');
        }
    },
};
