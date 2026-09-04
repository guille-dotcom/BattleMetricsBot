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

const MAX_PAGINAS = 50;
const MAX_REINTENTOS_429 = 3;
const CONCURRENCIA_RUST = 3;

const esperar = ms =>
    new Promise(resolve => setTimeout(resolve, ms));


// ================================================================
// COMANDO
// ================================================================

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

        const entrada =
            interaction.options.getString("nombre").trim();

        console.log("\n🎯 Ejecutando /steam");
        console.log(`[STEAM] Entrada recibida: ${entrada}`);

        await interaction.deferReply();

        try {

            let nombreBuscado = entrada;

            // ====================================================
            // BATTLEMETRICS
            // ====================================================

            if (
                entrada.includes("battlemetrics.com/players/") ||
                entrada.includes("battlemetrics.com/players")
            ) {

                console.log(
                    "[STEAM] Detectado enlace de BattleMetrics."
                );

                console.log(
                    "[STEAM] Obteniendo nombre desde BattleMetrics..."
                );

                const nombreBM =
                    await obtenerNombreBattleMetrics(entrada);

                if (!nombreBM) {

                    await interaction.editReply(
                        "❌ No pude obtener el nombre del jugador desde BattleMetrics."
                    );

                    return;
                }

                nombreBuscado =
                    nombreBM.trim();

                console.log(
                    `[STEAM] Nombre obtenido de BattleMetrics: ${nombreBuscado}`
                );
            }

            // ====================================================
            // BUSCAR
            // ====================================================

            console.log(
                `[STEAM] Buscando perfiles con nombre exacto: ${nombreBuscado}`
            );

            const perfiles =
                await buscarPerfilesSteam(nombreBuscado);

            const rustConfirmado =
                perfiles.filter(p => p.tieneRust).length;

            const rustNoConfirmado =
                perfiles.filter(p => !p.tieneRust).length;

            console.log(
                `[STEAM] RESULTADO FINAL: ${perfiles.length} coincidencias exactas.`
            );

            console.log(
                `[STEAM] Rust confirmado: ${rustConfirmado}`
            );

            console.log(
                `[STEAM] Rust no confirmado: ${rustNoConfirmado}`
            );

            console.log(
                `[STEAM] PERFILES DEVUELTOS: ${perfiles.length}`
            );

            // ====================================================
            // SIN RESULTADOS
            // ====================================================

            if (!perfiles.length) {

                await interaction.editReply(
                    `❌ No encontré perfiles de Steam con el nombre exacto:\n\`${nombreBuscado}\``
                );

                return;
            }

            // ====================================================
            // PAGINACIÓN
            // ====================================================

            const porPagina = 10;

            const totalPaginas =
                Math.ceil(perfiles.length / porPagina);

            let paginaActual = 0;

            function crearEmbed(pagina) {

                const inicio =
                    pagina * porPagina;

                const perfilesPagina =
                    perfiles.slice(
                        inicio,
                        inicio + porPagina
                    );

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            `🔎 Steam — "${nombreBuscado}"`
                        )
                        .setDescription(
                            `Coincidencias exactas: **${perfiles.length}**`
                        )
                        .setColor(0x1b2838)
                        .setFooter({
                            text:
                                `Página ${pagina + 1}/${totalPaginas}`
                        });

                perfilesPagina.forEach(
                    (perfil, index) => {

                        const numero =
                            inicio + index + 1;

                        let texto =
                            `🔗 [Abrir perfil](${perfil.url})\n`;

                        texto +=
                            `🆔 SteamID64: \`${perfil.steamid || "No detectado"}\`\n`;

                        if (perfil.tieneRust) {

                            texto +=
                                `🎮 Rust: **Sí**\n`;

                            if (perfil.tieneInventarioRust) {

                                texto +=
                                    `🎒 Inventario/skins de Rust: **Sí**`;

                            } else {

                                texto +=
                                    `🎒 Inventario/skins de Rust: **No confirmado**`;
                            }

                        } else {

                            texto +=
                                `🎮 Rust: **No confirmado**\n`;

                            texto +=
                                `🎒 Inventario/skins de Rust: **No confirmado**`;
                        }

                        embed.addFields({
                            name:
                                `${numero}. ${perfil.nombre}`,
                            value:
                                texto,
                            inline: false
                        });
                    }
                );

                return embed;
            }

            function crearBotones(pagina) {

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
                                pagina === 0
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
                                pagina >= totalPaginas - 1
                            )
                    );
            }

            const mensaje =
                await interaction.editReply({
                    embeds: [
                        crearEmbed(paginaActual)
                    ],
                    components:
                        totalPaginas > 1
                            ? [crearBotones(paginaActual)]
                            : []
                });

            if (totalPaginas <= 1) {
                return;
            }

            // ====================================================
            // BOTONES
            // ====================================================

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
                        embeds: [
                            crearEmbed(paginaActual)
                        ],
                        components: [
                            crearBotones(paginaActual)
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
                                new ActionRowBuilder()
                                    .addComponents(

                                        new ButtonBuilder()
                                            .setCustomId(
                                                "steam_anterior_fin"
                                            )
                                            .setLabel(
                                                "◀ Anterior"
                                            )
                                            .setStyle(
                                                ButtonStyle.Secondary
                                            )
                                            .setDisabled(
                                                true
                                            ),

                                        new ButtonBuilder()
                                            .setCustomId(
                                                "steam_siguiente_fin"
                                            )
                                            .setLabel(
                                                "Siguiente ▶"
                                            )
                                            .setStyle(
                                                ButtonStyle.Secondary
                                            )
                                            .setDisabled(
                                                true
                                            )
                                    )
                            ]
                        });

                    } catch {
                        // Mensaje eliminado.
                    }
                }
            );

        } catch (error) {

            console.error(
                "[STEAM] ERROR GENERAL:",
                error
            );

            try {

                await interaction.editReply(
                    "❌ Ocurrió un error mientras buscaba en Steam."
                );

            } catch {
                // Ignorar.
            }
        }
    }
};


