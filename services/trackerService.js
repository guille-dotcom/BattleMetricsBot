const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const Tracker = require("../models/TrackerSchema");

const ServerConfig =
    require("../models/ServerConfig");

const {
    obtenerNombreSteam,
    searchBattleMetricsPlayer,
    getBattleMetricsPlayerStatus
} = require("./battlemetricsSearch");

// =====================================================
// OBTENER ID DE BATTLEMETRICS
// =====================================================

function obtenerBattleMetricsId(texto) {

    if (!texto) {
        return null;
    }

    texto =
        String(texto).trim();

    // =================================================
    // LINK DE BATTLEMETRICS
    // =================================================

    const match =
        texto.match(
            /battlemetrics\.com\/players\/(\d+)/i
        );

    if (match) {
        return match[1];
    }

    // =================================================
    // ID BATTLEMETRICS
    // =================================================

    // Un Steam ID normalmente tiene 17 dígitos.
    // Por eso NO lo tratamos aquí como BM ID.

    if (
        /^\d+$/.test(texto) &&
        !/^\d{17}$/.test(texto)
    ) {
        return texto;
    }

    return null;
}

// =====================================================
// DETECTAR STEAM ID
// =====================================================

function esSteamId(texto) {

    if (!texto) {
        return false;
    }

    return /^\d{17}$/.test(
        String(texto).trim()
    );
}

// =====================================================
// OBTENER SERVIDOR CONFIGURADO
// =====================================================

async function obtenerServidorConfigurado(
    guildId
) {

    try {

        const config =
            await ServerConfig.findOne({
                guildId
            });

        if (
            !config ||
            !config.battleMetricsServerId
        ) {
            return null;
        }

        return String(
            config.battleMetricsServerId
        );

    } catch (error) {

        console.error(
            "[TRACKER] Error obteniendo servidor configurado:",
            error
        );

        return null;
    }
}

// =====================================================
// BUSCAR TRACKER ACTIVO EXISTENTE
// =====================================================

async function buscarTrackerActivo(
    battlemetricsId,
    guildId
) {

    try {

        const tracker =
            await Tracker.findOne({
                battlemetricsId:
                    String(battlemetricsId),
                guildId,
                expiresAt: {
                    $gt: new Date()
                }
            });

        return tracker;

    } catch (error) {

        console.error(
            "[TRACKER] Error buscando tracker existente:",
            error
        );

        return null;
    }
}

// =====================================================
// RESOLVER JUGADOR DEL TRACKER
// =====================================================

async function resolverJugadorTracker(
    texto,
    guildId
) {

    if (!texto) {

        return {
            ok: false,
            error: "entrada_invalida"
        };
    }

    const entrada =
        String(texto).trim();

    // =================================================
    // 1. LINK O ID DE BATTLEMETRICS
    // =================================================

    const battlemetricsId =
        obtenerBattleMetricsId(
            entrada
        );

    if (battlemetricsId) {

        const status =
            await getBattleMetricsPlayerStatus(
                battlemetricsId
            );

        return {
            ok: true,
            battlemetricsId,
            nombre:
                status?.name ||
                "Desconocido",
            origen: "battlemetrics"
        };
    }

    // =================================================
    // 2. STEAM ID
    // =================================================

    if (esSteamId(entrada)) {

        const servidorConfigurado =
            await obtenerServidorConfigurado(
                guildId
            );

        if (!servidorConfigurado) {

            return {
                ok: false,
                error:
                    "servidor_no_configurado"
            };
        }

        // ---------------------------------------------
        // STEAM ID → NOMBRE
        // ---------------------------------------------

        const nombreSteam =
            await obtenerNombreSteam(
                entrada
            );

        if (!nombreSteam) {

            return {
                ok: false,
                error:
                    "steam_no_encontrado"
            };
        }

        // ---------------------------------------------
        // NOMBRE → JUGADOR BM DEL SERVIDOR
        // ---------------------------------------------

        const jugadorBM =
            await searchBattleMetricsPlayer(
                nombreSteam,
                servidorConfigurado
            );

        if (!jugadorBM) {

            return {
                ok: false,
                error:
                    "jugador_no_encontrado_servidor",
                nombreSteam,
                servidorConfigurado
            };
        }

        return {
            ok: true,
            battlemetricsId:
                String(jugadorBM.id),
            nombre:
                jugadorBM.attributes?.name ||
                nombreSteam,
            origen: "steam",
            steamId: entrada,
            servidorConfigurado
        };
    }

    return {
        ok: false,
        error: "entrada_invalida"
    };
}

