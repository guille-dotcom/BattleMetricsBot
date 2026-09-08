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

const MIN_JUGADORES_CLAN = 6;

const REQUEST_TIMEOUT = 15000;


// =====================================================
// HEADERS BATTLEMETRICS
// =====================================================

function getHeaders() {

    const token =
        process.env.BATTLEMETRICS_TOKEN;

    return token
        ? {
            Accept:
                "application/vnd.api+json",

            "Content-Type":
                "application/json",

            Authorization:
                `Bearer ${token}`
        }
        : {
            Accept:
                "application/vnd.api+json",

            "Content-Type":
                "application/json"
        };
}


// =====================================================
// NORMALIZAR NOMBRE
// =====================================================

function normalizarNombre(nombre) {

    return String(nombre || "")
        .trim()
        .replace(/\s+/g, " ");
}


// =====================================================
// OBTENER TAG DEL JUGADOR
// =====================================================
//
// Soporta:
//
// [F.O.L™] Daren
// (F.O.L™) Daren
// F.O.L™ Daren
// F.O.L Daren
// ABC Daren
//
// No toma automáticamente la primera palabra de
// cualquier nombre normal para evitar falsos positivos.
// =====================================================

function obtenerTag(nombre) {

    const nombreNormalizado =
        normalizarNombre(nombre);

    if (!nombreNormalizado) {
        return null;
    }


    // =================================================
    // [TAG] Nombre
    // =================================================

    const corchetes =
        nombreNormalizado.match(
            /^\[([^\]]{2,30})\]\s+/u
        );

    if (corchetes) {

        return corchetes[1].trim();
    }


    // =================================================
    // (TAG) Nombre
    // =================================================

    const parentesis =
        nombreNormalizado.match(
            /^\(([^)]{2,30})\)\s+/u
        );

    if (parentesis) {

        return parentesis[1].trim();
    }


    // =================================================
    // TAG Nombre
    // =================================================

    const partes =
        nombreNormalizado.split(/\s+/);

    if (partes.length >= 2) {

        const posibleTag =
            partes[0].trim();


        // ---------------------------------------------
        // TAG con símbolos típicos
        // Ej: F.O.L™
        // ---------------------------------------------

        const tieneFormatoClan =
            /[.™®©_\-]/u.test(
                posibleTag
            );


        if (
            tieneFormatoClan &&
            posibleTag.length >= 2 &&
            posibleTag.length <= 30
        ) {

            return posibleTag;
        }


        // ---------------------------------------------
        // TAG completamente en mayúsculas
        // Ej: FOL Daren
        // ABC Player
        // ---------------------------------------------

        const letras =
            posibleTag.replace(
                /[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g,
                ""
            );

        if (
            letras.length >= 2 &&
            letras.length <= 10 &&
            letras === letras.toUpperCase()
        ) {

            return posibleTag;
        }
    }


    return null;
}


// =====================================================
// OBTENER JUGADORES DEL SERVIDOR
// =====================================================
//
// Esta es EXACTAMENTE la misma consulta que utiliza
// battlemetricsHours.js:
//
// GET /servers/{serverId}?include=player
//
// No usamos /sessions.
// =====================================================

