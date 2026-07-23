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



// ======================
// LEER TRACKERS
// ======================

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



// ======================
// GUARDAR TRACKERS
// ======================

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



// ======================
// OBTENER SERVIDOR
// ======================

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


        return {

            nombre:
            "Servidor Rust"

        };


    }


}



// ======================
// OBTENER JUGADORES ONLINE
// DESDE BATTLEMETRICS WEB
// ======================

async function obtenerJugadoresOnline(serverId) {


    try {


        const response = await axios.get(


            `https://www.battlemetrics.com/servers/rust/${serverId}`,


            {

                headers: {

                    "User-Agent":
                    "Mozilla/5.0"

                }

            }


        );



        const html =
            response.data;



        const jugadores = [];



        const regex =
            /players\/(\d+)/g;



        let match;



        while(
            (match = regex.exec(html)) !== null
        ) {



            if(
                !jugadores.includes(match[1])
            ) {


                jugadores.push(
                    match[1]
                );


            }


        }




        console.log(

            `👥 Jugadores detectados: ${jugadores.length}`

        );



        return jugadores;



    } catch(error) {



        console.log(

            "ERROR OBTENIENDO JUGADORES:",

            error.message

        );



        return [];


    }


}



// ======================
// TIEMPO RESTANTE
// ======================

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



// ======================
// REVISAR TRACKERS
// ======================

async function revisarTrackers(client) {


    let trackers =
        leerTrackers();



    const ahora =
        Date.now();



    // eliminar expirados

    trackers =
        trackers.filter(

            tracker =>

            tracker.expiresAt > ahora

        );




    for(const tracker of trackers) {



        console.log(

            `🔎 Revisando tracker: ${tracker.playerName}`

        );



        const jugadoresOnline =

            await obtenerJugadoresOnline(

                tracker.serverId

            );




        const online =

            jugadoresOnline.includes(

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