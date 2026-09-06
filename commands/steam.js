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

const STEAM_API_KEY = process.env.STEAM_API_KEY;
const BATTLEMETRICS_TOKEN = process.env.BATTLEMETRICS_TOKEN;

const RESULTADOS_POR_PAGINA = 10;

// =====================================================
// HEADERS BATTLEMETRICS
// =====================================================

function getBattleMetricsHeaders() {
    if (!BATTLEMETRICS_TOKEN) {
        return {
            "Content-Type": "application/json"
        };
    }

    return {
        Authorization: `Bearer ${BATTLEMETRICS_TOKEN}`,
        "Content-Type": "application/json"
    };
}

// =====================================================
// OBTENER STEAMID64 DESDE BATTLEMETRICS
// =====================================================

async function obtenerSteamID64(playerId) {
    try {
        const response = await axios.get(
            `https://api.battlemetrics.com/players/${playerId}/relationships/identifiers`,
            {
                headers: getBattleMetricsHeaders(),
                params: {
                    "page[size]": 100
                },
                timeout: 10000
            }
        );

        const identifiers = response.data?.data || [];

        for (const item of identifiers) {
            const identifier =
                item?.attributes?.identifier ||
                item?.attributes?.value ||
                item?.id ||
                "";

            const valor = String(identifier).trim();

            // SteamID64 = 17 dígitos
            if (/^\d{17}$/.test(valor)) {
                return valor;
            }
        }

        return null;

    } catch (error) {
        console.error(
            "[BATTLEMETRICS] Error obteniendo SteamID64:",
            error.response?.data || error.message
        );

        return null;
    }
}

// =====================================================
// OBTENER DATOS DE STEAM
// SOLO SE USA EL STEAMID, NO SE HACE SEARCH POR NOMBRE
// =====================================================

