const { SlashCommandBuilder, EmbedBuilder } = require("discord.js"); 
const axios = require('axios'); 

const BATTLEMETRICS_TOKEN = process.env.BATTLEMETRICS_TOKEN || process.env.TOKEN; 

module.exports = { 
    data: new SlashCommandBuilder() 
        .setName("tracker") 
        .setDescription("Rastrea el estado del jugador en su servidor principal de BattleMetrics") 
        .addStringOption(option => option.setName("link") 
            .setDescription("Link del perfil de BattleMetrics") 
            .setRequired(true) 
        ), 

    async execute(interaction) { 
        await interaction.deferReply(); 
        const link = interaction.options.getString("link"); 

        try { 
            // 1. Extraer la ID numérica del link de forma limpia 
            const match = link.match(/players\/(\d+)/); 
            if (!match) { 
                return await interaction.editReply( 
                    "❌ Link inválido.\n\nEjemplo válido:\nhttps://battlemetrics.com" 
                ); 
            } 
            const battlemetricsId = match[1]; 

            // 2. Consulta directa a la API de BattleMetrics
            // SINTAXIS COMPLETAMENTE CORREGIDA ABAJO:
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

            // 3. Obtener la sesión más reciente (La primera de la lista de actividad) 
            const ultimaSesionFila = incluidos.find(s => s.type === "session"); 

            let statusText = '🔴 Offline'; 
            let embedColor = 0xe74c3c; 
            let playtimeFormateado = '00:00'; 
            let serverName = "Ninguno detectado"; 

            if (ultimaSesionFila) { 
                const serverId = ultimaSesionFila.relationships?.server?.data?.id; 
                const serverInfo = incluidos.find(s => s.type === "server" && String(s.id) === String(serverId)); 
                if (serverInfo && serverInfo.attributes?.name) { 
                    serverName = serverInfo.attributes.name; 
                } 

                if (ultimaSesionFila.attributes?.stop === null) { 
                    statusText = '🟢 Online'; 
                    embedColor = 0x2ecc71; 
                    
                    const horaConexion = new Date(ultimaSesionFila.attributes.start); 
                    const diferenciaMs = new Date() - horaConexion; 
                    const horas = Math.floor(diferenciaMs / (1000 * 60 * 60)); 
                    const minutes = Math.floor((diferenciaMs % (1000 * 60 * 60)) / (1000 * 60)); 
                    playtimeFormateado = `${String(horas).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`; 
                } else { 
                    const lastTime = new Date(ultimaSesionFila.attributes.stop).toLocaleString('es-ES'); 
                    playtimeFormateado = `Última vez visto: ${lastTime}`; 
                } 
            } else { 
                playtimeFormateado = "Sin registros de actividad recientes"; 
            } 

            const hiddenServerText = `||${serverName}||`; 

            // 4. Enviar la tarjeta de monitoreo enfocada en el servidor principal 
            const embed = new EmbedBuilder() 
                .setTitle(`🎯 Monitoreo de Perfil`) 
                .setColor(embedColor) 
                .addFields( 
                    { name: "👤 Jugador", value: nombreJugador, inline: true }, 
                    { name: "🆔 BattleMetrics ID", value: `\`${battlemetricsId}\``, inline: true }, 
                    { name: "📊 Estado Actual", value: statusText, inline: true }, 
                    { name: "⏱️ Tiempo de Juego", value: `\`${playtimeFormateado}\``, inline: true }, 
                    { name: "🖥️ Servidor de Seguimiento (Revelar)", value: hiddenServerText, inline: false } 
                ) 
                .setTimestamp() 
                .setFooter({ text: `${interaction.guild.name} - Rastreador de Actividad` }); 

            await interaction.editReply({ embeds: [embed] }); 

        } catch (error) { 
            console.error("ERROR TRACKER INTEGRADO:", error); 
            await interaction.editReply("❌ Error procesando el rastreo del jugador. Verifica que el link sea válido."); 
        } 
    } 
};
