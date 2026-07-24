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
      .setDescription("Enlace o ID del jugador BattleMetrics") 
      .setRequired(true) 
    ), 

  async execute(interaction) { 
    // Hacemos la respuesta pública para todo el chat
    await interaction.deferReply(); 
    let inputId = interaction.options.getString("id"); 

    // Extractor inteligente de la ID del jugador
    const coincidenciaLink = inputId.match(/players\/(\d+)/);
    const playerId = coincidenciaLink ? coincidenciaLink : inputId.replace(/\D/g, "");

    if (!playerId) {
      return interaction.editReply("❌ La ID o el enlace de BattleMetrics que proporcionaste no es válido.");
    }

    const serverId = "433255"; 

    // Leer trackers activos
    let trackers = []; 
    try { 
      if(fs.existsSync(file)) { 
        trackers = JSON.parse(fs.readFileSync(file, "utf8")); 
      } 
    } catch(error) { 
      console.log("ERROR LEYENDO TRACKERS:", error.message); 
    } 

    if(!Array.isArray(trackers)) trackers = []; 

    // Límite de trackers
    const guildId = String(interaction.guild.id);
    const activosServidor = trackers.filter(t => String(t.guildId) === guildId); 
    if(activosServidor.length >= 20) { 
      return interaction.editReply("❌ Este servidor ya tiene el límite de 20 jugadores en seguimiento."); 
    } 

    // Duplicados
    const existe = trackers.find(t => String(t.guildId) === guildId && String(t.playerId) === playerId); 
    if(existe) { 
      return interaction.editReply("⚠️ Este jugador ya está siendo monitoreado."); 
    } 

    // Variables por defecto si falla la API
    let nombreJugador = `Jugador (${playerId})`; 
    let estado = "OFFLINE";
    let tiempoSesion = "0:00";
    let nombreServidor = "Servidor Rustafied";

    const apiToken = process.env.BATTLEMETRICS_TOKEN || process.env.TOKEN;
    const headers = { Authorization: `Bearer ${apiToken}`, Accept: "application/json" };

    // CONSULTA INMEDIATA Y SEGURA AL INSTANTE
    try { 
      // 1. Consultar el perfil del jugador primero para asegurar el nombre real pase lo que pase
      try {
        const resPlayer = await axios.get(`https://battlemetrics.com{playerId}`, { headers });
        if(resPlayer.data?.data?.attributes?.name) {
          nombreJugador = resPlayer.data.data.attributes.name;
        }
      } catch (e) {
        console.log("Error consultando nombre del jugador en comando:", e.message);
      }

      // 2. Consultar el servidor e incluir las sesiones para calcular el tiempo
      const resBM = await axios.get("https://battlemetrics.com", { 
        headers, 
        params: { include: "session" } 
      }); 

      const incluidos = resBM.data.included || []; 
      
      const sesionActiva = incluidos.find(s => 
        s.type === "session" && 
        s.relationships?.player?.data?.id === String(playerId) && 
        s.attributes?.stop === null 
      );

      if (sesionActiva && sesionActiva.attributes?.start) { 
        estado = "ONLINE";
        const horaConexion = new Date(sesionActiva.attributes.start); 
        const diferenciaMs = new Date() - horaConexion; 
        const horas = Math.floor(diferenciaMs / (1000 * 60 * 60));
        const minutos = Math.floor((diferenciaMs % (1000 * 60 * 60)) / (1000 * 60));
        tiempoSesion = `${horas}:${minutos.toString().padStart(2, '0')}`;
      }

      if(resBM.data?.data?.attributes?.name) {
        nombreServidor = resBM.data.data.attributes.name;
      }
    } catch(error) { 
      console.log("❌ FALLO DE API CONTROLADO EN ENTRADA:", error.message); 
    } 

    // Guardar en la base de datos local (con el estado actual real para que el servicio de fondo no duplique)
    const ahora = Date.now(); 
    const expira = ahora + (24 * 60 * 60 * 1000); 

    const nuevoTracker = { 
      guildId: guildId, 
      channelId: String(interaction.channel.id), 
      serverId: serverId, 
      playerId: playerId, 
      playerName: nombreJugador, 
      lastState: estado, // Al guardar ONLINE u OFFLINE real, el fondo no enviará nada hasta que cambie
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

    // Renderizar un ÚNICO Embed público con todo resuelto
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

    // Enviamos solo el recuadro limpio, eliminando textos de confirmación extra de arriba
    await interaction.editReply({ embeds: [embed] }); 
  } 
};
