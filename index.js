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
const https = require("https");

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

    console.log(
        `🌐 Servidor web activo en puerto ${PORT}`
    );

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

    const texto = String(info);

    if (
        texto.includes("[WS => Shard") ||
        texto.includes("Heartbeat acknowledged") ||
        texto.includes("First heartbeat sent") ||
        texto.includes("Waiting for event ready") ||
        texto.includes("Shard received all its guilds") ||
        texto.includes("Provided token") ||
        texto.includes("LOGIN RESULT") ||
        texto.includes("token:")
    ) {
        return;
    }

    console.log(
        "🔧 DISCORD DEBUG:",
        texto
    );

});

// ======================
// WARNINGS DISCORD
// ======================
client.on("warn", info => {

    console.log(
        "⚠️ DISCORD WARN:",
        info
    );

});

// ======================
// SHARD READY
// ======================
client.on("shardReady", id => {

    console.log(
        `🟢 SHARD ${id} CONECTADO`
    );

});

// ======================
// ERROR SHARD
// ======================
client.on("shardError", error => {

    console.error(
        "❌ ERROR SHARD DISCORD:",
        error
    );

});

// ======================
// SHARD DESCONECTADO
// ======================
client.on("shardDisconnect", (event, id) => {

    console.error(
        `🔴 SHARD ${id} DESCONECTADO:`,
        event
    );

});

// ======================
// RECONEXIÓN
// ======================
client.on("shardReconnecting", id => {

    console.log(
        `🔄 SHARD ${id} INTENTANDO RECONEXIÓN...`
    );

});

// ======================
// SESIÓN INVALIDADA
// ======================
client.on("invalidated", () => {

    console.error(
        "❌ SESIÓN DE DISCORD INVALIDADA"
    );

});

// ======================
// ERROR DISCORD
// ======================
client.on("error", error => {

    console.error(
        "❌ ERROR DISCORD:",
        error
    );

});

// ======================
// COLECCIÓN DE COMANDOS
// ======================
client.commands = new Collection();

// ======================
// CARGAR COMANDOS
// ======================
const commandsPath =
    path.join(
        __dirname,
        "commands"
    );

const commandFiles =
    fs
        .readdirSync(commandsPath)
        .filter(
            file =>
                file.endsWith(".js")
        );

const commandsArray = [];

