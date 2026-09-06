const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const axios = require("axios");

const STEAM_BASE = "https://steamcommunity.com";

const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

// =====================================================
// CONFIGURACIÓN
// =====================================================

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
        const entrada = interaction.options.getString("nombre", true).trim();

        console.log("");
        console.log("🎯 Ejecutando /steam");
        console.log(`[STEAM] Entrada recibida: "${entrada}"`);
        console.log("[STEAM] ========================================");

        await interaction.deferReply();

        try {
            let nombreBuscado = entrada;

            // =====================================================
            // BATTLEMETRICS
            // =====================================================

            if (entrada.includes("battlemetrics.com/players/")) {
                console.log("[STEAM] Detectado enlace de BattleMetrics");

                nombreBuscado = await obtenerNombreBattleMetrics(entrada);

                if (!nombreBuscado) {
                    return await interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xff0000)
                                .setTitle("❌ No se pudo obtener el nombre")
                                .setDescription(
                                    "No pude obtener el nombre del jugador desde ese enlace de BattleMetrics."
                                )
                        ]
                    });
                }

                console.log(
                    `[STEAM] Nombre obtenido de BattleMetrics: "${nombreBuscado}"`
                );
            }

            // =====================================================
            // BUSCAR PERFILES
            // =====================================================

            const perfiles = await buscarPerfilesSteam(nombreBuscado);

            if (!perfiles.length) {
                return await interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff0000)
                            .setTitle("❌ No se encontraron perfiles")
                            .setDescription(
                                `No encontré perfiles de Steam con el nombre exacto:\n\n**${nombreBuscado}**`
                            )
                    ]
                });
            }

            console.log("");
            console.log(`[STEAM] RESULTADOS FINALES: ${perfiles.length}`);
            console.log("[STEAM] ========================================");

            // =====================================================
            // PAGINACIÓN
            // =====================================================

            let pagina = 0;

            const totalPaginas = Math.min(
                Math.ceil(perfiles.length / POR_PAGINA),
                MAX_PAGINAS
            );

            // =====================================================
            // CREAR EMBEDS
            // =====================================================

            function crearEmbeds() {
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

                    if (perfil.avatar && esAvatarSteamValido(perfil.avatar)) {
                        embed.setThumbnail(perfil.avatar);
                    }

                    return embed;
                });
            }

            // =====================================================
            // BOTONES
            // =====================================================

            function crearBotones(disabled = false) {
                return new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("steam_anterior")
                        .setLabel("Anterior")
                        .setEmoji("⬅️")
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(
                            disabled || pagina === 0
                        ),

                    new ButtonBuilder()
                        .setCustomId("steam_siguiente")
                        .setLabel("Siguiente")
                        .setEmoji("➡️")
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(
                            disabled ||
                            pagina >= totalPaginas - 1
                        )
                );
            }

            // =====================================================
            // RESPUESTA
            // =====================================================

            await interaction.editReply({
                embeds: crearEmbeds(),
                components:
                    totalPaginas > 1
                        ? [crearBotones()]
                        : []
            });

            if (totalPaginas <= 1) {
                return;
            }

            // =====================================================
            // COLLECTOR
            // =====================================================

            const mensaje = await interaction.fetchReply();

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
                        return await buttonInteraction.reply({
                            content:
                                "❌ Solo la persona que ejecutó este comando puede usar estos botones.",
                            ephemeral: true
                        });
                    }

                    if (
                        buttonInteraction.customId ===
                        "steam_anterior"
                    ) {
                        if (pagina > 0) {
                            pagina--;
                        }
                    }

                    if (
                        buttonInteraction.customId ===
                        "steam_siguiente"
                    ) {
                        if (pagina < totalPaginas - 1) {
                            pagina++;
                        }
                    }

                    await buttonInteraction.update({
                        embeds: crearEmbeds(),
                        components: [crearBotones()]
                    });
                }
            );

            // =====================================================
            // FINALIZAR
            // =====================================================

            collector.on("end", async () => {
                try {
                    await interaction.editReply({
                        embeds: crearEmbeds(),
                        components: [crearBotones(true)]
                    });
                } catch (error) {
                    console.log(
                        "[STEAM] No se pudieron desactivar los botones."
                    );
                }
            });

        } catch (error) {
            console.error("");
            console.error("[STEAM] ERROR GENERAL:");
            console.error(error);
            console.error("");

            try {
                await interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff0000)
                            .setTitle("❌ Error")
                            .setDescription(
                                "Ocurrió un error mientras buscaba los perfiles de Steam."
                            )
                    ],
                    components: []
                });
            } catch (editError) {
                console.error(
                    "[STEAM] No se pudo editar la respuesta."
                );
            }
        }
    }
};

