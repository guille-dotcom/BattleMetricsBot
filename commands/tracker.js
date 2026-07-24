const { SlashCommandBuilder, EmbedBuilder } = require("discord.js"); 
const fs = require("fs"); 
const path = require("path"); 
const { obtenerJugadorServidor, obtenerServidor } = require("../services/trackerService"); 

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

    const coincidenciaLink = inputId.match(/players\/(\d+)/);
    const playerId = coincidenciaLink ? coincidenciaLink : inputId.replace(/\D/g, "");

    if (!playerId || playerId.trim() === "") {
      return interaction.editReply("❌ La ID o el enlace de BattleMetrics que proporcionaste no es válido.");
    }

    const serverId = "433255"; 
    const guildId = String(interaction.guild.id); 

    let trackers = []; 
    try { 
      if(fs.existsSync(file)) { 
        trackers = JSON.parse(fs.readFileSync(file, "utf8")); 
      } 
    } catch(error) { 
      console.log("ERROR LEYENDO TRACKERS:", error.message); 
    } 

    if(!Array.isArray(trackers)) trackers = []; 

    const activosServidor = trackers.filter(t => String(t.guildId) === guildId); 
    if(activosServidor.length >= 20) { 
      return interaction.editReply("❌ Este servidor ya tiene el límite de 20 jugadores en seguimiento."); 
    } 

    const existe = trackers.find(t => String(t.guildId) === guildId && String(t.playerId) === playerId); 
    if(existe) { 
      return interaction.editReply("⚠️ Este jugador ya está siendo monitoreado."); 
    } 

    let nombreJugador = `Jugador (${playerId})`; 
    let estado = "OFFLINE";
    let tiempoSesion = "0:00";
    let nombreServidor = "Servidor Rustafied";

    try { 
      const jugadorData = await obtenerJugadorServidor(serverId, playerId); 
      const servidorData = await obtenerServidor(serverId);

      if (jugadorData && jugadorData.online) {
        estado = "ONLINE";
        tiempoSesion = jugadorData.playtime; 
      }
      
      if (servidorData && servidorData.nombre) {
        nombreServidor = servidorData.nombre;
      }
    } catch(error) { 
      console.log("❌ ERROR EN RUTA DEL COMANDO INTERNO:", error.message); 
    } 

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

    await interaction.editReply({ embeds: [embed] }); 
  } 
};
