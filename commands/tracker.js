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
        .setDescription('Rastrea las estadísticas de un jugador en NUESTRO servidor de Rust')
        .addStringOption(option =>
            option.setName('steamid')
                .setDescription('La SteamID64 de 17 dígitos del jugador')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply();

        const steamId = interaction.options.getString('steamid');
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

        if (!/^\d{17}$/.test(steamId)) {
            return interaction.editReply('❌ Por favor, introduce una SteamID64 válida de 17 dígitos.');
        }

        // Validación de que tengas agregada la clave de Steam en Render
        if (!STEAM_API_KEY) {
            return interaction.editReply('⚠️ Error interno: Falta la variable STEAM_API_KEY en la configuración de Render.');
        }

        try {
            // STEP A: Consultar a la API oficial de Steam usando parámetros estructurados sin corchetes de texto
            const steamUrl = 'https://steampowered.com';
            const steamResponse = await axios.get(steamUrl, {
                params: {
                    key: STEAM_API_KEY,
                    steamids: steamId
                }
            });
            
            const players = steamResponse.data?.response?.players;
            if (!players || players.length === 0) {
                return interaction.editReply('❌ No se encontró ningún perfil de Steam válido asociado a esa SteamID64.');
            }
            
            // Extraer el nombre real actual de la cuenta
            const steamName = players[0].personaname; 

            // STEP B: Buscar ese nombre en BattleMetrics filtrando ÚNICAMENTE por tu servidor configurado
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
                return interaction.editReply(`❌ El jugador **${steamName}** no tiene ningún registro de actividad en nuestro servidor de Rust.`);
            }

            // Tomamos el primer jugador encontrado que calce con el filtro de tu servidor
            const playerData = response.data.data[0]; 
            const includedData = response.data.included || [];
            const playerName = playerData.attributes.name;

            // Buscamos la sesión del jugador en tu servidor activo
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
                return interaction.editReply(`❌ El jugador **${playerName}** no tiene registros de sesión en nuestro servidor de Rust.`);
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
            console.error('ERROR EN TRACKER HÍBRIDO STEAM/BM:', error.message);
            await interaction.editReply('⚠️ Ocurrió un error al procesar el rastreo de datos mediante el puente de Steam.');
        }
    },
};
