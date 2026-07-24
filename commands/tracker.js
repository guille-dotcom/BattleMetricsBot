const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'data', 'config.json');
const BATTLEMETRICS_TOKEN = process.env.BATTLEMETRICS_TOKEN; 
const STEAM_API_KEY = process.env.STEAM_API_KEY; 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tracker')
        .setDescription('Rastrea las estadísticas de un jugador de Rust en NUESTRO servidor')
        .addStringOption(option =>
            option.setName('steamid')
                .setDescription('La SteamID64 de 17 dígitos del jugador')
                .setRequired(true)),

    async execute(interaction) {
        // Evita el timeout de 3 segundos de Discord
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
            return interaction.editReply('❌ Ocurrió un error al leer la configuración local del servidor.');
        }

        if (!battleMetricsServerId) {
            return interaction.editReply('❌ Este servidor de Discord aún no ha sido vinculado a un servidor de Rust. Usa primero `/configurar-servidor`.');
        }

        // Validación estricta del formato de Steam ID
        if (!/^\d{17}$/.test(steamId)) {
            return interaction.editReply('❌ Por favor, introduce una SteamID64 válida de 17 dígitos.');
        }

        if (!STEAM_API_KEY) {
            return interaction.editReply('⚠️ Error interno: Falta la variable STEAM_API_KEY en el entorno de Render.');
        }

        try {
            // STEP A: Consultar a la API oficial de Valve para resolver el nombre del perfil
            const steamUrl = 'https://steampowered.com';
            const steamResponse = await axios.get(steamUrl, {
                params: {
                    key: STEAM_API_KEY,
                    steamids: steamId
                }
            });
            
            const players = steamResponse.data?.response?.players;
            
            if (!players || !Array.isArray(players) || players.length === 0) {
                return interaction.editReply('❌ No se encontró ningún perfil de Steam válido asociado a esa SteamID64.');
            }
            
            // CORRECCIÓN DE MAPEO: Accedemos explícitamente al primer elemento [0] del array devuelto por Valve
            const steamName = players[0]?.personaname; 

            if (!steamName) {
                return interaction.editReply('❌ No se pudo determinar el nombre público de la cuenta de Steam.');
            }

            // STEP B: Buscar al jugador utilizando el formato nativo por identificadores para evitar bloqueos 403
            const searchUrl = 'https://battlemetrics.com';
            const response = await axios.get(searchUrl, {
                headers: { 'Authorization': `Bearer ${BATTLEMETRICS_TOKEN}` },
                params: {
                    'filter[identifiers][type]': 'steamId',
                    'filter[identifiers][value]': steamId,
                    'filter[servers]': battleMetricsServerId, 
                    'include': 'server,session'
                }
            });

            // Si el jugador nunca ha pisado tu servidor configurado
            if (!response.data || !response.data.data || response.data.data.length === 0) {
                return interaction.editReply(`❌ El jugador **${steamName}** no tiene ningún registro de actividad en nuestro servidor de Rust.`);
            }

            // Tomamos los datos del jugador encontrado
            const playerData = response.data.data[0]; 
            const includedData = response.data.included || [];
            const playerName = playerData.attributes.name;

            // Buscamos si el jugador posee una sesión de juego vinculada a tu servidor
            const targetSession = includedData.find(item => 
                item.type === 'session' && 
                item.relationships.server.data.id === battleMetricsServerId
            );

            let status = '🔴 Offline';
            let sessionTimeText = '00:00'; 
            let serverName = 'Nuestro Servidor de Rust';
            let embedColor = 0xe74c3c; // Rojo por defecto si está offline

            // Obtener el nombre del servidor desde el paquete incluido
            const serverInfo = includedData.find(item => item.type === 'server' && item.id === battleMetricsServerId);
            if (serverInfo && serverInfo.attributes?.name) {
                serverName = serverInfo.attributes.name;
            }

            if (targetSession) {
                // Si la sesión no tiene fecha 'stop', el jugador está ONLINE en este instante
                if (targetSession.attributes.stop === null) {
                    status = '🟢 Online';
                    embedColor = 0x2ecc71; // Verde

                    const startTime = new Date(targetSession.attributes.start);
                    const currentTime = new Date();
                    const diffMs = currentTime - startTime;
                    const diffMinutes = Math.floor(diffMs / 1000 / 60);
                    
                    const hours = Math.floor(diffMinutes / 60);
                    const minutes = diffMinutes % 60;

                    const formattedHours = String(hours).padStart(2, '0');
                    const formattedMinutes = String(minutes).padStart(2, '0');

                    sessionTimeText = `${formattedHours}:${formattedMinutes}`;
                } else {
                    // Si está offline, calculamos cuándo fue visto por última vez
                    const lastTime = new Date(targetSession.attributes.stop).toLocaleString('es-ES');
                    status = '🔴 Offline';
                    sessionTimeText = `Última vez visto: ${lastTime}`;
                    embedColor = 0xe74c3c; 
                }
            }

            // Aplicamos formato de Spoiler de Discord ||texto|| para tapar el nombre del servidor
            const hiddenServerText = `||${serverName}||`;

            // 3. Construir el Embed visual interactivo
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
            console.error('ERROR EN COORDENADAS TRACKER:', error.message);
            await interaction.editReply('⚠️ Ocurrió un error inesperado al procesar la solicitud en las APIs.');
        }
    },
};
