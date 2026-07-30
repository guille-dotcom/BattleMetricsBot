const { EmbedBuilder } = require("discord.js");
const Tracker = require("../models/TrackerSchema");

const {
    getBattleMetricsPlayerStatus
} = require("./battlemetricsSearch");

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
    const minutos = Math.floor((Date.now() - new Date(inicio).getTime()) / 60000);
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

// Registrar tracker en MongoDB
async function registrarTracker({
    battlemetricsId,
    nombre = "Desconocido",
    canalId,
    guildId,
    registradoPor
}) {
    try {
        const fechaExpiracion = new Date(Date.now() + (24 * 60 * 60 * 1000));

        const nuevoTracker = await Tracker.findOneAndUpdate(
            { battlemetricsId, guildId },
            {
                battlemetricsId,
                nombre,
                canalId,
                guildId,
                registradoPor,
                createdAt: new Date(),
                expiresAt: fechaExpiracion,
                ultimoEstado: "desconocido",
                inicioSesion: null,
                ultimoServidor: null,
                ultimoServerId: null
            },
            { upsert: true, returnDocument: 'after' }
        );

        return nuevoTracker;
    } catch (error) {
        console.error("ERROR REGISTRANDO TRACKER EN MONGO:", error);
        throw error;
    }
}

// Revisar trackers desde MongoDB
async function revisarTrackers(client) {
    try {
        const trackers = await Tracker.find({});

        for(const tracker of trackers) {
            if(new Date() > new Date(tracker.expiresAt)) {
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

            // ============================
            // 1. PRIMERA REVISIÓN
            // ============================
            if(tracker.ultimoEstado === "desconocido"){
                if(status.online){
                    tracker.ultimoEstado = "online";
                    tracker.inicioSesion = new Date();
                    tracker.ultimoServidor = status.server;
                    tracker.ultimoServerId = status.serverId;

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
                await tracker.save();
                continue;
            }

            // ============================
            // 2. CAMBIO OFFLINE -> ONLINE
            // ============================
            if(status.online && tracker.ultimoEstado === "offline"){
                tracker.ultimoEstado = "online";
                tracker.inicioSesion = new Date();
                tracker.ultimoServidor = status.server;
                tracker.ultimoServerId = status.serverId;

                await canal.send({
                    content: `🔔 **${status.name} volvió a entrar al servidor**`,
                    embeds: [crearEmbedOnline(status, tracker, status.server)]
                });

                await tracker.save();
                continue;
            }

            // ============================
            // 3. SIGUE ONLINE (O CAMBIÓ DE SERVIDOR)
            // ============================
            if(status.online && tracker.ultimoEstado === "online"){
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
                        content: `🔀 **${status.name} cambió de servidor** (De: \`${viejoServer}\` a \`${status.server}\`)`,
                        embeds: [crearEmbedOnline(status, tracker, status.server)]
                    });
                } else if (status.server && status.server !== "Desconocido") {
                    tracker.ultimoServidor = status.server;
                    tracker.ultimoServerId = status.serverId;
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
                tracker.ultimoServerId = null;
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