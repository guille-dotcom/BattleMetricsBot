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
    await interaction.deferReply(); 
    let inputId = interaction.options.getString("id"); 

    // Extractor inteligente de IDs del jugador
    const coincidenciaLink = inputId.match(/players\/(\d+)/);
    const playerId = coincidenciaLink ? coincidenciaLink[1] : inputId.replace(/\D/g, "");

    if (!playerId) {
      return interaction.editReply("❌ La ID o el enlace de BattleMetrics que proporcionaste no es válido.");
    }

    // FORZADO MANUAL SEGURO: Inyectamos directamente la ID de tu servidor de Rustafied
    const serverId = "433255"; 
    console.log(`📡 Conectando comando tracker de forma directa al Servidor ID: ${serverId}`);

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

    // Consulta externa directa
    let nombreJugador = "Jugador desconocido"; 
    let estado = "OFFLINE";
    let tiempoSesion = "0:00";
    let nombreServidor = "Servidor Rust";

    const apiToken = process.env.BATTLEMETRICS_TOKEN || process.env.TOKEN;
    const headers = { Authorization: `Bearer ${apiToken}`, Accept: "application/json" };

    try { 
      // La URL ahora se armará de forma perfecta usando el número fijo 433255
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

      const resPlayer = await axios.get(`https://battlemetrics.com{playerId}`, { headers });
      if(resPlayer.data?.data?.attributes?.name) {
        nombreJugador = resPlayer.data.data.attributes.name;
      }

      if(resBM.data?.data?.attributes?.name) {
        nombreServidor = resBM.data.data.attributes.name;
      }
    } catch(error) { 
      console.log("❌ FALLO CONSULTA API EN COMANDO:", error.message); 
    } 

    // Guardar en la base de datos
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

    // Renderizar Embed público unificado
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
