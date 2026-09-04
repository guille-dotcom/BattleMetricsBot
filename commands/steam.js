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
const STEAM_SEARCH_PAGE = `${STEAM_BASE}/search/users/`;
const STEAM_SEARCH_AJAX = `${STEAM_BASE}/search/SearchCommunityAjax`;

const RESULTADOS_POR_PAGINA = 10;
const MAX_PAGINAS = 10;

const DELAY_PAGINAS = 1500;
const DELAY_429 = 15000;

const RUST_APPID = "252490";
const CONCURRENCIA_RUST = 3;

// =====================================================
// AXIOS
// =====================================================

const steam = axios.create({
    timeout: 20000,
    maxRedirects: 5,
    validateStatus: () => true,

    headers: {
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/139.0.0.0 Safari/537.36",

        "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9," +
            "image/avif,image/webp,image/apng,*/*;q=0.8",

        "Accept-Language":
            "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7",

        "Accept-Encoding":
            "gzip, deflate, br",

        "Connection": "keep-alive"
    }
});

// =====================================================
// UTILIDADES
// =====================================================

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function limpiarTexto(texto) {
    return String(texto || "")
        .replace(/\s+/g, " ")
        .trim();
}

function extraerSteamID(url) {
    if (!url) return null;

    const match = url.match(
        /steamcommunity\.com\/profiles\/(\d{17})/i
    );

    return match ? match[1] : null;
}

// =====================================================
// OBTENER SESIÓN + COOKIES
// =====================================================

async function obtenerSesionSteam(nombre) {
    console.log("[STEAM] Obteniendo sesión de Steam...");

    const url =
        `${STEAM_SEARCH_PAGE}?text=${encodeURIComponent(nombre)}&filter=users`;

    const respuesta = await steam.get(url);

    const cookies = {};

    const setCookie = respuesta.headers["set-cookie"];

    if (Array.isArray(setCookie)) {
        for (const cookie of setCookie) {
            const parte = cookie.split(";")[0];
            const indice = parte.indexOf("=");

            if (indice !== -1) {
                const key = parte.substring(0, indice);
                const value = parte.substring(indice + 1);

                cookies[key] = value;
            }
        }
    }

    const html = String(respuesta.data || "");

    let sessionId = null;

    const matchSession =
        html.match(/g_sessionID\s*=\s*["']([^"']+)["']/i);

    if (matchSession) {
        sessionId = matchSession[1];
    }

    if (!sessionId && cookies.sessionid) {
        sessionId = cookies.sessionid;
    }

    if (!sessionId) {
        sessionId = "";
    }

    console.log("[STEAM] Sesión obtenida correctamente.");
    console.log(
        `[STEAM] Cookies disponibles: ${Object.keys(cookies).length > 0 ? "Sí" : "No"}`
    );

    return {
        sessionId,
        cookies
    };
}

// =====================================================
// COOKIE HEADER
// =====================================================

function construirCookieHeader(cookies, sessionId) {
    const lista = [];

    for (const [key, value] of Object.entries(cookies || {})) {
        if (value !== undefined && value !== null) {
            lista.push(`${key}=${value}`);
        }
    }

    if (
        sessionId &&
        !Object.prototype.hasOwnProperty.call(cookies || {}, "sessionid")
    ) {
        lista.push(`sessionid=${sessionId}`);
    }

    return lista.join("; ");
}

// =====================================================
// EXTRAER RESULTADOS DE HTML
// =====================================================

