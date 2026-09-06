const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const axios = require("axios");
const ServerConfig = require("../models/ServerConfig");

const BATTLEMETRICS_API = "https://api.battlemetrics.com";
const STEAM_API = "https://api.steampowered.com";

const RESULTADOS_POR_PAGINA = 10;

// =====================================================
// STEAMID64 VÁLIDOS
// =====================================================

const STEAMID64_MIN = 76561197960265728n;
const STEAMID64_MAX = 76561202255233023n;

function esSteamID64(valor) {
    if (valor === null || valor === undefined) {
        return false;
    }

    const texto = String(valor).trim();

    if (!/^\d{17}$/.test(texto)) {
        return false;
    }

    try {
        const numero = BigInt(texto);

        return (
            numero >= STEAMID64_MIN &&
            numero <= STEAMID64_MAX
        );
    } catch {
        return false;
    }
}

// =====================================================
// HEADERS BATTLEMETRICS
// =====================================================

function getBattleMetricsHeaders() {
    const token = process.env.BATTLEMETRICS_TOKEN;

    if (!token) {
        throw new Error(
            "Falta BATTLEMETRICS_TOKEN en las variables de entorno."
        );
    }

    return {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        "User-Agent": "DiscordSteamBot/1.0"
    };
}

// =====================================================
// BUSCAR JUGADORES EN BATTLEMETRICS
//
// IMPORTANTE:
// Aquí probamos:
// include=player,player.identifier
//
// La idea es que BattleMetrics devuelva los players
// y sus identifiers asociados en la misma respuesta.
// =====================================================

async function buscarJugadoresBattleMetrics(nombre, serverId) {
    const nombreBuscado = String(nombre || "")
        .trim()
        .toLowerCase();

    console.log("");
    console.log("==============================================");
    console.log("[BM] BUSCANDO JUGADOR");
    console.log("==============================================");
    console.log(`[BM] Nombre: "${nombre}"`);
    console.log(`[BM] Server ID: ${serverId}`);
    console.log("[BM] Include: player,player.identifier");

    const response = await axios.get(
        `${BATTLEMETRICS_API}/servers/${serverId}`,
        {
            headers: getBattleMetricsHeaders(),

            params: {
                include: "player,player.identifier"
            },

            timeout: 10000
        }
    );

    const data = response.data || {};

    const players =
        Array.isArray(data.included)
            ? data.included.filter(
                item => item?.type === "player"
            )
            : [];

    const identifiers =
        Array.isArray(data.included)
            ? data.included.filter(
                item => item?.type === "identifier"
            )
            : [];

    console.log(`[BM] Players recibidos: ${players.length}`);
    console.log(`[BM] Identifiers recibidos: ${identifiers.length}`);

    // =================================================
    // MOSTRAR QUÉ TIPOS DE RECURSOS DEVOLVIÓ BM
    // =================================================

    const tipos = {};

    if (Array.isArray(data.included)) {
        for (const item of data.included) {
            const tipo = item?.type || "sin-type";

            tipos[tipo] = (tipos[tipo] || 0) + 1;
        }
    }

    console.log("[BM] Tipos incluidos:", tipos);

    // =================================================
    // BUSCAR NOMBRE EXACTO
    // =================================================

    const encontrados = players.filter(player => {
        const nombreBM = String(
            player?.attributes?.name || ""
        )
            .trim()
            .toLowerCase();

        return nombreBM === nombreBuscado;
    });

    console.log(
        `[BM] Coincidencias exactas: ${encontrados.length}`
    );

    if (encontrados.length === 0) {
        console.log(
            `[BM] ❌ No se encontró "${nombre}"`
        );

        return [];
    }

    // =================================================
    // ASOCIAR IDENTIFIERS CON CADA PLAYER
    // =================================================

    const resultados = encontrados.map(player => {
        const playerId = String(player.id);

        const identificadoresJugador =
            identifiers.filter(identifier => {
                const playerRelationship =
                    identifier?.relationships?.player?.data;

                return (
                    playerRelationship &&
                    String(playerRelationship.id) === playerId
                );
            });

        console.log("");
        console.log("----------------------------------------------");
        console.log(`[BM] PLAYER: ${player.attributes?.name}`);
        console.log(`[BM] PLAYER ID: ${playerId}`);
        console.log(
            `[BM] Identifiers asociados: ${identificadoresJugador.length}`
        );

        for (const identifier of identificadoresJugador) {
            console.log(
                "[BM] IDENTIFIER:",
                JSON.stringify(
                    {
                        id: identifier.id,
                        type: identifier.attributes?.type,
                        identifier: identifier.attributes?.identifier,
                        private: identifier.attributes?.private
                    },
                    null,
                    2
                )
            );
        }

        // =============================================
        // BUSCAR STEAMID64
        //
        // NO confiamos únicamente en attributes.type.
        // BattleMetrics puede devolver el SteamID como
        // type "name", por lo que comprobamos el valor.
        // =============================================

        let steamId64 = null;

        for (const identifier of identificadoresJugador) {
            const valor =
                identifier?.attributes?.identifier;

            if (esSteamID64(valor)) {
                steamId64 = String(valor).trim();

                console.log(
                    `[BM] ✅ STEAMID64 ENCONTRADO: ${steamId64}`
                );

                break;
            }
        }

        if (!steamId64) {
            console.log(
                "[BM] ❌ No se encontró un SteamID64 válido en los identifiers."
            );
        }

        return {
            player: player,
            identifiers: identificadoresJugador,
            steamId64: steamId64
        };
    });

    return resultados;
}

