const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const axios = require("axios");
const puppeteer = require("puppeteer");
const ServerConfig = require("../models/ServerConfig");
const fs = require("fs");
const path = require("path");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BATTLEMETRICS_API = "https://api.battlemetrics.com";
const STEAMID_SEARCH_URL = "https://www.steamid.com/search";
const STEAM_API = "https://api.steampowered.com";

const RESULTADOS_POR_PAGINA = 10;

const STEAMID64_MIN = 76561197960265728n;
const STEAMID64_MAX = 76561202255233023n;

// =====================================================
// HEADERS BATTLEMETRICS
// =====================================================

function getBattleMetricsHeaders() {
    return {
        Authorization: `Bearer ${process.env.BATTLEMETRICS_TOKEN}`,
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        "User-Agent": "RustLogix/1.0"
    };
}

// =====================================================
// STEAMID64
// =====================================================

function esSteamID64(valor) {
    if (valor === null || valor === undefined) {
        return false;
    }

    const texto = String(valor).trim();

    if (!/^\d{17}$/.test(texto)) {
        return false;
    }

    try {
        const numero = BigInt(texto);

        return (
            numero >= STEAMID64_MIN &&
            numero <= STEAMID64_MAX
        );
    } catch {
        return false;
    }
}

// =====================================================
// OBTENER SERVER ID DE BATTLEMETRICS
// =====================================================

async function obtenerBattleMetricsServerId(guildId) {
    const config = await ServerConfig.findOne({ guildId });

    if (!config) {
        return null;
    }

    return config.battleMetricsServerId || null;
}

// =====================================================
// BUSCAR JUGADORES EN BATTLEMETRICS
// =====================================================

async function buscarJugadoresBattleMetrics(nombre, serverId) {
    console.log("[BM] ========================================");
    console.log("[BM] BUSCANDO JUGADOR");
    console.log(`[BM] Name: ${nombre}`);
    console.log(`[BM] Server ID: ${serverId}`);
    console.log("[BM] Include: player,identifier");
    console.log("[BM] ========================================");

    try {
        const url =
            `${BATTLEMETRICS_API}/servers/${serverId}` +
            "?include=player,identifier";

        const response = await axios.get(url, {
            headers: getBattleMetricsHeaders(),
            timeout: 30000
        });

        const included = response.data?.included || [];

        console.log(
            `[BM] Resources incluidos: ${included.length}`
        );

        const players = included.filter(
            item => item.type === "player"
        );

        console.log(
            `[BM] Players recibidos: ${players.length}`
        );

        const nombreBuscado =
            nombre.trim().toLowerCase();

        const coincidencias = players.filter(player => {
            const nombreJugador =
                player.attributes?.name;

            return (
                nombreJugador &&
                nombreJugador.trim().toLowerCase() ===
                    nombreBuscado
            );
        });

        console.log(
            `[BM] Coincidencias exactas: ${coincidencias.length}`
        );

        for (const player of coincidencias) {
            console.log(
                `[BM] MATCH: ${player.id} | ${player.attributes?.name}`
            );
        }

        return coincidencias;

    } catch (error) {
        console.error(
            "[BM] ERROR:",
            error.response?.data ||
            error.message
        );

        return [];
    }
}

// =====================================================
// OBTENER IDENTIFIERS DE UN PLAYER
// =====================================================

async function obtenerIdentifiersBattleMetrics(playerId) {
    console.log("----------------------------------------");

    console.log(
        `[BM] PROCESANDO PLAYER ${playerId}`
    );

    console.log(
        "[BM] OBTENIENDO IDENTIFIERS DEL PLAYER"
    );

    const url =
        `/players/${playerId}?include=identifier`;

    console.log(
        `[BM] URL: ${url}`
    );

    try {
        const response = await axios.get(
            `${BATTLEMETRICS_API}${url}`,
            {
                headers: getBattleMetricsHeaders(),
                timeout: 30000
            }
        );

        const included =
            response.data?.included || [];

        const identifiers =
            included.filter(
                item => item.type === "identifier"
            );

        console.log(
            `[BM] Identifiers encontrados: ${identifiers.length}`
        );

        return identifiers;

    } catch (error) {
        console.error(
            "[BM] ERROR obteniendo identifiers:",
            error.response?.data ||
            error.message
        );

        return [];
    }
}

