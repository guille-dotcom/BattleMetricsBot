const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const axios = require("axios");
const cheerio = require("cheerio");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const STEAM_BASE = "https://steamcommunity.com";
const STEAM_SEARCH =
    `${STEAM_BASE}/search/SearchCommunityAjax`;

const RESULTADOS_POR_PAGINA = 10;

// Hasta 10 páginas = hasta aproximadamente 200
// resultados de búsqueda.
const MAX_PAGINAS = 10;

// Pausa entre páginas.
const DELAY_PAGINAS = 300;

// Una sola espera si Steam responde 429.
const DELAY_429 = 2000;

// Comprobaciones Rust simultáneas.
const CONCURRENCIA_RUST = 4;

// Rust AppID.
const RUST_APPID = "252490";

// =====================================================
// USER AGENT
// =====================================================

const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/139.0.0.0 Safari/537.36";

// =====================================================
// CLIENTE STEAM
// =====================================================

const steam = axios.create({
    timeout: 9000,

    headers: {
        "User-Agent": USER_AGENT,

        "Accept-Language":
            "es-ES,es;q=0.9,en;q=0.8",

        "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    },

    validateStatus: () => true
});

// =====================================================
// DELAY
// =====================================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// =====================================================
// LIMPIAR TEXTO
// =====================================================

function limpiarTexto(texto) {
    return String(texto || "")
        .replace(/\s+/g, " ")
        .trim();
}

// =====================================================
// COOKIES
// =====================================================

function obtenerCookies(headers) {
    const setCookie = headers["set-cookie"];

    if (!Array.isArray(setCookie)) {
        return "";
    }

    return setCookie
        .map(cookie => cookie.split(";")[0])
        .join("; ");
}

// =====================================================
// SESIÓN DE STEAM
// =====================================================

async function obtenerSesionSteam() {
    try {
        console.log(
            "[STEAM] Obteniendo sesión de Steam..."
        );

        const respuesta = await steam.get(
            `${STEAM_BASE}/search/users/`,
            {
                headers: {
                    "User-Agent": USER_AGENT,

                    "Accept":
                        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

                    "Referer":
                        `${STEAM_BASE}/`
                }
            }
        );

        if (respuesta.status !== 200) {
            console.log(
                `[STEAM] Error obteniendo sesión: HTTP ${respuesta.status}`
            );

            return null;
        }

        const html =
            String(respuesta.data || "");

        // -------------------------------------------------
        // SESSION ID
        // -------------------------------------------------

        const sessionMatch =
            html.match(
                /g_sessionID\s*=\s*"([^"]+)"/i
            ) ||
            html.match(
                /g_sessionID\s*=\s*'([^']+)'/i
            );

        if (
            !sessionMatch ||
            !sessionMatch[1]
        ) {
            console.log(
                "[STEAM] No se encontró g_sessionID."
            );

            return null;
        }

        const sessionId =
            sessionMatch[1];

        // -------------------------------------------------
        // COOKIES
        // -------------------------------------------------

        let cookies =
            obtenerCookies(
                respuesta.headers
            );

        // -------------------------------------------------
        // ASEGURAR sessionid COMO COOKIE
        // -------------------------------------------------

        if (
            !cookies
                .toLowerCase()
                .includes("sessionid=")
        ) {
            cookies =
                cookies
                    ? `${cookies}; sessionid=${sessionId}`
                    : `sessionid=${sessionId}`;
        }

        console.log(
            "[STEAM] Sesión obtenida correctamente."
        );

        console.log(
            `[STEAM] Cookies disponibles: ${
                cookies ? "Sí" : "No"
            }`
        );

        return {
            sessionId,
            cookies
        };

    } catch (error) {
        console.log(
            "[STEAM] Error obteniendo sesión:",
            error.message
        );

        return null;
    }
}

// =====================================================
// EXTRAER RESULTADOS
// =====================================================

