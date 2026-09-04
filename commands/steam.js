const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const axios = require("axios");

const STEAM_BASE = "https://steamcommunity.com";

const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0"
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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

        console.log("\n🎯 Ejecutando /steam");
        console.log(`[STEAM] Entrada recibida: ${entrada}`);

        await interaction.deferReply();

        try {
            let nombreBuscado = entrada;

            // =====================================================
            // BATTLEMETRICS
            // =====================================================

            if (
                entrada.includes("battlemetrics.com/players/") ||
                entrada.includes("battlemetrics.com/players")
            ) {
                console.log("[STEAM] Detectado enlace de BattleMetrics.");
                console.log("[STEAM] Obteniendo nombre desde BattleMetrics...");

                const nombreBM = await obtenerNombreBattleMetrics(entrada);

                if (!nombreBM) {
                    await interaction.editReply(
                        "❌ No pude obtener el nombre del jugador desde BattleMetrics."
                    );
                    return;
                }

                nombreBuscado = nombreBM.trim();

                console.log(
                    `[STEAM] Nombre obtenido de BattleMetrics: ${nombreBuscado}`
                );
            }

            console.log(
                `[STEAM] Buscando perfiles con nombre exacto: ${nombreBuscado}`
            );

            const perfiles = await buscarPerfilesSteam(nombreBuscado);

            console.log(
                `[STEAM] RESULTADO FINAL: ${perfiles.length} coincidencias exactas.`
            );

            const rustConfirmado = perfiles.filter(p => p.tieneRust).length;
            const rustNoConfirmado = perfiles.filter(p => !p.tieneRust).length;

            console.log(
                `[STEAM] Rust confirmado: ${rustConfirmado}`
            );

            console.log(
                `[STEAM] Rust no confirmado: ${rustNoConfirmado}`
            );

            console.log(
                `[STEAM] PERFILES DEVUELTOS: ${perfiles.length}`
            );

            if (!perfiles.length) {
                await interaction.editReply(
                    `❌ No encontré perfiles de Steam con el nombre exacto:\n\`${nombreBuscado}\``
                );
                return;
            }

            // =====================================================
            // PAGINACIÓN
            // =====================================================

            const porPagina = 10;
            const paginas = Math.ceil(perfiles.length / porPagina);

            let paginaActual = 0;

            const generarEmbed = pagina => {
                const inicio = pagina * porPagina;
                const perfilesPagina = perfiles.slice(
                    inicio,
                    inicio + porPagina
                );

                const embed = new EmbedBuilder()
                    .setTitle(`🔎 Steam — "${nombreBuscado}"`)
                    .setDescription(
                        `Coincidencias exactas encontradas: **${perfiles.length}**`
                    )
                    .setColor(0x1b2838)
                    .setFooter({
                        text: `Página ${pagina + 1}/${paginas}`
                    });

                perfilesPagina.forEach((perfil, index) => {
                    const numero = inicio + index + 1;

                    let texto =
                        `🔗 [Abrir perfil](${perfil.url})\n` +
                        `🆔 SteamID64: \`${perfil.steamid || "No detectado"}\`\n`;

                    if (perfil.tieneRust) {
                        texto += `🎮 Rust: **Sí**\n`;

                        if (perfil.tieneInventarioRust) {
                            texto += `🎒 Inventario/skins de Rust: **Sí**`;
                        } else {
                            texto += `🎒 Inventario/skins de Rust: **No confirmado**`;
                        }
                    } else {
                        texto += `🎮 Rust: **No confirmado**\n`;
                        texto += `🎒 Inventario/skins de Rust: **No confirmado**`;
                    }

                    embed.addFields({
                        name: `${numero}. ${perfil.nombre}`,
                        value: texto,
                        inline: false
                    });
                });

                return embed;
            };

            const generarBotones = pagina => {
                return new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("steam_anterior")
                        .setLabel("◀ Anterior")
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(pagina === 0),

                    new ButtonBuilder()
                        .setCustomId("steam_siguiente")
                        .setLabel("Siguiente ▶")
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(pagina === paginas - 1)
                );
            };

            const respuesta = await interaction.editReply({
                embeds: [generarEmbed(paginaActual)],
                components: paginas > 1
                    ? [generarBotones(paginaActual)]
                    : []
            });

            if (paginas <= 1) {
                return;
            }

            // =====================================================
            // COLLECTOR
            // =====================================================

            const collector = respuesta.createMessageComponentCollector({
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
                    if (paginaActual < paginas - 1) {
                        paginaActual++;
                    }
                }

                await buttonInteraction.update({
                    embeds: [generarEmbed(paginaActual)],
                    components: [generarBotones(paginaActual)]
                });
            });

            collector.on("end", async () => {
                try {
                    await interaction.editReply({
                        components: [
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId("steam_anterior_fin")
                                    .setLabel("◀ Anterior")
                                    .setStyle(ButtonStyle.Secondary)
                                    .setDisabled(true),

                                new ButtonBuilder()
                                    .setCustomId("steam_siguiente_fin")
                                    .setLabel("Siguiente ▶")
                                    .setStyle(ButtonStyle.Secondary)
                                    .setDisabled(true)
                            )
                        ]
                    });
                } catch (error) {
                    // El mensaje pudo haber sido eliminado.
                }
            });

        } catch (error) {
            console.error("[STEAM] ERROR GENERAL:", error);

            try {
                await interaction.editReply(
                    "❌ Ocurrió un error mientras buscaba en Steam."
                );
            } catch (e) {
                // Ignorar
            }
        }
    }
};


