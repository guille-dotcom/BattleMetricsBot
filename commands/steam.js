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
        const entrada = interaction.options.getString("nombre").trim();

        console.log("");
        console.log("🎯 Ejecutando /steam");
        console.log(`[STEAM] Entrada recibida: "${entrada}"`);
        console.log("[STEAM] ========================================");

        await interaction.deferReply();

        try {
            let nombreBuscado = entrada;

            // =================================================
            // SI ES LINK DE BATTLEMETRICS
            // =================================================

            if (esURLBattleMetrics(entrada)) {
                console.log("[STEAM] Detectado enlace de BattleMetrics.");

                const nombreBM = await obtenerNombreBattleMetrics(entrada);

                if (nombreBM) {
                    nombreBuscado = nombreBM;

                    console.log(
                        `[STEAM] Nombre obtenido desde BattleMetrics: "${nombreBuscado}"`
                    );
                } else {
                    await interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xff0000)
                                .setTitle("❌ No se pudo obtener el jugador")
                                .setDescription(
                                    "No pude obtener el nombre del jugador desde ese enlace de BattleMetrics."
                                )
                        ]
                    });

                    return;
                }
            }

            // =================================================
            // BUSCAR STEAM
            // =================================================

            console.log(
                `[STEAM] BUSCANDO NOMBRE EXACTO: "${nombreBuscado}"`
            );

            console.log("[STEAM] ========================================");

            const perfiles = await buscarPerfilesSteam(nombreBuscado);

            if (!perfiles.length) {
                await interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff0000)
                            .setTitle("❌ No se encontraron perfiles")
                            .setDescription(
                                `No encontré perfiles de Steam con el nombre exacto:\n\n` +
                                `**${nombreBuscado}**`
                            )
                    ]
                });

                return;
            }

            console.log(
                `[STEAM] Perfiles encontrados: ${perfiles.length}`
            );

            // =================================================
            // PAGINACIÓN
            // =================================================

            const totalPaginas = Math.ceil(perfiles.length / POR_PAGINA);

            let paginaActual = 0;

            const crearEmbeds = pagina => {
                const inicio = pagina * POR_PAGINA;
                const perfilesPagina = perfiles.slice(
                    inicio,
                    inicio + POR_PAGINA
                );

                return perfilesPagina.map((perfil, index) => {
                    const numero = inicio + index + 1;

                    const embed = new EmbedBuilder()
                        .setColor(0x171a21)
                        .setTitle(`${numero}. ${perfil.nombre}`)
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
                        esAvatarSteamValido(perfil.avatar)
                    ) {
                        embed.setThumbnail(perfil.avatar);

                        console.log(
                            `[STEAM] Avatar aplicado a ${perfil.nombre}: ${perfil.avatar}`
                        );
                    } else {
                        console.log(
                            `[STEAM] SIN AVATAR para ${perfil.nombre}`
                        );
                    }

                    return embed;
                });
            };

            const crearBotones = pagina => {
                const anterior = new ButtonBuilder()
                    .setCustomId("steam_anterior")
                    .setLabel("Anterior")
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(pagina === 0);

                const siguiente = new ButtonBuilder()
                    .setCustomId("steam_siguiente")
                    .setLabel("Siguiente")
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(pagina >= totalPaginas - 1);

                return new ActionRowBuilder().addComponents(
                    anterior,
                    siguiente
                );
            };

            await interaction.editReply({
                embeds: crearEmbeds(paginaActual),
                components:
                    totalPaginas > 1
                        ? [crearBotones(paginaActual)]
                        : []
            });

            // =================================================
            // COLLECTOR
            // =================================================

            if (totalPaginas <= 1) {
                return;
            }

            const mensaje = await interaction.fetchReply();

            const collector = mensaje.createMessageComponentCollector({
                time: 120000
            });

            collector.on("collect", async buttonInteraction => {
                if (buttonInteraction.user.id !== interaction.user.id) {
                    await buttonInteraction.reply({
                        content:
                            "❌ Solo la persona que ejecutó el comando puede usar estos botones.",
                        ephemeral: true
                    });

                    return;
                }

                if (buttonInteraction.customId === "steam_anterior") {
                    if (paginaActual > 0) {
                        paginaActual--;
                    }
                }

                if (buttonInteraction.customId === "steam_siguiente") {
                    if (paginaActual < totalPaginas - 1) {
                        paginaActual++;
                    }
                }

                await buttonInteraction.update({
                    embeds: crearEmbeds(paginaActual),
                    components: [crearBotones(paginaActual)]
                });
            });

            collector.on("end", async () => {
                try {
                    await interaction.editReply({
                        components: [crearBotonesDeshabilitados(paginaActual)]
                    });
                } catch (error) {
                    // El mensaje puede haber sido eliminado.
                }
            });

        } catch (error) {
            console.error("[STEAM] ERROR GENERAL:", error);

            const mensajeError =
                error?.message ||
                "Error desconocido.";

            try {
                await interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff0000)
                            .setTitle("❌ Error buscando en Steam")
                            .setDescription(
                                `Ocurrió un error mientras buscaba los perfiles.\n\n` +
                                `\`\`\`\n${mensajeError.slice(0, 3500)}\n\`\`\``
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
    const anterior = new ButtonBuilder()
        .setCustomId("steam_anterior")
        .setLabel("Anterior")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true);

    const siguiente = new ButtonBuilder()
        .setCustomId("steam_siguiente")
        .setLabel("Siguiente")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true);

    return new ActionRowBuilder().addComponents(
        anterior,
        siguiente
    );
}