function extraerResultados(html) {
    const resultados = [];

    if (!html) {
        return resultados;
    }

    const $ = cheerio.load(html);

    $(".search_row").each((index, elemento) => {
        const row = $(elemento);

        const enlace =
            row.find("a.searchPersonaName").first();

        const nombre = limpiarTexto(enlace.text());

        let url = enlace.attr("href") || "";

        if (!url) {
            const cualquierEnlace =
                row.find("a").filter((i, el) => {
                    const href = $(el).attr("href") || "";

                    return href.includes("steamcommunity.com/");
                }).first();

            url = cualquierEnlace.attr("href") || "";
        }

        if (!nombre || !url) {
            return;
        }

        if (url.startsWith("//")) {
            url = "https:" + url;
        }

        if (url.startsWith("/")) {
            url = STEAM_BASE + url;
        }

        const steamID64 = extraerSteamID(url);

        resultados.push({
            nombre,
            url,
            steamID64
        });
    });

    // =================================================
    // SEGUNDO MÉTODO DE EXTRACCIÓN
    // =================================================

    if (resultados.length === 0) {
        $("a").each((index, elemento) => {
            const enlace = $(elemento);

            const href = enlace.attr("href") || "";

            if (
                !href.includes("steamcommunity.com/id/") &&
                !href.includes("steamcommunity.com/profiles/")
            ) {
                return;
            }

            const nombre =
                limpiarTexto(enlace.find("span").text()) ||
                limpiarTexto(enlace.text());

            if (!nombre) {
                return;
            }

            let url = href;

            if (url.startsWith("//")) {
                url = "https:" + url;
            }

            if (url.startsWith("/")) {
                url = STEAM_BASE + url;
            }

            const steamID64 = extraerSteamID(url);

            resultados.push({
                nombre,
                url,
                steamID64
            });
        });
    }

    // =================================================
    // ELIMINAR DUPLICADOS
    // =================================================

    const vistos = new Set();

    return resultados.filter(perfil => {
        const clave =
            perfil.steamID64 ||
            perfil.url.toLowerCase();

        if (vistos.has(clave)) {
            return false;
        }

        vistos.add(clave);

        return true;
    });
}

// =====================================================
// BUSCAR MEDIANTE PÁGINA NORMAL
// =====================================================

async function buscarPaginaNormal(nombre, pagina) {
    const url =
        `${STEAM_SEARCH_PAGE}` +
        `?text=${encodeURIComponent(nombre)}` +
        `&filter=users` +
        `&page=${pagina}`;

    console.log(`[STEAM] Página normal ${pagina}`);

    const respuesta = await steam.get(url);

    console.log(
        `[STEAM] Página normal ${pagina}: HTTP ${respuesta.status}`
    );

    if (respuesta.status === 429) {
        return {
            rateLimited: true,
            resultados: []
        };
    }

    if (respuesta.status !== 200) {
        return {
            rateLimited: false,
            resultados: []
        };
    }

    const resultados =
        extraerResultados(String(respuesta.data || ""));

    console.log(
        `[STEAM] Resultados encontrados en HTML: ${resultados.length}`
    );

    return {
        rateLimited: false,
        resultados
    };
}

// =====================================================
// BUSCAR MEDIANTE AJAX
// =====================================================

async function buscarPaginaAjax(nombre, pagina, sesion) {
    const cookies =
        construirCookieHeader(
            sesion.cookies,
            sesion.sessionId
        );

    const parametros = {
        text: nombre,
        filter: "users",
        sessionid: sesion.sessionId,
        steamid_user: "false",
        page: pagina
    };

    const respuesta = await steam.get(
        STEAM_SEARCH_AJAX,
        {
            params: parametros,

            headers: {
                "X-Requested-With": "XMLHttpRequest",
                "Referer":
                    `${STEAM_SEARCH_PAGE}?text=${encodeURIComponent(nombre)}&filter=users`,
                "Origin": STEAM_BASE,
                "Cookie": cookies,

                "Accept":
                    "application/json, text/javascript, */*; q=0.01"
            }
        }
    );

    console.log(
        `[STEAM] AJAX página ${pagina}: HTTP ${respuesta.status}`
    );

    if (respuesta.status === 429) {
        return {
            rateLimited: true,
            resultados: []
        };
    }

    if (respuesta.status !== 200) {
        return {
            rateLimited: false,
            resultados: []
        };
    }

    let html = "";

    if (typeof respuesta.data === "string") {
        html = respuesta.data;
    } else if (respuesta.data) {
        html =
            respuesta.data.html ||
            respuesta.data.results_html ||
            respuesta.data.results ||
            "";
    }

    const resultados =
        extraerResultados(html);

    return {
        rateLimited: false,
        resultados
    };
}

