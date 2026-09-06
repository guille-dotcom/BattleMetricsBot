const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const axios = require("axios");
const puppeteer = require("puppeteer");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BATTLEMETRICS_API =
    "https://api.battlemetrics.com";

const BATTLEMETRICS_BASE =
    "https://www.battlemetrics.com";

const STEAMID_BASE =
    "https://www.steamid.com";

const STEAMWEBAPI_API =
    "https://www.steamwebapi.com";

const BATTLEMETRICS_SERVER_ID =
    "11378166";

const STEAMID64_MIN =
    76561197960265728n;

const STEAMID64_MAX =
    76561202255233023n;

// =====================================================
// USER AGENT
// =====================================================

const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/140.0.0.0 Safari/537.36";

// =====================================================
// VALIDAR STEAMID64
// =====================================================

function esSteamID64(valor) {

    if (
        valor === null ||
        valor === undefined
    ) {
        return false;
    }

    const texto =
        String(valor).trim();

    if (
        !/^\d{17}$/.test(texto)
    ) {
        return false;
    }

    try {

        const numero =
            BigInt(texto);

        return (
            numero >= STEAMID64_MIN &&
            numero <= STEAMID64_MAX
        );

    } catch {

        return false;
    }
}

// =====================================================
// NORMALIZAR NOMBRE
// =====================================================

function normalizarNombre(nombre) {

    return String(nombre || "")
        .trim()
        .normalize("NFKC")
        .toLowerCase();
}

// =====================================================
// HEADERS BATTLEMETRICS
// =====================================================

function getBattleMetricsHeaders() {

    const token =
        process.env.BATTLEMETRICS_TOKEN;

    const headers = {

        Accept:
            "application/vnd.api+json",

        "User-Agent":
            USER_AGENT
    };

    if (token) {

        headers.Authorization =
            `Bearer ${token}`;
    }

    return headers;
}

// =====================================================
// BUSCAR JUGADOR EN BATTLEMETRICS
// =====================================================

async function buscarJugadorBattleMetrics(nombre) {

    console.log(
        `[STEAM] Buscando "${nombre}" en BattleMetrics...`
    );

    try {

        const url =
            `${BATTLEMETRICS_API}/servers/${BATTLEMETRICS_SERVER_ID}`;

        const response =
            await axios.get(url, {

                params: {

                    include:
                        "player,identifier"
                },

                headers:
                    getBattleMetricsHeaders(),

                timeout:
                    30000
            });

        const resources =
            Array.isArray(
                response.data?.included
            )
                ? response.data.included
                : [];

        console.log(
            `[BATTLEMETRICS] Recursos recibidos: ${resources.length}`
        );

        const players =
            resources.filter(
                resource =>
                    resource.type === "player"
            );

        console.log(
            `[BATTLEMETRICS] Players encontrados: ${players.length}`
        );

        const buscado =
            normalizarNombre(nombre);

        const coincidencias =
            players.filter(player => {

                const playerName =
                    player?.attributes?.name;

                return (
                    normalizarNombre(
                        playerName
                    ) === buscado
                );
            });

        console.log(
            `[BATTLEMETRICS] Coincidencias exactas: ${coincidencias.length}`
        );

        if (
            !coincidencias.length
        ) {

            return null;
        }

        const player =
            coincidencias[0];

        console.log(
            `[BATTLEMETRICS] MATCH: ${player.id} | ${player.attributes?.name}`
        );

        return {

            id:
                String(player.id),

            name:
                player.attributes?.name ||
                nombre
        };

    } catch (error) {

        console.error(
            "[BATTLEMETRICS] Error:",
            error.response?.status ||
            error.message
        );

        if (
            error.response?.data
        ) {

            console.error(
                "[BATTLEMETRICS] Respuesta:",
                JSON.stringify(
                    error.response.data
                )
            );
        }

        return null;
    }
}

// =====================================================
// OBTENER ENLACE NAME SEARCH
// =====================================================

