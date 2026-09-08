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

// Mínimo de jugadores con el mismo tag para considerarlo clan
const MIN_JUGADORES_CLAN = 6;

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
// EXTRAER SERVER ID
// =====================================================

function extraerServerId(valor) {
    if (!valor) {
        return null;
    }

    const texto = String(valor).trim();

    // Si ya es un ID
    if (/^\d+$/.test(texto)) {
        return texto;
    }

    // URL BattleMetrics
    const match = texto.match(
        /battlemetrics\.com\/servers\/rust\/(\d+)/i
    );

    if (match && match[1]) {
        return match[1];
    }

    return null;
}

// =====================================================
// OBTENER SERVER ID DE LA CONFIGURACIÓN
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
        return extraerServerId(
            config.battleMetricsServer
        );
    }

    if (config.battlemetricsServer) {
        return extraerServerId(
            config.battlemetricsServer
        );
    }

    if (config.battleMetricsServerUrl) {
        return extraerServerId(
            config.battleMetricsServerUrl
        );
    }

    if (config.battlemetricsServerUrl) {
        return extraerServerId(
            config.battlemetricsServerUrl
        );
    }

    return null;
}

// =====================================================
// COMPROBAR SESIÓN ACTIVA
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
// EXTRAER TAG DEL NOMBRE
// =====================================================