function extraerResultados(html) {
    const resultados = [];

    if (!html) {
        return resultados;
    }

    const $ =
        cheerio.load(html);

    $(".search_row").each(
        (index, element) => {
            const row =
                $(element);

            // -------------------------------------------------
            // URL
            // -------------------------------------------------

            const enlace =
                row
                    .find(
                        "a.searchPersonaName"
                    )
                    .first()
                    .attr("href") ||
                row
                    .find("a")
                    .first()
                    .attr("href");

            if (!enlace) {
                return;
            }

            let profileUrl =
                enlace.trim();

            if (
                profileUrl.startsWith("/")
            ) {
                profileUrl =
                    `${STEAM_BASE}${profileUrl}`;
            }

            profileUrl =
                profileUrl.split("?")[0];

            // -------------------------------------------------
            // NOMBRE
            // -------------------------------------------------

            let nombre =
                limpiarTexto(
                    row
                        .find(
                            "a.searchPersonaName"
                        )
                        .first()
                        .text()
                );

            if (!nombre) {
                nombre =
                    limpiarTexto(
                        row
                            .find(
                                ".searchPersonaName"
                            )
                            .first()
                            .text()
                    );
            }

            if (!nombre) {
                return;
            }

            // -------------------------------------------------
            // STEAMID64
            // -------------------------------------------------

            let steamId = null;

            const idMatch =
                row
                    .html()
                    .match(
                        /\/profiles\/(\d{17})/i
                    );

            if (idMatch) {
                steamId =
                    idMatch[1];
            }

            if (!steamId) {
                const idUrlMatch =
                    profileUrl.match(
                        /\/profiles\/(\d{17})/i
                    );

                if (idUrlMatch) {
                    steamId =
                        idUrlMatch[1];
                }
            }

            // -------------------------------------------------
            // AVATAR
            // -------------------------------------------------

            const avatar =
                row
                    .find("img")
                    .first()
                    .attr("src") ||
                null;

            resultados.push({
                nombre,
                profileUrl,
                steamId,
                avatar,

                rust: false,
                rustConfirmado: false,

                inventarioRust: false,
                inventarioConfirmado: false
            });
        }
    );

    return resultados;
}

// =====================================================
// BUSCAR PÁGINA AJAX
// =====================================================

async function buscarPaginaSteam(
    sesion,
    nombre,
    pagina
) {
    try {
        const respuesta =
            await steam.get(
                STEAM_SEARCH,
                {
                    params: {
                        text: nombre,
                        filter: "users",
                        sessionid:
                            sesion.sessionId,
                        steamid_user:
                            "false",
                        page: pagina
                    },

                    headers: {
                        "User-Agent":
                            USER_AGENT,

                        "Accept":
                            "application/json,text/javascript,*/*;q=0.01",

                        "X-Requested-With":
                            "XMLHttpRequest",

                        "Referer":
                            `${STEAM_BASE}/search/users/?text=${encodeURIComponent(nombre)}`,

                        "Origin":
                            STEAM_BASE,

                        "Cookie":
                            sesion.cookies
                    }
                }
            );

        // =================================================
        // OK
        // =================================================

        if (
            respuesta.status === 200
        ) {
            let html = "";

            if (
                typeof respuesta.data ===
                    "object" &&
                respuesta.data !== null
            ) {
                html =
                    respuesta.data.html ||
                    respuesta.data.results_html ||
                    "";
            } else {
                html =
                    String(
                        respuesta.data || ""
                    );
            }

            const resultados =
                extraerResultados(
                    html
                );

            return {
                ok: true,
                rateLimited: false,
                unauthorized: false,
                resultados
            };
        }

        // =================================================
        // 401
        // =================================================

        if (
            respuesta.status === 401
        ) {
            console.log(
                `[STEAM] Página ${pagina}: HTTP 401`
            );

            return {
                ok: false,
                rateLimited: false,
                unauthorized: true,
                resultados: []
            };
        }

        // =================================================
        // 429
        // =================================================

        if (
            respuesta.status === 429
        ) {
            console.log(
                `[STEAM] Página ${pagina}: HTTP 429`
            );

            return {
                ok: false,
                rateLimited: true,
                unauthorized: false,
                resultados: []
            };
        }

        console.log(
            `[STEAM] Página ${pagina}: HTTP ${respuesta.status}`
        );

        return {
            ok: false,
            rateLimited: false,
            unauthorized: false,
            resultados: []
        };

    } catch (error) {
        console.log(
            `[STEAM] Error página ${pagina}:`,
            error.message
        );

        return {
            ok: false,
            rateLimited:
                error.response?.status === 429,
            unauthorized:
                error.response?.status === 401,
            resultados: []
        };
    }
}

// =====================================================
// FALLBACK PÁGINA NORMAL
// =====================================================
//
// Si AJAX falla, intentamos la búsqueda normal.
// También mandamos las cookies.
//