// =====================================================
// OBTENER NOMBRE DESDE BATTLEMETRICS
// =====================================================

async function obtenerNombreBattleMetrics(url) {
    try {
        console.log("[STEAM] Consultando BattleMetrics...");

        const response = await axios.get(url, {
            headers: {
                "User-Agent": USER_AGENT,
                "Accept":
                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language":
                    "es-ES,es;q=0.9,en;q=0.8"
            },
            timeout: 20000,
            maxRedirects: 5
        });

        const html = response.data || "";

        const patrones = [
            /<h1[^>]*>([\s\S]*?)<\/h1>/i,

            /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,

            /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,

            /<title[^>]*>([\s\S]*?)<\/title>/i,

            /"displayName"\s*:\s*"([^"]+)"/i,

            /"username"\s*:\s*"([^"]+)"/i,

            /"name"\s*:\s*"([^"]+)"/i
        ];

        for (const patron of patrones) {
            const match = html.match(patron);

            if (match && match[1]) {
                let nombre = limpiarHTML(match[1]);

                nombre = nombre
                    .replace(/\s*-\s*BattleMetrics.*$/i, "")
                    .trim();

                if (nombre) {
                    console.log(
                        `[STEAM] Nombre encontrado: "${nombre}"`
                    );

                    return nombre;
                }
            }
        }

        return null;

    } catch (error) {
        console.error(
            "[STEAM] Error obteniendo nombre de BattleMetrics:",
            error.message
        );

        return null;
    }
}

// =====================================================
// BUSCAR PERFILES STEAM
// =====================================================

