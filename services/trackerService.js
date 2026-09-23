const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const Tracker = require("../models/TrackerSchema");
const ServerConfig = require("../models/ServerConfig");

const {
    getBattleMetricsPlayerStatus
} = require("./battlemetricsSearch");

// =====================================================
// OBTENER ID DE BATTLEMETRICS
// =====================================================

function obtenerBattleMetricsId(texto) {
    if (!texto) return null;

    texto = String(texto).trim();

    // Si ya es un ID
    if (/^\d+$/.test(texto)) {
        return texto;
    }

    // Si es un link de BattleMetrics
    const match = texto.match(
        /battlemetrics\.com\/players\/(\d+)/i
    );

    if (match) {
        return match[1];
    }

    return null;
}

// =====================================================
// FORMATO DE TIEMPO
// =====================================================

function formatoTiempo(ms) {
    if (!ms || ms < 0) return "0m";

    const segundos = Math.floor(ms / 1000);

    const dias = Math.floor(segundos / 86400);
    const horas = Math.floor((segundos % 86400) / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);

    const partes = [];

    if (dias > 0) partes.push(`${dias}d`);
    if (horas > 0) partes.push(`${horas}h`);
    if (minutos > 0 || partes.length === 0) {
        partes.push(`${minutos}m`);
    }

    return partes.join(" ");
}

// =====================================================
// BOTÓN BATTLEMETRICS
// =====================================================

function crearBotonBattleMetrics(battlemetricsId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel("BattleMetrics")
            .setStyle(ButtonStyle.Link)
            .setURL(
                `https://www.battlemetrics.com/players/${battlemetricsId}`
            )
    );
}

// =====================================================
// OBTENER SERVIDOR CONFIGURADO
// =====================================================

async function obtenerServidorConfigurado(guildId) {
    try {
        const config = await ServerConfig.findOne({ guildId });

        if (!config || !config.battleMetricsServerId) {
            return null;
        }

        return String(config.battleMetricsServerId);
    } catch (error) {
        console.error(
            "[TRACKER] Error obteniendo servidor configurado:",
            error
        );

        return null;
    }
}

// =====================================================
// CREAR EMBED ONLINE
// =====================================================

