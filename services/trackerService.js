const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const Tracker = require("../models/TrackerSchema");
const { getBattleMetricsPlayerStatus } = require("./battlemetricsSearch");

// =====================================================
// OBTENER ID DE BATTLEMETRICS
// =====================================================

function obtenerBattleMetricsId(texto) {
    if (!texto) return null;

    texto = texto.trim();

    if (/^\d+$/.test(texto)) {
        return texto;
    }

    const match = texto.match(/battlemetrics\.com\/players\/(\d+)/i);

    if (match) {
        return match[1];
    }

    return null;
}

// =====================================================
// FORMATO DE TIEMPO
// =====================================================

function formatoTiempo(inicio) {
    if (!inicio) return "00h 00m";

    const minutos = Math.floor(
        (Date.now() - new Date(inicio).getTime()) / 60000
    );

    const horas = Math.floor(minutos / 60);
    const minutosRestantes = minutos % 60;

    return `${horas.toString().padStart(2, "0")}h ${minutosRestantes
        .toString()
        .padStart(2, "0")}m`;
}

// =====================================================
// BOTÓN BATTLEMETRICS
// =====================================================

function crearBotonBattleMetrics(battlemetricsId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel("Ver perfil BattleMetrics")
            .setStyle(ButtonStyle.Link)
            .setURL(
                `https://www.battlemetrics.com/players/${battlemetricsId}`
            )
            .setEmoji("🔗")
    );
}

// =====================================================
// EMBED ONLINE
// =====================================================

function crearEmbedOnline(status, tracker, servidorActual) {
    const serverToShow =
        servidorActual ||
        status.server ||
        "Desconocido";

    let tiempoMostrado = status.jugando;

    if (!tiempoMostrado || tiempoMostrado === "0m") {
        tiempoMostrado = formatoTiempo(
            tracker.inicioSesion || new Date()
        );
    }

    return new EmbedBuilder()
        .setAuthor({
            name: "RustLogix • BattleMetrics Tracker"
        })
        .setTitle("🟢 JUGADOR ONLINE")
        .setDescription(
            `**${status.name || tracker.nombre}** está actualmente conectado a un servidor.`
        )
        .setColor(0x57F287)
        .addFields(
            {
                name: "👤 Jugador",
                value: `**${status.name || tracker.nombre}**`,
                inline: false
            },
            {
                name: "🎮 Servidor actual",
                value: `\`${serverToShow}\``,
                inline: false
            },
            {
                name: "⏱️ Tiempo jugando",
                value: `\`${tiempoMostrado}\``,
                inline: true
            },
            {
                name: "📡 Estado",
                value: "🟢 **ONLINE**",
                inline: true
            },
            {
                name: "👁️ Tracker",
                value: "🟢 **Activo**",
                inline: true
            }
        )
        .setFooter({
            text: "RustLogix • Tracker activo"
        })
        .setTimestamp();
}

// =====================================================
// EMBED OFFLINE
// =====================================================

function crearEmbedOffline(tracker, tiempo, ultimoServidor) {
    const serverToShow =
        ultimoServidor ||
        tracker.ultimoServidor ||
        "Desconocido";

    return new EmbedBuilder()
        .setAuthor({
            name: "RustLogix • BattleMetrics Tracker"
        })
        .setTitle("🔴 JUGADOR OFFLINE")
        .setDescription(
            `**${tracker.nombre}** ha salido del servidor.`
        )
        .setColor(0xED4245)
        .addFields(
            {
                name: "👤 Jugador",
                value: `**${tracker.nombre}**`,
                inline: false
            },
            {
                name: "🎮 Último servidor",
                value: `\`${serverToShow}\``,
                inline: false
            },
            {
                name: "⏱️ Tiempo de sesión",
                value: `\`${tiempo}\``,
                inline: true
            },
            {
                name: "📡 Estado",
                value: "🔴 **OFFLINE**",
                inline: true
            },
            {
                name: "👁️ Tracker",
                value: "🟢 **Activo**",
                inline: true
            }
        )
        .setFooter({
            text: "RustLogix • Esperando próxima conexión"
        })
        .setTimestamp();
}