async function obtenerEnlaceNameSearch(
    playerId,
    nombre
) {

    const searchURL =
        `${STEAMID_BASE}/search?q=${encodeURIComponent(nombre)}`;

    console.log(
        `[STEAMID.COM] Name Search: ${searchURL}`
    );

    return searchURL;
}

// =====================================================
// OBTENER CHROME / PUPPETEER
// =====================================================

async function obtenerBrowser() {

    console.log(
        "[PUPPETEER] Iniciando Chrome..."
    );

    const posiblesExecutables = [

        process.env.PUPPETEER_EXECUTABLE_PATH,

        "/opt/render/project/src/.puppeteer-cache/chrome/linux-150.0.7871.24/chrome-linux64/chrome",

        "/opt/render/project/src/.cache/puppeteer/chrome/linux-150.0.0/chrome-linux64/chrome",

        "/usr/bin/google-chrome",

        "/usr/bin/chromium",

        "/usr/bin/chromium-browser"
    ].filter(Boolean);

    let executablePath = null;

    for (
        const ruta
        of posiblesExecutables
    ) {

        try {

            const fs =
                require("fs");

            if (
                fs.existsSync(ruta)
            ) {

                executablePath =
                    ruta;

                console.log(
                    `[PUPPETEER] Chrome encontrado: ${ruta}`
                );

                break;
            }

        } catch {
            // Continuar buscando
        }
    }

    const opciones = {

        headless:
            true,

        args: [

            "--no-sandbox",

            "--disable-setuid-sandbox",

            "--disable-dev-shm-usage",

            "--disable-gpu",

            "--no-first-run",

            "--no-zygote",

            "--disable-background-networking",

            "--disable-background-timer-throttling",

            "--disable-renderer-backgrounding",

            "--disable-features=TranslateUI",

            "--disable-ipc-flooding-protection"
        ],

        defaultViewport: {

            width:
                1366,

            height:
                768
        }
    };

    if (
        executablePath
    ) {

        opciones.executablePath =
            executablePath;
    }

    try {

        const browser =
            await puppeteer.launch(
                opciones
            );

        console.log(
            "[PUPPETEER] ✅ Chrome iniciado."
        );

        return browser;

    } catch (error) {

        console.error(
            "[PUPPETEER] ❌ Error iniciando Chrome:",
            error.message
        );

        throw error;
    }
}

// =====================================================
// EXTRAER PERFILES DESDE STEAMID.COM
// =====================================================

