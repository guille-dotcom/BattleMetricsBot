const { SlashCommandBuilder, EmbedBuilder } = require("discord.js"); 
const axios = require('axios'); 
const fs = require("fs"); 
const path = require("path"); 

const configFile = path.join(__dirname, "..", "data", "config.json"); 
const BATTLEMETRICS_TOKEN = process.env.BATTLEMETRICS_TOKEN || process.env.TOKEN; 

module.exports = { 
    data: new SlashCommandBuilder() 
        .setName("tracker") 
        .setDescription("Rastrea a un jugador en nuestro servidor usando su link de BattleMetrics") 
        .addStringOption(option => option.setName("link") 
            .setDescription("Link del perfil de BattleMetrics") 
            .setRequired(true) 
        ), 

    async execute(interaction) { 
        await interaction.deferReply(); 
        const link = interaction.options.getString("link"); 
        const guildId = interaction.guild.id; 

        try { 
            // 1. Extraer la ID del link exactamente igual que en /horasbm 
            const match = link.match(/players\/(\d+)/); 
            if (!match) { 
                return await interaction.editReply( 
                    "❌ Link inválido.\n\nEjemplo:\nhttps://battlemetrics.com" 
                ); 
            } 
            const battlemetricsId = match[1]; 

            // 2. Leer servidor configurado (Soportando tu estructura por guildId) 
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

            // 3. CONSULTA DE SESIÓN EN VIVO DIRECTA (URL CORREGIDA CON LA API OFICIAL) 
            // CAMBIO AQUÍ: Se añadió "api.", la ruta "/players/" y el símbolo "$" con llaves correctamente
            const playerUrl = `https://battlemetrics.com{battlemetricsId}`; 
            const response = await axios.get(playerUrl, { 
                headers: { 'Authorization': `Bearer ${BATTLEMETRICS_TOKEN}` }, 
                params: { 'include': 'server,session' } 
            }); 

            const playerData = response.data.data; 
            const incluidos = response.data.included || []; 

            if (!playerData) { 
                return interaction.editReply("❌ No se encontraron datos para ese perfil en BattleMetrics."); 
            } 

            const nombreJugador = playerData.attributes?.name || "Desconocido"; 

            // Buscamos si la sesión en tu servidor está activa en este instante (stop === null) 
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
                const minutes = Math.floor((diferenciaMs % (1000 * 60 * 60)) / (1000 * 60)); 
                
                playtimeFormateado = `${String(horas).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`; 
            } else { 
                // Si está offline, buscamos su última sesión guardada en tu mapa 
                const ultimaSesion = incluidos.find(s => 
                    s.type === "session" && 
                    String(s.relationships?.server?.data?.id) === String(battlemetricsServerId) 
                ); 
                if (ultimaSesion && ultimaSesion.attributes?.stop) { 
                    const lastTime = new Date(ultimaSesion.attributes.stop).toLocaleString('es-ES'); 
                    playtimeFormateado = `Última vez visto: ${lastTime}`; 
                } else { 
                    playtimeFormateado = "Sin registros recientes en el servidor"; 
                } 
            } 

            // Sacar el nombre del servidor para el spoiler 
            let serverName = "Nuestro Servidor de Rust"; 
            const serverInfo = incluidos.find(s => s.type === "server" && String(s.id) === String(battlemetricsServerId)); 
            if (serverInfo && serverInfo.attributes?.name) { 
                serverName = serverInfo.attributes.name; 
            } 
            const hiddenServerText = `||${serverName}||`; 

            // 4. Enviar la tarjeta visual con los datos formateados 
            const embed = new EmbedBuilder() 
                .setTitle(`🎯 Monitoreo de Perfil BM`) 
                .setColor(embedColor) 
                .addFields( 
                    { name: "👤 Jugador", value: nombreJugador, inline: true }, 
                    { name: "🆔 BattleMetrics ID", value: `\`${battlemetricsId}\``, inline: true }, 
                    { name: "📊 Estado", value: statusText, inline: true }, 
                    // CAMBIO AQUÍ: Se eliminaron los códigos rotos %EF%B8%8F de los títulos para limpiar la interfaz
                    { name: "⏱️ Play time (Sesión)", value: `\`${playtimeFormateado}\``, inline: true }, 
                    { name: "🖥️ Servidor configurado (Revelar)", value: hiddenServerText, inline: false } 
                ) 
                .setTimestamp() 
                .setFooter({ text: `${interaction.guild.name} - Control Interno` }); 

            await interaction.editReply({ embeds: [embed] }); 

        } catch (error) { 
            console.error("ERROR TRACKER INTEGRADO:", error); 
            await interaction.editReply("❌ Error procesando el rastreo del jugador. Verifica que el link sea válido."); 
        } 
    } 
};