// ================================================================
// OBTENER NOMBRE DESDE BATTLEMETRICS
// ================================================================

async function obtenerNombreBattleMetrics(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                "User-Agent": USER_AGENTS[0],
                "Accept":
                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "es-ES,es;q=0.9,en;q=0.8"
            },
            timeout: 30000
        });

        const html = response.data;

        let nombre = null;

        // h1
        let match = html.match(
            /<h1[^>]*>([\s\S]*?)<\/h1>/i
        );

        if (match) {
            nombre = limpiarHTML(match[1]);
        }

        // og:title
        if (!nombre) {
            match = html.match(
                /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
            );

            if (match) {
                nombre = limpiarHTML(match[1]);
            }
        }

        // title
        if (!nombre) {
            match = html.match(
                /<title[^>]*>([\s\S]*?)<\/title>/i
            );

            if (match) {
                nombre = limpiarHTML(match[1]);
            }
        }

        if (!nombre) {
            match = html.match(
                /"name"\s*:\s*"([^"]+)"/i
            );

            if (match) {
                nombre = match[1];
            }
        }

        if (!nombre) {
            match = html.match(
                /"displayName"\s*:\s*"([^"]+)"/i
            );

            if (match) {
                nombre = match[1];
            }
        }

        if (!nombre) {
            match = html.match(
                /"username"\s*:\s*"([^"]+)"/i
            );

            if (match) {
                nombre = match[1];
            }
        }

        if (!nombre) {
            return null;
        }

        nombre = nombre
            .replace(/\s*-\s*BattleMetrics.*$/i, "")
            .replace(/\s+/g, " ")
            .trim();

        console.log(
            `[BATTLEMETRICS] Nombre detectado: ${nombre}`
        );

        return nombre;

    } catch (error) {
        console.error(
            "[BATTLEMETRICS] Error obteniendo nombre:",
            error.message
        );

        return null;
    }
}


// ================================================================
// OBTENER SESIÓN STEAM
// ================================================================

async function obtenerSesionSteam() {
    console.log("[STEAM] Obteniendo sesión de Steam...");

    for (let intento = 1; intento <= 5; intento++) {
        try {
            const response = await axios.get(
                `${STEAM_BASE}/search/users/`,
                {
                    headers: {
                        "User-Agent": USER_AGENTS[intento % USER_AGENTS.length],
                        "Accept":
                            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8"
                    },
                    timeout: 30000
                }
            );

            const cookies = response.headers["set-cookie"] || [];

            let sessionid = null;

            for (const cookie of cookies) {
                const match = cookie.match(
                    /sessionid=([^;]+)/
                );

                if (match) {
                    sessionid = match[1];
                    break;
                }
            }

            if (!sessionid) {
                const match = response.data.match(
                    /g_sessionID\s*=\s*["']([^"']+)["']/i
                );

                if (match) {
                    sessionid = match[1];
                }
            }

            if (sessionid) {
                console.log(
                    "[STEAM] Sesión obtenida correctamente."
                );

                return {
                    sessionid,
                    cookie: cookies
                        .map(c => c.split(";")[0])
                        .join("; ")
                };
            }

            console.log(
                `[STEAM] No se encontró sessionid. Intento ${intento}/5`
            );

        } catch (error) {
            console.log(
                `[STEAM] Error obteniendo sesión, intento ${intento}/5: ${error.message}`
            );

            if (error.response?.status === 429) {
                await esperar(5000 * intento);
            } else {
                await esperar(2000);
            }
        }
    }

    throw new Error(
        "No se pudo obtener la sesión de Steam."
    );
}


