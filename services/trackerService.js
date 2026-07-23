const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { EmbedBuilder } = require("discord.js");


const trackersFile = path.join(
    __dirname,
    "..",
    "data",
    "trackers.json"
);



function leerTrackers() {

    try {

        if(!fs.existsSync(trackersFile)) {

            return [];

        }


        return JSON.parse(
            fs.readFileSync(
                trackersFile,
                "utf8"
            )
        );


    } catch(error) {

        console.log(
            "ERROR LEYENDO TRACKERS:",
            error.message
        );

        return [];

    }

}



function guardarTrackers(trackers) {

    try {

        fs.writeFileSync(

            trackersFile,

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

    }

}




async function obtenerServidor(serverId) {

    try {

        const response = await axios.get(

            `https://api.battlemetrics.com/servers/${serverId}`

        );


        return {

            nombre:
            response.data.data.attributes.name

        };


    } catch(error) {

        console.log(
            "ERROR OBTENIENDO SERVIDOR:",
            error.response?.data || error.message
        );


        return {

            nombre:
            "Servidor Rust"

        };

    }

}





async function obtenerJugadoresOnline(serverId) {

    try {


        const response = await axios.get(

            `https://api.battlemetrics.com/servers/${serverId}`,

            {

                params: {

                    include: "player"

                }

            }

        );



        const jugadores =
            response.data.included || [];



        const ids = jugadores.map(

            jugador => jugador.id

        );



        console.log(
            `👥 Jugadores detectados online: ${ids.length}`
        );


        return ids;



    } catch(error) {


        console.log(

            "ERROR JUGADORES ONLINE:",

            error.response?.data || error.message

        );


        return [];

    }

}





function tiempoRestante(expira) {


    const diferencia =
        expira - Date.now();



    if(diferencia <= 0)
        return "Expirado";



    const horas =
        Math.floor(
            diferencia / 3600000
        );



    const minutos =
        Math.floor(
            (diferencia % 3600000) / 60000
        );



    return `${horas}h ${minutos}m`;

}





async function revisarTrackers(client) {


    let trackers =
        leerTrackers();



    const ahora =
        Date.now();




    trackers =
        trackers.filter(

            tracker =>

            tracker.expiresAt > ahora

        );





    for(const tracker of trackers) {



        console.log(
            `🔎 Revisando tracker: ${tracker.playerName}`
        );



        const onlinePlayers =
            await obtenerJugadoresOnline(
                tracker.serverId
            );



        const online =

            onlinePlayers.includes(

                tracker.playerId

            );



        const nuevoEstado =

            online

            ?

            "ONLINE"

            :

            "OFFLINE";




        if(
            tracker.lastState !== nuevoEstado
        ) {



            const servidor =
                await obtenerServidor(
                    tracker.serverId
                );



            try {



                const guild =

                    client.guilds.cache.get(

                        tracker.guildId

                    );



                if(!guild)
                    continue;




                const canal =

                    guild.channels.cache.get(

                        tracker.channelId

                    );



                if(!canal)
                    continue;





                const embed =

                    new EmbedBuilder()



                    .setTitle(
                        "🎮 Tracker BattleMetrics"
                    )



                    .setColor(

                        nuevoEstado === "ONLINE"

                        ?

                        "#57F287"

                        :

                        "#ED4245"

                    )



                    .setDescription(

                        `👤 **${tracker.playerName}**`

                    )



                    .addFields(


                        {

                            name:
                            "Estado",

                            value:

                            nuevoEstado === "ONLINE"

                            ?

                            "🟢 ONLINE"

                            :

                            "🔴 OFFLINE"

                        },


                        {

                            name:
                            "⏱️ Play Time",

                            value:

                            "Consultando BattleMetrics..."

                        },


                        {

                            name:
                            "📡 Servidor",

                            value:

                            servidor.nombre

                        },


                        {

                            name:
                            "⌛ Tracker restante",

                            value:

                            tiempoRestante(
                                tracker.expiresAt
                            )

                        }


                    )



                    .setTimestamp();




                await canal.send({

                    embeds:[
                        embed
                    ]

                });




                console.log(

                    `📢 Cambio detectado ${tracker.playerName}: ${nuevoEstado}`

                );



            } catch(error) {


                console.log(

                    "ERROR ENVIANDO TRACKER:",

                    error.message

                );


            }


        }



        tracker.lastState =
            nuevoEstado;



    }





guardarTrackers(
    trackers
);



}



module.exports = {

    revisarTrackers

};