// =====================================================
// OBTENER DATOS DE STEAM
//
// Esto SOLO consulta la Steam Web API usando el
// SteamID64 que ya conseguimos de BattleMetrics.
//
// No hace búsqueda HTML.
// =====================================================

async function obtenerDatosSteam(steamId64) {
    const apiKey = process.env.STEAM_API_KEY;

    if (!apiKey) {
        console.log(
            "[STEAM] ⚠️ No existe STEAM_API_KEY."
        );

        return null;
    }

    if (!esSteamID64(steamId64)) {
        return null;
    }

    console.log(
        `[STEAM] Consultando perfil: ${steamId64}`
    );

    try {
        const response = await axios.get(
            `${STEAM_API}/ISteamUser/GetPlayerSummaries/v2/`,
            {
                params: {
                    key: apiKey,
                    steamids: steamId64
                },
                timeout: 10000
            }
        );

        const players =
            response.data?.response?.players || [];

        const player = players[0] || null;

        if (!player) {
            console.log(
                "[STEAM] ❌ Steam no devolvió el perfil."
            );

            return null;
        }

        console.log(
            `[STEAM] ✅ Perfil encontrado: ${player.personaname}`
        );

        return player;

    } catch (error) {
        console.error(
            "[STEAM] ❌ Error obteniendo perfil:",
            error.response?.status ||
            error.message
        );

        return null;
    }
}

// =====================================================
// PREPARAR RESULTADOS
// =====================================================

async function prepararResultados(jugadores) {
    const resultados = [];

    for (const jugador of jugadores) {
        let steam = null;

        if (jugador.steamId64) {
            steam = await obtenerDatosSteam(
                jugador.steamId64
            );
        }

        resultados.push({
            bm: jugador.player,
            identifiers: jugador.identifiers,
            steamId64: jugador.steamId64,
            steam: steam
        });
    }

    return resultados;
}

// =====================================================
// CREAR EMBED
// =====================================================

