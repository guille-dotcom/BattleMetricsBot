const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const Tracker =
    require("../models/Tracker");

const ServerConfig =
    require("../models/ServerConfig");

const {
    getBattleMetricsPlayerStatus
} = require("./battlemetricsSearch");

const {
    searchBattleMetricsPlayer
} = require("./battlemetricsHours");

const {
    getSteamProfile
} = require("./steam");

// ============================================================
// OBTENER NOMBRE STEAM
// ============================================================

async function obtenerNombreSteam(steamId) {

    try {

        const perfil =
            await getSteamProfile(steamId);

        if (
            !perfil ||
            !perfil.name
        ) {

            console.log(
                `[STEAM] No se encontró perfil para ${steamId}`
            );

            return null;
        }

        console.log(
            `[STEAM] Steam ID ${steamId} -> ${perfil.name}`
        );

        return perfil.name;

    } catch (error) {

        console.error(
            "[STEAM] Error obteniendo perfil:",
            error.message
        );

        return null;
    }
}

// ============================================================
// OBTENER SERVIDOR CONFIGURADO
// ============================================================

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
            "Error obteniendo servidor configurado:",
            error.message
        );

        return null;
    }
}

// ============================================================
// OBTENER BATTLEMETRICS ID DESDE ID/LINK
// ============================================================

function obtenerBattleMetricsId(
    texto
) {

    if (!texto) {
        return null;
    }

    const valor =
        String(texto).trim();

    // --------------------------------------------------------
    // Link de BattleMetrics
    // --------------------------------------------------------

    const match =
        valor.match(
            /battlemetrics\.com\/players\/(\d+)/i
        );

    if (match) {

        return match[1];
    }

    // --------------------------------------------------------
    // Número puro
    //
    // 17 dígitos = Steam ID
    // Otro número = BattleMetrics ID
    // --------------------------------------------------------

    if (/^\d+$/.test(valor)) {

        if (
            valor.length === 17
        ) {

            return null;
        }

        return valor;
    }

    return null;
}

// ============================================================
// RESOLVER JUGADOR PARA TRACKER
// ============================================================

async function resolverJugadorTracker(
    texto,
    guildId
) {

    if (!texto) {

        return {
            error:
                "❌ Debes indicar un ID, link de BattleMetrics o Steam ID."
        };
    }

    const valor =
        String(texto).trim();

    // ========================================================
    // 1. BATTLEMETRICS LINK
    // ========================================================

    const battleMetricsId =
        obtenerBattleMetricsId(valor);

    if (battleMetricsId) {

        console.log(
            `[TRACKER] Detectado BattleMetrics ID: ${battleMetricsId}`
        );

        return {
            battlemetricsId:
                battleMetricsId
        };
    }

    // ========================================================
    // 2. DETECTAR STEAM ID
    // ========================================================

    const esSteamId =
        /^\d{17}$/.test(valor);

    if (!esSteamId) {

        return {
            error:
                "❌ El valor indicado no es un ID válido de BattleMetrics, enlace de BattleMetrics ni Steam ID."
        };
    }

    const steamId =
        valor;

    console.log(
        `[TRACKER] Steam ID detectado: ${steamId}`
    );

    // ========================================================
    // 3. OBTENER SERVIDOR CONFIGURADO
    // ========================================================

    const serverId =
        await obtenerServidorConfigurado(
            guildId
        );

    if (!serverId) {

        return {
            error:
                "❌ Este servidor de Discord no tiene configurado un servidor de BattleMetrics."
        };
    }

    console.log(
        `[TRACKER] Servidor BattleMetrics configurado: ${serverId}`
    );

    // ========================================================
    // 4. OBTENER NOMBRE DE STEAM
    // ========================================================

    const nombreSteam =
        await obtenerNombreSteam(
            steamId
        );

    if (!nombreSteam) {

        return {
            error:
                "❌ No se pudo obtener el nombre de Steam para ese Steam ID."
        };
    }

    console.log(
        `[TRACKER] Steam -> ${nombreSteam}`
    );

    // ========================================================
    // 5. BUSCAR NOMBRE EN EL SERVIDOR
    //
    // USAMOS EXACTAMENTE LA MISMA FUNCIÓN QUE /HORAS
    // ========================================================

    const jugadorBM =
        await searchBattleMetricsPlayer(
            nombreSteam,
            serverId
        );

    // ========================================================
    // NOMBRE DUPLICADO
    // ========================================================

    if (
        jugadorBM &&
        jugadorBM.duplicate
    ) {

        return {
            error:
                `⚠️ El nombre **${nombreSteam}** aparece más de una vez en el servidor de BattleMetrics configurado.`
        };
    }

    // ========================================================
    // NO ENCONTRADO
    // ========================================================

    if (!jugadorBM) {

        return {
            error:
                `❌ El jugador de Steam **${nombreSteam}** no fue encontrado en el servidor de BattleMetrics configurado.`
        };
    }

    // ========================================================
    // ENCONTRADO
    // ========================================================

    console.log(
        `[TRACKER] ${nombreSteam} -> BattleMetrics ${jugadorBM.id}`
    );

    return {
        battlemetricsId:
            String(jugadorBM.id),

        nombreSteam,

        nombreBattleMetrics:
            jugadorBM.attributes?.name ||
            nombreSteam,

        steamId,

        serverId
    };
}

