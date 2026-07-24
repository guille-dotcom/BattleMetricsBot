const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const https = require('https'); // Cambiado a la librería nativa de Node.js

const configFile = path.join(__dirname, '..', 'data', 'config.json');
const BATTLEMETRICS_TOKEN = process.env.BATTLEMETRICS_TOKEN;

// Función auxiliar nativa para hacer peticiones GET limpias sin Axios
function pedirDatos(urlCompleta) {
    return new Promise((resolve, reject) => {
        const opciones = {
            headers: {
                'Authorization': `Bearer ${BATTLEMETRICS_TOKEN}`,
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        };
        https.get(urlCompleta, opciones, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', (err) => { reject(err); });
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tracker')
        .setDescription('Rastrea las estadísticas de un jugador de Rust usando su ID o link de BattleMetrics')
        .addStringOption(option => 
            option.setName('jugador')
                .setDescription('Introduce el ID numérico de BattleMetrics o el enlace completo al perfil del jugador')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply();

        const jugadorInput = interaction.options.getString('jugador').trim();
        const guildId = interaction.guild.id; 

        // 1. Cargar el servidor de Rust configurado desde config.json
        let battleMetricsServerId = null;
        try {
            if (fs.existsSync(configFile)) {
                const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
                if (config[guildId] && config[guildId].battlemetricsServer) {
                    battleMetricsServerId = String(config[guildId].battlemetricsServer).trim();
                }
            }
        } catch (error) {
            console.error('ERROR LEYENDO CONFIG EN TRACKER:', error.message);
            return interaction.editReply('❌ Ocurrió un error al leer la configuración local del servidor.');
        }

        if (!battleMetricsServerId) {
            return interaction.editReply('❌ Este servidor de Discord aún no ha sido vinculado a un servidor de Rust. Usa primero `/configurar-servidor`.');
        }

        // 2. EXTRACCIÓN DEL ID DE BATTLEMETRICS
        let bmPlayerId = null;
        if (jugadorInput.includes('://battlemetrics.com')) {
            const match = jugadorInput.match(/players\/(\d+)/);
            if (match) {
                bmPlayerId = match[1];
            }
        } else if (/^\d+$/.test(jugadorInput)) {
            bmPlayerId = jugadorInput;
        }

        if (!bmPlayerId) {
            return interaction.editReply('❌ Entrada inválida. Por favor, proporciona el ID numérico de BattleMetrics o la URL del perfil del jugador.');
        }

        try {
            // URL limpia armada manualmente de forma nativa e infalible
            const urlCompleta = `https://api.://battlemetrics.com${bmPlayerId}?include=server,session`;
            
            const responseData = await pedirDatos(urlCompleta);

            if (!responseData || !responseData.data) {
                return interaction.editReply('❌ No se encontró ningún registro para ese ID de jugador en BattleMetrics.');
            }

            const playerData = responseData.data;
            const incluidos = responseData.included || [];
            const playerName = playerData.attributes.name;

            // 3. BUSCAR SESIÓN ACTIVA EN TU SERVIDOR CONFIGURADO
            const sesionActiva = incluidos.find(s => 
                s.type === "session" && 
                String(s.relationships?.server?.data?.id) === battleMetricsServerId && 
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
                const ultimaSesion = incluidos.find(s => 
                    s.type === "session" && 
                    String(s.relationships?.server?.data?.id) === battleMetricsServerId
                );
                if (ultimaSesion && ultimaSesion.attributes?.stop) {
                    const lastTime = new Date(ultimaSesion.attributes.stop).toLocaleString('es-ES', { timeZone: 'America/Santiago' });
                    playtimeFormateado = `Última vez visto: ${lastTime}`;
                } else {
                    return interaction.editReply(`❌ El jugador **${playerName}** está registrado en BattleMetrics, pero no tiene historial de juego en tu servidor configurado.`);
                }
            }

            let serverName = "Nuestro Servidor de Rust";
            const serverInfo = incluidos.find(s => s.type === "server" && String(s.id) === battleMetricsServerId);
            if (serverInfo && serverInfo.attributes?.name) {
                serverName = serverInfo.attributes.name;
            }

            const hiddenServerText = `||${serverName}||`;

            const trackerEmbed = new EmbedBuilder()
                .setColor(embedColor)
                .setTitle(`🎯 Monitoreo de Jugador: ${playerName}`)
                .setURL(`https://www.://battlemetrics.com${bmPlayerId}`)
                .addFields(
                    { name: '👤 Nombre detectado', value: playerName, inline: true },
                    { name: '🆔 BattleMetrics ID', value: `\`${bmPlayerId}\``, inline: true },
                    { name: '📊 Estado', value: statusText, inline: true },
                    { name: '⏱️ Play time (Sesión)', value: `\`${playtimeFormateado}\``, inline: true },
                    { name: '🖥️ Servidor actual (Haz click para revelar)', value: hiddenServerText, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: `${interaction.guild.name} - Control Interno` });

            await interaction.editReply({ embeds: [trackerEmbed] });

        } catch (error) {
            console.error('ERROR EN TRACKER NATIVO:', error.message);
            await interaction.editReply('⚠️ Ocurrió un error al procesar el perfil del jugador. Verifica el ID.');
        }
    },
};
