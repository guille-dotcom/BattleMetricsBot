const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const axios = require("axios");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const STEAM_BASE = "https://steamcommunity.com";
const STEAM_API_URL =
    "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/";

const STEAM_API_KEY = process.env.STEAM_API_KEY;

const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/139.0.0.0 Safari/537.36";

const MAX_PAGINAS = 10;
const POR_PAGINA = 10;

const ESPERA_ENTRE_PAGINAS = 1500;
const ESPERA_429 = 10000;
const MAX_REINTENTOS_429 = 1;

// =====================================================
// COMANDO
// =====================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName("steam")
        .setDescription("Busca perfiles de Steam por nombre exacto")
        .addStringOption(option =>
            option
                .setName("nombre")
                .setDescription("Nombre exacto de Steam o enlace de BattleMetrics")
                .setRequired(true)
                .setMaxLength(200)
        ),

    async execute(interaction) {
        const entrada = interaction.options
            .getString("nombre")
            .trim();

        console.log("");
        console.log("🎯 Ejecutando /steam");
        console.log(`[STEAM] Entrada recibida: "${entrada}"`);
        console.log("[STEAM] ========================================");

        await interaction.deferReply();

        try {
            let nombreBuscado = entrada;

            // =================================================
            // BATTLEMETRICS
            // =================================================

            if (esURLBattleMetrics(entrada)) {
                console.log(
                    "[STEAM] Detectado enlace de BattleMetrics."
                );

                const nombreBM =
                    await obtenerNombreBattleMetrics(entrada);

                if (!nombreBM) {
                    await interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xff0000)
                                .setTitle(
                                    "❌ No se pudo obtener el jugador"
                                )
                                .setDescription(
                                    "No pude obtener el nombre del jugador desde ese enlace de BattleMetrics."
                                )
                        ],
                        components: []
                    });

                    return;
                }

                nombreBuscado = nombreBM;

                console.log(
                    `[STEAM] Nombre obtenido desde BattleMetrics: "${nombreBuscado}"`
                );
            }

            // =================================================
            // BUSCAR STEAM
            // =================================================

            console.log(
                `[STEAM] BUSCANDO NOMBRE EXACTO: "${nombreBuscado}"`
            );

            console.log(
                "[STEAM] ========================================"
            );

            const perfiles =
                await buscarPerfilesSteam(nombreBuscado);

            if (!perfiles.length) {
                await interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff0000)
                            .setTitle(
                                "❌ No se encontraron perfiles"
                            )
                            .setDescription(
                                `No encontré perfiles de Steam con el nombre exacto:\n\n` +
                                `**${nombreBuscado}**`
                            )
                    ],
                    components: []
                });

                return;
            }

            console.log(
                `[STEAM] Perfiles encontrados: ${perfiles.length}`
            );

            // =================================================
            // PAGINACIÓN
            // =================================================

            const totalPaginas =
                Math.ceil(perfiles.length / POR_PAGINA);

            let paginaActual = 0;

            const crearEmbeds = pagina => {
                const inicio =
                    pagina * POR_PAGINA;

                const perfilesPagina =
                    perfiles.slice(
                        inicio,
                        inicio + POR_PAGINA
                    );

                return perfilesPagina.map(
                    (perfil, index) => {
                        const numero =
                            inicio + index + 1;

                        const embed =
                            new EmbedBuilder()
                                .setColor(0x171a21)
                                .setTitle(
                                    `${numero}. ${perfil.nombre}`
                                )
                                .setURL(perfil.url)
                                .setDescription(
                                    `🔗 [Ver perfil de Steam](${perfil.url})\n\n` +
                                    `🆔 **SteamID:** ${
                                        perfil.steamid
                                            ? `\`${perfil.steamid}\``
                                            : "No disponible"
                                    }\n` +
                                    `🎮 **Rust:** ${
                                        perfil.tieneRust
                                            ? "✅ Sí"
                                            : "❌ No confirmado"
                                    }\n` +
                                    `🎒 **Inventario de Rust:** ${
                                        perfil.inventarioRust
                                            ? "✅ Sí"
                                            : "❌ No confirmado"
                                    }`
                                )
                                .setFooter({
                                    text:
                                        `Página ${pagina + 1}/${totalPaginas} • ` +
                                        `Resultado ${numero}/${perfiles.length}`
                                });

                        // =================================================
                        // AVATAR INDIVIDUAL
                        // =================================================

                        if (
                            perfil.avatar &&
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
                );
            };

            const crearBotones = pagina => {
                const anterior =
                    new ButtonBuilder()
                        .setCustomId(
                            "steam_anterior"
                        )
                        .setLabel("Anterior")
                        .setStyle(
                            ButtonStyle.Secondary
                        )
                        .setDisabled(
                            pagina === 0
                        );

                const siguiente =
                    new ButtonBuilder()
                        .setCustomId(
                            "steam_siguiente"
                        )
                        .setLabel("Siguiente")
                        .setStyle(
                            ButtonStyle.Secondary
                        )
                        .setDisabled(
                            pagina >=
                            totalPaginas - 1
                        );

                return new ActionRowBuilder()
                    .addComponents(
                        anterior,
                        siguiente
                    );
            };

            await interaction.editReply({
                embeds:
                    crearEmbeds(paginaActual),
                components:
                    totalPaginas > 1
                        ? [
                              crearBotones(
                                  paginaActual
                              )
                          ]
                        : []
            });

            // =================================================
            // SI SOLO HAY UNA PÁGINA
            // =================================================

            if (totalPaginas <= 1) {
                return;
            }

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
                async buttonInteraction => {
                    if (
                        buttonInteraction.user.id !==
                        interaction.user.id
                    ) {
                        await buttonInteraction.reply({
                            content:
                                "❌ Solo la persona que ejecutó el comando puede usar estos botones.",
                            ephemeral: true
                        });

                        return;
                    }

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
                        if (
                            paginaActual <
                            totalPaginas - 1
                        ) {
                            paginaActual++;
                        }
                    }

                    await buttonInteraction.update({
                        embeds:
                            crearEmbeds(
                                paginaActual
                            ),
                        components: [
                            crearBotones(
                                paginaActual
                            )
                        ]
                    });
                }
            );

            collector.on("end", async () => {
                try {
                    await interaction.editReply({
                        components: [
                            crearBotonesDeshabilitados(
                                paginaActual
                            )
                        ]
                    });
                } catch (error) {
                    // El mensaje puede haber sido eliminado.
                }
            });

        } catch (error) {
            console.error(
                "[STEAM] ERROR GENERAL:",
                error
            );

            const mensajeError =
                error?.message ||
                "Error desconocido.";

            try {
                await interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff0000)
                            .setTitle(
                                "❌ Error buscando en Steam"
                            )
                            .setDescription(
                                `Ocurrió un error mientras buscaba los perfiles.\n\n` +
                                `\`\`\`\n${mensajeError.slice(
                                    0,
                                    3500
                                )}\n\`\`\``
                            )
                    ],
                    components: []
                });
            } catch (editError) {
                console.error(
                    "[STEAM] No se pudo enviar el error:",
                    editError
                );
            }
        }
    }
};

