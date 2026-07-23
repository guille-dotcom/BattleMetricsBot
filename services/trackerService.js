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
// HEADERS BM
// ======================

function bmHeaders(){

    return {

        headers:{

            Authorization:
            `Bearer ${process.env.BATTLEMETRICS_TOKEN}`,

            Accept:
            "application/json"

        }

    };

}




// ======================
// LEER TRACKERS
// ======================

function leerTrackers(){

    try{

        if(!fs.existsSync(trackersFile))
            return [];


        return JSON.parse(

            fs.readFileSync(
                trackersFile,
                "utf8"
            )

        );


    }catch(error){

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

function guardarTrackers(trackers){

    try{


        fs.writeFileSync(

            trackersFile,

            JSON.stringify(
                trackers,
                null,
                2
            )

        );


        console.log(
            "💾 Trackers guardados"
        );


    }catch(error){


        console.log(
            "ERROR GUARDANDO TRACKERS:",
            error.message
        );


    }

}






// ======================
// OBTENER SERVIDOR
// ======================

async function obtenerServidor(serverId){

    try{


        const response = await axios.get(

            `https://api.battlemetrics.com/servers/${serverId}`,

            bmHeaders()

        );


        return {

            nombre:

            response.data.data.attributes.name

        };


    }catch(error){


        console.log(
            "ERROR SERVIDOR:",
            error.message
        );


        return {

            nombre:
            "Servidor Rust"

        };

    }

}






// ======================
// JUGADORES ONLINE
// ======================

async function obtenerJugadoresOnline(serverId){


    try{


        console.log(
            "🔑 Consultando jugadores BM..."
        );



        const response = await axios.get(


            `https://api.battlemetrics.com/servers/${serverId}`,

            {

                ...bmHeaders(),

                params:{
                    include:"player"
                }

            }

        );



        const jugadores =

            response.data.included || [];



        const ids = jugadores.map(

            jugador =>
            String(jugador.id)

        );



        console.log(

            `👥 Jugadores detectados: ${ids.length}`

        );



        return ids;



    }catch(error){


        console.log(

            "❌ ERROR JUGADORES ONLINE:",

            error.response?.data ||
            error.message

        );


        return [];

    }

}
// ======================
// PLAYTIME SESIÓN ACTUAL
// ======================

function obtenerTiempoSesion(tracker){


    if(!tracker.sessionStart){

        return "0h 0m";

    }



    const segundos = Math.floor(

        (Date.now() - tracker.sessionStart) / 1000

    );



    const horas = Math.floor(

        segundos / 3600

    );



    const minutos = Math.floor(

        (segundos % 3600) / 60

    );



    return `${horas}h ${minutos}m`;

}







// ======================
// TIEMPO RESTANTE
// ======================

function tiempoRestante(expira){


    const diferencia =

        expira - Date.now();



    if(diferencia <= 0)

        return "Expirado";



    const horas = Math.floor(

        diferencia / 3600000

    );



    const minutos = Math.floor(

        (diferencia % 3600000) / 60000

    );



    return `${horas}h ${minutos}m`;

}







// ======================
// REVISAR TRACKERS
// ======================

async function revisarTrackers(client){


    let trackers = leerTrackers();



    trackers = trackers.filter(

        tracker =>

        tracker.expiresAt > Date.now()

    );






    for(const tracker of trackers){



        console.log(

            `🔎 Revisando ${tracker.playerName}`

        );





        const jugadoresOnline =

            await obtenerJugadoresOnline(

                tracker.serverId

            );






        const online =

            jugadoresOnline.includes(

                String(

                    tracker.playerId

                )

            );






        const estado =

            online

            ?

            "ONLINE"

            :

            "OFFLINE";






        console.log(

            `${tracker.playerName}: ${estado}`

        );





        // ======================
        // CONTROL DE SESIÓN
        // ======================


        if(estado === "ONLINE"){


            if(!tracker.sessionStart){


                tracker.sessionStart = Date.now();


                console.log(

                    "🟢 Nueva sesión iniciada"

                );

            }


        }else{


            tracker.sessionStart = null;


        }






        if(tracker.lastState !== estado){



            const servidor =

                await obtenerServidor(

                    tracker.serverId

                );





            const playtime =

                obtenerTiempoSesion(

                    tracker

                );






            try{



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

                        estado === "ONLINE"

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

                            estado === "ONLINE"

                            ?

                            "🟢 ONLINE"

                            :

                            "🔴 OFFLINE"

                        },



                        {

                            name:

                            "⏱️ Play Time",

                            value:

                            playtime

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

                    `📢 Cambio enviado ${tracker.playerName}`

                );





            }catch(error){


                console.log(

                    "❌ ERROR ENVIANDO TRACKER:",

                    error.message

                );


            }


        }






        tracker.lastState = estado;



    }






    guardarTrackers(

        trackers

    );



}







module.exports = {


    revisarTrackers


};