// ================================================================
// BATTLEMETRICS → NOMBRE
// ================================================================

async function obtenerNombreBattleMetrics(url) {

    try {

        const response =
            await axios.get(url, {
                headers: {
                    "User-Agent": USER_AGENT,
                    "Accept":
                        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language":
                        "es-ES,es;q=0.9,en;q=0.8"
                },
                timeout: 20000
            });

        const html =
            response.data;

        let nombre = null;

        let match =
            html.match(
                /<h1[^>]*>([\s\S]*?)<\/h1>/i
            );

        if (match) {
            nombre =
                limpiarHTML(match[1]);
        }

        if (!nombre) {

            match =
                html.match(
                    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
                );

            if (match) {
                nombre =
                    limpiarHTML(match[1]);
            }
        }

        if (!nombre) {

            match =
                html.match(
                    /<title[^>]*>([\s\S]*?)<\/title>/i
                );

            if (match) {
                nombre =
                    limpiarHTML(match[1]);
            }
        }

        if (!nombre) {

            match =
                html.match(
                    /"name"\s*:\s*"([^"]+)"/i
                );

            if (match) {
                nombre =
                    match[1];
            }
        }

        if (!nombre) {

            match =
                html.match(
                    /"displayName"\s*:\s*"([^"]+)"/i
                );

            if (match) {
                nombre =
                    match[1];
            }
        }

        if (!nombre) {

            match =
                html.match(
                    /"username"\s*:\s*"([^"]+)"/i
                );

            if (match) {
                nombre =
                    match[1];
            }
        }

        if (!nombre) {
            return null;
        }

        nombre =
            nombre
                .replace(
                    /\s*-\s*BattleMetrics.*$/i,
                    ""
                )
                .replace(
                    /\s+/g,
                    " "
                )
                .trim();

        console.log(
            `[BATTLEMETRICS] Nombre detectado: ${nombre}`
        );

        return nombre;

    } catch (error) {

        console.error(
            "[BATTLEMETRICS] Error:",
            error.message
        );

        return null;
    }
}


// ================================================================
// SESIÓN STEAM
// ================================================================