// =====================================================
// BOTONES DESHABILITADOS
// =====================================================

function crearBotonesDeshabilitados(pagina) {
    const anterior =
        new ButtonBuilder()
            .setCustomId(
                "steam_anterior"
            )
            .setLabel("Anterior")
            .setStyle(
                ButtonStyle.Secondary
            )
            .setDisabled(true);

    const siguiente =
        new ButtonBuilder()
            .setCustomId(
                "steam_siguiente"
            )
            .setLabel("Siguiente")
            .setStyle(
                ButtonStyle.Secondary
            )
            .setDisabled(true);

    return new ActionRowBuilder()
        .addComponents(
            anterior,
            siguiente
        );
}

// =====================================================
// BUSCAR PERFILES STEAM
// =====================================================

async function buscarPerfilesSteam(
    nombreBuscado
) {
    const perfiles = [];
    const urlsVistas = new Set();

    // =================================================
    // CLIENTE AXIOS
    // =================================================

    const cliente = axios.create({
        baseURL: STEAM_BASE,
        timeout: 20000,
        maxRedirects: 5,

        headers: {
            "User-Agent": USER_AGENT,

            Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

            "Accept-Language":
                "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7",

            Connection: "keep-alive"
        }
    });

    // =================================================
    // COOKIE JAR MANUAL
    // =================================================

    const cookies = new Map();

    // =================================================
    // OBTENER SESIÓN REAL DE STEAM
    // =================================================

    console.log(
        "[STEAM] Inicializando sesión de Steam..."
    );

    try {
        const respuestaInicio =
            await cliente.get("/");

        guardarCookies(
            cookies,
            respuestaInicio.headers["set-cookie"]
        );

        console.log(
            `[STEAM] Cookies iniciales obtenidas: ${cookies.size}`
        );

    } catch (error) {
        console.log(
            `[STEAM] Error cargando Steam: ${error.message}`
        );
    }

    // =================================================
    // ABRIR SEARCH/USERS
    // =================================================

    try {
        const respuestaBusqueda =
            await cliente.get(
                "/search/users/",
                {
                    params: {
                        text: nombreBuscado,
                        filter: "users"
                    },

                    headers: {
                        Cookie:
                            construirCookieHeader(
                                cookies
                            ),

                        Referer:
                            `${STEAM_BASE}/`,

                        Origin:
                            STEAM_BASE,

                        "Sec-Fetch-Dest":
                            "document",

                        "Sec-Fetch-Mode":
                            "navigate",

                        "Sec-Fetch-Site":
                            "same-origin"
                    }
                }
            );

        guardarCookies(
            cookies,
            respuestaBusqueda.headers[
                "set-cookie"
            ]
        );

        console.log(
            `[STEAM] Cookies después de search/users: ${cookies.size}`
        );

    } catch (error) {
        console.log(
            `[STEAM] Error abriendo búsqueda Steam: ${error.message}`
        );
    }

    // =================================================
    // OBTENER SESSIONID
    // =================================================

    let sessionid =
        cookies.get("sessionid") || "";

    // Si no llegó cookie, intentar encontrarlo
    // dentro del HTML.
    if (!sessionid) {
        try {
            const respuesta =
                await cliente.get(
                    `/search/users/?text=${encodeURIComponent(
                        nombreBuscado
                    )}&filter=users`,
                    {
                        headers: {
                            Cookie:
                                construirCookieHeader(
                                    cookies
                                )
                        }
                    }
                );

            guardarCookies(
                cookies,
                respuesta.headers[
                    "set-cookie"
                ]
            );

            sessionid =
                cookies.get("sessionid") ||
                extraerSessionIDHTML(
                    String(
                        respuesta.data || ""
                    )
                ) ||
                "";

        } catch (error) {
            console.log(
                `[STEAM] Error obteniendo sessionid: ${error.message}`
            );
        }
    }

    console.log(
        `[STEAM] SessionID: ${
            sessionid
                ? "OK"
                : "NO ENCONTRADO"
        }`
    );

    console.log(
        `[STEAM] Cookie header: ${
            cookies.size
                ? "OK"
                : "VACÍO"
        }`
    );

    // =================================================
    // PAGINAR
    // =================================================

    for (
        let pagina = 1;
        pagina <= MAX_PAGINAS;
        pagina++
    ) {
        console.log(
            `[STEAM] Buscando página ${pagina}: ` +
                `${STEAM_BASE}/search/users/?text=${encodeURIComponent(
                    nombreBuscado
                )}&filter=users&page=${pagina}`
        );

        let contenido = "";

        let reintentos429 = 0;

        let intentoSesion = 0;

        // Permitimos una reconstrucción completa
        // de sesión si Steam responde 401.
        while (intentoSesion <= 1) {
            try {
                const cookieHeader =
                    construirCookieHeader(
                        cookies
                    );

                const respuesta =
                    await cliente.get(
                        "/search/SearchCommunityAjax",
                        {
                            params: {
                                text:
                                    nombreBuscado,

                                filter:
                                    "users",

                                sessionid:
                                    sessionid,

                                steamid_user:
                                    "false",

                                page:
                                    pagina
                            },

                            headers: {
                                Cookie:
                                    cookieHeader,

                                Referer:
                                    `${STEAM_BASE}/search/users/?text=${encodeURIComponent(
                                        nombreBuscado
                                    )}&filter=users&page=${pagina}`,

                                Origin:
                                    STEAM_BASE,

                                "X-Requested-With":
                                    "XMLHttpRequest",

                                "Sec-Fetch-Dest":
                                    "empty",

                                "Sec-Fetch-Mode":
                                    "cors",

                                "Sec-Fetch-Site":
                                    "same-origin",

                                Accept:
                                    "application/json, text/javascript, */*; q=0.01"
                            }
                        }
                    );

                guardarCookies(
                    cookies,
                    respuesta.headers[
                        "set-cookie"
                    ]
                );

                // =========================================
                // LA RESPUESTA NORMALMENTE ES JSON
                // =========================================

                if (
                    respuesta.data &&
                    typeof respuesta.data ===
                        "object"
                ) {
                    if (
                        typeof respuesta.data.html ===
                        "string"
                    ) {
                        contenido =
                            respuesta.data.html;
                    } else {
                        contenido =
                            JSON.stringify(
                                respuesta.data
                            );
                    }
                } else {
                    contenido =
                        String(
                            respuesta.data || ""
                        );
                }

                console.log(
                    `[STEAM] AJAX página ${pagina}: HTTP ${respuesta.status}`
                );

                break;

            } catch (error) {
                const status =
                    error.response?.status;

                // =========================================
                // 401 = SESIÓN/COOKIES
                // =========================================

                if (
                    status === 401 &&
                    intentoSesion === 0
                ) {
                    console.log(
                        "[STEAM] 401 recibido. Reconstruyendo sesión de Steam..."
                    );

                    intentoSesion++;

                    const nuevaSesion =
                        await crearNuevaSesionSteam(
                            cliente,
                            nombreBuscado
                        );

                    if (nuevaSesion) {
                        sessionid =
                            nuevaSesion.sessionid;

                        // Reemplazar cookies
                        cookies.clear();

                        for (
                            const [
                                nombre,
                                valor
                            ] of nuevaSesion.cookies
                        ) {
                            cookies.set(
                                nombre,
                                valor
                            );
                        }

                        console.log(
                            `[STEAM] Nueva sesión creada. SessionID: ${
                                sessionid
                                    ? "OK"
                                    : "NO"
                            }`
                        );

                        continue;
                    }

                    console.log(
                        "[STEAM] No se pudo reconstruir la sesión."
                    );

                    break;
                }

                // =========================================
                // 429
                // =========================================

                if (
                    status === 429 &&
                    reintentos429 <
                        MAX_REINTENTOS_429
                ) {
                    reintentos429++;

                    console.log(
                        `[STEAM] 429 recibido. Esperando ${ESPERA_429}ms...`
                    );

                    await esperar(
                        ESPERA_429
                    );

                    continue;
                }

                console.log(
                    `[STEAM] Error página ${pagina}: ${error.message}`
                );

                break;
            }
        }

        if (!contenido) {
            await esperar(
                ESPERA_ENTRE_PAGINAS
            );

            continue;
        }

        // =================================================
        // EXTRAER PERFILES
        // =================================================

        const encontrados =
            extraerPerfilesDesdeHTML(
                contenido
            );

        console.log(
            `[STEAM] Página ${pagina}: ${encontrados.length} perfiles detectados.`
        );

        if (!encontrados.length) {
            break;
        }

        let nuevosEnPagina = 0;

        for (
            const perfil of encontrados
        ) {
            const nombrePerfil =
                perfil.nombre.trim();

            // =================================================
            // NOMBRE EXACTO
            // =================================================

            if (
                nombrePerfil.localeCompare(
                    nombreBuscado,
                    undefined,
                    {
                        sensitivity:
                            "accent"
                    }
                ) !== 0
            ) {
                continue;
            }

            const urlNormalizada =
                normalizarURLSteam(
                    perfil.url
                );

            if (!urlNormalizada) {
                continue;
            }

            if (
                urlsVistas.has(
                    urlNormalizada
                )
            ) {
                continue;
            }

            urlsVistas.add(
                urlNormalizada
            );

            perfil.url =
                urlNormalizada;

            // =================================================
            // STEAMID
            // =================================================

            if (!perfil.steamid) {
                const matchID =
                    perfil.url.match(
                        /\/profiles\/(\d+)/i
                    );

                if (matchID) {
                    perfil.steamid =
                        matchID[1];
                }
            }

            // =================================================
            // AVATAR
            // =================================================

            perfil.avatar =
                await obtenerAvatarPerfilSteam(
                    perfil
                );

            // =================================================
            // RUST
            // =================================================

            await comprobarRustSteam(
                perfil
            );

            perfiles.push(
                perfil
            );

            nuevosEnPagina++;

            console.log(
                `[STEAM] PERFIL ENCONTRADO: ${perfil.nombre}`
            );

            console.log(
                `[STEAM] SteamID: ${
                    perfil.steamid ||
                    "N/A"
                }`
            );

            console.log(
                `[STEAM] Avatar: ${
                    perfil.avatar ||
                    "N/A"
                }`
            );

            console.log(
                `[STEAM] Rust: ${
                    perfil.tieneRust
                        ? "SI"
                        : "NO"
                }`
            );

            console.log(
                `[STEAM] Inventario Rust: ${
                    perfil.inventarioRust
                        ? "SI"
                        : "NO"
                }`
            );
        }

        // =================================================
        // SI NO HAY NUEVOS, TERMINAR
        // =================================================

        if (
            nuevosEnPagina === 0
        ) {
            break;
        }

        // =================================================
        // SI HAY MENOS DE 10, ÚLTIMA PÁGINA
        // =================================================

        if (
            encontrados.length < 10
        ) {
            break;
        }

        await esperar(
            ESPERA_ENTRE_PAGINAS
        );
    }

    // =================================================
    // ORDENAR
    // =================================================

    perfiles.sort(
        (a, b) => {
            if (
                a.tieneRust &&
                !b.tieneRust
            ) {
                return -1;
            }

            if (
                !a.tieneRust &&
                b.tieneRust
            ) {
                return 1;
            }

            return a.nombre.localeCompare(
                b.nombre,
                undefined,
                {
                    sensitivity:
                        "base"
                }
            );
        }
    );

    return perfiles;
}