// =====================================================
// REGISTRAR TRACKER
// =====================================================

async function registrarTracker({
    battlemetricsId,
    nombre = "Desconocido",
    canalId,
    guildId,
    registradoPor
}) {
    try {
        const fechaExpiracion = new Date(
            Date.now() + 24 * 60 * 60 * 1000
        );

        const status =
            await getBattleMetricsPlayerStatus(battlemetricsId);

        const esOnline =
            status &&
            status.online === true;

        const nuevoTracker =
            await Tracker.findOneAndUpdate(
                {
                    battlemetricsId,
                    guildId
                },
                {
                    battlemetricsId,
                    nombre: status?.name || nombre,
                    canalId,
                    guildId,
                    registradoPor,
                    createdAt: new Date(),
                    expiresAt: fechaExpiracion,
                    ultimoEstado: esOnline
                        ? "online"
                        : "offline",
                    inicioSesion: esOnline
                        ? new Date()
                        : null,
                    ultimoServidor: esOnline
                        ? status?.server || "Desconocido"
                        : null,
                    ultimoServerId: esOnline
                        ? status?.serverId || null
                        : null
                },
                {
                    upsert: true,
                    returnDocument: "after",
                    setDefaultsOnInsert: true
                }
            );

        return nuevoTracker;

    } catch (error) {
        console.error(
            "ERROR REGISTRANDO TRACKER EN MONGO:",
            error
        );

        throw error;
    }
}

// =====================================================
// REVISAR TRACKERS
// =====================================================

