require("dotenv").config(); 
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js"); 
const fs = require("fs"); 
const path = require("path"); 
const axios = require("axios"); 

const file = path.join(__dirname, "..", "data", "trackers.json"); 

module.exports = { 
  data: new SlashCommandBuilder() 
    .setName("tracker") 
    .setDescription("Comienza el seguimiento de un jugador BattleMetrics durante 24 horas") 
    .addStringOption(option => option 
      .setName("id") 
      .setDescription("ID del jugador BattleMetrics") 
      .setRequired(true) 
    ), 

  async execute(interaction) { 
    await interaction.deferReply(); 
    const playerId = String(interaction.options.getString("id")); 

    // ====================== // 
    // CONFIG BATTLEMETRICS // 
    // ====================== // 
    const configFile = path.join(__dirname, "..", "data", "config.json"); 
    let config = {}; 
    try { 
      if(fs.existsSync(configFile)) { 
        config = JSON.parse(fs.readFileSync(configFile, "utf8")); 
      } 
    } catch(error) { 
      console.log("ERROR LEYENDO CONFIG:", error.message); 
    } 

    const guildId = String(interaction.guild.id); 
    let serverId = null; 

    if(config.battlemetricsServer) { 
      serverId = config.battlemetricsServer; 
    } 

    if(!serverId && config[guildId]) { 
      if(typeof config[guildId] === "object") { 
        serverId = config[guildId].battlemetricsServer; 
      } else { 
        serverId = config[guildId]; 
      } 
    } 

    if(!serverId) { 
      return interaction.editReply("❌ Este servidor no tiene BattleMetrics configurado.\nUsa primero `/configurar-servidor`."); 
    } 

    serverId = String(serverId); 

    // ====================== // 
    // LEER TRACKERS // 
    // ====================== // 
    let trackers = []; 
    try { 
      if(fs.existsSync(file)) { 
        trackers = JSON.parse(fs.readFileSync(file, "utf8")); 
      } 
    } catch(error) { 
      console.log("ERROR LEYENDO TRACKERS:", error.message); 
    } 

    if(!Array.isArray(trackers)) trackers = []; 

    // LIMITE 
    const activosServidor = trackers.filter(t => String(t.guildId) === guildId); 
    if(activosServidor.length >= 20) { 
      return interaction.editReply("❌ Este servidor ya tiene el límite de 20 jugadores en seguimiento."); 
    } 

    // DUPLICADOS 
    const existe = trackers.find(t => String(t.guildId) === guildId && String(t.playerId) === playerId); 
    if(existe) { 
      return interaction.editReply("⚠️ Este jugador ya está siendo monitoreado."); 
    } 

    // ====================== // 
    // CONSULTA INMEDIATA A BATTLEMETRICS (INDEPENDIENTE) // 
    // ====================== // 
    let nombreJugador = "Jugador desconocido"; 
    let estado = "OFFLINE";
    let tiempoSesion = "0:00";
    let nombreServidor = "Servidor Rust";

    const apiToken = process.env.BATTLEMETRICS_TOKEN || process.env.TOKEN;

    const headers = { 
      Authorization: `Bearer ${apiToken}`, 
      Accept: "application/json" 
    };

    try { 
      // Usamos comillas invertidas ` ` obligatorias para inyectar la ID real
      const resBM = await axios.get(`https://battlemetrics.com{serverId}`, { headers, params: { include: "session" } }); 
      const incluidos = resBM.data.included || []; 
      
      const sesionActiva = incluidos.find(s => 
        s.type === "session" && 
        s.relationships?.player?.data?.id === String(playerId) && 
        s.attributes?.stop === null 
      );

      if (sesionActiva) { 
        estado = "ONLINE";
        const horaConexion = new Date(sesionActiva.attributes.start);
        const diferenciaMs = new Date() - horaConexion;
        const horas = Math.floor(diferenciaMs / (1000 * 60 * 60));
        const minutos = Math.floor((diferenciaMs % (1000 * 60 * 60)) / (1000 * 60));
        tiempoSesion = `${horas}:${minutos.toString().padStart(2, '0')}`;
      }

      // Consulta directa al perfil del jugador
      const resPlayer = await axios.get(`https://battlemetrics.com{playerId}`, { headers });
      if(resPlayer.data?.data?.attributes?.name) {
        nombreJugador = resPlayer.data.data.attributes.name;
      }

      if(resBM.data?.data?.attributes?.name) {
        nombreServidor = resBM.data.data.attributes.name;
      }
    } catch(error) { 
      console.log("❌ ERROR DIRECTO EN COMANDO:", error.message); 
    } 

    // ====================== // 
    // CREAR Y GUARDAR TRACKER // 
    // ====================== // 
    const ahora = Date.now(); 
    const expira = ahora + (24 * 60 * 60 * 1000); 

    const nuevoTracker = { 
      guildId: guildId, 
      channelId: String(interaction.channel.id), 
      serverId: serverId, 
      playerId: playerId, 
      playerName: nombreJugador, 
      lastState: estado, 
      createdAt: ahora, 
      expiresAt: expira 
    }; 

    trackers.push(nuevoTracker); 

    try { 
      fs.writeFileSync(file, JSON.stringify(trackers, null, 2)); 
    } catch(error) { 
      console.log("ERROR GUARDANDO TRACKER:", error.message); 
      return interaction.editReply("❌ Error guardando el tracker."); 
    } 

    // ====================== // 
    // CONSTRUIR EMBED DE ESTADO // 
    // ====================== // 
    const embed = new EmbedBuilder() 
      .setTitle("🎮 Tracker BattleMetrics") 
      .setColor(estado === "ONLINE" ? "#57F287" : "#ED4245") 
      .setDescription(`👤 **${nombreJugador}**`) 
      .addFields( 
        { name: "Estado", value: estado === "ONLINE" ? "🟢 ONLINE" : "🔴 OFFLINE" }, 
        { name: "⏱️ Play Time (Sesión)", value: tiempoSesion }, 
        { name: "📡 Servidor", value: `||${nombreServidor}||` }, 
        { name: "⌛ Tracker restante", value: "23h 59m" } 
      ) 
      .setTimestamp(); 

    await interaction.editReply({ 
      content: `✅ **Tracker creado correctamente**\n\n` + 
               `👤 Jugador: **${nombreJugador}**\n` + 
               `🆔 BattleMetrics ID: \`${playerId}\`\n` + 
               `📡 Servidor ID: \`${serverId}\`\n` + 
               `⏳ Duración: 24 horas\n\n` + 
               `📋 Trackers activos: ${activosServidor.length + 1}/20`,
      embeds: [embed] 
    }); 
  } 
};
