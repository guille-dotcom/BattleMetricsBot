const {
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlags
} = require("discord.js");

const axios = require("axios");

const ServerConfig = require("../models/ServerConfig");
const Vigilado = require("../models/Vigilado");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BM_API = "https://api.battlemetrics.com";

const REQUEST_TIMEOUT = 30000;

// =====================================================
// HEADERS BATTLEMETRICS
// =====================================================

function getHeaders() {
    const headers = {
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json"
    };

    if (process.env.BATTLEMETRICS_TOKEN) {
        headers.Authorization =
            `Bearer ${process.env.BATTLEMETRICS_TOKEN}`;
    }

    return headers;
}

// =====================================================
// EXTRAER ID DE BATTLEMETRICS
// =====================================================

function extraerBattleMetricsId(valor) {
    if (!valor) {
        return null;
    }

    const texto = String(valor).trim();

    // Si ya es un ID numérico
    if (/^\d+$/.test(texto)) {
        return texto;
    }

    // URL de perfil BattleMetrics
    const match = texto.match(
        /battlemetrics\.com\/players\/(\d+)/i
    );

    if (match && match[1]) {
        return match[1];
    }

    return null;
}

// =====================================================
// OBTENER SERVER ID
// =====================================================

function obtenerServerId(config) {
    if (!config) {
        return null;
    }

    if (config.battleMetricsServerId) {
        return String(config.battleMetricsServerId);
    }

    if (config.battlemetricsServerId) {
        return String(config.battlemetricsServerId);
    }

    if (config.serverId) {
        return String(config.serverId);
    }

    if (config.battleMetricsServer) {
        return extraerServerId(config.battleMetricsServer);
    }

    if (config.battlemetricsServer) {
        return extraerServerId(config.battlemetricsServer);
    }

    if (config.battleMetricsServerUrl) {
        return extraerServerId(config.battleMetricsServerUrl);
    }

    return null;
}

// =====================================================
// EXTRAER SERVER ID DESDE URL
// =====================================================

function extraerServerId(valor) {
    if (!valor) {
        return null;
    }

    const texto = String(valor).trim();

    if (/^\d+$/.test(texto)) {
        return texto;
    }

    const match = texto.match(
        /battlemetrics\.com\/servers\/rust\/(\d+)/i
    );

    if (match && match[1]) {
        return match[1];
    }

    return null;
}

// =====================================================
// OBTENER TODOS LOS SERVER IDS DE UNA SESIÓN
// =====================================================

function obtenerTodosLosServerIds(session) {
    const ids = new Set();

    if (!session) {
        return ids;
    }

    const relationships = session.relationships || {};

    // relationships.server.data
    if (
        relationships.server &&
        relationships.server.data
    ) {
        const serverData = relationships.server.data;

        if (Array.isArray(serverData)) {
            for (const server of serverData) {
                if (server && server.id) {
                    ids.add(String(server.id));
                }
            }
        } else if (serverData.id) {
            ids.add(String(serverData.id));
        }
    }

    // attributes.serverId
    if (
        session.attributes &&
        session.attributes.serverId
    ) {
        ids.add(String(session.attributes.serverId));
    }

    // attributes.server
    if (
        session.attributes &&
        session.attributes.server
    ) {
        const serverId = extraerServerId(
            session.attributes.server
        );

        if (serverId) {
            ids.add(String(serverId));
        }
    }

    return ids;
}

// =====================================================
// COMPROBAR SI UNA SESIÓN ESTÁ ACTIVA
// =====================================================

function sesionEstaActiva(session) {
    if (!session || !session.attributes) {
        return false;
    }

    const attributes = session.attributes;

    if (attributes.online === true) {
        return true;
    }

    if (
        attributes.stop === null ||
        attributes.stop === undefined ||
        attributes.stop === ""
    ) {
        return true;
    }

    return false;
}

// =====================================================
// OBTENER PLAYER
// =====================================================

