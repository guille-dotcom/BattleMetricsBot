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

// =====================================================
// CONFIG
// =====================================================

const BATTLEMETRICS_API = "https://api.battlemetrics.com";
const STEAMID_SEARCH_URL = "https://www.steamid.com/search";
const STEAM_API = "https://api.steampowered.com";

const RESULTADOS_POR_PAGINA = 10;

// Rango válido de SteamID64
const STEAMID64_MIN = 76561197960265728n;
const STEAMID64_MAX = 76561202255233023n;

// =====================================================
// HEADERS BATTLEMETRICS
// =====================================================

function getBattleMetricsHeaders() {
    const token = process.env.BATTLEMETRICS_TOKEN;

    if (!token) {
        throw new Error(
            "Falta BATTLEMETRICS_TOKEN en las variables de entorno."
        );
    }

    return {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0"
    };
}

// =====================================================
// VALIDAR STEAMID64
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
// OBTENER SERVER ID
// =====================================================

async function obtenerBattleMetricsServerId(guildId) {
    const config = await ServerConfig.findOne({
        guildId
    });

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

    const response = await axios.get(
        `${BATTLEMETRICS_API}/servers/${serverId}`,
        {
            params: {
                include: "player,identifier"
            },
            headers: getBattleMetricsHeaders(),
            timeout: 30000
        }
    );

    const data = response.data;

    const included = Array.isArray(data.included)
        ? data.included
        : [];

    console.log(
        `[BM] Resources incluidos: ${included.length}`
    );

    const jugadores = included.filter(resource => {
        return (
            resource &&
            resource.type === "player" &&
            resource.attributes
        );
    });

    console.log(
        `[BM] Players recibidos: ${jugadores.length}`
    );

    const nombreBuscado = String(nombre)
        .trim()
        .toLowerCase();

    const coincidencias = jugadores.filter(player => {
        const nombrePlayer = String(
            player.attributes.name || ""
        )
            .trim()
            .toLowerCase();

        return nombrePlayer === nombreBuscado;
    });

    console.log(
        `[BM] Coincidencias exactas: ${coincidencias.length}`
    );

    for (const player of coincidencias) {
        console.log(
            `[BM] MATCH: ${player.id} | ${player.attributes.name}`
        );
    }

    return coincidencias;
}

// =====================================================
// OBTENER IDENTIFIERS DEL PLAYER
// =====================================================

async function obtenerIdentifiersBattleMetrics(playerId) {
    console.log("[BM] ----------------------------------------");

    console.log(
        `[BM] PROCESANDO PLAYER ${playerId}`
    );

    console.log(
        "[BM] OBTENIENDO IDENTIFIERS DEL PLAYER"
    );

    console.log(
        `[BM] URL: /players/${playerId}?include=identifier`
    );

    const response = await axios.get(
        `${BATTLEMETRICS_API}/players/${playerId}`,
        {
            params: {
                include: "identifier"
            },
            headers: getBattleMetricsHeaders(),
            timeout: 30000
        }
    );

    const included = Array.isArray(response.data.included)
        ? response.data.included
        : [];

    const identifiers = included.filter(resource => {
        return (
            resource &&
            resource.type === "identifier" &&
            resource.attributes
        );
    });

    console.log(
        `[BM] Identifiers encontrados: ${identifiers.length}`
    );

    return identifiers;
}

// =====================================================
// BUSCAR STEAMID64 EN BATTLEMETRICS
// =====================================================

function encontrarSteamID64EnIdentifiers(identifiers) {
    console.log("[BM] BUSCANDO STEAMID64...");

    for (const identifier of identifiers) {
        const attributes = identifier.attributes || {};

        const valor = attributes.identifier;
        const tipo = attributes.type;
        const lastSeen = attributes.lastSeen;

        console.log(
            `[BM] Identifier: ${valor} | type=${tipo} | lastSeen=${lastSeen}`
        );

        if (esSteamID64(valor)) {
            console.log(
                `[BM] STEAMID64 ENCONTRADO: ${valor}`
            );

            return String(valor);
        }
    }

    console.log(
        "[BM] Ningún identifier contiene un SteamID64 válido."
    );

    return null;
}

