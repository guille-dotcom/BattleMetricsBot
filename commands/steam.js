const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const axios = require("axios");
const ServerConfig = require("../models/ServerConfig");

const STEAM_BASE = "https://steamcommunity.com";
const STEAM_API = "https://api.steampowered.com";
const BATTLEMETRICS_BASE = "https://www.battlemetrics.com";

const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/131.0.0.0 Safari/537.36";

const STEAM_API_KEY = process.env.STEAM_API_KEY;

// =====================================================
// CONFIGURACIÓN
// =====================================================

const POR_PAGINA = 10;
const MAX_PAGINAS = 50;

const MAX_REINTENTOS_429 = 4;
const ESPERA_ENTRE_PAGINAS = 2500;
const ESPERA_429_BASE = 8000;

const BM_RESULTADOS_POR_PAGINA = 100;
const BM_MAX_PAGINAS = 50;

// =====================================================
// COLORES
// =====================================================

const COLOR_NORMAL = 0x1b2838;
const COLOR_SI = 0x57cbde;
const COLOR_NO = 0x777777;

// =====================================================
// HELPERS
// =====================================================

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function limpiarHTML(texto = "") {
    return texto
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizarNombre(nombre = "") {
    return nombre
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
}

// =====================================================
// COOKIES STEAM
// =====================================================

function obtenerCookies(response) {
    const cookies = response.headers["set-cookie"];

    if (!cookies || !Array.isArray(cookies)) {
        return [];
    }

    return cookies.map(cookie => cookie.split(";")[0]);
}

function crearCookieHeader(cookies) {
    if (!cookies || !cookies.length) {
        return "";
    }

    return cookies.join("; ");
}

// =====================================================
// CREAR SESIÓN STEAM
// =====================================================

async function crearSesionSteam() {
    console.log("[STEAM] Creando sesión...");

    try {
        const response = await axios.get(
            `${STEAM_BASE}/`,
            {
                headers: {
                    "User-Agent": USER_AGENT,
                    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8"
                },
                timeout: 20000,
                validateStatus: () => true
            }
        );

        if (response.status === 429) {
            console.log("[STEAM] ❌ Steam devolvió 429 al crear sesión.");
            return null;
        }

        const cookies = obtenerCookies(response);

        console.log("[STEAM] SessionID:", cookies.length ? "OK" : "Sin cookies");

        return {
            cookies,
            headers: {
                "User-Agent": USER_AGENT,
                "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
                ...(cookies.length
                    ? { Cookie: crearCookieHeader(cookies) }
                    : {})
            }
        };

    } catch (error) {
        console.error("[STEAM] Error creando sesión:", error.message);
        return null;
    }
}

// =====================================================
// RETRY AFTER
// =====================================================

function obtenerRetryAfter(error) {
    const retryAfter =
        error?.response?.headers?.["retry-after"];

    if (!retryAfter) {
        return null;
    }

    const segundos = Number(retryAfter);

    if (!Number.isNaN(segundos)) {
        return segundos * 1000;
    }

    return null;
}

// =====================================================
// BATTLEMETRICS URL
// =====================================================

function crearURLNameSearch(
    nombre,
    battleMetricsServerId,
    pagina = 1
) {
    return (
        `${BATTLEMETRICS_BASE}/servers/rust/` +
        `${battleMetricsServerId}/players` +
        `?filter[search]=${encodeURIComponent(nombre)}` +
        `&page=${pagina}`
    );
}

// =====================================================
// BUSCAR EN BATTLEMETRICS
// =====================================================

async function buscarNombreBattleMetrics(
    nombre,
    battleMetricsServerId,
    pagina
) {
    const url = crearURLNameSearch(
        nombre,
        battleMetricsServerId,
        pagina
    );

    console.log(
        `[BATTLEMETRICS] Buscando página ${pagina}: ${url}`
    );

    try {
        const response = await axios.get(url, {
            headers: {
                "User-Agent": USER_AGENT,
                "Accept":
                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
                "Referer": `${BATTLEMETRICS_BASE}/`,
                "Connection": "keep-alive"
            },
            timeout: 30000,
            validateStatus: () => true
        });

        if (response.status !== 200) {
            console.log(
                `[BATTLEMETRICS] HTTP ${response.status}`
            );

            return null;
        }

        return response.data;

    } catch (error) {
        console.error(
            "[BATTLEMETRICS] Error:",
            error.message
        );

        return null;
    }
}

// =====================================================
// EXTRAER JUGADORES DE BATTLEMETRICS
// =====================================================

function extraerJugadoresBattleMetrics(
    html,
    nombreBuscado
) {
    const jugadores = [];

    if (!html || typeof html !== "string") {
        return jugadores;
    }

    const nombreNormalizado =
        normalizarNombre(nombreBuscado);

    // -------------------------------------------------
    // Intento 1: encontrar enlaces de players
    // -------------------------------------------------

    const regexLinks =
        /href=["']([^"']*\/players\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

    let match;

    while ((match = regexLinks.exec(html)) !== null) {
        const href = match[1];
        const contenido = limpiarHTML(match[2]);

        if (!contenido) {
            continue;
        }

        if (
            normalizarNombre(contenido) !==
            nombreNormalizado
        ) {
            continue;
        }

        const idMatch =
            href.match(/\/players\/(\d+)/);

        if (!idMatch) {
            continue;
        }

        const playerId = idMatch[1];

        if (
            jugadores.some(
                jugador =>
                    jugador.battleMetricsId === playerId
            )
        ) {
            continue;
        }

        jugadores.push({
            battleMetricsId: playerId,
            nombre: contenido,
            battleMetricsUrl:
                href.startsWith("http")
                    ? href
                    : `${BATTLEMETRICS_BASE}${href}`
        });
    }

    // -------------------------------------------------
    // Intento 2: JSON embebido
    // -------------------------------------------------

    const steamRegex =
        /steam(?:id|Id|_id|64)["']?\s*[:=]\s*["']?(\d{17})/g;

    while ((match = steamRegex.exec(html)) !== null) {
        const steamID64 = match[1];

        const existente = jugadores.find(
            jugador =>
                jugador.steamID64 === steamID64
        );

        if (!existente) {
            jugadores.push({
                steamID64,
                nombre: nombreBuscado
            });
        } else {
            existente.steamID64 = steamID64;
        }
    }

    return jugadores;
}

// =====================================================
// OBTENER STEAMID DESDE PÁGINA DE BATTLEMETRICS
// =====================================================

async function obtenerSteamIDBattleMetrics(jugador) {
    if (!jugador?.battleMetricsUrl) {
        return jugador;
    }

    if (jugador.steamID64) {
        return jugador;
    }

    try {
        const response = await axios.get(
            jugador.battleMetricsUrl,
            {
                headers: {
                    "User-Agent": USER_AGENT,
                    "Accept-Language":
                        "es-ES,es;q=0.9,en;q=0.8"
                },
                timeout: 30000,
                validateStatus: () => true
            }
        );

        if (response.status !== 200) {
            return jugador;
        }

        const html = response.data;

        const patrones = [
            /steamid64["']?\s*[:=]\s*["']?(\d{17})/i,
            /steamID64["']?\s*[:=]\s*["']?(\d{17})/i,
            /steam_id["']?\s*[:=]\s*["']?(\d{17})/i,
            /steamid["']?\s*[:=]\s*["']?(\d{17})/i,
            /\/profiles\/(\d{17})/i
        ];

        for (const patron of patrones) {
            const match = html.match(patron);

            if (match) {
                jugador.steamID64 = match[1];
                break;
            }
        }

        return jugador;

    } catch (error) {
        console.log(
            `[BATTLEMETRICS] No se pudo obtener SteamID de ${jugador.nombre}: ${error.message}`
        );

        return jugador;
    }
}

// =====================================================
// OBTENER TODOS LOS JUGADORES DE BATTLEMETRICS
// =====================================================

async function obtenerJugadoresBattleMetrics(
    nombre,
    battleMetricsServerId
) {
    const jugadores = [];

    console.log(
        `[BATTLEMETRICS] ========================================`
    );

    console.log(
        `[BATTLEMETRICS] NAME SEARCH`
    );

    console.log(
        `[BATTLEMETRICS] Nombre: "${nombre}"`
    );

    console.log(
        `[BATTLEMETRICS] Servidor: ${battleMetricsServerId}`
    );

    console.log(
        `[BATTLEMETRICS] ========================================`
    );

    for (
        let pagina = 1;
        pagina <= BM_MAX_PAGINAS;
        pagina++
    ) {
        const html =
            await buscarNombreBattleMetrics(
                nombre,
                battleMetricsServerId,
                pagina
            );

        if (!html) {
            break;
        }

        const encontrados =
            extraerJugadoresBattleMetrics(
                html,
                nombre
            );

        if (!encontrados.length) {
            console.log(
                `[BATTLEMETRICS] No hay más resultados en página ${pagina}.`
            );

            break;
        }

        for (const jugador of encontrados) {
            if (
                !jugadores.some(
                    existente =>
                        existente.battleMetricsId &&
                        jugador.battleMetricsId &&
                        existente.battleMetricsId ===
                            jugador.battleMetricsId
                ) &&
                !jugadores.some(
                    existente =>
                        existente.steamID64 &&
                        jugador.steamID64 &&
                        existente.steamID64 ===
                            jugador.steamID64
                )
            ) {
                jugadores.push(jugador);
            }
        }

        if (encontrados.length < BM_RESULTADOS_POR_PAGINA) {
            break;
        }

        await esperar(1500);
    }

    console.log(
        `[BATTLEMETRICS] Jugadores encontrados: ${jugadores.length}`
    );

    // Obtener SteamID64 de los perfiles que todavía no lo tienen
    for (const jugador of jugadores) {
        if (!jugador.steamID64) {
            await obtenerSteamIDBattleMetrics(jugador);
        }
    }

    return jugadores;
}

// =====================================================
// STEAM NAME SEARCH
// =====================================================

function crearURLBusquedaSteam(
    nombre,
    pagina = 1
) {
    return (
        `${STEAM_BASE}/search/users/?` +
        `text=${encodeURIComponent(nombre)}` +
        `&filter=users` +
        `&page=${pagina}`
    );
}

async function buscarPaginaSteam(
    nombre,
    pagina,
    sesion
) {
    const url =
        crearURLBusquedaSteam(nombre, pagina);

    console.log(
        `[STEAM] Buscando página ${pagina}: ${url}`
    );

    try {
        const response = await axios.get(
            url,
            {
                headers: sesion.headers,
                timeout: 30000,
                validateStatus: () => true
            }
        );

        if (response.status === 429) {
            const error = new Error(
                "Steam respondió 429"
            );

            error.response = response;

            throw error;
        }

        if (response.status !== 200) {
            console.log(
                `[STEAM] HTTP ${response.status}`
            );

            return null;
        }

        return response.data;

    } catch (error) {
        throw error;
    }
}

// =====================================================
// STEAM RETRIES 429
// =====================================================

async function buscarPaginaSteamConReintentos(
    nombre,
    pagina,
    sesion
) {
    for (
        let intento = 1;
        intento <= MAX_REINTENTOS_429;
        intento++
    ) {
        try {
            return await buscarPaginaSteam(
                nombre,
                pagina,
                sesion
            );

        } catch (error) {
            const status =
                error?.response?.status;

            if (status !== 429) {
                console.error(
                    `[STEAM] Error página ${pagina}:`,
                    error.message
                );

                return null;
            }

            if (
                intento >= MAX_REINTENTOS_429
            ) {
                console.log(
                    "[STEAM] ❌ Steam sigue devolviendo 429 después de varios intentos."
                );

                console.log(
                    "[STEAM] Se detiene la búsqueda para evitar seguir golpeando Steam."
                );

                return null;
            }

            const retryAfter =
                obtenerRetryAfter(error);

            const espera =
                retryAfter ||
                ESPERA_429_BASE * intento;

            console.log(
                `[STEAM] 429. Esperando ${Math.round(
                    espera / 1000
                )} segundos antes del intento ${intento + 1}...`
            );

            await esperar(espera);
        }
    }

    return null;
}

// =====================================================
// EXTRAER PERFILES STEAM
// =====================================================

function extraerPerfilesDesdeHTML(
    html,
    nombreBuscado
) {
    const perfiles = [];

    if (!html || typeof html !== "string") {
        return perfiles;
    }

    const nombreNormalizado =
        normalizarNombre(nombreBuscado);

    // -------------------------------------------------
    // Formato habitual de Steam Search
    // -------------------------------------------------

    const regex =
        /<a[^>]+href=["'](https:\/\/steamcommunity\.com\/(?:id|profiles)\/[^"']+)["'][^>]*>[\s\S]*?<span[^>]*class=["'][^"']*searchPersonaName[^"']*["'][^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/a>/gi;

    let match;

    while ((match = regex.exec(html)) !== null) {
        const url = match[1];
        const nombre = limpiarHTML(match[2]);

        if (
            normalizarNombre(nombre) !==
            nombreNormalizado
        ) {
            continue;
        }

        if (
            perfiles.some(
                perfil => perfil.url === url
            )
        ) {
            continue;
        }

        perfiles.push({
            nombre,
            url,
            steamID64: null,
            avatar: null,
            avatarMedium: null,
            avatarFull: null
        });
    }

    // -------------------------------------------------
    // Fallback: enlaces de perfiles
    // -------------------------------------------------

    const regexProfiles =
        /href=["'](https:\/\/steamcommunity\.com\/(?:id|profiles)\/[^"']+)["']/gi;

    while (
        (match = regexProfiles.exec(html)) !== null
    ) {
        const url = match[1];

        if (
            perfiles.some(
                perfil => perfil.url === url
            )
        ) {
            continue;
        }

        const inicio =
            Math.max(0, match.index - 500);

        const final =
            Math.min(
                html.length,
                match.index + 1500
            );

        const bloque =
            html.substring(inicio, final);

        const nombreMatch =
            bloque.match(
                /searchPersonaName[^>]*>([\s\S]*?)<\/span>/i
            );

        const nombre =
            nombreMatch
                ? limpiarHTML(nombreMatch[1])
                : "";

        if (
            !nombre ||
            normalizarNombre(nombre) !==
                nombreNormalizado
        ) {
            continue;
        }

        perfiles.push({
            nombre,
            url,
            steamID64: null,
            avatar: null,
            avatarMedium: null,
            avatarFull: null
        });
    }

    return perfiles;
}

// =====================================================
// RESOLVER STEAMID64
// =====================================================

async function resolverSteamID(perfil) {
    if (perfil.steamID64) {
        return perfil;
    }

    if (!perfil.url) {
        return perfil;
    }

    const match =
        perfil.url.match(
            /\/profiles\/(\d{17})/
        );

    if (match) {
        perfil.steamID64 = match[1];
        return perfil;
    }

    try {
        const response = await axios.get(
            perfil.url,
            {
                headers: {
                    "User-Agent": USER_AGENT
                },
                timeout: 20000,
                validateStatus: () => true
            }
        );

        if (response.status !== 200) {
            return perfil;
        }

        const html = response.data;

        const patrones = [
            /steamid["']?\s*[:=]\s*["']?(\d{17})/i,
            /steamID["']?\s*[:=]\s*["']?(\d{17})/i,
            /steamid64["']?\s*[:=]\s*["']?(\d{17})/i,
            /g_steamID["']?\s*[:=]\s*["']?(\d{17})/i,
            /\/profiles\/(\d{17})/i
        ];

        for (const patron of patrones) {
            const resultado =
                html.match(patron);

            if (resultado) {
                perfil.steamID64 =
                    resultado[1];

                break;
            }
        }

    } catch (error) {
        console.log(
            `[STEAM] No se pudo resolver SteamID de ${perfil.nombre}: ${error.message}`
        );
    }

    return perfil;
}

// =====================================================
// AVATAR VÁLIDO
// =====================================================

function esAvatarSteamValido(url) {
    if (!url) {
        return false;
    }

    if (
        url.includes("steamstatic.com") ||
        url.includes("akamaihd.net")
    ) {
        return true;
    }

    return false;
}

// =====================================================
// OBTENER AVATARES STEAM
// =====================================================

async function obtenerAvataresSteam(
    perfiles
) {
    if (
        !STEAM_API_KEY ||
        !perfiles.length
    ) {
        return perfiles;
    }

    const ids = perfiles
        .map(perfil => perfil.steamID64)
        .filter(Boolean);

    if (!ids.length) {
        return perfiles;
    }

    try {
        const response =
            await axios.get(
                `${STEAM_API}/ISteamUser/GetPlayerSummaries/v0002/`,
                {
                    params: {
                        key: STEAM_API_KEY,
                        steamids: ids.join(",")
                    },
                    headers: {
                        "User-Agent": USER_AGENT
                    },
                    timeout: 20000
                }
            );

        const players =
            response.data?.response?.players ||
            [];

        for (const perfil of perfiles) {
            const steamPlayer =
                players.find(
                    player =>
                        player.steamid ===
                        perfil.steamID64
                );

            if (!steamPlayer) {
                continue;
            }

            perfil.nombreSteam =
                steamPlayer.personaname ||
                perfil.nombre;

            perfil.avatar =
                steamPlayer.avatar;

            perfil.avatarMedium =
                steamPlayer.avatarmedium;

            perfil.avatarFull =
                steamPlayer.avatarfull;

            if (
                steamPlayer.profileurl
            ) {
                perfil.url =
                    steamPlayer.profileurl;
            }
        }

    } catch (error) {
        console.error(
            "[STEAM] Error obteniendo avatares:",
            error.message
        );
    }

    return perfiles;
}

// =====================================================
// EMBED
// =====================================================

function crearEmbed(
    perfil,
    numero,
    total
) {
    const nombre =
        perfil.nombreSteam ||
        perfil.nombre ||
        "Desconocido";

    const embed =
        new EmbedBuilder()
            .setColor(COLOR_NORMAL)
            .setTitle(
                `${numero}. ${nombre}`
            )
            .addFields({
                name: "SteamID64",
                value:
                    perfil.steamID64
                        ? `\`${perfil.steamID64}\``
                        : "No encontrado",
                inline: false
            })
            .setFooter({
                text:
                    `Resultado ${numero} de ${total}`
            });

    if (
        perfil.url &&
        perfil.url.startsWith("http")
    ) {
        embed.setURL(perfil.url);
    }

    if (
        esAvatarSteamValido(
            perfil.avatarFull
        )
    ) {
        embed.setThumbnail(
            perfil.avatarFull
        );
    } else if (
        esAvatarSteamValido(
            perfil.avatarMedium
        )
    ) {
        embed.setThumbnail(
            perfil.avatarMedium
        );
    } else if (
        esAvatarSteamValido(
            perfil.avatar
        )
    ) {
        embed.setThumbnail(
            perfil.avatar
        );
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
            .setCustomId(
                "steam_anterior"
            )
            .setLabel("Anterior")
            .setEmoji("⬅️")
            .setStyle(
                ButtonStyle.Secondary
            )
            .setDisabled(
                pagina <= 0
            ),

        new ButtonBuilder()
            .setCustomId(
                "steam_siguiente"
            )
            .setLabel("Siguiente")
            .setEmoji("➡️")
            .setStyle(
                ButtonStyle.Secondary
            )
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
            "Busca jugadores de Rust por nombre"
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
        const nombre =
            interaction.options
                .getString("nombre")
                .trim();

        console.log(
            "🎯 Ejecutando /steam"
        );

        console.log(
            `[STEAM] Entrada recibida: "${nombre}"`
        );

        if (!interaction.guild) {
            return interaction.reply({
                content:
                    "❌ Este comando solo puede utilizarse dentro de un servidor de Discord.",
                ephemeral: true
            });
        }

        await interaction.deferReply();

        // =================================================
        // OBTENER CONFIGURACIÓN DEL SERVIDOR
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

            return interaction.editReply({
                content:
                    "❌ No se pudo consultar la configuración del servidor."
            });
        }

        if (
            !config ||
            !config.battleMetricsServerId
        ) {
            return interaction.editReply({
                content:
                    "❌ Este servidor de Discord todavía no tiene un servidor de BattleMetrics configurado.\n\n" +
                    "Usa `/configurar-servidor` primero."
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
        // BATTLEMETRICS NAME SEARCH
        // =================================================

        let jugadoresBattleMetrics;

        try {
            jugadoresBattleMetrics =
                await obtenerJugadoresBattleMetrics(
                    nombre,
                    battleMetricsServerId
                );

        } catch (error) {
            console.error(
                "[BATTLEMETRICS] Error general:",
                error
            );

            return interaction.editReply({
                content:
                    "❌ Ocurrió un error buscando el jugador en BattleMetrics."
            });
        }

        if (
            !jugadoresBattleMetrics.length
        ) {
            return interaction.editReply({
                content:
                    `❌ No encontré jugadores con el nombre exacto \`${nombre}\` en el servidor de Rust configurado.`
            });
        }

        // =================================================
        // OBTENER STEAMID64 DESDE BATTLEMETRICS
        // =================================================

        const steamIDsBattleMetrics =
            jugadoresBattleMetrics
                .map(
                    jugador =>
                        jugador.steamID64
                )
                .filter(Boolean);

        console.log(
            `[BATTLEMETRICS] SteamIDs encontrados: ${steamIDsBattleMetrics.length}`
        );

        // =================================================
        // BUSCAR EN STEAM
        // =================================================

        let perfilesSteam = [];

        const sesion =
            await crearSesionSteam();

        if (sesion) {
            for (
                let pagina = 1;
                pagina <= MAX_PAGINAS;
                pagina++
            ) {
                const html =
                    await buscarPaginaSteamConReintentos(
                        nombre,
                        pagina,
                        sesion
                    );

                if (!html) {
                    break;
                }

                const encontrados =
                    extraerPerfilesDesdeHTML(
                        html,
                        nombre
                    );

                for (
                    const perfil
                    of encontrados
                ) {
                    if (
                        !perfilesSteam.some(
                            existente =>
                                existente.url ===
                                perfil.url
                        )
                    ) {
                        perfilesSteam.push(
                            perfil
                        );
                    }
                }

                console.log(
                    `[STEAM] Página ${pagina}: ${encontrados.length} perfiles exactos`
                );

                if (
                    encontrados.length === 0
                ) {
                    break;
                }

                if (
                    encontrados.length <
                    10
                ) {
                    break;
                }

                if (
                    pagina < MAX_PAGINAS
                ) {
                    await esperar(
                        ESPERA_ENTRE_PAGINAS
                    );
                }
            }
        }

        // =================================================
        // RESOLVER STEAMID
        // =================================================

        for (
            const perfil
            of perfilesSteam
        ) {
            await resolverSteamID(
                perfil
            );
        }

        // =================================================
        // RELACIONAR LOS RESULTADOS DE
        // BATTLEMETRICS CON STEAM
        // =================================================

        for (
            const perfil
            of perfilesSteam
        ) {
            const encontrado =
                jugadoresBattleMetrics.find(
                    jugador =>
                        jugador.steamID64 &&
                        perfil.steamID64 &&
                        jugador.steamID64 ===
                            perfil.steamID64
                );

            if (encontrado) {
                perfil.battleMetricsId =
                    encontrado.battleMetricsId;

                perfil.battleMetricsUrl =
                    encontrado.battleMetricsUrl;
            }
        }

        // =================================================
        // SI STEAM NO ENCONTRÓ EL PERFIL PERO
        // BATTLEMETRICS SÍ TIENE STEAMID
        // =================================================

        for (
            const jugador
            of jugadoresBattleMetrics
        ) {
            if (
                !jugador.steamID64
            ) {
                continue;
            }

            const existe =
                perfilesSteam.some(
                    perfil =>
                        perfil.steamID64 ===
                        jugador.steamID64
                );

            if (existe) {
                continue;
            }

            perfilesSteam.push({
                nombre:
                    jugador.nombre ||
                    nombre,
                nombreSteam:
                    jugador.nombre ||
                    nombre,
                steamID64:
                    jugador.steamID64,
                url:
                    `https://steamcommunity.com/profiles/${jugador.steamID64}`,
                avatar: null,
                avatarMedium: null,
                avatarFull: null,
                battleMetricsId:
                    jugador.battleMetricsId,
                battleMetricsUrl:
                    jugador.battleMetricsUrl
            });
        }

        // =================================================
        // AVATARES
        // =================================================

        await obtenerAvataresSteam(
            perfilesSteam
        );

        // =================================================
        // ELIMINAR DUPLICADOS
        // =================================================

        perfilesSteam =
            perfilesSteam.filter(
                (perfil, index, array) =>
                    index ===
                    array.findIndex(
                        otro =>
                            otro.steamID64 &&
                            perfil.steamID64 &&
                            otro.steamID64 ===
                                perfil.steamID64
                    )
            );

        // =================================================
        // RESULTADOS
        // =================================================

        if (!perfilesSteam.length) {
            return interaction.editReply({
                content:
                    `❌ BattleMetrics encontró jugadores con el nombre \`${nombre}\`, pero no fue posible obtener sus perfiles de Steam.`
            });
        }

        console.log(
            `[STEAM] Resultados finales: ${perfilesSteam.length}`
        );

        // =================================================
        // PAGINACIÓN
        // =================================================

        let paginaActual = 0;

        const totalPaginas =
            Math.ceil(
                perfilesSteam.length /
                    POR_PAGINA
            );

        function obtenerEmbeds() {
            const inicio =
                paginaActual *
                POR_PAGINA;

            const resultados =
                perfilesSteam.slice(
                    inicio,
                    inicio + POR_PAGINA
                );

            return resultados.map(
                (perfil, index) =>
                    crearEmbed(
                        perfil,
                        inicio + index + 1,
                        perfilesSteam.length
                    )
            );
        }

        const respuesta = await interaction.editReply({
            embeds: obtenerEmbeds(),
            components:
                totalPaginas > 1
                    ? [
                          crearBotones(
                              paginaActual,
                              totalPaginas
                          )
                      ]
                    : []
        });

        // =================================================
        // COLLECTOR
        // =================================================

        if (totalPaginas <= 1) {
            return;
        }

        const collector =
            respuesta.createMessageComponentCollector({
                time: 5 * 60 * 1000
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
                            "❌ Solo la persona que ejecutó el comando puede utilizar estos botones.",
                        ephemeral: true
                    });
                }

                if (
                    buttonInteraction.customId ===
                    "steam_anterior"
                ) {
                    if (
                        paginaActual > 0
                    ) {
                        paginaActual--;
                    }
                }

                if (
                    buttonInteraction.customId ===
                    "steam_siguiente"
                ) {
                    if (
                        paginaActual <
                        totalPaginas - 1
                    ) {
                        paginaActual++;
                    }
                }

                await buttonInteraction.update({
                    embeds:
                        obtenerEmbeds(),
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
                    await interaction.editReply({
                        components: []
                    });
                } catch (error) {
                    // El mensaje puede haber sido eliminado
                }
            }
        );
    }
};