async function obtenerPlayer(playerId) {
    const response = await axios.get(
        `${BM_API}/players/${playerId}`,
        {
            headers: getHeaders(),
            timeout: REQUEST_TIMEOUT
        }
    );

    return response.data;
}

// =====================================================
// OBTENER SESIONES DEL PLAYER
// =====================================================

async function obtenerSesionesPlayer(playerId) {
    const response = await axios.get(
        `${BM_API}/sessions`,
        {
            params: {
                "filter[players]": playerId,
                "page[size]": 100
            },
            headers: getHeaders(),
            timeout: REQUEST_TIMEOUT
        }
    );

    return response.data;
}

// =====================================================
// COMPROBAR JUGADOR EN SERVIDOR
// =====================================================

async function comprobarJugadorEnServidor(
    playerId,
    serverId
) {
    const resultado = {
        online: false,
        tieneHistorial: false,
        duracionSegundos: 0
    };

    try {
        const data = await obtenerSesionesPlayer(playerId);

        const sesiones = Array.isArray(data.data)
            ? data.data
            : [];

        for (const session of sesiones) {
            const serverIds =
                obtenerTodosLosServerIds(session);

            if (!serverIds.has(String(serverId))) {
                continue;
            }

            resultado.tieneHistorial = true;

            if (!sesionEstaActiva(session)) {
                continue;
            }

            resultado.online = true;

            const attributes = session.attributes || {};

            const start = attributes.start
                ? new Date(attributes.start)
                : null;

            if (start && !Number.isNaN(start.getTime())) {
                resultado.duracionSegundos =
                    Math.max(
                        0,
                        Math.floor(
                            (Date.now() - start.getTime()) /
                                1000
                        )
                    );
            }

            break;
        }
    } catch (error) {
        const status =
            error.response && error.response.status
                ? error.response.status
                : "sin respuesta";

        console.error(
            `Error comprobando jugador ${playerId}:`,
            status
        );

        throw error;
    }

    return resultado;
}

// =====================================================
// FORMATEAR DURACIÓN
// =====================================================

function formatearDuracion(segundos) {
    const total = Math.max(
        0,
        Number(segundos) || 0
    );

    const horas = Math.floor(total / 3600);

    const minutos = Math.floor(
        (total % 3600) / 60
    );

    if (horas > 0) {
        return `${horas}h ${minutos}m`;
    }

    return `${minutos}m`;
}

// =====================================================
// LINK PERFIL BATTLEMETRICS
// =====================================================

function enlaceBattleMetrics(perfil) {
    return `https://www.battlemetrics.com/players/${perfil.battlemetricsId}`;
}