// =====================================================
// OBTENER RUTA DE CHROME DE PUPPETEER
// =====================================================

function obtenerRutaChrome() {
    try {
        const ruta = puppeteer.executablePath();

        console.log(
            `[STEAMID.COM] Puppeteer executablePath: ${ruta}`
        );

        return ruta;
    } catch (error) {
        console.log(
            `[STEAMID.COM] No se pudo obtener executablePath: ${error.message}`
        );

        return null;
    }
}

// =====================================================
// STEAMID.COM CON PUPPETEER
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

        const executablePath = obtenerRutaChrome();

        if (!executablePath) {
            throw new Error(
                "No se pudo determinar la ruta del ejecutable de Chrome."
            );
        }

        console.log(
            `[STEAMID.COM] Usando Chrome: ${executablePath}`
        );

        browser = await puppeteer.launch({
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
                "--disable-blink-features=AutomationControlled",
                "--no-first-run",
                "--no-zygote"
            ]
        });

        console.log(
            "[STEAMID.COM] Chrome iniciado correctamente."
        );

        const page = await browser.newPage();

        // -------------------------------------------------
        // USER AGENT
        // -------------------------------------------------

        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/140.0.0.0 Safari/537.36"
        );

        await page.setExtraHTTPHeaders({
            "Accept-Language": "en-US,en;q=0.9,es;q=0.8"
        });

        // -------------------------------------------------
        // OCULTAR SEÑALES BÁSICAS DE AUTOMATIZACIÓN
        // -------------------------------------------------

        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(
                navigator,
                "webdriver",
                {
                    get: () => false
                }
            );
        });

        // -------------------------------------------------
        // URL
        // -------------------------------------------------

        const url =
            `${STEAMID_SEARCH_URL}?q=${encodeURIComponent(nombre)}`;

        console.log(
            `[STEAMID.COM] Abriendo: ${url}`
        );

        // -------------------------------------------------
        // CARGAR PÁGINA
        // -------------------------------------------------

        const response = await page.goto(
            url,
            {
                waitUntil: "domcontentloaded",
                timeout: 60000
            }
        );

        if (response) {
            console.log(
                `[STEAMID.COM] HTTP: ${response.status()}`
            );
        }

        // -------------------------------------------------
        // ESPERAR RESULTADOS
        // -------------------------------------------------

        try {
            await page.waitForSelector(
                'a[href*="/profiles/"]',
                {
                    timeout: 15000
                }
            );

            console.log(
                "[STEAMID.COM] Resultados detectados."
            );
        } catch {
            console.log(
                "[STEAMID.COM] No apareció inmediatamente el selector de perfiles."
            );
        }

        // -------------------------------------------------
        // ESPERA PARA JS
        // -------------------------------------------------

        await new Promise(resolve =>
            setTimeout(resolve, 1500)
        );

        // -------------------------------------------------
        // OBTENER HTML
        // -------------------------------------------------

        const html = await page.content();

        console.log(
            `[STEAMID.COM] HTML recibido: ${html.length} bytes`
        );

        // -------------------------------------------------
        // DETECTAR BLOQUEO
        // -------------------------------------------------

        const htmlLower = html.toLowerCase();

        if (
            htmlLower.includes("just a moment") ||
            htmlLower.includes("checking your browser") ||
            htmlLower.includes("cf-chl")
        ) {
            console.log(
                "[STEAMID.COM] Parece haber una protección/bloqueo de Cloudflare."
            );
        }

        // -------------------------------------------------
        // EXTRAER PERFILES
        // -------------------------------------------------

        const perfiles =
            await page.$$eval(
                'a[href*="/profiles/"]',
                enlaces => {
                    return enlaces.map(enlace => {
                        const href =
                            enlace.getAttribute("href") || "";

                        const match =
                            href.match(
                                /\/profiles\/(\d{17})/
                            );

                        if (!match) {
                            return null;
                        }

                        const contenedor =
                            enlace.closest(
                                "li, div"
                            );

                        let nombre = null;

                        const heading =
                            contenedor?.querySelector(
                                "h3"
                            );

                        if (heading) {
                            nombre =
                                heading.textContent.trim();
                        }

                        let avatar = null;

                        const img =
                            contenedor?.querySelector(
                                "img"
                            );

                        if (img) {
                            avatar =
                                img.getAttribute("src");
                        }

                        return {
                            steamId64: match[1],
                            nombre,
                            avatar
                        };
                    });
                }
            );

        const resultados = [];
        const ids = new Set();

        for (const perfil of perfiles) {
            if (!perfil) {
                continue;
            }

            if (
                !esSteamID64(
                    perfil.steamId64
                )
            ) {
                continue;
            }

            if (
                ids.has(
                    perfil.steamId64
                )
            ) {
                continue;
            }

            ids.add(
                perfil.steamId64
            );

            resultados.push({
                steamId64:
                    perfil.steamId64,

                nombre:
                    perfil.nombre || null,

                avatar:
                    perfil.avatar || null
            });
        }

        console.log(
            `[STEAMID.COM] SteamID64 encontrados: ${resultados.length}`
        );

        for (const resultado of resultados) {
            console.log(
                `[STEAMID.COM] MATCH: ${resultado.steamId64} | ${resultado.nombre || "sin nombre"}`
            );
        }

        return resultados;

    } catch (error) {
        console.log(
            `[STEAMID.COM] ERROR: ${error.message}`
        );

        return [];

    } finally {
        if (browser) {
            try {
                await browser.close();

                console.log(
                    "[STEAMID.COM] Navegador cerrado."
                );

            } catch (error) {
                console.log(
                    `[STEAMID.COM] Error cerrando navegador: ${error.message}`
                );
            }
        }
    }
}

