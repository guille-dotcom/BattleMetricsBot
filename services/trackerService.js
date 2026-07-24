const fs = require("fs"); 
const path = require("path"); 
const axios = require("axios"); 
const { EmbedBuilder } = require("discord.js"); 
const trackersFile = path.join(__dirname, "..", "data", "trackers.json"); 

// ====================== // 
// HEADERS BM // 
// ====================== // 
function bmHeaders(){ 
  return { 
    headers:{ 
      Authorization: `Bearer ${process.env.BATTLEMETRICS_TOKEN || process.env.TOKEN}`, 
      Accept: "application/json" 
    } 
  }; 
} 

// ====================== // 
// LEER TRACKERS // 
// ====================== // 
function leerTrackers(){ 
  try{ 
    if(!fs.existsSync(trackersFile)) return []; 
    return JSON.parse(fs.readFileSync(trackersFile, "utf8")); 
  }catch(error){ 
    console.log("ERROR LEYENDO TRACKERS:", error.message); 
    return []; 
  } 
} 

// ====================== // 
// GUARDAR TRACKERS // 
// ====================== // 
function guardarTrackers(trackers){ 
  try{ 
    fs.writeFileSync(trackersFile, JSON.stringify(trackers, null, 2)); 
    console.log("💾 Trackers guardados"); 
  }catch(error){ 
    console.log("ERROR GUARDANDO TRACKERS:", error.message); 
  } 
} 

// ====================== // 
// OBTENER SERVIDOR // 
// ====================== // 
async function obtenerServidor(serverId){ 
  try { 
    const idSana = "433255";
    const response = await axios.get(`https://battlemetrics.com{idSana}`, bmHeaders()); 
    return { nombre: response.data.data.attributes.name }; 
  } catch(error) { 
    return { nombre: "Servidor Rust" }; 
  } 
} 

// ====================== // 
// JUGADORES ONLINE + SESIÓN // 
// ====================== // 
async function obtenerJugadorServidor(serverId, playerId, intentos = 2){ 
  try { 
    const idSana = "433255";
    
    const response = await axios.get(
      `https://battlemetrics.com{idSana}`, 
      { 
        ...bmHeaders(), 
        params: { include: "session" } 
      } 
    ); 

    const incluidos = response.data.included || []; 
    
    const sesionActiva = incluidos.find(s => 
      s.type === "session" && 
      s.relationships?.player?.data?.id === String(playerId) && 
      s.attributes?.stop === null 
    );

    if (!sesionActiva) { 
      return { online: false, playtime: "0:00" }; 
    } 

    const horaConexion = new Date(sesionActiva.attributes.start);
    const horaActual = new Date();
    const diferenciaMs = horaActual - horaConexion;

    const horas = Math.floor(diferenciaMs / (1000 * 60 * 60));
    const minutos = Math.floor((diferenciaMs % (1000 * 60 * 60)) / (1000 * 60));
    const tiempoFormateado = `${horas}:${minutos.toString().padStart(2, '0')}`;

    return { online: true, playtime: tiempoFormateado }; 
  } catch(error) { 
    if (intentos > 0) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return await obtenerJugadorServidor(serverId, playerId, intentos - 1);
    }
    return { online: null, playtime: "0:00" }; 
  } 
} 

// ====================== // 
// TIEMPO RESTANTE // 
// ====================== // 
function tiempoRestante(expira){ 
  const diferencia = expira - Date.now(); 
  if(diferencia <= 0) return "Expirado"; 
  const horas = Math.floor(diferencia / 3600000); 
  const minutos = Math.floor((diferencia % 3600000) / 60000); 
  return `${horas}h ${minutos}m`; 
} 

// ====================== // 
// REVISAR TRACKERS AUTO // 
// ====================== // 
async function revisarTrackers(client){ 
  let trackers = leerTrackers(); 
  trackers = trackers.filter(tracker => tracker.expiresAt > Date.now()); 

  for(const tracker of trackers){ 
    console.log(`🔎 Revisando ${tracker.playerName}`); 
    const jugador = await obtenerJugadorServidor(tracker.serverId, tracker.playerId); 
    
    if (jugador.online === null) continue;

    const estado = jugador.online ? "ONLINE" : "OFFLINE"; 

    if(tracker.lastState !== estado){ 
      let nombreReal = tracker.playerName;

      // CLAVE DE LA SOLUCIÓN: Si el nombre está genérico como "Jugador (ID)", consultamos rápido el nombre real en BattleMetrics
      if (!nombreReal || nombreReal.includes("Jugador (")) {
        try {
          const resPlayer = await axios.get(`https://battlemetrics.com{tracker.playerId}`, bmHeaders());
          if (resPlayer.data?.data?.attributes?.name) {
            nombreReal = resPlayer.data.data.attributes.name;
            tracker.playerName = nombreReal; // Lo actualizamos en la base de datos para las siguientes alertas
          }
        } catch (err) {
          console.log("Error extrayendo nombre real de fondo:", err.message);
        }
      }

      const servidor = await obtenerServidor(tracker.serverId); 
      try { 
        const guild = client.guilds.cache.get(tracker.guildId); if(!guild) continue; 
        const canal = guild.channels.cache.get(tracker.channelId); if(!canal) continue; 

        const embed = new EmbedBuilder() 
          .setTitle("🎮 Tracker BattleMetrics") 
          .setColor(estado === "ONLINE" ? "#57F287" : "#ED4245") 
          .setDescription(`👤 **${nombreReal}**`) // <-- Aquí se pinta el nombre real (Ej: HankTheTank)
          .addFields( 
            { name: "Estado", value: estado === "ONLINE" ? "🟢 ONLINE" : "🔴 OFFLINE" }, 
            { name: "⏱️ Play Time (Sesión)", value: jugador.playtime }, 
            { name: "📡 Servidor", value: `||${servidor.nombre}||` }, 
            { name: "⌛ Tracker restante", value: tiempoRestante(tracker.expiresAt) } 
          ) 
          .setTimestamp(); 

        await canal.send({ embeds:[embed] }); 
        console.log(`📢 Cambio enviado ${nombreReal}`); 
      } catch(error) { 
        console.log("❌ ERROR ENVIANDO TRACKER:", error.message); 
      } 
    } 
    tracker.lastState = estado; 
  } 
  guardarTrackers(trackers); 
} 

module.exports = { revisarTrackers };
