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
        .setDescription('Rastrea a un jugador en nuestro servidor usando su SteamID64, perfil o link personalizado')
        .addStringOption(option =>
            option.setName('input')
                .setDescription('Pega la SteamID64 (17 dígitos), el link del perfil o su ID personalizada')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply();

        let userInput = interaction.options.getString('input').trim();
        const guildId = interaction.guild.id; 

        // 1. Cargar el servidor de Rust configurado
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

        if (!STEAM_API_KEY) {
            return interaction.editReply('⚠️ Error interno: Falta la variable STEAM_API_KEY en la configuración de Render.');
        }

        let steamId = null;

        // 2. DETECTOR INTELIGENTE DE ENTRADA (Mapear enlaces de Steam o IDs personalizadas)
        // Si el usuario metió un link completo de tipo /id/ o /profiles/
        if (userInput.includes('steamcommunity.com')) {
            const idMatch = userInput.match(/\/id\/([^\/]+)/);
            const profileMatch = userInput.match(/\/profiles\/(\d{17})/);
            
            if (profileMatch) {
                steamId = profileMatch[1];
            } else if (idMatch) {
                userInput = idMatch[1]; // Extraemos el texto personalizado (ej: gorky_20)
            } else {
                return interaction.editReply('❌ Formato de enlace de Steam inválido.');
            }
        }

        // Si después de la limpieza aún no es una SteamID64 numérica de 17 dígitos, asumimos que es una Vanity URL (gorky_20)
        if (!steamId) {
            if (/^\d{17}$/.test(userInput)) {
                steamId = userInput; // Era una SteamID64 pura desde el inicio
            } else {
                try {
                    // Le preguntamos a Steam a qué número de 17 dígitos equivale esa URL personalizada
                    const vanityUrl = 'https://steampowered.com';
                    const vanityResponse = await axios.get(vanityUrl, {
                        params: { key: STEAM_API_KEY, vanityurl: userInput }
                    });
                    
                    if (vanityResponse.data?.response?.success === 1) {
                        steamId = vanityResponse.data.response.steamid;
                    } else {
                        return interaction.editReply(`❌ No se pudo convertir "${userInput}" en una SteamID64 válida. Verifica el link.`);
                    }
                } catch (err) {
                    console.error('Error resolviendo Vanity URL:', err.message);
                    return interaction.editReply('⚠️ Ocurrió un error al intentar resolver el enlace personalizado en Steam.');
                }
            }
        }

        // 3. CONSULTA PRINCIPAL CON LA STEAMID64 YA CONVERTIDA Y ASEGURADA
        try {
            const steamUrl = 'https://steampowered.com';
            const steamResponse = await axios.get(steamUrl, {
                params: { key: STEAM_API_KEY, steamids: steamId }
            });
            
            const players = steamResponse.data?.response?.players;
            if (!players || !Array.isArray(players) || players.length === 0) {
                return interaction.editReply('❌ No se encontró ningún perfil de Steam válido asociado a esa cuenta.');
            }
            
            const steamName = players[0].personaname; 

            // STEP B: Buscar en BattleMetrics filtrando por tu servidor
            const bmUrl = 'https://battlemetrics.com';
            const response = await axios.get(bmUrl, {
                headers: { 'Authorization': `Bearer ${BATTLEMETRICS_TOKEN}` },
                params: {
                    'filter[search]': steamName,
                    'filter[servers]': battleMetricsServerId,
                    'include': 'server,session'
                }
            });

            if (!response.data || !response.data.data || response.data.data.length === 0) {
                return interaction.editReply(`❌ El jugador **${steamName}** no tiene ningún registro de actividad histórico en nuestro servidor de Rust.`);
            }

            const playerData = response.data.data[0]; 
            const includedData = response.data.included || [];
            const playerName = playerData.attributes.name;

            const targetSession = includedData.find(item => 
                item.type === 'session' && 
                item.relationships.server.data.id === battleMetricsServerId
            );

            let status = '🔴 Desconectado de nuestro servidor';
            let sessionTimeText = 'No está jugando actualmente aquí';
            let embedColor = 0xe74c3c; 

            if (targetSession) {
                if (targetSession.attributes.stop === null) {
                    status = '🟢 Jugando ahora en nuestro servidor';
                    embedColor = 0x2ecc71; 

                    const startTime = new Date(targetSession.attributes.start);
                    const currentTime = new Date();
                    const diffMs = currentTime - startTime;
                    const diffMinutes = Math.floor(diffMs / 1000 / 60);
                    const hours = Math.floor(diffMinutes / 60);
                    const minutes = diffMinutes % 60;

                    sessionTimeText = hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`;
                } else {
                    const lastTime = new Date(targetSession.attributes.stop).toLocaleString('es-ES');
                    status = '⚪ Offline (Ha jugado en nuestro servidor antes)';
                    sessionTimeText = `Última vez visto: ${lastTime}`;
                    embedColor = 0x34495e; 
                }
            } else {
                return interaction.editReply(`❌ El jugador **${playerName}** no registra sesiones válidas dentro de este servidor configurado.`);
            }

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
            console.error('ERROR EN TRACKER COMPLETO:', error.message);
            await interaction.editReply('⚠️ Ocurrió un error al procesar el rastreo híbrido de datos.');
        }
    },
};
