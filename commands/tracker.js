const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

// Lee el token directamente desde tus variables de entorno de forma segura
const BATTLEMETRICS_TOKEN = process.env.BATTLEMETRICS_TOKEN; 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tracker')
        .setDescription('Rastrea el perfil de un jugador de Rust mediante su SteamID64')
        .addStringOption(option =>
            option.setName('steamid')
                .setDescription('La SteamID64 de 17 dígitos del jugador')
                .setRequired(true)),

    async execute(interaction) {
        // Evita el timeout de 3 segundos de Discord
        await interaction.deferReply();

        const steamId = interaction.options.getString('steamid');

        // Validación de que sea una SteamID64 válida (17 números)
        if (!/^\d{17}$/.test(steamId)) {
            return interaction.editReply('❌ Por favor, introduce una SteamID64 válida de 17 dígitos.');
        }

        // Verificación de seguridad por si acaso no carga el token
        if (!BATTLEMETRICS_TOKEN) {
            return interaction.editReply('⚠️ Error interno: No se encontró el BATTLEMETRICS_TOKEN en la configuración de Render.');
        }

        try {
            // URL CORREGIDA: Ahora incluye correctamente /players?filter antes de los corchetes
            const url = `https://battlemetrics.com[search]=${steamId}&include=server,session`;
            
            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${BATTLEMETRICS_TOKEN}`
                }
            });

            // Si el array de data viene vacío
            if (!response.data.data || response.data.data.length === 0) {
                return interaction.editReply('❌ No se encontró ningún registro de ese jugador en BattleMetrics.');
            }

            const playerData = response.data.data[0]; // Tomamos el primer resultado devuelto de la lista
            const includedData = response.data.included || [];

            const playerName = playerData.attributes.name;
            
            // Extraer horas de Rust (BattleMetrics las agrupa en positiveMatch para este juego)
            const totalHours = Math.round(playerData.attributes.positiveMatch || 0);

            // Valores por defecto para el estado Offline
            let status = '🔴 Offline';
            let currentServer = 'Ninguno';
            let sessionTimeText = 'No está jugando actualmente';

            // Buscamos si hay una sesión activa (sin fecha de parada 'stop')
            const activeSession = includedData.find(item => item.type === 'session' && item.attributes.stop === null);

            if (activeSession) {
                status = '🟢 Online';
                
                // Calcular tiempo de la sesión actual
                const startTime = new Date(activeSession.attributes.start);
                const currentTime = new Date();
                const diffMs = currentTime - startTime;
                
                const diffMinutes = Math.floor(diffMs / 1000 / 60);
                const hours = Math.floor(diffMinutes / 60);
                const minutes = diffMinutes % 60;

                sessionTimeText = hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`;

                // Buscar el nombre del servidor activo
                const serverId = activeSession.relationships.server.data.id;
                const serverInfo = includedData.find(item => item.type === 'server' && item.id === serverId);
                
                if (serverInfo) {
                    currentServer = serverInfo.attributes.name;
                }
            }

            // Diseño visual del Embed
            const trackerEmbed = new EmbedBuilder()
                .setColor(status === '🟢 Online' ? 0x2ecc71 : 0xe74c3c)
                .setTitle(`🔎 Rastreo de Jugador: ${playerName}`)
                .setURL(`https://battlemetrics.com{playerData.id}`)
                .addFields(
                    { name: '👤 Nombre de Steam', value: playerName, inline: true },
                    { name: '🆔 SteamID64', value: `\`${steamId}\``, inline: true },
                    { name: '⚡ Estado Actual', value: status, inline: false },
                    { name: '🕒 Horas Totales (BM)', value: `${totalHours} horas`, inline: true },
                    { name: '⏱️ Tiempo en la Sesión', value: sessionTimeText, inline: true },
                    { name: '🖥️ Servidor Actual', value: currentServer, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: 'Rastreador de Rust - BattleMetrics API' });

            await interaction.editReply({ embeds: [trackerEmbed] });

        } catch (error) {
            console.error(error);
            await interaction.editReply('⚠️ Ocurrió un error al conectar con la API de BattleMetrics o procesar los datos.');
        }
    },
};