async function buscarPerfilesSteam(nombreBuscado) {
    const perfiles = [];
    const urlsVistas = new Set();

    let paginaSteam = 1;
    let reintentos429 = 0;

    const client = axios.create({
        baseURL: STEAM_BASE,
        timeout: 20000,
        maxRedirects: 5,

        headers: {
            "User-Agent": USER_AGENT,

            "Accept":
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

            "Accept-Language":
                "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7",

            "Cache-Control": "no-cache",
            "Pragma": "no-cache"
        }
    });

    // =====================================================
    // OBTENER SESSIONID
    // =====================================================

    let cookies = "";
    let sessionid = "";

    try {
        console.log("[STEAM] Obteniendo sesión de Steam...");

        const inicio = await client.get(
            `/search/users/?text=${encodeURIComponent(nombreBuscado)}&filter=users`
        );

        if (inicio.headers["set-cookie"]) {
            cookies = inicio.headers["set-cookie"]
                .map(cookie => cookie.split(";")[0])
                .join("; ");
        }

        const sessionMatch = cookies.match(
            /(?:^|;\s*)sessionid=([^;]+)/i
        );

        if (sessionMatch) {
            sessionid = sessionMatch[1];
        }

        if (!sessionid) {
            const html = inicio.data || "";

            const htmlSession = html.match(
                /g_sessionID\s*=\s*["']([^"']+)["']/i
            );

            if (htmlSession) {
                sessionid = htmlSession[1];
            }
        }

        console.log(
            `[STEAM] SessionID: ${
                sessionid ? "OK" : "No encontrado"
            }`
        );

    } catch (error) {
        console.log(
            "[STEAM] No se pudo obtener sessionid:",
            error.message
        );
    }

    // =====================================================
    // BUSCAR PÁGINAS
    // =====================================================

    while (paginaSteam <= MAX_PAGINAS) {
        console.log(
            `[STEAM] Buscando página ${paginaSteam}: ${nombreBuscado}`
        );

        try {
            const response = await client.get(
                "/search/SearchCommunityAjax",
                {
                    params: {
                        text: nombreBuscado,
                        filter: "users",
                        sessionid: sessionid || "",
                        steamid_user: "false",
                        page: paginaSteam
                    },

                    headers: {
                        Cookie: cookies,

                        Referer:
                            `${STEAM_BASE}/search/users/?text=${encodeURIComponent(nombreBuscado)}&filter=users`,

                        "X-Requested-With":
                            "XMLHttpRequest"
                    }
                }
            );

            reintentos429 = 0;

            let html = "";

            if (typeof response.data === "string") {
                html = response.data;
            } else if (response.data) {
                html =
                    response.data.html ||
                    response.data.results_html ||
                    response.data.content ||
                    JSON.stringify(response.data);
            }

            if (!html) {
                console.log(
                    `[STEAM] Página ${paginaSteam} no devolvió resultados.`
                );

                break;
            }

            const encontrados =
                extraerPerfilesDesdeHTML(html);

            console.log(
                `[STEAM] Página ${paginaSteam}: ${encontrados.length} perfiles encontrados`
            );

            if (!encontrados.length) {
                break;
            }

            let exactosEnPagina = 0;

            for (const perfil of encontrados) {

                // =================================================
                // NOMBRE EXACTO
                // =================================================

                if (perfil.nombre !== nombreBuscado) {
                    continue;
                }

                exactosEnPagina++;

                if (urlsVistas.has(perfil.url)) {
                    continue;
                }

                urlsVistas.add(perfil.url);

                console.log("");
                console.log(
                    `[STEAM] Perfil exacto encontrado: ${perfil.nombre}`
                );

                console.log(
                    `[STEAM] URL: ${perfil.url}`
                );

                // =================================================
                // AVATAR REAL
                // =================================================

                perfil.avatar =
                    await obtenerAvatarPerfilSteam(perfil);

                if (perfil.avatar) {
                    console.log(
                        `[STEAM] Avatar REAL encontrado: ${perfil.avatar}`
                    );
                } else {
                    console.log(
                        "[STEAM] No se encontró avatar real."
                    );
                }

                // =================================================
                // RUST
                // =================================================

                await comprobarRustSteam(perfil);

                perfiles.push(perfil);

                console.log(
                    `[STEAM] Rust: ${
                        perfil.tieneRust
                            ? "SI"
                            : "NO CONFIRMADO"
                    }`
                );

                console.log(
                    `[STEAM] Inventario Rust: ${
                        perfil.inventarioRust
                            ? "SI"
                            : "NO CONFIRMADO"
                    }`
                );
            }

            if (exactosEnPagina === 0) {
                console.log(
                    `[STEAM] No hubo coincidencias exactas en página ${paginaSteam}.`
                );
            }

            paginaSteam++;

            if (paginaSteam <= MAX_PAGINAS) {
                await esperar(ESPERA_ENTRE_PAGINAS);
            }

        } catch (error) {

            // =================================================
            // 429
            // =================================================

            if (
                error.response &&
                error.response.status === 429
            ) {
                console.log(
                    "[STEAM] ⚠️ Steam respondió 429."
                );

                if (
                    reintentos429 <
                    MAX_REINTENTOS_429
                ) {
                    reintentos429++;

                    console.log(
                        `[STEAM] Esperando ${ESPERA_429}ms antes de reintentar...`
                    );

                    await esperar(ESPERA_429);

                    continue;
                }

                console.log(
                    "[STEAM] Máximo de reintentos 429 alcanzado."
                );

                break;
            }

            console.error(
                `[STEAM] Error página ${paginaSteam}:`,
                error.message
            );

            break;
        }
    }

    // =====================================================
    // ORDENAR
    // =====================================================

    perfiles.sort((a, b) => {
        if (a.tieneRust && !b.tieneRust) {
            return -1;
        }

        if (!a.tieneRust && b.tieneRust) {
            return 1;
        }

        return a.nombre.localeCompare(
            b.nombre,
            "es",
            {
                sensitivity: "base"
            }
        );
    });

    return perfiles;
}

// =====================================================
// EXTRAER PERFILES
// =====================================================

