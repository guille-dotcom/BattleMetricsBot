const {
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlags
} = require("discord.js");

const axios = require("axios");
const ServerConfig = require("../models/ServerConfig");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BM_API = "https://api.battlemetrics.com";
const REQUEST_TIMEOUT = 30000;

const MIN_JUGADORES_CLAN = 6;

// =====================================================
// HEADERS BATTLEMETRICS
// =====================================================

function getHeaders() {

    const token =
        process.env.BATTLEMETRICS_TOKEN;

    if (!token) {
        throw new Error(
            "BATTLEMETRICS_TOKEN no está configurado."
        );
    }

    return {
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${token}`
    };
}

// =====================================================
// NORMALIZAR NOMBRE
// =====================================================

function normalizarNombre(nombre) {

    if (!nombre) {
        return "";
    }

    return String(nombre)
        .normalize("NFC")
        .replace(
            /[\u200B\u200C\u200D\uFEFF]/g,
            ""
        )
        .trim();
}

// =====================================================
// EXTRAER TAG
// =====================================================

function obtenerTag(nombre) {

    const limpio =
        normalizarNombre(nombre);

    if (!limpio) {
        return null;
    }

    // ================================================
    // [F.O.L™] Daren
    // ================================================

    const corchetes =
        limpio.match(
            /^(\[[^\]]{2,30}\])(?:\s+|$)/
        );

    if (
        corchetes &&
        corchetes[1]
    ) {
        return corchetes[1].trim();
    }

    // ================================================
    // (F.O.L™) Daren
    // ================================================

    const parentesis =
        limpio.match(
            /^(\([^) ]{2,30}\))(?:\s+|$)/
        );

    if (
        parentesis &&
        parentesis[1]
    ) {
        return parentesis[1].trim();
    }

    // ================================================
    // F.O.L™ Daren
    // ================================================

    const tagConSimbolo =
        limpio.match(
            /^(.{2,25}[™®©★☆✦✧✪✯✰♦♢✓✔☠☢☣⚔⚡]+)(?:\s+|$)/
        );

    if (
        tagConSimbolo &&
        tagConSimbolo[1]
    ) {
        return tagConSimbolo[1].trim();
    }

    // ================================================
    // F.O.L Daren
    // ================================================

    const tagConPuntos =
        limpio.match(
            /^([A-Za-zÀ-ÿ0-9]{1,8}(?:\.[A-Za-zÀ-ÿ0-9]{1,8}){1,6})(?:\s+|$)/
        );

    if (
        tagConPuntos &&
        tagConPuntos[1]
    ) {
        return tagConPuntos[1].trim();
    }

    // ================================================
    // TAG SIMPLE
    // ================================================

    const partes =
        limpio.split(/\s+/);

    if (
        partes.length >= 2
    ) {

        const primerBloque =
            partes[0].trim();

        if (
            primerBloque.length >= 2 &&
            primerBloque.length <= 20
        ) {
            return primerBloque;
        }
    }

    return null;
}

// =====================================================
// COMPROBAR SESIÓN ACTIVA
// =====================================================

function sesionEstaActiva(session) {

    if (
        !session ||
        !session.attributes
    ) {
        return false;
    }

    const attributes =
        session.attributes;

    if (
        attributes.online === true
    ) {
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
// OBTENER JUGADORES DEL SERVIDOR
// =====================================================

async function obtenerJugadoresDelServidor(
    serverId
) {

    const jugadores =
        new Map();

    let url =
        `${BM_API}/sessions`;

    let primeraPeticion = true;

    let pagina = 1;

    const MAX_PAGINAS = 20;

    while (
        url &&
        pagina <= MAX_PAGINAS
    ) {

        console.log(
            `📡 BattleMetrics | Obteniendo jugadores | página ${pagina}`
        );

        try {

            const response =
                await axios.get(
                    url,
                    {
                        params:
                            primeraPeticion
                                ? {
                                    "filter[servers]":
                                        String(serverId),

                                    "page[size]":
                                        100,

                                    include:
                                        "player"
                                }
                                : undefined,

                        headers:
                            getHeaders(),

                        timeout:
                            REQUEST_TIMEOUT
                    }
                );

            primeraPeticion = false;

            const data =
                response.data || {};

            const sesiones =
                Array.isArray(
                    data.data
                )
                    ? data.data
                    : [];

            const incluidos =
                Array.isArray(
                    data.included
                )
                    ? data.included
                    : [];

            console.log(
                `📡 BattleMetrics | Sesiones recibidas: ${sesiones.length}`
            );

            // ==========================================
            // MAPA DE PLAYERS
            // ==========================================

            const players =
                new Map();

            for (
                const player
                of incluidos
            ) {

                if (
                    player &&
                    player.type === "player" &&
                    player.id
                ) {

                    players.set(
                        String(
                            player.id
                        ),
                        player
                    );
                }
            }

            // ==========================================
            // PROCESAR SESIONES
            // ==========================================

            for (
                const session
                of sesiones
            ) {

                if (
                    !sesionEstaActiva(
                        session
                    )
                ) {
                    continue;
                }

                let playerId =
                    null;

                // ======================================
                // RELATIONSHIPS PLAYER
                // ======================================

                if (
                    session.relationships &&
                    session.relationships.player &&
                    session.relationships.player.data
                ) {

                    const playerData =
                        session
                            .relationships
                            .player
                            .data;

                    if (
                        Array.isArray(
                            playerData
                        )
                    ) {

                        if (
                            playerData[0] &&
                            playerData[0].id
                        ) {

                            playerId =
                                String(
                                    playerData[0].id
                                );
                        }

                    } else if (
                        playerData.id
                    ) {

                        playerId =
                            String(
                                playerData.id
                            );
                    }
                }

                // ======================================
                // PLAYER ID ALTERNATIVO
                // ======================================

                if (
                    !playerId &&
                    session.attributes &&
                    session.attributes.playerId
                ) {

                    playerId =
                        String(
                            session
                                .attributes
                                .playerId
                        );
                }

                if (!playerId) {
                    continue;
                }

                // ======================================
                // BUSCAR PLAYER
                // ======================================

                const player =
                    players.get(
                        playerId
                    );

                let nombre =
                    null;

                if (
                    player &&
                    player.attributes
                ) {

                    nombre =
                        player
                            .attributes
                            .name ||

                        player
                            .attributes
                            .username ||

                        player
                            .attributes
                            .displayName ||

                        null;
                }

                // ======================================
                // NOMBRE DESDE SESSION
                // ======================================

                if (!nombre) {

                    nombre =
                        session
                            .attributes
                            ?.name ||

                        session
                            .attributes
                            ?.playerName ||

                        session
                            .attributes
                            ?.username ||

                        null;
                }

                if (!nombre) {

                    nombre =
                        `Jugador ${playerId}`;
                }

                nombre =
                    normalizarNombre(
                        nombre
                    );

                jugadores.set(
                    playerId,
                    {
                        battlemetricsId:
                            playerId,

                        nombre:
                            nombre
                    }
                );
            }

            // ==========================================
            // SIGUIENTE PÁGINA
            // ==========================================

            let siguiente =
                null;

            if (
                data.links &&
                data.links.next
            ) {

                siguiente =
                    data.links.next;
            }

            if (
                !siguiente
            ) {
                break;
            }

            url =
                siguiente;

            pagina++;

        } catch (error) {

            console.error(
                "=============================================="
            );

            console.error(
                "❌ ERROR BATTLEMETRICS"
            );

            console.error(
                `❌ HTTP: ${
                    error.response?.status ||
                    "desconocido"
                }`
            );

            console.error(
                `❌ STATUS: ${
                    error.response?.statusText ||
                    "desconocido"
                }`
            );

            console.error(
                "❌ URL:",
                error.config?.url ||
                "desconocida"
            );

            console.error(
                "❌ PARAMETROS:",
                error.config?.params ||
                {}
            );

            console.error(
                "❌ RESPUESTA BM:",
                JSON.stringify(
                    error.response?.data ||
                    {},
                    null,
                    2
                )
            );

            console.error(
                "=============================================="
            );

            throw error;
        }
    }

    console.log(
        `👥 Jugadores online encontrados: ${jugadores.size}`
    );

    return Array.from(
        jugadores.values()
    );
}

// =====================================================
// DETECTAR CLANES
// =====================================================

function detectarClanes(
    jugadores
) {

    const grupos =
        new Map();

    for (
        const jugador
        of jugadores
    ) {

        if (
            !jugador ||
            !jugador.nombre
        ) {
            continue;
        }

        const tag =
            obtenerTag(
                jugador.nombre
            );

        if (!tag) {
            continue;
        }

        const clave =
            tag.toLocaleLowerCase();

        if (
            !grupos.has(
                clave
            )
        ) {

            grupos.set(
                clave,
                {
                    tag,
                    jugadores: []
                }
            );
        }

        grupos
            .get(clave)
            .jugadores
            .push(jugador);
    }

    return Array.from(
        grupos.values()
    )
        .filter(
            clan =>
                clan.jugadores.length >=
                MIN_JUGADORES_CLAN
        )
        .sort(
            (a, b) =>
                b.jugadores.length -
                a.jugadores.length
        );
}

// =====================================================
// COMANDO
// =====================================================

module.exports = {

    data:
        new SlashCommandBuilder()
            .setName("revisar")
            .setDescription(
                "Detecta clanes por tag en el servidor configurado"
            ),

    async execute(
        interaction
    ) {

        try {

            await interaction.deferReply();

            console.log(
                "🎯 Ejecutando /revisar"
            );

            console.log(
                "🔎 /revisar iniciado"
            );

            // ==========================================
            // CONFIGURACIÓN
            // ==========================================

            const config =
                await ServerConfig.findOne({
                    guildId:
                        interaction.guild.id
                });

            if (!config) {

                return await interaction.editReply({
                    content:
                        "❌ Este servidor todavía no está configurado."
                });
            }

            // ==========================================
            // MISMO CAMPO QUE
            // configurar-servidor
            // ==========================================

            const serverId =
                config.battleMetricsServerId;

            if (!serverId) {

                return await interaction.editReply({
                    content:
                        "❌ No hay un servidor de BattleMetrics configurado."
                });
            }

            console.log(
                `📡 Servidor BM: ${serverId}`
            );

            // ==========================================
            // API KEY
            // ==========================================

            if (
                !process.env.BATTLEMETRICS_TOKEN
            ) {

                console.error(
                    "❌ BATTLEMETRICS_TOKEN no existe."
                );

                return await interaction.editReply({
                    content:
                        "❌ La API Key de BattleMetrics no está configurada."
                });
            }

            console.log(
                "🔑 API Key BattleMetrics detectada"
            );

            // ==========================================
            // JUGADORES
            // ==========================================

            const jugadores =
                await obtenerJugadoresDelServidor(
                    String(serverId)
                );

            console.log(
                `👥 Jugadores online: ${jugadores.length}`
            );

            // ==========================================
            // CLANES
            // ==========================================

            const clanes =
                detectarClanes(
                    jugadores
                );

            console.log(
                `🏴 Clanes detectados: ${clanes.length}`
            );

            // ==========================================
            // EMBED
            // ==========================================

            const embed =
                new EmbedBuilder()
                    .setTitle(
                        "🏴 Clanes en el servidor"
                    )
                    .setDescription(
                        `Servidor BattleMetrics: \`${serverId}\`\n` +
                        `👥 Jugadores online: **${jugadores.length}**`
                    )
                    .setColor(
                        clanes.length > 0
                            ? 0xff0000
                            : 0x2b2d31
                    )
                    .setTimestamp();

            // ==========================================
            // SIN CLANES
            // ==========================================

            if (
                clanes.length === 0
            ) {

                embed.addFields({
                    name:
                        "🔎 Resultado",

                    value:
                        `No se detectaron tags con **${MIN_JUGADORES_CLAN} o más jugadores**.`
                });

            } else {

                // ======================================
                // CLANES
                // ======================================

                for (
                    const clan
                    of clanes
                ) {

                    let lista =
                        clan.jugadores
                            .map(
                                jugador =>
                                    `• [${jugador.nombre}](https://www.battlemetrics.com/players/${jugador.battlemetricsId})`
                            )
                            .join("\n");

                    if (
                        lista.length > 950
                    ) {

                        lista =
                            lista.substring(
                                0,
                                947
                            ) + "...";
                    }

                    embed.addFields({
                        name:
                            `🏴 Clan en el servidor: ${clan.tag}`,

                        value:
                            `👥 **${clan.jugadores.length} jugadores**\n\n` +
                            lista
                    });
                }
            }

            // ==========================================
            // RESUMEN
            // ==========================================

            embed.addFields({
                name:
                    "📊 Resumen",

                value:
                    `👥 Jugadores online: **${jugadores.length}**\n` +
                    `🏴 Clanes detectados: **${clanes.length}**\n` +
                    `🎯 Mínimo requerido: **${MIN_JUGADORES_CLAN}**`
            });

            // ==========================================
            // RESPUESTA
            // ==========================================

            await interaction.editReply({
                embeds: [embed]
            });

            console.log(
                "✅ /revisar terminado"
            );

        } catch (error) {

            console.error(
                "❌ Error final en /revisar:",
                error.message
            );

            let mensaje =
                "❌ Ocurrió un error al consultar BattleMetrics.";

            if (
                error.response
            ) {

                const bmErrors =
                    error
                        .response
                        .data
                        ?.errors;

                if (
                    Array.isArray(
                        bmErrors
                    ) &&
                    bmErrors.length > 0
                ) {

                    const detalle =
                        bmErrors
                            .map(
                                err => {

                                    return (
                                        err.detail ||
                                        err.message ||
                                        err.title ||
                                        err.code ||
                                        JSON.stringify(
                                            err
                                        )
                                    );
                                }
                            )
                            .join("\n");

                    console.error(
                        "❌ Detalle BattleMetrics:",
                        detalle
                    );

                    mensaje =
                        `❌ BattleMetrics rechazó la consulta.\n\`\`\`\n${detalle.substring(0, 1500)}\n\`\`\``;

                } else {

                    mensaje =
                        `❌ BattleMetrics respondió HTTP ${error.response.status}.`;
                }
            }

            if (
                interaction.deferred ||
                interaction.replied
            ) {

                await interaction.editReply({
                    content:
                        mensaje,
                    embeds: []
                }).catch(
                    () => {}
                );

            } else {

                await interaction.reply({
                    content:
                        mensaje,

                    flags:
                        MessageFlags.Ephemeral
                }).catch(
                    () => {}
                );
            }
        }
    }
};