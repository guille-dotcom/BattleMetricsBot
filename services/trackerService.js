const fs = require("fs"); 
const path = require("path"); 
const axios = require("axios"); 
const { EmbedBuilder } = require("discord.js"); 
const trackersFile = path.join(__dirname, "..", "data", "trackers.json"); 

function bmHeaders(){ 
  return { 
    headers:{ 
      Authorization: `Bearer ${process.env.BATTLEMETRICS_TOKEN || process.env.TOKEN}`, 
      Accept: "application/json" 
    } 
  }; 
} 

function leerTrackers(){ 
  try{ 
    if(!fs.existsSync(trackersFile)) return []; 
    return JSON.parse(fs.readFileSync(trackersFile, "utf8")); 
  }catch(error){ 
    return []; 
  } 
} 

function guardarTrackers(trackers){ 
  try{ fs.writeFileSync(trackersFile, JSON.stringify(trackers, null, 2)); }catch(error){} 
} 

async function obtenerServidor(serverId){ 
  try { 
    const idSana = String(serverId).trim();
    const response = await axios.get(`https://battlemetrics.com{idSana}`, bmHeaders()); 
    return { nombre: response.data.data.attributes.name }; 
  } catch(error) { 
    return { nombre: "Servidor Rust" }; 
  } 
} 

// ======================================================================= //
// 🔑 MEJORA: CONSULTA DIRECTA AL PERFIL DEL JUGADOR (NUNCA SE RECORTA)    //
// ======================================================================= //
async function obtenerJugadorServidor(serverId, playerId, intentos = 2){ 
  try { 
    const targetServerId = String(serverId).trim();
    const targetPlayerId = String(playerId).trim();

    // Consultamos directo al perfil del jugador incluyendo sus servidores activos y sesiones
    const response = await axios.get(
      `https://battlemetrics.com{targetPlayerId}`, 
      { 
        ...bmHeaders(), 
        params: { include: "server,session" } 
      } 
    ); 

    const dataPlayer = response.data.data;
    const incluidos = response.data.included || []; 
    
    // Extraemos el nombre real del perfil de inmediato para guardarlo
    const nombreRealPerfil = dataPlayer?.attributes?.name || `Jugador (${targetPlayerId})`;

    // Buscamos la sesión que pertenezca a NUESTRO servidor configurado y esté activa (stop === null)
    const sesionActiva = incluidos.find(s => 
      s.type === "session" && 
      String(s.relationships?.server?.data?.id) === targetServerId &&
      s.attributes?.stop === null 
    ); 

    if (!sesionActiva) {
      return { online: false, playtime: "0:00", nombreReal: nombreRealPerfil }; 
    }

    // Calcular Play Time de la sesión activa
    const horaConexion = new Date(sesionActiva.attributes.start); 
    const diferenciaMs = new Date() - horaConexion; 
    const horas = Math.floor(diferenciaMs / (1000 * 60 * 60)); 
    const minutos = Math.floor((diferenciaMs % (1000 * 60 * 60)) / (1000 * 60)); 
    const tiempoFormateado = `${horas}:${minutos.toString().padStart(2, '0')}`;

    return { online: true, playtime: tiempoFormateado, nombreReal: nombreRealPerfil }; 
  } catch(error) { 
    if (intentos > 0) { 
      await new Promise(resolve => setTimeout(resolve, 2000)); 
      return await obtenerJugadorServidor(serverId, playerId, intentos - 1); 
    } 
    return { online: null, playtime: "0:00", nombreReal: `Jugador (${playerId})` }; 
  } 
} 

function tiempoRestante(expira){ 
  const diferencia = expira - Date.now(); 
  if(diferencia <= 0) return "Expirado"; 
  const horas = Math.floor(diferencia / 3600000); 
  const minutos = Math.floor((diferencia % 3600000) / 60000); 
  return `${horas}h ${minutos}m`; 
} 

async function revisarTrackers(client){ 
  let trackers = leerTrackers(); 
  trackers = trackers.filter(tracker => tracker.expiresAt > Date.now()); 

  for(const tracker of trackers){ 
    const jugador = await obtenerJugadorServidor(tracker.serverId, tracker.playerId); 
    if (jugador.online === null) continue; 

    // Actualizamos el nombre real en la base de datos si cambió
    if (jugador.nombreReal && tracker.playerName !== jugador.nombreReal) {
      tracker.playerName = jugador.nombreReal;
    }

    const estado = jugador.online ? "ONLINE" : "OFFLINE"; 

    if(tracker.lastState !== estado){ 
      const servidor = await obtenerServidor(tracker.serverId); 
      try { 
        const guild = client.guilds.cache.get(tracker.guildId); 
        if(!guild) continue; 
        const canal = guild.channels.cache.get(tracker.channelId); 
        if(!canal) continue; 

        const embed = new EmbedBuilder() 
          .setTitle("🎮 Tracker BattleMetrics") 
          .setColor(estado === "ONLINE" ? "#57F287" : "#ED4245") 
          .setDescription(`👤 **${jugador.nombreReal || tracker.playerName}**`) 
          .addFields( 
            { name: "Estado", value: estado === "ONLINE" ? "🟢 ONLINE" : "🔴 OFFLINE" }, 
            { name: "⏱️ Play Time (Sesión)", value: jugador.playtime }, 
            { name: "📡 Servidor", value: `||${servidor.nombre}||` }, 
            { name: "⌛ Tracker restante", value: tiempoRestante(tracker.expiresAt) } 
          ) 
          .setTimestamp(); 

        await canal.send({ embeds:[embed] }); 
      } catch(error) {} 
    } 
    tracker.lastState = estado; 
  } 
  guardarTrackers(trackers); 
} 

module.exports = { revisarTrackers, obtenerJugadorServidor, obtenerServidor };