// =====================================================
// BUSCAR PERFILES STEAM
// =====================================================

async function buscarPerfilesSteam(nombreBuscado) {
    const perfiles = [];
    const urlsVistas = new Set();

    const cliente = axios.create({
        baseURL: STEAM_BASE,
        timeout: 20000,
        maxRedirects: 5,
        headers: {
            "User-Agent": USER_AGENT,
            "Accept":
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language":
                "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7"
        }
    });

    let sessionid = "";

    // =================================================
    // OBTENER SESIÓN
    // =================================================

    try {
        const respuestaInicial = await cliente.get(
            `/search/users/?text=${encodeURIComponent(nombreBuscado)}&filter=users`
        );

        const setCookie =
            respuestaInicial.headers["set-cookie"];

        if (Array.isArray(setCookie)) {
            const cookieSession = setCookie.find(cookie =>
                cookie.startsWith("sessionid=")
            );

            if (cookieSession) {
                sessionid =
                    cookieSession
                        .split(";")[0]
                        .split("=")[1] || "";
            }
        }

        // Algunas respuestas incluyen sessionid dentro del HTML
        if (!sessionid) {
            const matchSession =
                String(respuestaInicial.data || "").match(
                    /sessionid["']?\s*[:=]\s*["']([a-f0-9]+)["']/i
                );

            if (matchSession) {
                sessionid = matchSession[1];
            }
        }

    } catch (error) {
        console.log(
            `[STEAM] Error obteniendo sesión: ${error.message}`
        );
    }

    // =================================================
    // PAGINAR
    // =================================================

    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
        console.log(
            `[STEAM] Buscando página ${pagina}: ` +
            `${STEAM_BASE}/search/users/?text=${encodeURIComponent(
                nombreBuscado
            )}&filter=users&page=${pagina}`
        );

        let contenido = "";

        let reintentos429 = 0;

        while (true) {
            try {
                const respuesta = await cliente.get(
                    "/search/SearchCommunityAjax",
                    {
                        params: {
                            text: nombreBuscado,
                            filter: "users",
                            sessionid,
                            steamid_user: "false",
                            page: pagina
                        },
                        headers: {
                            Referer:
                                `${STEAM_BASE}/search/users/?text=` +
                                `${encodeURIComponent(nombreBuscado)}` +
                                `&filter=users&page=${pagina}`,
                            "X-Requested-With": "XMLHttpRequest"
                        }
                    }
                );

                contenido =
                    typeof respuesta.data === "string"
                        ? respuesta.data
                        : JSON.stringify(respuesta.data);

                break;

            } catch (error) {
                const status = error.response?.status;

                if (
                    status === 429 &&
                    reintentos429 < MAX_REINTENTOS_429
                ) {
                    reintentos429++;

                    console.log(
                        `[STEAM] 429 recibido. Esperando ${ESPERA_429}ms...`
                    );

                    await esperar(ESPERA_429);
                    continue;
                }

                console.log(
                    `[STEAM] Error página ${pagina}: ${error.message}`
                );

                contenido = "";
                break;
            }
        }

        if (!contenido) {
            await esperar(ESPERA_ENTRE_PAGINAS);
            continue;
        }

        // =================================================
        // EXTRAER PERFILES
        // =================================================

        const encontrados =
            extraerPerfilesDesdeHTML(contenido);

        console.log(
            `[STEAM] Página ${pagina}: ${encontrados.length} perfiles detectados.`
        );

        if (!encontrados.length) {
            break;
        }

        let nuevosEnPagina = 0;

        for (const perfil of encontrados) {
            const nombrePerfil = perfil.nombre.trim();

            // SOLO NOMBRE EXACTO
            if (
                nombrePerfil.localeCompare(
                    nombreBuscado,
                    undefined,
                    {
                        sensitivity: "accent"
                    }
                ) !== 0
            ) {
                continue;
            }

            const urlNormalizada = normalizarURLSteam(
                perfil.url
            );

            if (!urlNormalizada) {
                continue;
            }

            if (urlsVistas.has(urlNormalizada)) {
                continue;
            }

            urlsVistas.add(urlNormalizada);

            perfil.url = urlNormalizada;

            // =================================================
            // STEAMID
            // =================================================

            if (!perfil.steamid) {
                const matchID =
                    perfil.url.match(/\/profiles\/(\d+)/i);

                if (matchID) {
                    perfil.steamid = matchID[1];
                }
            }

            // =================================================
            // AVATAR MEDIANTE STEAM WEB API
            // =================================================

            perfil.avatar =
                await obtenerAvatarPerfilSteam(perfil);

            // =================================================
            // COMPROBAR RUST
            // =================================================

            await comprobarRustSteam(perfil);

            perfiles.push(perfil);
            nuevosEnPagina++;

            console.log(
                `[STEAM] PERFIL ENCONTRADO: ${perfil.nombre}`
            );

            console.log(
                `[STEAM] SteamID: ${perfil.steamid || "N/A"}`
            );

            console.log(
                `[STEAM] Avatar: ${perfil.avatar || "N/A"}`
            );

            console.log(
                `[STEAM] Rust: ${perfil.tieneRust ? "SI" : "NO"}`
            );

            console.log(
                `[STEAM] Inventario Rust: ${
                    perfil.inventarioRust ? "SI" : "NO"
                }`
            );
        }

        // Si una página no aporta perfiles nuevos,
        // dejamos de buscar.
        if (nuevosEnPagina === 0) {
            break;
        }

        if (encontrados.length < 10) {
            break;
        }

        await esperar(ESPERA_ENTRE_PAGINAS);
    }

    // =================================================
    // ORDEN
    // =================================================

    perfiles.sort((a, b) => {
        if (a.tieneRust && !b.tieneRust) return -1;
        if (!a.tieneRust && b.tieneRust) return 1;

        return a.nombre.localeCompare(
            b.nombre,
            undefined,
            {
                sensitivity: "base"
            }
        );
    });

    return perfiles;
}