function extraerPerfilesDesdeHTML(html) {
    const perfiles = [];

    const regexPrincipal =
        /<a[^>]+class=["'][^"']*searchPersonaName[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

    const regexAlternativo =
        /<a[^>]+href=["']([^"']+)["'][^>]+class=["'][^"']*searchPersonaName[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;

    const encontrados = [];

    let match;

    while (
        (match = regexPrincipal.exec(html)) !== null
    ) {
        encontrados.push(match);
    }

    if (!encontrados.length) {
        while (
            (match = regexAlternativo.exec(html)) !== null
        ) {
            encontrados.push(match);
        }
    }

    for (const resultado of encontrados) {
        let url = resultado[1];
        let nombre = resultado[2];

        url = limpiarURL(url);
        nombre = limpiarHTML(nombre).trim();

        if (!url || !nombre) {
            continue;
        }

        if (!url.startsWith("http")) {
            url = `${STEAM_BASE}${url}`;
        }

        const steamidMatch =
            url.match(/\/profiles\/(\d+)/i);

        const steamid =
            steamidMatch
                ? steamidMatch[1]
                : null;

        perfiles.push({
            nombre,
            url,
            steamid,
            avatar: "",
            tieneRust: false,
            inventarioRust: false
        });
    }

    return perfiles;
}

// =====================================================
// OBTENER AVATAR REAL DEL PERFIL
// =====================================================

async function obtenerAvatarPerfilSteam(perfil) {
    try {
        console.log(
            `[STEAM] Buscando avatar REAL de: ${perfil.nombre}`
        );

        // =================================================
        // OBTENER STEAMID
        // =================================================

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
                "[STEAM] No hay SteamID64 para obtener avatar."
            );

            return "";
        }

        perfil.steamid = steamid;

        console.log(
            `[STEAM] SteamID64 para avatar: ${steamid}`
        );

        // =================================================
        // MÉTODO 1: XML DE STEAM
        // =================================================

        try {
            const xmlURL =
                `${STEAM_BASE}/profiles/${steamid}/?xml=1`;

            console.log(
                `[STEAM] Consultando avatar XML: ${xmlURL}`
            );

            const response = await axios.get(
                xmlURL,
                {
                    headers: {
                        "User-Agent": USER_AGENT,
                        "Accept":
                            "application/xml,text/xml,*/*"
                    },

                    timeout: 15000,

                    maxRedirects: 5
                }
            );

            const xml = response.data || "";

            const patronesXML = [
                /<avatarFull><!\[CDATA\[(.*?)\]\]><\/avatarFull>/i,
                /<avatarFull>(.*?)<\/avatarFull>/i,

                /<avatarMedium><!\[CDATA\[(.*?)\]\]><\/avatarMedium>/i,
                /<avatarMedium>(.*?)<\/avatarMedium>/i,

                /<avatar><!\[CDATA\[(.*?)\]\]><\/avatar>/i,
                /<avatar>(.*?)<\/avatar>/i
            ];

            for (const patron of patronesXML) {
                const match = xml.match(patron);

                if (!match || !match[1]) {
                    continue;
                }

                const avatar =
                    limpiarURL(match[1]);

                if (esAvatarSteamValido(avatar)) {
                    console.log(
                        `[STEAM] ✅ Avatar encontrado mediante XML: ${avatar}`
                    );

                    return avatar;
                }
            }

            console.log(
                "[STEAM] XML respondió pero no contiene un avatar válido."
            );

        } catch (error) {
            console.log(
                `[STEAM] XML avatar falló: ${error.message}`
            );
        }

        // =================================================
        // MÉTODO 2: HTML DEL PERFIL
        // =================================================

        try {
            const profileURL =
                `${STEAM_BASE}/profiles/${steamid}`;

            console.log(
                "[STEAM] Intentando obtener avatar desde HTML..."
            );

            const response = await axios.get(
                profileURL,
                {
                    headers: {
                        "User-Agent": USER_AGENT,

                        "Accept":
                            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

                        "Accept-Language":
                            "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7"
                    },

                    timeout: 15000,

                    maxRedirects: 5
                }
            );

            const html = response.data || "";

            // =================================================
            // g_rgProfileData
            // =================================================

            const patrones = [
                /"avatarfull"\s*:\s*"([^"]+)"/i,

                /"avatarmedium"\s*:\s*"([^"]+)"/i,

                /"avatar"\s*:\s*"([^"]+)"/i,

                /"avatarFull"\s*:\s*"([^"]+)"/i,

                /"avatarMedium"\s*:\s*"([^"]+)"/i,

                /data-avatarfull=["']([^"']+)["']/i,

                /data-avatarmedium=["']([^"']+)["']/i,

                /<img[^>]+class=["'][^"']*playerAvatarAutoSize[^"']*["'][^>]+src=["']([^"']+)["']/i,

                /<img[^>]+class=["'][^"']*playerAvatar[^"']*["'][^>]+src=["']([^"']+)["']/i,

                /<img[^>]+src=["']([^"']*avatars\.steamstatic\.com[^"']+)["']/i,

                /<img[^>]+src=["']([^"']*avatars\.akamaihd\.net[^"']+)["']/i,

                /<img[^>]+data-src=["']([^"']*avatars\.steamstatic\.com[^"']+)["']/i,

                /<img[^>]+data-src=["']([^"']*avatars\.akamaihd\.net[^"']+)["']/i
            ];

            for (const patron of patrones) {
                const match = html.match(patron);

                if (!match || !match[1]) {
                    continue;
                }

                let avatar = match[1];

                avatar = avatar
                    .replace(/\\\//g, "/")
                    .replace(/\\"/g, '"')
                    .replace(/&amp;/g, "&")
                    .trim();

                if (!esAvatarSteamValido(avatar)) {
                    continue;
                }

                console.log(
                    `[STEAM] ✅ Avatar encontrado mediante HTML: ${avatar}`
                );

                return avatar;
            }

        } catch (error) {
            console.log(
                `[STEAM] HTML avatar falló: ${error.message}`
            );
        }

        console.log(
            "[STEAM] ❌ No se encontró un avatar real."
        );

        return "";

    } catch (error) {
        console.log(
            `[STEAM] Error obteniendo avatar: ${error.message}`
        );

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

    const avatar = String(url).trim();

    // =================================================
    // DESCARTAR IMÁGENES GENÉRICAS
    // =================================================

    if (
        avatar.includes("steam_share_image") ||
        avatar.includes("steam_share") ||
        avatar.includes("default_avatar")
    ) {
        return false;
    }

    // =================================================
    // CDN ACTUAL
    // =================================================

    if (
        avatar.startsWith(
            "https://avatars.steamstatic.com/"
        ) ||

        avatar.startsWith(
            "http://avatars.steamstatic.com/"
        ) ||

        avatar.startsWith(
            "https://avatars.akamaihd.net/"
        ) ||

        avatar.startsWith(
            "http://avatars.akamaihd.net/"
        )
    ) {
        return true;
    }

    // =================================================
    // CDN ANTIGUO DE STEAM
    // =================================================

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
        // OBTENER STEAMID DESDE /id/
        // =================================================

        if (
            !steamid &&
            perfil.url.includes("/id/")
        ) {
            try {
                const response = await axios.get(
                    perfil.url,
                    {
                        headers: {
                            "User-Agent": USER_AGENT
                        },

                        timeout: 15000,

                        maxRedirects: 5
                    }
                );

                const html = response.data || "";

                const patronesSteamID = [
                    /g_steamID\s*=\s*["'](\d+)["']/i,

                    /"steamid"\s*:\s*"(\d+)"/i,

                    /"steamID64"\s*:\s*"(\d+)"/i,

                    /\/profiles\/(\d+)/i
                ];

                for (const patron of patronesSteamID) {
                    const match =
                        html.match(patron);

                    if (
                        match &&
                        match[1]
                    ) {
                        steamid = match[1];
                        break;
                    }
                }

            } catch (error) {
                console.log(
                    `[STEAM] Error obteniendo SteamID: ${error.message}`
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
            const response =
                await axios.get(
                    profileURL,
                    {
                        headers: {
                            "User-Agent":
                                USER_AGENT
                        },

                        timeout: 15000
                    }
                );

            const html =
                response.data || "";

            const patronesRust = [
                /#252490_/i,

                /\/inventory\/\d+\/252490/i,

                /\/gamecards\/252490/i,

                /appid["'=:\s]+["']?252490/i,

                /\/app\/252490(?:\/|["'#?])/i,

                /\b252490\b/i,

                /\bRust\b/i
            ];

            for (
                const patron of patronesRust
            ) {
                if (patron.test(html)) {
                    perfil.tieneRust = true;
                    break;
                }
            }

        } catch (error) {
            console.log(
                `[STEAM] Error revisando perfil Rust: ${error.message}`
            );
        }

        // =================================================
        // GAMES
        // =================================================

        try {
            const gamesURL =
                `${STEAM_BASE}/profiles/${steamid}/games/?tab=all`;

            const response =
                await axios.get(
                    gamesURL,
                    {
                        headers: {
                            "User-Agent":
                                USER_AGENT
                        },

                        timeout: 15000
                    }
                );

            const html =
                response.data || "";

            if (
                /252490/i.test(html) ||
                /\bRust\b/i.test(html)
            ) {
                perfil.tieneRust = true;
            }

        } catch (error) {
            console.log(
                `[STEAM] Error revisando juegos: ${error.message}`
            );
        }

        // =================================================
        // INVENTARIO RUST
        // =================================================

        try {
            const inventoryURL =
                `${STEAM_BASE}/inventory/${steamid}/252490/2?l=english&count=1`;

            const response =
                await axios.get(
                    inventoryURL,
                    {
                        headers: {
                            "User-Agent":
                                USER_AGENT,

                            "Accept":
                                "application/json,text/plain,*/*"
                        },

                        timeout: 15000
                    }
                );

            if (
                response.data &&
                response.data.success === 1
            ) {
                perfil.inventarioRust = true;
                perfil.tieneRust = true;
            }

        } catch (error) {
            if (
                error.response &&
                error.response.status === 403
            ) {
                console.log(
                    "[STEAM] Inventario Rust privado o bloqueado (403)."
                );
            } else {
                console.log(
                    `[STEAM] Error inventario Rust: ${error.message}`
                );
            }
        }

    } catch (error) {
        console.log(
            `[STEAM] Error comprobando Rust: ${error.message}`
        );
    }
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