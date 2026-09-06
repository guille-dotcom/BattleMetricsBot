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
// CONFIG
// =====================================================

const BATTLEMETRICS_API = "https://api.battlemetrics.com";
const STEAMID_SEARCH_URL = "https://www.steamid.com/search";
const STEAM_API = "https://api.steampowered.com";

const RESULTADOS_POR_PAGINA = 10;

// Rango válido de SteamID64
const STEAMID64_MIN = 76561197960265728n;
const STEAMID64_MAX = 76561202255233023n;

// =====================================================
// HEADERS
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
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0"
    };
}

function getSteamIDHeaders() {
    return {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Referer: "https://www.steamid.com/",
        "Sec-Ch-Ua":
            '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/140.0.0.0 Safari/537.36"
    };
}

// =====================================================
// STEAMID64
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
// OBTENER SERVER ID
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
    console.log(`[BM] Name: ${nombre}`);
    console.log(`[BM] Server ID: ${serverId}`);
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

    const included = Array.isArray(data.included)
        ? data.included
        : [];

    console.log(
        `[BM] Resources incluidos: ${included.length}`
    );

    const jugadores = included.filter(resource => {
        return (
            resource &&
            resource.type === "player" &&
            resource.attributes
        );
    });

    console.log(
        `[BM] Players recibidos: ${jugadores.length}`
    );

    const nombreBuscado = String(nombre)
        .trim()
        .toLowerCase();

    const coincidencias = jugadores.filter(player => {
        const nombrePlayer = String(
            player.attributes.name || ""
        )
            .trim()
            .toLowerCase();

        return nombrePlayer === nombreBuscado;
    });

    console.log(
        `[BM] Coincidencias exactas: ${coincidencias.length}`
    );

    for (const player of coincidencias) {
        console.log(
            `[BM] MATCH: ${player.id} | ${player.attributes.name}`
        );
    }

    return coincidencias;
}

// =====================================================
// OBTENER IDENTIFIERS DEL PLAYER
// =====================================================

async function obtenerIdentifiersBattleMetrics(playerId) {
    console.log("[BM] ----------------------------------------");
    console.log("[BM] PROCESANDO PLAYER", playerId);
    console.log("[BM] OBTENIENDO IDENTIFIERS DEL PLAYER");
    console.log(
        `[BM] URL: /players/${playerId}?include=identifier`
    );

    const response = await axios.get(
        `${BATTLEMETRICS_API}/players/${playerId}`,
        {
            params: {
                include: "identifier"
            },
            headers: getBattleMetricsHeaders(),
            timeout: 30000
        }
    );

    const included = Array.isArray(response.data.included)
        ? response.data.included
        : [];

    const identifiers = included.filter(resource => {
        return (
            resource &&
            resource.type === "identifier" &&
            resource.attributes
        );
    });

    console.log(
        `[BM] Identifiers encontrados: ${identifiers.length}`
    );

    return identifiers;
}

// =====================================================
// BUSCAR STEAMID64 EN IDENTIFIERS DE BM
// =====================================================

function encontrarSteamID64EnIdentifiers(identifiers) {
    console.log("[BM] BUSCANDO STEAMID64...");

    for (const identifier of identifiers) {
        const attributes = identifier.attributes || {};

        const valor = attributes.identifier;
        const tipo = attributes.type;
        const lastSeen = attributes.lastSeen;

        console.log(
            `[BM] Identifier: ${valor} | type=${tipo} | lastSeen=${lastSeen}`
        );

        if (esSteamID64(valor)) {
            console.log(
                `[BM] STEAMID64 ENCONTRADO: ${valor}`
            );

            return String(valor);
        }
    }

    console.log(
        "[BM] Ningún identifier contiene un SteamID64 válido."
    );

    return null;
}

// =====================================================
// DECODIFICAR HTML BÁSICO
// =====================================================

function decodeHtml(texto) {
    return String(texto)
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
}

// =====================================================
// EXTRAER RESULTADOS DE STEAMID.COM
// =====================================================

