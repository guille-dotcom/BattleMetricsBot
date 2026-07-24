require("dotenv").config(); 
const { SlashCommandBuilder } = require("discord.js"); 
const fs = require("fs"); 
const path = require("path"); 

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
    // Hacemos que la confirmación inicial sea rápida
    await interaction.deferReply(); 
    let inputId = interaction.options.getString("id"); 

    // Extractor inteligente de la ID del jugador
    const coincidenciaLink = inputId.match(/players\/(\d+)/);
    const playerId = coincidenciaLink ? coincidenciaLink[1] : inputId.replace(/\D/g, "");

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

    // Guardar en la base de datos local
    const ahora = Date.now(); 
    const expira = ahora + (24 * 60 * 60 * 1000); 

    const nuevoTracker = { 
      guildId: guildId, 
      channelId: String(interaction.channel.id), 
      serverId: serverId, 
      playerId: playerId, 
      playerName: `Jugador (${playerId})`, // El bucle automático actualizará el nombre real en segundos
      lastState: "UNKNOWN", // Forzamos UNKNOWN para que el bucle dispare la primera alerta real al instante
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

    // Mensaje simple de confirmación para evitar el doble recuadro
    await interaction.editReply({ 
      content: `✅ **Seguimiento iniciado con éxito**\n` + 
               `🆔 BattleMetrics ID: \`${playerId}\`\n` + 
               `📋 El bot comenzará a enviar las alertas de estado en este canal de inmediato.`
    }); 
  } 
};
