require("dotenv").config(); 
const { Client, GatewayIntentBits, Collection, REST, Routes } = require("discord.js"); 
const fs = require("fs"); 
const path = require("path"); 
const http = require("http"); 

// ====================== // 
// PUERTO PARA RENDER (FORZADO LIGHTWEIGHT) // 
// ====================== // 
const PORT = process.env.PORT || 3000; 
const server = http.createServer((req, res) => { 
  // Evita almacenar datos en búfer si Cron-Job envía encabezados extra
  req.on('data', () => {}); 
  req.on('end', () => {});
  
  // Forzamos el cierre inmediato de la conexión enviando solo un texto plano diminuto
  res.writeHead(200, { 
    "Content-Type": "text/plain",
    "Connection": "close"
  }); 
  return res.end("OK"); 
}); 

server.listen(PORT, "0.0.0.0", () => { 
  console.log(`🌐 Servidor web activo en puerto ${PORT}`); 
}); 

// ====================== // 
// CLIENTE DISCORD // 
// ====================== // 
const client = new Client({ intents: [GatewayIntentBits.Guilds] }); 
client.commands = new Collection(); 

// ====================== // 
// CARGAR COMANDOS // 
// ====================== // 
const commandsPath = path.join(__dirname, "commands"); 
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js")); 
const commands = []; 

for (const file of commandFiles) { 
  try { 
    const command = require(`./commands/${file}`); 
    client.commands.set(command.data.name, command); 
    commands.push(command.data.toJSON()); 
    console.log(`✅ Comando cargado: ${command.data.name}`); 
  } catch (error) { 
    console.log(`❌ Error cargando comando ${file}:`, error.message); 
  } 
} 

// ====================== // 
// FUNCIÓN REGISTRAR COMANDOS // 
// ====================== // 
async function registrarComandos(guild) { 
  try { 
    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN); 
    await rest.put( 
      Routes.applicationGuildCommands(client.user.id, guild.id), 
      { body: commands } 
    ); 
    console.log(`✅ Comandos registrados en: ${guild.name}`); 
  } catch (error) { 
    console.log(`❌ Error registrando comandos en ${guild.name}:`, error.message); 
  } 
} 

// ====================== // 
// BOT CONECTADO (CORREGIDO PARA DISCORD.JS V15) // 
// ====================== // 
client.once("clientReady", async () => { 
  console.log(`✅ Bot conectado como ${client.user.tag}`); 
  try { 
    await client.user.setPresence({ status: "online", activities: [{ name: "BattleMetrics", type: 0 }] }); 
    console.log("🟢 Estado ONLINE establecido"); 
  } catch (error) { 
    console.log("⚠️ Error estableciendo presencia:", error.message); 
  } 
  console.log("🔄 Registrando comandos en servidores..."); 
  for (const guild of client.guilds.cache.values()) { 
    await registrarComandos(guild); 
  } 
  console.log("✅ Registro de comandos finalizado"); 
}); 

// ====================== // 
// NUEVOS SERVIDORES // 
// ====================== // 
client.on("guildCreate", async (guild) => { 
  console.log(`📥 Nuevo servidor: ${guild.name}`); 
  await registrarComandos(guild); 
}); 

// ====================== // 
// INTERACCIONES DISCORD // 
// ====================== // 
client.on("interactionCreate", async interaction => { 
  if (!interaction.isChatInputCommand()) return; 
  const command = client.commands.get(interaction.commandName); 
  if (!command) return; 
  try { 
    await command.execute(interaction); 
  } catch (error) { 
    console.log("ERROR EJECUTANDO COMANDO:", error); 
    try { 
      if (interaction.deferred || interaction.replied) { 
        await interaction.editReply({ content: "❌ Error ejecutando comando" }); 
      } else { 
        await interaction.reply({ content: "❌ Error ejecutando comando", ephemeral: true }); 
      } 
    } catch (err) { 
      console.log("ERROR RESPONDIENDO DISCORD:", err.message); 
    } 
  } 
}); 

// ====================== // 
// ERRORES DEL CLIENTE // 
// ====================== // 
client.on("error", (error) => { console.error("❌ Error del cliente Discord:", error); }); 
client.on("warn", (info) => { console.warn("⚠️ Advertencia:", info); }); 

// ====================== // 
// CONEXIÓN Y RECONEXIÓN DISCORD // 
// ====================== // 
client.on("disconnect", () => { console.log("⚠️ Bot desconectado de Discord"); }); 
client.on("reconnecting", () => { console.log("🔄 Intentando reconectar con Discord..."); }); 
client.on("resume", (replayed) => { console.log(`🟢 Conexión Discord recuperada. Eventos: ${replayed}`); }); 
client.on("shardDisconnect", (event, shardId) => { console.log(`⚠️ Shard ${shardId} desconectado. Código: ${event.code}`); }); 
client.on("shardReconnecting", (shardId) => { console.log(`🔄 Shard ${shardId} intentando reconectar`); }); 
client.on("shardResume", (shardId, replayedEvents) => { console.log(`🟢 Shard ${shardId} reconectado. Eventos: ${replayedEvents}`); }); 

// ====================== // 
// ERRORES DEL PROCESO // 
// ====================== // 
process.on("unhandledRejection", (reason) => { console.error("❌ Unhandled Promise Rejection:", reason); }); 
process.on("uncaughtException", (error) => { console.error("❌ Uncaught Exception:", error); }); 

// ====================== // 
// LOGIN // 
// ====================== // 
client.login(process.env.TOKEN);