// =====================================================
// EXTRAER PERFILES DEL HTML
// =====================================================

function extraerPerfilesDesdeHTML(html) {
    const perfiles = [];

    const regexPrincipal =
        /<a[^>]+class=["'][^"']*searchPersonaName[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

    const regexAlternativo =
        /<a[^>]+href=["']([^"']+)["'][^>]+class=["'][^"']*searchPersonaName[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;

    const procesar = match => {
        const url = normalizarURLSteam(match[1]);
        const nombre = limpiarHTML(match[2]);

        if (!url || !nombre) {
            return;
        }

        let steamid = "";

        const matchID =
            url.match(/\/profiles\/(\d+)/i);

        if (matchID) {
            steamid = matchID[1];
        }

        perfiles.push({
            nombre,
            url,
            steamid,
            avatar: "",
            tieneRust: false,
            inventarioRust: false
        });
    };

    let match;

    while ((match = regexPrincipal.exec(html)) !== null) {
        procesar(match);
    }

    // Si el primer regex no encontró nada
    if (!perfiles.length) {
        while ((match = regexAlternativo.exec(html)) !== null) {
            procesar(match);
        }
    }

    // =================================================
    // DEDUPLICAR
    // =================================================

    const resultado = [];
    const vistos = new Set();

    for (const perfil of perfiles) {
        if (vistos.has(perfil.url)) {
            continue;
        }

        vistos.add(perfil.url);
        resultado.push(perfil);
    }

    return resultado;
}

// =====================================================
// OBTENER AVATAR MEDIANTE STEAM WEB API
// =====================================================

async function obtenerAvatarPerfilSteam(perfil) {
    try {
        let steamid = perfil.steamid;

        if (!steamid && perfil.url) {
            const match =
                perfil.url.match(/\/profiles\/(\d+)/i);

            if (match) {
                steamid = match[1];
            }
        }

        if (!steamid) {
            console.log(
                `[STEAM] No hay SteamID para avatar de ${perfil.nombre}`
            );

            return "";
        }

        perfil.steamid = steamid;

        if (!STEAM_API_KEY) {
            console.log(
                "[STEAM] ERROR: STEAM_API_KEY no está configurada en .env"
            );

            return "";
        }

        console.log(
            `[STEAM API] Buscando avatar de ${perfil.nombre} (${steamid})...`
        );

        const respuesta = await axios.get(
            "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/",
            {
                params: {
                    key: STEAM_API_KEY,
                    steamids: steamid
                },
                headers: {
                    "User-Agent": USER_AGENT,
                    Accept: "application/json"
                },
                timeout: 15000
            }
        );

        const players =
            respuesta.data?.response?.players;

        if (!Array.isArray(players) || !players.length) {
            console.log(
                `[STEAM API] No devolvió datos para ${steamid}`
            );

            return "";
        }

        const player =
            players.find(
                jugador =>
                    String(jugador.steamid) === String(steamid)
            ) || players[0];

        console.log(
            `[STEAM API] Perfil recibido: ${
                player.personaname || perfil.nombre
            }`
        );

        const avatar =
            player.avatarfull ||
            player.avatarmedium ||
            player.avatar ||
            "";

        if (!avatar) {
            console.log(
                `[STEAM API] Steam no devolvió avatar para ${steamid}`
            );

            return "";
        }

        const avatarLimpio = limpiarURL(avatar);

        console.log(
            `[STEAM API] Avatar encontrado: ${avatarLimpio}`
        );

        if (esAvatarSteamValido(avatarLimpio)) {
            return avatarLimpio;
        }

        console.log(
            `[STEAM API] Avatar rechazado por validación: ${avatarLimpio}`
        );

        return "";

    } catch (error) {
        if (error.response) {
            console.log(
                `[STEAM API] Error ${error.response.status}:`,
                error.response.data || error.message
            );
        } else {
            console.log(
                `[STEAM API] Error obteniendo avatar: ${error.message}`
            );
        }

        return "";
    }
}

// =====================================================
// VALIDAR AVATAR STEAM
// =====================================================

function esAvatarSteamValido(url) {
    if (!url) {
        return false;
    }

    const avatar = String(url)
        .trim()
        .replace(/\\\//g, "/");

    if (
        avatar.includes("steam_share_image") ||
        avatar.includes("steam_share") ||
        avatar.includes("default_avatar")
    ) {
        return false;
    }

    // Steam CDN actual
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

    // Steam CDN antiguo
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

    // Otro CDN utilizado por Steam
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

    // Steam Community CDN antiguo
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

async function comprobarRustSteam(perfil) {
    try {
        let steamid = perfil.steamid;

        // =================================================
        // OBTENER STEAMID SI ES /id/
        // =================================================

        if (!steamid && perfil.url) {
            const matchID =
                perfil.url.match(/\/profiles\/(\d+)/i);

            if (matchID) {
                steamid = matchID[1];
            }
        }

        if (!steamid && perfil.url.includes("/id/")) {
            try {
                const respuesta = await axios.get(
                    perfil.url,
                    {
                        headers: {
                            "User-Agent": USER_AGENT,
                            Accept: "text/html,application/xhtml+xml"
                        },
                        timeout: 15000,
                        maxRedirects: 5
                    }
                );

                const html =
                    String(respuesta.data || "");

                const patronesID = [
                    /g_steamID\s*=\s*"(\d+)"/i,
                    /"steamid"\s*:\s*"(\d+)"/i,
                    /"steamID64"\s*:\s*"(\d+)"/i,
                    /\/profiles\/(\d+)/i
                ];

                for (const patron of patronesID) {
                    const match = html.match(patron);

                    if (match && match[1]) {
                        steamid = match[1];
                        break;
                    }
                }

            } catch (error) {
                console.log(
                    `[STEAM] No se pudo resolver SteamID de ${perfil.url}: ${error.message}`
                );
            }
        }

        if (!steamid) {
            return;
        }

        perfil.steamid = steamid;

        // =================================================
        // PERFIL
        // =================================================

        const profileURL =
            `${STEAM_BASE}/profiles/${steamid}`;

        try {
            const respuesta = await axios.get(
                profileURL,
                {
                    headers: {
                        "User-Agent": USER_AGENT,
                        Accept:
                            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                        "Accept-Language":
                            "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7"
                    },
                    timeout: 15000,
                    maxRedirects: 5
                }
            );

            const html =
                String(respuesta.data || "");

            const tieneRustHTML =
                html.includes("#252490_") ||
                html.includes("/inventory/") &&
                html.includes("/252490") ||
                html.includes("/gamecards/252490") ||
                html.includes("appid") &&
                html.includes("252490") ||
                html.includes("/app/252490") ||
                html.includes("252490") ||
                /\bRust\b/i.test(html);

            if (tieneRustHTML) {
                perfil.tieneRust = true;
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
                            "User-Agent": USER_AGENT,
                            Accept:
                                "text/html,application/xhtml+xml"
                        },
                        timeout: 15000,
                        maxRedirects: 5
                    }
                );

            const gamesHTML =
                String(respuestaJuegos.data || "");

            if (
                gamesHTML.includes("252490") ||
                /\bRust\b/i.test(gamesHTML)
            ) {
                perfil.tieneRust = true;
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
                            "User-Agent": USER_AGENT,
                            Accept: "application/json,text/plain,*/*"
                        },
                        timeout: 15000,
                        maxRedirects: 5
                    }
                );

            const data =
                respuestaInventario.data;

            if (
                data &&
                (
                    data.success === 1 ||
                    data.success === true
                )
            ) {
                perfil.inventarioRust = true;
                perfil.tieneRust = true;
            }

        } catch (error) {
            const status =
                error.response?.status;

            if (status === 403) {
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
            `[STEAM] Error general comprobando Rust: ${error.message}`
        );
    }
}

// =====================================================
// BATTLEMETRICS
// =====================================================

function esURLBattleMetrics(texto) {
    return /battlemetrics\.com\/players\//i.test(
        texto
    );
}