function extraerResultadosSteamID(html) {
    const resultados = [];
    const idsEncontrados = new Set();

    // -------------------------------------------------
    // SteamID.com utiliza enlaces:
    //
    // /profiles/76561198...
    // -------------------------------------------------

    const regexPerfil =
        /\/profiles\/(\d{17})/gi;

    let match;

    while ((match = regexPerfil.exec(html)) !== null) {
        const steamId64 = match[1];

        if (!esSteamID64(steamId64)) {
            continue;
        }

        if (idsEncontrados.has(steamId64)) {
            continue;
        }

        idsEncontrados.add(steamId64);

        const posicion = match.index;

        // Miramos una sección cercana al enlace
        const bloqueInicio = Math.max(
            0,
            posicion - 1000
        );

        const bloqueFin = Math.min(
            html.length,
            posicion + 1500
        );

        const bloque = html.slice(
            bloqueInicio,
            bloqueFin
        );

        // ---------------------------------------------
        // NOMBRE
        // ---------------------------------------------

        let nombre = null;

        const regexNombre =
            /<h3[\s\S]*?<a[^>]*>\s*([\s\S]*?)\s*<\/a>\s*<\/h3>/i;

        const nombreMatch = bloque.match(regexNombre);

        if (nombreMatch) {
            nombre = decodeHtml(
                nombreMatch[1]
            )
                .replace(/<[^>]+>/g, "")
                .trim();
        }

        // ---------------------------------------------
        // AVATAR
        // ---------------------------------------------

        let avatar = null;

        const avatarMatch = bloque.match(
            /<img[^>]+src=["']([^"']+)["'][^>]*>/i
        );

        if (avatarMatch) {
            avatar = decodeHtml(
                avatarMatch[1]
            );
        }

        resultados.push({
            steamId64,
            nombre,
            avatar
        });
    }

    return resultados;
}

// =====================================================
// STEAMID.COM - MÉTODO PRINCIPAL
// =====================================================

async function buscarSteamIDCom(nombre) {
    console.log("");
    console.log(
        "[STEAMID.COM] ========================================"
    );
    console.log(
        `[STEAMID.COM] BUSCANDO: ${nombre}`
    );
    console.log(
        "[STEAMID.COM] ========================================"
    );

    const url = STEAMID_SEARCH_URL;

    const headers = getSteamIDHeaders();

    // -------------------------------------------------
    // Intento 1
    // -------------------------------------------------

    try {
        console.log(
            "[STEAMID.COM] Intento 1: navegador..."
        );

        const response = await axios.get(
            url,
            {
                params: {
                    q: nombre
                },
                headers,
                timeout: 30000,
                maxRedirects: 5,
                validateStatus: () => true
            }
        );

        console.log(
            `[STEAMID.COM] HTTP: ${response.status}`
        );

        if (
            response.status >= 200 &&
            response.status < 300 &&
            typeof response.data === "string"
        ) {
            console.log(
                `[STEAMID.COM] HTML recibido: ${response.data.length} bytes`
            );

            const resultados =
                extraerResultadosSteamID(
                    response.data
                );

            console.log(
                `[STEAMID.COM] SteamID64 encontrados: ${resultados.length}`
            );

            if (resultados.length > 0) {
                for (const resultado of resultados) {
                    console.log(
                        `[STEAMID.COM] MATCH: ${resultado.steamId64} | ${resultado.nombre || "sin nombre"}`
                    );
                }

                return resultados;
            }
        }

        if (response.status === 403) {
            console.log(
                "[STEAMID.COM] 403 - SteamID.com bloqueó la petición HTTP."
            );
        }
    } catch (error) {
        console.log(
            `[STEAMID.COM] Error intento 1: ${error.message}`
        );
    }

    // -------------------------------------------------
    // Intento 2
    //
    // Añadimos cookies comunes de navegación.
    // -------------------------------------------------

    try {
        console.log(
            "[STEAMID.COM] Intento 2: headers de navegador..."
        );

        const headers2 = {
            ...headers,
            Connection: "keep-alive",
            DNT: "1",
            "Sec-GPC": "1"
        };

        const response = await axios.get(
            url,
            {
                params: {
                    q: nombre
                },
                headers: headers2,
                timeout: 30000,
                maxRedirects: 5,
                validateStatus: () => true
            }
        );

        console.log(
            `[STEAMID.COM] HTTP intento 2: ${response.status}`
        );

        if (
            response.status >= 200 &&
            response.status < 300 &&
            typeof response.data === "string"
        ) {
            const resultados =
                extraerResultadosSteamID(
                    response.data
                );

            console.log(
                `[STEAMID.COM] Resultados intento 2: ${resultados.length}`
            );

            if (resultados.length > 0) {
                return resultados;
            }
        }
    } catch (error) {
        console.log(
            `[STEAMID.COM] Error intento 2: ${error.message}`
        );
    }

    console.log(
        "[STEAMID.COM] No fue posible obtener SteamID64."
    );

    return [];
}

// =====================================================
// STEAM WEB API
// =====================================================