for (const file of commandFiles) {

    try {

        const command =
            require(
                `./commands/${file}`
            );

        if (
            "data" in command &&
            "execute" in command
        ) {

            client.commands.set(
                command.data.name,
                command
            );

            commandsArray.push(
                command.data.toJSON()
            );

            console.log(
                `✅ Comando cargado: ${command.data.name}`
            );

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
client.once(
    "clientReady",
    async () => {

        console.log(
            `✅ Bot conectado como ${client.user.tag}`
        );

        // ======================
        // REGISTRAR COMANDOS
        // ======================
        try {

            const rest =
                new REST({
                    version: "10"
                }).setToken(
                    process.env.TOKEN
                );

            console.log(
                "🔄 Sincronizando comandos globalmente..."
            );

            await rest.put(
                Routes.applicationCommands(
                    client.user.id
                ),
                {
                    body: commandsArray
                }
            );

            console.log(
                "✨ ¡Comandos sincronizados sin duplicados!"
            );

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

            console.log(
                "🟢 Estado ONLINE establecido"
            );

        } catch (error) {

            console.log(
                "⚠️ Error presencia:",
                error.message
            );

        }

        // ======================
        // TRACKER AUTOMÁTICO
        // ======================
        console.log(
            "🔎 Tracker iniciado cada 30 segundos"
        );

        let trackerRevisando = false;

        // ======================
        // PRIMERA REVISIÓN
        // ======================
        try {

            await revisarTrackers(
                client
            );

        } catch (error) {

            console.log(
                "❌ Error revisión inicial tracker:",
                error.message
            );

        }

        // ======================
        // REVISIÓN CADA 30 SEGUNDOS
        // ======================
        setInterval(
            async () => {

                if (trackerRevisando) {

                    console.log(
                        "⏳ Tracker anterior todavía ejecutándose..."
                    );

                    return;

                }

                trackerRevisando = true;

                try {

                    await revisarTrackers(
                        client
                    );

                } catch (error) {

                    console.log(
                        "❌ Error tracker automático:",
                        error.message
                    );

                } finally {

                    trackerRevisando = false;

                }

            },
            30 * 1000
        );

    }
);

// ======================
// NUEVOS SERVIDORES
// ======================
client.on(
    "guildCreate",
    async guild => {

        console.log(
            `📥 Nuevo servidor: ${guild.name}`
        );

        try {

            const canal =
                guild.channels.cache.find(
                    channel =>
                        channel.isTextBased() &&
                        channel
                            .permissionsFor(
                                guild.members.me
                            )
                            ?.has(
                                "SendMessages"
                            )
                );

            if (canal) {

                await canal.send({

                    embeds: [

                        {

                            title:
                                "🎯 Bienvenido a RustLogix",

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


💣 **Raid Calculator**
💣 \`/raid\`


📚 Usa:

\`/help\`

para ver todos los comandos disponibles.`,

                            color:
                                0x3498DB,

                            footer: {
                                text:
                                    "RustLogix"
                            },

                            timestamp:
                                new Date()

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

    }
);

// ======================
// INTERACCIONES
// ======================
client.on(
    "interactionCreate",
    async interaction => {

        // =====================================================
        // BOTONES
        // =====================================================
        if (interaction.isButton()) {

            // =================================================
            // BOTONES DEL RAID CALCULATOR
            // =================================================
            if (
                interaction.customId === "raid_economia" ||
                interaction.customId === "raid_cantidad" ||
                interaction.customId === "raid_explosivos" ||
                interaction.customId === "raid_melee"
            ) {

                try {

                    const comandoRaid =
                        client.commands.get(
                            "raid"
                        );

                    if (
                        !comandoRaid ||
                        typeof comandoRaid.manejarBotonRaid !== "function"
                    ) {

                        console.error(
                            "❌ No se encontró manejarBotonRaid en el comando /raid."
                        );

                        if (
                            !interaction.replied &&
                            !interaction.deferred
                        ) {

                            await interaction.reply({

                                content:
                                    "❌ El sistema de Raid Calculator no está disponible.",

                                ephemeral:
                                    true

                            });

                        }

                        return;

                    }

                    await comandoRaid.manejarBotonRaid(
                        interaction
                    );

                } catch (error) {

                    console.error(
                        "❌ Error manejando botón de /raid:",
                        error
                    );

                    try {

                        if (
                            !interaction.replied &&
                            !interaction.deferred
                        ) {

                            await interaction.reply({

                                content:
                                    "❌ Ocurrió un error al cambiar la sección del raid.",

                                ephemeral:
                                    true

                            });

                        }

                    } catch (err) {

                        console.error(
                            "❌ Error respondiendo botón /raid:",
                            err.message
                        );

                    }

                }

                return;

            }

            // =================================================
            // ELIMINAR TRACKER
            // =================================================
            if (
                interaction.customId.startsWith(
                    "eliminar_tracker_"
                )
            ) {

                const id =
                    interaction.customId.replace(
                        "eliminar_tracker_",
                        ""
                    );

                const Tracker =
                    require(
                        "./models/TrackerSchema"
                    );

                try {

                    const trackerEliminado =
                        await Tracker.findByIdAndDelete(
                            id
                        );

                    if (
                        !trackerEliminado
                    ) {

                        return interaction.reply({

                            content:
                                "❌ Ese tracker ya no existe o ya fue eliminado.",

                            ephemeral:
                                true

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
                        "❌ Error al eliminar tracker por botón:",
                        error
                    );

                    return interaction.reply({

                        content:
                            "❌ Ocurrió un error al intentar eliminar el tracker.",

                        ephemeral:
                            true

                    });

                }

            }

            return;

        }

        // =====================================================
        // SLASH COMMANDS
        // =====================================================
        if (
            !interaction.isChatInputCommand()
        ) {

            return;

        }

        const command =
            client.commands.get(
                interaction.commandName
            );

        if (!command) {

            return;

        }

        try {

            const executionPromise =
                command.execute(
                    interaction
                );

            const timeoutPromise =
                new Promise(
                    (_, reject) => {

                        setTimeout(
                            () => {

                                reject(
                                    new Error(
                                        "TIME_OUT_COMANDO"
                                    )
                                );

                            },
                            30000
                        );

                    }
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

                        content:
                            errorMsg

                    });

                } else {

                    await interaction.reply({

                        content:
                            errorMsg,

                        ephemeral:
                            true

                    });

                }

            } catch (err) {

                console.log(
                    "ERROR RESPONDIENDO DISCORD:",
                    err.message
                );

            }

        }

    }
);

// ======================
// ERRORES GLOBALES
// ======================
process.on(
    "unhandledRejection",
    reason => {

        console.error(
            "❌ Unhandled Promise:",
            reason
        );

    }
);

process.on(
    "uncaughtException",
    error => {

        console.error(
            "❌ Uncaught Exception:",
            error
        );

    }
);

// ======================
// INICIO Y LOGIN
// ======================
async function iniciarBot() {

    try {

        // ======================
        // MONGODB
        // ======================
        console.log(
            "🔄 Conectando a MongoDB..."
        );

        await connectDB();

        // ======================
        // PRUEBA HTTPS DISCORD
        // ======================
        console.log(
            "🌐 Probando conexión HTTPS a Discord..."
        );

        await new Promise(
            resolve => {

                const request =
                    https.get(
                        "https://discord.com/api/v10/gateway",
                        res => {

                            console.log(
                                `🌐 Discord respondió: ${res.statusCode}`
                            );

                            let data = "";

                            res.on(
                                "data",
                                chunk => {

                                    data += chunk;

                                }
                            );

                            res.on(
                                "end",
                                () => {

                                    resolve();

                                }
                            );

                        }
                    );

                request.setTimeout(
                    15000,
                    () => {

                        console.error(
                            "❌ TIMEOUT HTTPS: Discord no respondió en 15 segundos."
                        );

                        request.destroy();

                        resolve();

                    }
                );

                request.on(
                    "error",
                    error => {

                        console.error(
                            "❌ ERROR HTTPS DISCORD:",
                            error.message
                        );

                        resolve();

                    }
                );

            }
        );

        // ======================
        // LOGIN DISCORD
        // ======================
        console.log(
            "🔑 Iniciando sesión en Discord..."
        );

        if (
            !process.env.TOKEN
        ) {

            throw new Error(
                "❌ La variable TOKEN no existe en las variables de entorno."
            );

        }

        console.log(
            "🔐 TOKEN encontrado correctamente."
        );

        const loginPromise =
            client.login(
                process.env.TOKEN
            );

        const timeoutPromise =
            new Promise(
                (_, reject) => {

                    setTimeout(
                        () => {

                            reject(
                                new Error(
                                    "⏰ TIMEOUT: Discord no completó la conexión después de 60 segundos."
                                )
                            );

                        },
                        60000
                    );

                }
            );

        await Promise.race([

            loginPromise,

            timeoutPromise

        ]);

        console.log(
            "✅ Login de Discord completado correctamente."
        );

    } catch (error) {

        console.error(
            "❌ ERROR CRÍTICO EN EL INICIO:"
        );

        console.error(
            error
        );

        process.exit(1);

    }

}

// ======================
// INICIAR BOT
// ======================
iniciarBot();