function obtenerTag(nombre) {
    const limpio = normalizarNombre(nombre);

    if (!limpio) {
        return null;
    }

    // =================================================
    // [F.O.L™] Daren
    // =================================================

    const corchetes = limpio.match(
        /^(\[[^\]]{2,30}\])(?:\s+|$)/
    );

    if (corchetes && corchetes[1]) {
        return corchetes[1].trim();
    }

    // =================================================
    // (F.O.L™) Daren
    // =================================================

    const parentesis = limpio.match(
        /^(\([^) ]{2,30}\))(?:\s+|$)/
    );

    if (parentesis && parentesis[1]) {
        return parentesis[1].trim();
    }

    // =================================================
    // F.O.L™ Daren
    // =================================================

    const tagConSimbolo = limpio.match(
        /^(.{2,25}[™®©★☆✦✧✪✯✰♦♢✓✔☠☢☣⚔⚡]+)(?:\s+|$)/
    );

    if (
        tagConSimbolo &&
        tagConSimbolo[1]
    ) {
        return tagConSimbolo[1].trim();
    }

    // =================================================
    // F.O.L Daren
    // =================================================

    const tagConPuntos = limpio.match(
        /^([A-Za-zÀ-ÿ0-9]{1,8}(?:\.[A-Za-zÀ-ÿ0-9]{1,8}){1,6})(?:\s+|$)/
    );

    if (
        tagConPuntos &&
        tagConPuntos[1]
    ) {
        return tagConPuntos[1].trim();
    }

    // =================================================
    // TAG SIMPLE
    // Ejemplo:
    //
    // ABC Daren
    // ABC Pedro
    // =================================================

    const partes = limpio.split(/\s+/);

    if (partes.length >= 2) {
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
// OBTENER JUGADORES ONLINE DEL SERVIDOR
// =====================================================

async function obtenerJugadoresDelServidor(
    serverId
) {
    const jugadores = new Map();

    let pagina = 1;

    const MAX_PAGINAS = 10;

    while (pagina <= MAX_PAGINAS) {
        console.log(
            `📡 BattleMetrics | Obteniendo jugadores | página ${pagina}`
        );

        const response = await axios.get(
            `${BM_API}/sessions`,
            {
                params: {
                    "filter[servers]":
                        serverId,
                    "page[size]": 100,
                    "page[number]":
                        pagina,
                    include: "player"
                },
                headers: getHeaders(),
                timeout: REQUEST_TIMEOUT
            }
        );

        const data =
            response.data || {};

        const sesiones =
            Array.isArray(data.data)
                ? data.data
                : [];

        const incluidos =
            Array.isArray(data.included)
                ? data.included
                : [];

        // =================================================
        // MAPA DE PLAYERS
        // =================================================

        const players = new Map();

        for (const player of incluidos) {
            if (
                player &&
                player.type === "player" &&
                player.id
            ) {
                players.set(
                    String(player.id),
                    player
                );
            }
        }

        // =================================================
        // PROCESAR SESIONES
        // =================================================

        for (const session of sesiones) {
            if (!sesionEstaActiva(session)) {
                continue;
            }

            let playerId = null;

            // relationships.player
            if (
                session.relationships &&
                session.relationships.player &&
                session.relationships.player.data
            ) {
                const playerData =
                    session.relationships.player.data;

                if (Array.isArray(playerData)) {
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

            // Fallback
            if (
                !playerId &&
                session.attributes &&
                session.attributes.playerId
            ) {
                playerId =
                    String(
                        session.attributes.playerId
                    );
            }

            if (!playerId) {
                continue;
            }

            const player =
                players.get(playerId);

            let nombre = null;

            if (
                player &&
                player.attributes
            ) {
                nombre =
                    player.attributes.name ||
                    player.attributes.username ||
                    player.attributes.displayName ||
                    null;
            }

            // Fallback desde la sesión
            if (!nombre) {
                nombre =
                    session.attributes?.name ||
                    session.attributes?.playerName ||
                    session.attributes?.username ||
                    null;
            }

            if (!nombre) {
                nombre =
                    `Jugador ${playerId}`;
            }

            jugadores.set(
                playerId,
                {
                    battlemetricsId:
                        playerId,
                    nombre:
                        normalizarNombre(
                            nombre
                        )
                }
            );
        }

        // =================================================
        // PAGINACIÓN
        // =================================================

        if (sesiones.length < 100) {
            break;
        }

        pagina++;
    }

    console.log(
        `👥 Jugadores online encontrados: ${jugadores.size}`
    );

    return Array.from(
        jugadores.values()
    );
}

// =====================================================
// DETECTAR TAGS REPETIDOS
// =====================================================

function detectarClanes(jugadores) {
    const grupos = new Map();

    for (const jugador of jugadores) {
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

        if (!grupos.has(clave)) {
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

    // =================================================
    // SOLO 6 O MÁS
    // =================================================

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

    data: new SlashCommandBuilder()
        .setName("revisar")
        .setDescription(
            "Detecta clanes por tag en el servidor configurado"
        ),

    async execute(interaction) {

        try {

            // =================================================
            // DEFER
            // =================================================

            await interaction.deferReply();

            console.log(
                "🔎 /revisar iniciado"
            );

            // =================================================
            // CONFIGURACIÓN
            // =================================================

            const config =
                await ServerConfig.findOne({
                    guildId:
                        interaction.guild.id
                });

            if (!config) {
                return interaction.editReply({
                    content:
                        "❌ Este servidor todavía no está configurado."
                });
            }

            // =================================================
            // SERVER ID
            // =================================================

            const serverId =
                obtenerServerId(config);

            if (!serverId) {
                return interaction.editReply({
                    content:
                        "❌ No hay un servidor de BattleMetrics configurado correctamente."
                });
            }

            console.log(
                `📡 Servidor BM: ${serverId}`
            );

            // =================================================
            // OBTENER JUGADORES
            // =================================================

            const jugadores =
                await obtenerJugadoresDelServidor(
                    serverId
                );

            console.log(
                `👥 Jugadores online: ${jugadores.length}`
            );

            // =================================================
            // DETECTAR TAGS
            // =================================================

            const clanes =
                detectarClanes(
                    jugadores
                );

            console.log(
                `🏴 Clanes detectados: ${clanes.length}`
            );

            // =================================================
            // EMBED
            // =================================================

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

            // =================================================
            // SIN CLANES
            // =================================================

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

                // =================================================
                // MOSTRAR CADA CLAN
                // =================================================

                for (
                    const clan
                    of clanes
                ) {

                    let lista =
                        clan.jugadores
                            .map(
                                jugador => {

                                    return (
                                        `• [${jugador.nombre}](https://www.battlemetrics.com/players/${jugador.battlemetricsId})`
                                    );
                                }
                            )
                            .join("\n");

                    // Discord permite máximo 1024
                    // caracteres por field.

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

            // =================================================
            // RESUMEN
            // =================================================

            embed.addFields({
                name:
                    "📊 Resumen",
                value:
                    `Jugadores online: **${jugadores.length}**\n` +
                    `Clanes detectados: **${clanes.length}**\n` +
                    `Mínimo requerido: **${MIN_JUGADORES_CLAN}**`
            });

            // =================================================
            // ENVIAR
            // =================================================

            await interaction.editReply({
                embeds: [embed]
            });

            console.log(
                "✅ /revisar terminado"
            );

        } catch (error) {

            console.error(
                "❌ Error en /revisar:",
                error
            );

            const mensaje =
                "❌ Ocurrió un error al detectar los clanes.";

            if (
                interaction.deferred ||
                interaction.replied
            ) {

                await interaction.editReply({
                    content: mensaje,
                    embeds: []
                }).catch(() => {});

            } else {

                await interaction.reply({
                    content: mensaje,
                    flags:
                        MessageFlags.Ephemeral
                }).catch(() => {});
            }
        }
    }
};