function crearEmbed(resultados, pagina, totalPaginas) {
    const inicio =
        pagina * RESULTADOS_POR_PAGINA;

    const fin =
        inicio + RESULTADOS_POR_PAGINA;

    const paginaResultados =
        resultados.slice(inicio, fin);

    const embed = new EmbedBuilder()
        .setColor(0x1b2838)
        .setTitle("🔎 Resultados de Steam")
        .setDescription(
            `Página ${pagina + 1}/${totalPaginas}`
        )
        .setTimestamp();

    if (paginaResultados.length === 0) {
        embed.setDescription(
            "❌ No hay resultados para esta página."
        );

        return embed;
    }

    // =================================================
    // THUMBNAIL
    // =================================================

    const primerResultado =
        paginaResultados[0];

    if (
        primerResultado?.steam?.avatarfull
    ) {
        embed.setThumbnail(
            primerResultado.steam.avatarfull
        );
    }

    // =================================================
    // RESULTADOS
    // =================================================

    for (
        let i = 0;
        i < paginaResultados.length;
        i++
    ) {
        const jugador =
            paginaResultados[i];

        const bmNombre =
            jugador.bm?.attributes?.name ||
            "Sin nombre";

        const steamNombre =
            jugador.steam?.personaname ||
            bmNombre;

        const steamId64 =
            jugador.steamId64;

        const steamUrl = steamId64
            ? `https://steamcommunity.com/profiles/${steamId64}`
            : null;

        const bmId =
            jugador.bm?.id ||
            "Desconocido";

        let valor =
            `**Steam:** ${steamNombre}\n`;

        if (steamId64) {
            valor +=
                `**SteamID64:** \`${steamId64}\`\n`;
        } else {
            valor +=
                `**SteamID64:** ❌ No encontrado\n`;
        }

        if (steamUrl) {
            valor +=
                `**Perfil:** [Abrir Steam](${steamUrl})\n`;
        }

        valor +=
            `**BattleMetrics:** \`${bmId}\``;

        embed.addFields({
            name: `${i + 1}. ${bmNombre}`,
            value: valor,
            inline: false
        });
    }

    return embed;
}

// =====================================================
// BOTONES DE PAGINACIÓN
// =====================================================

function crearBotones(pagina, totalPaginas) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("steam_anterior")
            .setLabel("Anterior")
            .setEmoji("⬅️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(pagina <= 0),

        new ButtonBuilder()
            .setCustomId("steam_siguiente")
            .setLabel("Siguiente")
            .setEmoji("➡️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(
                pagina >= totalPaginas - 1
            )
    );
}

