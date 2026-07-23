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


        return {


            nombre:

            "Servidor Rust"


        };


    }


}







// ======================
// JUGADORES ONLINE + TIEMPO BM
// ======================

async function obtenerJugadorServidor(serverId, playerId){


    try{


        console.log(

            "🔑 Consultando jugador BM..."

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



        const incluidos =

            response.data.included || [];





        const jugador = incluidos.find(


            p =>

            String(p.id) === String(playerId)


        );




        if(!jugador){


            console.log(

                "⚠️ Jugador no encontrado en respuesta BM"

            );


            return {


                online:false,

                playtime:"0h 0m"


            };


        }






        const segundos =

            jugador.attributes?.timePlayed || 0;






        const horas = Math.floor(

            segundos / 3600

        );




        const minutos = Math.floor(

            (segundos % 3600) / 60

        );






        return {


            online:true,

            playtime:

            `${horas}h ${minutos}m`


        };



    }catch(error){



        console.log(

            "❌ ERROR CONSULTANDO BM:",

            error.response?.data ||

            error.message

        );



        return {


            online:false,

            playtime:"0h 0m"


        };


    }


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




        const jugador = await obtenerJugadorServidor(

            tracker.serverId,

            tracker.playerId

        );





        const estado = jugador.online

        ?

        "ONLINE"

        :

        "OFFLINE";





        console.log(

            `${tracker.playerName}: ${estado}`

        );





        if(tracker.lastState !== estado){



            const servidor = await obtenerServidor(

                tracker.serverId

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

                            jugador.playtime

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






    guardarTrackers(trackers);


}







module.exports = {


    revisarTrackers


};