async function obtenerDatosSteam(steamId64) {
    if (!steamId64) {
        return null;
    }

    if (!STEAM_API_KEY) {
        console.log("[STEAM] STEAM_API_KEY no configurada.");
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
// BUSCAR JUGADORES EN BATTLEMETRICS
// =====================================================

async function buscarJugadoresBattleMetrics(nombre, serverId) {
    console.log("[BATTLEMETRICS] ========================================");
    console.log("[BATTLEMETRICS] NAME SEARCH API");
    console.log(`[BATTLEMETRICS] Nombre: "${nombre}"`);
    console.log(`[BATTLEMETRICS] Servidor: ${serverId}`);
    console.log("[BATTLEMETRICS] ========================================");

    try {
        const resultado = await searchBattleMetricsPlayer(
            nombre,
            serverId
        );

        if (!resultado) {
            console.log("[BATTLEMETRICS] No se encontraron jugadores.");
            return [];
        }

        // Cuando hay nombres duplicados, el servicio devuelve:
        // {
        //     duplicate: true,
        //     players: [...]
        // }
        if (resultado.duplicate && Array.isArray(resultado.players)) {
            console.log(
                `[BATTLEMETRICS] Jugadores encontrados: ${resultado.players.length}`
            );

            return resultado.players;
        }

        console.log("[BATTLEMETRICS] Jugador encontrado: 1");

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
// CREAR DATOS DE RESULTADOS
// =====================================================

async function prepararResultados(jugadores) {
    const resultados = [];

    for (const player of jugadores) {
        const playerId = String(player?.id || "");

        if (!playerId) {
            continue;
        }

        const nombreBM =
            player?.attributes?.name ||
            "Desconocido";

        console.log(
            `[BATTLEMETRICS] Procesando: ${nombreBM} (${playerId})`
        );

        const steamId64 =
            await obtenerSteamID64(playerId);

        let steam = null;

        if (steamId64) {
            console.log(
                `[STEAM] SteamID64 encontrado: ${steamId64}`
            );

            steam = await obtenerDatosSteam(steamId64);
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
// EMBED
// =====================================================

function crearEmbed(resultados, pagina, nombreBuscado) {
    const inicio = pagina * RESULTADOS_POR_PAGINA;
    const fin = inicio + RESULTADOS_POR_PAGINA;

    const paginaResultados =
        resultados.slice(inicio, fin);

    const totalPaginas = Math.max(
        1,
        Math.ceil(
            resultados.length / RESULTADOS_POR_PAGINA
        )
    );

    const embed = new EmbedBuilder()
        .setTitle("🔎 Resultados de Steam")
        .setDescription(
            `Resultados de BattleMetrics para **${nombreBuscado}**`
        )
        .setColor(0x5865f2)
        .setFooter({
            text: `Página ${pagina + 1}/${totalPaginas} • ${resultados.length} resultado(s)`
        });

    if (paginaResultados.length === 0) {
        embed.setDescription(
            `No hay resultados para **${nombreBuscado}**.`
        );

        return embed;
    }

    for (let i = 0; i < paginaResultados.length; i++) {
        const jugador = paginaResultados[i];

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

        if (jugador.steam?.personastate > 0) {
            estado = "🟢 Online";
        }

        let contenido =
            `**${numero}. ${nombre}**\n` +
            `${estado}\n` +
            `🎮 SteamID64: \`${steamId}\`\n` +
            `🔗 [Perfil de Steam](https://steamcommunity.com/profiles/${steamId})\n` +
            `🆔 BM: \`${jugador.battleMetricsId}\``;

        if (steam?.profileurl) {
            contenido += `\n`;
        }

        embed.addFields({
            name: "\u200B",
            value: contenido,
            inline: false
        });
    }

    return embed;
}

// =====================================================
// BOTONES
// =====================================================

function crearBotones(pagina, totalResultados) {
    const totalPaginas = Math.max(
        1,
        Math.ceil(
            totalResultados / RESULTADOS_POR_PAGINA
        )
    );

    const anterior = new ButtonBuilder()
        .setCustomId("steam_anterior")
        .setLabel("◀️ Anterior")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pagina <= 0);

    const paginaBtn = new ButtonBuilder()
        .setCustomId("steam_pagina")
        .setLabel(`${pagina + 1}/${totalPaginas}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true);

    const siguiente = new ButtonBuilder()
        .setCustomId("steam_siguiente")
        .setLabel("Siguiente ▶️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(
            pagina >= totalPaginas - 1
        );

    return new ActionRowBuilder().addComponents(
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
        .addStringOption(option =>
            option
                .setName("nombre")
                .setDescription(
                    "Nombre exacto del jugador"
                )
                .setRequired(true)
        ),

    async execute(interaction) {
        console.log("🎯 Ejecutando /steam");

        const nombre =
            interaction.options
                .getString("nombre")
                .trim();

        console.log(
            `[STEAM] Entrada recibida: "${nombre}"`
        );

        // =================================================
        // COMPROBAR CONFIGURACIÓN DEL SERVIDOR
        // =================================================

        let config;

        try {
            config = await ServerConfig.findOne({
                guildId: interaction.guild.id
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

        if (!config?.battleMetricsServerId) {
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
        // COMPROBAR TOKEN
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
            // BUSCAR EN BATTLEMETRICS
            // =============================================

            const jugadores =
                await buscarJugadoresBattleMetrics(
                    nombre,
                    battleMetricsServerId
                );

            if (!jugadores.length) {
                console.log(
                    "No encontré jugadores con el nombre exacto..."
                );

                return interaction.editReply({
                    content:
                        `❌ No encontré jugadores con el nombre exacto **${nombre}** en el servidor configurado de BattleMetrics.`
                });
            }

            // =============================================
            // OBTENER STEAMID + DATOS STEAM
            // =============================================

            console.log(
                `[BATTLEMETRICS] Procesando ${jugadores.length} jugador(es)...`
            );

            const resultados =
                await prepararResultados(jugadores);

            if (!resultados.length) {
                return interaction.editReply({
                    content:
                        `❌ Encontré jugadores en BattleMetrics, pero no pude obtener sus datos.`
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

            collector.on("end", async () => {
                try {
                    const botonesFinales =
                        crearBotones(
                            pagina,
                            resultados.length
                        );

                    botonesFinales.components.forEach(
                        button => {
                            button.setDisabled(true);
                        }
                    );

                    await mensaje.edit({
                        components: [botonesFinales]
                    });
                } catch (error) {
                    // El mensaje puede haber sido eliminado.
                }
            });

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
            console.log("✅ /steam terminado");
        }
    }
};