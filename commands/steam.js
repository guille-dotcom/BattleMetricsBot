const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const axios = require("axios");
const ServerConfig = require("../models/ServerConfig");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BATTLEMETRICS_API = "https://api.battlemetrics.com";
const STEAMID_SEARCH_URL = "https://www.steamid.com/search";
const STEAM_API = "https://api.steampowered.com";

const RESULTADOS_POR_PAGINA = 10;

// SteamID64 válido
const STEAMID64_MIN = 76561197960265728n;
const STEAMID64_MAX = 76561202255233023n;

// =====================================================
// HEADERS
// =====================================================

function getBattleMetricsHeaders() {
    const token = process.env.BATTLEMETRICS_TOKEN;

    if (!token) {
        throw new Error("Falta BATTLEMETRICS_TOKEN en el .env");
    }

    return {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        "User-Agent": "DiscordBot/1.0"
    };
}

function getSteamIDHeaders() {
    return {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/139.0.0.0 Safari/537.36"
    };
}

// =====================================================
// COMPROBAR STEAMID64
// =====================================================

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
// OBTENER CONFIGURACIÓN DEL SERVIDOR
// =====================================================

async function obtenerBattleMetricsServerId(guildId) {
    const config = await ServerConfig.findOne({
        guildId
    });

    if (!config) {
        return null;
    }

    return config.battleMetricsServerId || null;
}

// =====================================================
// BUSCAR JUGADORES EN BATTLEMETRICS
// =====================================================

async function buscarJugadoresBattleMetrics(nombre, serverId) {
    console.log("[BM] ========================================");
    console.log("[BM] BUSCANDO JUGADOR");
    console.log("[BM] Name:", nombre);
    console.log("[BM] Server ID:", serverId);
    console.log("[BM] Include: player,identifier");
    console.log("[BM] ========================================");

    const response = await axios.get(
        `${BATTLEMETRICS_API}/servers/${serverId}`,
        {
            params: {
                include: "player,identifier"
            },
            headers: getBattleMetricsHeaders(),
            timeout: 30000
        }
    );

    const data = response.data;

    const jugadores = Array.isArray(data.data)
        ? data.data
        : [];

    console.log("[BM] Players recibidos:", jugadores.length);

    const nombreBuscado = nombre.trim().toLowerCase();

    const coincidencias = jugadores.filter(player => {
        if (!player || !player.attributes) {
            return false;
        }

        const nombrePlayer = String(
            player.attributes.name || ""
        ).trim().toLowerCase();

        return nombrePlayer === nombreBuscado;
    });

    console.log(
        "[BM] Coincidencias exactas:",
        coincidencias.length
    );

    return coincidencias;
}

// =====================================================
// OBTENER IDENTIFIERS DEL PLAYER
// =====================================================

async function obtenerIdentifiersBattleMetrics(playerId) {
    console.log(
        `[BM] PROCESANDO PLAYER ${playerId}`
    );

    console.log(
        "[BM] OBTENIENDO IDENTIFIERS DEL PLAYER"
    );

    const url =
        `${BATTLEMETRICS_API}/players/${playerId}`;

    console.log(
        "[BM] URL:",
        `/players/${playerId}?include=identifier`
    );

    const response = await axios.get(url, {
        params: {
            include: "identifier"
        },
        headers: getBattleMetricsHeaders(),
        timeout: 30000
    });

    const included = Array.isArray(
        response.data?.included
    )
        ? response.data.included
        : [];

    console.log(
        "[BM] Identifiers encontrados:",
        included.length
    );

    return included;
}

// =====================================================
// BUSCAR STEAMID64 EN IDENTIFIERS DE BATTLEMETRICS
// =====================================================