// ============================================================
// FORMATO DE TIEMPO
// ============================================================

function formatoTiempo(
    ms
) {

    const segundos =
        Math.max(
            0,
            Math.floor(ms / 1000)
        );

    const horas =
        Math.floor(
            segundos / 3600
        );

    const minutos =
        Math.floor(
            (segundos % 3600) / 60
        );

    if (horas > 0) {

        return `${horas}h ${minutos}m`;
    }

    return `${minutos}m`;
}

// ============================================================
// BOTÓN BATTLEMETRICS
// ============================================================

function crearBotonBattleMetrics(
    battlemetricsId
) {

    return new ActionRowBuilder()
        .addComponents(

            new ButtonBuilder()
                .setLabel(
                    "Ver BattleMetrics"
                )
                .setStyle(
                    ButtonStyle.Link
                )
                .setURL(
                    `https://www.battlemetrics.com/players/${battlemetricsId}`
                )
        );
}

// ============================================================
// EMBED ONLINE
// ============================================================

function crearEmbedOnline(
    tracker,
    status
) {

    const nombre =
        status?.name ||
        tracker.nombre ||
        "Desconocido";

    const servidor =
        status?.server ||
        "Servidor desconocido";

    return new EmbedBuilder()

        .setTitle(
            "🟢 Jugador encontrado"
        )

        .setColor(
            "#57F287"
        )

        .setDescription(
            `**${nombre}** está jugando actualmente.`
        )

        .addFields(

            {
                name: "🎮 Jugador",
                value:
                    `\`${nombre}\``,
                inline: true
            },

            {
                name: "🖥️ Servidor",
                value:
                    `\`${servidor}\``,
                inline: true
            },

            {
                name: "⏱️ Tiempo del tracker",
                value:
                    `\`${formatoTiempo(
                        new Date(
                            tracker.expiresAt
                        ).getTime() -
                        Date.now()
                    )}\``,
                inline: true
            }

        )

        .setTimestamp();
}

// ============================================================
// EMBED OTRO SERVIDOR
// ============================================================

function crearEmbedOtroServidor(
    tracker,
    status
) {

    const nombre =
        status?.name ||
        tracker.nombre ||
        "Desconocido";

    const servidor =
        status?.server ||
        "Otro servidor";

    return new EmbedBuilder()

        .setTitle(
            "🟡 Jugador en otro servidor"
        )

        .setColor(
            "#FEE75C"
        )

        .setDescription(
            `**${nombre}** está jugando, pero actualmente se encuentra en otro servidor.`
        )

        .addFields(

            {
                name: "🖥️ Servidor actual",
                value:
                    `\`${servidor}\``,
                inline: true
            },

            {
                name: "🎯 Servidor configurado",
                value:
                    `\`${tracker.serverId || "Desconocido"}\``,
                inline: true
            }

        )

        .setTimestamp();
}

// ============================================================
// EMBED OFFLINE
// ============================================================

function crearEmbedOffline(
    tracker,
    status
) {

    const nombre =
        status?.name ||
        tracker.nombre ||
        "Desconocido";

    return new EmbedBuilder()

        .setTitle(
            "🔴 Jugador desconectado"
        )

        .setColor(
            "#ED4245"
        )

        .setDescription(
            `**${nombre}** ya no está jugando actualmente.`
        )

        .setTimestamp();
}

// ============================================================
// REGISTRAR TRACKER
// ============================================================