// =====================================================
// FORMATO DE TIEMPO
// =====================================================

function formatoTiempo(ms) {

    if (!ms || ms < 0) {
        return "0m";
    }

    const segundos =
        Math.floor(ms / 1000);

    const dias =
        Math.floor(
            segundos / 86400
        );

    const horas =
        Math.floor(
            (segundos % 86400) / 3600
        );

    const minutos =
        Math.floor(
            (segundos % 3600) / 60
        );

    const partes = [];

    if (dias > 0) {
        partes.push(`${dias}d`);
    }

    if (horas > 0) {
        partes.push(`${horas}h`);
    }

    if (
        minutos > 0 ||
        partes.length === 0
    ) {
        partes.push(`${minutos}m`);
    }

    return partes.join(" ");
}

// =====================================================
// BOTÓN BATTLEMETRICS
// =====================================================

function crearBotonBattleMetrics(
    battlemetricsId
) {

    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setLabel(
                    "BattleMetrics"
                )
                .setStyle(
                    ButtonStyle.Link
                )
                .setURL(
                    `https://www.battlemetrics.com/players/${battlemetricsId}`
                )
        );
}

// =====================================================
// CREAR EMBED ONLINE
// =====================================================

function crearEmbedOnline(
    status,
    tracker,
    servidorConfigurado
) {

    const nombreJugador =
        String(
            status?.name ||
            tracker?.nombre ||
            "Desconocido"
        );

    const servidorActual =
        String(
            status?.server ||
            "Servidor desconocido"
        );

    // =================================================
    // TIEMPO REAL DE LA SESIÓN
    // =================================================

    const tiempoJugando =
        String(
            status?.tiempoJugando ||
            "0m"
        );

    const esServidorConfigurado =
        Boolean(
            status?.serverId &&
            servidorConfigurado &&
            String(status.serverId) ===
                String(servidorConfigurado)
        );

    return new EmbedBuilder()
        .setTitle(
            "🟢 JUGADOR ONLINE"
        )
        .setDescription(
            `**${nombreJugador}** está actualmente conectado al servidor.`
        )
        .setColor(0x00ff00)
        .addFields(
            {
                name: "👤 Jugador",
                value:
                    `\`${nombreJugador}\``,
                inline: false
            },
            {
                name: "🎮 Servidor",
                value:
                    servidorActual,
                inline: false
            },
            {
                name: "⏱ Jugando",
                value:
                    tiempoJugando,
                inline: true
            },
            {
                name: "📡 Estado",
                value:
                    esServidorConfigurado
                        ? "🟢 ONLINE"
                        : "🟡 OTRO SERVIDOR",
                inline: true
            },
            {
                name: "🎯 Tracker",
                value:
                    "Activo",
                inline: true
            }
        )
        .setTimestamp()
        .setFooter({
            text: "RustLogix"
        });
}

// =====================================================
// CREAR EMBED OTRO SERVIDOR
// =====================================================