// =====================================================
// COMANDO
// =====================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName("revisar")
        .setDescription(
            "Revisa los jugadores vigilados en el servidor configurado"
        ),

    async execute(interaction) {
        const inicio = Date.now();

        try {
            // =================================================
            // OBTENER CONFIGURACIÓN DEL SERVIDOR
            // =================================================

            const config =
                await ServerConfig.findOne({
                    guildId: interaction.guild.id
                });

            if (!config) {
                return interaction.reply({
                    content:
                        "❌ Este servidor todavía no está configurado.",
                    flags: MessageFlags.Ephemeral
                });
            }

            const serverId =
                obtenerServerId(config);

            if (!serverId) {
                return interaction.reply({
                    content:
                        "❌ No hay un servidor de BattleMetrics configurado correctamente.",
                    flags: MessageFlags.Ephemeral
                });
            }

            // =================================================
            // OBTENER VIGILADOS
            // =================================================

            const vigilados =
                await Vigilado.find({
                    guildId: interaction.guild.id
                });

            if (!vigilados || vigilados.length === 0) {
                return interaction.reply({
                    content:
                        "ℹ️ No hay jugadores vigilados en este servidor.",
                    flags: MessageFlags.Ephemeral
                });
            }

            // =================================================
            // PREPARAR RESULTADOS
            // =================================================

            const online = [];
            const historial = [];
            const sinSesion = [];

            // =================================================
            // COMPROBAR CADA JUGADOR
            // =================================================

            for (const vigilado of vigilados) {
                const playerId =
                    extraerBattleMetricsId(
                        vigilado.battlemetricsId ||
                        vigilado.battleMetricsId ||
                        vigilado.playerId ||
                        vigilado.url ||
                        vigilado.battlemetricsUrl
                    );

                if (!playerId) {
                    console.warn(
                        `⚠️ No se pudo obtener BattleMetrics ID para ${vigilado.alias || "jugador desconocido"}`
                    );

                    continue;
                }

                const alias =
                    vigilado.alias ||
                    vigilado.nombre ||
                    vigilado.name ||
                    `Jugador ${playerId}`;

                const perfil = {
                    alias,
                    battlemetricsId: playerId
                };

                // Verificar que el jugador existe
                await obtenerPlayer(playerId);

                const resultado =
                    await comprobarJugadorEnServidor(
                        playerId,
                        serverId
                    );

                if (resultado.online) {
                    online.push({
                        ...perfil,
                        duracionSegundos:
                            resultado.duracionSegundos
                    });
                } else if (resultado.tieneHistorial) {
                    historial.push(perfil);
                } else {
                    sinSesion.push(perfil);
                }
            }

            // =================================================
            // CREAR EMBED
            // =================================================

            const embed =
                new EmbedBuilder()
                    .setTitle("🔎 Revisión BattleMetrics")
                    .setColor(
                        online.length > 0
                            ? 0xff0000
                            : 0x2b2d31
                    )
                    .setDescription(
                        `Servidor BattleMetrics: \`${serverId}\``
                    )
                    .setTimestamp();

            // =================================================
            // ONLINE
            // =================================================

            if (online.length > 0) {
                const textoOnline =
                    online
                        .map((perfil) => {
                            const duracion =
                                formatearDuracion(
                                    perfil.duracionSegundos
                                );

                            return (
                                `• **[${perfil.alias}](${enlaceBattleMetrics(perfil)})**` +
                                ` — Jugando: **${duracion}**`
                            );
                        })
                        .join("\n");

                embed.addFields({
                    name: "🚨 ¡Detectados Online!",
                    value: textoOnline
                });
            }

            // =================================================
            // HISTORIAL PERO OFFLINE
            // =================================================

            if (historial.length > 0) {
                const textoHistorial =
                    historial
                        .map((perfil) => {
                            return (
                                `• **[${perfil.alias}](${enlaceBattleMetrics(perfil)})**` +
                                " — Offline"
                            );
                        })
                        .join("\n");

                embed.addFields({
                    name: "📜 Historial en este servidor",
                    value: textoHistorial
                });
            }

            // =================================================
            // SIN SESIÓN EN EL SERVIDOR
            // =================================================

            if (sinSesion.length > 0) {
                const textoSinSesion =
                    sinSesion
                        .map((perfil) => {
                            return (
                                `• **[${perfil.alias}](${enlaceBattleMetrics(perfil)})**`
                            );
                        })
                        .join("\n");

                embed.addFields({
                    name: "ℹ️ Sin sesión en este servidor",
                    value: textoSinSesion
                });
            }

            // =================================================
            // RESUMEN
            // =================================================

            embed.addFields({
                name: "📡 BattleMetrics",
                value:
                    `Perfiles comprobados: **${vigilados.length}**\n` +
                    `Online confirmado: **${online.length}**\n` +
                    `Tiempo de respuesta: **${Date.now() - inicio} ms**`
            });

            // =================================================
            // RESPONDER
            // =================================================

            await interaction.reply({
                embeds: [embed]
            });
        } catch (error) {
            console.error(
                "❌ Error en /revisar:",
                error
            );

            const mensaje =
                "❌ Ocurrió un error al revisar los jugadores en BattleMetrics.";

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    content: mensaje,
                    embeds: []
                }).catch(() => {});
            } else {
                await interaction.reply({
                    content: mensaje,
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
        }
    }
};