async function obtenerNombreBattleMetrics(url) {
    try {
        const respuesta = await axios.get(
            url,
            {
                headers: {
                    "User-Agent": USER_AGENT,
                    Accept:
                        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
                },
                timeout: 20000,
                maxRedirects: 5
            }
        );

        const html =
            String(respuesta.data || "");

        const patrones = [
            /<title[^>]*>([\s\S]*?)<\/title>/i,
            /<h1[^>]*>([\s\S]*?)<\/h1>/i,
            /playerName["']?\s*[:=]\s*["']([^"']+)/i
        ];

        for (const patron of patrones) {
            const match =
                html.match(patron);

            if (!match || !match[1]) {
                continue;
            }

            let nombre =
                limpiarHTML(match[1]);

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

function normalizarURLSteam(url) {
    if (!url) {
        return "";
    }

    let resultado = String(url)
        .replace(/&amp;/g, "&")
        .replace(/\\\//g, "/")
        .trim();

    if (resultado.startsWith("//")) {
        resultado = "https:" + resultado;
    }

    if (resultado.startsWith("/")) {
        resultado =
            STEAM_BASE + resultado;
    }

    if (
        !resultado.startsWith("http://") &&
        !resultado.startsWith("https://")
    ) {
        resultado =
            `${STEAM_BASE}/${resultado}`;
    }

    return resultado;
}

// =====================================================
// LIMPIAR URL
// =====================================================

function limpiarURL(url) {
    return String(url || "")
        .replace(/&amp;/g, "&")
        .replace(/\\\//g, "/")
        .trim();
}

// =====================================================
// LIMPIAR HTML
// =====================================================

function limpiarHTML(texto) {
    return String(texto || "")
        .replace(/<[^>]*>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#x27;/gi, "'")
        .replace(/&#x2F;/gi, "/")
        .trim();
}

// =====================================================
// ESPERAR
// =====================================================

function esperar(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}