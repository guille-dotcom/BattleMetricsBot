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
// RANGO VÁLIDO DE STEAMID64
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
// BUSCAR JUGADOR EN EL SERVIDOR
// =====================================================

async function buscarJugadorBattleMetrics(nombre, serverId) {
    const nombreBuscado = String(nombre || "")
        .trim()
        .toLowerCase();

    console.log("");
    console.log("==============================================");
    console.log("[BM] BUSCANDO JUGADOR");
    console.log("==============================================");
    console.log(`[BM] Nombre: "${nombre}"`);
    console.log(`[BM] Server ID: ${serverId}`);
    console.log("[BM] Include: player,identifier");

    const response = await axios.get(
        `${BATTLEMETRICS_API}/servers/${serverId}`,
        {
            headers: getBattleMetricsHeaders(),
            params: {
                include: "player,identifier"
            },
            timeout: 10000
        }
    );

    const included = Array.isArray(response.data?.included)
        ? response.data.included
        : [];

    const players = included.filter(
        item => item?.type === "player"
    );

    console.log(
        `[BM] Players recibidos: ${players.length}`
    );

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

    if (!encontrados.length) {
        return [];
    }

    return encontrados;
}

// =====================================================
// OBTENER TODOS LOS IDENTIFIERS DEL PLAYER
// =====================================================

async function obtenerIdentifiersBattleMetrics(playerId) {
    console.log("");
    console.log("----------------------------------------------");
    console.log("[BM] OBTENIENDO IDENTIFIERS DEL PLAYER");
    console.log("----------------------------------------------");
    console.log(`[BM] Player ID: ${playerId}`);
    console.log(
        `[BM] URL: /players/${playerId}?include=identifier`
    );

    const response = await axios.get(
        `${BATTLEMETRICS_API}/players/${playerId}`,
        {
            headers: getBattleMetricsHeaders(),
            params: {
                include: "identifier"
            },
            timeout: 10000
        }
    );

    const included = Array.isArray(response.data?.included)
        ? response.data.included
        : [];

    const identifiers = included.filter(
        item => item?.type === "identifier"
    );

    console.log(
        `[BM] Identifiers encontrados: ${identifiers.length}`
    );

    // =================================================
    // MOSTRAR TODOS LOS IDENTIFIERS
    // =================================================

    for (const identifier of identifiers) {
        console.log(
            "[BM] IDENTIFIER:",
            JSON.stringify(
                {
                    id: identifier?.id,
                    type: identifier?.attributes?.type,
                    identifier:
                        identifier?.attributes?.identifier,
                    lastSeen:
                        identifier?.attributes?.lastSeen,
                    private:
                        identifier?.attributes?.private
                },
                null,
                2
            )
        );
    }

    return identifiers;
}

// =====================================================
// BUSCAR STEAMID64 ENTRE TODOS LOS IDENTIFIERS
// =====================================================

function encontrarSteamID64(identifiers) {
    console.log("");
    console.log("[BM] BUSCANDO STEAMID64...");

    for (const identifier of identifiers) {
        const valor =
            identifier?.attributes?.identifier;

        if (esSteamID64(valor)) {
            console.log(
                `[BM] ✅ STEAMID64 ENCONTRADO: ${String(valor).trim()}`
            );

            console.log(
                `[BM] Identifier BM ID: ${identifier?.id}`
            );

            console.log(
                `[BM] Identifier type: ${identifier?.attributes?.type}`
            );

            return String(valor).trim();
        }
    }

    console.log(
        "[BM] ❌ Ningún identifier contiene un SteamID64 válido."
    );

    return null;
}

// =====================================================
// OBTENER DATOS DE STEAM
//
// SOLO SE CONSULTA CUANDO BM YA ENCONTRÓ EL STEAMID64.
// =====================================================

async function obtenerDatosSteam(steamId64) {
    const apiKey = process.env.STEAM_API_KEY;

    if (!apiKey) {
        console.log(
            "[STEAM] ⚠️ STEAM_API_KEY no configurada."
        );

        return null;
    }

    if (!esSteamID64(steamId64)) {
        console.log(
            `[STEAM] ❌ SteamID64 inválido: ${steamId64}`
        );

        return null;
    }

    console.log(
        `[STEAM] Consultando perfil ${steamId64}`
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
            "[STEAM] ❌ Error:",
            error.response?.data ||
            error.response?.status ||
            error.message
        );

        return null;
    }
}

// =====================================================
// CREAR EMBED
// =====================================================