// =====================================================
// FILTRAR NOMBRE EXACTO
// =====================================================

function filtrarNombreExacto(resultados, nombreBuscado) {
    return resultados.filter(perfil => {
        return perfil.nombre === nombreBuscado;
    });
}

// =====================================================
// BUSCAR TODOS LOS PERFILES EXACTOS
// =====================================================

async function buscarPerfilesExactos(nombreBuscado) {
    console.log(
        `[STEAM] Buscando perfiles con nombre exacto: ${nombreBuscado}`
    );

    const perfiles = [];
    const vistos = new Set();

    // =================================================
    // PRIMERO: PÁGINA NORMAL
    // =================================================

    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
        let respuesta;

        try {
            respuesta =
                await buscarPaginaNormal(
                    nombreBuscado,
                    pagina
                );
        } catch (error) {
            console.log(
                `[STEAM] Error página normal ${pagina}: ${error.message}`
            );

            respuesta = {
                rateLimited: false,
                resultados: []
            };
        }

        if (respuesta.rateLimited) {
            console.log(
                `[STEAM] Steam está limitando la búsqueda normal.`
            );

            break;
        }

        const exactos =
            filtrarNombreExacto(
                respuesta.resultados,
                nombreBuscado
            );

        for (const perfil of exactos) {
            const clave =
                perfil.steamID64 ||
                perfil.url.toLowerCase();

            if (!vistos.has(clave)) {
                vistos.add(clave);
                perfiles.push(perfil);
            }
        }

        // Si no hay resultados en esta página,
        // no seguimos haciendo peticiones innecesarias.
        if (respuesta.resultados.length === 0) {
            break;
        }

        if (pagina < MAX_PAGINAS) {
            await esperar(DELAY_PAGINAS);
        }
    }

    // =================================================
    // SI LA PÁGINA NORMAL NO FUNCIONÓ,
    // USAMOS AJAX SOLO UNA VEZ POR PÁGINA
    // =================================================

    if (perfiles.length === 0) {
        console.log(
            "[STEAM] La búsqueda normal no encontró resultados."
        );

        console.log(
            "[STEAM] Intentando método AJAX..."
        );

        try {
            const sesion =
                await obtenerSesionSteam(nombreBuscado);

            for (
                let pagina = 1;
                pagina <= MAX_PAGINAS;
                pagina++
            ) {
                const respuesta =
                    await buscarPaginaAjax(
                        nombreBuscado,
                        pagina,
                        sesion
                    );

                if (respuesta.rateLimited) {
                    console.log(
                        "[STEAM] AJAX también está limitado por Steam."
                    );

                    break;
                }

                const exactos =
                    filtrarNombreExacto(
                        respuesta.resultados,
                        nombreBuscado
                    );

                for (const perfil of exactos) {
                    const clave =
                        perfil.steamID64 ||
                        perfil.url.toLowerCase();

                    if (!vistos.has(clave)) {
                        vistos.add(clave);
                        perfiles.push(perfil);
                    }
                }

                if (
                    respuesta.resultados.length === 0
                ) {
                    break;
                }

                if (pagina < MAX_PAGINAS) {
                    await esperar(DELAY_PAGINAS);
                }
            }
        } catch (error) {
            console.log(
                `[STEAM] Error en método AJAX: ${error.message}`
            );
        }
    }

    console.log(
        `[STEAM] RESULTADO FINAL: ${perfiles.length} coincidencias exactas.`
    );

    return perfiles;
}

// =====================================================
// EXTRAER NOMBRE DESDE BATTLEMETRICS
// =====================================================