async function obtenerSesionSteam() {

    console.log(
        "[STEAM] Obteniendo sesión de Steam..."
    );

    for (let intento = 1; intento <= 3; intento++) {

        try {

            const response =
                await axios.get(
                    `${STEAM_BASE}/search/users/`,
                    {
                        headers: {
                            "User-Agent":
                                USER_AGENT,
                            "Accept":
                                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                            "Accept-Language":
                                "es-ES,es;q=0.9,en;q=0.8"
                        },
                        timeout: 15000
                    }
                );

            const cookies =
                response.headers["set-cookie"] || [];

            let sessionid = null;

            for (const cookie of cookies) {

                const match =
                    cookie.match(
                        /sessionid=([^;]+)/
                    );

                if (match) {

                    sessionid =
                        match[1];

                    break;
                }
            }

            if (!sessionid) {

                const match =
                    response.data.match(
                        /g_sessionID\s*=\s*["']([^"']+)["']/i
                    );

                if (match) {
                    sessionid =
                        match[1];
                }
            }

            if (sessionid) {

                console.log(
                    "[STEAM] Sesión obtenida correctamente."
                );

                return {
                    sessionid,
                    cookie:
                        cookies
                            .map(
                                c =>
                                    c.split(";")[0]
                            )
                            .join("; ")
                };
            }

        } catch (error) {

            console.log(
                `[STEAM] Error obteniendo sesión: ${error.message}`
            );

            if (
                error.response?.status ===
                429
            ) {

                await esperar(
                    3000 * intento
                );

            } else {

                await esperar(1000);
            }
        }
    }

    throw new Error(
        "No se pudo obtener la sesión de Steam."
    );
}


// ================================================================
// BÚSQUEDA STEAM
// ================================================================

async function buscarPerfilesSteam(
    nombreBuscado
) {

    const sesion =
        await obtenerSesionSteam();

    const perfilesExactos = [];

    const urlsVistas =
        new Set();

    let paginasSinResultados = 0;

    for (
        let pagina = 1;
        pagina <= MAX_PAGINAS;
        pagina++
    ) {

        console.log(
            `[STEAM] Buscando página ${pagina}`
        );

        let response;

        try {

            response =
                await buscarPaginaSteam(
                    nombreBuscado,
                    pagina,
                    sesion
                );

        } catch (error) {

            console.log(
                `[STEAM] Error página ${pagina}: ${error.message}`
            );

            if (
                error.response?.status ===
                429
            ) {

                console.log(
                    "[STEAM] Steam está limitando las peticiones. Esperando..."
                );

                await esperar(5000);

                pagina--;

                continue;
            }

            paginasSinResultados++;

            if (
                paginasSinResultados >= 2
            ) {
                break;
            }

            continue;
        }

        const html =
            obtenerHTMLRespuesta(
                response.data
            );

        if (!html) {

            paginasSinResultados++;

            if (
                paginasSinResultados >= 2
            ) {
                break;
            }

            continue;
        }

        const bloques =
            extraerBloquesBusqueda(
                html
            );

        console.log(
            `[STEAM] Resultados encontrados en HTML: ${bloques.length}`
        );

        // ========================================================
        // FALLBACK
        // ========================================================

        if (!bloques.length) {

            const fallback =
                extraerPerfilesFallback(
                    html
                );

            if (!fallback.length) {

                paginasSinResultados++;

                if (
                    paginasSinResultados >= 2
                ) {
                    break;
                }

                continue;
            }

            paginasSinResultados = 0;

            for (const perfil of fallback) {

                if (
                    perfil.nombre !==
                    nombreBuscado
                ) {
                    continue;
                }

                if (!perfil.url) {
                    continue;
                }

                if (
                    urlsVistas.has(
                        perfil.url
                    )
                ) {
                    continue;
                }

                urlsVistas.add(
                    perfil.url
                );

                perfilesExactos.push({
                    ...perfil,
                    tieneRust: false,
                    tieneInventarioRust: false,
                    steamid:
                        perfil.steamid ||
                        extraerSteamID(perfil.url)
                });
            }

        } else {

            paginasSinResultados = 0;

            for (const bloque of bloques) {

                const perfil =
                    procesarBloque(
                        bloque
                    );

                if (!perfil) {
                    continue;
                }

                // EXACTO Y CASE-SENSITIVE
                if (
                    perfil.nombre !==
                    nombreBuscado
                ) {
                    continue;
                }

                if (!perfil.url) {
                    continue;
                }

                if (
                    urlsVistas.has(
                        perfil.url
                    )
                ) {
                    continue;
                }

                urlsVistas.add(
                    perfil.url
                );

                perfilesExactos.push({
                    ...perfil,
                    tieneRust: false,
                    tieneInventarioRust: false
                });

                console.log(
                    `[STEAM] Coincidencia exacta: ${perfil.nombre}`
                );
            }
        }

        // ========================================================
        // SI NO HAY NADA EN ESTA PÁGINA
        // ========================================================

        if (!bloques.length) {

            // Nada que hacer.
        }

        // ========================================================
        // PAUSA MUY CORTA
        // ========================================================

        await esperar(350);
    }

    console.log(
        `[STEAM] Perfiles exactos encontrados antes de Rust: ${perfilesExactos.length}`
    );

    // ============================================================
    // COMPROBAR RUST EN PARALELO
    // ============================================================

    await comprobarRustEnParalelo(
        perfilesExactos
    );

    // ============================================================
    // RUST PRIMERO
    // ============================================================

    perfilesExactos.sort(
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

            return 0;
        }
    );

    return perfilesExactos;
}