function crearEmbedOtroServidor(
    status,
    tracker,
    servidorConfigurado
) {

    const nombreJugador =
        String(
            status?.name ||
            tracker?.nombre ||
            "Desconocido"
        );

    const servidorActual =
        String(
            status?.server ||
            "Servidor desconocido"
        );

    const serverIdActual =
        status?.serverId
            ? String(status.serverId)
            : "Desconocido";

    const servidorConfiguradoTexto =
        String(
            servidorConfigurado ||
            "No configurado"
        );

    const tiempoJugando =
        String(
            status?.tiempoJugando ||
            "0m"
        );

    return new EmbedBuilder()
        .setTitle(
            "🔄 CAMBIO DE SERVIDOR"
        )
        .setDescription(
            `**${nombreJugador}** salió del servidor y ahora está en otro servidor.`
        )
        .setColor(0xffff00)
        .addFields(
            {
                name: "👤 Jugador",
                value:
                    `\`${nombreJugador}\``,
                inline: false
            },
            {
                name: "🎮 Servidor actual",
                value:
                    servidorActual,
                inline: false
            },
            {
                name: "🆔 Servidor actual",
                value:
                    `\`${serverIdActual}\``,
                inline: true
            },
            {
                name: "🎯 Servidor configurado",
                value:
                    `\`${servidorConfiguradoTexto}\``,
                inline: true
            },
            {
                name: "⏱ Jugando",
                value:
                    tiempoJugando,
                inline: true
            },
            {
                name: "📡 Estado",
                value:
                    "🟡 OTRO SERVIDOR",
                inline: true
            },
            {
                name: "🎯 Tracker",
                value:
                    "Activo",
                inline: true
            }
        )
        .setTimestamp()
        .setFooter({
            text: "RustLogix"
        });
}

// =====================================================
// CREAR EMBED OFFLINE
// =====================================================

function crearEmbedOffline(
    tracker,
    tiempo,
    ultimoServidor
) {

    const nombreJugador =
        String(
            tracker?.nombre ||
            "Desconocido"
        );

    const servidorAnterior =
        String(
            ultimoServidor ||
            "Desconocido"
        );

    const tiempoSesion =
        String(
            tiempo ||
            "0m"
        );

    return new EmbedBuilder()
        .setTitle(
            "🔴 JUGADOR OFFLINE"
        )
        .setDescription(
            `**${nombreJugador}** salió del servidor y ya no aparece conectado en BattleMetrics.`
        )
        .setColor(0xff0000)
        .addFields(
            {
                name: "👤 Jugador",
                value:
                    `\`${nombreJugador}\``,
                inline: false
            },
            {
                name: "🎮 Último servidor",
                value:
                    servidorAnterior,
                inline: false
            },
            {
                name: "⏱ Tiempo de sesión",
                value:
                    tiempoSesion,
                inline: true
            },
            {
                name: "📡 Estado",
                value:
                    "🔴 OFFLINE",
                inline: true
            },
            {
                name: "🎯 Tracker",
                value:
                    "Activo",
                inline: true
            }
        )
        .setTimestamp()
        .setFooter({
            text: "RustLogix"
        });
}

// =====================================================
// REGISTRAR TRACKER
// =====================================================