// =====================================================
// CREAR NUEVA SESIÓN STEAM
// =====================================================

async function crearNuevaSesionSteam(
    cliente,
    nombreBuscado
) {
    try {
        const nuevasCookies =
            new Map();

        // =============================================
        // HOME
        // =============================================

        const home =
            await cliente.get("/");

        guardarCookies(
            nuevasCookies,
            home.headers[
                "set-cookie"
            ]
        );

        // =============================================
        // SEARCH USERS
        // =============================================

        const search =
            await cliente.get(
                "/search/users/",
                {
                    params: {
                        text:
                            nombreBuscado,

                        filter:
                            "users"
                    },

                    headers: {
                        Cookie:
                            construirCookieHeader(
                                nuevasCookies
                            ),

                        Referer:
                            `${STEAM_BASE}/`,

                        Origin:
                            STEAM_BASE,

                        "Sec-Fetch-Dest":
                            "document",

                        "Sec-Fetch-Mode":
                            "navigate",

                        "Sec-Fetch-Site":
                            "same-origin"
                    }
                }
            );

        guardarCookies(
            nuevasCookies,
            search.headers[
                "set-cookie"
            ]
        );

        let sessionid =
            nuevasCookies.get(
                "sessionid"
            ) || "";

        if (!sessionid) {
            sessionid =
                extraerSessionIDHTML(
                    String(
                        search.data || ""
                    )
                ) || "";
        }

        if (!sessionid) {
            console.log(
                "[STEAM] Nueva sesión: no se encontró sessionid."
            );

            return null;
        }

        return {
            sessionid,
            cookies:
                nuevasCookies
        };

    } catch (error) {
        console.log(
            `[STEAM] Error creando nueva sesión: ${error.message}`
        );

        return null;
    }
}

