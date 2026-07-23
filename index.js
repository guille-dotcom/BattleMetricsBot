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
// PUERTO PARA RENDER
// ======================

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
    res.writeHead(200, {
        "Content-Type": "text/plain"
    });

    res.end("BattleMetricsBot funcionando ✅");
}).listen(PORT, () => {
    console.log(`🌐 Servidor web activo en puerto ${PORT}`);
});


// ======================
// CLIENTE DISCORD
// ======================

const client = new Client({

    intents: [
        GatewayIntentBits.Guilds
    ]

});


client.commands = new Collection();


// ======================
// CARGAR COMANDOS
// ======================

const commandsPath = path.join(__dirname, "commands");

const commandFiles = fs.readdirSync(commandsPath)
    .filter(file => file.endsWith(".js"));


const commands = [];


for (const file of commandFiles) {

    try {

        const command = require(`./commands/${file}`);


        client.commands.set(
            command.data.name,
            command
        );


        commands.push(
            command.data.toJSON()
        );


        console.log(
            `✅ Comando cargado: ${command.data.name}`
        );


    } catch(error) {

        console.log(
            `❌ Error cargando comando ${file}:`,
            error.message
        );

    }

}



// ======================
// FUNCIÓN REGISTRAR COMANDOS
// ======================

async function registrarComandos(guild) {


    try {


        const rest = new REST({
            version: "10"
        }).setToken(
            process.env.TOKEN
        );



        await rest.put(

            Routes.applicationGuildCommands(
                client.user.id,
                guild.id
            ),

            {
                body: commands
            }

        );



        console.log(
            `✅ Comandos registrados en: ${guild.name}`
        );


    } catch(error) {


        console.log(
            `❌ Error registrando comandos en ${guild.name}:`,
            error.message
        );


    }

}



// ======================
// BOT CONECTADO
// ======================

client.once(
"clientReady",
async (client) => {


    console.log(
        `✅ Bot conectado como ${client.user.tag}`
    );


    console.log(
        "🔄 Registrando comandos en servidores..."
    );



    for (const guild of client.guilds.cache.values()) {

        await registrarComandos(guild);

    }


    console.log(
        "✅ Registro de comandos finalizado"
    );


});



// ======================
// NUEVOS SERVIDORES
// ======================

client.on(
"guildCreate",
async (guild) => {


    console.log(
        `📥 Nuevo servidor: ${guild.name}`
    );


    await registrarComandos(guild);


});



// ======================
// INTERACCIONES DISCORD
// ======================

client.on(
"interactionCreate",
async interaction => {


    if(!interaction.isChatInputCommand())
        return;



    const command =
    client.commands.get(
        interaction.commandName
    );



    if(!command)
        return;



    try {


        await command.execute(
            interaction
        );



    } catch(error) {


        console.log(
            "ERROR EJECUTANDO COMANDO:",
            error
        );


        try {


            if(
                interaction.deferred ||
                interaction.replied
            ){


                await interaction.editReply({

                    content:
                    "❌ Error ejecutando comando"

                });


            } else {


                await interaction.reply({

                    content:
                    "❌ Error ejecutando comando",

                    ephemeral:true

                });


            }


        } catch(err) {


            console.log(
                "ERROR RESPONDIENDO DISCORD:",
                err.message
            );


        }


    }


});



// ======================
// LOGIN
// ======================

client.login(
    process.env.TOKEN
);