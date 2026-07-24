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
            // ENDPOINT SEGURO: Buscamos al jugador dentro de las relaciones del servidor para esquivar el error 403
            const url = `https://battlemetrics.com{battleMetricsServerId}/relationships/players`;
            
            const response = await axios.get(url, {
                headers: { 'Authorization': `Bearer ${BATTLEMETRICS_TOKEN}` },
                params: {
                    'filter[search]': steamId,
                    'include': 'session' // Traemos la info de su sesión actual
                }
            });

            if (!response.data || !response.data.data || response.data.data.length === 0) {
                return interaction.editReply('❌ No se encontró ningún registro de actividad de esa SteamID64 en nuestro servidor de Rust.');
            }

            // Mapeamos los datos del jugador encontrado dentro de tu servidor
            const serverPlayerData = response.data.data[0];
            const incluidos = response.data.included || [];
            
            // Extraer nombre y el ID único del jugador
            const playerName = serverPlayerData.attributes.name;
            const bmPlayerId = serverPlayerData.id;

            // Revisamos si tiene una sesión activa en los datos incluidos
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
                // Si está offline, miramos los metadatos para ver su última sesión en tu mapa
                const ultimaSesion = incluidos.find(s => 
                    s.type === "session" && 
                    String(s.relationships?.server?.data?.id) === String(battleMetricsServerId)
                );
                if (ultimaSesion && ultimaSesion.attributes?.stop) {
                    const lastTime = new Date(ultimaSesion.attributes.stop).toLocaleString('es-ES');
                    playtimeFormateado = `Última vez visto: ${lastTime}`;
                }
            }

            // Marcamos el spoiler para ocultar el servidor (Buscamos el nombre del server en la config)
            let serverName = "Nuestro Servidor de Rust";
            const trackerEmbed = new EmbedBuilder()
                .setColor(embedColor)
                .setTitle(`🎯 Monitoreo de Jugador: ${playerName}`)
                .setURL(`https://battlemetrics.com{bmPlayerId}`)
                .addFields(
                    { name: '👤 Nombre detectado', value: playerName, inline: true },
                    { name: '🆔 SteamID64', value: `\`${steamId}\``, inline: true },
                    { name: '📊 Estado', value: statusText, inline: true },
                    { name: '⏱️ Play time (Sesión)', value: `\`${playtimeFormateado}\``, inline: true },
                    { name: '🖥️ Servidor actual (Haz click para revelar)', value: `||ID Servidor: ${battleMetricsServerId}||`, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: `${interaction.guild.name} - Control Interno` });

            await interaction.editReply({ embeds: [trackerEmbed] });

        } catch (error) {
            console.error('ERROR EN COMANDO TRACKER SEGURO:', error.message);
            await interaction.editReply('⚠️ Ocurrió un error inesperado al procesar la solicitud con el endpoint interno de BattleMetrics.');
        }
    },
};
