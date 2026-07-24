const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'data', 'config.json');
const BATTLEMETRICS_TOKEN = process.env.BATTLEMETRICS_TOKEN; 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tracker')
        .setDescription('Rastrea las estadísticas de un jugador en NUESTRO servidor mediante su SteamID64')
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

        try {
            // STEP A: Consultar el endpoint MATCH para convertir la SteamID64 en el ID interno de BattleMetrics
            const matchUrl = 'https://battlemetrics.com';
            const matchResponse = await axios.post(matchUrl, {
                data: [
                    {
                        type: "identifier",
                        attributes: {
                            type: "steamId",
                            identifier: steamId
                        }
                    }
                ]
            }, {
                headers: { 
                    'Authorization': `Bearer ${BATTLEMETRICS_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });

            // Verificar si el jugador existe en BattleMetrics
            if (!matchResponse.data || !matchResponse.data.data || matchResponse.data.data.length === 0) {
                return interaction.editReply('❌ No se encontró ningún jugador vinculado a esa SteamID64 en los registros globales de BattleMetrics.');
            }

            // Extraemos el ID interno que nos dio el puente
            const bmPlayerId = matchResponse.data.data[0].relationships.player.data.id;

            // STEP B: Ahora que tenemos el ID interno real, pedimos su ficha incluyendo la sesión de TU servidor
            const playerUrl = `https://battlemetrics.com{bmPlayerId}`;
            const response = await axios.get(playerUrl, {
                headers: { 'Authorization': `Bearer ${BATTLEMETRICS_TOKEN}` },
                params: {
                    'include': 'server,session'
                }
            });

            const playerData = response.data.data;
            const includedData = response.data.included || [];
            const playerName = playerData.attributes.name;

            // Buscamos si el jugador tiene una sesión en tu servidor activo
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
                return interaction.editReply(`❌ El jugador **${playerName}** está en BattleMetrics, pero jamás ha entrado a tu servidor de Rust.`);
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
            console.error('ERROR EN RE-ESTRUCTURACIÓN TRACKER:', error.response ? error.response.data : error.message);
            await interaction.editReply('⚠️ Ocurrió un error al procesar el rastreo mediante el identificador de Steam.');
        }
    },
};