// =====================================================
// STEAM WEB API
// =====================================================

async function obtenerDatosSteam(steamId64) {
    const apiKey =
        process.env.STEAM_API_KEY;

    if (!apiKey) {
        console.log(
            "[STEAM API] STEAM_API_KEY no configurada."
        );

        return null;
    }

    try {
        const response = await axios.get(
            `${STEAM_API}/ISteamUser/GetPlayerSummaries/v2/`,
            {
                params: {
                    key: apiKey,
                    steamids: steamId64
                },

                timeout: 15000
            }
        );

        const players =
            response.data?.response?.players;

        if (
            !Array.isArray(players) ||
            players.length === 0
        ) {
            console.log(
                "[STEAM API] No devolvió información del jugador."
            );

            return null;
        }

        return players[0];

    } catch (error) {
        console.log(
            `[STEAM API] Error: ${error.message}`
        );

        return null;
    }
}

// =====================================================
// FECHA
// =====================================================

function formatearFechaUnix(timestamp) {
    if (!timestamp) {
        return "Desconocida";
    }

    const fecha = new Date(
        Number(timestamp) * 1000
    );

    if (Number.isNaN(fecha.getTime())) {
        return "Desconocida";
    }

    return fecha.toLocaleDateString(
        "es-ES",
        {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        }
    );
}

// =====================================================
// ESTADO STEAM
// =====================================================

function obtenerEstadoSteam(persona) {
    if (!persona) {
        return "Desconocido";
    }

    switch (persona.personastate) {
        case 0:
            return "⚫ Offline";

        case 1:
            return "🟢 Online";

        case 2:
            return "🟢 Ocupado";

        case 3:
            return "🟡 Ausente";

        case 4:
            return "🟡 Durmiendo";

        case 5:
            return "🟢 Buscando intercambio";

        case 6:
            return "🟢 Buscando jugar";

        default:
            return "Desconocido";
    }
}

