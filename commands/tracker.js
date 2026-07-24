const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getSteamProfile } = require("../services/steam");
const { searchBattleMetricsPlayer } = require("../services/battlemetricsSearch");
const axios = require('axios'); // Lo usamos de forma segura para la sesión
const fs = require("fs");
const path = require("path");

const configFile = path.join(__dirname, "..", "data", "config.json");
const BATTLEMETRICS_TOKEN = process.env.BATTLEMETRICS_TOKEN || process.env.TOKEN;

module.exports = {
    data: new SlashCommandBuilder()
        .setName("tracker")
        .setDescription("Rastrea a un jugador en nuestro servidor usando su Steam ID")
        .addStringOption(option =>
            option.setName("steamid")
                .setDescription("Steam ID del jugador")
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();
        const steamId = interaction.options.getString("steamid");
        const guildId = interaction.guild.id;

        try {
            // 1. Obtener perfil de Steam usando tu servicio nativo
            const steam = await getSteamProfile(steamId);
            if (!steam) {
                return interaction.editReply("❌ No se encontró ese Steam ID.");
            }

            // 2. Leer servidor configurado (Soportando la estructura por guildId que tienes)
            const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
            let battlemetricsServerId = null;

            if (config[guildId] && config[guildId].battlemetricsServer) {
                battlemetricsServerId = config[guildId].battlemetricsServer;
            } else if (config.battlemetricsServer) {
                battlemetricsServerId = config.battlemetricsServer;
            }

            if (!battlemetricsServerId) {
                return interaction.editReply("❌ No hay ningún servidor de Rust configurado en esta comunidad.");
            }

            // 3. Buscar el jugador en tu servidor usando tu servicio nativo (Evita el 403 por completo)
            const player = await searchBattleMetricsPlayer(steam.name, battlemetricsServerId);
            if (!player) {
                return interaction.editReply(`❌ El jugador **${steam.name}** nunca ha ingresado a nuestro servidor de Rust.`);
            }

            // 4. CONSULTA DE SESIÓN EN VIVO DIRECTA (Usando el ID que nos dio tu servicio)
            const playerUrl = `https://battlemetrics.com{player.id}`;
            const response = await axios.get(playerUrl, {
                headers: { 'Authorization': `Bearer ${BATTLEMETRICS_TOKEN}` },
                params: { 'include': 'server,session' }
            });

            const incluidos = response.data.included || [];
            
            // Buscamos si la sesión en tu servidor está en ejecución (stop === null)
            const sesionActiva = incluidos.find(s => 
                s.type === "session" && 
                String(s.relationships?.server?.data?.id) === String(battlemetricsServerId) && 
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
                // Si está offline, sacamos su última hora de juego en tu mapa
                const ultimaSesion = incluidos.find(s => 
                    s.type === "session" && 
                    String(s.relationships?.server?.data?.id) === String(battlemetricsServerId)
                );
                if (ultimaSesion && ultimaSesion.attributes?.stop) {
                    const lastTime = new Date(ultimaSesion.attributes.stop).toLocaleString('es-ES');
                    playtimeFormateado = `Última vez visto: ${lastTime}`;
                }
            }

            // Sacar el nombre del servidor para taparlo en spoiler
            let serverName = "Nuestro Servidor de Rust";
            const serverInfo = incluidos.find(s => s.type === "server" && String(s.id) === String(battlemetricsServerId));
            if (serverInfo && serverInfo.attributes?.name) {
                serverName = serverInfo.attributes.name;
            }

            const hiddenServerText = `||${serverName}||`;

            // 5. Diseñar la tarjeta final del Tracker
            const embed = new EmbedBuilder()
                .setTitle(`🎯 Monitoreo de Perfil: ${steam.name}`)
                .setColor(embedColor)
                .setThumbnail(steam.avatar)
                .addFields(
                    { name: "👤 Nombre de Steam", value: steam.name, inline: true },
                    { name: "🆔 Steam ID", value: `\`${steamId}\``, inline: true },
                    { name: "📊 Estado", value: statusText, inline: true },
                    { name: "⏱️ Play time (Sesión)", value: `\`${playtimeFormateado}\``, inline: true },
                    { name: "🖥️ Servidor actual (Haz click para revelar)", value: hiddenServerText, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: `${interaction.guild.name} - Control Interno` });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error("ERROR TRACKER INTEGRADO:", error);
            await interaction.editReply("❌ Error procesando el rastreo del jugador.");
        }
    }
};
