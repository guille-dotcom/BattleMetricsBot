const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const axios = require("axios");

const STEAM_BASE = "https://steamcommunity.com";
const STEAM_API = "https://api.steampowered.com";

const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/140.0.0.0 Safari/537.36";

const STEAM_API_KEY = process.env.STEAM_API_KEY;

const POR_PAGINA = 10;
const MAX_PAGINAS = 50;

// =====================================================
// CONFIGURACIÓN ANTI-429
// =====================================================

const MAX_REINTENTOS_429 = 4;

// Tiempo mínimo entre peticiones de búsqueda
const ESPERA_ENTRE_PAGINAS = 2500;

// Si Steam devuelve 429 y no manda Retry-After,
// esperamos progresivamente.
const ESPERA_429_BASE = 8000;

// =====================================================
// COLORES
// =====================================================

const COLORES = {
    NORMAL: 0x1b2838,
    SI: 0x57cbde,
    NO: 0x777777
};

// =====================================================
// SLEEP
// =====================================================

function esperar(ms) {
    return new Promise(resolve =>
        setTimeout(resolve, ms)
    );
}

// =====================================================
// COOKIE JAR
// =====================================================

function crearCookieJar() {
    const cookies = new Map();

    return {
        guardar(setCookie) {
            if (!setCookie) return;

            const lista = Array.isArray(setCookie)
                ? setCookie
                : [setCookie];

            for (const cookie of lista) {
                const parte = cookie.split(";")[0];

                const index = parte.indexOf("=");

                if (index === -1) continue;

                const nombre = parte
                    .substring(0, index)
                    .trim();

                const valor = parte
                    .substring(index + 1)
                    .trim();

                if (nombre) {
                    cookies.set(nombre, valor);
                }
            }
        },

        obtener() {
            return Array.from(cookies.entries())
                .map(
                    ([nombre, valor]) =>
                        `${nombre}=${valor}`
                )
                .join("; ");
        },

        obtenerValor(nombre) {
            return cookies.get(nombre) || "";
        }
    };
}

// =====================================================
// CREAR SESIÓN STEAM
// =====================================================