async function registrarTracker(
    {
        battlemetricsId,
        nombre,
        canalId,
        guildId,
        registradoPor,
        ultimoEstado,
        inicioSesion,
        ultimoServidor,
        ultimoServerId
    }
) {

    const expiresAt =
        new Date(
            Date.now() +
            24 * 60 * 60 * 1000
        );

    const serverId =
        await obtenerServidorConfigurado(
            guildId
        );

    let estadoInicial =
        ultimoEstado ||
        "desconocido";

    let servidorInicial =
        ultimoServidor ||
        null;

    let serverIdInicial =
        ultimoServerId ||
        null;

    try {

        const status =
            await getBattleMetricsPlayerStatus(
                battlemetricsId
            );

        if (status) {

            servidorInicial =
                status.server ||
                servidorInicial;

            serverIdInicial =
                status.serverId ||
                serverIdInicial;

            if (
                status.online
            ) {

                if (
                    serverId &&
                    String(
                        status.serverId
                    ) ===
                    String(serverId)
                ) {

                    estadoInicial =
                        "online";

                } else {

                    estadoInicial =
                        "otro_servidor";
                }

            } else {

                estadoInicial =
                    "offline";
            }
        }

    } catch (error) {

        console.error(
            "[TRACKER] Error obteniendo estado inicial:",
            error.message
        );
    }

    const tracker =
        await Tracker.findOneAndUpdate(

            {
                guildId,
                battlemetricsId:
                    String(
                        battlemetricsId
                    )
            },

            {
                guildId,

                battlemetricsId:
                    String(
                        battlemetricsId
                    ),

                nombre:
                    nombre ||
                    "Desconocido",

                canalId,

                registradoPor,

                ultimoEstado:
                    estadoInicial,

                inicioSesion:
                    inicioSesion ||
                    null,

                ultimoServidor:
                    servidorInicial,

                ultimoServerId:
                    serverIdInicial,

                expiresAt
            },

            {
                upsert: true,
                new: true
            }
        );

    return tracker;
}

// ============================================================
// REVISAR TRACKERS
// ============================================================

async function revisarTrackers(
    client
) {

    try {

        const trackers =
            await Tracker.find({});

        if (
            trackers.length === 0
        ) {

            return;
        }

        for (
            const tracker
            of trackers
        ) {

            try {

                // =================================================
                // EXPIRACIÓN
                // =================================================

                if (
                    tracker.expiresAt &&
                    new Date(
                        tracker.expiresAt
                    ).getTime() <=
                    Date.now()
                ) {

                    await Tracker.deleteOne({
                        _id:
                            tracker._id
                    });

                    continue;
                }

                // =================================================
                // SERVIDOR CONFIGURADO
                // =================================================

                const serverId =
                    await obtenerServidorConfigurado(
                        tracker.guildId
                    );

                // =================================================
                // ESTADO ACTUAL
                // =================================================

                const status =
                    await getBattleMetricsPlayerStatus(
                        tracker.battlemetricsId
                    );

                if (!status) {
                    continue;
                }

                const online =
                    Boolean(
                        status.online
                    );

                const jugandoEnServidor =
                    online &&
                    serverId &&
                    String(
                        status.serverId
                    ) ===
                    String(serverId);

                const estadoAnterior =
                    tracker.ultimoEstado;

                let nuevoEstado;

                if (
                    jugandoEnServidor
                ) {

                    nuevoEstado =
                        "online";

                } else if (
                    online
                ) {

                    nuevoEstado =
                        "otro_servidor";

                } else {

                    nuevoEstado =
                        "offline";
                }

                // =================================================
                // CANAL
                // =================================================

                const channel =
                    await client.channels
                        .fetch(
                            tracker.canalId
                        )
                        .catch(
                            () => null
                        );

                if (!channel) {
                    continue;
                }

                // =================================================
                // TRANSICIONES
                // =================================================

                if (
                    nuevoEstado !==
                    estadoAnterior
                ) {

                    let embed = null;

                    if (
                        nuevoEstado ===
                        "online"
                    ) {

                        embed =
                            crearEmbedOnline(
                                tracker,
                                status
                            );

                    } else if (
                        nuevoEstado ===
                        "otro_servidor"
                    ) {

                        embed =
                            crearEmbedOtroServidor(
                                tracker,
                                status
                            );

                    } else if (
                        nuevoEstado ===
                        "offline"
                    ) {

                        embed =
                            crearEmbedOffline(
                                tracker,
                                status
                            );
                    }

                    if (embed) {

                        await channel.send({

                            embeds: [
                                embed
                            ],

                            components: [
                                crearBotonBattleMetrics(
                                    tracker.battlemetricsId
                                )
                            ]

                        }).catch(
                            error =>
                                console.error(
                                    "[TRACKER] Error enviando alerta:",
                                    error.message
                                )
                        );
                    }
                }

                // =================================================
                // GUARDAR ESTADO
                // =================================================

                tracker.ultimoEstado =
                    nuevoEstado;

                tracker.ultimoServidor =
                    status.server ||
                    null;

                tracker.ultimoServerId =
                    status.serverId ||
                    null;

                if (
                    nuevoEstado ===
                    "online"
                ) {

                    if (
                        !tracker.inicioSesion
                    ) {

                        tracker.inicioSesion =
                            new Date();
                    }

                } else {

                    tracker.inicioSesion =
                        null;
                }

                await tracker.save();

            } catch (error) {

                console.error(
                    `[TRACKER] Error revisando ${tracker.battlemetricsId}:`,
                    error.message
                );
            }
        }

    } catch (error) {

        console.error(
            "[TRACKER] Error general revisando trackers:",
            error.message
        );
    }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    obtenerBattleMetricsId,
    obtenerServidorConfigurado,
    obtenerNombreSteam,
    resolverJugadorTracker,
    registrarTracker,
    revisarTrackers
};