const fs = require("fs");
const path = require("path");

const {
    getBattleMetricsPlayerStatus
} = require("./battlemetricsSearch");

const trackersFile = path.join(__dirname, "..", "data", "trackers.json");


// Crear carpeta y archivo si no existen
if (!fs.existsSync(path.dirname(trackersFile))) {
    fs.mkdirSync(path.dirname(trackersFile), { recursive: true });
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
            fs.readFileSync(trackersFile, "utf8")
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
            JSON.stringify(trackers, null, 4),
            "utf8"
        );

        console.log("✅ Archivo trackers.json actualizado");

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

    if (!texto)
        return null;


    texto = texto.trim();


    // Si es un número
    if (/^\d+$/.test(texto))
        return texto;


    // Si es un link
    const match = texto.match(/players\/(\d+)/);


    if (match)
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


    console.log("📌 ENTRANDO A registrarTracker()");
    console.log("🆔 ID RECIBIDO:", battlemetricsId);


    const trackers = leerTrackers();


    console.log(
        "📂 TRACKERS ANTES:",
        trackers
    );



    trackers[battlemetricsId] = {


        battlemetricsId,


        nombre,


        canalId,


        guildId,


        registradoPor,


        registradoEn: Date.now(),


        expiraEn:
            Date.now() + (24 * 60 * 60 * 1000),


        ultimoEstado: "offline",


        inicioSesion: null,


        ultimoServidor: null


    };



    guardarTrackers(trackers);



    console.log(
        "💾 GUARDADO EN:",
        trackersFile
    );


    console.log(
        "📂 TRACKERS DESPUÉS:",
        leerTrackers()
    );



    return trackers[battlemetricsId];


}



// ----------------------------
// Revisar trackers
// ----------------------------
async function revisarTrackers(client) {

    console.log("🔎 EJECUTANDO REVISION DE TRACKERS");

    const trackers = leerTrackers();


    for(const id in trackers){


        const tracker =
        trackers[id];


        // Revisar expiración 24 horas
        if(Date.now() > tracker.expiraEn){


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



        if(!status){

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



        // Detectar cambio de estado

        if(status.online && tracker.ultimoEstado === "offline"){


            tracker.ultimoEstado = "online";


            tracker.ultimoServidor =
            status.server;



            let canal;

try {

    canal =
    await client.channels.fetch(
        tracker.canalId
    );

} catch(error){

    console.log(
        "ERROR OBTENIENDO CANAL:",
        error.message
    );

}


            if(canal){

                canal.send({

                    content:
                    `🟢 **Jugador conectado**\n\n` +
                    `👤 ${status.name}\n` +
                    `🎮 Servidor: ${status.server || "Desconocido"}`

                });

            }


        }



        if(!status.online && tracker.ultimoEstado === "online"){


            tracker.ultimoEstado = "offline";



            let canal;

try {

    canal =
    await client.channels.fetch(
        tracker.canalId
    );

} catch(error){

    console.log(
        "ERROR OBTENIENDO CANAL:",
        error.message
    );

}

            if(canal){

                canal.send({

                    content:
                    `🔴 **Jugador desconectado**\n\n` +
                    `👤 ${status.name}`

                });

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