async function buscarPaginaNormal(
    sesion,
    nombre,
    pagina
) {
    try {
        const url =
            `${STEAM_BASE}/search/users/` +
            `?text=${encodeURIComponent(nombre)}` +
            `&filter=users` +
            `&page=${pagina}`;

        const respuesta =
            await steam.get(
                url,
                {
                    headers: {
                        "User-Agent":
                            USER_AGENT,

                        "Accept":
                            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

                        "Referer":
                            `${STEAM_BASE}/`,

                        "Cookie":
                            sesion.cookies
                    }
                }
            );

        console.log(
            `[STEAM] Fallback página ${pagina}: HTTP ${respuesta.status}`
        );

        if (
            respuesta.status !== 200
        ) {
            return [];
        }

        return extraerResultados(
            String(
                respuesta.data || ""
            )
        );

    } catch (error) {
        console.log(
            `[STEAM] Error fallback página ${pagina}:`,
            error.message
        );

        return [];
    }
}

// =====================================================
// BUSCAR PERFILES EXACTOS
// =====================================================

async function buscarPerfilesExactos(
    nombreBuscado
) {
    console.log(
        `[STEAM] Buscando perfiles con nombre exacto: ${nombreBuscado}`
    );

    const sesion =
        await obtenerSesionSteam();

    if (!sesion) {
        return [];
    }

    const perfiles = [];
    const vistos = new Set();

    let yaReintento429 = false;

    for (
        let pagina = 1;
        pagina <= MAX_PAGINAS;
        pagina++
    ) {
        console.log(
            `[STEAM] Buscando página ${pagina}`
        );

        let resultado =
            await buscarPaginaSteam(
                sesion,
                nombreBuscado,
                pagina
            );

        // =================================================
        // 401
        // =================================================

        if (
            resultado.unauthorized
        ) {
            console.log(
                "[STEAM] Steam rechazó la petición AJAX (401)."
            );

            console.log(
                "[STEAM] Intentando búsqueda normal..."
            );

            const fallback =
                await buscarPaginaNormal(
                    sesion,
                    nombreBuscado,
                    pagina
                );

            resultado = {
                ok: fallback.length > 0,
                rateLimited: false,
                unauthorized: false,
                resultados: fallback
            };
        }

        // =================================================
        // 429
        // =================================================

        if (
            resultado.rateLimited
        ) {
            if (
                !yaReintento429
            ) {
                yaReintento429 =
                    true;

                console.log(
                    `[STEAM] Esperando ${DELAY_429}ms por rate limit...`
                );

                await sleep(
                    DELAY_429
                );

                pagina--;

                continue;
            }

            console.log(
                "[STEAM] Steam sigue limitando peticiones. " +
                "Terminando búsqueda."
            );

            break;
        }

        yaReintento429 =
            false;

        const resultados =
            resultado.resultados ||
            [];

        console.log(
            `[STEAM] Resultados página ${pagina}: ${resultados.length}`
        );

        // =================================================
        // SIN RESULTADOS
        // =================================================

        if (
            resultados.length === 0
        ) {
            break;
        }

        // =================================================
        // NOMBRE EXACTO
        // =================================================

        for (
            const perfil
            of resultados
        ) {
            // EXACTAMENTE igual.
            //
            // papito  -> papito ✅
            // Papito  -> NO ❌
            // papito1 -> NO ❌
            // the papito -> NO ❌

            if (
                perfil.nombre !==
                nombreBuscado
            ) {
                continue;
            }

            const id =
                perfil.steamId ||
                perfil.profileUrl;

            if (!id) {
                continue;
            }

            if (
                vistos.has(id)
            ) {
                continue;
            }

            vistos.add(id);

            perfiles.push(
                perfil
            );

            console.log(
                `[STEAM] Coincidencia exacta: ` +
                `${perfil.nombre} -> ${perfil.profileUrl}`
            );
        }

        // =================================================
        // MENOS DE 20 = ÚLTIMA PÁGINA
        // =================================================

        if (
            resultados.length < 20
        ) {
            break;
        }

        await sleep(
            DELAY_PAGINAS
        );
    }

    console.log(
        `[STEAM] RESULTADO FINAL: ${perfiles.length} coincidencias exactas.`
    );

    return perfiles;
}

// =====================================================
// BATTLEMETRICS URL
// =====================================================

function esBattleMetrics(
    texto
) {
    return /^https?:\/\/(?:www\.)?battlemetrics\.com\/players\/\d+/i.test(
        texto
    );
}

// =====================================================
// NOMBRE BATTLEMETRICS
// =====================================================

