const axios = require("axios");
const cheerio = require("cheerio");
const {
    EmbedBuilder
} = require("discord.js");

const RustDropsMonitor =
    require("../models/RustDropsMonitor");

// ============================================================
// CONFIGURACIÓN
// ============================================================

const FACEPUNCH_DROPS_URL =
    "https://twitch.facepunch.com/?handler=Twitch";

const TWITCH_API =
    "https://api.twitch.tv/helix";

const TWITCH_GAME_ID_RUST =
    "252490";

const INTERVALO_DROPS =
    60 * 1000;

const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155.0.0.0 Safari/537.36";

let dropsAutomaticosIniciados =
    false;

let dropsRevisando =
    false;


// ============================================================
// TWITCH APP TOKEN
// ============================================================

let twitchAppTokenCache =
    null;

let twitchAppTokenExpira =
    0;


// ============================================================
// NORMALIZAR LOGIN
// ============================================================

function normalizarLogin(
    login
) {
    return String(
        login || ""
    )
        .trim()
        .toLowerCase();
}


// ============================================================
// OBTENER TOKEN APP DE TWITCH
// ============================================================

async function obtenerTwitchAppToken() {

    const clientId =
        process.env.TWITCH_CLIENT_ID;

    const clientSecret =
        process.env.TWITCH_CLIENT_SECRET;

    if (
        !clientId ||
        !clientSecret
    ) {
        throw new Error(
            "Faltan TWITCH_CLIENT_ID o TWITCH_CLIENT_SECRET."
        );
    }

    const ahora =
        Date.now();

    if (
        twitchAppTokenCache &&
        ahora <
            twitchAppTokenExpira
    ) {
        return twitchAppTokenCache;
    }

    const respuesta =
        await axios.post(
            "https://id.twitch.tv/oauth2/token",
            null,
            {
                params: {
                    client_id:
                        clientId,

                    client_secret:
                        clientSecret,

                    grant_type:
                        "client_credentials"
                },

                timeout:
                    15000
            }
        );

    const token =
        respuesta.data?.access_token;

    const expiresIn =
        Number(
            respuesta.data?.expires_in ||
                3600
        );

    if (!token) {
        throw new Error(
            "Twitch no devolvió access_token."
        );
    }

    twitchAppTokenCache =
        token;

    twitchAppTokenExpira =
        ahora +
        Math.max(
            60000,
            (expiresIn - 300) *
                1000
        );

    return token;
}


// ============================================================
// OBTENER STREAMERS ONLINE EN RUST
// ============================================================

async function obtenerStreamersOnlineRust(
    logins = []
) {
    const unicos =
        [
            ...new Set(
                logins
                    .map(
                        normalizarLogin
                    )
                    .filter(Boolean)
            )
        ];

    if (!unicos.length) {
        return new Map();
    }

    const clientId =
        process.env.TWITCH_CLIENT_ID;

    if (!clientId) {
        throw new Error(
            "Falta TWITCH_CLIENT_ID."
        );
    }

    const token =
        await obtenerTwitchAppToken();

    const resultado =
        new Map();

    // Twitch permite hasta 100 user_login
    // por consulta.

    for (
        let i = 0;
        i < unicos.length;
        i += 100
    ) {
        const bloque =
            unicos.slice(
                i,
                i + 100
            );

        const params =
            new URLSearchParams();

        for (
            const login
            of bloque
        ) {
            params.append(
                "user_login",
                login
            );
        }

        const respuesta =
            await axios.get(
                `${TWITCH_API}/streams?${params.toString()}`,
                {
                    headers: {
                        Authorization:
                            `Bearer ${token}`,

                        "Client-ID":
                            clientId
                    },

                    timeout:
                        15000
                }
            );

        const streams =
            Array.isArray(
                respuesta.data?.data
            )
                ? respuesta.data.data
                : [];

        for (
            const stream
            of streams
        ) {
            const login =
                normalizarLogin(
                    stream.user_login
                );

            if (!login) {
                continue;
            }

            const gameId =
                String(
                    stream.game_id ||
                        ""
                );

            const gameName =
                String(
                    stream.game_name ||
                        ""
                );

            const esRust =
                gameId ===
                    TWITCH_GAME_ID_RUST ||
                gameName
                    .trim()
                    .toLowerCase() ===
                    "rust";

            if (!esRust) {
                continue;
            }

            resultado.set(
                login,
                {
                    login,

                    displayName:
                        stream.user_name ||
                        login,

                    online:
                        true,

                    gameId,

                    gameName,

                    title:
                        stream.title ||
                        "",

                    startedAt:
                        stream.started_at ||
                        null,

                    viewerCount:
                        Number(
                            stream.viewer_count ||
                                0
                        )
                }
            );
        }
    }

    return resultado;
}


// ============================================================
// LIMPIAR TEXTO HTML
// ============================================================

function limpiarTexto(
    texto
) {
    return String(
        texto || ""
    )
        .replace(
            /\s+/g,
            " "
        )
        .trim();
}


// ============================================================
// EXTRAER HORAS
// ============================================================