function encontrarSteamID64EnIdentifiers(identifiers) {
    console.log("[BM] BUSCANDO STEAMID64...");

    for (const identifier of identifiers) {
        const valor =
            identifier?.attributes?.identifier;

        const tipo =
            identifier?.attributes?.type;

        const lastSeen =
            identifier?.attributes?.lastSeen;

        console.log(
            `[BM] Identifier: ${valor} | type=${tipo} | lastSeen=${lastSeen}`
        );

        if (esSteamID64(valor)) {
            console.log(
                "[BM] ✅ STEAMID64 ENCONTRADO:",
                valor
            );

            return String(valor);
        }
    }

    console.log(
        "[BM] ❌ Ningún identifier contiene un SteamID64 válido."
    );

    return null;
}

// =====================================================
// BUSCAR STEAMID64 EN STEAMID.COM
// =====================================================

async function buscarSteamIDCom(nombre) {
    console.log(
        "[STEAMID.COM] ========================================"
    );

    console.log(
        "[STEAMID.COM] BUSCANDO:",
        nombre
    );

    const response = await axios.get(
        STEAMID_SEARCH_URL,
        {
            params: {
                q: nombre
            },
            headers: getSteamIDHeaders(),
            timeout: 30000,

            // SteamID.com puede devolver HTML aunque
            // Cloudflare esté presente.
            validateStatus: status =>
                status >= 200 && status < 500
        }
    );

    console.log(
        "[STEAMID.COM] HTTP:",
        response.status
    );

    if (response.status !== 200) {
        console.log(
            "[STEAMID.COM] ❌ Respuesta HTTP:",
            response.status
        );

        return null;
    }

    const html = String(
        response.data || ""
    );

    console.log(
        "[STEAMID.COM] HTML recibido:",
        html.length,
        "bytes"
    );

    // =================================================
    // BUSCAR:
    //
    // <a href="/profiles/76561198360243959">
    //
    // =================================================

    const regex =
        /href=["']\/profiles\/(\d{17})["']/gi;

    const encontrados = new Set();

    let match;

    while ((match = regex.exec(html)) !== null) {
        const steamId = match[1];

        if (esSteamID64(steamId)) {
            encontrados.add(steamId);
        }
    }

    const steamIds = [...encontrados];

    console.log(
        "[STEAMID.COM] SteamID64 encontrados:",
        steamIds
    );

    if (steamIds.length === 0) {
        console.log(
            "[STEAMID.COM] ❌ No se encontró SteamID64."
        );

        return null;
    }

    // =================================================
    // EXTRAER RESULTADOS CON NOMBRE + AVATAR
    // =================================================

    const resultados = [];

    for (const steamId of steamIds) {
        const profileRegex = new RegExp(
            `<a\\s+href=["']\\/profiles\\/${steamId}["'][^>]*>([\\s\\S]*?)<\\/a>`,
            "i"
        );

        const profileMatch =
            html.match(profileRegex);

        let nombrePerfil = nombre;

        if (profileMatch) {
            const texto = profileMatch[1]
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim();

            if (texto) {
                nombrePerfil = texto;
            }
        }

        // Buscar avatar asociado al mismo bloque
        const avatarRegex = new RegExp(
            `<a\\s+href=["']\\/profiles\\/${steamId}["'][\\s\\S]*?<img[^>]+src=["']([^"']+)["']`,
            "i"
        );

        const avatarMatch =
            html.match(avatarRegex);

        const avatar =
            avatarMatch
                ? avatarMatch[1]
                : null;

        resultados.push({
            steamId64: steamId,
            nombre: nombrePerfil,
            avatar
        });
    }

    console.log(
        "[STEAMID.COM] Resultados procesados:",
        resultados.length
    );

    return resultados;
}

// =====================================================
// OBTENER DATOS DE STEAM
// =====================================================

async function obtenerDatosSteam(steamId64) {
    const apiKey =
        process.env.STEAM_API_KEY;

    if (!apiKey) {
        console.log(
            "[STEAM API] ❌ Falta STEAM_API_KEY"
        );

        return null;
    }

    console.log(
        "[STEAM API] OBTENIENDO PERFIL:",
        steamId64
    );

    try {
        const response = await axios.get(
            `${STEAM_API}/ISteamUser/GetPlayerSummaries/v2/`,
            {
                params: {
                    key: apiKey,
                    steamids: steamId64
                },
                timeout: 20000
            }
        );

        const players =
            response.data?.response?.players;

        if (
            !Array.isArray(players) ||
            players.length === 0
        ) {
            console.log(
                "[STEAM API] ❌ No devolvió perfil."
            );

            return null;
        }

        const player = players[0];

        console.log(
            "[STEAM API] ✅ Perfil obtenido:",
            player.personaname
        );

        return player;
    } catch (error) {
        console.log(
            "[STEAM API] ❌ Error:",
            error.response?.status ||
            error.message
        );

        return null;
    }
}

// =====================================================
// CREAR EMBED
// =====================================================

function crearEmbed(resultado, pagina, total) {
    const {
        steamId64,
        nombre,
        avatar,
        steam
    } = resultado;

    const embed = new EmbedBuilder()
        .setColor(0x1b2838)
        .setTitle(`🎮 ${nombre}`)
        .setDescription(
            `**SteamID64:** \`${steamId64}\``
        )
        .addFields(
            {
                name: "🔗 Perfil de Steam",
                value:
                    `[Abrir perfil](https://steamcommunity.com/profiles/${steamId64})`
            }
        )
        .setFooter({
            text:
                `Resultado ${pagina + 1} de ${total}`
        });

    if (steam) {
        if (steam.personaname) {
            embed.setTitle(
                `🎮 ${steam.personaname}`
            );
        }

        if (steam.profileurl) {
            embed.spliceFields(0, 1, {
                name: "🔗 Perfil de Steam",
                value:
                    `[Abrir perfil](${steam.profileurl})`
            });
        }

        if (steam.personastate !== undefined) {
            const estados = {
                0: "🔴 Offline",
                1: "🟢 Online",
                2: "🟡 Ocupado",
                3: "🟠 Ausente",
                4: "🟣 Snooze",
                5: "🔵 Buscando intercambio",
                6: "🔵 Buscando jugar"
            };

            embed.addFields({
                name: "Estado",
                value:
                    estados[steam.personastate] ||
                    "Desconocido",
                inline: true
            });
        }

        if (steam.timecreated) {
            const fecha =
                `<t:${steam.timecreated}:D>`;

            embed.addFields({
                name: "📅 Cuenta creada",
                value: fecha,
                inline: true
            });
        }

        if (steam.communityvisibilitystate) {
            const privacidad =
                steam.communityvisibilitystate === 3
                    ? "🌐 Pública"
                    : "🔒 Privada";

            embed.addFields({
                name: "Visibilidad",
                value: privacidad,
                inline: true
            });
        }

        if (steam.avatarfull) {
            embed.setThumbnail(
                steam.avatarfull
            );
        } else if (avatar) {
            embed.setThumbnail(avatar);
        }
    } else if (avatar) {
        embed.setThumbnail(avatar);
    }

    return embed;
}

// =====================================================
// BOTONES DE PAGINACIÓN
// =====================================================

function crearBotones(pagina, totalPaginas, userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(
                `steam_prev_${userId}`
            )
            .setLabel("Anterior")
            .setEmoji("◀️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(pagina <= 0),

        new ButtonBuilder()
            .setCustomId(
                `steam_next_${userId}`
            )
            .setLabel("Siguiente")
            .setEmoji("▶️")
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
        // COMPROBAR SERVIDOR CONFIGURADO
        // =================================================

        let serverId;

        try {
            serverId =
                await obtenerBattleMetricsServerId(
                    interaction.guildId
                );
        } catch (error) {
            console.error(
                "[STEAM] Error obteniendo configuración:",
                error
            );

            return interaction.reply({
                content:
                    "❌ Ocurrió un error al obtener la configuración del servidor.",
                ephemeral: true
            });
        }

        if (!serverId) {
            return interaction.reply({
                content:
                    "❌ Este servidor de Discord no tiene un servidor de BattleMetrics configurado. Usa `/configurar-servidor` primero.",
                ephemeral: true
            });
        }

        console.log(
            "[STEAM] BattleMetrics Server ID:",
            serverId
        );

        await interaction.deferReply();

        // =================================================
        // BUSCAR EN BATTLEMETRICS
        // =================================================

        let jugadoresBM;

        try {
            jugadoresBM =
                await buscarJugadoresBattleMetrics(
                    nombre,
                    serverId
                );
        } catch (error) {
            console.error(
                "[BM] ❌ Error:",
                error.response?.status ||
                error.message
            );

            let mensaje =
                "❌ No pude consultar BattleMetrics.";

            if (
                error.response?.status === 401 ||
                error.response?.status === 403
            ) {
                mensaje =
                    "❌ El token de BattleMetrics no es válido o no tiene permisos.";
            }

            return interaction.editReply({
                content: mensaje
            });
        }

        if (
            !jugadoresBM ||
            jugadoresBM.length === 0
        ) {
            return interaction.editReply({
                content:
                    `❌ No encontré un jugador llamado **${nombre}** en el servidor de BattleMetrics configurado.`
            });
        }

        console.log(
            "[STEAM] Jugadores encontrados:",
            jugadoresBM.length
        );

        // =================================================
        // PROCESAR JUGADORES
        // =================================================

        const resultados = [];

        for (const player of jugadoresBM) {
            const playerId =
                player.id;

            const nombreBM =
                player.attributes?.name ||
                nombre;

            let steamId64 = null;

            let steamIdComResult = null;

            let steamData = null;

            let avatar = null;

            // ---------------------------------------------
            // 1. INTENTAR SACAR STEAMID64 DESDE BM
            // ---------------------------------------------

            try {
                const identifiers =
                    await obtenerIdentifiersBattleMetrics(
                        playerId
                    );

                steamId64 =
                    encontrarSteamID64EnIdentifiers(
                        identifiers
                    );
            } catch (error) {
                console.log(
                    "[BM] ❌ Error obteniendo identifiers:",
                    error.response?.status ||
                    error.message
                );
            }

            // ---------------------------------------------
            // 2. SI BM NO LO DEVUELVE,
            //    BUSCAR EL NOMBRE EN STEAMID.COM
            // ---------------------------------------------

            if (!steamId64) {
                console.log(
                    "[STEAMID.COM] BM no entregó SteamID64."
                );

                try {
                    steamIdComResult =
                        await buscarSteamIDCom(
                            nombreBM
                        );

                    if (
                        steamIdComResult &&
                        steamIdComResult.length > 0
                    ) {
                        // Preferir coincidencia exacta
                        const exacto =
                            steamIdComResult.find(
                                resultado =>
                                    String(
                                        resultado.nombre
                                    )
                                        .trim()
                                        .toLowerCase() ===
                                    String(nombreBM)
                                        .trim()
                                        .toLowerCase()
                            );

                        const elegido =
                            exacto ||
                            steamIdComResult[0];

                        steamId64 =
                            elegido.steamId64;

                        avatar =
                            elegido.avatar;

                        console.log(
                            "[STEAMID.COM] ✅ SteamID64:",
                            steamId64
                        );
                    }
                } catch (error) {
                    console.log(
                        "[STEAMID.COM] ❌ Error:",
                        error.response?.status ||
                        error.message
                    );
                }
            }

            // ---------------------------------------------
            // 3. SI TENEMOS STEAMID64,
            //    OBTENER DATOS DEL PERFIL
            // ---------------------------------------------

            if (steamId64) {
                steamData =
                    await obtenerDatosSteam(
                        steamId64
                    );

                if (
                    steamData?.avatarfull
                ) {
                    avatar =
                        steamData.avatarfull;
                }
            }

            // ---------------------------------------------
            // 4. GUARDAR RESULTADO
            // ---------------------------------------------

            resultados.push({
                battleMetricsId: playerId,
                battleMetricsName: nombreBM,
                steamId64,
                nombre:
                    steamData?.personaname ||
                    nombreBM,
                avatar,
                steam: steamData
            });
        }

        // =================================================
        // ELIMINAR DUPLICADOS POR STEAMID64
        // =================================================

        const resultadosUnicos = [];

        const idsVistos = new Set();

        for (const resultado of resultados) {
            const key =
                resultado.steamId64 ||
                `bm_${resultado.battleMetricsId}`;

            if (idsVistos.has(key)) {
                continue;
            }

            idsVistos.add(key);
            resultadosUnicos.push(resultado);
        }

        console.log(
            "[STEAM] Resultados finales:",
            resultadosUnicos.length
        );

        // =================================================
        // SI NO SE ENCONTRÓ NINGÚN STEAMID
        // =================================================

        const encontradosSteam =
            resultadosUnicos.filter(
                resultado =>
                    resultado.steamId64
            );

        if (
            encontradosSteam.length === 0
        ) {
            return interaction.editReply({
                content:
                    `❌ Encontré **${nombre}** en BattleMetrics, pero no pude obtener su SteamID64 mediante BattleMetrics ni SteamID.com.`
            });
        }

        // =================================================
        // PAGINACIÓN
        // =================================================

        let paginaActual = 0;

        const totalPaginas =
            Math.ceil(
                encontradosSteam.length /
                RESULTADOS_POR_PAGINA
            );

        function obtenerPagina() {
            const inicio =
                paginaActual *
                RESULTADOS_POR_PAGINA;

            return encontradosSteam.slice(
                inicio,
                inicio +
                    RESULTADOS_POR_PAGINA
            );
        }

        function crearMensaje() {
            const pagina =
                obtenerPagina();

            if (pagina.length === 0) {
                return {
                    content:
                        "❌ No hay resultados.",
                    components: []
                };
            }

            const embeds =
                pagina.map(resultado =>
                    crearEmbed(
                        resultado,
                        paginaActual,
                        encontradosSteam.length
                    )
                );

            return {
                embeds,
                components:
                    totalPaginas > 1
                        ? [
                            crearBotones(
                                paginaActual,
                                totalPaginas,
                                interaction.user.id
                            )
                        ]
                        : []
            };
        }

        await interaction.editReply(
            crearMensaje()
        );

        // =================================================
        // COLLECTOR DE BOTONES
        // =================================================

        if (totalPaginas <= 1) {
            console.log(
                "✅ /steam terminado"
            );

            return;
        }

        const mensaje =
            await interaction.fetchReply();

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
                    `steam_prev_${interaction.user.id}`
                ) {
                    if (paginaActual > 0) {
                        paginaActual--;
                    }
                }

                if (
                    buttonInteraction.customId ===
                    `steam_next_${interaction.user.id}`
                ) {
                    if (
                        paginaActual <
                        totalPaginas - 1
                    ) {
                        paginaActual++;
                    }
                }

                await buttonInteraction.update(
                    crearMensaje()
                );
            }
        );

        collector.on(
            "end",
            async () => {
                try {
                    const pagina =
                        obtenerPagina();

                    const embeds =
                        pagina.map(resultado =>
                            crearEmbed(
                                resultado,
                                paginaActual,
                                encontradosSteam.length
                            )
                        );

                    await interaction.editReply({
                        embeds,
                        components: []
                    });
                } catch (error) {
                    console.log(
                        "[STEAM] No se pudieron eliminar los botones:",
                        error.message
                    );
                }
            }
        );

        console.log(
            "✅ /steam terminado"
        );
    }
};