async function obtenerDatosSteam(steamId64) {
    const apiKey = process.env.STEAM_API_KEY;

    if (!apiKey) {
        console.log(
            "[STEAM API] STEAM_API_KEY no configurada."
        );

        return null;
    }

    try {
        const response = await axios.get(
            `${STEAM_API}/ISteamUser/GetPlayerSummaries/v2/`,
            {
                params: {
                    key: apiKey,
                    steamids: steamId64
                },
                timeout: 15000
            }
        );

        const players =
            response.data?.response?.players;

        if (
            !Array.isArray(players) ||
            players.length === 0
        ) {
            console.log(
                "[STEAM API] No devolvió información del jugador."
            );

            return null;
        }

        return players[0];
    } catch (error) {
        console.log(
            `[STEAM API] Error: ${error.message}`
        );

        return null;
    }
}

// =====================================================
// FORMATEAR FECHA
// =====================================================

function formatearFechaUnix(timestamp) {
    if (!timestamp) {
        return "Desconocida";
    }

    const fecha = new Date(
        Number(timestamp) * 1000
    );

    if (Number.isNaN(fecha.getTime())) {
        return "Desconocida";
    }

    return fecha.toLocaleDateString(
        "es-ES",
        {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        }
    );
}

// =====================================================
// ESTADO STEAM
// =====================================================

function obtenerEstadoSteam(persona) {
    if (!persona) {
        return "Desconocido";
    }

    switch (persona.personastate) {
        case 0:
            return "⚫ Offline";

        case 1:
            return "🟢 Online";

        case 2:
            return "🟢 Ocupado";

        case 3:
            return "🟡 Ausente";

        case 4:
            return "🟡 Durmiendo";

        case 5:
            return "🟢 Buscando intercambio";

        case 6:
            return "🟢 Buscando jugar";

        default:
            return "Desconocido";
    }
}

// =====================================================
// CREAR EMBED
// =====================================================

function crearEmbedResultado(resultado) {
    const steamId64 = resultado.steamId64;

    const persona = resultado.persona || null;

    const nombre =
        persona?.personaname ||
        resultado.nombre ||
        "Steam User";

    const avatar =
        persona?.avatarfull ||
        resultado.avatar ||
        null;

    const perfil =
        persona?.profileurl ||
        `https://steamcommunity.com/profiles/${steamId64}`;

    const estado =
        obtenerEstadoSteam(persona);

    const embed = new EmbedBuilder()
        .setTitle(`🎮 ${nombre}`)
        .setURL(perfil)
        .setDescription(
            `**SteamID64:** \`${steamId64}\``
        )
        .addFields(
            {
                name: "Estado",
                value: estado,
                inline: true
            },
            {
                name: "Perfil",
                value: `[Abrir perfil](${perfil})`,
                inline: true
            }
        )
        .setFooter({
            text: "BattleMetrics + SteamID.com"
        });

    if (persona?.timecreated) {
        embed.addFields({
            name: "Cuenta creada",
            value: formatearFechaUnix(
                persona.timecreated
            ),
            inline: true
        });
    }

    if (persona?.communityvisibilitystate) {
        embed.addFields({
            name: "Visibilidad",
            value:
                persona.communityvisibilitystate === 3
                    ? "Pública"
                    : "Privada",
            inline: true
        });
    }

    if (avatar) {
        embed.setThumbnail(avatar);
    }

    return embed;
}

// =====================================================
// BOTÓN PERFIL
// =====================================================

