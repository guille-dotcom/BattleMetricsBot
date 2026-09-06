const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const axios = require("axios");

const ServerConfig = require("../models/ServerConfig");
const {
    searchBattleMetricsPlayer
} = require("../services/battlemetricsHours");

const STEAM_API = "https://api.steampowered.com";
const BATTLEMETRICS_API = "https://api.battlemetrics.com";

const STEAM_API_KEY = process.env.STEAM_API_KEY;
const BATTLEMETRICS_TOKEN = process.env.BATTLEMETRICS_TOKEN;

const RESULTADOS_POR_PAGINA = 10;

// =====================================================
// HEADERS BATTLEMETRICS
// =====================================================

function getBattleMetricsHeaders() {
    return {
        Authorization: `Bearer ${BATTLEMETRICS_TOKEN}`,
        "Content-Type": "application/json"
    };
}

// =====================================================
// BUSCAR UN STEAMID64 DENTRO DE CUALQUIER RESPUESTA BM
// =====================================================

function buscarSteamID64EnObjeto(objeto) {
    const encontrados = new Set();

    function recorrer(valor) {
        if (valor === null || valor === undefined) {
            return;
        }

        if (
            typeof valor === "string" ||
            typeof valor === "number"
        ) {
            const texto = String(valor).trim();

            // SteamID64 normalmente son 17 dígitos
            if (/^\d{17}$/.test(texto)) {
                encontrados.add(texto);
            }

            return;
        }

        if (Array.isArray(valor)) {
            for (const elemento of valor) {
                recorrer(elemento);
            }

            return;
        }

        if (typeof valor === "object") {
            for (const [clave, contenido] of Object.entries(valor)) {
                const claveLower =
                    String(clave).toLowerCase();

                // Si la clave indica claramente Steam
                if (
                    claveLower.includes("steam") ||
                    claveLower.includes("steamid")
                ) {
                    if (
                        typeof contenido === "string" ||
                        typeof contenido === "number"
                    ) {
                        const texto =
                            String(contenido).trim();

                        if (/^\d{17}$/.test(texto)) {
                            encontrados.add(texto);
                        }
                    }
                }

                recorrer(contenido);
            }
        }
    }

    recorrer(objeto);

    return [...encontrados][0] || null;
}

// =====================================================
// OBTENER INFORMACIÓN COMPLETA DEL PLAYER BM
// =====================================================

async function obtenerDatosBattleMetricsPlayer(playerId) {
    try {
        const response = await axios.get(
            `${BATTLEMETRICS_API}/players/${playerId}`,
            {
                headers: getBattleMetricsHeaders(),
                params: {
                    include: "server"
                },
                timeout: 10000
            }
        );

        return response.data || null;

    } catch (error) {
        console.error(
            "[BATTLEMETRICS] Error obteniendo player:",
            error.response?.data || error.message
        );

        return null;
    }
}

// =====================================================
// OBTENER STEAMID64
// =====================================================

async function obtenerSteamID64(playerId, playerOriginal) {
    // -------------------------------------------------
    // PRIMERO: buscarlo directamente en el resultado
    // original de BattleMetrics
    // -------------------------------------------------

    let steamId64 =
        buscarSteamID64EnObjeto(playerOriginal);

    if (steamId64) {
        console.log(
            `[BATTLEMETRICS] SteamID64 encontrado en resultado: ${steamId64}`
        );

        return steamId64;
    }

    // -------------------------------------------------
    // SEGUNDO: consultar el recurso del jugador
    // -------------------------------------------------

    const datosPlayer =
        await obtenerDatosBattleMetricsPlayer(
            playerId
        );

    if (!datosPlayer) {
        return null;
    }

    steamId64 =
        buscarSteamID64EnObjeto(datosPlayer);

    if (steamId64) {
        console.log(
            `[BATTLEMETRICS] SteamID64 encontrado en player: ${steamId64}`
        );

        return steamId64;
    }

    console.log(
        `[BATTLEMETRICS] No se encontró SteamID64 para BM ${playerId}`
    );

    return null;
}