// =====================================================
// GUARDAR COOKIES
// =====================================================

function guardarCookies(
    cookieJar,
    setCookie
) {
    if (
        !Array.isArray(setCookie)
    ) {
        return;
    }

    for (
        const cookieString of setCookie
    ) {
        if (
            typeof cookieString !==
            "string"
        ) {
            continue;
        }

        const primeraParte =
            cookieString.split(
                ";"
            )[0];

        const indice =
            primeraParte.indexOf("=");

        if (indice === -1) {
            continue;
        }

        const nombre =
            primeraParte
                .slice(0, indice)
                .trim();

        const valor =
            primeraParte
                .slice(indice + 1)
                .trim();

        if (!nombre) {
            continue;
        }

        cookieJar.set(
            nombre,
            valor
        );
    }
}

// =====================================================
// CONSTRUIR COOKIE HEADER
// =====================================================

function construirCookieHeader(
    cookieJar
) {
    return Array.from(
        cookieJar.entries()
    )
        .map(
            ([nombre, valor]) =>
                `${nombre}=${valor}`
        )
        .join("; ");
}

// =====================================================
// EXTRAER SESSIONID DEL HTML
// =====================================================

function extraerSessionIDHTML(
    html
) {
    if (!html) {
        return "";
    }

    const patrones = [
        /g_sessionID\s*=\s*["']([a-f0-9]+)["']/i,

        /sessionid["']?\s*[:=]\s*["']([a-f0-9]+)["']/i,

        /"sessionid"\s*:\s*"([a-f0-9]+)"/i,

        /name=["']sessionid["'][^>]+value=["']([a-f0-9]+)["']/i
    ];

    for (
        const patron of patrones
    ) {
        const match =
            html.match(patron);

        if (
            match &&
            match[1]
        ) {
            return match[1];
        }
    }

    return "";
}

// =====================================================
// EXTRAER PERFILES
// =====================================================

function extraerPerfilesDesdeHTML(
    contenido
) {
    let html =
        String(
            contenido || ""
        );

    // =================================================
    // SI LLEGÓ JSON STRINGIFICADO
    // =================================================

    try {
        const posibleJSON =
            JSON.parse(html);

        if (
            posibleJSON &&
            typeof posibleJSON ===
                "object"
        ) {
            if (
                typeof posibleJSON.html ===
                "string"
            ) {
                html =
                    posibleJSON.html;
            }
        }
    } catch (error) {
        // No era JSON.
    }

    // =================================================
    // DESESCAPAR JSON
    // =================================================

    html = html
        .replace(
            /\\"/g,
            '"'
        )
        .replace(
            /\\\//g,
            "/"
        );

    const perfiles = [];

    const regexPrincipal =
        /<a[^>]+class=["'][^"']*searchPersonaName[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

    const regexAlternativo =
        /<a[^>]+href=["']([^"']+)["'][^>]+class=["'][^"']*searchPersonaName[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;

    const procesar =
        match => {
            if (
                !match ||
                !match[1] ||
                !match[2]
            ) {
                return;
            }

            const url =
                normalizarURLSteam(
                    match[1]
                );

            const nombre =
                limpiarHTML(
                    match[2]
                );

            if (
                !url ||
                !nombre
            ) {
                return;
            }

            let steamid =
                "";

            const matchID =
                url.match(
                    /\/profiles\/(\d+)/i
                );

            if (matchID) {
                steamid =
                    matchID[1];
            }

            perfiles.push({
                nombre,
                url,
                steamid,
                avatar: "",
                tieneRust: false,
                inventarioRust:
                    false
            });
        };

    let match;

    while (
        (match =
            regexPrincipal.exec(
                html
            )) !== null
    ) {
        procesar(match);
    }

    if (
        !perfiles.length
    ) {
        while (
            (match =
                regexAlternativo.exec(
                    html
                )) !== null
        ) {
            procesar(match);
        }
    }

    // =================================================
    // SEGUNDO MÉTODO: buscar searchPersonaName
    // =================================================

    if (
        !perfiles.length
    ) {
        const regexSimple =
            /<a[^>]+href=["']([^"']+)["'][^>]*>[\s\S]*?<span[^>]*class=["'][^"']*searchPersonaName[^"']*["'][^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/a>/gi;

        while (
            (match =
                regexSimple.exec(
                    html
                )) !== null
        ) {
            procesar(match);
        }
    }

    // =================================================
    // DEDUPLICAR
    // =================================================

    const resultado = [];

    const vistos =
        new Set();

    for (
        const perfil of perfiles
    ) {
        if (
            vistos.has(
                perfil.url
            )
        ) {
            continue;
        }

        vistos.add(
            perfil.url
        );

        resultado.push(
            perfil
        );
    }

    return resultado;
}

// =====================================================
// OBTENER AVATAR
// =====================================================

async function obtenerAvatarPerfilSteam(
    perfil
) {
    try {
        let steamid =
            perfil.steamid;

        if (
            !steamid &&
            perfil.url
        ) {
            const match =
                perfil.url.match(
                    /\/profiles\/(\d+)/i
                );

            if (match) {
                steamid =
                    match[1];
            }
        }

        if (!steamid) {
            console.log(
                `[STEAM API] Sin SteamID para ${perfil.nombre}`
            );

            return "";
        }

        perfil.steamid =
            steamid;

        if (
            !STEAM_API_KEY
        ) {
            console.log(
                "[STEAM API] ERROR: STEAM_API_KEY no está configurada."
            );

            return "";
        }

        console.log(
            `[STEAM API] Buscando avatar de ${perfil.nombre} (${steamid})...`
        );

        const respuesta =
            await axios.get(
                STEAM_API_URL,
                {
                    params: {
                        key:
                            STEAM_API_KEY,

                        steamids:
                            steamid
                    },

                    headers: {
                        "User-Agent":
                            USER_AGENT,

                        Accept:
                            "application/json"
                    },

                    timeout:
                        15000
                }
            );

        const players =
            respuesta.data
                ?.response
                ?.players;

        if (
            !Array.isArray(
                players
            ) ||
            !players.length
        ) {
            console.log(
                `[STEAM API] No devolvió jugador para ${steamid}`
            );

            return "";
        }

        const player =
            players.find(
                jugador =>
                    String(
                        jugador.steamid
                    ) ===
                    String(
                        steamid
                    )
            ) ||
            players[0];

        const avatar =
            player.avatarfull ||
            player.avatarmedium ||
            player.avatar ||
            "";

        if (!avatar) {
            console.log(
                `[STEAM API] No devolvió avatar para ${steamid}`
            );

            return "";
        }

        const avatarLimpio =
            limpiarURL(
                avatar
            );

        if (
            esAvatarSteamValido(
                avatarLimpio
            )
        ) {
            console.log(
                `[STEAM API] Avatar encontrado para ${perfil.nombre}: ${avatarLimpio}`
            );

            return avatarLimpio;
        }

        console.log(
            `[STEAM API] Avatar rechazado: ${avatarLimpio}`
        );

        return "";

    } catch (error) {
        if (
            error.response
        ) {
            console.log(
                `[STEAM API] Error ${error.response.status}:`,
                error.response.data ||
                    error.message
            );
        } else {
            console.log(
                `[STEAM API] Error avatar: ${error.message}`
            );
        }

        return "";
    }
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

    const avatar =
        String(url)
            .trim()
            .replace(
                /\\\//g,
                "/"
            );

    if (
        avatar.includes(
            "steam_share_image"
        ) ||
        avatar.includes(
            "steam_share"
        ) ||
        avatar.includes(
            "default_avatar"
        )
    ) {
        return false;
    }

    if (
        avatar.startsWith(
            "https://avatars.steamstatic.com/"
        ) ||
        avatar.startsWith(
            "http://avatars.steamstatic.com/"
        )
    ) {
        return true;
    }

    if (
        avatar.startsWith(
            "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/"
        ) ||
        avatar.startsWith(
            "http://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/"
        )
    ) {
        return true;
    }

    if (
        avatar.startsWith(
            "https://avatars.akamaihd.net/"
        ) ||
        avatar.startsWith(
            "http://avatars.akamaihd.net/"
        )
    ) {
        return true;
    }

    if (
        avatar.includes(
            "media.steampowered.com/steamcommunity/public/images/avatars/"
        )
    ) {
        return true;
    }

    return false;
}

// =====================================================
// COMPROBAR RUST
// =====================================================

async function comprobarRustSteam(
    perfil
) {
    try {
        let steamid =
            perfil.steamid;

        if (
            !steamid &&
            perfil.url
        ) {
            const matchID =
                perfil.url.match(
                    /\/profiles\/(\d+)/i
                );

            if (matchID) {
                steamid =
                    matchID[1];
            }
        }

        // =================================================
        // RESOLVER /ID/
        // =================================================

        if (
            !steamid &&
            perfil.url.includes(
                "/id/"
            )
        ) {
            try {
                const respuesta =
                    await axios.get(
                        perfil.url,
                        {
                            headers: {
                                "User-Agent":
                                    USER_AGENT,

                                Accept:
                                    "text/html,application/xhtml+xml"
                            },

                            timeout:
                                15000,

                            maxRedirects:
                                5
                        }
                    );

                const html =
                    String(
                        respuesta.data ||
                            ""
                    );

                const patronesID = [
                    /g_steamID\s*=\s*"(\d+)"/i,

                    /"steamid"\s*:\s*"(\d+)"/i,

                    /"steamID64"\s*:\s*"(\d+)"/i,

                    /\/profiles\/(\d+)/i
                ];

                for (
                    const patron of patronesID
                ) {
                    const match =
                        html.match(
                            patron
                        );

                    if (
                        match &&
                        match[1]
                    ) {
                        steamid =
                            match[1];

                        break;
                    }
                }

            } catch (error) {
                console.log(
                    `[STEAM] Error resolviendo SteamID: ${error.message}`
                );
            }
        }

        if (!steamid) {
            return;
        }

        perfil.steamid =
            steamid;

        // =================================================
        // PERFIL
        // =================================================

        const profileURL =
            `${STEAM_BASE}/profiles/${steamid}`;

        try {
            const respuesta =
                await axios.get(
                    profileURL,
                    {
                        headers: {
                            "User-Agent":
                                USER_AGENT,

                            Accept:
                                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

                            "Accept-Language":
                                "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7"
                        },

                        timeout:
                            15000,

                        maxRedirects:
                            5
                    }
                );

            const html =
                String(
                    respuesta.data ||
                        ""
                );

            if (
                html.includes(
                    "#252490_"
                ) ||
                (
                    html.includes(
                        "/inventory/"
                    ) &&
                    html.includes(
                        "/252490"
                    )
                ) ||
                html.includes(
                    "/gamecards/252490"
                ) ||
                html.includes(
                    "/app/252490"
                ) ||
                /\bRust\b/i.test(
                    html
                )
            ) {
                perfil.tieneRust =
                    true;
            }

        } catch (error) {
            console.log(
                `[STEAM] Error comprobando perfil Rust: ${error.message}`
            );
        }

        // =================================================
        // JUEGOS
        // =================================================

        try {
            const gamesURL =
                `${STEAM_BASE}/profiles/${steamid}/games/?tab=all`;

            const respuestaJuegos =
                await axios.get(
                    gamesURL,
                    {
                        headers: {
                            "User-Agent":
                                USER_AGENT,

                            Accept:
                                "text/html,application/xhtml+xml"
                        },

                        timeout:
                            15000,

                        maxRedirects:
                            5
                    }
                );

            const gamesHTML =
                String(
                    respuestaJuegos.data ||
                        ""
                );

            if (
                gamesHTML.includes(
                    "252490"
                ) ||
                /\bRust\b/i.test(
                    gamesHTML
                )
            ) {
                perfil.tieneRust =
                    true;
            }

        } catch (error) {
            console.log(
                `[STEAM] Error comprobando juegos: ${error.message}`
            );
        }

        // =================================================
        // INVENTARIO RUST
        // =================================================

        try {
            const inventoryURL =
                `${STEAM_BASE}/inventory/${steamid}/252490/2?l=english&count=1`;

            const respuestaInventario =
                await axios.get(
                    inventoryURL,
                    {
                        headers: {
                            "User-Agent":
                                USER_AGENT,

                            Accept:
                                "application/json,text/plain,*/*"
                        },

                        timeout:
                            15000,

                        maxRedirects:
                            5
                    }
                );

            const data =
                respuestaInventario.data;

            if (
                data &&
                (
                    data.success ===
                        1 ||
                    data.success ===
                        true
                )
            ) {
                perfil.inventarioRust =
                    true;

                perfil.tieneRust =
                    true;
            }

        } catch (error) {
            const status =
                error.response
                    ?.status;

            if (
                status === 403
            ) {
                console.log(
                    `[STEAM] Inventario privado/bloqueado: ${perfil.nombre}`
                );
            } else {
                console.log(
                    `[STEAM] Error inventario Rust ${perfil.nombre}: ${error.message}`
                );
            }
        }

    } catch (error) {
        console.log(
            `[STEAM] Error general Rust: ${error.message}`
        );
    }
}

// =====================================================
// BATTLEMETRICS
// =====================================================

function esURLBattleMetrics(
    texto
) {
    return /battlemetrics\.com\/players\//i.test(
        texto
    );
}

async function obtenerNombreBattleMetrics(
    url
) {
    try {
        const respuesta =
            await axios.get(
                url,
                {
                    headers: {
                        "User-Agent":
                            USER_AGENT,

                        Accept:
                            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
                    },

                    timeout:
                        20000,

                    maxRedirects:
                        5
                }
            );

        const html =
            String(
                respuesta.data ||
                    ""
            );

        const patrones = [
            /<title[^>]*>([\s\S]*?)<\/title>/i,

            /<h1[^>]*>([\s\S]*?)<\/h1>/i,

            /playerName["']?\s*[:=]\s*["']([^"']+)/i
        ];

        for (
            const patron of patrones
        ) {
            const match =
                html.match(
                    patron
                );

            if (
                !match ||
                !match[1]
            ) {
                continue;
            }

            let nombre =
                limpiarHTML(
                    match[1]
                );

            nombre =
                nombre
                    .replace(
                        /\s*[-|]\s*BattleMetrics.*$/i,
                        ""
                    )
                    .trim();

            if (nombre) {
                return nombre;
            }
        }

        return "";

    } catch (error) {
        console.log(
            `[BATTLEMETRICS] Error obteniendo nombre: ${error.message}`
        );

        return "";
    }
}

// =====================================================
// NORMALIZAR URL STEAM
// =====================================================

function normalizarURLSteam(
    url
) {
    if (!url) {
        return "";
    }

    let resultado =
        String(url)
            .replace(
                /&amp;/g,
                "&"
            )
            .replace(
                /\\\//g,
                "/"
            )
            .trim();

    if (
        resultado.startsWith(
            "//"
        )
    ) {
        resultado =
            "https:" +
            resultado;
    }

    if (
        resultado.startsWith(
            "/"
        )
    ) {
        resultado =
            STEAM_BASE +
            resultado;
    }

    if (
        !resultado.startsWith(
            "http://"
        ) &&
        !resultado.startsWith(
            "https://"
        )
    ) {
        resultado =
            `${STEAM_BASE}/${resultado}`;
    }

    return resultado;
}

// =====================================================
// LIMPIAR URL
// =====================================================

function limpiarURL(
    url
) {
    return String(
        url || ""
    )
        .replace(
            /&amp;/g,
            "&"
        )
        .replace(
            /\\\//g,
            "/"
        )
        .trim();
}

// =====================================================
// LIMPIAR HTML
// =====================================================

function limpiarHTML(
    texto
) {
    return String(
        texto || ""
    )
        .replace(
            /<[^>]*>/g,
            ""
        )
        .replace(
            /&amp;/g,
            "&"
        )
        .replace(
            /&quot;/g,
            '"'
        )
        .replace(
            /&#39;/g,
            "'"
        )
        .replace(
            /&lt;/g,
            "<"
        )
        .replace(
            /&gt;/g,
            ">"
        )
        .replace(
            /&#x27;/gi,
            "'"
        )
        .replace(
            /&#x2F;/gi,
            "/"
        )
        .trim();
}

// =====================================================
// ESPERAR
// =====================================================

function esperar(
    ms
) {
    return new Promise(
        resolve => {
            setTimeout(
                resolve,
                ms
            );
        }
    );
}