async function obtenerNombreBattleMetrics(url) {
    console.log(
        `[BATTLEMETRICS] Obteniendo jugador desde: ${url}`
    );

    try {
        const respuesta = await axios.get(url, {
            timeout: 15000,
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                    "AppleWebKit/537.36 (KHTML, like Gecko) " +
                    "Chrome/139.0.0.0 Safari/537.36"
            },
            validateStatus: () => true
        });

        if (respuesta.status !== 200) {
            console.log(
                `[BATTLEMETRICS] HTTP ${respuesta.status}`
            );
        }

        const $ =
            cheerio.load(
                String(respuesta.data || "")
            );

        let nombre = "";

        const h1 =
            $("h1").first().text();

        if (h1) {
            nombre = limpiarTexto(h1);
        }

        if (!nombre) {
            const title =
                $("title").first().text();

            nombre =
                limpiarTexto(
                    title
                        .replace(
                            /\s*-\s*BattleMetrics.*$/i,
                            ""
                        )
                );
        }

        if (!nombre) {
            const meta =
                $('meta[name="description"]')
                    .attr("content");

            if (meta) {
                nombre =
                    limpiarTexto(
                        meta
                            .replace(
                                /^.*?player\s*/i,
                                ""
                            )
                    );
            }
        }

        if (nombre) {
            console.log(
                `[BATTLEMETRICS] Nombre detectado: ${nombre}`
            );
        }

        return nombre;
    } catch (error) {
        console.log(
            `[BATTLEMETRICS] Error: ${error.message}`
        );

        return null;
    }
}

// =====================================================
// DETECTAR RUST
// =====================================================

function analizarRustHTML(html) {
    if (!html) {
        return {
            rust: false,
            inventario: false
        };
    }

    const texto = html.toLowerCase();

    // =================================================
    // INVENTARIO / SKINS DE RUST
    // =================================================

    const inventario =
        texto.includes(`#${RUST_APPID}_`) ||
        texto.includes(`/inventory/${RUST_APPID}`) ||
        texto.includes(`/gamecards/${RUST_APPID}`) ||
        texto.includes(`/app/${RUST_APPID}`) ||
        texto.includes(`inventory/#${RUST_APPID}`) ||
        texto.includes(`inventory/#${RUST_APPID}_`);

    // =================================================
    // RUST EN PERFIL
    // =================================================

    const rust =
        inventario ||
        texto.includes("appid=252490") ||
        texto.includes('"appid":252490') ||
        texto.includes("'appid':252490") ||
        texto.includes("rust™") ||
        texto.includes(">rust<") ||
        texto.includes("rust -") ||
        texto.includes("rust |");

    return {
        rust,
        inventario
    };
}

// =====================================================
// COMPROBAR RUST EN UN PERFIL
// =====================================================

async function comprobarRust(perfil) {
    console.log(
        `[RUST] Comprobando: ${perfil.nombre} - ${perfil.url}`
    );

    try {
        const respuesta =
            await steam.get(
                perfil.url,
                {
                    timeout: 15000,
                    headers: {
                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                            "AppleWebKit/537.36 (KHTML, like Gecko) " +
                            "Chrome/139.0.0.0 Safari/537.36",

                        "Accept-Language":
                            "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7",

                        "Accept-Encoding":
                            "gzip, deflate, br"
                    }
                }
            );

        if (respuesta.status !== 200) {
            console.log(
                `[RUST] HTTP ${respuesta.status} para ${perfil.nombre}`
            );

            return {
                ...perfil,
                rust: null,
                inventarioRust: null
            };
        }

        const resultado =
            analizarRustHTML(
                String(respuesta.data || "")
            );

        console.log(
            `[RUST] ${perfil.nombre} -> Rust: ${resultado.rust ? "Sí" : "No confirmado"} | Inventario: ${resultado.inventario ? "Sí" : "No confirmado"}`
        );

        return {
            ...perfil,
            rust: resultado.rust,
            inventarioRust: resultado.inventario
        };
    } catch (error) {
        console.log(
            `[RUST] Error ${perfil.nombre}: ${error.message}`
        );

        return {
            ...perfil,
            rust: null,
            inventarioRust: null
        };
    }
}

// =====================================================
// COMPROBAR RUST CON CONCURRENCIA
// =====================================================

