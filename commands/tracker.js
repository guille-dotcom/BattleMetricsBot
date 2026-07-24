const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

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
            // STEP 1: Resolver la SteamID64 convirtiéndola en Player ID interno mediante endpoint limpio
            const searchUrl = 'https://battlemetrics.com';
            const searchResponse = await axios.get(searchUrl, {
                headers: { 'Authorization': `Bearer ${BATTLEMETRICS_TOKEN}` },
                params: {
                    'filter[identifiers][type]': 'steamId',
                    'filter[identifiers][value]': steamId,
                    'filter[servers]': battleMetricsServerId,
                    'include': 'server,session'
                }
            });

            if (!searchResponse.data || !searchResponse.data.data || searchResponse.data.data.length === 0) {
                return interaction.editReply('❌ No se encontró ningún registro de esa SteamID64 dentro de nuestro servidor de Rust.');
            }

            const playerData = searchResponse.data.data[0];
            const incluidos = searchResponse.data.included || [];
            const playerName = playerData.attributes.name;

            // STEP 2: Buscar sesión activa y calcular el Play Time de forma directa
            const sesionActiva = incluidos.find(s => 
                s.type === "session" && 
                String(s.relationships?.server?.data?.id) === String(battleMetricsServerId) && 
                s.attributes?.stop === null
            );

            let statusText = '🔴 Offline';
            let embedColor = 0xe74c3c;
            let playtimeFormateado = '00:00';

            if (sesionActiva) {
                statusText = '🟢 Online';
                embedColor = 0x2ecc71;

                const horaConexion = new Date(sesionActiva.attributes.start);
                const diferenciaMs = new Date() - horaConexion;
                const horas = Math.floor(diferenciaMs / (1000 * 60 * 60));
                const minutos = Math.floor((diferenciaMs % (1000 * 60 * 60)) / (1000 * 60));
                playtimeFormateado = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
            } else {
                // Si está offline, buscamos la última sesión guardada para ver cuándo se desconectó
                const ultimaSesión = incluidos.find(s => 
                    s.type === "session" && 
                    String(s.relationships?.server?.data?.id) === String(battleMetricsServerId)
                );
                if (ultimaSesión && ultimaSesión.attributes?.stop) {
                    const lastTime = new Date(ultimaSesión.attributes.stop).toLocaleString('es-ES');
                    playtimeFormateado = `Última vez visto: ${lastTime}`;
                }
            }

            // Conseguir el nombre del servidor para el spoiler
            let serverName = "Nuestro Servidor de Rust";
            const serverInfo = incluidos.find(s => s.type === "server" && String(s.id) === String(battleMetricsServerId));
            if (serverInfo && serverInfo.attributes?.name) {
                serverName = serverInfo.attributes.name;
            }

            const hiddenServerText = `||${serverName}||`;

            const trackerEmbed = new EmbedBuilder()
                .setColor(embedColor)
                .setTitle(`🎯 Monitoreo de Jugador: ${playerName}`)
                .setURL(`https://battlemetrics.com{playerData.id}`)
                .addFields(
                    { name: '👤 Nombre detectado', value: playerName, inline: true },
                    { name: '🆔 SteamID64', value: `\`${steamId}\``, inline: true },
                    { name: '📊 Estado', value: statusText, inline: true },
                    { name: '⏱️ Play time (Sesión)', value: `\`${playtimeFormateado}\``, inline: true },
                    { name: '🖥️ Servidor actual (Haz click para revelar)', value: hiddenServerText, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: `${interaction.guild.name} - Control Interno` });

            await interaction.editReply({ embeds: [trackerEmbed] });

        } catch (error) {
            console.error('ERROR EN COMANDO TRACKER DIRECTO:', error.message);
            await interaction.editReply('⚠️ Ocurrió un error inesperado al procesar el comando con BattleMetrics.');
        }
    },
};