// =====================================================
// OBTENER PERFIL STEAM
// =====================================================

async function obtenerDatosSteam(steamId64) {
    if (!steamId64) {
        return null;
    }

    if (!STEAM_API_KEY) {
        console.log(
            "[STEAM] STEAM_API_KEY no configurada."
        );

        return null;
    }

    try {
        const response = await axios.get(
            `${STEAM_API}/ISteamUser/GetPlayerSummaries/v2/`,
            {
                params: {
                    key: STEAM_API_KEY,
                    steamids: steamId64
                },
                timeout: 10000
            }
        );

        const players =
            response.data?.response?.players || [];

        return players[0] || null;

    } catch (error) {
        console.error(
            "[STEAM] Error obteniendo perfil:",
            error.response?.data || error.message
        );

        return null;
    }
}

// =====================================================
// BUSCAR JUGADOR EN BATTLEMETRICS
// =====================================================

async function buscarJugadoresBattleMetrics(
    nombre,
    serverId
) {
    console.log(
        "[BATTLEMETRICS] ========================================"
    );

    console.log(
        "[BATTLEMETRICS] NAME SEARCH API"
    );

    console.log(
        `[BATTLEMETRICS] Nombre: "${nombre}"`
    );

    console.log(
        `[BATTLEMETRICS] Servidor: ${serverId}`
    );

    console.log(
        "[BATTLEMETRICS] ========================================"
    );

    try {
        const resultado =
            await searchBattleMetricsPlayer(
                nombre,
                serverId
            );

        if (!resultado) {
            console.log(
                "[BATTLEMETRICS] No se encontraron jugadores."
            );

            return [];
        }

        if (
            resultado.duplicate &&
            Array.isArray(resultado.players)
        ) {
            console.log(
                `[BATTLEMETRICS] Jugadores encontrados: ${resultado.players.length}`
            );

            return resultado.players;
        }

        console.log(
            "[BATTLEMETRICS] Jugador encontrado: 1"
        );

        return [resultado];

    } catch (error) {
        console.error(
            "[BATTLEMETRICS] Error buscando jugador:",
            error.response?.data || error.message
        );

        return [];
    }
}

// =====================================================
// PREPARAR RESULTADOS
// =====================================================

async function prepararResultados(jugadores) {
    const resultados = [];

    for (const player of jugadores) {
        const playerId =
            String(player?.id || "").trim();

        if (!playerId) {
            continue;
        }

        const nombreBM =
            player?.attributes?.name ||
            "Desconocido";

        console.log(
            `[BATTLEMETRICS] Procesando: ${nombreBM} (${playerId})`
        );

        // ---------------------------------------------
        // OBTENER STEAMID64
        // ---------------------------------------------

        const steamId64 =
            await obtenerSteamID64(
                playerId,
                player
            );

        let steam = null;

        // ---------------------------------------------
        // SOLO SI TENEMOS STEAMID
        // ---------------------------------------------

        if (steamId64) {
            console.log(
                `[STEAM] SteamID64 encontrado: ${steamId64}`
            );

            steam =
                await obtenerDatosSteam(
                    steamId64
                );
        } else {
            console.log(
                `[STEAM] No se encontró SteamID64 para ${nombreBM}`
            );
        }

        resultados.push({
            battleMetricsId: playerId,
            battleMetricsName: nombreBM,
            steamId64,
            steam
        });
    }

    return resultados;
}

// =====================================================
// CREAR EMBED
// =====================================================