// =====================================================
// BUSCAR STEAMID64 EN IDENTIFIERS
// =====================================================

function encontrarSteamID64EnIdentifiers(identifiers) {
    console.log(
        "[BM] BUSCANDO STEAMID64..."
    );

    for (const identifier of identifiers) {
        const attributes =
            identifier.attributes || {};

        const valor =
            attributes.identifier ??
            attributes.value ??
            attributes.id ??
            "";

        console.log(
            `[BM] Identifier: ${valor} | ` +
            `type=${attributes.type} | ` +
            `lastSeen=${attributes.lastSeen}`
        );

        if (esSteamID64(valor)) {
            console.log(
                `[BM] ✅ STEAMID64 ENCONTRADO: ${valor}`
            );

            return String(valor).trim();
        }
    }

    console.log(
        "[BM] Ningún identifier contiene un SteamID64 válido."
    );

    return null;
}

// =====================================================
// BUSCAR CHROME EN CACHE
// =====================================================

function buscarChromeEnCache() {
    console.log(
        "[STEAMID.COM] Buscando Chrome en cache..."
    );

    const posiblesCaches = [
        // -------------------------------------------------
        // CACHE DEL PROYECTO
        // Render instala Chrome aquí:
        //
        // PUPPETEER_CACHE_DIR=$PWD/.puppeteer-cache
        // -------------------------------------------------

        path.join(
            process.cwd(),
            ".puppeteer-cache"
        ),

        // -------------------------------------------------
        // VARIABLE DE ENTORNO
        // -------------------------------------------------

        process.env.PUPPETEER_CACHE_DIR,

        // -------------------------------------------------
        // CACHE HABITUAL DE RENDER
        // -------------------------------------------------

        "/opt/render/.cache/puppeteer",

        // -------------------------------------------------
        // CACHE HOME EN LINUX
        // -------------------------------------------------

        process.platform === "linux"
            ? path.join(
                process.env.HOME || "/opt/render",
                ".cache",
                "puppeteer"
            )
            : null,

        // -------------------------------------------------
        // WINDOWS
        // -------------------------------------------------

        process.platform === "win32"
            ? path.join(
                process.env.LOCALAPPDATA || "",
                "puppeteer"
            )
            : null
    ].filter(Boolean);

    const cachesUnicos = [
        ...new Set(posiblesCaches)
    ];

    console.log(
        "[STEAMID.COM] Caches que se van a revisar:"
    );

    for (const cacheDir of cachesUnicos) {
        console.log(
            `[STEAMID.COM] -> ${cacheDir}`
        );
    }

    for (const cacheDir of cachesUnicos) {
        const chromeDir =
            path.join(
                cacheDir,
                "chrome"
            );

        if (!fs.existsSync(chromeDir)) {
            continue;
        }

        console.log(
            `[STEAMID.COM] Chrome cache encontrado: ${chromeDir}`
        );

        let versiones;

        try {
            versiones =
                fs.readdirSync(
                    chromeDir,
                    {
                        withFileTypes: true
                    }
                );

        } catch (error) {
            console.log(
                `[STEAMID.COM] No se pudo leer ${chromeDir}: ${error.message}`
            );

            continue;
        }

        versiones =
            versiones
                .filter(
                    item =>
                        item.isDirectory()
                )
                .sort(
                    (a, b) =>
                        b.name.localeCompare(
                            a.name,
                            undefined,
                            {
                                numeric: true
                            }
                        )
                );

        for (const version of versiones) {
            let rutaChrome;

            if (process.platform === "win32") {
                rutaChrome =
                    path.join(
                        chromeDir,
                        version.name,
                        "chrome-win64",
                        "chrome.exe"
                    );

            } else {
                rutaChrome =
                    path.join(
                        chromeDir,
                        version.name,
                        "chrome-linux64",
                        "chrome"
                    );
            }

            console.log(
                `[STEAMID.COM] Revisando: ${rutaChrome}`
            );

            if (fs.existsSync(rutaChrome)) {
                console.log(
                    `[STEAMID.COM] ✅ Chrome encontrado: ${rutaChrome}`
                );

                return rutaChrome;
            }
        }
    }

    console.log(
        "[STEAMID.COM] ❌ No se encontró Chrome instalado."
    );

    return null;
}

