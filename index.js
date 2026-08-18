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

// ======================
// CONEXIÓN A MONGODB
// ======================
const connectDB = require("./utils/database");

const {
    revisarTrackers
} = require("./services/trackerService");

// ======================
// PUERTO PARA RENDER
// ======================
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

// ======================
// CLIENTE DISCORD
// ======================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences
    ]
});

// ======================
// DIAGNÓSTICO DISCORD
// ======================

client.on("debug", info => {
    console.log("🔧 DISCORD DEBUG:", info);
});

client.on("warn", info => {
    console.log("⚠️ DISCORD WARN:", info);
});

client.on("shardReady", id => {
    console.log(`🟢 SHARD ${id} CONECTADO`);
});

client.on("shardError", error => {
    console.error("❌ ERROR SHARD DISCORD:", error);
});

client.on("shardDisconnect", (event, id) => {
    console.error(
        `🔴 SHARD ${id} DESCONECTADO:`,
        event
    );
});

client.on("shardReconnecting", id => {
    console.log(
        `🔄 SHARD ${id} INTENTANDO RECONEXIÓN...`
    );
});

client.on("invalidated", () => {
    console.error("❌ SESIÓN DE DISCORD INVALIDADA");
});

client.commands = new Collection();

// ======================
// CARGAR Y REGISTRAR
// ======================

const commandsPath = path.join(__dirname, "commands");

const commandFiles = fs
    .readdirSync(commandsPath)
    .filter(file => file.endsWith(".js"));

const commandsArray = [];

for (const file of commandFiles) {

    try {

        const command = require(`./commands/${file}`);

        if ("data" in command && "execute" in command) {

            client.commands.set(command.data.name, command);

            commandsArray.push(command.data.toJSON());

            console.log(`✅ Comando cargado: ${command.data.name}`);

        } else {

            console.log(
                `⚠️ El comando en ${file} le falta la propiedad 'data' o 'execute'.`
            );

        }

    } catch (error) {

        console.log(
            `❌ Error cargando comando ${file}:`,
            error.message
        );

    }
}

// ======================
// BOT READY
// ======================

client.once("ready", async () => {

    console.log(`✅ Bot conectado como ${client.user.tag}`);

    // ======================
    // REGISTRAR COMANDOS
    // ======================

    try {

        const rest = new REST({
            version: "10"
        }).setToken(process.env.TOKEN);

        console.log("🔄 Sincronizando comandos globalmente...");

        await rest.put(
            Routes.applicationCommands(client.user.id),
            {
                body: commandsArray
            }
        );

        console.log("✨ ¡Comandos sincronizados sin duplicados!");

    } catch (error) {

        console.error(
            "❌ Error al registrar comandos:",
            error
        );

    }

    // ======================
    // PRESENCIA
    // ======================

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

    } catch (error) {

        console.log(
            "⚠️ Error presencia:",
            error.message
        );

    }

    // ======================
    // TRACKER AUTOMÁTICO
    // ======================

    console.log("🔎 Tracker iniciado cada 30 segundos");

    let trackerRevisando = false;

    try {

        await revisarTrackers(client);

    } catch (error) {

        console.log(
            "❌ Error revisión inicial tracker:",
            error.message
        );

    }

    setInterval(async () => {

        if (trackerRevisando) {

            console.log(
                "⏳ Tracker anterior todavía ejecutándose..."
            );

            return;

        }

        trackerRevisando = true;

        try {

            await revisarTrackers(client);

        } catch (error) {

            console.log(
                "❌ Error tracker automático:",
                error.message
            );

        } finally {

            trackerRevisando = false;

        }

    }, 30 * 1000);

});

// ======================
// NUEVOS SERVIDORES
// ======================