// ================================================================
// BUSCAR PERFILES STEAM
// ================================================================

async function buscarPerfilesSteam(nombreBuscado) {
    const sesion = await obtenerSesionSteam();

    const perfilesExactos = [];
    const urlsVistas = new Set();

    const maxPaginas = 50;

    for (let pagina = 1; pagina <= maxPaginas; pagina++) {

        console.log(
            `[STEAM] Buscando página ${pagina}`
        );

        let response;

        try {
            response = await hacerPeticionBusquedaSteam(
                nombreBuscado,
                pagina,
                sesion
            );

        } catch (error) {

            console.log(
                `[STEAM] Error página ${pagina}: ${error.message}`
            );

            // Si seguimos recibiendo 429, esperamos y reintentamos
            if (error.response?.status === 429) {

                console.log(
                    `[STEAM] Steam está limitando las peticiones (429).`
                );

                console.log(
                    `[STEAM] Esperando antes de continuar...`
                );

                await esperar(15000);

                pagina--;
                continue;
            }

            // Otros errores: continuar con la siguiente página
            await esperar(3000);
            continue;
        }

        const html = obtenerHTMLRespuesta(response.data);

        if (!html) {
            console.log(
                `[STEAM] Página ${pagina} no devolvió HTML.`
            );

            await esperar(2500);
            continue;
        }

        const bloques = extraerBloquesBusqueda(html);

        console.log(
            `[STEAM] Resultados encontrados en HTML: ${bloques.length}`
        );

        // ========================================================
        // FALLBACK: BUSCAR PERFILES DIRECTAMENTE EN EL HTML
        // ========================================================

        if (!bloques.length) {

            const perfilesFallback =
                extraerPerfilesFallback(html);

            if (perfilesFallback.length) {

                console.log(
                    `[STEAM] Fallback encontró ${perfilesFallback.length} perfiles.`
                );

                for (const perfil of perfilesFallback) {

                    if (perfil.nombre !== nombreBuscado) {
                        continue;
                    }

                    if (!perfil.url) {
                        continue;
                    }

                    if (urlsVistas.has(perfil.url)) {
                        continue;
                    }

                    urlsVistas.add(perfil.url);

                    console.log(
                        `[STEAM] Coincidencia exacta encontrada: ${perfil.nombre}`
                    );

                    const datosRust =
                        await comprobarRustSteam(perfil);

                    perfilesExactos.push({
                        ...perfil,
                        ...datosRust
                    });
                }
            }

            await esperar(2500);
            continue;
        }

        let nuevos = 0;

        for (const bloque of bloques) {

            const perfil =
                procesarBloque(bloque);

            if (!perfil) {
                continue;
            }

            // ====================================================
            // NOMBRE EXACTO CASE-SENSITIVE
            // ====================================================

            if (perfil.nombre !== nombreBuscado) {
                continue;
            }

            if (!perfil.url) {
                continue;
            }

            if (urlsVistas.has(perfil.url)) {
                continue;
            }

            urlsVistas.add(perfil.url);

            nuevos++;

            console.log(
                `[STEAM] Coincidencia exacta: ${perfil.nombre}`
            );

            const datosRust =
                await comprobarRustSteam(perfil);

            perfilesExactos.push({
                ...perfil,
                ...datosRust
            });

            // Pausa pequeña entre perfiles para evitar rate limit
            await esperar(1200);
        }

        console.log(
            `[STEAM] Nuevas coincidencias en página ${pagina}: ${nuevos}`
        );

        // ========================================================
        // PAUSA ENTRE PÁGINAS
        // ========================================================

        await esperar(2500);
    }

    // ============================================================
    // RUST CONFIRMADO PRIMERO
    // ============================================================

    perfilesExactos.sort((a, b) => {

        if (a.tieneRust && !b.tieneRust) {
            return -1;
        }

        if (!a.tieneRust && b.tieneRust) {
            return 1;
        }

        return 0;
    });

    return perfilesExactos;
}


// ================================================================
// PETICIÓN DE BÚSQUEDA CON RETRY 429
// ================================================================

