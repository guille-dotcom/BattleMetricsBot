const { EmbedBuilder } = require("discord.js");
const Tracker = require("../models/TrackerSchema");

const {
    getBattleMetricsPlayerStatus
} = require("./battlemetricsSearch");

function obtenerBattleMetricsId(texto) {
    if(!texto) return null;
    texto = texto.trim();
    if(/^\d+$/.test(texto)) return texto;
    const match = texto.match(/players\/(\d+)/);
    if(match) return match[1];
    return null;
}

function formatoTiempo(inicio) {
    if(!inicio) return "00h 00m";
    const minutos = Math.floor((Date.now() - new Date(inicio).getTime()) / 60000);
    const horas = Math.floor(minutos / 60);
    const minutosRestantes = minutos % 60;
    return `${horas.toString().padStart(2,"0")}h ${minutosRestantes.toString().padStart(2,"0")}m`;
}

function crearEmbedOnline(status, tracker, servidorActual) {
    const serverToShow = servidorActual || status.server || "Desconocido";
    return new EmbedBuilder()
        .setTitle("🎯 RustLogix")
        .setDescription(
`🟢 **JUGADOR ONLINE**

👤 **${status.name || tracker.nombre}**

🆔 [Perfil BattleMetrics](https://www.battlemetrics.com/players/${tracker.battlemetricsId})

🎮 **Servidor**
${serverToShow}

⏱ **Jugando**
${status.jugando || "0m"}

📡 Estado actualizado`
        )
        .setColor(0x00ff00)
        .setTimestamp();
}

function crearEmbedOffline(status, tracker, tiempo, ultimoServidor) {
    const serverToShow = ultimoServidor || tracker.ultimoServidor || "Desconocido";
    return new EmbedBuilder()
        .setTitle("🎯 RustLogix")
        .setDescription(
`🔴 **JUGADOR OFFLINE**

👤 **${tracker.nombre}**

🆔 [Perfil BattleMetrics](https://www.battlemetrics.com/players/${tracker.battlemetricsId})

🎮 **Último servidor**
${serverToShow}

⏱ **Tiempo jugado**
${tiempo}

📡 Estado actualizado`
        )
        .setColor(0xff0000)
        .setTimestamp();
}

async function registrarTracker({
    battlemetricsId,
    nombre = "Desconocido",
    canalId,
    guildId,
    registradoPor,
    estadoForzado = null,
    inicioSesionForzado = null,
    servidorForzado = null,
    serverIdForzado = null
}) {
    try {
        const fechaExpiracion = new Date(Date.now() + (24 * 60 * 60 * 1000));
        const status = await getBattleMetricsPlayerStatus(battlemetricsId);
        
        const esOnline = status && (status.online === true || status.online === "true");

        const nuevoTracker = await Tracker.findOneAndUpdate(
            { battlemetricsId, guildId },
            {
                battlemetricsId,
                nombre: status?.name || nombre,
                canalId,
                guildId,
                registradoPor,
                createdAt: new Date(),
                expiresAt: fechaExpiracion,
                ultimoEstado: estadoForzado || (esOnline ? "online" : "offline"),
                inicioSesion: inicioSesionForzado !== undefined ? inicioSesionForzado : (esOnline ? new Date() : null),
                ultimoServidor: servidorForzado !== undefined ? servidorForzado : (esOnline ? status?.server : null),
                ultimoServerId: serverIdForzado !== undefined ? serverIdForzado : (esOnline ? status?.serverId : null)
            },
            { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
        );

        return nuevoTracker;
    } catch (error) {
        console.error("ERROR REGISTRANDO TRACKER EN MONGO:", error);
        throw error;
    }
}

async function revisarTrackers(client, specificTrackerId = null) {
    try {
        const query = specificTrackerId ? { _id: specificTrackerId } : {};
        const trackers = await Tracker.find(query);

        for(const tracker of trackers) {
            if(!specificTrackerId && new Date() > new Date(tracker.expiresAt)) {
                await Tracker.deleteOne({ _id: tracker._id });
                console.log("🗑 Tracker expirado:", tracker.battlemetricsId);
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

            const estaOnlineAhora = status.online === true || status.online === "true";

            if(tracker.ultimoEstado === "desconocido") {
                tracker.ultimoEstado = estaOnlineAhora ? "online" : "offline";
                if(estaOnlineAhora) {
                    tracker.inicioSesion = new Date();
                    tracker.ultimoServidor = status.server;
                    tracker.ultimoServerId = status.serverId;
                    await canal.send({ embeds: [crearEmbedOnline(status, tracker, status.server)] });
                } else {
                    tracker.inicioSesion = null;
                    tracker.ultimoServerId = null;
                }
                await tracker.save();
                continue;
            }

            // ============================
            // 1. CAMBIO OFFLINE -> ONLINE
            // ============================
            if(estaOnlineAhora && tracker.ultimoEstado === "offline") {
                tracker.ultimoEstado = "online";
                tracker.inicioSesion = new Date();
                tracker.ultimoServidor = status.server;
                tracker.ultimoServerId = status.serverId;

                await canal.send({
                    content: `🔔 **${status.name || tracker.nombre} volvió a entrar al servidor**`,
                    embeds: [crearEmbedOnline(status, tracker, status.server)]
                });

                await tracker.save();
                continue;
            }

            // ============================
            // 2. SIGUE ONLINE (Revisar cambio de servidor)
            // ============================
            if(estaOnlineAhora && tracker.ultimoEstado === "online") {
                if (
                    status.serverId && 
                    tracker.ultimoServerId && 
                    status.serverId !== tracker.ultimoServerId
                ) {
                    const viejoServer = tracker.ultimoServidor;
                    tracker.ultimoServidor = status.server;
                    tracker.ultimoServerId = status.serverId;
                    tracker.inicioSesion = new Date();

                    await canal.send({
                        content: `🔀 **${status.name || tracker.nombre} cambió de servidor** (De: \`${viejoServer}\` a \`${status.server}\`)`,
                        embeds: [crearEmbedOnline(status, tracker, status.server)]
                    });
                } else if (status.server && status.server !== "Desconocido") {
                    tracker.ultimoServidor = status.server;
                    tracker.ultimoServerId = status.serverId;
                }
            }

            // ============================
            // 3. CAMBIO ONLINE -> OFFLINE
            // ============================
            if(!estaOnlineAhora && tracker.ultimoEstado === "online") {
                const tiempoJugado = (status.jugando && status.jugando !== "0m") ? status.jugando : formatoTiempo(tracker.inicioSesion);
                const servidorDondeEstaba = tracker.ultimoServidor || "Desconocido";

                tracker.ultimoEstado = "offline";
                tracker.inicioSesion = null;
                tracker.ultimoServerId = null;

                await canal.send({
                    content: `🔔 **${tracker.nombre} salió del servidor**`,
                    embeds: [crearEmbedOffline(status, tracker, tiempoJugado, servidorDondeEstaba)]
                });
            }

            await tracker.save();
        }
    } catch (error) {
        console.error("ERROR EN REVISAR TRACKERS:", error);
    }
}

module.exports = {
    obtenerBattleMetricsId,
    registrarTracker,
    revisarTrackers
};