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
const MAX_PAGINAS_STEAM = 50;

const DELAY_ENTRE_PAGINAS = 250;
const ESPERA_429 = 2500;

const RUST_APPID = "252490";

// =====================================================
// AXIOS
// =====================================================

const steamClient = axios.create({
    timeout: 10000,
    headers: {
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
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
// ESCAPAR HTML
// =====================================================

function limpiarTexto(texto) {
    return String(texto || "")
        .replace(/\s+/g, " ")
        .trim();
}

// =====================================================
// OBTENER SESIÓN DE STEAM
// =====================================================

async function obtenerSesionSteam() {
    try {
        console.log("[STEAM] Obteniendo sesión de Steam...");

        const respuesta = await steamClient.get(
            `${STEAM_BASE}/search/users/`
        );

        if (respuesta.status !== 200) {
            console.log(
                `[STEAM] Error obteniendo sesión: HTTP ${respuesta.status}`
            );
            return null;
        }

        const html = respuesta.data;

        const match =
            html.match(/g_sessionID\s*=\s*"([^"]+)"/i) ||
            html.match(/g_sessionID\s*=\s*'([^']+)'/i);

        if (match && match[1]) {
            console.log("[STEAM] Sesión obtenida correctamente.");
            return match[1];
        }

        console.log("[STEAM] No se encontró g_sessionID.");

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
// EXTRAER RESULTADOS DE STEAM
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

        let nombre = limpiarTexto(
            row.find(".searchPersonaName").first().text()
        );

        if (!nombre) {
            nombre = limpiarTexto(
                row.find(".searchPersonaName").first().attr("data-search-name")
            );
        }

        if (!nombre) {
            nombre = limpiarTexto(
                row.find("a.searchPersonaName").first().attr("title")
            );
        }

        if (!nombre) {
            return;
        }

        let steamId = null;

        const steamIdMatch =
            row.html().match(/\/profiles\/(\d{17})/i);

        if (steamIdMatch) {
            steamId = steamIdMatch[1];
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
// PETICIÓN AJAX DE STEAM
// =====================================================

async function buscarPaginaAjax(sessionId, nombre, pagina) {
    const respuesta = await steamClient.get(STEAM_SEARCH, {
        params: {
            text: nombre,
            filter: "users",
            sessionid: sessionId,
            steamid_user: "false",
            page: pagina
        },
        headers: {
            "Referer": `${STEAM_BASE}/search/users/?text=${encodeURIComponent(nombre)}`,
            "X-Requested-With": "XMLHttpRequest"
        }
    });

    return respuesta;
}

// =====================================================
// FALLBACK: PÁGINA NORMAL DE STEAM
// =====================================================

async function buscarPaginaNormal(nombre, pagina) {
    const url =
        `${STEAM_BASE}/search/users/` +
        `?text=${encodeURIComponent(nombre)}` +
        `&filter=users` +
        `&page=${pagina}`;

    const respuesta = await steamClient.get(url, {
        headers: {
            "Referer": `${STEAM_BASE}/`,
            "Accept":
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
    });

    return respuesta;
}

// =====================================================
// BUSCAR UNA PÁGINA
// =====================================================

async function obtenerResultadosPagina(sessionId, nombre, pagina) {
    // -------------------------------------------------
    // PRIMERO AJAX
    // -------------------------------------------------

    try {
        const respuesta = await buscarPaginaAjax(
            sessionId,
            nombre,
            pagina
        );

        if (respuesta.status === 200) {
            let html = "";

            if (
                typeof respuesta.data === "object" &&
                respuesta.data !== null
            ) {
                html = respuesta.data.html || "";
            } else {
                html = respuesta.data || "";
            }

            const resultados = extraerResultados(html);

            if (resultados.length > 0) {
                return {
                    resultados,
                    totalPagina: resultados.length,
                    ok: true
                };
            }
        }

        // -------------------------------------------------
        // SI HAY 429, NO HACEMOS 5 REINTENTOS
        // -------------------------------------------------

        if (respuesta.status === 429) {
            console.log(
                `[STEAM] Página ${pagina}: HTTP 429. ` +
                `Esperando ${ESPERA_429}ms y usando fallback...`
            );

            await sleep(ESPERA_429);
        }

    } catch (error) {
        console.log(
            `[STEAM] AJAX página ${pagina}: ${error.message}`
        );
    }

    // -------------------------------------------------
    // FALLBACK NORMAL
    // -------------------------------------------------

    try {
        const respuestaNormal = await buscarPaginaNormal(
            nombre,
            pagina
        );

        if (respuestaNormal.status === 200) {
            const resultados = extraerResultados(
                respuestaNormal.data
            );

            if (resultados.length > 0) {
                return {
                    resultados,
                    totalPagina: resultados.length,
                    ok: true
                };
            }
        }

        console.log(
            `[STEAM] Fallback página ${pagina}: HTTP ${respuestaNormal.status}`
        );

    } catch (error) {
        console.log(
            `[STEAM] Fallback página ${pagina}: ${error.message}`
        );
    }

    return {
        resultados: [],
        totalPagina: 0,
        ok: false
    };
}

// =====================================================
// OBTENER STEAMID DESDE URL
// =====================================================

function extraerSteamIdDesdeUrl(url) {
    if (!url) {
        return null;
    }

    const match = url.match(
        /steamcommunity\.com\/profiles\/(\d{17})/i
    );

    return match ? match[1] : null;
}

// =====================================================
// OBTENER NOMBRE DE STEAM DESDE PERFIL
// =====================================================

function obtenerNombreDesdePerfilHtml(html) {
    if (!html) {
        return null;
    }

    const $ = cheerio.load(html);

    let nombre = null;

    const selectores = [
        ".actual_persona_name",
        ".persona_name",
        ".profile_header_name",
        ".profile_header_centered_name"
    ];

    for (const selector of selectores) {
        const texto = limpiarTexto(
            $(selector).first().text()
        );

        if (texto) {
            nombre = texto;
            break;
        }
    }

    if (!nombre) {
        const title = limpiarTexto(
            $("title").first().text()
        );

        if (title) {
            nombre = title
                .replace(/\s*::\s*Steam Community\s*$/i, "")
                .trim();
        }
    }

    return nombre || null;
}

// =====================================================
// EXTRAER NOMBRE DESDE BATTLEMETRICS
// =====================================================

async function obtenerNombreBattleMetrics(url) {
    try {
        console.log("[BATTLEMETRICS] Abriendo:", url);

        const respuesta = await axios.get(url, {
            timeout: 10000,
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                    "AppleWebKit/537.36 Chrome/139.0.0.0 Safari/537.36"
            },
            validateStatus: () => true
        });

        if (respuesta.status !== 200) {
            console.log(
                `[BATTLEMETRICS] HTTP ${respuesta.status}`
            );

            return null;
        }

        const $ = cheerio.load(respuesta.data);

        let nombre = null;

        // -------------------------------------------------
        // TÍTULO
        // -------------------------------------------------

        const title = limpiarTexto(
            $("title").first().text()
        );

        if (title) {
            const partes = title.split(" - ");

            if (partes.length > 0) {
                nombre = limpiarTexto(partes[0]);
            }
        }

        // -------------------------------------------------
        // META
        // -------------------------------------------------

        if (!nombre) {
            const metaDescription = limpiarTexto(
                $('meta[name="description"]').attr("content")
            );

            if (metaDescription) {
                const match = metaDescription.match(
                    /^(.+?)\s+(?:on|en)\s+BattleMetrics/i
                );

                if (match) {
                    nombre = limpiarTexto(match[1]);
                }
            }
        }

        // -------------------------------------------------
        // ELEMENTOS VISIBLES
        // -------------------------------------------------

        if (!nombre) {
            const posibles = [
                "h1",
                '[data-testid="player-name"]',
                ".player-name",
                ".PlayerName"
            ];

            for (const selector of posibles) {
                const texto = limpiarTexto(
                    $(selector).first().text()
                );

                if (texto) {
                    nombre = texto;
                    break;
                }
            }
        }

        if (!nombre) {
            console.log(
                "[BATTLEMETRICS] No se pudo obtener el nombre."
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
// DETECTAR BATTLEMETRICS URL
// =====================================================

function esUrlBattleMetrics(texto) {
    if (!texto) {
        return false;
    }

    return /^https?:\/\/(?:www\.)?battlemetrics\.com\/players\/\d+/i.test(
        texto.trim()
    );
}

// =====================================================
// COMPROBAR RUST RÁPIDAMENTE
// =====================================================
//
// IMPORTANTE:
// Solo hacemos UNA petición por perfil.
//
// Buscamos:
// - #252490_
// - /inventory/ID/252490
// - /gamecards/252490
// - /app/252490
// - Rust
//
// Si el inventario devuelve 403 NO importa:
// si el perfil contiene links #252490_,
// se considera inventario/skins de Rust.
//

async function comprobarRustRapido(perfil) {
    if (!perfil || !perfil.profileUrl) {
        return perfil;
    }

    try {
        const respuesta = await steamClient.get(
            perfil.profileUrl,
            {
                timeout: 7000,
                headers: {
                    "Referer": `${STEAM_BASE}/`,
                    "Accept":
                        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
                }
            }
        );

        if (respuesta.status !== 200) {
            console.log(
                `[RUST] ${perfil.nombre} -> HTTP ${respuesta.status}`
            );

            perfil.rust = false;
            perfil.rustConfirmado = false;
            perfil.inventarioRust = false;
            perfil.inventarioConfirmado = false;

            return perfil;
        }

        const html = String(respuesta.data || "");

        const htmlLower = html.toLowerCase();

        // -------------------------------------------------
        // INVENTARIO / SKINS DE RUST
        // -------------------------------------------------

        const tieneInventarioRust =
            htmlLower.includes(`#${RUST_APPID}_`) ||
            htmlLower.includes(`/inventory/${RUST_APPID}`) ||
            htmlLower.includes(`/inventory/`) &&
            htmlLower.includes(`/${RUST_APPID}`) ||
            htmlLower.includes(`/gamecards/${RUST_APPID}`) ||
            htmlLower.includes(`/app/${RUST_APPID}`);

        // -------------------------------------------------
        // RUST EN EL PERFIL
        // -------------------------------------------------

        const tieneRust =
            tieneInventarioRust ||
            htmlLower.includes(">rust<") ||
            htmlLower.includes("rust -") ||
            htmlLower.includes("rust™") ||
            htmlLower.includes("rust&nbsp;") ||
            htmlLower.includes(`appid=${RUST_APPID}`) ||
            htmlLower.includes(`app/${RUST_APPID}`) ||
            htmlLower.includes(`gamecards/${RUST_APPID}`) ||
            htmlLower.includes(`inventory/${RUST_APPID}`);

        if (tieneInventarioRust) {
            perfil.rust = true;
            perfil.rustConfirmado = true;

            perfil.inventarioRust = true;
            perfil.inventarioConfirmado = true;

            console.log(
                `[RUST] ${perfil.nombre} -> RUST + INVENTARIO`
            );

            return perfil;
        }

        if (tieneRust) {
            perfil.rust = true;
            perfil.rustConfirmado = true;

            perfil.inventarioRust = false;
            perfil.inventarioConfirmado = false;

            console.log(
                `[RUST] ${perfil.nombre} -> RUST`
            );

            return perfil;
        }

        // -------------------------------------------------
        // NO SE PUDO CONFIRMAR
        // -------------------------------------------------

        perfil.rust = false;
        perfil.rustConfirmado = false;

        perfil.inventarioRust = false;
        perfil.inventarioConfirmado = false;

        console.log(
            `[RUST] ${perfil.nombre} -> NO CONFIRMADO`
        );

        return perfil;

    } catch (error) {
        console.log(
            `[RUST] ${perfil.nombre} -> ${error.message}`
        );

        perfil.rust = false;
        perfil.rustConfirmado = false;

        perfil.inventarioRust = false;
        perfil.inventarioConfirmado = false;

        return perfil;
    }
}

// =====================================================
// COMPROBAR RUST EN PARALELO
// =====================================================

async function comprobarRustEnParalelo(perfiles, concurrencia = 5) {
    let indice = 0;

    async function trabajador() {
        while (true) {
            const posicion = indice++;

            if (posicion >= perfiles.length) {
                return;
            }

            await comprobarRustRapido(perfiles[posicion]);
        }
    }

    const trabajadores = [];

    const cantidad = Math.min(
        concurrencia,
        perfiles.length
    );

    for (let i = 0; i < cantidad; i++) {
        trabajadores.push(trabajador());
    }

    await Promise.all(trabajadores);

    return perfiles;
}

// =====================================================
// ORDENAR RESULTADOS
// =====================================================
//
// 1. Rust + inventario
// 2. Rust confirmado
// 3. Rust desconocido
//

function ordenarPerfiles(perfiles) {
    return perfiles.sort((a, b) => {
        const prioridad = perfil => {
            if (
                perfil.rustConfirmado &&
                perfil.inventarioConfirmado
            ) {
                return 3;
            }

            if (perfil.rustConfirmado) {
                return 2;
            }

            return 1;
        };

        return prioridad(b) - prioridad(a);
    });
}

// =====================================================
// CREAR EMBED
// =====================================================

function crearEmbed(perfiles, pagina, totalPaginas, nombreBuscado) {
    const inicio = pagina * RESULTADOS_POR_PAGINA;

    const lista = perfiles.slice(
        inicio,
        inicio + RESULTADOS_POR_PAGINA
    );

    const embed = new EmbedBuilder()
        .setTitle(`🔎 Steam: ${nombreBuscado}`)
        .setDescription(
            `Coincidencias exactas: **${perfiles.length}**`
        )
        .setColor(0x1b2838)
        .setFooter({
            text: `Página ${pagina + 1}/${totalPaginas}`
        });

    if (lista.length === 0) {
        embed.addFields({
            name: "Sin resultados",
            value: "No hay perfiles para mostrar."
        });

        return embed;
    }

    for (let i = 0; i < lista.length; i++) {
        const perfil = lista[i];

        let estadoRust;
        let estadoInventario;

        if (perfil.rustConfirmado) {
            estadoRust = "🎮 Rust: **Sí**";
        } else {
            estadoRust = "🎮 Rust: **No confirmado**";
        }

        if (perfil.inventarioConfirmado) {
            estadoInventario =
                "🎒 Inventario/skins de Rust: **Sí**";
        } else {
            estadoInventario =
                "🎒 Inventario/skins de Rust: **No confirmado**";
        }

        const numero = inicio + i + 1;

        const steamIdTexto =
            perfil.steamId
                ? `\n🆔 SteamID64: \`${perfil.steamId}\``
                : "";

        embed.addFields({
            name: `${numero}. ${perfil.nombre}`,
            value:
                `🔗 [Perfil de Steam](${perfil.profileUrl})` +
                steamIdTexto +
                `\n${estadoRust}` +
                `\n${estadoInventario}`
        });
    }

    return embed;
}

// =====================================================
// BOTONES
// =====================================================

function crearBotones(pagina, totalPaginas) {
    const anterior = new ButtonBuilder()
        .setCustomId("steam_anterior")
        .setLabel("◀ Anterior")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pagina <= 0);

    const siguiente = new ButtonBuilder()
        .setCustomId("steam_siguiente")
        .setLabel("Siguiente ▶")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pagina >= totalPaginas - 1);

    return new ActionRowBuilder().addComponents(
        anterior,
        siguiente
    );
}

// =====================================================
// BUSCAR PERFILES EXACTOS
// =====================================================

async function buscarPerfilesExactos(nombreBuscado) {
    console.log(
        `[STEAM] Buscando perfiles con nombre exacto: ${nombreBuscado}`
    );

    const sessionId = await obtenerSesionSteam();

    if (!sessionId) {
        return [];
    }

    const perfiles = [];
    const idsVistos = new Set();

    for (
        let pagina = 1;
        pagina <= MAX_PAGINAS_STEAM;
        pagina++
    ) {
        console.log(
            `[STEAM] Buscando página ${pagina}`
        );

        const resultado = await obtenerResultadosPagina(
            sessionId,
            nombreBuscado,
            pagina
        );

        const resultados = resultado.resultados || [];

        console.log(
            `[STEAM] Resultados página ${pagina}: ${resultados.length}`
        );

        // -------------------------------------------------
        // SI NO HAY RESULTADOS
        // -------------------------------------------------

        if (resultados.length === 0) {
            // Si ya encontramos perfiles, una página vacía
            // normalmente significa que llegamos al final.
            if (perfiles.length > 0) {
                break;
            }

            // No encontramos nada en la primera página.
            break;
        }

        // -------------------------------------------------
        // GUARDAR SOLO NOMBRES EXACTOS
        // -------------------------------------------------

        for (const perfil of resultados) {
            if (perfil.nombre !== nombreBuscado) {
                continue;
            }

            let identificador =
                perfil.steamId ||
                perfil.profileUrl;

            if (!identificador) {
                identificador =
                    `${perfil.nombre}_${perfil.profileUrl}`;
            }

            if (idsVistos.has(identificador)) {
                continue;
            }

            idsVistos.add(identificador);

            perfiles.push(perfil);

            console.log(
                `[STEAM] Coincidencia exacta: ${perfil.nombre} -> ${perfil.profileUrl}`
            );
        }

        // -------------------------------------------------
        // SI HAY MENOS DE 20 RESULTADOS, ES EL FINAL
        // -------------------------------------------------

        if (resultados.length < 20) {
            break;
        }

        await sleep(DELAY_ENTRE_PAGINAS);
    }

    console.log(
        `[STEAM] RESULTADO FINAL: ${perfiles.length} coincidencias exactas.`
    );

    return perfiles;
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

        let entrada =
            interaction.options.getString("nombre");

        if (!entrada) {
            return interaction.reply({
                content: "❌ Debes indicar un nombre.",
                ephemeral: true
            });
        }

        entrada = entrada.trim();

        console.log(
            `[STEAM] Entrada recibida: ${entrada}`
        );

        // =================================================
        // BATTLEMETRICS
        // =================================================

        let nombreBuscado = entrada;

        if (esUrlBattleMetrics(entrada)) {
            console.log(
                "[STEAM] Se detectó una URL de BattleMetrics."
            );

            const nombreBM =
                await obtenerNombreBattleMetrics(entrada);

            if (!nombreBM) {
                return interaction.reply({
                    content:
                        "❌ No pude obtener el nombre del jugador desde BattleMetrics.",
                    ephemeral: true
                });
            }

            nombreBuscado = nombreBM.trim();

            console.log(
                `[STEAM] Buscando en Steam el nombre: ${nombreBuscado}`
            );
        }

        // =================================================
        // BUSCAR PERFILES
        // =================================================

        let perfiles =
            await buscarPerfilesExactos(nombreBuscado);

        if (!perfiles || perfiles.length === 0) {
            console.log(
                "[STEAM] No se encontraron coincidencias."
            );

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("🔎 Búsqueda de Steam")
                        .setDescription(
                            `No encontré ningún perfil con el nombre exacto:\n\n` +
                            `\`${nombreBuscado}\``
                        )
                        .setColor(0x1b2838)
                ]
            });
        }

        // =================================================
        // RESPONDER INMEDIATAMENTE
        // =================================================

        let paginaActual = 0;

        let totalPaginas = Math.ceil(
            perfiles.length / RESULTADOS_POR_PAGINA
        );

        // Mostrar primero sin esperar a Rust.
        // Esto hace que el comando responda rápido.

        const mensaje = await interaction.reply({
            embeds: [
                crearEmbed(
                    perfiles,
                    paginaActual,
                    totalPaginas,
                    nombreBuscado
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
        // COMPROBAR RUST EN SEGUNDO PLANO
        // =================================================

        comprobarRustEnParalelo(perfiles, 5)
            .then(async () => {
                console.log(
                    `[STEAM] Rust confirmado: ${
                        perfiles.filter(p => p.rustConfirmado).length
                    }`
                );

                console.log(
                    `[STEAM] Rust no confirmado: ${
                        perfiles.filter(p => !p.rustConfirmado).length
                    }`
                );

                ordenarPerfiles(perfiles);

                totalPaginas = Math.ceil(
                    perfiles.length / RESULTADOS_POR_PAGINA
                );

                // Si la página actual queda fuera de rango
                // después de ordenar, volver a la primera.
                if (paginaActual >= totalPaginas) {
                    paginaActual = 0;
                }

                try {
                    await interaction.editReply({
                        embeds: [
                            crearEmbed(
                                perfiles,
                                paginaActual,
                                totalPaginas,
                                nombreBuscado
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
                        "[STEAM] Mensaje actualizado con datos de Rust."
                    );

                } catch (error) {
                    console.log(
                        "[STEAM] Error actualizando mensaje:",
                        error.message
                    );
                }

            })
            .catch(error => {
                console.log(
                    "[STEAM] Error comprobando Rust:",
                    error.message
                );
            });

        // =================================================
        // PAGINACIÓN
        // =================================================

        if (totalPaginas <= 1) {
            return;
        }

        const collector =
            mensaje.createMessageComponentCollector({
                time: 120000
            });

        collector.on("collect", async buttonInteraction => {
            // ---------------------------------------------
            // SOLO EL USUARIO QUE EJECUTÓ EL COMANDO
            // ---------------------------------------------

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

            // ---------------------------------------------
            // CAMBIAR PÁGINA
            // ---------------------------------------------

            if (
                buttonInteraction.customId ===
                "steam_anterior"
            ) {
                if (paginaActual > 0) {
                    paginaActual--;
                }
            }

            if (
                buttonInteraction.customId ===
                "steam_siguiente"
            ) {
                if (paginaActual < totalPaginas - 1) {
                    paginaActual++;
                }
            }

            // ---------------------------------------------
            // ACTUALIZAR
            // ---------------------------------------------

            await buttonInteraction.update({
                embeds: [
                    crearEmbed(
                        perfiles,
                        paginaActual,
                        totalPaginas,
                        nombreBuscado
                    )
                ],
                components: [
                    crearBotones(
                        paginaActual,
                        totalPaginas
                    )
                ]
            });
        });

        // =================================================
        // FINALIZAR COLECTOR
        // =================================================

        collector.on("end", async () => {
            try {
                await interaction.editReply({
                    components: [
                        crearBotones(
                            paginaActual,
                            totalPaginas
                        ).setComponents(
                            crearBotones(
                                paginaActual,
                                totalPaginas
                            ).components.map(button => {
                                const nuevo =
                                    ButtonBuilder.from(button);

                                nuevo.setDisabled(true);

                                return nuevo;
                            })
                        )
                    ]
                });

            } catch (error) {
                console.log(
                    "[STEAM] No se pudieron desactivar botones:",
                    error.message
                );
            }
        });
    }
};