async function registrarTracker({
    battlemetricsId,
    nombre,
    canalId,
    guildId,
    registradoPor,
    estadoForzado,
    inicioSesionForzado,
    servidorForzado,
    serverIdForzado
}) {

    // =================================================
    // EVITAR DUPLICADOS
    // =================================================

    const trackerExistente =
        await buscarTrackerActivo(
            battlemetricsId,
            guildId
        );

    if (trackerExistente) {

        return {
            tracker:
                trackerExistente,
            existente: true
        };
    }

    // =================================================
    // NUEVO TRACKER
    // =================================================

    const ahora =
        new Date();

    const expiresAt =
        new Date(
            ahora.getTime() +
            24 * 60 * 60 * 1000
        );

    const servidorConfigurado =
        await obtenerServidorConfigurado(
            guildId
        );

    let status = null;

    try {

        status =
            await getBattleMetricsPlayerStatus(
                battlemetricsId
            );

    } catch (error) {

        console.error(
            `[TRACKER] Error consultando ${battlemetricsId}:`,
            error
        );
    }

    // =================================================
    // SI LA CONSULTA FALLÓ
    // =================================================

    const consultaFallida =
        Boolean(
            status?.error === true
        );

    // =================================================
    // ESTADO ACTUAL
    // =================================================

    const estaOnline =
        Boolean(
            !consultaFallida &&
            status &&
            status.online === true
        );

    const serverIdActual =
        status?.serverId
            ? String(status.serverId)
            : null;

    const estaEnServidorConfigurado =
        Boolean(
            estaOnline &&
            servidorConfigurado &&
            serverIdActual &&
            serverIdActual ===
                String(servidorConfigurado)
        );

    let estadoInicial;

    if (estadoForzado) {

        estadoInicial =
            String(estadoForzado);

    } else if (consultaFallida) {

        estadoInicial =
            "desconocido";

    } else if (
        estaEnServidorConfigurado
    ) {

        estadoInicial =
            "online";

    } else if (estaOnline) {

        estadoInicial =
            "otro_servidor";

    } else {

        estadoInicial =
            "offline";
    }

    const inicioSesion =
        inicioSesionForzado !== undefined
            ? inicioSesionForzado
            : estaEnServidorConfigurado
                ? ahora
                : null;

    const ultimoServidor =
        servidorForzado !== undefined
            ? servidorForzado
            : status?.server ||
              null;

    const ultimoServerId =
        serverIdForzado !== undefined
            ? serverIdForzado
            : serverIdActual;

    const tracker =
        await Tracker.create({

            battlemetricsId:
                String(battlemetricsId),

            nombre:
                String(
                    nombre ||
                    status?.name ||
                    "Desconocido"
                ),

            canalId,

            guildId,

            registradoPor,

            ultimoEstado:
                estadoInicial,

            inicioSesion,

            ultimoServidor,

            ultimoServerId,

            expiresAt
        });

    return {
        tracker,
        existente: false
    };
}

// =====================================================
// REVISAR TRACKERS
// =====================================================