async function obtenerNombreBattleMetrics(
    url
) {
    try {
        console.log(
            `[BATTLEMETRICS] Abriendo: ${url}`
        );

        const respuesta =
            await axios.get(
                url,
                {
                    timeout: 10000,

                    headers: {
                        "User-Agent":
                            USER_AGENT
                    },

                    validateStatus:
                        () => true
                }
            );

        if (
            respuesta.status !== 200
        ) {
            console.log(
                `[BATTLEMETRICS] HTTP ${respuesta.status}`
            );

            return null;
        }

        const $ =
            cheerio.load(
                respuesta.data
            );

        let nombre = null;

        // H1
        const h1 =
            limpiarTexto(
                $("h1")
                    .first()
                    .text()
            );

        if (h1) {
            nombre = h1;
        }

        // TITLE
        if (!nombre) {
            const title =
                limpiarTexto(
                    $("title")
                        .first()
                        .text()
                );

            if (title) {
                nombre =
                    title
                        .split(" - ")[0]
                        .trim();
            }
        }

        // META
        if (!nombre) {
            const description =
                limpiarTexto(
                    $('meta[name="description"]')
                        .attr("content")
                );

            if (description) {
                const match =
                    description.match(
                        /^(.+?)\s+(?:on|en)\s+BattleMetrics/i
                    );

                if (match) {
                    nombre =
                        limpiarTexto(
                            match[1]
                        );
                }
            }
        }

        if (!nombre) {
            return null;
        }

        console.log(
            `[BATTLEMETRICS] Nombre detectado: ${nombre}`
        );

        return nombre;

    } catch (error) {
        console.log(
            "[BATTLEMETRICS] Error:",
            error.message
        );

        return null;
    }
}

// =====================================================
// COMPROBAR RUST
// =====================================================
//
// SOLO UNA PETICIÓN POR PERFIL.
//
// #252490_... = inventario/skins de Rust.
// Si Steam da 403 al inventario NO importa.
//

async function comprobarRust(
    perfil
) {
    try {
        const respuesta =
            await steam.get(
                perfil.profileUrl,
                {
                    timeout: 7000,

                    headers: {
                        "User-Agent":
                            USER_AGENT,

                        "Referer":
                            `${STEAM_BASE}/`,

                        "Accept":
                            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
                    }
                }
            );

        if (
            respuesta.status !== 200
        ) {
            perfil.rust = false;
            perfil.rustConfirmado = false;

            perfil.inventarioRust = false;
            perfil.inventarioConfirmado = false;

            console.log(
                `[RUST] ${perfil.nombre}: No confirmado (HTTP ${respuesta.status})`
            );

            return perfil;
        }

        const html =
            String(
                respuesta.data || ""
            ).toLowerCase();

        // =================================================
        // INVENTARIO
        // =================================================

        const tieneInventario =
            html.includes(
                "#252490_"
            ) ||
            html.includes(
                `/inventory/${RUST_APPID}`
            ) ||
            html.includes(
                `/gamecards/${RUST_APPID}`
            ) ||
            html.includes(
                `/app/${RUST_APPID}`
            ) ||
            (
                html.includes(
                    "/inventory/"
                ) &&
                html.includes(
                    `/${RUST_APPID}`
                )
            );

        // =================================================
        // RUST
        // =================================================

        const tieneRust =
            tieneInventario ||
            html.includes(
                ">rust<"
            ) ||
            html.includes(
                "rust™"
            ) ||
            html.includes(
                `appid=${RUST_APPID}`
            ) ||
            html.includes(
                `app/${RUST_APPID}`
            ) ||
            html.includes(
                `gamecards/${RUST_APPID}`
            );

        // =================================================
        // RUST + INVENTARIO
        // =================================================

        if (
            tieneInventario
        ) {
            perfil.rust = true;
            perfil.rustConfirmado = true;

            perfil.inventarioRust = true;
            perfil.inventarioConfirmado = true;

            console.log(
                `[RUST] ${perfil.nombre}: Sí + INVENTARIO`
            );

            return perfil;
        }

        // =================================================
        // SOLO RUST
        // =================================================

        if (
            tieneRust
        ) {
            perfil.rust = true;
            perfil.rustConfirmado = true;

            perfil.inventarioRust = false;
            perfil.inventarioConfirmado = false;

            console.log(
                `[RUST] ${perfil.nombre}: Sí`
            );

            return perfil;
        }

        // =================================================
        // DESCONOCIDO
        // =================================================

        perfil.rust = false;
        perfil.rustConfirmado = false;

        perfil.inventarioRust = false;
        perfil.inventarioConfirmado = false;

        console.log(
            `[RUST] ${perfil.nombre}: No confirmado`
        );

        return perfil;

    } catch (error) {
        perfil.rust = false;
        perfil.rustConfirmado = false;

        perfil.inventarioRust = false;
        perfil.inventarioConfirmado = false;

        console.log(
            `[RUST] ${perfil.nombre}: No confirmado`
        );

        return perfil;
    }
}