function crearEmbed(
    resultados,
    pagina,
    nombreBuscado
) {
    const inicio =
        pagina * RESULTADOS_POR_PAGINA;

    const fin =
        inicio + RESULTADOS_POR_PAGINA;

    const paginaResultados =
        resultados.slice(inicio, fin);

    const totalPaginas =
        Math.max(
            1,
            Math.ceil(
                resultados.length /
                RESULTADOS_POR_PAGINA
            )
        );

    const embed =
        new EmbedBuilder()
            .setTitle("🔎 Resultados de Steam")
            .setDescription(
                `Resultados encontrados para **${nombreBuscado}**`
            )
            .setColor(0x5865f2)
            .setFooter({
                text:
                    `Página ${pagina + 1}/${totalPaginas} • ` +
                    `${resultados.length} resultado(s)`
            });

    if (!paginaResultados.length) {
        embed.setDescription(
            `No hay resultados para **${nombreBuscado}**.`
        );

        return embed;
    }

    for (
        let i = 0;
        i < paginaResultados.length;
        i++
    ) {
        const jugador =
            paginaResultados[i];

        const numero =
            inicio + i + 1;

        const nombre =
            jugador.steam?.personaname ||
            jugador.battleMetricsName ||
            "Desconocido";

        const steamId =
            jugador.steamId64 ||
            "No encontrado";

        let estado = "🔴 Offline";

        if (
            jugador.steam &&
            jugador.steam.personastate > 0
        ) {
            estado = "🟢 Online";
        }

        let contenido =
            `**${numero}. ${nombre}**\n` +
            `${estado}\n` +
            `🎮 SteamID64: \`${steamId}\`\n`;

        if (jugador.steamId64) {
            contenido +=
                `🔗 [Perfil de Steam](https://steamcommunity.com/profiles/${jugador.steamId64})\n`;
        }

        contenido +=
            `🆔 BM: \`${jugador.battleMetricsId}\``;

        embed.addFields({
            name: "\u200B",
            value: contenido,
            inline: false
        });
    }

    // ---------------------------------------------
    // AVATAR DEL PRIMER RESULTADO
    // ---------------------------------------------

    const primerResultado =
        paginaResultados[0];

    if (
        primerResultado?.steam?.avatarfull
    ) {
        embed.setThumbnail(
            primerResultado.steam.avatarfull
        );
    }

    return embed;
}

// =====================================================
// BOTONES
// =====================================================

function crearBotones(
    pagina,
    totalResultados
) {
    const totalPaginas =
        Math.max(
            1,
            Math.ceil(
                totalResultados /
                RESULTADOS_POR_PAGINA
            )
        );

    const anterior =
        new ButtonBuilder()
            .setCustomId(
                "steam_anterior"
            )
            .setLabel("◀️ Anterior")
            .setStyle(
                ButtonStyle.Secondary
            )
            .setDisabled(
                pagina <= 0
            );

    const paginaBtn =
        new ButtonBuilder()
            .setCustomId(
                "steam_pagina"
            )
            .setLabel(
                `${pagina + 1}/${totalPaginas}`
            )
            .setStyle(
                ButtonStyle.Secondary
            )
            .setDisabled(true);

    const siguiente =
        new ButtonBuilder()
            .setCustomId(
                "steam_siguiente"
            )
            .setLabel("Siguiente ▶️")
            .setStyle(
                ButtonStyle.Secondary
            )
            .setDisabled(
                pagina >=
                totalPaginas - 1
            );

    return new ActionRowBuilder()
        .addComponents(
            anterior,
            paginaBtn,
            siguiente
        );
}