// =====================================================
// EMBED
// =====================================================

function crearEmbedResultado(resultado) {
    const steamId64 =
        resultado.steamId64;

    const persona =
        resultado.persona || null;

    const nombre =
        persona?.personaname ||
        resultado.nombre ||
        "Steam User";

    const avatar =
        persona?.avatarfull ||
        resultado.avatar ||
        null;

    const perfil =
        persona?.profileurl ||
        `https://steamcommunity.com/profiles/${steamId64}`;

    const estado =
        obtenerEstadoSteam(persona);

    const embed = new EmbedBuilder()
        .setTitle(`🎮 ${nombre}`)
        .setURL(perfil)
        .setDescription(
            `**SteamID64:** \`${steamId64}\``
        )
        .addFields(
            {
                name: "Estado",
                value: estado,
                inline: true
            },
            {
                name: "Perfil",
                value:
                    `[Abrir perfil](${perfil})`,
                inline: true
            }
        )
        .setFooter({
            text:
                "BattleMetrics + SteamID.com"
        });

    if (persona?.timecreated) {
        embed.addFields({
            name: "Cuenta creada",
            value:
                formatearFechaUnix(
                    persona.timecreated
                ),
            inline: true
        });
    }

    if (
        persona?.communityvisibilitystate
    ) {
        embed.addFields({
            name: "Visibilidad",
            value:
                persona.communityvisibilitystate === 3
                    ? "Pública"
                    : "Privada",
            inline: true
        });
    }

    if (avatar) {
        embed.setThumbnail(avatar);
    }

    return embed;
}

// =====================================================
// BOTÓN
// =====================================================