async function buscarEnSteamIDCom(
    searchURL
) {

    if (
        !searchURL
    ) {

        return [];
    }

    console.log(
        "========================================"
    );

    console.log(
        `[STEAMID.COM] Abriendo Name Search con Puppeteer: ${searchURL}`
    );

    console.log(
        "========================================"
    );

    let browser = null;

    try {

        browser =
            await obtenerBrowser();

        const page =
            await browser.newPage();

        await page.setUserAgent(
            USER_AGENT
        );

        await page.setExtraHTTPHeaders({

            "Accept-Language":
                "es-ES,es;q=0.9,en;q=0.8"
        });

        // -------------------------------------------------
        // Interceptar respuestas
        // -------------------------------------------------

        page.on(
            "response",
            response => {

                const status =
                    response.status();

                const url =
                    response.url();

                if (
                    status >= 400 &&
                    url.includes(
                        "steamid.com"
                    )
                ) {

                    console.log(
                        `[STEAMID.COM] Response ${status}: ${url}`
                    );
                }
            }
        );

        // -------------------------------------------------
        // Abrir búsqueda
        // -------------------------------------------------

        console.log(
            "[STEAMID.COM] Navegando..."
        );

        const response =
            await page.goto(
                searchURL,
                {

                    waitUntil:
                        "domcontentloaded",

                    timeout:
                        60000
                }
            );

        console.log(
            `[STEAMID.COM] HTTP inicial: ${response?.status() || "N/A"}`
        );

        // -------------------------------------------------
        // Esperar un poco a que cargue JavaScript
        // -------------------------------------------------

        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    5000
                )
        );

        console.log(
            `[STEAMID.COM] URL actual: ${page.url()}`
        );

        // -------------------------------------------------
        // Detectar Cloudflare
        // -------------------------------------------------

        const contenidoInicial =
            await page.content();

        if (
            /just a moment/i.test(
                contenidoInicial
            ) ||
            /cf-chl-/i.test(
                contenidoInicial
            ) ||
            /attention required/i.test(
                contenidoInicial
            )
        ) {

            console.error(
                "[STEAMID.COM] ❌ SteamID.com está mostrando una protección de Cloudflare."
            );

            return [];
        }

        // -------------------------------------------------
        // Buscar enlaces de perfiles
        // -------------------------------------------------

        console.log(
            "[STEAMID.COM] Buscando enlaces /profiles/..."
        );

        const enlaces =
            await page.evaluate(() => {

                const resultados =
                    [];

                const anchors =
                    Array.from(
                        document.querySelectorAll(
                            "a[href]"
                        )
                    );

                for (
                    const anchor
                    of anchors
                ) {

                    const href =
                        anchor.href ||
                        "";

                    if (
                        !href
                    ) {
                        continue;
                    }

                    try {

                        const url =
                            new URL(
                                href
                            );

                        if (
                            url.hostname !==
                            "www.steamid.com" &&
                            url.hostname !==
                            "steamid.com"
                        ) {
                            continue;
                        }

                        const match =
                            url.pathname.match(
                                /^\/profiles\/(7656119\d{10})\/?$/i
                            );

                        if (
                            match
                        ) {

                            resultados.push({

                                steamID64:
                                    match[1],

                                href:
                                    url.href,

                                texto:
                                    anchor.textContent
                                        ?.trim() ||
                                    ""
                            });
                        }

                    } catch {
                        // Ignorar URL inválida
                    }
                }

                return resultados;
            });

        console.log(
            `[STEAMID.COM] Enlaces de perfiles encontrados: ${enlaces.length}`
        );

        // -------------------------------------------------
        // Mostrar resultados encontrados
        // -------------------------------------------------

        for (
            const resultado
            of enlaces
        ) {

            console.log(
                `[STEAMID.COM] PERFIL: ${resultado.steamID64} | ${resultado.href} | ${resultado.texto}`
            );
        }

        // -------------------------------------------------
        // DEDUPLICAR POR STEAMID64
        // -------------------------------------------------

        const steamIDs =
            [
                ...new Set(

                    enlaces

                        .map(
                            resultado =>
                                String(
                                    resultado.steamID64
                                )
                        )

                        .filter(
                            esSteamID64
                        )
                )
            ];

        console.log(
            `[STEAMID.COM] SteamID64 únicos: ${steamIDs.length}`
        );

        for (
            const steamID64
            of steamIDs
        ) {

            console.log(
                `[STEAMID.COM] RESULTADO FINAL: ${steamID64}`
            );
        }

        return steamIDs;

    } catch (error) {

        console.error(
            "[STEAMID.COM] ❌ Error con Puppeteer:",
            error.message
        );

        return [];

    } finally {

        if (
            browser
        ) {

            try {

                await browser.close();

                console.log(
                    "[PUPPETEER] Chrome cerrado."
                );

            } catch (error) {

                console.error(
                    "[PUPPETEER] Error cerrando Chrome:",
                    error.message
                );
            }
        }
    }
}

// =====================================================
// OBTENER PERFIL POR STEAMID64 DESDE STEAMWEBAPI
// =====================================================