async function hacerPeticionBusquedaSteam(
    nombreBuscado,
    pagina,
    sesion
) {
    const url =
        `${STEAM_BASE}/search/SearchCommunityAjax`;

    let ultimoError = null;

    for (let intento = 1; intento <= 5; intento++) {

        try {

            const userAgent =
                USER_AGENTS[
                    Math.floor(
                        Math.random() * USER_AGENTS.length
                    )
                ];

            const response = await axios.get(url, {
                params: {
                    text: nombreBuscado,
                    filter: "users",
                    sessionid: sesion.sessionid,
                    steamid_user: "false",
                    page: pagina
                },

                headers: {
                    "User-Agent": userAgent,
                    "Accept": "application/json, text/javascript, */*; q=0.01",
                    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer":
                        `${STEAM_BASE}/search/users/?text=${encodeURIComponent(nombreBuscado)}`,
                    "Origin": STEAM_BASE,
                    "Cookie": sesion.cookie
                },

                timeout: 30000,

                validateStatus: status =>
                    status >= 200 && status < 500
            });

            if (response.status === 429) {

                console.log(
                    `[STEAM] 429 en página ${pagina}, intento ${intento}/5`
                );

                const retryAfter =
                    response.headers["retry-after"];

                let espera = 10000 * intento;

                if (retryAfter) {

                    const segundos =
                        Number(retryAfter);

                    if (!Number.isNaN(segundos)) {
                        espera =
                            Math.max(
                                espera,
                                segundos * 1000
                            );
                    }
                }

                console.log(
                    `[STEAM] Esperando ${espera} ms...`
                );

                await esperar(espera);

                continue;
            }

            if (response.status >= 400) {
                const error =
                    new Error(
                        `Steam respondió HTTP ${response.status}`
                    );

                error.response = response;

                throw error;
            }

            return response;

        } catch (error) {

            ultimoError = error;

            if (error.response?.status === 429) {
                continue;
            }

            throw error;
        }
    }

    throw ultimoError ||
        new Error("Steam no respondió correctamente.");
}


// ================================================================
// OBTENER HTML DE LA RESPUESTA
// ================================================================