function extraerHoras(
    texto
) {
    const match =
        String(
            texto || ""
        ).match(
            /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i
        );

    if (!match) {
        return 1;
    }

    const horas =
        Number(
            match[1]
        );

    return Number.isFinite(
        horas
    )
        ? horas
        : 1;
}


// ============================================================
// EXTRAER IMAGEN
// ============================================================

function extraerImagenDrop(
    elemento
) {
    if (!elemento) {
        return null;
    }

    const posibles = [];

    $(elemento)
        .find("img")
        .each(
            (_, img) => {
                const src =
                    $(img).attr(
                        "src"
                    );

                const srcset =
                    $(img).attr(
                        "srcset"
                    );

                if (src) {
                    posibles.push(
                        src
                    );
                }

                if (srcset) {
                    const primero =
                        srcset
                            .split(",")[0]
                            ?.trim()
                            ?.split(/\s+/)[0];

                    if (primero) {
                        posibles.push(
                            primero
                        );
                    }
                }
            }
        );

    for (
        const url
        of posibles
    ) {
        if (
            !url ||
            url.startsWith(
                "data:"
            )
        ) {
            continue;
        }

        if (
            /avatar|profile|banner|favicon|logo/i.test(
                url
            )
        ) {
            continue;
        }

        if (
            /economy\/image|steamstatic|fastly|cloudflare|files\.facepunch/i.test(
                url
            )
        ) {
            return url;
        }
    }

    return null;
}


// ============================================================
// EXTRAER GENERAL DROPS
// ============================================================