async function revisarTrackers(client) {
    try {
        const trackers = await Tracker.find({});

        for (const tracker of trackers) {

            // =================================================
            // EXPIRACIÓN
            // =================================================

            if (
                new Date() >
                new Date(tracker.expiresAt)
            ) {
                await Tracker.deleteOne({
                    _id: tracker._id
                });

                continue;
            }

            // =================================================
            // CONSULTAR BATTLEMETRICS
            // =================================================

            const status =
                await getBattleMetricsPlayerStatus(
                    tracker.battlemetricsId
                );

            if (!status) continue;

            // =================================================
            // CANAL
            // =================================================

            let canal;

            try {
                canal = await client.channels.fetch(
                    tracker.canalId
                );
            } catch (e) {
                continue;
            }

            if (!canal) continue;

            const estaOnlineAhora =
                status.online === true;

            // =================================================
            // ESTADO DESCONOCIDO
            // =================================================

            if (
                tracker.ultimoEstado ===
                "desconocido"
            ) {
                tracker.ultimoEstado =
                    estaOnlineAhora
                        ? "online"
                        : "offline";

                tracker.inicioSesion =
                    estaOnlineAhora
                        ? new Date()
                        : null;

                tracker.ultimoServidor =
                    estaOnlineAhora
                        ? status.server ||
                          "Desconocido"
                        : tracker.ultimoServidor;

                tracker.ultimoServerId =
                    estaOnlineAhora
                        ? status.serverId
                        : null;

                await tracker.save();

                continue;
            }

            // =================================================
            // JUGADOR ONLINE
            // =================================================

            if (estaOnlineAhora) {

                // =============================================
                // VOLVIÓ A ENTRAR
                // =============================================

                if (
                    tracker.ultimoEstado ===
                    "offline"
                ) {
                    tracker.ultimoEstado =
                        "online";

                    tracker.inicioSesion =
                        new Date();

                    tracker.ultimoServidor =
                        status.server ||
                        "Desconocido";

                    tracker.ultimoServerId =
                        status.serverId;

                    await canal.send({
                        content:
                            `🔔 **${status.name || tracker.nombre} volvió a entrar al servidor**`,
                        embeds: [
                            crearEmbedOnline(
                                status,
                                tracker,
                                status.server
                            )
                        ],
                        components: [
                            crearBotonBattleMetrics(
                                tracker.battlemetricsId
                            )
                        ]
                    });

                // =============================================
                // SIGUE ONLINE
                // =============================================

                } else if (
                    tracker.ultimoEstado ===
                    "online"
                ) {

                    // =========================================
                    // CAMBIO DE SERVIDOR
                    // =========================================

                    if (
                        status.serverId &&
                        tracker.ultimoServerId &&
                        status.serverId !==
                            tracker.ultimoServerId
                    ) {
                        const viejoServer =
                            tracker.ultimoServidor;

                        tracker.ultimoServidor =
                            status.server ||
                            "Desconocido";

                        tracker.ultimoServerId =
                            status.serverId;

                        tracker.inicioSesion =
                            new Date();

                        const embedCambio =
                            new EmbedBuilder()
                                .setAuthor({
                                    name: "RustLogix • BattleMetrics Tracker"
                                })
                                .setTitle(
                                    "🔀 CAMBIO DE SERVIDOR"
                                )
                                .setDescription(
                                    `**${status.name || tracker.nombre}** ha cambiado de servidor.`
                                )
                                .setColor(0xFEE75C)
                                .addFields(
                                    {
                                        name: "👤 Jugador",
                                        value:
                                            `**${status.name || tracker.nombre}**`,
                                        inline: false
                                    },
                                    {
                                        name: "📤 Servidor anterior",
                                        value:
                                            `\`${viejoServer || "Desconocido"}\``,
                                        inline: false
                                    },
                                    {
                                        name: "📥 Servidor actual",
                                        value:
                                            `\`${tracker.ultimoServidor}\``,
                                        inline: false
                                    },
                                    {
                                        name: "⏱️ Nueva sesión",
                                        value:
                                            "`00h 00m`",
                                        inline: true
                                    },
                                    {
                                        name: "📡 Estado",
                                        value:
                                            "🟢 **ONLINE**",
                                        inline: true
                                    },
                                    {
                                        name: "👁️ Tracker",
                                        value:
                                            "🟢 **Activo**",
                                        inline: true
                                    }
                                )
                                .setFooter({
                                    text: "RustLogix • Tracker activo"
                                })
                                .setTimestamp();

                        await canal.send({
                            content:
                                `🔀 **${status.name || tracker.nombre} cambió de servidor**`,
                            embeds: [embedCambio],
                            components: [
                                crearBotonBattleMetrics(
                                    tracker.battlemetricsId
                                )
                            ]
                        });

                    // =========================================
                    // ACTUALIZAR DATOS
                    // =========================================

                    } else if (
                        status.server &&
                        status.server !==
                            "Desconocido"
                    ) {
                        tracker.ultimoServidor =
                            status.server;

                        tracker.ultimoServerId =
                            status.serverId;
                    }
                }

            // =================================================
            // JUGADOR OFFLINE
            // =================================================

            } else if (
                !estaOnlineAhora &&
                tracker.ultimoEstado ===
                    "online"
            ) {
                const tiempoJugado =
                    formatoTiempo(
                        tracker.inicioSesion
                    );

                const servidorDondeEstaba =
                    tracker.ultimoServidor ||
                    "Desconocido";

                tracker.ultimoEstado =
                    "offline";

                tracker.inicioSesion =
                    null;

                tracker.ultimoServerId =
                    null;

                await canal.send({
                    content:
                        `🔔 **${tracker.nombre} salió del servidor**`,
                    embeds: [
                        crearEmbedOffline(
                            tracker,
                            tiempoJugado,
                            servidorDondeEstaba
                        )
                    ],
                    components: [
                        crearBotonBattleMetrics(
                            tracker.battlemetricsId
                        )
                    ]
                });
            }

            await tracker.save();
        }

    } catch (error) {
        console.error(
            "ERROR EN REVISAR TRACKERS:",
            error
        );
    }
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
    obtenerBattleMetricsId,
    registrarTracker,
    revisarTrackers
};