// ================================================================
// PETICIÓN DE UNA PÁGINA
// ================================================================

async function buscarPaginaSteam(
    nombreBuscado,
    pagina,
    sesion
) {

    let ultimoError = null;

    for (
        let intento = 1;
        intento <= MAX_REINTENTOS_429;
        intento++
    ) {

        try {

            const response =
                await axios.get(
                    `${STEAM_BASE}/search/SearchCommunityAjax`,
                    {
                        params: {
                            text:
                                nombreBuscado,
                            filter:
                                "users",
                            sessionid:
                                sesion.sessionid,
                            steamid_user:
                                "false",
                            page:
                                pagina
                        },

                        headers: {
                            "User-Agent":
                                USER_AGENT,
                            "Accept":
                                "application/json, text/javascript, */*; q=0.01",
                            "Accept-Language":
                                "es-ES,es;q=0.9,en;q=0.8",
                            "X-Requested-With":
                                "XMLHttpRequest",
                            "Referer":
                                `${STEAM_BASE}/search/users/?text=${encodeURIComponent(nombreBuscado)}`,
                            "Origin":
                                STEAM_BASE,
                            "Cookie":
                                sesion.cookie
                        },

                        timeout: 15000,

                        validateStatus:
                            status =>
                                status >= 200 &&
                                status < 500
                    }
                );

            if (
                response.status ===
                429
            ) {

                console.log(
                    `[STEAM] 429 página ${pagina} — intento ${intento}/${MAX_REINTENTOS_429}`
                );

                ultimoError =
                    new Error(
                        "Steam HTTP 429"
                    );

                ultimoError.response =
                    response;

                if (
                    intento <
                    MAX_REINTENTOS_429
                ) {

                    await esperar(
                        3000 * intento
                    );

                    continue;
                }

                throw ultimoError;
            }

            if (
                response.status >= 400
            ) {

                const error =
                    new Error(
                        `Steam HTTP ${response.status}`
                    );

                error.response =
                    response;

                throw error;
            }

            return response;

        } catch (error) {

            ultimoError =
                error;

            if (
                error.response?.status ===
                429
            ) {
                continue;
            }

            throw error;
        }
    }

    throw (
        ultimoError ||
        new Error(
            "Steam no respondió."
        )
    );
}


// ================================================================
// COMPROBAR RUST EN PARALELO
// ================================================================

