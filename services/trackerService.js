const fs = require("fs");
const path = require("path");
const { EmbedBuilder } = require("discord.js");

const {
    getBattleMetricsPlayerStatus
} = require("./battlemetricsSearch");


const trackersFile = path.join(
    __dirname,
    "..",
    "data",
    "trackers.json"
);


// Crear carpeta y archivo
if (!fs.existsSync(path.dirname(trackersFile))) {

    fs.mkdirSync(
        path.dirname(trackersFile),
        { recursive: true }
    );

}


if (!fs.existsSync(trackersFile)) {

    fs.writeFileSync(
        trackersFile,
        JSON.stringify({}, null, 4)
    );

}



// Leer trackers
function leerTrackers() {

    try {

        return JSON.parse(
            fs.readFileSync(
                trackersFile,
                "utf8"
            )
        );


    } catch(error) {

        console.error(
            "ERROR LEYENDO TRACKERS:",
            error
        );

        return {};

    }

}



// Guardar trackers
function guardarTrackers(trackers) {

    try {

        fs.writeFileSync(
            trackersFile,
            JSON.stringify(
                trackers,
                null,
                4
            ),
            "utf8"
        );


        console.log(
            "✅ trackers.json actualizado"
        );


    } catch(error) {

        console.error(
            "ERROR GUARDANDO TRACKERS:",
            error
        );

    }

}



// Obtener ID BattleMetrics
function obtenerBattleMetricsId(texto) {

    if(!texto)
        return null;


    texto = texto.trim();



    if(/^\d+$/.test(texto))
        return texto;



    const match =
    texto.match(
        /players\/(\d+)/
    );


    if(match)
        return match[1];



    return null;

}



// Formato tiempo
function formatoTiempo(inicio) {

    if(!inicio)
        return "00h 00m";


    const minutos =
    Math.floor(
        (Date.now() - inicio) / 60000
    );


    const horas =
    Math.floor(
        minutos / 60
    );


    const minutosRestantes =
    minutos % 60;


    return `${horas
    .toString()
    .padStart(2,"0")}h ${minutosRestantes
    .toString()
    .padStart(2,"0")}m`;

}



// Registrar tracker
function registrarTracker({

    battlemetricsId,

    nombre = "Desconocido",

    canalId,

    guildId,

    registradoPor

}) {


    const trackers =
    leerTrackers();



    trackers[battlemetricsId] = {


        battlemetricsId,


        nombre,


        canalId,


        guildId,


        registradoPor,


        registradoEn:
        Date.now(),



        expiraEn:
        Date.now()
        +
        (24 * 60 * 60 * 1000),



        ultimoEstado:
        "offline",



        inicioSesion:
        null,



        ultimoServidor:
        null,



        mensajeId:
        null


    };



    guardarTrackers(trackers);



    return trackers[battlemetricsId];

}
// Revisar trackers
async function revisarTrackers(client) {


    console.log(
        "🔎 EJECUTANDO REVISION DE TRACKERS"
    );


    const trackers =
    leerTrackers();



    for(const id in trackers) {


        const tracker =
        trackers[id];



        // Expiración 24 horas
        if(Date.now() > tracker.expiraEn) {


            delete trackers[id];


            console.log(
                "🗑 Tracker expirado:",
                id
            );


            continue;

        }



        const status =
        await getBattleMetricsPlayerStatus(
            tracker.battlemetricsId
        );



        if(!status) {

            console.log(
                "No se pudo revisar:",
                id
            );

            continue;

        }



        const canal =
        await client.channels.fetch(
            tracker.canalId
        );



        if(!canal)
            continue;




        // ============================
        // JUGADOR ONLINE
        // ============================

        if(status.online) {


            tracker.ultimoServidor =
            status.server;



            // Primera vez online

            if(tracker.ultimoEstado === "offline") {


                tracker.ultimoEstado =
                "online";


                tracker.inicioSesion =
                Date.now();



                const embed =
                new EmbedBuilder()

                .setTitle(
                    "🎯 BattleMetrics Tracker"
                )

                .setDescription(
`🟢 **JUGADOR ONLINE**

👤 **${status.name}**

🆔 [Perfil BattleMetrics](https://www.battlemetrics.com/players/${tracker.battlemetricsId})

🎮 **Servidor**
${status.server || "Desconocido"}

⏱ **Tiempo jugando**
00h 00m

📡 Estado actualizado
hace unos segundos`
                )

                .setColor(0x00ff00)

                .setTimestamp();



                const mensaje =
                await canal.send({
                    embeds:[embed]
                });



                tracker.mensajeId =
                mensaje.id;



            }



            // Actualizar mensaje existente

            else if(tracker.mensajeId) {


                try {


                    const mensaje =
                    await canal.messages.fetch(
                        tracker.mensajeId
                    );



                    const embed =
                    new EmbedBuilder()

                    .setTitle(
                        "🎯 BattleMetrics Tracker"
                    )

                    .setDescription(
`🟢 **JUGADOR ONLINE**

👤 **${status.name}**

🆔 [Perfil BattleMetrics](https://www.battlemetrics.com/players/${tracker.battlemetricsId})

🎮 **Servidor**
${status.server || "Desconocido"}

⏱ **Tiempo jugando**
${formatoTiempo(tracker.inicioSesion)}

📡 Estado actualizado
hace unos segundos`
                    )

                    .setColor(0x00ff00)

                    .setTimestamp();



                    await mensaje.edit({
                        embeds:[embed]
                    });



                } catch(error) {

                    console.log(
                        "Error actualizando online:",
                        error.message
                    );

                }


            }



        }







        // ============================
        // JUGADOR OFFLINE
        // ============================

        if(
            !status.online &&
            tracker.ultimoEstado === "online"
        ) {



            tracker.ultimoEstado =
            "offline";



            const tiempoJugado =
            formatoTiempo(
                tracker.inicioSesion
            );



            try {


                if(tracker.mensajeId) {


                    const mensaje =
                    await canal.messages.fetch(
                        tracker.mensajeId
                    );



                    const embed =
                    new EmbedBuilder()

                    .setTitle(
                        "🎯 BattleMetrics Tracker"
                    )

                    .setDescription(
`🔴 **JUGADOR OFFLINE**

👤 **${status.name}**

🆔 [Perfil BattleMetrics](https://www.battlemetrics.com/players/${tracker.battlemetricsId})

🎮 **Último servidor**
${tracker.ultimoServidor || "Desconocido"}

⏱ **Tiempo jugado**
${tiempoJugado}

📡 Estado actualizado
hace unos segundos`
                    )

                    .setColor(0xff0000)

                    .setTimestamp();



                    await mensaje.edit({
                        embeds:[embed]
                    });



                } else {


                    const embed =
                    new EmbedBuilder()

                    .setTitle(
                        "🎯 BattleMetrics Tracker"
                    )

                    .setDescription(
`🔴 **JUGADOR OFFLINE**

👤 **${status.name}**

⏱ **Tiempo jugado**
${tiempoJugado}`
                    )

                    .setColor(0xff0000);



                    await canal.send({
                        embeds:[embed]
                    });


                }



            } catch(error) {


                console.log(
                    "Error enviando offline:",
                    error.message
                );


            }



            tracker.inicioSesion =
            null;



            tracker.ultimoServidor =
            null;



            tracker.mensajeId =
            null;


        }



    }



    guardarTrackers(trackers);


}




// Exportar

module.exports = {

    trackersFile,

    leerTrackers,

    guardarTrackers,

    obtenerBattleMetricsId,

    registrarTracker,

    revisarTrackers

};