async function obtenerPerfilSteamWebAPI(
    steamID64
) {

    const apiKey =
        process.env.STEAMWEBAPI_KEY;

    if (
        !apiKey
    ) {

        console.error(
            "[STEAMWEBAPI] ❌ Falta STEAMWEBAPI_KEY."
        );

        return null;
    }

    console.log(
        `[STEAMWEBAPI] Obteniendo datos de ${steamID64}...`
    );

    try {

        const response =
            await axios.get(
                `${STEAMWEBAPI_API}/steam/api/profile`,
                {

                    params: {

                        id:
                            steamID64,

                        key:
                            apiKey,

                        no_cache:
                            1,

                        production:
                            1,

                        format:
                            "json"
                    },

                    headers: {

                        "X-Api-Key":
                            apiKey,

                        Accept:
                            "application/json"
                    },

                    timeout:
                        30000
                }
            );

        console.log(
            `[STEAMWEBAPI] HTTP ${response.status} para ${steamID64}`
        );

        const data =
            response.data;

        // -------------------------------------------------
        // Objeto directo
        // -------------------------------------------------

        if (
            data &&
            typeof data === "object" &&
            !Array.isArray(data)
        ) {

            const perfil =
                convertirPerfilSteamWebAPI(
                    data
                );

            if (
                perfil
            ) {

                return perfil;
            }

            // -------------------------------------------------
            // Objetos internos
            // -------------------------------------------------

            const posibles = [

                data.data,

                data.profile,

                data.response,

                data.result
            ];

            for (
                const objeto
                of posibles
            ) {

                if (
                    objeto &&
                    typeof objeto === "object" &&
                    !Array.isArray(objeto)
                ) {

                    const perfilInterno =
                        convertirPerfilSteamWebAPI(
                            objeto
                        );

                    if (
                        perfilInterno
                    ) {

                        return perfilInterno;
                    }
                }
            }
        }

        // -------------------------------------------------
        // Arrays
        // -------------------------------------------------

        const perfiles =
            obtenerArrayPerfilesSteamWebAPI(
                data
            );

        for (
            const objeto
            of perfiles
        ) {

            const perfil =
                convertirPerfilSteamWebAPI(
                    objeto
                );

            if (
                perfil
            ) {

                return perfil;
            }
        }

        console.log(
            `[STEAMWEBAPI] ⚠️ No se pudo convertir ${steamID64}`
        );

        return null;

    } catch (error) {

        console.error(
            `[STEAMWEBAPI] Error ${steamID64}:`,
            error.response?.status ||
            error.message
        );

        if (
            error.response?.data
        ) {

            console.error(
                `[STEAMWEBAPI] Respuesta ${steamID64}:`,
                JSON.stringify(
                    error.response.data,
                    null,
                    2
                )
            );
        }

        return null;
    }
}

// =====================================================
// OBTENER ARRAY DE PERFILES STEAMWEBAPI
// =====================================================

function obtenerArrayPerfilesSteamWebAPI(
    respuesta
) {

    if (
        Array.isArray(respuesta)
    ) {

        return respuesta;
    }

    if (
        Array.isArray(
            respuesta?.data
        )
    ) {

        return respuesta.data;
    }

    if (
        Array.isArray(
            respuesta?.results
        )
    ) {

        return respuesta.results;
    }

    if (
        Array.isArray(
            respuesta?.profiles
        )
    ) {

        return respuesta.profiles;
    }

    if (
        Array.isArray(
            respuesta?.response
        )
    ) {

        return respuesta.response;
    }

    if (
        Array.isArray(
            respuesta?.response?.players
        )
    ) {

        return respuesta.response.players;
    }

    return [];
}

// =====================================================
// EXTRAER STEAMID64 DE PERFIL
// =====================================================

function extraerSteamID64Perfil(
    perfil
) {

    const posibles = [

        perfil?.steamid,

        perfil?.steamId,

        perfil?.steamID,

        perfil?.steamid64,

        perfil?.steamId64,

        perfil?.steamID64,

        perfil?.steam_id,

        perfil?.steam_id64
    ];

    for (
        const valor
        of posibles
    ) {

        if (
            esSteamID64(valor)
        ) {

            return String(valor);
        }
    }

    return null;
}

// =====================================================
// CONVERTIR PERFIL STEAMWEBAPI
// =====================================================

