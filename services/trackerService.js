const fs = require("fs");
const path = require("path");

const {
    getBattleMetricsPlayerStatus
} = require("./battlemetricsSearch");


const trackersFile =
path.join(
    __dirname,
    "..",
    "data",
    "trackers.json"
);


// Crear carpeta y archivo si no existen
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


// ----------------------------
// Leer trackers
// ----------------------------
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



// ----------------------------
// Guardar trackers
// ----------------------------
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



// ----------------------------
// Obtener ID BattleMetrics
// ----------------------------
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



// ----------------------------
// Registrar tracker
// ----------------------------
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
// ----------------------------
// Revisar trackers
// ----------------------------
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



        console.log(
            "TRACKER:",
            status.name,
            status.online
        );



        // ============================
        // JUGADOR ONLINE
        // ============================

        if(
            status.online &&
            tracker.ultimoEstado === "offline"
        ) {


            tracker.ultimoEstado =
            "online";


            tracker.ultimoServidor =
            status.server;



            tracker.inicioSesion =
            Date.now();



            const canal =
            await client.channels.fetch(
                tracker.canalId
            );



            


               if(canal) {

   await canal.send({

content:

`🎯 **BattleMetrics Tracker**

🔴 **JUGADOR OFFLINE**

👤 ${status.name}

🆔 https://www.battlemetrics.com/players/${tracker.battlemetricsId}

🎮 **Último servidor**
${tracker.ultimoServidor || "Desconocido"}

⏱ **Tiempo jugado**
${horas.toString().padStart(2,"0")}h ${minutosRestantes.toString().padStart(2,"0")}m

📡 Estado actualizado
hace unos segundos`

});


tracker.inicioSesion = null;
tracker.ultimoServidor = null;

      
// ============================
// JUGADOR OFFLINE
// ============================
if(
    !status.online &&
    tracker.ultimoEstado === "online"
) {

    tracker.ultimoEstado = "offline";



            try {


                const canal =
                await client.channels.fetch(
                    tracker.canalId
                );



                if(canal) {

const minutos =
Math.floor(
    (Date.now() - tracker.inicioSesion) / 60000
);

const horas =
Math.floor(
    minutos / 60
);

const minutosRestantes =
minutos % 60;
                   await canal.send({

content:

`🎯 **BattleMetrics Tracker**

🔴 **JUGADOR OFFLINE**

👤 ${status.name}

🆔 https://www.battlemetrics.com/players/${tracker.battlemetricsId}

🎮 **Último servidor**
${tracker.ultimoServidor || "Desconocido"}

⏱ **Tiempo jugado**
${horas.toString().padStart(2,"0")}h ${minutosRestantes.toString().padStart(2,"0")}m

📡 Estado actualizado
hace unos segundos`

});


tracker.inicioSesion = null;


                }



            } catch(error) {


                console.log(
                    "Error enviando offline:",
                    error.message
                );


            }



        }



    }



    guardarTrackers(trackers);

}



// ----------------------------
// Exportar
// ----------------------------

module.exports = {


    trackersFile,


    leerTrackers,


    guardarTrackers,


    obtenerBattleMetricsId,


    registrarTracker,


    revisarTrackers


};