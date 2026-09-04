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
const STEAM_SEARCH = `${STEAM_BASE}/search/SearchCommunityAjax`;

const RESULTADOS_POR_PAGINA = 10;

// Máximo de páginas que vamos a consultar.
// 10 páginas = hasta ~200 resultados de Steam.
const MAX_PAGINAS = 10;

// Pequeña pausa para reducir 429.
const DELAY_PAGINAS = 350;

// Si Steam devuelve 429, esperamos esto UNA vez.
const DELAY_429 = 2500;

// Máximo de comprobaciones Rust simultáneas.
const CONCURRENCIA_RUST = 4;

// Rust AppID.
const RUST_APPID = "252490";

// =====================================================
// CLIENTE STEAM
// =====================================================

const steam = axios.create({
    timeout: 9000,
    headers: {
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/139.0.0.0 Safari/537.36",

        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",

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
// OBTENER SESIÓN REAL DE STEAM
// =====================================================
//
// NO dependemos únicamente de cookies.
// Steam pone g_sessionID en el HTML.
//

async function obtenerSesionSteam() {
    try {
        console.log("[STEAM] Obteniendo sesión de Steam...");

        const respuesta = await steam.get(
            `${STEAM_BASE}/search/users/`
        );

        if (respuesta.status !== 200) {
            console.log(
                `[STEAM] Error sesión: HTTP ${respuesta.status}`
            );

            return null;
        }

        const html = String(respuesta.data || "");

        const match =
            html.match(/g_sessionID\s*=\s*"([^"]+)"/i) ||
            html.match(/g_sessionID\s*=\s*'([^']+)'/i);

        if (match && match[1]) {
            console.log(
                "[STEAM] Sesión obtenida correctamente."
            );

            return match[1];
        }

        console.log(
            "[STEAM] No se encontró g_sessionID."
        );

        return null;

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

    const $ = cheerio.load(html);

    $(".search_row").each((index, element) => {
        const row = $(element);

        const enlace =
            row.find("a.searchPersonaName").first().attr("href") ||
            row.find("a").first().attr("href");

        if (!enlace) {
            return;
        }

        let profileUrl = enlace.trim();

        if (profileUrl.startsWith("/")) {
            profileUrl = `${STEAM_BASE}${profileUrl}`;
        }

        profileUrl = profileUrl.split("?")[0];

        let nombre = limpiarTexto(
            row.find("a.searchPersonaName").first().text()
        );

        if (!nombre) {
            nombre = limpiarTexto(
                row.find(".searchPersonaName").first().text()
            );
        }

        if (!nombre) {
            return;
        }

        // SteamID64 si aparece.
        let steamId = null;

        const idMatch =
            row.html().match(
                /\/profiles\/(\d{17})/i
            );

        if (idMatch) {
            steamId = idMatch[1];
        }

        // Intentar sacarlo también desde el href.
        if (!steamId) {
            const idUrlMatch =
                profileUrl.match(
                    /\/profiles\/(\d{17})/i
                );

            if (idUrlMatch) {
                steamId = idUrlMatch[1];
            }
        }

        const avatar =
            row.find("img").first().attr("src") || null;

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
    });

    return resultados;
}

// =====================================================
// OBTENER UNA PÁGINA DE RESULTADOS
// =====================================================

async function buscarPaginaSteam(
    sessionId,
    nombre,
    pagina
) {
    try {
        const respuesta = await steam.get(
            STEAM_SEARCH,
            {
                params: {
                    text: nombre,
                    filter: "users",
                    sessionid: sessionId,
                    steamid_user: "false",
                    page: pagina
                },

                headers: {
                    "Referer":
                        `${STEAM_BASE}/search/users/?text=${encodeURIComponent(nombre)}`,

                    "X-Requested-With":
                        "XMLHttpRequest"
                }
            }
        );

        // -------------------------------------------------
        // 200
        // -------------------------------------------------

        if (respuesta.status === 200) {
            let html = "";

            if (
                typeof respuesta.data === "object" &&
                respuesta.data !== null
            ) {
                html =
                    respuesta.data.html ||
                    respuesta.data.results_html ||
                    "";
            } else {
                html = String(respuesta.data || "");
            }

            const resultados =
                extraerResultados(html);

            return {
                ok: true,
                rateLimited: false,
                resultados
            };
        }

        // -------------------------------------------------
        // 429
        // -------------------------------------------------

        if (respuesta.status === 429) {
            console.log(
                `[STEAM] Página ${pagina}: HTTP 429`
            );

            return {
                ok: false,
                rateLimited: true,
                resultados: []
            };
        }

        console.log(
            `[STEAM] Página ${pagina}: HTTP ${respuesta.status}`
        );

        return {
            ok: false,
            rateLimited: false,
            resultados: []
        };

    } catch (error) {
        if (error.response?.status === 429) {
            console.log(
                `[STEAM] Página ${pagina}: HTTP 429`
            );

            return {
                ok: false,
                rateLimited: true,
                resultados: []
            };
        }

        console.log(
            `[STEAM] Error página ${pagina}:`,
            error.message
        );

        return {
            ok: false,
            rateLimited: false,
            resultados: []
        };
    }
}

// =====================================================
// BUSCAR PERFILES EXACTOS
// =====================================================

async function buscarPerfilesExactos(nombreBuscado) {
    console.log(
        `[STEAM] Buscando perfiles con nombre exacto: ${nombreBuscado}`
    );

    const sessionId =
        await obtenerSesionSteam();

    if (!sessionId) {
        return [];
    }

    const perfiles = [];
    const vistos = new Set();

    let recibio429 = false;

    for (
        let pagina = 1;
        pagina <= MAX_PAGINAS;
        pagina++
    ) {
        console.log(
            `[STEAM] Buscando página ${pagina}`
        );

        const resultado =
            await buscarPaginaSteam(
                sessionId,
                nombreBuscado,
                pagina
            );

        // -------------------------------------------------
        // 429
        // -------------------------------------------------

        if (resultado.rateLimited) {
            if (!recibio429) {
                recibio429 = true;

                console.log(
                    `[STEAM] Esperando ${DELAY_429}ms por rate limit...`
                );

                await sleep(DELAY_429);

                // Un único reintento.
                pagina--;

                continue;
            }

            console.log(
                "[STEAM] Steam continúa limitando peticiones. " +
                "Terminando búsqueda para no hacer esperar al usuario."
            );

            break;
        }

        recibio429 = false;

        const resultados =
            resultado.resultados || [];

        console.log(
            `[STEAM] Resultados página ${pagina}: ${resultados.length}`
        );

        // -------------------------------------------------
        // NO HAY RESULTADOS
        // -------------------------------------------------

        if (resultados.length === 0) {
            break;
        }

        // -------------------------------------------------
        // SOLO NOMBRE EXACTO
        // -------------------------------------------------
        //
        // IMPORTANTE:
        //
        // papito  -> papito       ✅
        // Papito  -> NO           ❌
        // papito1 -> NO           ❌
        // the papito -> NO        ❌
        //
        // Se mantiene exactamente como pidió el usuario.
        //

        for (const perfil of resultados) {
            if (perfil.nombre !== nombreBuscado) {
                continue;
            }

            const identificador =
                perfil.steamId ||
                perfil.profileUrl;

            if (!identificador) {
                continue;
            }

            if (vistos.has(identificador)) {
                continue;
            }

            vistos.add(identificador);

            perfiles.push(perfil);

            console.log(
                `[STEAM] Coincidencia exacta: ` +
                `${perfil.nombre} -> ${perfil.profileUrl}`
            );
        }

        // -------------------------------------------------
        // SI DEVOLVIÓ MENOS DE 20, LLEGAMOS AL FINAL
        // -------------------------------------------------

        if (resultados.length < 20) {
            break;
        }

        // -------------------------------------------------
        // PEQUEÑA PAUSA
        // -------------------------------------------------

        if (pagina < MAX_PAGINAS) {
            await sleep(DELAY_PAGINAS);
        }
    }

    console.log(
        `[STEAM] RESULTADO FINAL: ${perfiles.length} coincidencias exactas.`
    );

    return perfiles;
}

// =====================================================
// DETECTAR BATTLEMETRICS
// =====================================================

function esBattleMetrics(texto) {
    return /^https?:\/\/(?:www\.)?battlemetrics\.com\/players\/\d+/i.test(
        texto
    );
}

// =====================================================
// OBTENER NOMBRE DESDE BATTLEMETRICS
// =====================================================

async function obtenerNombreBattleMetrics(url) {
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
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                            "AppleWebKit/537.36 Chrome/139.0.0.0 Safari/537.36"
                    },

                    validateStatus: () => true
                }
            );

        if (respuesta.status !== 200) {
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

        // -------------------------------------------------
        // H1
        // -------------------------------------------------

        const h1 =
            limpiarTexto(
                $("h1").first().text()
            );

        if (h1) {
            nombre = h1;
        }

        // -------------------------------------------------
        // TITLE
        // -------------------------------------------------

        if (!nombre) {
            const title =
                limpiarTexto(
                    $("title").first().text()
                );

            if (title) {
                nombre =
                    title
                        .split(" - ")[0]
                        .trim();
            }
        }

        // -------------------------------------------------
        // META DESCRIPTION
        // -------------------------------------------------

        if (!nombre) {
            const description =
                limpiarTexto(
                    $('meta[name="description"]').attr("content")
                );

            if (description) {
                const match =
                    description.match(
                        /^(.+?)\s+(?:on|en)\s+BattleMetrics/i
                    );

                if (match) {
                    nombre =
                        limpiarTexto(match[1]);
                }
            }
        }

        if (!nombre) {
            console.log(
                "[BATTLEMETRICS] No se encontró nombre."
            );

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
// UNA SOLA PETICIÓN POR PERFIL.
//
// No hacemos:
//   /games
//   /inventory
//   /gamecards
//
// Eso era lo que hacía que tardara muchísimo.
//
// Buscamos referencias a Rust en el HTML principal.
//

async function comprobarRust(perfil) {
    try {
        const respuesta =
            await steam.get(
                perfil.profileUrl,
                {
                    timeout: 7000,

                    headers: {
                        "Referer":
                            `${STEAM_BASE}/`,

                        "Accept":
                            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
                    }
                }
            );

        // -------------------------------------------------
        // PRIVADO / BLOQUEADO / RATE LIMIT
        // -------------------------------------------------

        if (respuesta.status !== 200) {
            perfil.rust = false;
            perfil.rustConfirmado = false;

            perfil.inventarioRust = false;
            perfil.inventarioConfirmado = false;

            console.log(
                `[RUST] ${perfil.nombre}: no confirmado (HTTP ${respuesta.status})`
            );

            return perfil;
        }

        const html =
            String(respuesta.data || "");

        const htmlLower =
            html.toLowerCase();

        // -------------------------------------------------
        // INVENTARIO / SKINS
        // -------------------------------------------------
        //
        // #252490_XXXXXXXX
        //
        // Este caso es especialmente importante porque
        // Steam puede devolver 403 al abrir el inventario,
        // pero el perfil sí contiene los enlaces.
        //

        const inventarioRust =
            htmlLower.includes("#252490_") ||
            htmlLower.includes(
                `/inventory/${RUST_APPID}`
            ) ||
            htmlLower.includes(
                `/gamecards/${RUST_APPID}`
            ) ||
            htmlLower.includes(
                `/app/${RUST_APPID}`
            ) ||
            (
                htmlLower.includes("/inventory/") &&
                htmlLower.includes(`/${RUST_APPID}`)
            );

        // -------------------------------------------------
        // RUST
        // -------------------------------------------------

        const rust =
            inventarioRust ||
            htmlLower.includes(">rust<") ||
            htmlLower.includes("rust™") ||
            htmlLower.includes(
                `appid=${RUST_APPID}`
            ) ||
            htmlLower.includes(
                `app/${RUST_APPID}`
            ) ||
            htmlLower.includes(
                `gamecards/${RUST_APPID}`
            );

        if (inventarioRust) {
            perfil.rust = true;
            perfil.rustConfirmado = true;

            perfil.inventarioRust = true;
            perfil.inventarioConfirmado = true;

            console.log(
                `[RUST] ${perfil.nombre}: RUST + INVENTARIO`
            );

            return perfil;
        }

        if (rust) {
            perfil.rust = true;
            perfil.rustConfirmado = true;

            perfil.inventarioRust = false;
            perfil.inventarioConfirmado = false;

            console.log(
                `[RUST] ${perfil.nombre}: RUST`
            );

            return perfil;
        }

        // -------------------------------------------------
        // NO CONFIRMADO
        // -------------------------------------------------

        perfil.rust = false;
        perfil.rustConfirmado = false;

        perfil.inventarioRust = false;
        perfil.inventarioConfirmado = false;

        console.log(
            `[RUST] ${perfil.nombre}: NO CONFIRMADO`
        );

        return perfil;

    } catch (error) {
        perfil.rust = false;
        perfil.rustConfirmado = false;

        perfil.inventarioRust = false;
        perfil.inventarioConfirmado = false;

        console.log(
            `[RUST] ${perfil.nombre}: ${error.message}`
        );

        return perfil;
    }
}

// =====================================================
// RUST EN PARALELO
// =====================================================

async function comprobarRustTodos(perfiles) {
    let indice = 0;

    async function trabajador() {
        while (true) {
            const posicion = indice++;

            if (posicion >= perfiles.length) {
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

    for (let i = 0; i < cantidad; i++) {
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
//
// PRIORIDAD:
//
// 1. Rust + inventario
// 2. Rust confirmado
// 3. Rust desconocido
//
// Los desconocidos NO se eliminan.
//

function ordenarPerfiles(perfiles) {
    return perfiles.sort(
        (a, b) => {
            const prioridad = perfil => {
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
}

// =====================================================
// CREAR EMBED
// =====================================================

function crearEmbed(
    perfiles,
    pagina,
    nombreBuscado,
    comprobandoRust = false
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
            .setColor(0x1b2838)
            .setFooter({
                text:
                    `Página ${pagina + 1}/${totalPaginas}` +
                    (
                        comprobandoRust
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

        let rustTexto;
        let inventarioTexto;

        if (
            perfil.rustConfirmado
        ) {
            rustTexto =
                "🎮 Rust: **Sí**";
        } else {
            rustTexto =
                "🎮 Rust: **No confirmado**";
        }

        if (
            perfil.inventarioConfirmado
        ) {
            inventarioTexto =
                "🎒 Inventario/skins de Rust: **Sí**";
        } else {
            inventarioTexto =
                "🎒 Inventario/skins de Rust: **No confirmado**";
        }

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
                `\n${rustTexto}` +
                `\n${inventarioTexto}`
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

    async execute(interaction) {
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
        // OBTENER NOMBRE
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

            const nombreBM =
                await obtenerNombreBattleMetrics(
                    entrada
                );

            if (!nombreBM) {
                return interaction.reply({
                    content:
                        "❌ No pude obtener el nombre del jugador desde BattleMetrics.",
                    ephemeral: true
                });
            }

            nombreBuscado =
                nombreBM.trim();

            console.log(
                `[STEAM] Nombre obtenido de BattleMetrics: ${nombreBuscado}`
            );
        }

        // =================================================
        // BUSCAR PERFILES
        // =================================================

        const perfiles =
            await buscarPerfilesExactos(
                nombreBuscado
            );

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
        // RESPONDER YA
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

                        console.log(
                            "[STEAM] Resultados actualizados con Rust."
                        );

                    } catch (error) {
                        console.log(
                            "[STEAM] Error actualizando:",
                            error.message
                        );
                    }
                }
            )
            .catch(
                error => {
                    console.log(
                        "[STEAM] Error comprobando Rust:",
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
        // FINALIZAR BOTONES
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