function crearBotonPerfil(steamId64) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel(
                "Ver perfil de Steam"
            )
            .setStyle(
                ButtonStyle.Link
            )
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
            "Busca un jugador de Steam mediante BattleMetrics"
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

        console.log("");
        console.log(
            "🎯 Ejecutando /steam"
        );

        const nombre =
            interaction.options
                .getString("nombre")
                ?.trim();

        if (!nombre) {
            return interaction.reply({
                content:
                    "❌ Debes introducir un nombre.",
                ephemeral: true
            });
        }

        console.log(
            `[STEAM] Entrada recibida: "${nombre}"`
        );

        await interaction.deferReply();

        try {

            // =========================================
            // BATTLEMETRICS SERVER
            // =========================================

            const serverId =
                await obtenerBattleMetricsServerId(
                    interaction.guildId
                );

            if (!serverId) {
                return interaction.editReply(
                    "❌ Este servidor de Discord no tiene un servidor de BattleMetrics configurado. Usa `/configurar-servidor` primero."
                );
            }

            console.log(
                `[STEAM] BattleMetrics Server ID: ${serverId}`
            );

            // =========================================
            // BUSCAR PLAYER
            // =========================================

            const jugadores =
                await buscarJugadoresBattleMetrics(
                    nombre,
                    serverId
                );

            console.log(
                `[STEAM] Jugadores encontrados: ${jugadores.length}`
            );

            if (
                jugadores.length === 0
            ) {
                return interaction.editReply(
                    `❌ No encontré ningún jugador llamado exactamente \`${nombre}\` en el servidor de BattleMetrics configurado.`
                );
            }

            // =========================================
            // PROCESAR
            // =========================================

            const resultados = [];

            for (
                const jugador of jugadores
            ) {

                const playerId =
                    jugador.id;

                console.log("");

                console.log(
                    `[BM] PROCESANDO PLAYER ${playerId}`
                );

                let steamId64 = null;
                let resultadoSteamID = null;

                // -------------------------------------
                // BATTLEMETRICS IDENTIFIERS
                // -------------------------------------

                try {

                    const identifiers =
                        await obtenerIdentifiersBattleMetrics(
                            playerId
                        );

                    steamId64 =
                        encontrarSteamID64EnIdentifiers(
                            identifiers
                        );

                } catch (error) {

                    console.log(
                        `[BM] Error obteniendo identifiers: ${error.message}`
                    );
                }

                // -------------------------------------
                // STEAMID.COM
                // -------------------------------------

                if (!steamId64) {

                    console.log(
                        "[STEAMID.COM] BM no entregó SteamID64."
                    );

                    const resultadosSteamID =
                        await buscarSteamIDCom(
                            nombre
                        );

                    if (
                        resultadosSteamID.length > 0
                    ) {

                        const nombreLower =
                            nombre
                                .trim()
                                .toLowerCase();

                        resultadoSteamID =
                            resultadosSteamID.find(
                                resultado =>
                                    String(
                                        resultado.nombre ||
                                        ""
                                    )
                                        .trim()
                                        .toLowerCase() ===
                                    nombreLower
                            ) ||
                            resultadosSteamID[0];

                        steamId64 =
                            resultadoSteamID.steamId64;
                    }
                }

                // -------------------------------------
                // NO ENCONTRADO
                // -------------------------------------

                if (!steamId64) {

                    console.log(
                        `[STEAM] No se pudo obtener SteamID64 para ${jugador.attributes.name}`
                    );

                    resultados.push({
                        player: jugador,
                        steamId64: null,
                        persona: null,
                        nombre:
                            jugador.attributes.name,
                        avatar: null
                    });

                    continue;
                }

                console.log(
                    `[STEAM] SteamID64 final: ${steamId64}`
                );

                // -------------------------------------
                // STEAM API
                // -------------------------------------

                const persona =
                    await obtenerDatosSteam(
                        steamId64
                    );

                resultados.push({
                    player: jugador,
                    steamId64,
                    persona,
                    nombre:
                        persona?.personaname ||
                        resultadoSteamID?.nombre ||
                        jugador.attributes.name,
                    avatar:
                        persona?.avatarfull ||
                        resultadoSteamID?.avatar ||
                        null
                });
            }

            console.log(
                `[STEAM] Resultados finales: ${resultados.length}`
            );

            // =========================================
            // EMBEDS
            // =========================================

            const embeds =
                resultados
                    .slice(
                        0,
                        RESULTADOS_POR_PAGINA
                    )
                    .map(resultado => {

                        if (
                            !resultado.steamId64
                        ) {

                            return new EmbedBuilder()
                                .setTitle(
                                    `🎮 ${resultado.nombre}`
                                )
                                .setDescription(
                                    "⚠️ Encontrado en BattleMetrics, pero no fue posible obtener su SteamID64."
                                )
                                .addFields({
                                    name:
                                        "BattleMetrics Player ID",
                                    value:
                                        `\`${resultado.player.id}\``,
                                    inline: true
                                })
                                .setFooter({
                                    text:
                                        "BattleMetrics"
                                });
                        }

                        return crearEmbedResultado(
                            resultado
                        );
                    });

            // =========================================
            // BOTÓN
            // =========================================

            const primerResultado =
                resultados[0];

            let components = [];

            if (
                primerResultado?.steamId64
            ) {
                components.push(
                    crearBotonPerfil(
                        primerResultado.steamId64
                    )
                );
            }

            // =========================================
            // RESPONDER
            // =========================================

            await interaction.editReply({
                embeds,
                components
            });

            console.log(
                "✅ /steam terminado"
            );

        } catch (error) {

            console.error(
                "[STEAM] ERROR:",
                error
            );

            const mensaje =
                error.response?.data?.errors?.[0]
                    ?.detail ||
                error.response?.data?.message ||
                error.message ||
                "Error desconocido.";

            try {

                await interaction.editReply(
                    `❌ Ocurrió un error al buscar el jugador.\n\`${mensaje}\``
                );

            } catch {
                // Discord ya respondió.
            }

            console.log(
                "❌ /steam terminado con error"
            );
        }
    }
};