async function comprobarRustTodos(perfiles) {
    const resultados = new Array(perfiles.length);

    let siguiente = 0;

    async function trabajador() {
        while (true) {
            const indice = siguiente++;

            if (indice >= perfiles.length) {
                return;
            }

            resultados[indice] =
                await comprobarRust(
                    perfiles[indice]
                );
        }
    }

    const trabajadores = [];

    const cantidad =
        Math.min(
            CONCURRENCIA_RUST,
            perfiles.length
        );

    for (let i = 0; i < cantidad; i++) {
        trabajadores.push(
            trabajador()
        );
    }

    await Promise.all(trabajadores);

    return resultados;
}

// =====================================================
// ORDENAR RESULTADOS
// =====================================================

function ordenarPerfiles(perfiles) {
    return [...perfiles].sort((a, b) => {
        function prioridad(perfil) {
            if (
                perfil.rust === true &&
                perfil.inventarioRust === true
            ) {
                return 3;
            }

            if (perfil.rust === true) {
                return 2;
            }

            return 1;
        }

        return prioridad(b) - prioridad(a);
    });
}

// =====================================================
// TEXTO DE RESULTADO
// =====================================================

function crearDescripcion(perfil, numero) {
    let texto =
        `**${numero}. ${perfil.nombre}**\n`;

    texto +=
        `🔗 ${perfil.url}\n`;

    if (perfil.steamID64) {
        texto +=
            `🆔 SteamID64: \`${perfil.steamID64}\`\n`;
    } else {
        texto +=
            `🆔 SteamID64: No disponible\n`;
    }

    // =================================================
    // RUST
    // =================================================

    if (perfil.rust === true) {
        texto +=
            `🎮 Rust: **Sí**\n`;
    } else {
        texto +=
            `🎮 Rust: **No confirmado**\n`;
    }

    // =================================================
    // INVENTARIO
    // =================================================

    if (perfil.inventarioRust === true) {
        texto +=
            `🎒 Inventario/skins de Rust: **Sí**\n`;
    } else {
        texto +=
            `🎒 Inventario/skins de Rust: **No confirmado**\n`;
    }

    return texto;
}

// =====================================================
// EMBED
// =====================================================

function crearEmbed(perfiles, pagina, total, nombreBuscado) {
    const inicio =
        pagina * RESULTADOS_POR_PAGINA;

    const paginaPerfiles =
        perfiles.slice(
            inicio,
            inicio + RESULTADOS_POR_PAGINA
        );

    const embed =
        new EmbedBuilder()
            .setTitle(
                `🔎 Steam — "${nombreBuscado}"`
            )
            .setDescription(
                paginaPerfiles
                    .map((perfil, index) =>
                        crearDescripcion(
                            perfil,
                            inicio + index + 1
                        )
                    )
                    .join("\n")
            )
            .setFooter({
                text:
                    `Página ${pagina + 1}/${Math.ceil(total / RESULTADOS_POR_PAGINA)} • ${total} coincidencias exactas`
            });

    return embed;
}

// =====================================================
// BOTONES
// =====================================================