async function obtenerJugadoresDelServidor(
    serverId
) {

    console.log(
        `🔎 BM | Consultando jugadores del servidor ${serverId}...`
    );


    const token =
        process.env.BATTLEMETRICS_TOKEN;


    if (!token) {

        throw new Error(
            "BATTLEMETRICS_TOKEN no está configurado en .env"
        );
    }


    try {

        const response =
            await axios.get(
                `${BM_API}/servers/${serverId}`,
                {
                    headers:
                        getHeaders(),

                    params: {
                        include:
                            "player"
                    },

                    timeout:
                        REQUEST_TIMEOUT
                }
            );


        console.log(
            `📡 BM | Respuesta servidor: HTTP ${response.status}`
        );


        const included =
            response.data?.included ||
            [];


        console.log(
            `👥 BM | Elementos incluidos: ${included.length}`
        );


        const players =
            included.filter(
                item =>
                    item &&
                    item.type === "player"
            );


        console.log(
            `👥 BM | Jugadores encontrados: ${players.length}`
        );


        return players
            .map(
                player => {

                    const nombre =
                        normalizarNombre(
                            player.attributes?.name
                        );


                    return {

                        id:
                            player.id,

                        name:
                            nombre,

                        timePlayedSeconds:
                            Number(
                                player.meta?.timePlayed
                            ) || 0
                    };
                }
            )
            .filter(
                player =>
                    player.id &&
                    player.name
            );


    } catch (error) {

        console.error(
            "❌ BM | Error obteniendo jugadores del servidor:"
        );

        console.error(
            error.response?.status ||
            error.message
        );

        console.error(
            error.response?.data ||
            ""
        );

        throw error;
    }
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

        const tag =
            obtenerTag(
                jugador.name
            );


        if (!tag) {
            continue;
        }


        const clave =
            tag
                .toLowerCase()
                .trim();


        if (!grupos.has(clave)) {

            grupos.set(
                clave,
                {
                    tag:
                        tag,

                    jugadores:
                        []
                }
            );
        }


        grupos
            .get(clave)
            .jugadores
            .push(
                jugador
            );
    }


    return Array
        .from(
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
// CREAR EMBED DEL CLAN
// =====================================================

function crearEmbedClan(
    clan
) {

    const jugadoresTexto =
        clan.jugadores
            .map(
                jugador =>
                    `• [${jugador.name}](https://www.battlemetrics.com/players/${jugador.id})`
            )
            .join("\n");


    const textoLimitado =
        jugadoresTexto.length > 950
            ? jugadoresTexto.substring(
                0,
                947
            ) + "..."
            : jugadoresTexto;


    return {

        name:
            `🏴 Clan en el servidor: ${clan.tag}`,

        value:
            `**${clan.jugadores.length} jugadores detectados**\n\n` +
            textoLimitado,

        inline:
            false
    };
}


// =====================================================
// COMANDO
// =====================================================

module.exports = {

    data:
        new SlashCommandBuilder()

            .setName("revisar")

            .setDescription(
                "Revisa los jugadores del servidor y detecta clanes de 6 o más integrantes"
            ),


    async execute(
        interaction
    ) {

        console.log(
            "🎯 Ejecutando /revisar"
        );


        // =================================================
        // DEFER
        // =================================================

        await interaction.deferReply();


        // =================================================
        // VERIFICAR CONFIGURACIÓN
        // =================================================

        let config;

        try {

            config =
                await ServerConfig.findOne({
                    guildId:
                        interaction.guild.id
                });

        } catch (error) {

            console.error(
                "❌ MongoDB | Error obteniendo configuración:",
                error.message
            );


            return await interaction.editReply({

                content:
                    "❌ No se pudo consultar la configuración del servidor."
            });
        }


        if (
            !config ||
            !config.battleMetricsServerId
        ) {

            return await interaction.editReply({

                content:
                    "❌ No hay un servidor de BattleMetrics configurado.\n\n" +
                    "Usa `/configurar-servidor` primero."
            });
        }


        const serverId =
            String(
                config.battleMetricsServerId
            ).trim();


        console.log(
            `🎮 BM | Servidor configurado: ${serverId}`
        );


        // =================================================
        // CONSULTAR JUGADORES
        // =================================================

        let jugadores = [];


        try {

            jugadores =
                await obtenerJugadoresDelServidor(
                    serverId
                );

        } catch (error) {

            console.error(
                "❌ /revisar | Error BattleMetrics:",
                error.message
            );


            const detalle =
                error.response?.data
                    ?.errors?.[0]
                    ?.detail ||
                error.response?.data
                    ?.errors?.[0]
                    ?.title ||
                error.message ||
                "Error desconocido";


            return await interaction.editReply({

                content:
                    "❌ BattleMetrics no pudo devolver los jugadores del servidor.\n\n" +
                    `Servidor: \`${serverId}\`\n` +
                    `Error: \`${detalle}\``
            });
        }


        // =================================================
        // SIN JUGADORES
        // =================================================

        if (
            jugadores.length === 0
        ) {

            const embed =
                new EmbedBuilder()

                    .setTitle(
                        "🔎 Revisión del servidor"
                    )

                    .setColor(
                        "#5865F2"
                    )

                    .setDescription(
                        `No se encontraron jugadores en el servidor configurado.\n\n` +
                        `🎮 Servidor BattleMetrics: \`${serverId}\``
                    )

                    .setTimestamp()

                    .setFooter({
                        text:
                            "RustLogix"
                    });


            return await interaction.editReply({

                embeds:
                    [embed]
            });
        }


        // =================================================
        // DETECTAR CLANES
        // =================================================

        const clanes =
            detectarClanes(
                jugadores
            );


        console.log(
            `🏴 BM | Clanes encontrados: ${clanes.length}`
        );


        for (
            const clan
            of clanes
        ) {

            console.log(
                `🏴 ${clan.tag} | ${clan.jugadores.length} jugadores`
            );

            for (
                const jugador
                of clan.jugadores
            ) {

                console.log(
                    `   └─ ${jugador.name} | BM ${jugador.id}`
                );
            }
        }


        // =================================================
        // SIN CLANES
        // =================================================

        if (
            clanes.length === 0
        ) {

            const embed =
                new EmbedBuilder()

                    .setTitle(
                        "🔎 Revisión del servidor"
                    )

                    .setColor(
                        "#57F287"
                    )

                    .setDescription(
                        `No se detectaron clanes con **${MIN_JUGADORES_CLAN} o más jugadores**.\n\n` +
                        `👥 Jugadores consultados: **${jugadores.length}**\n` +
                        `🎮 Servidor BattleMetrics: \`${serverId}\``
                    )

                    .setTimestamp()

                    .setFooter({
                        text:
                            "RustLogix"
                    });


            return await interaction.editReply({

                embeds:
                    [embed]
            });
        }


        // =================================================
        // CREAR EMBED
        // =================================================

        const embed =
            new EmbedBuilder()

                .setTitle(
                    "🏴 Clanes detectados en el servidor"
                )

                .setColor(
                    "#ED4245"
                )

                .setDescription(
                    `Se detectaron **${clanes.length} clan(es)** con ` +
                    `**${MIN_JUGADORES_CLAN}+ jugadores**.\n\n` +
                    `👥 Jugadores consultados: **${jugadores.length}**\n` +
                    `🎮 Servidor BattleMetrics: \`${serverId}\``
                )

                .setTimestamp()

                .setFooter({
                    text:
                        "RustLogix"
                });


        // =================================================
        // AGREGAR CLANES
        // =================================================

        for (
            const clan
            of clanes.slice(0, 25)
        ) {

            embed.addFields(
                crearEmbedClan(
                    clan
                )
            );
        }


        // =================================================
        // ENVIAR
        // =================================================

        return await interaction.editReply({

            embeds:
                [embed]
        });
    }
};