async function crearSesionSteam() {
    const jar = crearCookieJar();

    try {
        console.log(
            "[STEAM] Creando sesión..."
        );

        const inicio = await axios.get(
            STEAM_BASE + "/",
            {
                headers: {
                    "User-Agent": USER_AGENT,
                    Accept:
                        "text/html,application/xhtml+xml"
                },
                timeout: 20000,
                validateStatus: () => true
            }
        );

        jar.guardar(
            inicio.headers["set-cookie"]
        );

        await esperar(1000);

        const busqueda = await axios.get(
            STEAM_BASE + "/search/users/",
            {
                params: {
                    text: "steam"
                },
                headers: {
                    "User-Agent": USER_AGENT,
                    Accept:
                        "text/html,application/xhtml+xml",
                    Cookie: jar.obtener(),
                    Referer: STEAM_BASE + "/",
                    "Accept-Language":
                        "en-US,en;q=0.9"
                },
                timeout: 20000,
                validateStatus: () => true
            }
        );

        jar.guardar(
            busqueda.headers["set-cookie"]
        );

        let sessionId =
            jar.obtenerValor("sessionid");

        if (!sessionId) {
            const match =
                String(busqueda.data || "").match(
                    /name=["']sessionid["'][^>]*value=["']([^"']+)/i
                );

            if (match) {
                sessionId = match[1];
            }
        }

        console.log(
            "[STEAM] SessionID:",
            sessionId
                ? "OK"
                : "NO ENCONTRADO"
        );

        return {
            jar,
            sessionId
        };
    } catch (error) {
        console.error(
            "[STEAM] Error creando sesión:",
            error.message
        );

        return {
            jar,
            sessionId: ""
        };
    }
}

// =====================================================
// OBTENER RETRY-AFTER
// =====================================================

function obtenerRetryAfter(error) {
    const headers =
        error?.response?.headers || {};

    const retryAfter =
        headers["retry-after"];

    if (retryAfter) {
        const segundos =
            Number(retryAfter);

        if (
            Number.isFinite(segundos) &&
            segundos > 0
        ) {
            return segundos * 1000;
        }

        const fecha =
            Date.parse(retryAfter);

        if (!Number.isNaN(fecha)) {
            const espera =
                fecha - Date.now();

            if (espera > 0) {
                return espera;
            }
        }
    }

    return null;
}

// =====================================================
// PETICIÓN DE BÚSQUEDA STEAM
// =====================================================

async function buscarPaginaSteam(
    nombre,
    pagina,
    sesion
) {
    const params = {
        text: nombre,
        filter: "users",
        page: pagina
    };

    if (sesion.sessionId) {
        params.sessionid =
            sesion.sessionId;
    }

    const headers = {
        "User-Agent": USER_AGENT,
        Accept: "*/*",
        "Accept-Language":
            "en-US,en;q=0.9",
        Referer:
            STEAM_BASE +
            "/search/users/?text=" +
            encodeURIComponent(nombre) +
            "&filter=users&page=" +
            pagina,
        Origin: STEAM_BASE,
        "X-Requested-With":
            "XMLHttpRequest",
        Cookie: sesion.jar.obtener()
    };

    const response = await axios.get(
        STEAM_BASE +
            "/search/SearchCommunityAjax",
        {
            params,
            headers,
            timeout: 20000,
            validateStatus: () => true
        }
    );

    sesion.jar.guardar(
        response.headers["set-cookie"]
    );

    if (response.status === 429) {
        const error = new Error(
            "STEAM_429"
        );

        error.response = response;

        throw error;
    }

    if (response.status === 401) {
        throw new Error(
            "STEAM_401"
        );
    }

    if (response.status !== 200) {
        throw new Error(
            `Steam respondió HTTP ${response.status}`
        );
    }

    return response.data;
}

// =====================================================
// BUSCAR PÁGINA CON REINTENTOS 429
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
            if (
                error.message !==
                "STEAM_429"
            ) {
                throw error;
            }

            let espera429 =
                obtenerRetryAfter(error);

            if (!espera429) {
                espera429 =
                    ESPERA_429_BASE *
                    intento;
            }

            // Evitamos esperas absurdamente grandes
            espera429 = Math.min(
                espera429,
                60000
            );

            console.log(
                `[STEAM] ⚠️ HTTP 429 en página ${pagina}.`
            );

            console.log(
                `[STEAM] Reintento ${intento}/${MAX_REINTENTOS_429}`
            );

            console.log(
                `[STEAM] Esperando ${Math.ceil(
                    espera429 / 1000
                )} segundos...`
            );

            await esperar(
                espera429
            );

            // Al segundo intento en adelante,
            // reconstruimos la sesión.
            if (intento >= 2) {
                console.log(
                    "[STEAM] Renovando sesión por 429..."
                );

                const nuevaSesion =
                    await crearSesionSteam();

                sesion.jar =
                    nuevaSesion.jar;

                sesion.sessionId =
                    nuevaSesion.sessionId;
            }
        }
    }

    throw new Error(
        "STEAM_429_MAX"
    );
}

// =====================================================
// EXTRAER PERFILES DEL HTML
// =====================================================

