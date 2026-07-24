const { SlashCommandBuilder, EmbedBuilder } = require("discord.js"); 
const fs = require("fs"); 
const path = require("path"); 
// Importamos tu servicio original que funciona perfecto
const { getBattleMetricsHours } = require("../services/battlemetricsHours"); 

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
    // Respuesta pública para todo el chat
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
    // CONSULTA CON TU MÉTODO ORIGINAL DE AYER // 
    // ====================== // 
    let nombreJugador = "Jugador desconocido"; 
    let estado = "OFFLINE";
    let tiempoSesion = "0:00";
    let nombreServidor = "Servidor Rust";

    try { 
      // Llamamos a tu servicio nativo que no tiene errores de URL
      const data = await getBattleMetricsHours(playerId); 
      
      if(data?.nombre) { 
        nombreJugador = data.nombre; 
      }
      if(data?.tiempoSesion) {
        tiempoSesion = data.tiempoSesion;
      }
      if(data?.online) {
        estado = "ONLINE";
      }
      if(data?.servidorNombre) {
        nombreServidor = data.servidorNombre;
      }
    } catch(error) { 
      console.log("ERROR USANDO TU SERVICIO NATIVO:", error.message); 
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
        { name: "📡 Servidor", value: `||${nombreServidor}||` }, // Spoiler activado
        { name: "⌛ Tracker restante", value: "23h 59m" } 
      ) 
      .setTimestamp(); 

    // Enviamos el recuadro limpio e instantáneo al canal
    await interaction.editReply({ embeds: [embed] }); 
  } 
};