async function comprobarRustEnParalelo(
    perfiles
) {

    let indice = 0;

    async function trabajador() {

        while (
            indice <
            perfiles.length
        ) {

            const actual =
                indice++;

            const perfil =
                perfiles[actual];

            const datos =
                await comprobarRustSteam(
                    perfil
                );

            perfiles[actual] = {
                ...perfil,
                ...datos
            };
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
}


// ================================================================
// COMPROBAR RUST
// ================================================================

async function comprobarRustSteam(
    perfil
) {

    let steamid =
        perfil.steamid ||
        null;

    let tieneRust =
        false;

    let tieneInventarioRust =
        false;

    let perfilHTML = "";

    try {

        // ========================================================
        // STEAMID
        // ========================================================

        if (!steamid) {

            steamid =
                extraerSteamID(
                    perfil.url
                );
        }

        // ========================================================
        // PERFIL
        // ========================================================

        if (perfil.url) {

            try {

                const response =
                    await axios.get(
                        perfil.url,
                        {
                            headers: {
                                "User-Agent":
                                    USER_AGENT,
                                "Accept":
                                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
                            },

                            timeout: 12000,

                            validateStatus:
                                status =>
                                    status >= 200 &&
                                    status < 500
                        }
                    );

                if (
                    response.status ===
                    200
                ) {

                    perfilHTML =
                        response.data;

                    // Por si el perfil era vanity
                    if (!steamid) {

                        steamid =
                            extraerSteamIDDesdeHTML(
                                perfilHTML
                            );
                    }
                }

            } catch (error) {

                console.log(
                    `[STEAM] Error perfil ${perfil.url}: ${error.message}`
                );
            }
        }

        // ========================================================
        // DETECTAR RUST EN PERFIL
        // ========================================================

        if (perfilHTML) {

            if (
                /#252490_/i.test(
                    perfilHTML
                ) ||
                /\/inventory\/(?:\d+)\/252490/i.test(
                    perfilHTML
                ) ||
                /\/gamecards\/252490/i.test(
                    perfilHTML
                ) ||
                /\/app\/252490(?:\/|["'#?])/i.test(
                    perfilHTML
                )
            ) {

                tieneRust = true;

                tieneInventarioRust =
                    true;
            }

            if (
                /\b252490\b/i.test(
                    perfilHTML
                ) ||
                /\bRust\b/i.test(
                    perfilHTML
                )
            ) {

                tieneRust = true;
            }
        }

        // ========================================================
        // JUEGOS
        // ========================================================

        if (steamid) {

            try {

                const response =
                    await axios.get(
                        `${STEAM_BASE}/profiles/${steamid}/games/?tab=all`,
                        {
                            headers: {
                                "User-Agent":
                                    USER_AGENT,
                                "Accept":
                                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
                            },

                            timeout: 12000,

                            validateStatus:
                                status =>
                                    status >= 200 &&
                                    status < 500
                        }
                    );

                if (
                    response.status ===
                    200
                ) {

                    const html =
                        response.data;

                    if (
                        /\/app\/252490\//i.test(
                            html
                        ) ||
                        /app\/252490/i.test(
                            html
                        ) ||
                        /\b252490\b/i.test(
                            html
                        ) ||
                        /\bRust\b/i.test(
                            html
                        )
                    ) {

                        tieneRust = true;
                    }
                }

            } catch (error) {

                // No detener la búsqueda por esto.
            }
        }

        // ========================================================
        // INVENTARIO DIRECTO
        // ========================================================

        if (steamid) {

            try {

                const response =
                    await axios.get(
                        `${STEAM_BASE}/inventory/${steamid}/252490/2?l=english&count=1`,
                        {
                            headers: {
                                "User-Agent":
                                    USER_AGENT,
                                "Accept":
                                    "application/json, text/plain, */*"
                            },

                            timeout: 10000,

                            validateStatus:
                                status =>
                                    status >= 200 &&
                                    status < 500
                        }
                    );

                if (
                    response.status ===
                    200 &&
                    response.data &&
                    response.data.success ===
                    1
                ) {

                    tieneRust = true;

                    tieneInventarioRust =
                        true;
                }

                if (
                    response.status ===
                    403
                ) {

                    console.log(
                        `[STEAM] Inventario 403: ${steamid}`
                    );
                }

            } catch {
                // No descartar perfil.
            }
        }

    } catch (error) {

        console.log(
            `[STEAM] Error comprobando Rust: ${error.message}`
        );
    }

    console.log(
        `[STEAM] ${perfil.nombre} | Rust: ${tieneRust ? "Sí" : "No confirmado"} | Inventario: ${tieneInventarioRust ? "Sí" : "No confirmado"}`
    );

    return {
        steamid,
        tieneRust,
        tieneInventarioRust
    };
}


// ================================================================
// EXTRAER STEAMID DE URL
// ================================================================

function extraerSteamID(url) {

    if (!url) {
        return null;
    }

    const match =
        url.match(
            /\/profiles\/(\d+)/i
        );

    return match
        ? match[1]
        : null;
}


// ================================================================
// EXTRAER STEAMID DESDE HTML
// ================================================================

function extraerSteamIDDesdeHTML(
    html
) {

    if (!html) {
        return null;
    }

    let match =
        html.match(
            /g_steamID\s*=\s*["'](\d+)["']/i
        );

    if (match) {
        return match[1];
    }

    match =
        html.match(
            /"steamid"\s*:\s*"(\d+)"/i
        );

    if (match) {
        return match[1];
    }

    match =
        html.match(
            /"steamID64"\s*:\s*"(\d+)"/i
        );

    if (match) {
        return match[1];
    }

    match =
        html.match(
            /\/profiles\/(\d+)/i
        );

    if (match) {
        return match[1];
    }

    return null;
}


// ================================================================
// OBTENER HTML AJAX
// ================================================================

function obtenerHTMLRespuesta(
    data
) {

    if (!data) {
        return "";
    }

    if (
        typeof data ===
        "string"
    ) {

        try {

            const json =
                JSON.parse(data);

            return (
                json.html ||
                json.results_html ||
                json.resultsHtml ||
                json.content ||
                json.data ||
                ""
            );

        } catch {

            return data;
        }
    }

    if (
        typeof data ===
        "object"
    ) {

        return (
            data.html ||
            data.results_html ||
            data.resultsHtml ||
            data.content ||
            data.data ||
            ""
        );
    }

    return "";
}


// ================================================================
// EXTRAER SEARCH ROW
// ================================================================

function extraerBloquesBusqueda(
    html
) {

    const regex =
        /<div[^>]+class=["'][^"']*search_row[^"']*["'][^>]*>[\s\S]*?(?=<div[^>]+class=["'][^"']*search_row[^"']*["']|$)/gi;

    return (
        html.match(regex) ||
        []
    );
}


// ================================================================
// FALLBACK
// ================================================================

function extraerPerfilesFallback(
    html
) {

    const resultados = [];

    const regex =
        /<a[^>]+href=["'](https?:\/\/steamcommunity\.com\/(?:profiles\/\d+|id\/[^"'?#]+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;

    let match;

    while (
        (match = regex.exec(html)) !==
        null
    ) {

        const url =
            match[1];

        const nombre =
            limpiarHTML(
                match[2]
            );

        if (!nombre) {
            continue;
        }

        resultados.push({
            nombre,
            url,
            steamid:
                extraerSteamID(url)
        });
    }

    return resultados;
}


// ================================================================
// PROCESAR SEARCH ROW
// ================================================================

function procesarBloque(
    bloque
) {

    let nombre = null;

    let match =
        bloque.match(
            /class=["'][^"']*searchPersonaName[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i
        );

    if (match) {

        nombre =
            limpiarHTML(
                match[1]
            );
    }

    if (!nombre) {

        match =
            bloque.match(
                /searchPersonaName[^>]*>([\s\S]*?)<\/[^>]+>/i
            );

        if (match) {

            nombre =
                limpiarHTML(
                    match[1]
                );
        }
    }

    if (!nombre) {

        match =
            bloque.match(
                /<span[^>]*>([\s\S]*?)<\/span>/i
            );

        if (match) {

            nombre =
                limpiarHTML(
                    match[1]
                );
        }
    }

    if (!nombre) {
        return null;
    }

    let url = null;

    match =
        bloque.match(
            /href=["'](https?:\/\/steamcommunity\.com\/(?:profiles\/\d+|id\/[^"'?#]+)[^"']*)["']/i
        );

    if (match) {

        url =
            match[1];
    }

    if (!url) {

        match =
            bloque.match(
                /href=["'](\/(?:profiles\/\d+|id\/[^"'?#]+)[^"']*)["']/i
            );

        if (match) {

            url =
                STEAM_BASE +
                match[1];
        }
    }

    if (!url) {
        return null;
    }

    return {
        nombre,
        url,
        steamid:
            extraerSteamID(url)
    };
}


// ================================================================
// LIMPIAR HTML
// ================================================================

function limpiarHTML(
    texto
) {

    if (!texto) {
        return "";
    }

    return texto
        .replace(
            /<[^>]*>/g,
            ""
        )
        .replace(
            /&amp;/gi,
            "&"
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
            /&quot;/gi,
            '"'
        )
        .replace(
            /&#39;/gi,
            "'"
        )
        .replace(
            /&#x27;/gi,
            "'"
        )
        .replace(
            /&nbsp;/gi,
            " "
        )
        .replace(
            /\s+/g,
            " "
        )
        .trim();
}