function extraerPerfilesDesdeHTML(
    html,
    nombreBuscado
) {
    const perfiles = [];

    if (!html) {
        return perfiles;
    }

    const contenedor =
        String(html);

    const bloques =
        contenedor.split(
            /(?=<a[^>]+class=["'][^"']*searchPersonaName[^"']*)/i
        );

    for (const bloque of bloques) {
        if (
            !/searchPersonaName/i.test(
                bloque
            )
        ) {
            continue;
        }

        let url = "";

        const enlaceMatch =
            bloque.match(
                /<a[^>]+href=["']([^"']+)["'][^>]*class=["'][^"']*searchPersonaName/i
            );

        if (enlaceMatch) {
            url = enlaceMatch[1];
        }

        if (!url) {
            const alternativa =
                bloque.match(
                    /<a[^>]+href=["']([^"']+)["'][^>]*>/i
                );

            if (alternativa) {
                url = alternativa[1];
            }
        }

        if (!url) {
            continue;
        }

        if (url.startsWith("/")) {
            url =
                STEAM_BASE + url;
        }

        const nombreMatch =
            bloque.match(
                /class=["'][^"']*searchPersonaName[^"']*["'][^>]*>([\s\S]*?)<\/a>/i
            );

        if (!nombreMatch) {
            continue;
        }

        const nombre =
            limpiarHTML(
                nombreMatch[1]
            );

        if (!nombre) {
            continue;
        }

        // =================================================
        // EXACTO IGNORANDO MAYÚSCULAS/MINÚSCULAS
        // =================================================

        if (
            nombre.localeCompare(
                nombreBuscado,
                undefined,
                {
                    sensitivity: "accent"
                }
            ) !== 0
        ) {
            continue;
        }

        const avatarMatch =
            bloque.match(
                /<img[^>]+src=["']([^"']+)["']/i
            );

        const avatarHTML =
            avatarMatch
                ? avatarMatch[1]
                : "";

        const perfil = {
            nombre,
            url,
            steamid: "",
            avatar: "",
            avatarHTML,
            tieneRust: false,
            inventarioRust: false
        };

        const profileMatch =
            url.match(
                /\/profiles\/(\d+)/i
            );

        if (profileMatch) {
            perfil.steamid =
                profileMatch[1];
        }

        perfiles.push(
            perfil
        );
    }

    return perfiles;
}

// =====================================================
// LIMPIAR HTML
// =====================================================

function limpiarHTML(texto) {
    return String(texto || "")
        .replace(
            /<br\s*\/?>/gi,
            " "
        )
        .replace(
            /<[^>]+>/g,
            ""
        )
        .replace(
            /&nbsp;/gi,
            " "
        )
        .replace(
            /&amp;/gi,
            "&"
        )
        .replace(
            /&quot;/gi,
            '"'
        )
        .replace(
            /&#39;/gi,
            "'"
        )
        .replace(
            /&lt;/gi,
            "<"
        )
        .replace(
            /&gt;/gi,
            ">"
        )
        .replace(
            /\s+/g,
            " "
        )
        .trim();
}

// =====================================================
// RESOLVER STEAMID64
// =====================================================

async function resolverSteamID(
    perfil
) {
    if (perfil.steamid) {
        return perfil.steamid;
    }

    const profileMatch =
        perfil.url.match(
            /\/profiles\/(\d+)/i
        );

    if (profileMatch) {
        perfil.steamid =
            profileMatch[1];

        return perfil.steamid;
    }

    const vanityMatch =
        perfil.url.match(
            /\/id\/([^/?#]+)/i
        );

    if (!vanityMatch) {
        return "";
    }

    if (!STEAM_API_KEY) {
        console.log(
            `[STEAM] No existe STEAM_API_KEY para ${perfil.url}`
        );

        return "";
    }

    const vanity =
        decodeURIComponent(
            vanityMatch[1]
        );

    try {
        console.log(
            `[STEAM] Resolviendo vanity: ${vanity}`
        );

        const response =
            await axios.get(
                STEAM_API +
                    "/ISteamUser/ResolveVanityURL/v1/",
                {
                    params: {
                        key: STEAM_API_KEY,
                        vanityurl: vanity,
                        url_type: 1
                    },
                    headers: {
                        "User-Agent":
                            USER_AGENT,
                        Accept:
                            "application/json"
                    },
                    timeout: 15000
                }
            );

        const steamid =
            response.data
                ?.response
                ?.steamid;

        if (steamid) {
            perfil.steamid =
                String(steamid);

            console.log(
                `[STEAM] Vanity ${vanity} => ${perfil.steamid}`
            );

            return perfil.steamid;
        }

        console.log(
            `[STEAM] No se pudo resolver vanity: ${vanity}`
        );
    } catch (error) {
        console.log(
            `[STEAM] Error resolviendo vanity ${vanity}: ${error.message}`
        );
    }

    return "";
}

// =====================================================
// VALIDAR AVATAR
// =====================================================

function esAvatarSteamValido(
    url
) {
    if (!url) {
        return false;
    }

    try {
        const parsed =
            new URL(url);

        const host =
            parsed.hostname.toLowerCase();

        return (
            host.includes(
                "steamstatic.com"
            ) ||
            host.includes(
                "steamcdn-a.akamaihd.net"
            ) ||
            host.includes(
                "akamaihd.net"
            )
        );
    } catch {
        return false;
    }
}

// =====================================================
// OBTENER AVATARES EN LOTES
// =====================================================

async function obtenerAvataresSteam(
    perfiles
) {
    if (!STEAM_API_KEY) {
        console.log(
            "[STEAM] STEAM_API_KEY no configurada."
        );

        return;
    }

    const perfilesConID =
        perfiles.filter(
            perfil =>
                perfil.steamid
        );

    if (
        !perfilesConID.length
    ) {
        return;
    }

    console.log(
        `[STEAM] Obteniendo avatares de ${perfilesConID.length} perfiles...`
    );

    for (
        let i = 0;
        i < perfilesConID.length;
        i += 100
    ) {
        const lote =
            perfilesConID.slice(
                i,
                i + 100
            );

        const steamids =
            lote
                .map(
                    perfil =>
                        perfil.steamid
                )
                .join(",");

        try {
            const response =
                await axios.get(
                    STEAM_API +
                        "/ISteamUser/GetPlayerSummaries/v2/",
                    {
                        params: {
                            key:
                                STEAM_API_KEY,
                            steamids
                        },
                        headers: {
                            "User-Agent":
                                USER_AGENT,
                            Accept:
                                "application/json"
                        },
                        timeout: 20000
                    }
                );

            const players =
                response.data
                    ?.response
                    ?.players || [];

            const mapa =
                new Map();

            for (
                const player of players
            ) {
                if (
                    !player?.steamid
                ) {
                    continue;
                }

                mapa.set(
                    String(
                        player.steamid
                    ),
                    player
                );
            }

            for (
                const perfil of lote
            ) {
                const player =
                    mapa.get(
                        String(
                            perfil.steamid
                        )
                    );

                if (!player) {
                    continue;
                }

                const avatar =
                    player.avatarfull ||
                    player.avatarmedium ||
                    player.avatar ||
                    "";

                if (
                    esAvatarSteamValido(
                        avatar
                    )
                ) {
                    perfil.avatar =
                        avatar;
                }
            }

            console.log(
                `[STEAM] Avatares procesados: ${Math.min(
                    i + 100,
                    perfilesConID.length
                )}/${perfilesConID.length}`
            );

            // Pausa entre lotes
            if (
                i + 100 <
                perfilesConID.length
            ) {
                await esperar(1500);
            }
        } catch (error) {
            console.error(
                "[STEAM] Error obteniendo avatares:",
                error.message
            );
        }
    }
}

// =====================================================
// COMPROBAR RUST
// =====================================================

async function comprobarRustSteam(
    perfil
) {
    if (!perfil.steamid) {
        return;
    }

    try {
        const url =
            STEAM_BASE +
            "/profiles/" +
            perfil.steamid +
            "/games?tab=all";

        const response =
            await axios.get(
                url,
                {
                    headers: {
                        "User-Agent":
                            USER_AGENT,
                        Accept:
                            "text/html,application/xhtml+xml"
                    },
                    timeout: 15000,
                    validateStatus:
                        () => true
                }
            );

        if (
            response.status !== 200
        ) {
            return;
        }

        const html =
            String(
                response.data || ""
            );

        perfil.tieneRust =
            /Rust\s*(?:<\/[^>]+>\s*)?(?:\(\s*)?1036830/i.test(
                html
            ) ||
            /app\/1036830/i.test(
                html
            ) ||
            /appid["']?\s*[:=]\s*["']?1036830/i.test(
                html
            );

        if (
            !perfil.tieneRust
        ) {
            perfil.tieneRust =
                /Rust/i.test(
                    html
                ) &&
                /1036830/.test(
                    html
                );
        }

        if (
            perfil.tieneRust
        ) {
            await comprobarInventarioRust(
                perfil
            );
        }
    } catch (error) {
        console.log(
            `[STEAM] Error comprobando Rust ${perfil.steamid}: ${error.message}`
        );
    }
}

// =====================================================
// INVENTARIO RUST
// =====================================================

async function comprobarInventarioRust(
    perfil
) {
    try {
        const url =
            STEAM_BASE +
            "/inventory/" +
            perfil.steamid +
            "/252490/2?l=english&count=1";

        const response =
            await axios.get(
                url,
                {
                    headers: {
                        "User-Agent":
                            USER_AGENT,
                        Accept:
                            "application/json,text/plain,*/*",
                        Referer:
                            STEAM_BASE +
                            "/profiles/" +
                            perfil.steamid
                    },
                    timeout: 15000,
                    validateStatus:
                        () => true
                }
            );

        if (
            response.status !== 200
        ) {
            perfil.inventarioRust =
                false;

            return;
        }

        const data =
            response.data;

        if (
            typeof data ===
                "object" &&
            data !== null
        ) {
            if (
                data.success === 1 ||
                Array.isArray(
                    data.descriptions
                ) ||
                Array.isArray(
                    data.assets
                )
            ) {
                perfil.inventarioRust =
                    true;

                return;
            }
        }

        const texto =
            String(
                data || ""
            );

        perfil.inventarioRust =
            /descriptions/i.test(
                texto
            ) ||
            /assets/i.test(
                texto
            );
    } catch {
        perfil.inventarioRust =
            false;
    }
}

// =====================================================
// BATTLEMETRICS
// =====================================================

async function obtenerNombreBattleMetrics(
    input
) {
    const match =
        input.match(
            /battlemetrics\.com\/players\/(\d+)/i
        );

    if (!match) {
        return null;
    }

    try {
        const response =
            await axios.get(
                input,
                {
                    headers: {
                        "User-Agent":
                            USER_AGENT,
                        Accept:
                            "text/html,application/xhtml+xml"
                    },
                    timeout: 20000,
                    validateStatus:
                        () => true
                }
            );

        if (
            response.status !== 200
        ) {
            return null;
        }

        const html =
            String(
                response.data || ""
            );

        let nombre = null;

        const titleMatch =
            html.match(
                /<title[^>]*>([\s\S]*?)<\/title>/i
            );

        if (titleMatch) {
            nombre =
                limpiarHTML(
                    titleMatch[1]
                )
                    .replace(
                        /\s*[-|]\s*BattleMetrics.*$/i,
                        ""
                    )
                    .trim();
        }

        if (!nombre) {
            const ogMatch =
                html.match(
                    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i
                );

            if (ogMatch) {
                nombre =
                    limpiarHTML(
                        ogMatch[1]
                    );
            }
        }

        return (
            nombre || null
        );
    } catch {
        return null;
    }
}

// =====================================================
// CREAR EMBED
// =====================================================

function crearEmbed(
    perfil,
    numero,
    total
) {
    const embed =
        new EmbedBuilder()
            .setColor(
                perfil.tieneRust
                    ? COLORES.SI
                    : COLORES.NORMAL
            )
            .setTitle(
                `${numero}. ${perfil.nombre}`
            )
            .setURL(
                perfil.url
            )
            .addFields(
                {
                    name:
                        "SteamID64",
                    value:
                        perfil.steamid
                            ? `\`${perfil.steamid}\``
                            : "`No disponible`",
                    inline: false
                },
                {
                    name:
                        "Rust",
                    value:
                        perfil.tieneRust
                            ? "🟢 Sí"
                            : "🔴 No",
                    inline: true
                },
                {
                    name:
                        "Inventario Rust",
                    value:
                        perfil.tieneRust
                            ? (
                                perfil.inventarioRust
                                    ? "🟢 Accesible"
                                    : "🔴 No accesible"
                            )
                            : "⚪ No tiene Rust",
                    inline: true
                }
            )
            .setFooter({
                text:
                    `Resultado ${numero}/${total} • Steam`
            });

    if (
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
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(
                    "steam_anterior"
                )
                .setLabel(
                    "◀ Anterior"
                )
                .setStyle(
                    ButtonStyle.Secondary
                )
                .setDisabled(
                    pagina <= 0
                ),

            new ButtonBuilder()
                .setCustomId(
                    "steam_pagina"
                )
                .setLabel(
                    `Página ${pagina + 1}/${totalPaginas}`
                )
                .setStyle(
                    ButtonStyle.Primary
                )
                .setDisabled(
                    true
                ),

            new ButtonBuilder()
                .setCustomId(
                    "steam_siguiente"
                )
                .setLabel(
                    "Siguiente ▶"
                )
                .setStyle(
                    ButtonStyle.Secondary
                )
                .setDisabled(
                    pagina >=
                        totalPaginas - 1
                )
        );
}

// =====================================================
// COMANDO
// =====================================================

module.exports = {
    data:
        new SlashCommandBuilder()
            .setName("steam")
            .setDescription(
                "Busca perfiles de Steam por nombre exacto"
            )
            .addStringOption(
                option =>
                    option
                        .setName(
                            "nombre"
                        )
                        .setDescription(
                            "Nombre exacto del perfil de Steam o URL de BattleMetrics"
                        )
                        .setRequired(
                            true
                        )
            ),

    async execute(
        interaction
    ) {
        const entrada =
            interaction.options.getString(
                "nombre"
            )?.trim();

        if (!entrada) {
            return interaction.reply({
                content:
                    "❌ Debes introducir un nombre.",
                ephemeral: true
            });
        }

        await interaction.deferReply();

        console.log("");
        console.log(
            "🎯 Ejecutando /steam"
        );

        console.log(
            `[STEAM] Entrada recibida: "${entrada}"`
        );

        console.log(
            "[STEAM] ========================================"
        );

        // =================================================
        // BATTLEMETRICS
        // =================================================

        let nombreBusqueda =
            entrada;

        if (
            /battlemetrics\.com\/players\/\d+/i.test(
                entrada
            )
        ) {
            console.log(
                "[STEAM] Detectada URL de BattleMetrics"
            );

            const nombreBM =
                await obtenerNombreBattleMetrics(
                    entrada
                );

            if (nombreBM) {
                nombreBusqueda =
                    nombreBM;

                console.log(
                    `[STEAM] Nombre obtenido de BattleMetrics: "${nombreBusqueda}"`
                );
            }
        }

        console.log(
            `[STEAM] BUSCANDO NOMBRE EXACTO: "${nombreBusqueda}"`
        );

        console.log(
            "[STEAM] ========================================"
        );

        // =================================================
        // CREAR SESIÓN
        // =================================================

        let sesion =
            await crearSesionSteam();

        // =================================================
        // RESULTADOS
        // =================================================

        const todosLosPerfiles =
            [];

        const urlsVistas =
            new Set();

        // =================================================
        // BUSCAR PÁGINAS
        // =================================================

        for (
            let pagina = 1;
            pagina <= MAX_PAGINAS;
            pagina++
        ) {
            console.log(
                `[STEAM] Buscando página ${pagina}: ${STEAM_BASE}/search/users/?text=${encodeURIComponent(
                    nombreBusqueda
                )}&filter=users&page=${pagina}`
            );

            // Pausa antes de cada página,
            // excepto la primera.
            if (
                pagina > 1
            ) {
                console.log(
                    `[STEAM] Esperando ${ESPERA_ENTRE_PAGINAS}ms antes de la siguiente página...`
                );

                await esperar(
                    ESPERA_ENTRE_PAGINAS
                );
            }

            let data;

            try {
                data =
                    await buscarPaginaSteamConReintentos(
                        nombreBusqueda,
                        pagina,
                        sesion
                    );
            } catch (error) {
                // =================================================
                // 401
                // =================================================

                if (
                    error.message ===
                    "STEAM_401"
                ) {
                    console.log(
                        "[STEAM] 401 detectado."
                    );

                    console.log(
                        "[STEAM] Creando nueva sesión..."
                    );

                    sesion =
                        await crearSesionSteam();

                    try {
                        data =
                            await buscarPaginaSteamConReintentos(
                                nombreBusqueda,
                                pagina,
                                sesion
                            );
                    } catch (error2) {
                        console.error(
                            "[STEAM] Error después de renovar sesión:",
                            error2.message
                        );

                        break;
                    }
                }

                // =================================================
                // 429 DEFINITIVO
                // =================================================
                else if (
                    error.message ===
                    "STEAM_429_MAX"
                ) {
                    console.error(
                        "[STEAM] ❌ Steam sigue devolviendo 429 después de varios intentos."
                    );

                    console.error(
                        "[STEAM] Se detiene la búsqueda para evitar seguir golpeando Steam."
                    );

                    break;
                }

                // =================================================
                // OTRO ERROR
                // =================================================
                else {
                    console.error(
                        "[STEAM] Error buscando página:",
                        error.message
                    );

                    break;
                }
            }

            let html = "";

            if (
                typeof data ===
                    "object" &&
                data !== null
            ) {
                html =
                    data.html ||
                    data.results_html ||
                    data.resultsHTML ||
                    "";
            } else {
                html =
                    String(
                        data || ""
                    );
            }

            if (!html) {
                console.log(
                    "[STEAM] Página sin HTML."
                );

                break;
            }

            const perfilesPagina =
                extraerPerfilesDesdeHTML(
                    html,
                    nombreBusqueda
                );

            console.log(
                `[STEAM] Página ${pagina}: ${perfilesPagina.length} coincidencias`
            );

            if (
                !perfilesPagina.length
            ) {
                break;
            }

            let nuevos = 0;

            for (
                const perfil of perfilesPagina
            ) {
                const clave =
                    perfil.url.toLowerCase();

                if (
                    urlsVistas.has(
                        clave
                    )
                ) {
                    continue;
                }

                urlsVistas.add(
                    clave
                );

                // Resolver SteamID antes del avatar
                await resolverSteamID(
                    perfil
                );

                todosLosPerfiles.push(
                    perfil
                );

                nuevos++;
            }

            console.log(
                `[STEAM] Nuevos perfiles: ${nuevos}`
            );

            console.log(
                `[STEAM] Total acumulado: ${todosLosPerfiles.length}`
            );

            if (
                nuevos === 0
            ) {
                break;
            }

            if (
                perfilesPagina.length <
                10
            ) {
                break;
            }
        }

        // =================================================
        // SIN RESULTADOS
        // =================================================

        if (
            !todosLosPerfiles.length
        ) {
            return interaction.editReply({
                content:
                    `❌ No encontré perfiles con el nombre exacto **${nombreBusqueda}**.`
            });
        }

        console.log("");
        console.log(
            `[STEAM] ${todosLosPerfiles.length} perfiles encontrados.`
        );

        // =================================================
        // AVATARES
        // =================================================

        await obtenerAvataresSteam(
            todosLosPerfiles
        );

        // =================================================
        // RUST
        // =================================================

        console.log(
            "[STEAM] Comprobando Rust..."
        );

        for (
            const perfil of todosLosPerfiles
        ) {
            await comprobarRustSteam(
                perfil
            );

            // Pequeña pausa para no hacer
            // demasiadas peticiones seguidas.
            await esperar(250);
        }

        // =================================================
        // PAGINACIÓN
        // =================================================

        const paginas = [];

        for (
            let i = 0;
            i < todosLosPerfiles.length;
            i += POR_PAGINA
        ) {
            paginas.push(
                todosLosPerfiles.slice(
                    i,
                    i + POR_PAGINA
                )
            );
        }

        let paginaActual = 0;

        // =================================================
        // EMBEDS
        // =================================================

        function obtenerEmbedsPagina() {
            const pagina =
                paginas[paginaActual];

            const inicio =
                paginaActual *
                POR_PAGINA;

            return pagina.map(
                (
                    perfil,
                    index
                ) =>
                    crearEmbed(
                        perfil,
                        inicio +
                            index +
                            1,
                        todosLosPerfiles.length
                    )
            );
        }

        // =================================================
        // RESPUESTA
        // =================================================

        await interaction.editReply({
            content:
                `🔎 **${todosLosPerfiles.length} resultados encontrados** para \`${nombreBusqueda}\``,
            embeds:
                obtenerEmbedsPagina(),
            components:
                paginas.length > 1
                    ? crearBotones(
                        paginaActual,
                        paginas.length
                    )
                    : []
        });

        // =================================================
        // SIN PAGINACIÓN
        // =================================================

        if (
            paginas.length <= 1
        ) {
            return;
        }

        // =================================================
        // COLECTOR
        // =================================================

        const mensaje =
            await interaction.fetchReply();

        const collector =
            mensaje.createMessageComponentCollector(
                {
                    time:
                        5 * 60 * 1000
                }
            );

        collector.on(
            "collect",
            async button => {
                if (
                    button.user.id !==
                    interaction.user.id
                ) {
                    await button.reply({
                        content:
                            "❌ Solo la persona que ejecutó el comando puede usar estos botones.",
                        ephemeral:
                            true
                    });

                    return;
                }

                if (
                    button.customId ===
                    "steam_anterior"
                ) {
                    if (
                        paginaActual > 0
                    ) {
                        paginaActual--;
                    }
                }

                if (
                    button.customId ===
                    "steam_siguiente"
                ) {
                    if (
                        paginaActual <
                        paginas.length - 1
                    ) {
                        paginaActual++;
                    }
                }

                await button.update({
                    content:
                        `🔎 **${todosLosPerfiles.length} resultados encontrados** para \`${nombreBusqueda}\``,
                    embeds:
                        obtenerEmbedsPagina(),
                    components:
                        crearBotones(
                            paginaActual,
                            paginas.length
                        )
                });
            }
        );

        collector.on(
            "end",
            async () => {
                try {
                    await interaction.editReply(
                        {
                            components: []
                        }
                    );
                } catch {}
            }
        );
    }
};