const {
    SlashCommandBuilder
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const {
    getBattleMetricsHours
} = require("../services/battlemetricsHours");


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
            String(
                interaction.options.getString("id")
            );



        // ======================
        // CONFIG BATTLEMETRICS
        // ======================


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



        console.log(
            "CONFIG:",
            JSON.stringify(config,null,2)
        );



        const guildId =
            String(interaction.guild.id);



        let serverId = null;



        // formato directo
        if(config.battlemetricsServer) {

            serverId =
                config.battlemetricsServer;

        }



        // formato por servidor Discord
        if(
            !serverId &&
            config[guildId]
        ) {


            if(
                typeof config[guildId] === "object"
            ) {


                serverId =
                    config[guildId].battlemetricsServer;


            }
            else {


                serverId =
                    config[guildId];


            }

        }



        if(!serverId) {


            console.log(
                "❌ No se encontró BattleMetrics para:",
                guildId
            );


            return interaction.editReply(

                "❌ Este servidor no tiene BattleMetrics configurado.\nUsa primero `/configurar-servidor`."

            );


        }



        serverId =
            String(serverId);



        console.log(
            "✅ SERVER BM:",
            serverId
        );




        // ======================
        // LEER TRACKERS
        // ======================


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



        if(!Array.isArray(trackers)) {

            trackers = [];

        }





        // ======================
        // LIMITE
        // ======================


        const activosServidor =

            trackers.filter(

                t =>
                String(t.guildId) === guildId

            );



        if(activosServidor.length >= 20) {


            return interaction.editReply(

                "❌ Este servidor ya tiene el límite de 20 jugadores en seguimiento."

            );


        }






        // ======================
        // DUPLICADOS
        // ======================


        const existe =

            trackers.find(

                t =>

                String(t.guildId) === guildId &&

                String(t.playerId) === playerId

            );



        if(existe) {


            return interaction.editReply(

                "⚠️ Este jugador ya está siendo monitoreado."

            );


        }






        // ======================
        // NOMBRE BM
        // ======================


        let nombreJugador =
            "Jugador desconocido";



        try {


            const data =

                await getBattleMetricsHours(
                    playerId
                );



            if(data?.nombre) {

                nombreJugador =
                    data.nombre;

            }



        } catch(error) {


            console.log(

                "ERROR OBTENIENDO NOMBRE BM:",
                error.message

            );


        }






        // ======================
        // CREAR TRACKER
        // ======================


        const ahora =
            Date.now();



        const expira =

            ahora +

            (24 * 60 * 60 * 1000);




        const nuevoTracker = {


            guildId:


                guildId,


            channelId:


                String(interaction.channel.id),



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


        };




        trackers.push(
            nuevoTracker
        );





        // ======================
        // GUARDAR
        // ======================


        try {


            fs.writeFileSync(

                file,

                JSON.stringify(

                    trackers,

                    null,

                    2

                )

            );



            console.log(
                "💾 Tracker guardado:",
                nuevoTracker
            );



        } catch(error) {


            console.log(

                "ERROR GUARDANDO TRACKER:",
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