// =====================================================
// COMANDO
// =====================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName("steam")
        .setDescription(
            "Busca un jugador por nombre en el servidor de BattleMetrics configurado"
        )
        .addStringOption(option =>
            option
                .setName("nombre")
                .setDescription(
                    "Nombre exacto del jugador"
                )
                .setRequired(true)
        ),

    async execute(interaction) {
        console.log("");
        console.log("🎯 Ejecutando /steam");

        try {
            // =============================================
            // COMPROBAR CONFIGURACIÓN
            // =============================================

            const config =
                await ServerConfig.findOne({
                    guildId: interaction.guild.id
                });

            if (!config) {
                return interaction.reply({
                    content:
                        "❌ Este servidor de Discord no tiene configurado un servidor de BattleMetrics.\n\nUsa `/configurar-servidor` primero.",
                    ephemeral: true
                });
            }

            if (!config.battleMetricsServerId) {
                return interaction.reply({
                    content:
                        "❌ No hay un servidor de BattleMetrics configurado para este servidor de Discord.",
                    ephemeral: true
                });
            }

            const battleMetricsServerId =
                String(
                    config.battleMetricsServerId
                ).trim();

            const nombre =
                interaction.options
                    .getString("nombre")
                    .trim();

            if (!nombre) {
                return interaction.reply({
                    content:
                        "❌ Debes indicar un nombre.",
                    ephemeral: true
                });
            }

            // =============================================
            // RESPUESTA INICIAL
            // =============================================

            await interaction.deferReply();

            console.log(
                `[STEAM] Entrada recibida: "${nombre}"`
            );

            console.log(
                `[STEAM] BattleMetrics Server ID: ${battleMetricsServerId}`
            );

            // =============================================
            // BUSCAR EN BATTLEMETRICS
            // =============================================

            const jugadores =
                await buscarJugadoresBattleMetrics(
                    nombre,
                    battleMetricsServerId
                );

            if (!jugadores.length) {
                return interaction.editReply({
                    content:
                        `❌ No se encontró ningún jugador llamado exactamente \`${nombre}\` en el servidor de BattleMetrics configurado.`
                });
            }

            console.log(
                `[STEAM] Jugadores encontrados: ${jugadores.length}`
            );

            // =============================================
            // PREPARAR DATOS
            // =============================================

            const resultados =
                await prepararResultados(
                    jugadores
                );

            // =============================================
            // PAGINACIÓN
            // =============================================

            let paginaActual = 0;

            const totalPaginas =
                Math.max(
                    1,
                    Math.ceil(
                        resultados.length /
                        RESULTADOS_POR_PAGINA
                    )
                );

            const embed =
                crearEmbed(
                    resultados,
                    paginaActual,
                    totalPaginas
                );

            const componentes =
                totalPaginas > 1
                    ? [
                        crearBotones(
                            paginaActual,
                            totalPaginas
                        )
                    ]
                    : [];

            const mensaje =
                await interaction.editReply({
                    embeds: [embed],
                    components: componentes
                });

            // =============================================
            // SI SOLO HAY UNA PÁGINA
            // =============================================

            if (totalPaginas <= 1) {
                return;
            }

            // =============================================
            // COLLECTOR
            // =============================================

            const collector =
                mensaje.createMessageComponentCollector({
                    time: 120000
                });

            collector.on(
                "collect",
                async buttonInteraction => {
                    if (
                        buttonInteraction.user.id !==
                        interaction.user.id
                    ) {
                        return buttonInteraction.reply({
                            content:
                                "❌ Solo la persona que ejecutó el comando puede usar estos botones.",
                            ephemeral: true
                        });
                    }

                    if (
                        buttonInteraction.customId ===
                        "steam_anterior"
                    ) {
                        paginaActual--;

                        if (paginaActual < 0) {
                            paginaActual = 0;
                        }
                    }

                    if (
                        buttonInteraction.customId ===
                        "steam_siguiente"
                    ) {
                        paginaActual++;

                        if (
                            paginaActual >=
                            totalPaginas
                        ) {
                            paginaActual =
                                totalPaginas - 1;
                        }
                    }

                    const nuevoEmbed =
                        crearEmbed(
                            resultados,
                            paginaActual,
                            totalPaginas
                        );

                    await buttonInteraction.update({
                        embeds: [nuevoEmbed],
                        components: [
                            crearBotones(
                                paginaActual,
                                totalPaginas
                            )
                        ]
                    });
                }
            );

            collector.on(
                "end",
                async () => {
                    try {
                        const embedFinal =
                            crearEmbed(
                                resultados,
                                paginaActual,
                                totalPaginas
                            );

                        await interaction.editReply({
                            embeds: [embedFinal],
                            components: []
                        });
                    } catch (error) {
                        // El mensaje puede haber sido eliminado.
                    }
                }
            );

        } catch (error) {
            console.error(
                "❌ ERROR EN /steam:",
                error.response?.data ||
                error.stack ||
                error.message
            );

            try {
                if (
                    interaction.deferred ||
                    interaction.replied
                ) {
                    await interaction.editReply({
                        content:
                            "❌ Ocurrió un error al buscar el jugador en BattleMetrics."
                    });
                } else {
                    await interaction.reply({
                        content:
                            "❌ Ocurrió un error al buscar el jugador en BattleMetrics.",
                        ephemeral: true
                    });
                }
            } catch {
                // Nada que hacer si Discord ya no permite responder.
            }
        } finally {
            console.log("✅ /steam terminado");
        }
    }
};