// =====================================================
// OBTENER RUTA DE CHROME
// =====================================================

async function obtenerRutaChrome() {

    // -------------------------------------------------
    // 1. PUPPETEER_EXECUTABLE_PATH
    // -------------------------------------------------

    if (
        process.env.PUPPETEER_EXECUTABLE_PATH &&
        fs.existsSync(
            process.env.PUPPETEER_EXECUTABLE_PATH
        )
    ) {
        console.log(
            "[STEAMID.COM] Usando PUPPETEER_EXECUTABLE_PATH:"
        );

        console.log(
            process.env.PUPPETEER_EXECUTABLE_PATH
        );

        return process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    // -------------------------------------------------
    // 2. Puppeteer executablePath
    // -------------------------------------------------

    try {
        const rutaPuppeteer =
            await puppeteer.executablePath();

        console.log(
            `[STEAMID.COM] Puppeteer executablePath: ${rutaPuppeteer}`
        );

        if (
            rutaPuppeteer &&
            typeof rutaPuppeteer === "string" &&
            fs.existsSync(rutaPuppeteer)
        ) {
            console.log(
                "[STEAMID.COM] ✅ executablePath existe."
            );

            return rutaPuppeteer;
        }

        console.log(
            "[STEAMID.COM] executablePath no existe físicamente."
        );

    } catch (error) {
        console.log(
            `[STEAMID.COM] Error obteniendo executablePath: ${error.message}`
        );
    }

    // -------------------------------------------------
    // 3. Buscar manualmente en caches
    // -------------------------------------------------

    const rutaCache =
        buscarChromeEnCache();

    if (rutaCache) {
        return rutaCache;
    }

    return null;
}

// =====================================================
// BUSCAR STEAMID.COM CON PUPPETEER
// =====================================================

async function buscarSteamIDCom(nombre) {
    console.log("");

    console.log(
        "[STEAMID.COM] ========================================"
    );

    console.log(
        `[STEAMID.COM] BUSCANDO: ${nombre}`
    );

    console.log(
        "[STEAMID.COM] MÉTODO: PUPPETEER"
    );

    console.log(
        "[STEAMID.COM] ========================================"
    );

    let browser = null;

    try {
        console.log(
            "[STEAMID.COM] Iniciando navegador..."
        );

        const executablePath =
            await obtenerRutaChrome();

        if (!executablePath) {
            console.error(
                "[STEAMID.COM] ERROR: No se encontró el ejecutable de Chrome."
            );

            return null;
        }

        console.log(
            `[STEAMID.COM] Usando Chrome: ${executablePath}`
        );

        // -------------------------------------------------
        // INICIAR CHROME
        // -------------------------------------------------

        browser =
            await puppeteer.launch({
                headless: true,

                executablePath,

                defaultViewport: {
                    width: 1366,
                    height: 900
                },

                args: [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--no-first-run",
                    "--no-zygote"
                ]
            });

        console.log(
            "[STEAMID.COM] ✅ Navegador iniciado."
        );

        const page =
            await browser.newPage();

        // -------------------------------------------------
        // CONFIGURAR NAVEGADOR
        // -------------------------------------------------

        await page.setViewport({
            width: 1366,
            height: 900,
            deviceScaleFactor: 1
        });

        await page.setUserAgent(
            "Mozilla/5.0 (X11; Linux x86_64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/150.0.7871.24 Safari/537.36"
        );

        await page.setExtraHTTPHeaders({
            "Accept":
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

            "Accept-Language":
                "en-US,en;q=0.9",

            "Cache-Control":
                "no-cache",

            "Pragma":
                "no-cache",

            "Upgrade-Insecure-Requests":
                "1"
        });

        // -------------------------------------------------
        // ABRIR HOME
        // -------------------------------------------------

        console.log(
            "[STEAMID.COM] Abriendo página principal..."
        );

        const homeResponse =
            await page.goto(
                "https://www.steamid.com/",
                {
                    waitUntil: "domcontentloaded",
                    timeout: 30000
                }
            );

        console.log(
            `[STEAMID.COM] Home HTTP: ${homeResponse?.status()}`
        );

        await new Promise(resolve =>
            setTimeout(resolve, 2000)
        );

        // -------------------------------------------------
        // BUSCAR COOKIES
        // -------------------------------------------------

        try {
            const botonesCookies = [
                "button",
                'input[type="button"]',
                'input[type="submit"]'
            ];

            for (
                const selector of botonesCookies
            ) {
                const botones =
                    await page.$$(selector);

                for (
                    const boton of botones
                ) {
                    const texto =
                        await page.evaluate(
                            el =>
                                el.textContent
                                    ?.trim()
                                    ?.toLowerCase() ||
                                "",
                            boton
                        );

                    if (
                        texto.includes("accept") ||
                        texto.includes("agree") ||
                        texto.includes("allow") ||
                        texto.includes("aceptar")
                    ) {
                        console.log(
                            `[STEAMID.COM] Botón de cookies encontrado: ${texto}`
                        );

                        await boton
                            .click()
                            .catch(() => {});

                        await new Promise(
                            resolve =>
                                setTimeout(
                                    resolve,
                                    1000
                                )
                        );

                        break;
                    }
                }
            }

        } catch (error) {
            console.log(
                `[STEAMID.COM] Cookies: ${error.message}`
            );
        }

        // -------------------------------------------------
        // BUSCAR
        // -------------------------------------------------

        const url =
            `${STEAMID_SEARCH_URL}?q=${encodeURIComponent(nombre)}`;

        console.log(
            `[STEAMID.COM] Abriendo: ${url}`
        );

        const response =
            await page.goto(
                url,
                {
                    waitUntil: "domcontentloaded",
                    timeout: 30000
                }
            );

        const status =
            response?.status();

        console.log(
            `[STEAMID.COM] HTTP: ${status}`
        );

        // -------------------------------------------------
        // ESPERAR JAVASCRIPT
        // -------------------------------------------------

        await new Promise(resolve =>
            setTimeout(resolve, 2500)
        );

        // -------------------------------------------------
        // SI ES 403
        // -------------------------------------------------

        if (status === 403) {
            console.log(
                "[STEAMID.COM] ⚠️ SteamID.com devolvió HTTP 403."
            );

            const titulo =
                await page
                    .title()
                    .catch(() => "");

            console.log(
                `[STEAMID.COM] Título de página: ${titulo}`
            );

            const html =
                await page.content();

            console.log(
                `[STEAMID.COM] HTML recibido: ${html.length} caracteres`
            );

            console.log(
                "[STEAMID.COM] Inicio del HTML recibido:"
            );

            console.log(
                html.substring(0, 1500)
            );

            // -------------------------------------------------
            // GUARDAR HTML DE DIAGNÓSTICO
            // -------------------------------------------------

            try {
                const debugDir =
                    path.join(
                        process.cwd(),
                        "steamid-debug"
                    );

                if (!fs.existsSync(debugDir)) {
                    fs.mkdirSync(
                        debugDir,
                        {
                            recursive: true
                        }
                    );
                }

                const debugFile =
                    path.join(
                        debugDir,
                        "steamid-403.html"
                    );

                fs.writeFileSync(
                    debugFile,
                    html,
                    "utf8"
                );

                console.log(
                    `[STEAMID.COM] HTML 403 guardado en: ${debugFile}`
                );

            } catch (error) {
                console.log(
                    `[STEAMID.COM] No se pudo guardar HTML de diagnóstico: ${error.message}`
                );
            }

            await browser.close();

            return null;
        }

        // -------------------------------------------------
        // BUSCAR ENLACES /profiles/STEAMID64
        // -------------------------------------------------

        const resultados =
            await page.evaluate(() => {
                const elementos =
                    document.querySelectorAll(
                        'a[href*="/profiles/"]'
                    );

                return Array.from(
                    elementos
                ).map(elemento => ({
                    href:
                        elemento.href || "",

                    texto:
                        elemento.textContent
                            ?.trim() || ""
                }));
            });

        console.log(
            `[STEAMID.COM] Enlaces encontrados: ${resultados.length}`
        );

        for (
            const resultado of resultados
        ) {
            const match =
                resultado.href.match(
                    /\/profiles\/(\d{17})/
                );

            if (!match) {
                continue;
            }

            const steamId64 =
                match[1];

            if (!esSteamID64(steamId64)) {
                continue;
            }

            console.log(
                `[STEAMID.COM] ✅ SteamID64 encontrado: ${steamId64}`
            );

            console.log(
                `[STEAMID.COM] Perfil: ${resultado.texto}`
            );

            await browser.close();

            return steamId64;
        }

        // -------------------------------------------------
        // SEGUNDO MÉTODO: HTML COMPLETO
        // -------------------------------------------------

        const html =
            await page.content();

        const matches =
            html.match(
                /\/profiles\/(\d{17})/g
            ) || [];

        console.log(
            `[STEAMID.COM] Coincidencias /profiles/: ${matches.length}`
        );

        for (
            const matchCompleto of matches
        ) {
            const match =
                matchCompleto.match(
                    /(\d{17})/
                );

            if (!match) {
                continue;
            }

            const steamId64 =
                match[1];

            if (esSteamID64(steamId64)) {
                console.log(
                    `[STEAMID.COM] ✅ SteamID64 encontrado en HTML: ${steamId64}`
                );

                await browser.close();

                return steamId64;
            }
        }

        console.log(
            "[STEAMID.COM] ❌ No se encontró SteamID64."
        );

        await browser.close();

        return null;

    } catch (error) {
        console.error(
            `[STEAMID.COM] ERROR: ${error.message}`
        );

        if (browser) {
            try {
                await browser.close();
            } catch {}
        }

        return null;
    }
}

// =====================================================
// OBTENER DATOS DE STEAM
// =====================================================

async function obtenerDatosSteam(steamId64) {
    console.log(
        `[STEAM API] Obteniendo datos de ${steamId64}...`
    );

    const apiKey =
        process.env.STEAM_API_KEY;

    if (!apiKey) {
        console.error(
            "[STEAM API] ❌ STEAM_API_KEY no configurada."
        );

        return null;
    }

    try {
        const url =
            `${STEAM_API}/ISteamUser/GetPlayerSummaries/v2/` +
            `?key=${encodeURIComponent(apiKey)}` +
            `&steamids=${encodeURIComponent(steamId64)}`;

        const response =
            await axios.get(url, {
                timeout: 20000
            });

        const players =
            response.data?.response?.players || [];

        if (!players.length) {
            console.log(
                "[STEAM API] ❌ No se encontró el perfil."
            );

            return null;
        }

        const player =
            players[0];

        console.log(
            `[STEAM API] ✅ Perfil encontrado: ${player.personaname}`
        );

        return player;

    } catch (error) {
        console.error(
            "[STEAM API] ERROR:",
            error.response?.data ||
            error.message
        );

        return null;
    }
}

// =====================================================
// FORMATEAR FECHA
// =====================================================

function formatearFechaUnix(timestamp) {
    if (!timestamp) {
        return "Desconocida";
    }

    try {
        return `<t:${timestamp}:D>`;
    } catch {
        return "Desconocida";
    }
}

// =====================================================
// ESTADO STEAM
// =====================================================

function obtenerEstadoSteam(personastate) {
    switch (personastate) {
        case 0:
            return "🔴 Offline";

        case 1:
            return "🟢 Online";

        case 2:
            return "🔴 Ocupado";

        case 3:
            return "🟡 Ausente";

        case 4:
            return "🟡 Durmiendo";

        case 5:
            return "🟢 Buscando intercambio";

        case 6:
            return "🟢 Buscando jugar";

        default:
            return "⚪ Desconocido";
    }
}

// =====================================================
// CREAR EMBED
// =====================================================

function crearEmbedResultado({
    nombreBuscado,
    playerBM,
    steamId64,
    steamData
}) {
    const embed =
        new EmbedBuilder()
            .setColor(0x1b2838)
            .setTitle("🎮 Perfil de Steam")
            .setDescription(
                `Resultado para **${nombreBuscado}**`
            );

    if (steamData) {
        embed.addFields(
            {
                name: "👤 Nombre",
                value:
                    steamData.personaname ||
                    "Desconocido",
                inline: true
            },
            {
                name: "🆔 SteamID64",
                value:
                    `\`${steamId64}\``,
                inline: true
            },
            {
                name: "📡 Estado",
                value:
                    obtenerEstadoSteam(
                        steamData.personastate
                    ),
                inline: true
            }
        );

        if (steamData.timecreated) {
            embed.addFields({
                name: "📅 Creación",
                value:
                    formatearFechaUnix(
                        steamData.timecreated
                    ),
                inline: true
            });
        }

        embed.addFields({
            name: "🔐 Perfil",
            value:
                steamData.communityvisibilitystate === 3
                    ? "🟢 Público"
                    : "🔒 Privado",
            inline: true
        });

        if (playerBM?.attributes?.name) {
            embed.addFields({
                name: "🎯 BattleMetrics",
                value:
                    playerBM.attributes.name,
                inline: true
            });
        }

        if (steamData.avatarfull) {
            embed.setThumbnail(
                steamData.avatarfull
            );
        }

    } else {
        embed.addFields({
            name: "🆔 SteamID64",
            value:
                `\`${steamId64}\``,
            inline: false
        });

        if (playerBM?.attributes?.name) {
            embed.addFields({
                name: "🎯 BattleMetrics",
                value:
                    playerBM.attributes.name,
                inline: true
            });
        }
    }

    return embed;
}

// =====================================================
// BOTÓN PERFIL STEAM
// =====================================================

function crearBotonPerfil(steamId64) {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setLabel("Ver perfil de Steam")
                .setStyle(ButtonStyle.Link)
                .setURL(
                    `https://steamcommunity.com/profiles/${steamId64}`
                )
        );
}