async function revisarTrackers(client) {

    try {

        const trackers =
            await Tracker.find({});

        if (!trackers.length) {
            return;
        }

        for (const tracker of trackers) {

            // ==========================================
            // EXPIRACIÓN
            // ==========================================

            if (
                tracker.expiresAt &&
                new Date() >=
                    tracker.expiresAt
            ) {

                console.log(
                    `[TRACKER] Expirado: ${tracker.nombre} (${tracker.battlemetricsId})`
                );

                await Tracker.deleteOne({
                    _id: tracker._id
                });

                continue;
            }

            // ==========================================
            // SERVIDOR CONFIGURADO
            // ==========================================

            const servidorConfigurado =
                await obtenerServidorConfigurado(
                    tracker.guildId
                );

            if (!servidorConfigurado) {

                console.log(
                    `[TRACKER] No hay servidor configurado para guild ${tracker.guildId}`
                );

                continue;
            }

            // ==========================================
            // CONSULTAR BATTLEMETRICS
            // ==========================================

            let status = null;

            try {

                status =
                    await getBattleMetricsPlayerStatus(
                        tracker.battlemetricsId
                    );

            } catch (error) {

                console.error(
                    `[TRACKER] Error consultando ${tracker.nombre}:`,
                    error
                );

                continue;
            }

            // =================================================
            // MUY IMPORTANTE:
            // ERROR DE BATTLEMETRICS ≠ OFFLINE
            // =================================================

            if (
                !status ||
                status.error === true
            ) {

                console.warn(
                    `[TRACKER] No se pudo confirmar el estado de ${tracker.nombre}. Se mantiene el estado anterior: ${tracker.ultimoEstado}`
                );

                continue;
            }

            // ==========================================
            // CANAL
            // ==========================================

            const canal =
                await client.channels
                    .fetch(tracker.canalId)
                    .catch(() => null);

            if (!canal) {

                console.log(
                    `[TRACKER] Canal no encontrado para ${tracker.nombre}`
                );

                continue;
            }

            // ==========================================
            // ESTADO ACTUAL
            // ==========================================

            const estaOnline =
                Boolean(
                    status.online === true
                );

            const serverIdActual =
                status?.serverId
                    ? String(status.serverId)
                    : null;

            const estaEnServidorConfigurado =
                Boolean(
                    estaOnline &&
                    serverIdActual &&
                    serverIdActual ===
                        String(servidorConfigurado)
                );

            const estadoAnterior =
                tracker.ultimoEstado;

            // =================================================
            // ESTADO DESCONOCIDO
            // =================================================

            if (
                !estadoAnterior ||
                estadoAnterior === "desconocido"
            ) {

                if (
                    estaEnServidorConfigurado
                ) {

                    tracker.ultimoEstado =
                        "online";

                    tracker.inicioSesion =
                        tracker.inicioSesion ||
                        new Date();

                } else if (estaOnline) {

                    tracker.ultimoEstado =
                        "otro_servidor";

                    tracker.inicioSesion =
                        null;

                } else {

                    tracker.ultimoEstado =
                        "offline";

                    tracker.inicioSesion =
                        null;
                }

                tracker.ultimoServidor =
                    status?.server ||
                    null;

                tracker.ultimoServerId =
                    serverIdActual;

                await tracker.save();

                continue;
            }

            // =================================================
            // 1. ESTÁ EN EL SERVIDOR CONFIGURADO
            // =================================================

            if (estaEnServidorConfigurado) {

                // ---------------------------------------------
                // OFFLINE → SERVIDOR CONFIGURADO
                // ---------------------------------------------

                if (
                    estadoAnterior === "offline"
                ) {

                    await canal.send({

                        content:
                            `🟢 **${tracker.nombre} volvió a entrar al servidor**`,

                        embeds: [
                            crearEmbedOnline(
                                status,
                                tracker,
                                servidorConfigurado
                            )
                        ],

                        components: [
                            crearBotonBattleMetrics(
                                tracker.battlemetricsId
                            )
                        ]
                    });
                }

                // ---------------------------------------------
                // OTRO SERVIDOR → CONFIGURADO
                // ---------------------------------------------

                else if (
                    estadoAnterior === "otro_servidor"
                ) {

                    await canal.send({

                        content:
                            `🟢 **${tracker.nombre} volvió al servidor**`,

                        embeds: [
                            crearEmbedOnline(
                                status,
                                tracker,
                                servidorConfigurado
                            )
                        ],

                        components: [
                            crearBotonBattleMetrics(
                                tracker.battlemetricsId
                            )
                        ]
                    });
                }

                // ---------------------------------------------
                // ACTUALMENTE ONLINE
                // ---------------------------------------------

                tracker.ultimoEstado =
                    "online";

                if (!tracker.inicioSesion) {

                    tracker.inicioSesion =
                        new Date();
                }

                tracker.ultimoServidor =
                    status?.server ||
                    null;

                tracker.ultimoServerId =
                    serverIdActual;

                await tracker.save();

                continue;
            }

            // =================================================
            // 2. ESTÁ ONLINE EN OTRO SERVIDOR
            // =================================================

            if (
                estaOnline &&
                !estaEnServidorConfigurado
            ) {

                // ---------------------------------------------
                // SERVIDOR CONFIGURADO → OTRO SERVIDOR
                // ---------------------------------------------

                if (
                    estadoAnterior === "online"
                ) {

                    await canal.send({

                        content:
                            `🔄 **${tracker.nombre} cambió de servidor**`,

                        embeds: [
                            crearEmbedOtroServidor(
                                status,
                                tracker,
                                servidorConfigurado
                            )
                        ],

                        components: [
                            crearBotonBattleMetrics(
                                tracker.battlemetricsId
                            )
                        ]
                    });

                    tracker.ultimoEstado =
                        "otro_servidor";

                    tracker.inicioSesion =
                        null;
                }

                // ---------------------------------------------
                // OFFLINE → OTRO SERVIDOR
                // ---------------------------------------------

                else if (
                    estadoAnterior === "offline"
                ) {

                    await canal.send({

                        content:
                            `🟡 **${tracker.nombre} está conectado en otro servidor**`,

                        embeds: [
                            crearEmbedOtroServidor(
                                status,
                                tracker,
                                servidorConfigurado
                            )
                        ],

                        components: [
                            crearBotonBattleMetrics(
                                tracker.battlemetricsId
                            )
                        ]
                    });

                    tracker.ultimoEstado =
                        "otro_servidor";

                    tracker.inicioSesion =
                        null;
                }

                // ---------------------------------------------
                // SIGUE EN OTRO SERVIDOR
                // ---------------------------------------------

                else if (
                    estadoAnterior === "otro_servidor"
                ) {

                    // No mandamos mensaje cada 30 segundos.
                    // Solo actualizamos el servidor actual.

                    tracker.ultimoEstado =
                        "otro_servidor";
                }

                tracker.ultimoServidor =
                    status?.server ||
                    null;

                tracker.ultimoServerId =
                    serverIdActual;

                await tracker.save();

                continue;
            }

            // =================================================
            // 3. OFFLINE REAL
            // =================================================

            if (!estaOnline) {

                // ---------------------------------------------
                // SERVIDOR CONFIGURADO → OFFLINE
                // ---------------------------------------------

                if (
                    estadoAnterior === "online"
                ) {

                    const tiempoSesion =
                        tracker.inicioSesion
                            ? formatoTiempo(
                                Date.now() -
                                new Date(
                                    tracker.inicioSesion
                                ).getTime()
                            )
                            : "0m";

                    console.log(
                        `[TRACKER] ${tracker.nombre} pasó de ONLINE → OFFLINE`
                    );

                    await canal.send({

                        content:
                            `🔴 **${tracker.nombre} salió del servidor**`,

                        embeds: [
                            crearEmbedOffline(
                                tracker,
                                tiempoSesion,
                                tracker.ultimoServidor
                            )
                        ],

                        components: [
                            crearBotonBattleMetrics(
                                tracker.battlemetricsId
                            )
                        ]
                    });
                }

                // ---------------------------------------------
                // OTRO SERVIDOR → OFFLINE
                // ---------------------------------------------

                else if (
                    estadoAnterior === "otro_servidor"
                ) {

                    console.log(
                        `[TRACKER] ${tracker.nombre} pasó de OTRO SERVIDOR → OFFLINE`
                    );

                    await canal.send({

                        content:
                            `🔴 **${tracker.nombre} se desconectó de BattleMetrics**`,

                        embeds: [
                            crearEmbedOffline(
                                tracker,
                                "0m",
                                tracker.ultimoServidor
                            )
                        ],

                        components: [
                            crearBotonBattleMetrics(
                                tracker.battlemetricsId
                            )
                        ]
                    });
                }

                // ---------------------------------------------
                // ACTUALIZAR ESTADO
                // ---------------------------------------------

                tracker.ultimoEstado =
                    "offline";

                tracker.inicioSesion =
                    null;

                tracker.ultimoServerId =
                    null;

                await tracker.save();

                continue;
            }
        }

    } catch (error) {

        console.error(
            "[TRACKER] Error general revisando trackers:",
            error
        );
    }
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {

    obtenerBattleMetricsId,

    obtenerServidorConfigurado,

    obtenerNombreSteam,

    buscarTrackerActivo,

    resolverJugadorTracker,

    registrarTracker,

    revisarTrackers,

    crearEmbedOnline,

    crearEmbedOtroServidor,

    crearEmbedOffline,

    crearBotonBattleMetrics
};