function crearEmbed(
    resultados,
    pagina,
    totalPaginas
) {
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

    if (!paginaResultados.length) {
        embed.setDescription(
            "❌ No hay resultados para esta página."
        );

        return embed;
    }

    // Avatar del primer resultado
    if (paginaResultados[0]?.steam?.avatarfull) {
        embed.setThumbnail(
            paginaResultados[0].steam.avatarfull
        );
    }

    for (
        let i = 0;
        i < paginaResultados.length;
        i++
    ) {
        const resultado =
            paginaResultados[i];

        const bmNombre =
            resultado.bm?.attributes?.name ||
            "Sin nombre";

        const steamNombre =
            resultado.steam?.personaname ||
            bmNombre;

        const steamId64 =
            resultado.steamId64;

        const bmId =
            resultado.bm?.id ||
            "Desconocido";

        let valor =
            `**Steam:** ${steamNombre}\n`;

        if (steamId64) {
            valor +=
                `**SteamID64:** \`${steamId64}\`\n`;

            valor +=
                `**Perfil:** [Abrir Steam](https://steamcommunity.com/profiles/${steamId64})\n`;
        } else {
            valor +=
                `**SteamID64:** ❌ No encontrado\n`;
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
// BOTONES
// =====================================================

function crearBotones(
    pagina,
    totalPaginas
) {
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
            "Busca un jugador por nombre en el servidor configurado"
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
            // OBTENER CONFIGURACIÓN
            // =============================================

            const config =
                await ServerConfig.findOne({
                    guildId: interaction.guild.id
                });

            if (!config) {
                return interaction.reply({
                    content:
                        "❌ Este servidor no tiene configurado un servidor de BattleMetrics.\n\nUsa `/configurar-servidor` primero.",
                    ephemeral: true
                });
            }

            if (!config.battleMetricsServerId) {
                return interaction.reply({
                    content:
                        "❌ No hay un servidor de BattleMetrics configurado.",
                    ephemeral: true
                });
            }

            const serverId =
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

            await interaction.deferReply();

            console.log(
                `[STEAM] Entrada recibida: "${nombre}"`
            );

            console.log(
                `[STEAM] BattleMetrics Server ID: ${serverId}`
            );

            // =============================================
            // 1. BUSCAR EN EL SERVIDOR
            // =============================================

            const jugadores =
                await buscarJugadorBattleMetrics(
                    nombre,
                    serverId
                );

            if (!jugadores.length) {
                return interaction.editReply({
                    content:
                        `❌ No se encontró ningún jugador llamado exactamente \`${nombre}\` en el servidor configurado.`
                });
            }

            console.log(
                `[STEAM] Jugadores encontrados: ${jugadores.length}`
            );

            // =============================================
            // 2. OBTENER IDENTIFIERS COMPLETOS
            // =============================================

            const resultados = [];

            for (const jugador of jugadores) {
                const playerId =
                    String(jugador.id);

                console.log("");
                console.log(
                    "=============================================="
                );
                console.log(
                    `[BM] PROCESANDO PLAYER ${playerId}`
                );
                console.log(
                    `[BM] Nombre: ${jugador.attributes?.name}`
                );
                console.log(
                    "=============================================="
                );

                let identifiers = [];

                try {
                    identifiers =
                        await obtenerIdentifiersBattleMetrics(
                            playerId
                        );
                } catch (error) {
                    console.error(
                        `[BM] ❌ Error obteniendo identifiers de ${playerId}:`,
                        error.response?.data ||
                        error.response?.status ||
                        error.message
                    );
                }

                // =========================================
                // 3. BUSCAR STEAMID64
                // =========================================

                const steamId64 =
                    encontrarSteamID64(
                        identifiers
                    );

                // =========================================
                // 4. CONSULTAR STEAM SOLO CON EL ID
                // =========================================

                let steam = null;

                if (steamId64) {
                    steam =
                        await obtenerDatosSteam(
                            steamId64
                        );
                }

                resultados.push({
                    bm: jugador,
                    identifiers,
                    steamId64,
                    steam
                });
            }

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
                    } catch {
                        // El mensaje pudo ser eliminado.
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
                            "❌ Ocurrió un error al buscar el jugador."
                    });
                } else {
                    await interaction.reply({
                        content:
                            "❌ Ocurrió un error al buscar el jugador.",
                        ephemeral: true
                    });
                }
            } catch {
                // Discord ya no permite responder.
            }

        } finally {
            console.log(
                "✅ /steam terminado"
            );
        }
    }
};