function extraerGeneralDrops(
    $,
    html
) {
    const drops = [];

    const vistos =
        new Set();

    let inicio =
        html.search(
            /General Drops/i
        );

    if (
        inicio === -1
    ) {
        console.warn(
            "⚠️ No se encontró sección General Drops."
        );

        return drops;
    }

    let fin =
        html.search(
            /Streamer Drops/i
        );

    if (
        fin === -1 ||
        fin <= inicio
    ) {
        fin =
            html.length;
    }

    const bloque =
        html.slice(
            inicio,
            fin
        );

    const $bloque =
        cheerio.load(
            bloque
        );

    // --------------------------------------------------------
    // Primero intentamos detectar elementos visuales.
    // --------------------------------------------------------

    $bloque(
        "*"
    ).each(
        (_, elemento) => {

            const texto =
                limpiarTexto(
                    $bloque(
                        elemento
                    ).text()
                );

            if (
                !texto ||
                texto.length > 150
            ) {
                return;
            }

            const match =
                texto.match(
                    /^(.+?)\s+(\d+(?:\.\d+)?)\s+Hours?$/i
                );

            if (!match) {
                return;
            }

            const nombre =
                limpiarTexto(
                    match[1]
                );

            const horas =
                Number(
                    match[2]
                );

            if (
                !nombre ||
                !Number.isFinite(
                    horas
                )
            ) {
                return;
            }

            if (
                /General Drops|Available across|Drops Enabled/i.test(
                    nombre
                )
            ) {
                return;
            }

            const clave =
                nombre.toLowerCase();

            if (
                vistos.has(
                    clave
                )
            ) {
                return;
            }

            const imagen =
                extraerImagenDrop(
                    elemento
                );

            vistos.add(
                clave
            );

            drops.push({
                tipo:
                    "general",

                nombre,

                horas,

                imagen:
                    imagen ||
                    null,

                canales:
                    []
            });
        }
    );

    // --------------------------------------------------------
    // Fallback: analizar texto plano.
    // --------------------------------------------------------

    if (
        !drops.length
    ) {
        const texto =
            limpiarTexto(
                $bloque.text()
            );

        const regex =
            /([A-Za-z0-9][A-Za-z0-9'’.\-+()™®:& ]{1,80}?)\s+(\d+(?:\.\d+)?)\s+Hours?/gi;

        let match;

        while (
            (
                match =
                    regex.exec(
                        texto
                    )
            )
        ) {
            const nombre =
                limpiarTexto(
                    match[1]
                );

            const horas =
                Number(
                    match[2]
                );

            if (
                !nombre ||
                !Number.isFinite(
                    horas
                )
            ) {
                continue;
            }

            if (
                /General Drops|Available across|Drops Enabled/i.test(
                    nombre
                )
            ) {
                continue;
            }

            const clave =
                nombre.toLowerCase();

            if (
                vistos.has(
                    clave
                )
            ) {
                continue;
            }

            vistos.add(
                clave
            );

            drops.push({
                tipo:
                    "general",

                nombre,

                horas,

                imagen:
                    null,

                canales:
                    []
            });
        }
    }

    return drops;
}


// ============================================================
// EXTRAER STREAMER DROPS
// ============================================================

function extraerStreamerDrops(
    $,
    html
) {
    const drops = [];

    const streamerSection =
        html.search(
            /Streamer Drops/i
        );

    if (
        streamerSection === -1
    ) {
        console.warn(
            "⚠️ No se encontró sección Streamer Drops."
        );

        return drops;
    }

    let fin =
        html.search(
            /Drops Metrics/i
        );

    if (
        fin === -1 ||
        fin <= streamerSection
    ) {
        fin =
            html.length;
    }

    const bloque =
        html.slice(
            streamerSection,
            fin
        );

    const $bloque =
        cheerio.load(
            bloque
        );

    // --------------------------------------------------------
    // Buscamos links de Twitch y agrupamos los streamers
    // con los elementos de recompensa que aparecen cerca.
    // --------------------------------------------------------

    const streamers =
        [];

    $bloque(
        'a[href*="twitch.tv/"]'
    ).each(
        (_, enlace) => {

            const href =
                $bloque(
                    enlace
                ).attr(
                    "href"
                ) || "";

            const match =
                href.match(
                    /twitch\.tv\/([^/?#]+)/i
                );

            if (!match) {
                return;
            }

            const login =
                normalizarLogin(
                    match[1]
                );

            if (!login) {
                return;
            }

            const displayName =
                limpiarTexto(
                    $bloque(
                        enlace
                    ).text()
                ) ||
                login;

            streamers.push({
                login,

                displayName,

                elemento:
                    enlace
            });
        }
    );

    // --------------------------------------------------------
    // Eliminar duplicados.
    // --------------------------------------------------------

    const streamersUnicos =
        [];

    const streamersMap =
        new Map();

    for (
        const streamer
        of streamers
    ) {
        if (
            streamersMap.has(
                streamer.login
            )
        ) {
            continue;
        }

        streamersMap.set(
            streamer.login,
            streamer
        );

        streamersUnicos.push(
            streamer
        );
    }

    // --------------------------------------------------------
    // Detectar posibles bloques de Drop.
    // --------------------------------------------------------

    const posiblesDrops =
        [];

    $bloque(
        "*"
    ).each(
        (_, elemento) => {

            const texto =
                limpiarTexto(
                    $bloque(
                        elemento
                    ).text()
                );

            if (
                !texto ||
                texto.length > 120
            ) {
                return;
            }

            const match =
                texto.match(
                    /^(.+?)\s+(\d+(?:\.\d+)?)\s+(?:Hours?|Minutes?)$/i
                );

            if (!match) {
                return;
            }

            const nombre =
                limpiarTexto(
                    match[1]
                );

            const cantidad =
                Number(
                    match[2]
                );

            if (
                !nombre ||
                !Number.isFinite(
                    cantidad
                )
            ) {
                return;
            }

            if (
                /Streamer Drops|Drops Metrics|Sort by|Online|Random/i.test(
                    nombre
                )
            ) {
                return;
            }

            posiblesDrops.push({
                elemento,

                nombre,

                cantidad
            });
        }
    );

    // --------------------------------------------------------
    // Relacionar cada Drop con streamers cercanos.
    // --------------------------------------------------------

    for (
        const item
        of posiblesDrops
    ) {
        const htmlElemento =
            $bloque.html(
                item.elemento
            ) || "";

        const textoElemento =
            limpiarTexto(
                $bloque(
                    item.elemento
                ).text()
            );

        const streamersAsociados =
            [];

        // Buscar primero dentro del padre.
        let padre =
            $bloque(
                item.elemento
            ).parent();

        for (
            let nivel = 0;
            nivel < 5 &&
            padre &&
            padre.length;
            nivel++
        ) {
            padre.find(
                'a[href*="twitch.tv/"]'
            ).each(
                (_, enlace) => {

                    const href =
                        $bloque(
                            enlace
                        ).attr(
                            "href"
                        ) || "";

                    const match =
                        href.match(
                            /twitch\.tv\/([^/?#]+)/i
                        );

                    if (!match) {
                        return;
                    }

                    const login =
                        normalizarLogin(
                            match[1]
                        );

                    if (
                        !login
                    ) {
                        return;
                    }

                    const existente =
                        streamersUnicos.find(
                            streamer =>
                                streamer.login ===
                                login
                        );

                    if (
                        existente &&
                        !streamersAsociados.some(
                            streamer =>
                                streamer.login ===
                                login
                        )
                    ) {
                        streamersAsociados.push(
                            existente
                        );
                    }
                }
            );

            if (
                streamersAsociados.length
            ) {
                break;
            }

            padre =
                padre.parent();
        }

        // ----------------------------------------------------
        // Fallback por proximidad en HTML.
        // ----------------------------------------------------

        if (
            !streamersAsociados.length
        ) {
            const posicion =
                bloque.indexOf(
                    htmlElemento
                );

            if (
                posicion !== -1
            ) {
                const antes =
                    bloque.slice(
                        Math.max(
                            0,
                            posicion -
                                3000
                        ),
                        posicion
                    );

                const candidatos =
                    [];

                for (
                    const streamer
                    of streamersUnicos
                ) {
                    const indice =
                        antes.toLowerCase()
                            .lastIndexOf(
                                streamer.login
                            );

                    if (
                        indice !== -1
                    ) {
                        candidatos.push({
                            streamer,

                            indice
                        });
                    }
                }

                candidatos.sort(
                    (
                        a,
                        b
                    ) =>
                        b.indice -
                        a.indice
                );

                for (
                    const candidato
                    of candidatos.slice(
                        0,
                        3
                    )
                ) {
                    streamersAsociados.push(
                        candidato.streamer
                    );
                }
            }
        }

        // ----------------------------------------------------
        // Si no encontramos streamer, no inventamos uno.
        // ----------------------------------------------------

        if (
            !streamersAsociados.length
        ) {
            continue;
        }

        const imagen =
            extraerImagenDrop(
                item.elemento
            );

        drops.push({
            tipo:
                "streamer",

            nombre:
                item.nombre,

            horas:
                item.cantidad,

            imagen:
                imagen ||
                null,

            canales:
                streamersAsociados.map(
                    streamer => ({
                        login:
                            streamer.login,

                        displayName:
                            streamer.displayName,

                        online:
                            false
                    })
                )
        });
    }

    // --------------------------------------------------------
    // Eliminar duplicados.
    // --------------------------------------------------------

    const resultado =
        [];

    const vistos =
        new Set();

    for (
        const drop
        of drops
    ) {
        const clave =
            [
                drop.nombre
                    .toLowerCase(),

                (
                    drop.canales ||
                    []
                )
                    .map(
                        canal =>
                            canal.login
                    )
                    .sort()
                    .join(",")
            ].join(
                "|"
            );

        if (
            vistos.has(
                clave
            )
        ) {
            continue;
        }

        vistos.add(
            clave
        );

        resultado.push(
            drop
        );
    }

    return resultado;
}


// ============================================================
// EXTRAER CAMPAÑA COMPLETA DE FACEPUNCH
// ============================================================

async function obtenerDropsFacepunch() {

    try {

        console.log(
            "🎁 Consultando Twitch Drops desde Facepunch..."
        );

        const respuesta =
            await axios.get(
                FACEPUNCH_DROPS_URL,
                {
                    headers: {
                        "User-Agent":
                            USER_AGENT,

                        Accept:
                            "text/html,application/xhtml+xml"
                    },

                    timeout:
                        30000
                }
            );

        const html =
            String(
                respuesta.data ||
                    ""
            );

        if (
            !html
        ) {
            throw new Error(
                "Facepunch devolvió HTML vacío."
            );
        }

        const $ =
            cheerio.load(
                html
            );

        const texto =
            limpiarTexto(
                $.text()
            );

        // ----------------------------------------------------
        // CAMPAÑA
        // ----------------------------------------------------

        let campaignName =
            "Twitch Drops";

        const campaignMatch =
            texto.match(
                /Twitch Drops Round\s+\d+\s+Hosted by\s+(.+?)(?=\s+(?:Base Invaders|Rust Isles|Rust Drops)|\s+\d{1,2}\s+days?)/i
            );

        if (
            campaignMatch
        ) {
            campaignName =
                limpiarTexto(
                    campaignMatch[0]
                );
        } else {

            const simpleCampaign =
                texto.match(
                    /Twitch Drops Round\s+\d+\s+Hosted by\s+[A-Za-z0-9 .'"&™®_-]+/i
                );

            if (
                simpleCampaign
            ) {
                campaignName =
                    limpiarTexto(
                        simpleCampaign[0]
                    );
            }
        }

        // ----------------------------------------------------
        // FECHAS
        // ----------------------------------------------------

        let fechaInicio =
            null;

        let fechaFin =
            null;

        const fechaMatch =
            texto.match(
                /([A-Z][a-z]+\s+\d{1,2},\s+\d{4}\s+at\s+\d{1,2}:\d{2}\s+[AP]M\s+UTC)\s*-\s*([A-Z][a-z]+\s+\d{1,2},\s+\d{4}\s+at\s+\d{1,2}:\d{2}\s+[AP]M\s+UTC)/i
            );

        if (
            fechaMatch
        ) {
            const inicio =
                new Date(
                    fechaMatch[1]
                );

            const fin =
                new Date(
                    fechaMatch[2]
                );

            if (
                !Number.isNaN(
                    inicio.getTime()
                )
            ) {
                fechaInicio =
                    inicio.toISOString();
            }

            if (
                !Number.isNaN(
                    fin.getTime()
                )
            ) {
                fechaFin =
                    fin.toISOString();
            }
        }

        // ----------------------------------------------------
        // THEME
        // ----------------------------------------------------

        let campaignTheme =
            null;

        const temasConocidos = [
            "Rust Isles",
            "Base Invaders"
        ];

        for (
            const tema
            of temasConocidos
        ) {
            if (
                texto.includes(
                    tema
                )
            ) {
                campaignTheme =
                    tema;

                break;
            }
        }

        // ----------------------------------------------------
        // DROPS
        // ----------------------------------------------------

        const generalDrops =
            extraerGeneralDrops(
                $,
                html
            );

        const streamerDrops =
            extraerStreamerDrops(
                $,
                html
            );

        // ----------------------------------------------------
        // TODOS LOS STREAMERS
        // ----------------------------------------------------

        const logins =
            [
                ...new Set(
                    streamerDrops
                        .flatMap(
                            drop =>
                                (
                                    drop.canales ||
                                    []
                                ).map(
                                    canal =>
                                        normalizarLogin(
                                            canal.login
                                        )
                                )
                        )
                        .filter(Boolean)
                )
            ];

        // ----------------------------------------------------
        // ESTADO TWITCH
        // ----------------------------------------------------

        let streamersOnline =
            new Map();

        try {

            streamersOnline =
                await obtenerStreamersOnlineRust(
                    logins
                );

        } catch (error) {

            console.error(
                "❌ Error consultando estado Twitch:",
                error.message
            );
        }

        // ----------------------------------------------------
        // AÑADIR ONLINE
        // ----------------------------------------------------

        for (
            const drop
            of streamerDrops
        ) {
            for (
                const canal
                of drop.canales ||
                []
            ) {
                const login =
                    normalizarLogin(
                        canal.login
                    );

                const online =
                    streamersOnline.get(
                        login
                    );

                canal.online =
                    !!online;

                if (
                    online
                ) {
                    canal.displayName =
                        online.displayName ||
                        canal.displayName ||
                        login;
                }
            }
        }

        // ----------------------------------------------------
        // CONTADORES
        // ----------------------------------------------------

        const streamersUnicos =
            new Set();

        for (
            const drop
            of streamerDrops
        ) {
            for (
                const canal
                of drop.canales ||
                []
            ) {
                const login =
                    normalizarLogin(
                        canal.login
                    );

                if (
                    login
                ) {
                    streamersUnicos.add(
                        login
                    );
                }
            }
        }

        console.log(
            `🎁 General Drops: ${generalDrops.length}`
        );

        console.log(
            `🎥 Streamer Drops: ${streamerDrops.length}`
        );

        console.log(
            `📺 Streamers asociados: ${streamersUnicos.size}`
        );

        console.log(
            `🟢 Streamers ONLINE EN RUST: ${streamersOnline.size}`
        );

        return {
            campaignName,

            campaignTheme,

            fechaInicio,

            fechaFin,

            generalDrops,

            streamerDrops,

            onlineCount:
                streamersOnline.size,

            totalStreamers:
                streamersUnicos.size,

            actualizado:
                new Date(),

            error:
                false
        };

    } catch (error) {

        console.error(
            "❌ Error obteniendo Twitch Drops desde Facepunch:",
            error.message
        );

        return {
            campaignName:
                "Twitch Drops",

            campaignTheme:
                null,

            fechaInicio:
                null,

            fechaFin:
                null,

            generalDrops:
                [],

            streamerDrops:
                [],

            onlineCount:
                0,

            totalStreamers:
                0,

            actualizado:
                new Date(),

            error:
                true,

            mensaje:
                error.message
        };
    }
}


// ============================================================
// CREAR EMBED DROP
// ============================================================

function crearEmbedDrop(
    drop
) {

    const esStreamer =
        drop.tipo ===
        "streamer";

    const embed =
        new EmbedBuilder()
            .setColor(
                esStreamer
                    ? 0x9146ff
                    : 0x3498db
            )
            .setTitle(
                esStreamer
                    ? `🎯 ${drop.nombre}`
                    : `📦 ${drop.nombre}`
            )
            .addFields({
                name:
                    "⏱️ Tiempo",

                value:
                    `${drop.horas} ${
                        Number(
                            drop.horas
                        ) === 1
                            ? "hora"
                            : "horas"
                    }`,

                inline:
                    true
            });

    if (
        esStreamer
    ) {

        const canales =
            (
                drop.canales ||
                []
            ).map(
                canal => {

                    const indicador =
                        canal.online
                            ? "🟢"
                            : "⚫";

                    return (
                        `${indicador} [${canal.displayName || canal.login}](https://twitch.tv/${canal.login})`
                    );
                }
            );

        embed.addFields({
            name:
                "📺 Streamer asociado",

            value:
                canales.length
                    ? canales.join(
                        "\n"
                    )
                    : "No disponible",

            inline:
                false
        });
    } else {

        embed.addFields({
            name:
                "📺 Disponible en",

            value:
                "Todos los streams de Rust con Drops habilitados.",

            inline:
                false
        });
    }

    if (
        drop.imagen
    ) {
        embed.setThumbnail(
            drop.imagen
        );
    }

    return embed;
}


// ============================================================
// CREAR GRUPOS DE MENSAJES
// ============================================================

function crearGruposMensajesDrops(
    datos
) {

    const embeds =
        [];

    // Primero generales.
    for (
        const drop
        of datos.generalDrops ||
        []
    ) {
        embeds.push(
            crearEmbedDrop(
                drop
            )
        );
    }

    // Después streamer drops.
    for (
        const drop
        of datos.streamerDrops ||
        []
    ) {
        embeds.push(
            crearEmbedDrop(
                drop
            )
        );
    }

    const grupos =
        [];

    for (
        let i = 0;
        i < embeds.length;
        i += 10
    ) {

        grupos.push({
            content:
                i === 0
                    ? [
                        "🎁 **RUST TWITCH DROPS**",
                        "",
                        datos.campaignName
                            ? `📢 ${datos.campaignName}`
                            : null,
                        datos.campaignTheme
                            ? `🎨 ${datos.campaignTheme}`
                            : null,
                        ""
                    ]
                        .filter(Boolean)
                        .join(
                            "\n"
                        )
                    : "",

            embeds:
                embeds.slice(
                    i,
                    i + 10
                )
        });
    }

    return grupos;
}


// ============================================================
// CLAVE DE CAMPAÑA
// ============================================================

function crearCampaignKey(
    datos
) {

    const contenido =
        [
            ...(datos.generalDrops ||
                []),

            ...(datos.streamerDrops ||
                [])
        ].map(
            drop => ({
                tipo:
                    drop.tipo,

                nombre:
                    drop.nombre,

                horas:
                    drop.horas,

                canales:
                    (
                        drop.canales ||
                        []
                    )
                        .map(
                            canal =>
                                normalizarLogin(
                                    canal.login
                                )
                        )
                        .sort()
            })
        );

    return JSON.stringify({
        campaignName:
            datos.campaignName,

        campaignTheme:
            datos.campaignTheme,

        fechaInicio:
            datos.fechaInicio,

        fechaFin:
            datos.fechaFin,

        contenido
    });
}


// ============================================================
// CONVERTIR PARA MONGODB
// ============================================================

function convertirDatosAGuardado(
    datos
) {

    return [
        ...(datos.generalDrops ||
            []),

        ...(datos.streamerDrops ||
            [])
    ].map(
        drop => ({
            tipo:
                drop.tipo,

            nombre:
                drop.nombre,

            horas:
                drop.horas,

            imagen:
                drop.imagen ||
                null,

            canales:
                (
                    drop.canales ||
                    []
                ).map(
                    canal => ({
                        login:
                            canal.login,

                        displayName:
                            canal.displayName,

                        online:
                            !!canal.online
                    })
                )
        })
    );
}


// ============================================================
// ACTUALIZAR MENSAJES EXISTENTES
// ============================================================

async function editarMensajesMonitor(
    channel,
    monitor
) {

    const datos = {
        campaignName:
            monitor.campaignName,

        campaignTheme:
            monitor.campaignTheme,

        fechaInicio:
            monitor.fechaInicio,

        fechaFin:
            monitor.fechaFin,

        generalDrops:
            (
                monitor.drops ||
                []
            ).filter(
                drop =>
                    drop.tipo ===
                    "general"
            ),

        streamerDrops:
            (
                monitor.drops ||
                []
            ).filter(
                drop =>
                    drop.tipo ===
                    "streamer"
            )
    };

    const grupos =
        crearGruposMensajesDrops(
            datos
        );

    if (
        grupos.length !==
        monitor.messageIds.length
    ) {
        return false;
    }

    for (
        let i = 0;
        i < monitor.messageIds.length;
        i++
    ) {

        try {

            const mensaje =
                await channel.messages.fetch(
                    monitor.messageIds[i]
                );

            await mensaje.edit({
                content:
                    grupos[i].content ||
                    "",

                embeds:
                    grupos[i].embeds
            });

        } catch (error) {

            console.error(
                `❌ Error editando mensaje Drops ${monitor.messageIds[i]}:`,
                error.message
            );

            return false;
        }
    }

    return true;
}


// ============================================================
// AVISO STREAMER ONLINE EN RUST
// ============================================================

async function enviarAvisoStreamerOnlineRust(
    channel,
    streamers,
    datos
) {

    if (
        !channel ||
        !streamers.length
    ) {
        return false;
    }

    const bloques =
        [];

    for (
        const streamer
        of streamers
    ) {

        const drops =
            (
                datos.streamerDrops ||
                []
            ).filter(
                drop =>
                    (
                        drop.canales ||
                        []
                    ).some(
                        canal =>
                            normalizarLogin(
                                canal.login
                            ) ===
                            streamer.login
                    )
            );

        const nombres =
            drops.map(
                drop =>
                    `${drop.nombre} (${drop.horas}h)`
            );

        bloques.push(
            [
                `🟢 **[${streamer.displayName}](https://twitch.tv/${streamer.login})** está **ONLINE EN RUST**.`,

                nombres.length
                    ? `🎁 **Drop:** ${nombres.join(", ")}`
                    : "🎁 Tiene Drops de streamer disponibles."
            ].join(
                "\n"
            )
        );
    }

    try {

        await channel.send({
            content:
                "🎥 **Streamer de Rust con Drops ONLINE**\n\n" +
                bloques.join(
                    "\n\n"
                )
        });

        console.log(
            `📩 Aviso enviado: ${streamers.map(s => s.login).join(", ")}`
        );

        return true;

    } catch (error) {

        console.error(
            "❌ Error enviando aviso streamer:",
            error.message
        );

        return false;
    }
}


// ============================================================
// PUBLICAR / ACTUALIZAR MONITOR
// ============================================================

async function publicarDropsEnCanal(
    channel,
    datos,
    monitorExistente = null,
    creadoPor = null
) {

    const grupos =
        crearGruposMensajesDrops(
            datos
        );

    if (
        !grupos.length
    ) {
        throw new Error(
            "No hay Drops para publicar."
        );
    }

    const campaignKey =
        crearCampaignKey(
            datos
        );

    let monitor =
        monitorExistente;

    if (
        monitor &&
        monitor.campaignKey ===
            campaignKey &&
        monitor.messageIds?.length ===
            grupos.length
    ) {

        const actualizado =
            await editarMensajesMonitor(
                channel,
                monitor
            );

        if (
            actualizado
        ) {

            monitor.drops =
                convertirDatosAGuardado(
                    datos
                );

            monitor.campaignName =
                datos.campaignName;

            monitor.campaignTheme =
                datos.campaignTheme;

            monitor.fechaInicio =
                datos.fechaInicio;

            monitor.fechaFin =
                datos.fechaFin;

            await monitor.save();

            return monitor;
        }
    }

    // --------------------------------------------------------
    // CAMPAÑA NUEVA / RECONSTRUCCIÓN
    // --------------------------------------------------------

    if (
        monitor
    ) {

        for (
            const messageId
            of monitor.messageIds ||
            []
        ) {

            try {

                const mensaje =
                    await channel.messages.fetch(
                        messageId
                    );

                await mensaje.delete();

            } catch {
                // Ya no existe.
            }
        }
    }

    const messageIds =
        [];

    for (
        const grupo
        of grupos
    ) {

        const mensaje =
            await channel.send({
                content:
                    grupo.content ||
                    "",

                embeds:
                    grupo.embeds
            });

        messageIds.push(
            mensaje.id
        );
    }

    if (
        !monitor
    ) {

        monitor =
            new RustDropsMonitor();

        monitor.guildId =
            channel.guild.id;

        monitor.channelId =
            channel.id;
    }

    monitor.guildId =
        channel.guild.id;

    monitor.channelId =
        channel.id;

    monitor.messageIds =
        messageIds;

    monitor.campaignKey =
        campaignKey;

    monitor.campaignName =
        datos.campaignName;

    monitor.campaignTheme =
        datos.campaignTheme;

    monitor.fechaInicio =
        datos.fechaInicio;

    monitor.fechaFin =
        datos.fechaFin;

    monitor.drops =
        convertirDatosAGuardado(
            datos
        );

    monitor.active =
        true;

    if (
        creadoPor
    ) {
        monitor.creadoPor =
            creadoPor;
    }

    await monitor.save();

    return monitor;
}


// ============================================================
// PUBLICAR DESDE DISCORD
// ============================================================

async function publicarRustDrops(
    interaction
) {

    if (
        !interaction.guildId ||
        !interaction.channel
    ) {
        return {
            ok:
                false,

            motivo:
                "CANAL_INVALIDO"
        };
    }

    const datos =
        await obtenerDropsFacepunch();

    if (
        datos.error
    ) {
        return {
            ok:
                false,

            motivo:
                "FACEPUNCH_ERROR"
        };
    }

    const monitorExistente =
        await RustDropsMonitor.findOne({
            guildId:
                interaction.guildId,

            channelId:
                interaction.channel.id,

            active:
                true
        });

    const monitor =
        await publicarDropsEnCanal(
            interaction.channel,
            datos,
            monitorExistente,
            interaction.user.id
        );

    return {
        ok:
            true,

        monitor,

        cantidadDrops:
            monitor.drops.length,

        cantidadMensajes:
            monitor.messageIds.length
    };
}


// ============================================================
// REVISAR MONITORES
// ============================================================

async function revisarDropsAutomaticos(
    client
) {

    if (
        dropsRevisando
    ) {
        return;
    }

    dropsRevisando =
        true;

    try {

        const monitores =
            await RustDropsMonitor.find({
                active:
                    true
            });

        if (
            !monitores.length
        ) {
            return;
        }

        const datos =
            await obtenerDropsFacepunch();

        if (
            datos.error
        ) {
            return;
        }

        const campaignKey =
            crearCampaignKey(
                datos
            );

        // ----------------------------------------------------
        // ESTADOS ACTUALES DE TWITCH
        // ----------------------------------------------------

        const estados =
            new Map();

        for (
            const drop
            of datos.streamerDrops ||
            []
        ) {

            for (
                const canal
                of drop.canales ||
                []
            ) {

                const login =
                    normalizarLogin(
                        canal.login
                    );

                if (!login) {
                    continue;
                }

                estados.set(
                    login,
                    {
                        online:
                            !!canal.online,

                        displayName:
                            canal.displayName ||
                            login
                    }
                );
            }
        }

        // ----------------------------------------------------
        // CADA MONITOR
        // ----------------------------------------------------

        for (
            const monitor
            of monitores
        ) {

            try {

                const guild =
                    await client.guilds.fetch(
                        monitor.guildId
                    );

                if (
                    !guild
                ) {
                    continue;
                }

                const channel =
                    await guild.channels.fetch(
                        monitor.channelId
                    );

                if (
                    !channel ||
                    typeof channel.send !==
                        "function"
                ) {
                    continue;
                }

                // ------------------------------------------------
                // CAMPAÑA CAMBIÓ
                // ------------------------------------------------

                if (
                    monitor.campaignKey !==
                    campaignKey
                ) {

                    console.log(
                        `🆕 Nueva campaña Twitch Drops en ${guild.name}.`
                    );

                    await publicarDropsEnCanal(
                        channel,
                        datos,
                        monitor
                    );

                    continue;
                }

                // ------------------------------------------------
                // ACTUALIZAR ESTADOS
                // ------------------------------------------------

                const volvieron =
                    [];

                let cambioEmbed =
                    false;

                for (
                    const drop
                    of monitor.drops || []
                ) {

                    if (
                        drop.tipo !==
                        "streamer"
                    ) {
                        continue;
                    }

                    for (
                        const canal
                        of drop.canales ||
                        []
                    ) {

                        const login =
                            normalizarLogin(
                                canal.login
                            );

                        const actual =
                            estados.get(
                                login
                            );

                        const nuevoOnline =
                            !!actual?.online;

                        const anteriorOnline =
                            !!canal.online;

                        // ----------------------------------------
                        // OFFLINE -> ONLINE RUST
                        // ----------------------------------------

                        if (
                            !anteriorOnline &&
                            nuevoOnline
                        ) {

                            console.log(
                                `🟢 ${canal.displayName || login} volvió ONLINE EN RUST.`
                            );

                            volvieron.push({
                                login,

                                displayName:
                                    actual.displayName ||
                                    canal.displayName ||
                                    login
                            });

                            cambioEmbed =
                                true;
                        }

                        // ----------------------------------------
                        // ONLINE -> OFFLINE
                        // ----------------------------------------

                        if (
                            anteriorOnline &&
                            !nuevoOnline
                        ) {

                            console.log(
                                `⚫ ${canal.displayName || login} ya no está ONLINE EN RUST.`
                            );

                            cambioEmbed =
                                true;
                        }

                        // ----------------------------------------
                        // GUARDAR ESTADO
                        // ----------------------------------------

                        canal.online =
                            nuevoOnline;

                        if (
                            actual?.displayName
                        ) {
                            canal.displayName =
                                actual.displayName;
                        }
                    }
                }

                // ------------------------------------------------
                // ACTUALIZAR EMBED SOLO SI CAMBIÓ ESTADO
                // ------------------------------------------------

                if (
                    cambioEmbed
                ) {

                    await editarMensajesMonitor(
                        channel,
                        monitor
                    );
                }

                // ------------------------------------------------
                // AVISO SOLO AL VOLVER A RUST
                // ------------------------------------------------

                if (
                    volvieron.length
                ) {

                    // Evitar duplicados del mismo streamer
                    // si tiene varios Drops.

                    const unicos =
                        new Map();

                    for (
                        const streamer
                        of volvieron
                    ) {
                        if (
                            !unicos.has(
                                streamer.login
                            )
                        ) {
                            unicos.set(
                                streamer.login,
                                streamer
                            );
                        }
                    }

                    await enviarAvisoStreamerOnlineRust(
                        channel,
                        [
                            ...unicos.values()
                        ],
                        datos
                    );
                }

                await monitor.save();

            } catch (error) {

                console.error(
                    `❌ Error monitor ${monitor.guildId}/${monitor.channelId}:`,
                    error.message
                );
            }
        }

    } catch (error) {

        console.error(
            "❌ Error general Twitch Drops:",
            error
        );

    } finally {

        dropsRevisando =
            false;
    }
}


// ============================================================
// INICIAR AUTOMÁTICO
// ============================================================

function iniciarDropsAutomaticos(
    client
) {

    if (
        dropsAutomaticosIniciados
    ) {
        console.log(
            "⚠️ Twitch Drops ya estaba iniciado."
        );

        return;
    }

    if (!client) {
        console.error(
            "❌ Falta cliente Discord."
        );

        return;
    }

    dropsAutomaticosIniciados =
        true;

    console.log(
        "🎁 Twitch Drops iniciado. Revisión cada 60 segundos."
    );

    // Primera revisión.
    setTimeout(
        () => {

            revisarDropsAutomaticos(
                client
            ).catch(
                error =>
                    console.error(
                        "❌ Primera revisión Twitch Drops:",
                        error
                    )
            );

        },
        5000
    );

    setInterval(
        () => {

            revisarDropsAutomaticos(
                client
            ).catch(
                error =>
                    console.error(
                        "❌ Revisión Twitch Drops:",
                        error
                    )
            );

        },
        INTERVALO_DROPS
    );
}


// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    obtenerDropsFacepunch,

    obtenerStreamersOnlineRust,

    crearEmbedDrop,

    crearGruposMensajesDrops,

    publicarRustDrops,

    revisarDropsAutomaticos,

    iniciarDropsAutomaticos

};