// =====================================================
// RUST EN PARALELO
// =====================================================

async function comprobarRustTodos(
    perfiles
) {
    let indice = 0;

    async function trabajador() {
        while (true) {
            const posicion =
                indice++;

            if (
                posicion >=
                perfiles.length
            ) {
                return;
            }

            await comprobarRust(
                perfiles[posicion]
            );
        }
    }

    const trabajadores = [];

    const cantidad =
        Math.min(
            CONCURRENCIA_RUST,
            perfiles.length
        );

    for (
        let i = 0;
        i < cantidad;
        i++
    ) {
        trabajadores.push(
            trabajador()
        );
    }

    await Promise.all(
        trabajadores
    );

    return perfiles;
}

// =====================================================
// ORDENAR
// =====================================================

function ordenarPerfiles(
    perfiles
) {
    perfiles.sort(
        (a, b) => {
            const prioridad =
                perfil => {
                    if (
                        perfil.rustConfirmado &&
                        perfil.inventarioConfirmado
                    ) {
                        return 3;
                    }

                    if (
                        perfil.rustConfirmado
                    ) {
                        return 2;
                    }

                    return 1;
                };

            return (
                prioridad(b) -
                prioridad(a)
            );
        }
    );

    return perfiles;
}

// =====================================================
// EMBED
// =====================================================

function crearEmbed(
    perfiles,
    pagina,
    nombreBuscado,
    comprobando
) {
    const inicio =
        pagina *
        RESULTADOS_POR_PAGINA;

    const lista =
        perfiles.slice(
            inicio,
            inicio +
                RESULTADOS_POR_PAGINA
        );

    const totalPaginas =
        Math.max(
            1,
            Math.ceil(
                perfiles.length /
                    RESULTADOS_POR_PAGINA
            )
        );

    const embed =
        new EmbedBuilder()
            .setTitle(
                `🔎 Steam: ${nombreBuscado}`
            )
            .setDescription(
                `Coincidencias exactas: **${perfiles.length}**`
            )
            .setColor(
                0x1b2838
            )
            .setFooter({
                text:
                    `Página ${pagina + 1}/${totalPaginas}` +
                    (
                        comprobando
                            ? " • Comprobando Rust..."
                            : ""
                    )
            });

    for (
        let i = 0;
        i < lista.length;
        i++
    ) {
        const perfil =
            lista[i];

        const numero =
            inicio + i + 1;

        const rust =
            perfil.rustConfirmado
                ? "🎮 Rust: **Sí**"
                : "🎮 Rust: **No confirmado**";

        const inventario =
            perfil.inventarioConfirmado
                ? "🎒 Inventario/skins de Rust: **Sí**"
                : "🎒 Inventario/skins de Rust: **No confirmado**";

        const steamId =
            perfil.steamId
                ? `\n🆔 SteamID64: \`${perfil.steamId}\``
                : "";

        embed.addFields({
            name:
                `${numero}. ${perfil.nombre}`,

            value:
                `🔗 [Perfil de Steam](${perfil.profileUrl})` +
                steamId +
                `\n${rust}` +
                `\n${inventario}`
        });
    }

    return embed;
}

// =====================================================
// BOTONES
// =====================================================

