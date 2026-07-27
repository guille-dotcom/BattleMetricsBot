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
    fs.mkdirSync(path.dirname(trackersFile), { recursive: true });
}

if (!fs.existsSync(trackersFile)) {
    fs.writeFileSync(trackersFile, JSON.stringify({}, null, 4));
}

// Leer trackers
function leerTrackers() {
    try {
        return JSON.parse(fs.readFileSync(trackersFile, "utf8"));
    } catch(error) {
        console.error("ERROR LEYENDO TRACKERS:", error);
        return {};
    }
}

// Guardar trackers
function guardarTrackers(trackers) {
    try {
        fs.writeFileSync(trackersFile, JSON.stringify(trackers, null, 4), "utf8");
    } catch(error) {
        console.error("ERROR GUARDANDO TRACKERS:", error);
    }
}

// Obtener ID BattleMetrics
function obtenerBattleMetricsId(texto) {
    if(!texto) return null;
    texto = texto.trim();
    if(/^\d+$/.test(texto)) return texto;
    const match = texto.match(/players\/(\d+)/);
    if(match) return match[1];
    return null;
}

// Formato tiempo
function formatoTiempo(inicio) {
    if(!inicio) return "00h 00m";
    const minutos = Math.floor((Date.now() - inicio) / 60000);
    const horas = Math.floor(minutos / 60);
    const minutosRestantes = minutos % 60;
    return `${horas.toString().padStart(2,"0")}h ${minutosRestantes.toString().padStart(2,"0")}m`;
}

// ============================
// CREAR EMBED ONLINE
// ============================
function crearEmbedOnline(status, tracker, servidorActual) {
    const serverToShow = servidorActual || status.server || "Desconocido";
    return new EmbedBuilder()
        .setTitle("🎯 RustLogix")
        .setDescription(
`🟢 **JUGADOR ONLINE**

👤 **${status.name}**

🆔 [Perfil BattleMetrics](https://www.battlemetrics.com/players/${tracker.battlemetricsId})

🎮 **Servidor**
||${serverToShow}||

⏱ **Jugando**
${status.jugando || "0m"}

📡 Estado actualizado`
        )
        .setColor(0x00ff00)
        .setTimestamp();
}

// ============================
// CREAR EMBED OFFLINE
// ============================
function crearEmbedOffline(status, tracker, tiempo, ultimoServidor) {
    const serverToShow = ultimoServidor || tracker.ultimoServidor || "Desconocido";
    return new EmbedBuilder()
        .setTitle("🎯 RustLogix")
        .setDescription(
`🔴 **JUGADOR OFFLINE**

👤 **${status.name}**

🆔 [Perfil BattleMetrics](https://www.battlemetrics.com/players/${tracker.battlemetricsId})

🎮 **Último servidor**
||${serverToShow}||

⏱ **Tiempo jugado**
${tiempo}

📡 Estado actualizado`
        )
        .setColor(0xff0000)
        .setTimestamp();
}

// Registrar tracker
function registrarTracker({
    battlemetricsId,
    nombre = "Desconocido",
    canalId,
    guildId,
    registradoPor
}) {
    const trackers = leerTrackers();

    trackers[battlemetricsId] = {
        battlemetricsId,
        nombre,
        canalId,
        guildId,
        registradoPor,
        registradoEn: Date.now(),
        expiraEn: Date.now() + (24 * 60 * 60 * 1000),
        ultimoEstado: "desconocido",
        inicioSesion: null,
        ultimoServidor: null
    };

    guardarTrackers(trackers);
    return trackers[battlemetricsId];
}

// Revisar trackers
async function revisarTrackers(client) {
    const trackers = leerTrackers();

    for(const id in trackers) {
        const tracker = trackers[id];

        if(Date.now() > tracker.expiraEn) {
            delete trackers[id];
            console.log("🗑 Tracker expirado:", id);
            continue;
        }

        const status = await getBattleMetricsPlayerStatus(tracker.battlemetricsId);
        if(!status) continue;

        let canal;
        try {
            canal = await client.channels.fetch(tracker.canalId);
        } catch (e) {
            continue;
        }
        if(!canal) continue;

        // ============================
        // 1. PRIMERA REVISIÓN
        // ============================
        if(tracker.ultimoEstado === "desconocido"){
            if(status.online){
                tracker.ultimoEstado = "online";
                tracker.inicioSesion = Date.now();
                tracker.ultimoServidor = status.server;

                await canal.send({
                    embeds: [crearEmbedOnline(status, tracker, status.server)]
                });
            } else {
                tracker.ultimoEstado = "offline";
                await canal.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("🎯 RustLogix")
                            .setDescription(
`🔴 **JUGADOR OFFLINE**

👤 **${status.name}**

🆔 [Perfil BattleMetrics](https://www.battlemetrics.com/players/${tracker.battlemetricsId})

⏳ Esperando conexión...

📡 Tracker activo`
                            )
                            .setColor(0xff0000)
                            .setTimestamp()
                    ]
                });
            }
            guardarTrackers(trackers);
            continue;
        }

        // ============================
        // 2. CAMBIO OFFLINE -> ONLINE
        // ============================
        if(status.online && tracker.ultimoEstado === "offline"){
            tracker.ultimoEstado = "online";
            tracker.inicioSesion = Date.now();
            tracker.ultimoServidor = status.server;

            await canal.send({
                content: `🔔 **${status.name} volvió a entrar al servidor**`,
                embeds: [crearEmbedOnline(status, tracker, status.server)]
            });

            guardarTrackers(trackers);
            continue;
        }

        // ============================
        // 3. SIGUE ONLINE (O CAMBIÓ DE SERVIDOR DIRECTO)
        // ============================
        if(status.online && tracker.ultimoEstado === "online"){
            // Detectar cambio de servidor sin desconexión previa
            if (
                status.server && 
                tracker.ultimoServidor && 
                status.server !== tracker.ultimoServidor &&
                status.server !== "Desconocido"
            ) {
                const viejoServer = tracker.ultimoServidor;
                tracker.ultimoServidor = status.server;
                tracker.inicioSesion = Date.now();

                await canal.send({
                    content: `🔀 **${status.name} cambió de servidor** (De: \`${viejoServer}\` a \`${status.server}\`)`,
                    embeds: [crearEmbedOnline(status, tracker, status.server)]
                });
            } else if (status.server && status.server !== "Desconocido") {
                tracker.ultimoServidor = status.server;
            }
        }

        // ============================
        // 4. CAMBIO ONLINE -> OFFLINE
        // ============================
        if(!status.online && tracker.ultimoEstado === "online"){
            const tiempoJugado = status.jugando !== "0m" ? status.jugando : formatoTiempo(tracker.inicioSesion);
            const servidorDondeEstaba = tracker.ultimoServidor || status.server;

            tracker.ultimoEstado = "offline";

            await canal.send({
                content: `🔔 **${status.name} salió del servidor**`,
                embeds: [crearEmbedOffline(status, tracker, tiempoJugado, servidorDondeEstaba)]
            });

            tracker.inicioSesion = null;
        }

        guardarTrackers(trackers);
    }
}

module.exports = {
    trackersFile,
    leerTrackers,
    guardarTrackers,
    obtenerBattleMetricsId,
    registrarTracker,
    revisarTrackers
};