client.on("guildCreate", async (guild) => {

    console.log(`📥 Nuevo servidor: ${guild.name}`);

    try {

        const canal = guild.channels.cache.find(
            channel =>
                channel.isTextBased() &&
                channel
                    .permissionsFor(guild.members.me)
                    ?.has("SendMessages")
        );

        if (canal) {

            await canal.send({

                embeds: [

                    {

                        title: "🎯 Bienvenido a RustLogix",

                        description:
`Gracias por agregar RustLogix 🤖

⚙️ **Primer paso obligatorio**

Ejecuta:

⚙️ \`/configurar-servidor\`

para configurar el servidor de Rust que utilizará el bot.


Después podrás usar:

🖥️ **Comandos del servidor**
⏱️ \`/horas\`
🏆 \`/ranking\`


🎯 **Sistema Tracker**
🎮 \`/tracker\`
📋 \`/trackers-activos\`


🔎 **Consultas BattleMetrics**
🔎 \`/horasbm\`


📚 Usa:

\`/help\`

para ver todos los comandos disponibles.`,

                        color: 0x3498DB,

                        footer: {
                            text: "RustLogix"
                        },

                        timestamp: new Date()

                    }

                ]

            });

        }

    } catch (error) {

        console.log(
            "❌ Error enviando bienvenida:",
            error.message
        );

    }

});

// ======================
// INTERACCIONES
// ======================

client.on("interactionCreate", async interaction => {

    // ======================
    // BOTONES
    // ======================

    if (interaction.isButton()) {

        if (
            interaction.customId.startsWith(
                "eliminar_tracker_"
            )
        ) {

            const id = interaction.customId.replace(
                "eliminar_tracker_",
                ""
            );

            const Tracker = require(
                "./models/TrackerSchema"
            );

            try {

                const trackerEliminado =
                    await Tracker.findByIdAndDelete(id);

                if (!trackerEliminado) {

                    return interaction.reply({

                        content:
                            "❌ Ese tracker ya no existe o ya fue eliminado.",

                        ephemeral: true

                    });

                }

                return interaction.update({

                    content:
                        `🗑️ Tracker eliminado: **${trackerEliminado.nombre || id}**`,

                    embeds: [],

                    components: []

                });

            } catch (error) {

                console.error(
                    "Error al eliminar tracker por botón:",
                    error
                );

                return interaction.reply({

                    content:
                        "❌ Ocurrió un error al intentar eliminar el tracker.",

                    ephemeral: true

                });

            }

        }

        return;

    }

    // ======================
    // SLASH COMMANDS
    // ======================

    if (!interaction.isChatInputCommand()) {
        return;
    }

    const command = client.commands.get(
        interaction.commandName
    );

    if (!command) {
        return;
    }

    try {

        const executionPromise =
            command.execute(interaction);

        const timeoutPromise =
            new Promise((_, reject) =>

                setTimeout(
                    () =>
                        reject(
                            new Error(
                                "TIME_OUT_COMANDO"
                            )
                        ),
                    30000
                )

            );

        await Promise.race([
            executionPromise,
            timeoutPromise
        ]);

    } catch (error) {

        console.log(
            "ERROR EJECUTANDO COMANDO:",
            error
        );

        try {

            const errorMsg =
                "❌ El comando tardó demasiado en responder o hubo un error interno.";

            if (
                interaction.deferred ||
                interaction.replied
            ) {

                await interaction.editReply({
                    content: errorMsg
                });

            } else {

                await interaction.reply({

                    content: errorMsg,

                    ephemeral: true

                });

            }

        } catch (err) {

            console.log(
                "ERROR RESPONDIENDO DISCORD:",
                err.message
            );

        }

    }

});

// ======================
// ERRORES
// ======================

client.on("error", error => {

    console.error(
        "❌ Error Discord:",
        error
    );

});

process.on("unhandledRejection", reason => {

    console.error(
        "❌ Unhandled Promise:",
        reason
    );

});

process.on("uncaughtException", error => {

    console.error(
        "❌ Uncaught Exception:",
        error
    );

});

// ======================
// INICIO Y LOGIN
// ======================

async function iniciarBot() {

    try {

        console.log(
            "🔄 Conectando a MongoDB..."
        );

        await connectDB();

        console.log(
            "🔑 Iniciando sesión en Discord..."
        );

        const loginResult = await client.login(
            process.env.TOKEN
        );

        console.log(
            "🔐 LOGIN RESULT:",
            loginResult
        );

    } catch (error) {

        console.error(
            "❌ ERROR CRÍTICO EN EL INICIO:",
            error
        );

    }

}

iniciarBot();