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


// ======================
// PUERTO PARA RENDER
// ======================

const PORT = process.env.PORT || 3000;


const server = http.createServer((req, res) => {

    req.on("data", () => {});
    req.on("end", () => {});


    res.writeHead(200, {

        "Content-Type": "text/plain",
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
        GatewayIntentBits.Guilds
    ]

});


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
    fs.readdirSync(commandsPath)
    .filter(
        file => file.endsWith(".js")
    );


const commands = [];


for (const file of commandFiles) {


    try {


        const command =
            require(
                `./commands/${file}`
            );


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
// REGISTRAR COMANDOS
// ======================


async function registrarComandos(guild) {


    try {


        const rest =
            new REST({

                version:"10"

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
// BOT READY
// ======================


client.once("clientReady", async () => {


    console.log(

        `✅ Bot conectado como ${client.user.tag}`

    );



    try {


        await client.user.setPresence({


            status:"online",


            activities:[

                {

                    name:"BattleMetrics",

                    type:0

                }

            ]


        });


        console.log(

            "🟢 Estado ONLINE establecido"

        );



    } catch(error) {


        console.log(

            "⚠️ Error presencia:",

            error.message

        );


    }





    console.log(

        "🔄 Registrando comandos en servidores..."

    );



    for(const guild of client.guilds.cache.values()) {


        await registrarComandos(guild);


    }



    console.log(

        "✅ Registro de comandos finalizado"

    );





    // ======================
    // TRACKER AUTOMÁTICO
    // ======================


    console.log(

        "🔎 Tracker iniciado cada 30 segundos"

    );



    // Revisión inmediata

    try {

        await revisarTrackers(client);

    } catch(error) {

        console.log(

            "❌ Error revisión inicial tracker:",

            error.message

        );

    }





    // Revisión cada 30 segundos

    setInterval(async () => {


        try {


            await revisarTrackers(client);


        } catch(error) {


            console.log(

                "❌ Error tracker automático:",

                error.message

            );


        }


    }, 30 * 1000);



});






// ======================
// NUEVOS SERVIDORES
// ======================


client.on("guildCreate", async (guild)=>{


    console.log(

        `📥 Nuevo servidor: ${guild.name}`

    );


    await registrarComandos(guild);


});







// ======================
// INTERACCIONES
// ======================


client.on("interactionCreate", async interaction=>{


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


            if(interaction.deferred || interaction.replied){


                await interaction.editReply({

                    content:"❌ Error ejecutando comando"

                });


            } else {


                await interaction.reply({

                    content:"❌ Error ejecutando comando",

                    ephemeral:true

                });


            }


        } catch(err){


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


client.on("error",error=>{

    console.error(
        "❌ Error Discord:",
        error
    );

});



process.on("unhandledRejection",(reason)=>{

    console.error(
        "❌ Unhandled Promise:",
        reason
    );

});



process.on("uncaughtException",(error)=>{

    console.error(
        "❌ Uncaught Exception:",
        error
    );

});






// ======================
// LOGIN
// ======================


client.login(

    process.env.TOKEN

);