// =====================================================
// COMANDO
// =====================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName("steam")
        .setDescription(
            "Busca un jugador por nombre en BattleMetrics y obtiene su SteamID64"
        )
        .addStringOption(option =>
            option
                .setName("nombre")
                .setDescription(
                    "Nombre exacto del jugador"
                )
                .setRequired(true)
        ),

    async execute(interaction) {
        const nombre =
            interaction.options
                .getString("nombre")
                .trim();

        console.log("");

        console.log(
            "[STEAM] ========================================"
        );

        console.log(
            `[STEAM] Entrada recibida: "${nombre}"`
        );

        console.log(
            "[STEAM] ========================================"
        );

        await interaction.deferReply();

        try {

            // -------------------------------------------------
            // SERVER CONFIG
            // -------------------------------------------------

            const serverId =
                await obtenerBattleMetricsServerId(
                    interaction.guildId
                );

            if (!serverId) {
                await interaction.editReply({
                    content:
                        "❌ Este servidor no tiene un servidor de BattleMetrics configurado."
                });

                return;
            }

            console.log(
                `[STEAM] BattleMetrics Server ID: ${serverId}`
            );

            // -------------------------------------------------
            // BUSCAR EN BATTLEMETRICS
            // -------------------------------------------------

            const jugadores =
                await buscarJugadoresBattleMetrics(
                    nombre,
                    serverId
                );

            console.log(
                `[STEAM] Jugadores encontrados: ${jugadores.length}`
            );

            if (!jugadores.length) {
                await interaction.editReply({
                    content:
                        `❌ No encontré ningún jugador con el nombre exacto **${nombre}** en BattleMetrics.`
                });

                return;
            }

            const resultados = [];

            // -------------------------------------------------
            // PROCESAR RESULTADOS
            // -------------------------------------------------

            for (
                const playerBM of jugadores
            ) {
                console.log("");

                console.log(
                    `[BM] PROCESANDO PLAYER ${playerBM.id}`
                );

                console.log(
                    "[BM] ----------------------------------------"
                );

                const identifiers =
                    await obtenerIdentifiersBattleMetrics(
                        playerBM.id
                    );

                let steamId64 =
                    encontrarSteamID64EnIdentifiers(
                        identifiers
                    );

                // -------------------------------------------------
                // SI BM NO TIENE STEAMID64
                // BUSCAR EN STEAMID.COM
                // -------------------------------------------------

                if (!steamId64) {
                    console.log(
                        "[STEAMID.COM] BM no entregó SteamID64."
                    );

                    steamId64 =
                        await buscarSteamIDCom(
                            playerBM.attributes?.name ||
                            nombre
                        );
                }

                // -------------------------------------------------
                // NO ENCONTRADO
                // -------------------------------------------------

                if (!steamId64) {
                    console.log(
                        `[STEAM] No se pudo obtener SteamID64 para ${playerBM.attributes?.name}`
                    );

                    resultados.push({
                        playerBM,
                        steamId64: null,
                        steamData: null
                    });

                    continue;
                }

                // -------------------------------------------------
                // STEAM API
                // -------------------------------------------------

                const steamData =
                    await obtenerDatosSteam(
                        steamId64
                    );

                resultados.push({
                    playerBM,
                    steamId64,
                    steamData
                });
            }

            // -------------------------------------------------
            // RESULTADOS
            // -------------------------------------------------

            console.log(
                `[STEAM] Resultados finales: ${resultados.length}`
            );

            const resultadosValidos =
                resultados.filter(
                    resultado =>
                        resultado.steamId64
                );

            if (!resultadosValidos.length) {
                await interaction.editReply({
                    content:
                        `❌ Encontré **${jugadores.length}** coincidencia(s) en BattleMetrics, pero no pude obtener un SteamID64 para **${nombre}**.`
                });

                console.log(
                    "✅ /steam terminado"
                );

                return;
            }

            // -------------------------------------------------
            // PAGINACIÓN
            // -------------------------------------------------

            const paginas = [];

            for (
                let i = 0;
                i < resultadosValidos.length;
                i += RESULTADOS_POR_PAGINA
            ) {
                paginas.push(
                    resultadosValidos.slice(
                        i,
                        i + RESULTADOS_POR_PAGINA
                    )
                );
            }

            const primeraPagina =
                paginas[0];

            // -------------------------------------------------
            // EMBEDS
            // -------------------------------------------------

            const embeds =
                primeraPagina.map(
                    resultado =>
                        crearEmbedResultado({
                            nombreBuscado:
                                nombre,

                            playerBM:
                                resultado.playerBM,

                            steamId64:
                                resultado.steamId64,

                            steamData:
                                resultado.steamData
                        })
                );

            // -------------------------------------------------
            // BOTONES
            // -------------------------------------------------

            const componentes = [];

            if (
                primeraPagina.length === 1 &&
                primeraPagina[0].steamId64
            ) {
                componentes.push(
                    crearBotonPerfil(
                        primeraPagina[0].steamId64
                    )
                );
            }

            // -------------------------------------------------
            // RESPUESTA
            // -------------------------------------------------

            await interaction.editReply({
                embeds,
                components
            });

            console.log(
                "✅ /steam terminado"
            );

        } catch (error) {

            console.error(
                "[STEAM] ERROR GENERAL:",
                error
            );

            await interaction.editReply({
                content:
                    "❌ Ocurrió un error mientras buscaba el jugador."
            }).catch(() => {});

            console.log(
                "❌ /steam terminado con error"
            );
        }
    }
};