function crearBotones(
    pagina,
    totalPaginas,
    deshabilitados = false
) {
    const anterior =
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
                deshabilitados ||
                pagina <= 0
            );

    const siguiente =
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
                deshabilitados ||
                pagina >=
                    totalPaginas - 1
            );

    return new ActionRowBuilder()
        .addComponents(
            anterior,
            siguiente
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
                        .setName("nombre")
                        .setDescription(
                            "Nombre exacto de Steam o URL de BattleMetrics"
                        )
                        .setRequired(true)
            ),

    async execute(
        interaction
    ) {
        console.log(
            "🎯 Ejecutando /steam"
        );

        let entrada =
            interaction.options.getString(
                "nombre"
            );

        if (!entrada) {
            return interaction.reply({
                content:
                    "❌ Debes indicar un nombre.",
                ephemeral: true
            });
        }

        entrada =
            entrada.trim();

        console.log(
            `[STEAM] Entrada recibida: ${entrada}`
        );

        // =================================================
        // BATTLEMETRICS
        // =================================================

        let nombreBuscado =
            entrada;

        if (
            esBattleMetrics(
                entrada
            )
        ) {
            console.log(
                "[STEAM] URL de BattleMetrics detectada."
            );

            const nombre =
                await obtenerNombreBattleMetrics(
                    entrada
                );

            if (!nombre) {
                return interaction.reply({
                    content:
                        "❌ No pude obtener el nombre del jugador desde BattleMetrics.",
                    ephemeral: true
                });
            }

            nombreBuscado =
                nombre.trim();

            console.log(
                `[STEAM] Nombre de BattleMetrics: ${nombreBuscado}`
            );
        }

        // =================================================
        // BUSCAR
        // =================================================

        const perfiles =
            await buscarPerfilesExactos(
                nombreBuscado
            );

        // =================================================
        // SIN RESULTADOS
        // =================================================

        if (
            perfiles.length === 0
        ) {
            console.log(
                "[STEAM] No se encontraron coincidencias."
            );

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(
                            "🔎 Steam"
                        )
                        .setDescription(
                            `No encontré perfiles con el nombre exacto:\n\n` +
                            `\`${nombreBuscado}\``
                        )
                        .setColor(
                            0x1b2838
                        )
                ]
            });
        }

        // =================================================
        // RESPONDER INMEDIATAMENTE
        // =================================================

        let paginaActual = 0;

        let totalPaginas =
            Math.ceil(
                perfiles.length /
                    RESULTADOS_POR_PAGINA
            );

        const mensaje =
            await interaction.reply({
                embeds: [
                    crearEmbed(
                        perfiles,
                        paginaActual,
                        nombreBuscado,
                        true
                    )
                ],

                components: [
                    crearBotones(
                        paginaActual,
                        totalPaginas
                    )
                ],

                fetchReply: true
            });

        // =================================================
        // RUST EN SEGUNDO PLANO
        // =================================================

        comprobarRustTodos(
            perfiles
        )
            .then(
                async () => {
                    ordenarPerfiles(
                        perfiles
                    );

                    totalPaginas =
                        Math.ceil(
                            perfiles.length /
                                RESULTADOS_POR_PAGINA
                        );

                    if (
                        paginaActual >=
                        totalPaginas
                    ) {
                        paginaActual = 0;
                    }

                    console.log(
                        `[STEAM] Rust confirmado: ${
                            perfiles.filter(
                                p =>
                                    p.rustConfirmado
                            ).length
                        }`
                    );

                    console.log(
                        `[STEAM] Rust no confirmado: ${
                            perfiles.filter(
                                p =>
                                    !p.rustConfirmado
                            ).length
                        }`
                    );

                    try {
                        await interaction.editReply({
                            embeds: [
                                crearEmbed(
                                    perfiles,
                                    paginaActual,
                                    nombreBuscado,
                                    false
                                )
                            ],

                            components: [
                                crearBotones(
                                    paginaActual,
                                    totalPaginas
                                )
                            ]
                        });

                    } catch (error) {
                        console.log(
                            "[STEAM] Error actualizando resultados:",
                            error.message
                        );
                    }
                }
            )
            .catch(
                error => {
                    console.log(
                        "[STEAM] Error Rust:",
                        error.message
                    );
                }
            );

        // =================================================
        // PAGINACIÓN
        // =================================================

        const collector =
            mensaje.createMessageComponentCollector({
                time: 120000
            });

        collector.on(
            "collect",
            async button => {
                if (
                    button.user.id !==
                    interaction.user.id
                ) {
                    return button.reply({
                        content:
                            "❌ Solo la persona que ejecutó el comando puede usar estos botones.",
                        ephemeral: true
                    });
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
                        totalPaginas - 1
                    ) {
                        paginaActual++;
                    }
                }

                await button.update({
                    embeds: [
                        crearEmbed(
                            perfiles,
                            paginaActual,
                            nombreBuscado,
                            false
                        )
                    ],

                    components: [
                        crearBotones(
                            paginaActual,
                            totalPaginas
                        )
                    ]
                });
            }
        );

        // =================================================
        // FINALIZAR
        // =================================================

        collector.on(
            "end",
            async () => {
                try {
                    await interaction.editReply({
                        components: [
                            crearBotones(
                                paginaActual,
                                totalPaginas,
                                true
                            )
                        ]
                    });
                } catch (error) {
                    console.log(
                        "[STEAM] Error desactivando botones:",
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