function crearEmbedOnline(
    status,
    tracker,
    servidorConfigurado
) {
    const servidorActual =
        status?.server ||
        "Servidor desconocido";

    const tiempoJugando =
        status?.jugando ||
        "0m";

    const esServidorConfigurado =
        status?.serverId &&
        servidorConfigurado &&
        String(status.serverId) === String(servidorConfigurado);

    return new EmbedBuilder()
        .setTitle("🟢 JUGADOR ONLINE")
        .setDescription(
            `**${status?.name || tracker.nombre}** está actualmente conectado al servidor configurado.`
        )
        .setColor(0x00ff00)
        .addFields(
            {
                name: "👤 Jugador",
                value: `\`${status?.name || tracker.nombre}\``,
                inline: false
            },
            {
                name: "🎮 Servidor",
                value: servidorActual,
                inline: false
            },
            {
                name: "⏱ Jugando",
                value: tiempoJugando,
                inline: true
            },
            {
                name: "📡 Estado",
                value: esServidorConfigurado
                    ? "🟢 ONLINE"
                    : "🟡 OTRO SERVIDOR",
                inline: true
            },
            {
                name: "🎯 Tracker",
                value: "Activo",
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
    const servidorActual =
        status?.server ||
        "Servidor desconocido";

    return new EmbedBuilder()
        .setTitle("🟡 ESTÁ EN OTRO SERVIDOR")
        .setDescription(
            `**${status?.name || tracker.nombre}** está conectado, pero no está en el servidor configurado.`
        )
        .setColor(0xffff00)
        .addFields(
            {
                name: "👤 Jugador",
                value: `\`${status?.name || tracker.nombre}\``,
                inline: false
            },
            {
                name: "🎮 Servidor actual",
                value: servidorActual,
                inline: false
            },
            {
                name: "🆔 Servidor actual",
                value: status?.serverId
                    ? `\`${status.serverId}\``
                    : "Desconocido",
                inline: true
            },
            {
                name: "🎯 Servidor configurado",
                value: `\`${servidorConfigurado || "No configurado"}\``,
                inline: true
            },
            {
                name: "⏱ Jugando",
                value: status?.jugando || "0m",
                inline: true
            },
            {
                name: "📡 Estado",
                value: "🟡 OTRO SERVIDOR",
                inline: true
            },
            {
                name: "🎯 Tracker",
                value: "Activo",
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
    return new EmbedBuilder()
        .setTitle("🔴 JUGADOR OFFLINE")
        .setDescription(
            `**${tracker.nombre}** ha salido del servidor configurado.`
        )
        .setColor(0xff0000)
        .addFields(
            {
                name: "👤 Jugador",
                value: `\`${tracker.nombre}\``,
                inline: false
            },
            {
                name: "🎮 Último servidor",
                value: ultimoServidor || "Desconocido",
                inline: false
            },
            {
                name: "⏱ Tiempo de sesión",
                value: tiempo || "0m",
                inline: true
            },
            {
                name: "📡 Estado",
                value: "🔴 OFFLINE",
                inline: true
            },
            {
                name: "🎯 Tracker",
                value: "Activo",
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
    const ahora = new Date();

    const expiresAt = new Date(
        ahora.getTime() + 24 * 60 * 60 * 1000
    );

    // -------------------------------------------------
    // Obtener servidor configurado
    // -------------------------------------------------

    const servidorConfigurado =
        await obtenerServidorConfigurado(guildId);

    // -------------------------------------------------
    // Consultar estado actual
    // -------------------------------------------------

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

    // -------------------------------------------------
    // Determinar estado actual
    // -------------------------------------------------

    const estaOnline =
        status &&
        status.online === true;

    const serverIdActual =
        status?.serverId
            ? String(status.serverId)
            : null;

    const estaEnServidorConfigurado =
        estaOnline &&
        servidorConfigurado &&
        serverIdActual &&
        serverIdActual === String(servidorConfigurado);

    let estadoInicial;

    if (estadoForzado) {
        estadoInicial = estadoForzado;
    } else if (estaEnServidorConfigurado) {
        estadoInicial = "online";
    } else if (estaOnline) {
        estadoInicial = "otro_servidor";
    } else {
        estadoInicial = "offline";
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
            : status?.server || null;

    const ultimoServerId =
        serverIdForzado !== undefined
            ? serverIdForzado
            : serverIdActual;

    // -------------------------------------------------
    // Crear tracker
    // -------------------------------------------------

    const tracker = await Tracker.create({
        battlemetricsId,
        nombre,
        canalId,
        guildId,
        registradoPor,
        ultimoEstado: estadoInicial,
        inicioSesion,
        ultimoServidor,
        ultimoServerId,
        expiresAt
    });

    return tracker;
}

// =====================================================
// REVISAR TRACKERS
// =====================================================

async function revisarTrackers(client) {
    try {
        const trackers = await Tracker.find({});

        if (!trackers.length) {
            return;
        }

        for (const tracker of trackers) {

            // ==========================================
            // EXPIRACIÓN
            // ==========================================

            if (
                tracker.expiresAt &&
                new Date() >= tracker.expiresAt
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
            // OBTENER SERVIDOR CONFIGURADO
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
                status &&
                status.online === true;

            const serverIdActual =
                status?.serverId
                    ? String(status.serverId)
                    : null;

            const estaEnServidorConfigurado =
                estaOnline &&
                serverIdActual &&
                serverIdActual ===
                    String(servidorConfigurado);

            // ==========================================
            // ESTADO DESCONOCIDO
            // ==========================================

            if (!tracker.ultimoEstado ||
                tracker.ultimoEstado === "desconocido") {

                if (estaEnServidorConfigurado) {

                    tracker.ultimoEstado = "online";

                    tracker.inicioSesion =
                        tracker.inicioSesion ||
                        new Date();

                    tracker.ultimoServidor =
                        status.server || null;

                    tracker.ultimoServerId =
                        serverIdActual;

                } else if (estaOnline) {

                    tracker.ultimoEstado =
                        "otro_servidor";

                    tracker.inicioSesion = null;

                    tracker.ultimoServidor =
                        status.server || null;

                    tracker.ultimoServerId =
                        serverIdActual;

                } else {

                    tracker.ultimoEstado =
                        "offline";

                    tracker.inicioSesion = null;

                    tracker.ultimoServerId = null;
                }

                await tracker.save();

                continue;
            }

            // ==========================================
            // 1. ESTÁ EN EL SERVIDOR CONFIGURADO
            // ==========================================

            if (estaEnServidorConfigurado) {

                // --------------------------------------
                // VOLVIÓ DESDE OFFLINE
                // --------------------------------------

                if (
                    tracker.ultimoEstado ===
                    "offline"
                ) {

                    await canal.send({
                        content:
                            `🔔 **${tracker.nombre} volvió a entrar al servidor configurado**`,
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

                    tracker.ultimoEstado =
                        "online";

                    tracker.inicioSesion =
                        new Date();

                }

                // --------------------------------------
                // VOLVIÓ DESDE OTRO SERVIDOR
                // --------------------------------------

                else if (
                    tracker.ultimoEstado ===
                    "otro_servidor"
                ) {

                    await canal.send({
                        content:
                            `🔔 **${tracker.nombre} volvió a entrar al servidor configurado**`,
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

                    tracker.ultimoEstado =
                        "online";

                    tracker.inicioSesion =
                        new Date();
                }

                // --------------------------------------
                // SIGUE ONLINE
                // --------------------------------------

                else if (
                    tracker.ultimoEstado ===
                    "online"
                ) {

                    tracker.ultimoEstado =
                        "online";

                    if (!tracker.inicioSesion) {
                        tracker.inicioSesion =
                            new Date();
                    }
                }

                tracker.ultimoServidor =
                    status.server || null;

                tracker.ultimoServerId =
                    serverIdActual;

                await tracker.save();

                continue;
            }

            // ==========================================
            // 2. ESTÁ ONLINE PERO EN OTRO SERVIDOR
            // ==========================================

            if (estaOnline && !estaEnServidorConfigurado) {

                // --------------------------------------
                // VIENE DEL SERVIDOR CONFIGURADO
                // --------------------------------------

                if (
                    tracker.ultimoEstado ===
                    "online"
                ) {

                    const tiempoSesion =
                        tracker.inicioSesion
                            ? formatoTiempo(
                                Date.now() -
                                tracker.inicioSesion.getTime()
                            )
                            : "0m";

                    await canal.send({
                        content:
                            `🔔 **${tracker.nombre} está en otro servidor**`,
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

                    tracker.inicioSesion = null;
                }

                // --------------------------------------
                // YA ESTABA EN OTRO SERVIDOR
                // --------------------------------------

                else if (
                    tracker.ultimoEstado ===
                    "otro_servidor"
                ) {

                    // Si cambió de servidor externo,
                    // actualizamos los datos pero NO
                    // mandamos una alerta de "volvió".

                    if (
                        tracker.ultimoServerId !==
                        serverIdActual
                    ) {

                        tracker.ultimoServidor =
                            status.server || null;

                        tracker.ultimoServerId =
                            serverIdActual;
                    }
                }

                // --------------------------------------
                // OFFLINE -> OTRO SERVIDOR
                // --------------------------------------

                else if (
                    tracker.ultimoEstado ===
                    "offline"
                ) {

                    await canal.send({
                        content:
                            `🔔 **${tracker.nombre} está en otro servidor**`,
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

                    tracker.inicioSesion = null;
                }

                tracker.ultimoServidor =
                    status.server || null;

                tracker.ultimoServerId =
                    serverIdActual;

                await tracker.save();

                continue;
            }

            // ==========================================
            // 3. ESTÁ COMPLETAMENTE OFFLINE
            // ==========================================

            if (!estaOnline) {

                // --------------------------------------
                // SALIÓ DEL SERVIDOR CONFIGURADO
                // --------------------------------------

                if (
                    tracker.ultimoEstado ===
                    "online"
                ) {

                    const tiempoSesion =
                        tracker.inicioSesion
                            ? formatoTiempo(
                                Date.now() -
                                tracker.inicioSesion.getTime()
                            )
                            : "0m";

                    await canal.send({
                        content:
                            `🔔 **${tracker.nombre} salió del servidor configurado**`,
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

                    tracker.ultimoEstado =
                        "offline";

                    tracker.inicioSesion =
                        null;

                    tracker.ultimoServerId =
                        null;
                }

                // --------------------------------------
                // YA ESTABA OFFLINE
                // --------------------------------------

                else if (
                    tracker.ultimoEstado ===
                    "offline"
                ) {

                    tracker.ultimoEstado =
                        "offline";

                    tracker.ultimoServerId =
                        null;
                }

                // --------------------------------------
                // ESTABA EN OTRO SERVIDOR Y
                // AHORA ESTÁ OFFLINE
                // --------------------------------------

                else if (
                    tracker.ultimoEstado ===
                    "otro_servidor"
                ) {

                    tracker.ultimoEstado =
                        "offline";

                    tracker.inicioSesion =
                        null;

                    tracker.ultimoServerId =
                        null;
                }

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
    registrarTracker,
    revisarTrackers
};