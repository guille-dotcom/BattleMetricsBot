const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { EmbedBuilder } = require("discord.js");

const {
    getBattleMetricsHours
} = require("./battlemetricsHours");


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
// PLAYTIME REAL BM
// ======================

async function obtenerPlaytime(playerId){


    try{


        console.log(
            `⏱️ Consultando horas BM ${playerId}`
        );



        const data = await getBattleMetricsHours(

            playerId

        );



        const horas = Number(

            data.totalHoras || 0

        );



        const horasEnteras = Math.floor(horas);



        const minutos = Math.floor(

            (horas - horasEnteras) * 60

        );



        console.log(

            `✅ Horas BM: ${horasEnteras}h ${minutos}m`

        );



        return `${horasEnteras}h ${minutos}m`;



    }catch(error){


        console.log(

            "❌ ERROR PLAYTIME:",

            error.message

        );


        return "No disponible";


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





        if(tracker.lastState !== estado){



            const servidor =

                await obtenerServidor(

                    tracker.serverId

                );





            const playtime =

                await obtenerPlaytime(

                    tracker.playerId

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





    guardarTrackers(trackers);



}





module.exports = {

    revisarTrackers

};