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
    console.log("ERROR LEYENDO TRACKERS:", error.message); 
    return []; 
  } 
} 

function guardarTrackers(trackers){ 
  try{ 
    fs.writeFileSync(trackersFile, JSON.stringify(trackers, null, 2)); 
    console.log("💾 Trackers guardados"); 
  }catch(error){ 
    console.log("ERROR GUARDANDO TRACKERS:", error.message); 
  } 
} 

async function obtenerServidor(serverId){ 
  try { 
    // ESCUDO: Si el serverId viene roto por error del JSON viejo, usamos tu ID de Rustafied fija
    let idSana = serverId;
    if(!idSana || String(idSana).includes("{") || String(idSana).includes("server") || String(idSana).trim() === "") {
      idSana = "433255";
    }
    const response = await axios.get(`https://battlemetrics.com{idSana}`, bmHeaders()); 
    return { nombre: response.data.data.attributes.name }; 
  } catch(error) { 
    return { nombre: "Servidor Rust" }; 
  } 
} 

async function obtenerJugadorServidor(serverId, playerId, intentos = 2){ 
  try { 
    // ESCUDO: Forzar ID sana para evitar direcciones web rotas en la API
    let idSana = serverId;
    if(!idSana || String(idSana).includes("{") || String(idSana).includes("server") || String(idSana).trim() === "") {
      idSana = "433255";
    }

    console.log(`🔑 Consultando jugador y sesiones BM... (Intentos restantes: ${intentos})`); 
    
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
      console.log("⚠️ Jugador no está en una sesión activa en este servidor"); 
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
      console.log("⚠ BattleMetrics saturado. Reintentando en 2 segundos...");
      await new Promise(resolve => setTimeout(resolve, 2000));
      return await obtenerJugadorServidor(serverId, playerId, intentos - 1);
    }
    console.log("❌ ERROR FINAL EN SEGUNDO PLANO:", error.message); 
    return { online: null, playtime: "0:00" }; 
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
    if(!tracker.serverId || tracker.serverId === "{serverId}" || tracker.playerName === "Jugador desconocido") {
      console.log(`🗑️ Eliminando registro antiguo dañado de: ${tracker.playerName}`);
      continue;
    }

    console.log(`🔎 Revisando ${tracker.playerName}`); 
    const jugador = await obtenerJugadorServidor(tracker.serverId, tracker.playerId); 
    
    if (jugador.online === null) {
      console.log(`⏩ Saltando revisión de ${tracker.playerName} por error de red provisional.`);
      continue;
    }

    const estado = jugador.online ? "ONLINE" : "OFFLINE"; 
    console.log(`${tracker.playerName}: ${estado}`); 

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
          .setDescription(`👤 **${tracker.playerName}**`) 
          .addFields( 
            { name: "Estado", value: estado === "ONLINE" ? "🟢 ONLINE" : "🔴 OFFLINE" }, 
            { name: "⏱️ Play Time (Sesión)", value: jugador.playtime }, 
            { name: "📡 Servidor", value: `||${servidor.nombre}||` }, 
            { name: "⌛ Tracker restante", value: tiempoRestante(tracker.expiresAt) } 
          ) 
          .setTimestamp(); 

        await canal.send({ embeds:[embed] }); 
        console.log(`📢 Cambio enviado ${tracker.playerName}`); 
      } catch(error) { 
        console.log("❌ ERROR ENVIANDO TRACKER:", error.message); 
      } 
    } 
    tracker.lastState = estado; 
  } 
  
  const trackersSanos = trackers.filter(tracker => tracker.serverId && tracker.serverId !== "{serverId}" && tracker.playerName !== "Jugador desconocido");
  guardarTrackers(trackersSanos); 
} 

module.exports = { revisarTrackers };