// =====================================================
// COMANDO
// =====================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName("steam")
        .setDescription(
            "Busca jugadores por nombre en el servidor configurado de BattleMetrics"
        )
        .addStringOption(
            option =>
                option
                    .setName("nombre")
                    .setDescription(
                        "Nombre exacto del jugador"
                    )
                    .setRequired(true)
        ),

    async execute(interaction) {
        console.log(
            "🎯 Ejecutando /steam"
        );

        const nombre =
            interaction.options
                .getString("nombre")
                .trim();

        console.log(
            `[STEAM] Entrada recibida: "${nombre}"`
        );

        // =================================================
        // CONFIGURACIÓN BM
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
                "[CONFIG] Error consultando MongoDB:",
                error
            );

            return interaction.reply({
                content:
                    "❌ No se pudo consultar la configuración del servidor.",
                ephemeral: true
            });
        }

        if (
            !config?.battleMetricsServerId
        ) {
            return interaction.reply({
                content:
                    "❌ Este servidor de Discord no tiene configurado un servidor de BattleMetrics.\n\n" +
                    "Usa `/configurar-servidor` primero.",
                ephemeral: true
            });
        }

        const battleMetricsServerId =
            String(
                config.battleMetricsServerId
            ).trim();

        console.log(
            `[CONFIG] BattleMetrics Server ID: ${battleMetricsServerId}`
        );

        // =================================================
        // TOKEN
        // =================================================

        if (!BATTLEMETRICS_TOKEN) {
            console.error(
                "[BATTLEMETRICS] Falta BATTLEMETRICS_TOKEN"
            );

            return interaction.reply({
                content:
                    "❌ Falta configurar `BATTLEMETRICS_TOKEN` en el `.env`.",
                ephemeral: true
            });
        }

        await interaction.deferReply();

        try {
            // =============================================
            // BUSCAR EN BM
            // =============================================

            const jugadores =
                await buscarJugadoresBattleMetrics(
                    nombre,
                    battleMetricsServerId
                );

            if (!jugadores.length) {
                return interaction.editReply({
                    content:
                        `❌ No encontré jugadores con el nombre exacto **${nombre}** en el servidor configurado de BattleMetrics.`
                });
            }

            console.log(
                `[BATTLEMETRICS] Procesando ${jugadores.length} jugador(es)...`
            );

            // =============================================
            // PREPARAR
            // =============================================

            const resultados =
                await prepararResultados(
                    jugadores
                );

            if (!resultados.length) {
                return interaction.editReply({
                    content:
                        "❌ BattleMetrics encontró jugadores, pero no se pudieron procesar."
                });
            }

            // =============================================
            // PAGINACIÓN
            // =============================================

            let pagina = 0;

            const embed =
                crearEmbed(
                    resultados,
                    pagina,
                    nombre
                );

            const botones =
                crearBotones(
                    pagina,
                    resultados.length
                );

            const mensaje =
                await interaction.editReply({
                    embeds: [embed],
                    components: [botones]
                });

            // =============================================
            // COLLECTOR
            // =============================================

            const collector =
                mensaje.createMessageComponentCollector({
                    time: 15 * 60 * 1000
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
                        if (pagina > 0) {
                            pagina--;
                        }
                    }

                    if (
                        buttonInteraction.customId ===
                        "steam_siguiente"
                    ) {
                        const totalPaginas =
                            Math.ceil(
                                resultados.length /
                                RESULTADOS_POR_PAGINA
                            );

                        if (
                            pagina <
                            totalPaginas - 1
                        ) {
                            pagina++;
                        }
                    }

                    const nuevoEmbed =
                        crearEmbed(
                            resultados,
                            pagina,
                            nombre
                        );

                    const nuevosBotones =
                        crearBotones(
                            pagina,
                            resultados.length
                        );

                    await buttonInteraction.update({
                        embeds: [nuevoEmbed],
                        components: [nuevosBotones]
                    });
                }
            );

            collector.on(
                "end",
                async () => {
                    try {
                        const botonesFinales =
                            crearBotones(
                                pagina,
                                resultados.length
                            );

                        botonesFinales.components.forEach(
                            button => {
                                button.setDisabled(
                                    true
                                );
                            }
                        );

                        await mensaje.edit({
                            components: [
                                botonesFinales
                            ]
                        });
                    } catch {
                        // Mensaje eliminado.
                    }
                }
            );

        } catch (error) {
            console.error(
                "[STEAM] Error general:",
                error
            );

            if (interaction.deferred) {
                return interaction.editReply({
                    content:
                        "❌ Ocurrió un error al buscar el jugador."
                });
            }

            return interaction.reply({
                content:
                    "❌ Ocurrió un error al buscar el jugador.",
                ephemeral: true
            });
        } finally {
            console.log(
                "✅ /steam terminado"
            );
        }
    }
};