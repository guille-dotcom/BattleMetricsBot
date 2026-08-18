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

// ====================== // 
// CONEXIÓN A MONGODB     // 
// ====================== // 
const connectDB = require("./utils/database");

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
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences
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
            const Tracker = require("./models/TrackerSchema");

            try {
                const trackerEliminado = await Tracker.findByIdAndDelete(id);

                if (!trackerEliminado) {
                    return interaction.reply({
                        content: "❌ Ese tracker ya no existe o ya fue eliminado.",
                        ephemeral: true
                    });
                }

                return interaction.update({
                    content: `🗑️ Tracker eliminado: **${trackerEliminado.nombre || id}**`,
                    embeds: [],
                    components: []
                });
            } catch (error) {
                console.error("Error al eliminar tracker por botón:", error);
                return interaction.reply({
                    content: "❌ Ocurrió un error al intentar eliminar el tracker.",
                    ephemeral: true
                });
            }
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try { 
        const executionPromise = command.execute(interaction);
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("TIME_OUT_COMANDO")), 30000)
        );

        await Promise.race([executionPromise, timeoutPromise]);
    } catch(error) { 
        console.log("ERROR EJECUTANDO COMANDO:", error); 

        try { 
            const errorMsg = "❌ El comando tardó demasiado en responder o hubo un error interno.";
            if (interaction.deferred || interaction.replied) { 
                await interaction.editReply({ content: errorMsg }); 
            } else { 
                await interaction.reply({ content: errorMsg, ephemeral: true }); 
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

connectDB(); 

client.login(process.env.TOKEN)
    .catch(error => {
        console.error("❌ ERROR CRÍTICO AL INICIAR SESIÓN EN DISCORD:", error);
    });