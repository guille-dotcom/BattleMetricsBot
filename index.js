require("dotenv").config(); 

const { 
    Client, 
    GatewayIntentBits, 
    Collection, 
    REST, 
    Routes 
} = require("discord.js"); 

const fs = require("fs"); 
const path = require("path"); 
const http = require("http"); 

const { 
    revisarTrackers 
} = require("./services/trackerService"); 



// ====================== // 
// PUERTO PARA RENDER     // 
// ====================== // 

const PORT = process.env.PORT || 3000; 

const server = http.createServer((req, res) => { 
    res.writeHead(200, { 
        "Content-Type": "text/plain", 
        "Content-Length": "2",
        "Connection": "close" 
    }); 
    res.end("OK"); 
}); 

server.listen(PORT, "0.0.0.0", () => { 
    console.log(`🌐 Servidor web activo en puerto ${PORT}`); 
}); 



// ====================== // 
// CLIENTE DISCORD        // 
// ====================== // 

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds
    ] 
}); 

client.commands = new Collection(); 



// ====================== // 
// CARGAR Y REGISTRAR     // 
// ====================== // 

const commandsPath = path.join(__dirname, "commands"); 
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));

const commandsArray = []; 

for (const file of commandFiles) { 
    try { 
        const command = require(`./commands/${file}`); 
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command); 
            commandsArray.push(command.data.toJSON()); 
            console.log(`✅ Comando cargado: ${command.data.name}`); 
        } else {
            console.log(`⚠️ El comando en ${file} le falta la propiedad 'data' o 'execute'.`);
        }
    } catch(error) { 
        console.log(`❌ Error cargando comando ${file}:`, error.message); 
    } 
} 



// ====================== // 
// BOT READY              // 
// ====================== // 

client.once("ready", async () => { 
    console.log(`✅ Bot conectado como ${client.user.tag}`); 

    try {
        const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
        
        console.log('🔄 Sincronizando comandos globalmente...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commandsArray },
        );

        console.log('✨ ¡Comandos sincronizados sin duplicados!');
    } catch (error) {
        console.error('❌ Error al registrar comandos:', error);
    }

    try { 
        await client.user.setPresence({ 
            status: "online", 
            activities: [
                {
                    name: "chivando siempre 👀",
                    type: 0
                }
            ]
        }); 
        console.log("🟢 Estado ONLINE establecido"); 
    } catch(error) { 
        console.log("⚠️ Error presencia:", error.message); 
    } 

    // ====================== //
    // TRACKER AUTOMÁTICO     //
    // ====================== //
    console.log("🔎 Tracker iniciado cada 30 segundos"); 
    let trackerRevisando = false; 

    try { 
        await revisarTrackers(client); 
    } catch(error) { 
        console.log("❌ Error revisión inicial tracker:", error.message); 
    } 

    setInterval(async () => { 
        if (trackerRevisando) { 
            console.log("⏳ Tracker anterior todavía ejecutándose..."); 
            return; 
        } 

        trackerRevisando = true; 

        try { 
            await revisarTrackers(client); 
        } catch(error) { 
            console.log("❌ Error tracker automático:", error.message); 
        } finally { 
            trackerRevisando = false; 
        } 
    }, 30 * 1000); 
}); 



// ====================== // 
// NUEVOS SERVIDORES      // 
// ====================== // 

client.on("guildCreate", async (guild) => { 
    console.log(`📥 Nuevo servidor: ${guild.name}`); 

    try {
        const canal = guild.channels.cache.find(
            channel => channel.isTextBased() && channel.permissionsFor(guild.members.me)?.has("SendMessages")
        );

        if (canal) {
            await canal.send({
                embeds: [
                    {
                        title: "🎯 Bienvenido a RustLogix",
                        description: `Gracias por agregar RustLogix 🤖\n\n⚙️ **Primer paso obligatorio**\n\nEjecuta:\n\n⚙️ \`/configurar-servidor\`\n\npara configurar el servidor de Rust que utilizará el bot.\n\n\nDespués podrás usar:\n\n🖥️ **Comandos del servidor**\n⏱️ \`/horas\`\n🏆 \`/ranking\`\n\n\n🎯 **Sistema Tracker**\n🎮 \`/tracker\`\n📋 \`/trackers-activos\`\n\n\n🔎 **Consultas BattleMetrics**\n🔎 \`/horasbm\`\n\n\n📚 Usa:\n\n\`/help\`\n\npara ver todos los comandos disponibles.`,
                        color: 0x3498DB,
                        footer: { text: "RustLogix" },
                        timestamp: new Date()
                    }
                ]
            });
        }
    } catch(error) {
        console.log("❌ Error enviando bienvenida:", error.message);
    }
});



// ====================== // 
// INTERACCIONES          // 
// ====================== // 

client.on("interactionCreate", async interaction => {

    if (interaction.isButton()) {
        if (interaction.customId.startsWith("eliminar_tracker_")) {
            const id = interaction.customId.replace("eliminar_tracker_", "");
            const { leerTrackers, guardarTrackers } = require("./services/trackerService");
            const trackers = leerTrackers();

            if (!trackers[id]) {
                return interaction.reply({
                    content: "❌ Ese tracker ya no existe.",
                    ephemeral: true
                });
            }

            const nombre = trackers[id].nombre || id;
            delete trackers[id];
            guardarTrackers(trackers);

            return interaction.update({
                content: `🗑️ Tracker eliminado: **${nombre}**`,
                embeds: [],
                components: []
            });
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try { 
        await command.execute(interaction); 
    } catch(error) { 
        console.log("ERROR EJECUTANDO COMANDO:", error); 

        try { 
            if (interaction.deferred || interaction.replied) { 
                await interaction.editReply({ content: "❌ Error ejecutando comando" }); 
            } else { 
                await interaction.reply({ content: "❌ Error ejecutando comando", ephemeral: true }); 
            } 
        } catch(err) { 
            console.log("ERROR RESPONDIENDO DISCORD:", err.message); 
        } 
    } 
}); 



// ====================== // 
// ERRORES                // 
// ====================== // 

client.on("error", error => { 
    console.error("❌ Error Discord:", error); 
}); 

process.on("unhandledRejection", (reason) => { 
    console.error("❌ Unhandled Promise:", reason); 
}); 

process.on("uncaughtException", (error) => { 
    console.error("❌ Uncaught Exception:", error); 
}); 



// ====================== // 
// LOGIN                  // 
// ====================== // 

client.login(process.env.TOKEN);