function convertirPerfilSteamWebAPI(
    objeto
) {

    if (
        !objeto ||
        typeof objeto !== "object"
    ) {

        return null;
    }

    const steamid =
        extraerSteamID64Perfil(
            objeto
        );

    if (
        !steamid
    ) {

        return null;
    }

    return {

        steamid,

        personaname:
            objeto.personaname ||
            null,

        accountname:
            objeto.accountname ||
            null,

        displayname:
            objeto.displayname ||
            null,

        profiletype:
            objeto.profiletype ||
            null,

        realname:
            objeto.realname ||
            null,

        loccountrycode:
            objeto.loccountrycode ||
            null,

        description:
            objeto.description ||
            null,

        fame:
            objeto.fame ??
            null,

        vac:
            objeto.vac ??
            null,

        islimited:
            objeto.islimited ??
            null,

        level:
            objeto.level ??
            null,

        worth:
            objeto.worth ??
            null,

        worthsteam:
            objeto.worthsteam ??
            null,

        size:
            objeto.size ??
            null,

        peritem:
            objeto.peritem ??
            null,

        totalplaytime:
            objeto.totalplaytime ??
            null,

        playtimerecent:
            objeto.playtimerecent ??
            null,

        timecreated:
            objeto.timecreated ??
            null,

        updatedat:
            objeto.updatedat ??
            null,

        inventoryupdatedat:
            objeto.inventoryupdatedat ??
            null,

        avatar:
            objeto.avatar ||
            null,

        avatarmedium:
            objeto.avatarmedium ||
            null,

        avatarfull:
            objeto.avatarfull ||
            null,

        profileurl:
            objeto.profileurl ||
            null,

        profilesteamurl:
            objeto.profilesteamurl ||
            null,

        onlinestate:
            objeto.onlinestate ??
            null,

        ingameinfo:
            objeto.ingameinfo ??
            null
    };
}

// =====================================================
// MOSTRAR VALOR
// =====================================================

function mostrarValor(
    valor,
    defecto = "N/A"
) {

    if (
        valor === null ||
        valor === undefined ||
        valor === ""
    ) {

        return defecto;
    }

    return String(valor);
}

// =====================================================
// FORMATEAR FECHA
// =====================================================

function formatearFechaUnix(
    timestamp
) {

    if (
        !timestamp
    ) {

        return "Desconocida";
    }

    const fecha =
        new Date(
            Number(timestamp) * 1000
        );

    if (
        Number.isNaN(
            fecha.getTime()
        )
    ) {

        return "Desconocida";
    }

    return `<t:${Math.floor(
        Number(timestamp)
    )}:D>`;
}

// =====================================================
// ESTADO VAC
// =====================================================

function obtenerEstadoVAC(
    valor
) {

    if (
        valor === null ||
        valor === undefined
    ) {

        return "N/A";
    }

    if (
        valor === true ||
        valor === 1 ||
        valor === "1"
    ) {

        return "🔴 Sí";
    }

    return "🟢 No";
}

// =====================================================
// CREAR EMBED DE PERFIL
// =====================================================

function crearEmbedPerfil(
    jugador,
    perfil,
    steamID64,
    totalResultados
) {

    const nombreSteam =
        perfil?.personaname ||
        perfil?.displayname ||
        perfil?.accountname ||
        jugador.name;

    const avatar =
        perfil?.avatarfull ||
        perfil?.avatarmedium ||
        perfil?.avatar ||
        null;

    const profileURL =
        perfil?.profileurl ||
        perfil?.profilesteamurl ||
        `https://steamcommunity.com/profiles/${steamID64}`;

    const embed =
        new EmbedBuilder()
            .setColor(
                0x1b2838
            )
            .setTitle(
                `🎮 ${nombreSteam}`
            )
            .setURL(
                profileURL
            );

    if (
        avatar
    ) {

        embed.setThumbnail(
            avatar
        );
    }

    embed.addFields(

        {
            name:
                "🆔 SteamID64",

            value:
                `\`${steamID64}\``,

            inline:
                false
        },

        {
            name:
                "👤 Nombre Steam",

            value:
                mostrarValor(
                    perfil?.personaname ||
                    perfil?.displayname ||
                    perfil?.accountname
                ),

            inline:
                true
        },

        {
            name:
                "🏷️ Account Name",

            value:
                mostrarValor(
                    perfil?.accountname
                ),

            inline:
                true
        },

        {
            name:
                "⭐ Nivel",

            value:
                mostrarValor(
                    perfil?.level
                ),

            inline:
                true
        },

        {
            name:
                "💰 Worth",

            value:
                mostrarValor(
                    perfil?.worth
                ),

            inline:
                true
        },

        {
            name:
                "🛡️ VAC",

            value:
                obtenerEstadoVAC(
                    perfil?.vac
                ),

            inline:
                true
        },

        {
            name:
                "📅 Cuenta creada",

            value:
                formatearFechaUnix(
                    perfil?.timecreated
                ),

            inline:
                true
        },

        {
            name:
                "🌎 País",

            value:
                mostrarValor(
                    perfil?.loccountrycode
                ),

            inline:
                true
        },

        {
            name:
                "👤 BattleMetrics",

            value:
                `[${jugador.name}](https://www.battlemetrics.com/players/${jugador.id})`,

            inline:
                false
        }
    );

    if (
        totalResultados > 1
    ) {

        embed.setFooter({

            text:
                `RustLogix • ${totalResultados} cuentas Steam encontradas • SteamID.com`
        });

    } else {

        embed.setFooter({

            text:
                "RustLogix • SteamID.com + SteamWebAPI"
        });
    }

    return {

        embed,

        profileURL
    };
}