function crearBotonPerfil(steamId64) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel("Ver perfil de Steam")
            .setStyle(ButtonStyle.Link)
            .setURL(
                `https://steamcommunity.com/profiles/${steamId64}`
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
            "Busca un jugador de Steam mediante BattleMetrics"
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

        const nombre =
            interaction.options
                .getString("nombre")
                ?.trim();

        if (!nombre) {
            return interaction.reply({
                content:
                    "❌ Debes introducir un nombre.",
                ephemeral: true
            });
        }

        console.log(
            `[STEAM] Entrada recibida: "${nombre}"`
        );

        await interaction.deferReply();

        try {
            // =========================================
            // SERVER CONFIGURADO
            // =========================================

            const serverId =
                await obtenerBattleMetricsServerId(
                    interaction.guildId
                );

            if (!serverId) {
                console.log(
                    "[STEAM] No hay servidor BattleMetrics configurado."
                );

                return interaction.editReply(
                    "❌ Este servidor de Discord no tiene un servidor de BattleMetrics configurado. Usa `/configurar-servidor` primero."
                );
            }

            console.log(
                `[STEAM] BattleMetrics Server ID: ${serverId}`
            );

            // =========================================
            // BATTLEMETRICS
            // =========================================

            const jugadores =
                await buscarJugadoresBattleMetrics(
                    nombre,
                    serverId
                );

            console.log(
                `[STEAM] Jugadores encontrados: ${jugadores.length}`
            );

            if (jugadores.length === 0) {
                return interaction.editReply(
                    `❌ No encontré ningún jugador llamado exactamente \`${nombre}\` en el servidor de BattleMetrics configurado.`
                );
            }

            // =========================================
            // PROCESAR RESULTADOS
            // =========================================

            const resultados = [];

            for (const jugador of jugadores) {
                const playerId =
                    jugador.id;

                console.log("");
                console.log(
                    `[BM] PROCESANDO PLAYER ${playerId}`
                );

                let steamId64 = null;

                // -------------------------------------
                // IDENTIFIERS BM
                // -------------------------------------

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
                        `[BM] Error obteniendo identifiers: ${error.message}`
                    );
                }

                // -------------------------------------
                // STEAMID.COM
                // -------------------------------------

                let resultadoSteamID = null;

                if (!steamId64) {
                    console.log(
                        "[STEAMID.COM] BM no entregó SteamID64."
                    );

                    const resultadosSteamID =
                        await buscarSteamIDCom(
                            nombre
                        );

                    if (
                        resultadosSteamID.length > 0
                    ) {
                        // Intentamos encontrar primero
                        // el resultado cuyo nombre coincide
                        // exactamente.

                        const nombreLower =
                            nombre.toLowerCase();

                        resultadoSteamID =
                            resultadosSteamID.find(
                                resultado =>
                                    String(
                                        resultado.nombre || ""
                                    )
                                        .trim()
                                        .toLowerCase() ===
                                    nombreLower
                            ) ||
                            resultadosSteamID[0];

                        steamId64 =
                            resultadoSteamID.steamId64;
                    }
                }

                // -------------------------------------
                // SI NO HAY STEAMID64
                // -------------------------------------

                if (!steamId64) {
                    console.log(
                        `[STEAM] No se pudo obtener SteamID64 para ${jugador.attributes.name}`
                    );

                    resultados.push({
                        player: jugador,
                        steamId64: null,
                        persona: null,
                        nombre:
                            jugador.attributes.name
                    });

                    continue;
                }

                console.log(
                    `[STEAM] SteamID64 final: ${steamId64}`
                );

                // -------------------------------------
                // STEAM API
                // -------------------------------------

                const persona =
                    await obtenerDatosSteam(
                        steamId64
                    );

                resultados.push({
                    player: jugador,
                    steamId64,
                    persona,
                    nombre:
                        persona?.personaname ||
                        resultadoSteamID?.nombre ||
                        jugador.attributes.name,
                    avatar:
                        persona?.avatarfull ||
                        resultadoSteamID?.avatar ||
                        null
                });
            }

            console.log(
                `[STEAM] Resultados finales: ${resultados.length}`
            );

            // =========================================
            // CREAR EMBEDS
            // =========================================

            const embeds = [];

            for (const resultado of resultados) {
                if (!resultado.steamId64) {
                    const embed = new EmbedBuilder()
                        .setTitle(
                            `🎮 ${resultado.nombre}`
                        )
                        .setDescription(
                            "⚠️ Encontrado en BattleMetrics, pero no fue posible obtener su SteamID64."
                        )
                        .addFields({
                            name: "BattleMetrics Player ID",
                            value: `\`${resultado.player.id}\``,
                            inline: true
                        })
                        .setFooter({
                            text:
                                "BattleMetrics"
                        });

                    embeds.push(embed);

                    continue;
                }

                embeds.push(
                    crearEmbedResultado(
                        resultado
                    )
                );
            }

            // Discord permite máximo 10 embeds
            // por mensaje.

            const pagina =
                embeds.slice(
                    0,
                    RESULTADOS_POR_PAGINA
                );

            // =========================================
            // BOTONES
            // =========================================

            let componentes = [];

            const primerResultado =
                resultados[0];

            if (
                primerResultado &&
                primerResultado.steamId64
            ) {
                componentes.push(
                    crearBotonPerfil(
                        primerResultado.steamId64
                    )
                );
            }

            // =========================================
            // RESPUESTA
            // =========================================

            await interaction.editReply({
                embeds: pagina,
                components: componentes
            });

            console.log(
                "✅ /steam terminado"
            );
        } catch (error) {
            console.error(
                "[STEAM] ERROR:",
                error
            );

            const mensaje =
                error.response?.data?.errors?.[0]
                    ?.detail ||
                error.response?.data?.message ||
                error.message ||
                "Error desconocido.";

            try {
                await interaction.editReply(
                    `❌ Ocurrió un error al buscar el jugador.\n\`${mensaje}\``
                );
            } catch {
                // Ignorar si Discord ya respondió.
            }

            console.log(
                "❌ /steam terminado con error"
            );
        }
    }
};