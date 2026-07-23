require("dotenv").config();

const express = require("express");
const app = express();

app.get("/", (req, res) => {
    res.send("BattleMetricsBot activo");
});

app.listen(process.env.PORT || 3000, () => {
    console.log("✅ Servidor web activo");
});


const {
    Client,
    GatewayIntentBits,
    Collection
} = require("discord.js");

const fs = require("fs");
const path = require("path");


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
path.join(__dirname, "commands");


const commandFiles =
fs.readdirSync(commandsPath)
.filter(file => file.endsWith(".js"));



for (const file of commandFiles) {


    try {


        const command =
        require(`./commands/${file}`);



        client.commands.set(
            command.data.name,
            command
        );


        console.log(
            `✅ Comando cargado: ${command.data.name}`
        );


    } catch(error){


        console.log(
            `❌ Error cargando comando ${file}:`,
            error.message
        );


    }

}




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



    } catch(error){


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



            }else{


                await interaction.reply({

                    content:
                    "❌ Error ejecutando comando",

                    ephemeral:true

                });


            }



        }catch(err){


            console.log(
                "ERROR RESPONDIENDO DISCORD:",
                err.message
            );


        }


    }


});




// ======================
// BOT CONECTADO
// ======================

client.once(
"clientReady",
(client) => {


    console.log(
        `✅ Bot conectado como ${client.user.tag}`
    );


});




// ======================
// LOGIN
// ======================

client.login(
    process.env.TOKEN
);