// =====================================================
// COMANDO
// =====================================================

module.exports = {

    data:

        new SlashCommandBuilder()

            .setName(
                "steam"
            )

            .setDescription(
                "Busca un jugador de Rust en BattleMetrics y obtiene sus perfiles de Steam"
            )

            .addStringOption(
                option =>
                    option
                        .setName(
                            "nombre"
                        )
                        .setDescription(
                            "Nombre exacto del jugador"
                        )
                        .setRequired(
                            true
                        )
            ),

    async execute(
        interaction
    ) {

        const nombre =
            interaction.options.getString(
                "nombre"
            );

        console.log(
            "========================================"
        );

        console.log(
            "[STEAM] Ejecutando /steam"
        );

        console.log(
            `[STEAM] Entrada recibida: "${nombre}"`
        );

        console.log(
            "========================================"
        );

        await interaction.deferReply();

        // =================================================
        // 1. BUSCAR EN BATTLEMETRICS
        // =================================================

        const jugador =
            await buscarJugadorBattleMetrics(
                nombre
            );

        if (
            !jugador
        ) {

            const embed =
                new EmbedBuilder()

                    .setColor(
                        0xff0000
                    )

                    .setTitle(
                        "❌ Jugador no encontrado"
                    )

                    .setDescription(
                        `No encontré a **${nombre}** en el servidor configurado de BattleMetrics.`
                    );

            return interaction.editReply({

                embeds: [
                    embed
                ]
            });
        }

        // =================================================
        // 2. GENERAR NAME SEARCH
        // =================================================

        const searchURL =
            await obtenerEnlaceNameSearch(
                jugador.id,
                jugador.name
            );

        if (
            !searchURL
        ) {

            const embed =
                new EmbedBuilder()

                    .setColor(
                        0xff9900
                    )

                    .setTitle(
                        "⚠️ Name Search no disponible"
                    )

                    .setDescription(
                        `Encontré a **${jugador.name}** en BattleMetrics, pero no pude generar el enlace de SteamID.com.`
                    )

                    .addFields({

                        name:
                            "BattleMetrics",

                        value:
                            `[Ver perfil](https://www.battlemetrics.com/players/${jugador.id})`,

                        inline:
                            false
                    });

            return interaction.editReply({

                embeds: [
                    embed
                ]
            });
        }

        // =================================================
        // 3. BUSCAR EN STEAMID.COM CON PUPPETEER
        // =================================================

        const steamIDs =
            await buscarEnSteamIDCom(
                searchURL
            );

        // =================================================
        // 4. DEDUPLICACIÓN POR STEAMID64
        // =================================================

        const steamIDsUnicos =
            [
                ...new Set(
                    steamIDs.filter(
                        esSteamID64
                    )
                )
            ];

        console.log(
            `[STEAMID.COM] Resultados totales: ${steamIDs.length}`
        );

        console.log(
            `[STEAMID.COM] Cuentas únicas después de deduplicar: ${steamIDsUnicos.length}`
        );

        if (
            steamIDsUnicos.length === 0
        ) {

            const embed =
                new EmbedBuilder()

                    .setColor(
                        0xff9900
                    )

                    .setTitle(
                        "⚠️ No se encontró SteamID64"
                    )

                    .setDescription(
                        `BattleMetrics encontró a **${jugador.name}**, pero SteamID.com no devolvió ningún perfil Steam válido.`
                    )

                    .addFields(

                        {

                            name:
                                "🔎 Name Search",

                            value:
                                `[Abrir búsqueda en SteamID.com](${searchURL})`,

                            inline:
                                false
                        },

                        {

                            name:
                                "👤 BattleMetrics",

                            value:
                                `[${jugador.name}](https://www.battlemetrics.com/players/${jugador.id})`,

                            inline:
                                false
                        }
                    );

            return interaction.editReply({

                embeds: [
                    embed
                ]
            });
        }

        // =================================================
        // 5. OBTENER DATOS DE CADA STEAMID64
        // =================================================

        const perfiles =
            [];

        for (
            const steamID64
            of steamIDsUnicos
        ) {

            const perfil =
                await obtenerPerfilSteamWebAPI(
                    steamID64
                );

            perfiles.push({

                steamid:
                    steamID64,

                perfil
            });
        }

        console.log(
            `[STEAM] Perfiles procesados: ${perfiles.length}`
        );

        // =================================================
        // 6. CREAR EMBEDS
        // =================================================

        const embeds =
            [];

        const botones =
            [];

        for (
            const resultado
            of perfiles
        ) {

            const resultadoEmbed =
                crearEmbedPerfil(

                    jugador,

                    resultado.perfil,

                    resultado.steamid,

                    perfiles.length
                );

            embeds.push(
                resultadoEmbed.embed
            );

            botones.push({

                steamID64:
                    resultado.steamid,

                profileURL:
                    resultadoEmbed.profileURL
            });
        }

        // =================================================
        // DISCORD MAX 10 EMBEDS
        // =================================================

        const embedsEnviar =
            embeds.slice(
                0,
                10
            );

        // =================================================
        // 7. BOTONES
        // =================================================

        const components =
            [];

        if (
            botones.length === 1
        ) {

            const perfil =
                botones[0];

            const row =
                new ActionRowBuilder()

                    .addComponents(

                        new ButtonBuilder()

                            .setLabel(
                                "Perfil Steam"
                            )

                            .setStyle(
                                ButtonStyle.Link
                            )

                            .setURL(
                                perfil.profileURL
                            ),

                        new ButtonBuilder()

                            .setLabel(
                                "SteamID.com"
                            )

                            .setStyle(
                                ButtonStyle.Link
                            )

                            .setURL(
                                searchURL
                            ),

                        new ButtonBuilder()

                            .setLabel(
                                "BattleMetrics"
                            )

                            .setStyle(
                                ButtonStyle.Link
                            )

                            .setURL(
                                `https://www.battlemetrics.com/players/${jugador.id}`
                            )
                    );

            components.push(
                row
            );

        } else {

            const row =
                new ActionRowBuilder()

                    .addComponents(

                        new ButtonBuilder()

                            .setLabel(
                                "SteamID.com Name Search"
                            )

                            .setStyle(
                                ButtonStyle.Link
                            )

                            .setURL(
                                searchURL
                            ),

                        new ButtonBuilder()

                            .setLabel(
                                "BattleMetrics"
                            )

                            .setStyle(
                                ButtonStyle.Link
                            )

                            .setURL(
                                `https://www.battlemetrics.com/players/${jugador.id}`
                            )
                    );

            components.push(
                row
            );
        }

        // =================================================
        // 8. RESPONDER
        // =================================================

        console.log(
            "========================================"
        );

        console.log(
            `[STEAM] Resultado final: ${embedsEnviar.length} perfil(es)`
        );

        console.log(
            "========================================"
        );

        return interaction.editReply({

            embeds:
                embedsEnviar,

            components
        });
    }
};