function crearBotones(pagina, total, usuarioId) {
    const totalPaginas =
        Math.ceil(
            total / RESULTADOS_POR_PAGINA
        );

    const anterior =
        new ButtonBuilder()
            .setCustomId(
                `steam_anterior_${usuarioId}`
            )
            .setLabel("Anterior")
            .setEmoji("⬅️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(pagina <= 0);

    const siguiente =
        new ButtonBuilder()
            .setCustomId(
                `steam_siguiente_${usuarioId}`
            )
            .setLabel("Siguiente")
            .setEmoji("➡️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(
                pagina >= totalPaginas - 1
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
    data: new SlashCommandBuilder()
        .setName("steam")
        .setDescription(
            "Busca perfiles de Steam por nombre exacto"
        )
        .addStringOption(option =>
            option
                .setName("nombre")
                .setDescription(
                    "Nombre exacto de Steam o URL de BattleMetrics"
                )
                .setRequired(true)
        ),

    async execute(interaction) {
        console.log("🎯 Ejecutando /steam");

        const entrada =
            interaction.options
                .getString("nombre")
                .trim();

        console.log(
            `[STEAM] Entrada recibida: ${entrada}`
        );

        await interaction.deferReply();

        let nombreBuscado =
            entrada;

        // =================================================
        // BATTLEMETRICS
        // =================================================

        if (
            entrada.includes("battlemetrics.com/players/")
        ) {
            const nombreBM =
                await obtenerNombreBattleMetrics(
                    entrada
                );

            if (!nombreBM) {
                await interaction.editReply({
                    content:
                        "❌ No pude obtener el nombre del jugador desde BattleMetrics."
                });

                return;
            }

            nombreBuscado =
                nombreBM;
        }

        // =================================================
        // BUSCAR STEAM
        // =================================================

        const perfiles =
            await buscarPerfilesExactos(
                nombreBuscado
            );

        if (perfiles.length === 0) {
            await interaction.editReply({
                content:
                    `❌ No se encontraron perfiles de Steam con el nombre exacto **${nombreBuscado}**.\n\n` +
                    `Si Steam está devolviendo **429**, significa que Steam está limitando temporalmente las peticiones desde la conexión/IP.`
            });

            console.log(
                "[STEAM] No se encontraron coincidencias."
            );

            console.log(
                "✅ /steam terminado"
            );

            return;
        }

        // =================================================
        // RESPUESTA INICIAL
        // =================================================

        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setTitle(
                        `🔎 Buscando "${nombreBuscado}"...`
                    )
                    .setDescription(
                        `Encontré **${perfiles.length}** coincidencias exactas.\n\n` +
                        `⏳ Comprobando cuáles tienen Rust...`
                    )
            ]
        });

        // =================================================
        // COMPROBAR RUST
        // =================================================

        const perfilesComprobados =
            await comprobarRustTodos(
                perfiles
            );

        // =================================================
        // ORDENAR
        // =================================================

        const perfilesOrdenados =
            ordenarPerfiles(
                perfilesComprobados
            );

        // =================================================
        // PAGINACIÓN
        // =================================================

        let pagina = 0;

        const total =
            perfilesOrdenados.length;

        const actualizar =
            async () => {
                await interaction.editReply({
                    embeds: [
                        crearEmbed(
                            perfilesOrdenados,
                            pagina,
                            total,
                            nombreBuscado
                        )
                    ],

                    components: [
                        crearBotones(
                            pagina,
                            total,
                            interaction.user.id
                        )
                    ]
                });
            };

        await actualizar();

        // =================================================
        // COLLECTOR
        // =================================================

        const mensaje =
            await interaction.fetchReply();

        const collector =
            mensaje.createMessageComponentCollector({
                time: 120000
            });

        collector.on(
            "collect",
            async boton => {
                if (
                    boton.user.id !==
                    interaction.user.id
                ) {
                    await boton.reply({
                        content:
                            "❌ Solo la persona que ejecutó `/steam` puede usar estos botones.",
                        ephemeral: true
                    });

                    return;
                }

                const totalPaginas =
                    Math.ceil(
                        total /
                            RESULTADOS_POR_PAGINA
                    );

                if (
                    boton.customId.startsWith(
                        "steam_anterior_"
                    )
                ) {
                    pagina =
                        Math.max(
                            0,
                            pagina - 1
                        );
                }

                if (
                    boton.customId.startsWith(
                        "steam_siguiente_"
                    )
                ) {
                    pagina =
                        Math.min(
                            totalPaginas - 1,
                            pagina + 1
                        );
                }

                await boton.update({
                    embeds: [
                        crearEmbed(
                            perfilesOrdenados,
                            pagina,
                            total,
                            nombreBuscado
                        )
                    ],

                    components: [
                        crearBotones(
                            pagina,
                            total,
                            interaction.user.id
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
                        components: [
                            crearBotones(
                                pagina,
                                total,
                                interaction.user.id
                            ).setComponents(
                                ...crearBotones(
                                    pagina,
                                    total,
                                    interaction.user.id
                                ).components.map(
                                    boton =>
                                        ButtonBuilder.from(
                                            boton
                                        ).setDisabled(
                                            true
                                        )
                                )
                            )
                        ]
                    });
                } catch (error) {
                    // El mensaje puede haber sido eliminado.
                }
            }
        );

        console.log(
            "✅ /steam terminado"
        );
    }
};