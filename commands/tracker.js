const {
    SlashCommandBuilder
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const axios = require("axios");


const file = path.join(
    __dirname,
    "..",
    "data",
    "trackers.json"
);



module.exports = {

    data: new SlashCommandBuilder()

        .setName("tracker")

        .setDescription(
            "Comienza el seguimiento de un jugador BattleMetrics durante 24 horas"
        )

        .addStringOption(option =>
            option
                .setName("id")
                .setDescription(
                    "ID del jugador BattleMetrics"
                )
                .setRequired(true)
        ),



    async execute(interaction) {


        await interaction.deferReply({
            flags: 64
        });



        const playerId =
            interaction.options.getString("id");



        const configFile = path.join(
            __dirname,
            "..",
            "data",
            "config.json"
        );



        let config = {};



        try {


            if(fs.existsSync(configFile)) {


                config = JSON.parse(

                    fs.readFileSync(

                        configFile,

                        "utf8"

                    )

                );


            }


        } catch(error) {


            console.log(
                "ERROR LEYENDO CONFIG:",
                error.message
            );


        }




        // Acepta ambos formatos

        const serverId =

            config.battlemetricsServer ||

            config[interaction.guild.id]?.battlemetricsServer;




        if(!serverId) {


            return interaction.editReply(

                "❌ Este servidor no tiene BattleMetrics configurado.\nUsa primero `/configurar-servidor`."

            );


        }





        let trackers = [];



        try {


            if(fs.existsSync(file)) {


                trackers = JSON.parse(

                    fs.readFileSync(

                        file,

                        "utf8"

                    )

                );


            }



        } catch(error) {


            console.log(

                "ERROR LEYENDO TRACKERS:",

                error.message

            );


        }





        const activosServidor =

            trackers.filter(

                t =>

                t.guildId === interaction.guild.id

            );



        if(activosServidor.length >= 20) {


            return interaction.editReply(

                "❌ Este servidor ya tiene el límite de 20 jugadores en seguimiento."

            );


        }





        const existe =

            trackers.find(

                t =>

                t.guildId === interaction.guild.id &&

                t.playerId === playerId

            );



        if(existe) {


            return interaction.editReply(

                "⚠️ Este jugador ya está siendo monitoreado."

            );


        }





        let nombreJugador =
            "Jugador desconocido";



        try {


            const response =

                await axios.get(

                    `https://api.battlemetrics.com/players/${playerId}`

                );



            nombreJugador =

                response.data.data.attributes.name;



        } catch(error) {


            console.log(

                "ERROR OBTENIENDO JUGADOR:",

                error.response?.data || error.message

            );


        }





        const ahora =
            Date.now();



        const expira =

            ahora +

            (24 * 60 * 60 * 1000);





        trackers.push({


            guildId:
                interaction.guild.id,


            channelId:
                interaction.channel.id,


            serverId:
                serverId,


            playerId:
                playerId,


            playerName:
                nombreJugador,


            lastState:
                "UNKNOWN",


            createdAt:
                ahora,


            expiresAt:
                expira


        });






        try {


            fs.writeFileSync(

                file,

                JSON.stringify(

                    trackers,

                    null,

                    2

                )

            );



        } catch(error) {



            console.log(

                "ERROR GUARDANDO TRACKERS:",

                error.message

            );



            return interaction.editReply(

                "❌ Error guardando el tracker."

            );


        }






        await interaction.editReply({


            content:


            `✅ Tracker creado correctamente\n\n` +

            `👤 Jugador: **${nombreJugador}**\n` +

            `🆔 BattleMetrics ID: \`${playerId}\`\n` +

            `📡 Servidor ID: \`${serverId}\`\n` +

            `⏳ Duración: 24 horas\n\n` +

            `📋 Trackers activos: ${activosServidor.length + 1}/20`


        });



    }


};