function obtenerHTMLRespuesta(data) {

    if (!data) {
        return "";
    }

    if (typeof data === "string") {

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

    if (typeof data === "object") {

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
// EXTRAER BLOQUES SEARCH_ROW
// ================================================================

function extraerBloquesBusqueda(html) {

    const regex =
        /<div[^>]+class=["'][^"']*search_row[^"']*["'][^>]*>[\s\S]*?(?=<div[^>]+class=["'][^"']*search_row[^"']*["']|$)/gi;

    return html.match(regex) || [];
}


// ================================================================
// FALLBACK PARA HTML DIFERENTE
// ================================================================

function extraerPerfilesFallback(html) {

    const resultados = [];

    const regex =
        /<a[^>]+href=["'](https?:\/\/steamcommunity\.com\/(?:profiles\/\d+|id\/[^"'?#]+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;

    let match;

    while ((match = regex.exec(html)) !== null) {

        const url = match[1];

        const contenido =
            limpiarHTML(match[2]);

        if (!contenido) {
            continue;
        }

        let nombre = contenido;

        const nombreMatch =
            contenido.match(/^(.+?)(?:\s+[\d,.]+)?$/);

        if (nombreMatch) {
            nombre = nombreMatch[1].trim();
        }

        resultados.push({
            nombre,
            url
        });
    }

    return resultados;
}


// ================================================================
// PROCESAR BLOQUE
// ================================================================

function procesarBloque(bloque) {

    let nombre = null;

    let match =
        bloque.match(
            /class=["'][^"']*searchPersonaName[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i
        );

    if (match) {
        nombre = limpiarHTML(match[1]);
    }

    if (!nombre) {

        match =
            bloque.match(
                /searchPersonaName[^>]*>([\s\S]*?)<\/[^>]+>/i
            );

        if (match) {
            nombre = limpiarHTML(match[1]);
        }
    }

    if (!nombre) {

        match =
            bloque.match(
                /<span[^>]*>([\s\S]*?)<\/span>/i
            );

        if (match) {
            nombre = limpiarHTML(match[1]);
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
        url = match[1];
    }

    if (!url) {

        match =
            bloque.match(
                /href=["'](\/(?:profiles\/\d+|id\/[^"'?#]+)[^"']*)["']/i
            );

        if (match) {
            url = STEAM_BASE + match[1];
        }
    }

    if (!url) {
        return null;
    }

    let steamid = null;

    match =
        url.match(
            /\/profiles\/(\d+)/i
        );

    if (match) {
        steamid = match[1];
    }

    return {
        nombre,
        url,
        steamid
    };
}


// ================================================================
// COMPROBAR RUST
// ================================================================

async function comprobarRustSteam(perfil) {

    let steamid =
        perfil.steamid || null;

    let tieneRust = false;
    let tieneInventarioRust = false;

    try {

        // ========================================================
        // RESOLVER STEAMID SI ES VANITY URL
        // ========================================================

        if (!steamid && perfil.url) {

            try {

                const response =
                    await axios.get(perfil.url, {
                        headers: {
                            "User-Agent": USER_AGENTS[0],
                            "Accept":
                                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
                        },
                        timeout: 20000
                    });

                const html =
                    response.data;

                let match =
                    html.match(
                        /g_steamID\s*=\s*["'](\d+)["']/i
                    );

                if (!match) {
                    match =
                        html.match(
                            /"steamid"\s*:\s*"(\d+)"/i
                        );
                }

                if (!match) {
                    match =
                        html.match(
                            /"steamID64"\s*:\s*"(\d+)"/i
                        );
                }

                if (!match) {
                    match =
                        html.match(
                            /\/profiles\/(\d+)/i
                        );
                }

                if (match) {
                    steamid = match[1];
                }

            } catch (error) {

                console.log(
                    `[STEAM] No se pudo resolver SteamID de ${perfil.url}: ${error.message}`
                );
            }
        }

        // ========================================================
        // SI NO TENEMOS STEAMID, TODAVÍA PODEMOS MIRAR EL PERFIL
        // ========================================================

        let perfilHTML = "";

        if (perfil.url) {

            try {

                const response =
                    await axios.get(perfil.url, {
                        headers: {
                            "User-Agent": USER_AGENTS[0],
                            "Accept":
                                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
                        },
                        timeout: 20000,
                        validateStatus: status =>
                            status >= 200 && status < 500
                    });

                if (response.status === 200) {
                    perfilHTML = response.data;
                }

            } catch (error) {

                console.log(
                    `[STEAM] Error leyendo perfil ${perfil.url}: ${error.message}`
                );
            }
        }

        // ========================================================
        // DETECTAR RUST EN PERFIL
        // ========================================================

        if (perfilHTML) {

            // Inventario/skins Rust
            if (
                /#252490_/i.test(perfilHTML) ||
                /\/inventory\/(?:\d+)\/252490/i.test(perfilHTML) ||
                /\/gamecards\/252490/i.test(perfilHTML) ||
                /\/app\/252490(?:\/|["'#?])/i.test(perfilHTML)
            ) {
                tieneRust = true;
                tieneInventarioRust = true;
            }

            // Rust/AppID
            if (
                /\b252490\b/i.test(perfilHTML) ||
                /\bRust\b/i.test(perfilHTML)
            ) {
                tieneRust = true;
            }
        }

        // ========================================================
        // PÁGINA DE JUEGOS
        // ========================================================

        if (steamid) {

            try {

                const juegosURL =
                    `${STEAM_BASE}/profiles/${steamid}/games/?tab=all`;

                const response =
                    await axios.get(juegosURL, {
                        headers: {
                            "User-Agent": USER_AGENTS[0],
                            "Accept":
                                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
                        },
                        timeout: 20000,
                        validateStatus: status =>
                            status >= 200 && status < 500
                    });

                if (response.status === 200) {

                    const html =
                        response.data;

                    if (
                        /\/app\/252490\//i.test(html) ||
                        /app\/252490/i.test(html) ||
                        /\b252490\b/i.test(html) ||
                        /\bRust\b/i.test(html)
                    ) {
                        tieneRust = true;
                    }
                }

            } catch (error) {

                console.log(
                    `[STEAM] Error comprobando juegos: ${error.message}`
                );
            }
        }

        // ========================================================
        // INVENTARIO DIRECTO
        // ========================================================

        if (steamid) {

            try {

                const inventoryURL =
                    `${STEAM_BASE}/inventory/${steamid}/252490/2?l=english&count=1`;

                const response =
                    await axios.get(inventoryURL, {
                        headers: {
                            "User-Agent": USER_AGENTS[0],
                            "Accept": "application/json, text/plain, */*"
                        },
                        timeout: 20000,
                        validateStatus: status =>
                            status >= 200 && status < 500
                    });

                if (
                    response.status === 200 &&
                    response.data &&
                    response.data.success === 1
                ) {
                    tieneRust = true;
                    tieneInventarioRust = true;
                }

                if (response.status === 403) {
                    console.log(
                        `[STEAM] Inventario 403 para ${steamid}. No se descarta el perfil.`
                    );
                }

            } catch (error) {

                console.log(
                    `[STEAM] Error inventario ${steamid}: ${error.message}`
                );
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
// LIMPIAR HTML
// ================================================================

function limpiarHTML(texto) {

    if (!texto) {
        return "";
    }

    return texto
        .replace(/<[^>]*>/g, "")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/&nbsp;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
}


// ================================================================
// ESPERAR
// ================================================================

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}