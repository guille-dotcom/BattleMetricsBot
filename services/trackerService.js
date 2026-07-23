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


const configFile = path.join(
    __dirname,
    "..",
    "data",
    "config.json"
);


// Leer JSON seguro
function leerArchivo(file) {

    try {

        if (!fs.existsSync(file)) {
            return {};
        }

        return JSON.parse(
            fs.readFileSync(
                file,
                "utf8"
            )
        );

    } catch(error) {

        console.log(
            "ERROR LEYENDO:",
            file,
            error.message
        );

        return {};

    }

}


// Guardar trackers
function guardarTrackers(data) {

    try {

        fs.writeFileSync(

            trackersFile,

            JSON.stringify(
                data,
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


// Obtener jugadores online del servidor
async function obtenerJugadoresOnline(serverId) {

    try {

        const response =
            await axios.get(

                `https://api.battlemetrics.com/servers/${serverId}/relationships/players`,

                {
                    params: {
                        "filter[online]": "true"
                    }
                }

            );


        return response.data.data.map(
            player => player.id
        );


    } catch(error) {

        console.log(
            "ERROR CONSULTANDO JUGADORES:",
            error.response?.data || error.message
        );

        return [];

    }

}



// Revisar trackers
async function revisarTrackers(client) {


    let trackers =
        leerArchivo(trackersFile);


    if(!Array.isArray(trackers)) {

        trackers = [];

    }


    const ahora =
        Date.now();



    // eliminar expirados
    trackers =
        trackers.filter(
            tracker => {

                if(tracker.expiresAt <= ahora) {

                    console.log(
                        `⏳ Tracker expirado: ${tracker.playerName}`
                    );

                    return false;

                }

                return true;

            }
        );



    const config =
        leerArchivo(configFile);



    for(const tracker of trackers) {


        const serverId =
            tracker.serverId;



        if(!serverId) {
            continue;
        }



        const jugadoresOnline =
            await obtenerJugadoresOnline(
                serverId
            );



        const estaOnline =
            jugadoresOnline.includes(
                tracker.playerId
            );



        const nuevoEstado =
            estaOnline
            ? "ONLINE"
            : "OFFLINE";



        // solo avisar cuando cambia
        if(
            tracker.lastState !== "UNKNOWN" &&
            tracker.lastState !== nuevoEstado
        ) {


            try {


                const guild =
                    client.guilds.cache.get(
                        tracker.guildId
                    );


                if(guild) {


                    const canal =
                        guild.channels.cache.get(
                            tracker.channelId
                        );


                    if(canal) {


                        const embed =
                            new EmbedBuilder()

                            .setTitle(
                                "🎮 Tracker BattleMetrics"
                            )

                            .setColor(
                                nuevoEstado === "ONLINE"
                                ? "#57F287"
                                : "#ED4245"
                            )

                            .setDescription(

                                nuevoEstado === "ONLINE"

                                ?

                                `🟢 **${tracker.playerName} entró al servidor**`

                                :

                                `🔴 **${tracker.playerName} salió del servidor**`

                            )

                            .addFields({

                                name:
                                "Estado",

                                value:
                                nuevoEstado

                            })

                            .setTimestamp();



                        await canal.send({

                            embeds:[
                                embed
                            ]

                        });


                    }

                }


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