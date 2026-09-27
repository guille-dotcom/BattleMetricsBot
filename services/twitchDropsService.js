// services/twitchDropsService.js

const axios = require("axios");

const {
    EmbedBuilder
} = require("discord.js");

const TwitchAccount =
    require("../models/TwitchAccount");

const RustDropsMonitor =
    require("../models/RustDropsMonitor");

// ============================================================
// CONFIGURACIÓN
// ============================================================

const TWITCH_CLIENT_ID =
    process.env.TWITCH_CLIENT_ID;

const TWITCH_CLIENT_SECRET =
    process.env.TWITCH_CLIENT_SECRET;

const FACEPUNCH_DROPS_URL =
    "https://twitch.facepunch.com/?handler=Twitch";

const INTERVALO_DROPS =
    60 * 1000;

let twitchAppToken = null;
let twitchAppTokenExpiresAt = 0;

let dropsRevisando = false;
let dropsAutomaticosIniciados = false;

// ============================================================
// CONFIGURACIÓN
// ============================================================

function validarConfiguracion() {

    if (!TWITCH_CLIENT_ID) {
        throw new Error(
            "Falta la variable TWITCH_CLIENT_ID."
        );
    }

}

// ============================================================
// HEADERS TWITCH
// ============================================================

function getHeaders(accessToken) {

    validarConfiguracion();

    if (!accessToken) {
        throw new Error(
            "No se recibió un access token de Twitch."
        );
    }

    return {
        "Client-ID":
            TWITCH_CLIENT_ID,

        "Authorization":
            `Bearer ${accessToken}`,

        "Content-Type":
            "application/json"
    };

}

// ============================================================
// VALIDAR TOKEN DEL USUARIO
// ============================================================

async function validarToken(accessToken) {

    try {

        const respuesta =
            await axios.get(
                "https://id.twitch.tv/oauth2/validate",
                {
                    headers: {
                        Authorization:
                            `OAuth ${accessToken}`
                    },

                    timeout: 10000
                }
            );

        const datos =
            respuesta.data || null;

        if (datos) {

            console.log(
                "🔎 DIAGNÓSTICO TOKEN TWITCH"
            );

            console.log(
                "🔎 Client ID configurado:",
                TWITCH_CLIENT_ID
            );

            console.log(
                "🔎 Client ID del token:",
                datos.client_id ||
                    "NO DEVUELTO"
            );

            console.log(
                "🔎 Usuario del token:",
                datos.login ||
                    "NO DEVUELTO"
            );

            console.log(
                "🔎 User ID del token:",
                datos.user_id ||
                    "NO DEVUELTO"
            );

            console.log(
                "🔎 Scopes del token:",
                Array.isArray(datos.scopes)
                    ? datos.scopes.join(", ") ||
                        "NINGUNO"
                    : "NO DEVUELTO"
            );

            console.log(
                "🔎 Expira en:",
                datos.expires_in ??
                    "NO DEVUELTO"
            );

            if (
                datos.client_id &&
                datos.client_id !==
                    TWITCH_CLIENT_ID
            ) {

                console.error(
                    "❌ ALERTA: El Client ID del token NO coincide con TWITCH_CLIENT_ID."
                );

            } else if (
                datos.client_id &&
                datos.client_id ===
                    TWITCH_CLIENT_ID
            ) {

                console.log(
                    "✅ El Client ID del token coincide con TWITCH_CLIENT_ID."
                );

            }

        }

        return datos;

    } catch (error) {

        console.error(
            "❌ Error validando token Twitch:",
            error.response?.status,
            error.response?.data ||
                error.message
        );

        return null;

    }

}

// ============================================================
// OBTENER JUEGO RUST
// ============================================================

async function obtenerJuegoRust(accessToken) {

    try {

        const respuesta =
            await axios.get(
                "https://api.twitch.tv/helix/games",
                {
                    params: {
                        name: "Rust"
                    },

                    headers:
                        getHeaders(
                            accessToken
                        ),

                    timeout: 15000
                }
            );

        const juegos =
            respuesta.data?.data ||
            [];

        if (!juegos.length) {

            console.log(
                "⚠️ Twitch no devolvió el juego Rust."
            );

            return null;

        }

        const rust =
            juegos.find(
                juego =>
                    String(
                        juego.name
                    ).toLowerCase() ===
                    "rust"
            );

        if (rust) {

            console.log(
                `🎮 Rust encontrado en Twitch: ${rust.name} (${rust.id})`
            );

        }

        return rust ||
            juegos[0];

    } catch (error) {

        console.error(
            "❌ Error obteniendo Rust desde Twitch:",
            error.response?.status,
            error.response?.data ||
                error.message
        );

        return null;

    }

}

// ============================================================
// ENTITLEMENTS TWITCH
// ============================================================

async function obtenerEntitlementsDrops(
    accessToken,
    gameId = null,
    fulfillmentStatus = null
) {

    const todos = [];

    let cursor = null;

    try {

        do {

            const params = {
                first: 1000
            };

            if (gameId) {
                params.game_id =
                    gameId;
            }

            if (fulfillmentStatus) {
                params.fulfillment_status =
                    fulfillmentStatus;
            }

            if (cursor) {
                params.after =
                    cursor;
            }

            console.log(
                "🎁 Consultando Twitch Entitlements...",
                {
                    game_id:
                        gameId ||
                        "todos",

                    fulfillment_status:
                        fulfillmentStatus ||
                        "todos",

                    tiene_cursor:
                        !!cursor
                }
            );

            const respuesta =
                await axios.get(
                    "https://api.twitch.tv/helix/entitlements/drops",
                    {
                        params,

                        headers:
                            getHeaders(
                                accessToken
                            ),

                        timeout: 15000
                    }
                );

            const datos =
                respuesta.data?.data ||
                [];

            todos.push(
                ...datos
            );

            cursor =
                respuesta.data?.pagination?.cursor ||
                null;

        } while (cursor);

        console.log(
            `✅ Twitch devolvió ${todos.length} entitlements.`
        );

        return todos;

    } catch (error) {

        console.error(
            "❌ Error obteniendo entitlements Twitch Drops:",
            error.response?.status,
            error.response?.data ||
                error.message
        );

        return [];

    }

}

// ============================================================
// TOKEN DE APLICACIÓN TWITCH
// ============================================================

async function obtenerTwitchAppToken() {

    if (
        twitchAppToken &&
        Date.now() <
            twitchAppTokenExpiresAt
    ) {

        return twitchAppToken;

    }

    if (
        !TWITCH_CLIENT_ID ||
        !TWITCH_CLIENT_SECRET
    ) {

        console.warn(
            "⚠️ No están configurados TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET."
        );

        return null;

    }

    try {

        const respuesta =
            await axios.post(
                "https://id.twitch.tv/oauth2/token",
                null,
                {
                    params: {
                        client_id:
                            TWITCH_CLIENT_ID,

                        client_secret:
                            TWITCH_CLIENT_SECRET,

                        grant_type:
                            "client_credentials"
                    },

                    timeout: 15000
                }
            );

        twitchAppToken =
            respuesta.data?.access_token ||
            null;

        const expiresIn =
            Number(
                respuesta.data?.expires_in ||
                    0
            );

        twitchAppTokenExpiresAt =
            Date.now() +
            Math.max(
                60,
                expiresIn - 300
            ) *
                1000;

        if (twitchAppToken) {

            console.log(
                "✅ Token de aplicación Twitch obtenido."
            );

        }

        return twitchAppToken;

    } catch (error) {

        console.error(
            "❌ Error obteniendo token de aplicación Twitch:",
            error.response?.status,
            error.response?.data ||
                error.message
        );

        twitchAppToken = null;
        twitchAppTokenExpiresAt = 0;

        return null;

    }

}

// ============================================================
// COMPROBAR STREAMERS ONLINE
// ============================================================

async function obtenerStreamersOnline(
    logins = []
) {

    const nombres = [
        ...new Set(
            logins
                .map(
                    nombre =>
                        String(
                            nombre ||
                                ""
                        )
                            .trim()
                            .toLowerCase()
                )
                .filter(Boolean)
        )
    ];

    if (!nombres.length) {
        return new Set();
    }

    const appToken =
        await obtenerTwitchAppToken();

    if (!appToken) {

        console.warn(
            "⚠️ No se pudo obtener token de aplicación. Los streamers aparecerán offline."
        );

        return new Set();

    }

    const online =
        new Set();

    try {

        for (
            let i = 0;
            i < nombres.length;
            i += 100
        ) {

            const lote =
                nombres.slice(
                    i,
                    i + 100
                );

            const params =
                new URLSearchParams();

            for (
                const login
                of lote
            ) {

                params.append(
                    "user_login",
                    login
                );

            }

            const respuesta =
                await axios.get(
                    "https://api.twitch.tv/helix/streams",
                    {
                        params,

                        headers: {
                            "Client-ID":
                                TWITCH_CLIENT_ID,

                            Authorization:
                                `Bearer ${appToken}`
                        },

                        timeout: 15000
                    }
                );

            const streams =
                respuesta.data?.data ||
                [];

            for (
                const stream
                of streams
            ) {

                if (
                    stream.user_login
                ) {

                    online.add(
                        String(
                            stream.user_login
                        ).toLowerCase()
                    );

                }

            }

        }

        console.log(
            `🟢 Twitch: ${online.size} streamer(s) online de ${nombres.length} participantes.`
        );

        return online;

    } catch (error) {

        console.error(
            "❌ Error comprobando streamers online:",
            error.response?.status,
            error.response?.data ||
                error.message
        );

        return new Set();

    }

}

// ============================================================
// DECODIFICAR HTML
// ============================================================

function decodificarHtml(
    texto = ""
) {

    return String(texto)
        .replace(
            /&amp;/gi,
            "&"
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
            /&apos;/gi,
            "'"
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
            /&#x27;/gi,
            "'"
        )
        .replace(
            /&#x2F;/gi,
            "/"
        )
        .replace(
            /&#160;/gi,
            " "
        )
        .trim();

}

// ============================================================
// LIMPIAR HTML
// ============================================================

function limpiarHtml(
    texto = ""
) {

    return decodificarHtml(
        String(texto)
            .replace(
                /<br\s*\/?>/gi,
                "\n"
            )
            .replace(
                /<script[\s\S]*?<\/script>/gi,
                " "
            )
            .replace(
                /<style[\s\S]*?<\/style>/gi,
                " "
            )
            .replace(
                /<[^>]+>/g,
                " "
            )
            .replace(
                /\s+/g,
                " "
            )
            .trim()
    );

}

// ============================================================
// LIMPIAR NOMBRE STREAMER
// ============================================================

function limpiarNombreStreamer(
    nombre = ""
) {

    let resultado =
        decodificarHtml(
            String(nombre)
        );

    resultado =
        resultado.replace(
            /^.*?tag["']?\s*>\s*/i,
            ""
        );

    resultado =
        resultado.replace(
            /^.*?["']?\s*>\s*/i,
            ""
        );

    resultado =
        resultado.replace(
            /["'].*$/g,
            ""
        );

    return resultado
        .replace(
            /[\r\n\t]+/g,
            " "
        )
        .replace(
            /\s+/g,
            " "
        )
        .trim();

}

// ============================================================
// NORMALIZAR LOGIN
// ============================================================

function normalizarLogin(
    nombre = ""
) {

    return String(nombre)
        .trim()
        .replace(
            /^@/,
            ""
        )
        .toLowerCase();

}

// ============================================================
// ESCAPAR REGEX
// ============================================================

function escapeRegExp(
    texto
) {

    return String(texto).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );

}

// ============================================================
// LIMPIAR URL IMAGEN
// ============================================================

function limpiarUrlImagen(
    url = ""
) {

    let resultado =
        decodificarHtml(
            String(url)
        ).trim();

    if (!resultado) {
        return null;
    }

    resultado =
        resultado
            .replace(
                /^url\(\s*/i,
                ""
            )
            .replace(
                /\s*\)$/i,
                ""
            )
            .replace(
                /^["']|["']$/g,
                ""
            )
            .trim();

    if (
        resultado.startsWith("//")
    ) {

        resultado =
            `https:${resultado}`;

    }

    if (
        resultado.startsWith("/")
    ) {

        resultado =
            `https://twitch.facepunch.com${resultado}`;

    }

    if (
        !/^https?:\/\//i.test(
            resultado
        )
    ) {

        return null;

    }

    return resultado;

}

// ============================================================
// VALIDAR IMAGEN
// ============================================================

function esImagenValida(
    url = ""
) {

    const valor =
        String(url)
            .toLowerCase();

    if (!valor) {
        return false;
    }

    /*
     * Estas rutas/nombres corresponden normalmente a
     * imágenes de usuario, canales o elementos de Twitch.
     * Nunca deben utilizarse como imagen de un Drop.
     */
    const bloqueadas = [

        "logo",

        "favicon",

        "avatar",

        "profile_image",

        "profileimage",

        "channel_image",

        "channelimage",

        "user_image",

        "userimage",

        "banner",

        "offline",

        "twitch.tv",

        "static-cdn.jtvnw.net",

        "twitch-facepunch"

    ];

    if (
        bloqueadas.some(
            termino =>
                valor.includes(
                    termino
                )
        )
    ) {

        return false;

    }

    return (
        /\.(png|jpg|jpeg|webp|gif)(\?|$)/i.test(
            valor
        ) ||
        valor.includes(
            "/image/"
        ) ||
        valor.includes(
            "steamstatic"
        ) ||
        valor.includes(
            "fastly"
        ) ||
        valor.includes(
            "cloudflare"
        )
    );

}

// ============================================================
// EXTRAER IMAGEN CERCANA
//
// CAMBIO IMPORTANTE:
//
// Facepunch coloca dentro de la misma zona:
//
//   STREAMER
//   STREAMER
//   DROP
//   HORAS
//
// Por eso buscar simplemente "la imagen más cercana"
// puede devolver el avatar del streamer.
//
// Ahora:
//
//   - Se detectan todas las imágenes.
//   - Se eliminan explícitamente imágenes de Twitch/usuarios.
//   - Se prioriza /economy/image/.
//   - Para Streamer Drops se exige una imagen que parezca
//     realmente una imagen de item.
//   - Si no existe, devuelve null en vez de utilizar
//     el avatar del streamer.
// ============================================================

function extraerImagenCercana(
    bloque,
    index,
    nombreDrop,
    soloImagenDeItem = false
) {

    if (
        !bloque ||
        typeof bloque !== "string" ||
        typeof index !== "number"
    ) {

        return null;

    }

    const inicio =
        Math.max(
            0,
            index - 2500
        );

    const fin =
        Math.min(
            bloque.length,
            index + 3500
        );

    const zona =
        bloque.slice(
            inicio,
            fin
        );

    const candidatas = [];

    function agregarCandidata(
        rawUrl,
        posicion,
        tipo = "unknown"
    ) {

        const url =
            limpiarUrlImagen(
                rawUrl
            );

        if (
            !url ||
            !esImagenValida(url)
        ) {

            return;

        }

        const lower =
            url.toLowerCase();

        /*
         * ========================================================
         * DESCARTAR IMÁGENES DE STREAMERS
         * ========================================================
         */

        const esStreamer =
            lower.includes(
                "twitch.tv"
            ) ||
            lower.includes(
                "static-cdn.jtvnw.net"
            ) ||
            lower.includes(
                "profile_image"
            ) ||
            lower.includes(
                "profileimage"
            ) ||
            lower.includes(
                "avatar"
            ) ||
            lower.includes(
                "channel_image"
            ) ||
            lower.includes(
                "channelimage"
            ) ||
            lower.includes(
                "user_image"
            ) ||
            lower.includes(
                "userimage"
            ) ||
            lower.includes(
                "logo"
            ) ||
            lower.includes(
                "banner"
            ) ||
            lower.includes(
                "offline"
            );

        if (esStreamer) {
            return;
        }

        /*
         * ========================================================
         * IDENTIFICAR IMAGEN DE ITEM
         * ========================================================
         */

        const esEconomy =
            lower.includes(
                "/economy/image/"
            ) ||
            lower.includes(
                "economy/image"
            );

        const esSteam =
            lower.includes(
                "steamstatic"
            ) ||
            lower.includes(
                "community.fastly"
            ) ||
            lower.includes(
                "community.cloudflare"
            ) ||
            lower.includes(
                "steamusercontent"
            );

        const esFacepunch =
            lower.includes(
                "files.facepunch.com"
            );

        const distancia =
            Math.abs(
                (
                    inicio +
                    posicion
                ) -
                index
            );

        candidatas.push({

            url,

            distancia,

            esEconomy,

            esSteam,

            esFacepunch,

            tipo

        });

    }

    // ========================================================
    // IMG SRC
    // ========================================================

    const regexImg =
        /<img\b[^>]*?(?:src|data-src|data-original|data-image|data-lazy-src)\s*=\s*["']([^"']+)["'][^>]*>/gi;

    let match;

    while (
        (
            match =
                regexImg.exec(
                    zona
                )
        ) !== null
    ) {

        agregarCandidata(
            match[1],
            match.index,
            "img"
        );

    }

    // ========================================================
    // SRCSET
    // ========================================================

    const regexSrcset =
        /\b(?:srcset|data-srcset)\s*=\s*["']([^"']+)["']/gi;

    while (
        (
            match =
                regexSrcset.exec(
                    zona
                )
        ) !== null
    ) {

        const valores =
            match[1]
                .split(",")
                .map(
                    valor =>
                        valor.trim()
                )
                .filter(Boolean);

        for (
            const valor
            of valores
        ) {

            const partes =
                valor.split(
                    /\s+/
                );

            agregarCandidata(
                partes[0],
                match.index,
                "srcset"
            );

        }

    }

    // ========================================================
    // BACKGROUND IMAGE
    // ========================================================

    const regexBackground =
        /background-image\s*:\s*url\(\s*["']?([^"')]+)["']?\s*\)/gi;

    while (
        (
            match =
                regexBackground.exec(
                    zona
                )
        ) !== null
    ) {

        agregarCandidata(
            match[1],
            match.index,
            "background"
        );

    }

    // ========================================================
    // URLs DIRECTAS
    // ========================================================

    const regexUrl =
        /https?:\/\/[^"'()<>\s]+/gi;

    while (
        (
            match =
                regexUrl.exec(
                    zona
                )
        ) !== null
    ) {

        agregarCandidata(
            match[0],
            match.index,
            "url"
        );

    }

    if (
        !candidatas.length
    ) {

        console.log(
            `⚠️ No se encontró imagen válida para ${nombreDrop}.`
        );

        return null;

    }

    // ========================================================
    // ELIMINAR DUPLICADOS
    // ========================================================

    const unicas =
        new Map();

    for (
        const candidata
        of candidatas
    ) {

        const existente =
            unicas.get(
                candidata.url
            );

        if (
            !existente ||
            candidata.distancia <
                existente.distancia
        ) {

            unicas.set(
                candidata.url,
                candidata
            );

        }

    }

    const lista =
        [
            ...unicas.values()
        ];

    // ========================================================
    // STREAMER DROPS
    //
    // AQUÍ SOMOS ESTRICTOS.
    //
    // Primero /economy/image/
    // Luego Steam/Facepunch.
    // Si no hay ninguna -> null.
    // ========================================================

    if (
        soloImagenDeItem
    ) {

        const imagenesDeItem =
            lista.filter(
                candidata =>
                    candidata.esEconomy ||
                    candidata.esSteam ||
                    candidata.esFacepunch
            );

        if (
            !imagenesDeItem.length
        ) {

            console.log(
                `⚠️ No se encontró imagen de ITEM para Streamer Drop "${nombreDrop}". No se utilizará el avatar del streamer.`
            );

            return null;

        }

        imagenesDeItem.sort(
            (a, b) => {

                // 1. Economy image
                if (
                    a.esEconomy !==
                    b.esEconomy
                ) {

                    return a.esEconomy
                        ? -1
                        : 1;

                }

                // 2. Steam
                if (
                    a.esSteam !==
                    b.esSteam
                ) {

                    return a.esSteam
                        ? -1
                        : 1;

                }

                // 3. Facepunch
                if (
                    a.esFacepunch !==
                    b.esFacepunch
                ) {

                    return a.esFacepunch
                        ? -1
                        : 1;

                }

                // 4. Cercanía al nombre del Drop
                return (
                    a.distancia -
                    b.distancia
                );

            }
        );

        const preferida =
            imagenesDeItem[0]?.url ||
            null;

        if (
            preferida
        ) {

            console.log(
                `🖼️ Imagen de ITEM encontrada para ${nombreDrop}: ${preferida}`
            );

        }

        return preferida;

    }

    // ========================================================
    // GENERAL DROPS
    //
    // Mantenemos el comportamiento flexible, pero siempre
    // damos prioridad a imágenes reales de items.
    // ========================================================

    lista.sort(
        (a, b) => {

            if (
                a.esEconomy !==
                b.esEconomy
            ) {

                return a.esEconomy
                    ? -1
                    : 1;

            }

            if (
                a.esSteam !==
                b.esSteam
            ) {

                return a.esSteam
                    ? -1
                    : 1;

            }

            if (
                a.esFacepunch !==
                b.esFacepunch
            ) {

                return a.esFacepunch
                    ? -1
                    : 1;

            }

            return (
                a.distancia -
                b.distancia
            );

        }
    );

    const preferida =
        lista[0]?.url ||
        null;

    if (
        preferida
    ) {

        console.log(
            `🖼️ Imagen encontrada para ${nombreDrop}: ${preferida}`
        );

    }

    return preferida;

}

// ============================================================
// EXTRAER STREAMER DROPS
// ============================================================

function extraerStreamerDrops(
    html
) {

    const resultados = [];

    const inicioMatch =
        html.match(
            /Streamer Drops/i
        );

    if (!inicioMatch) {
        return [];
    }

    const inicio =
        inicioMatch.index;

    const finMatch =
        html.match(
            /Drops Metrics/i
        );

    const fin =
        finMatch
            ? finMatch.index
            : html.length;

    const bloque =
        html.slice(
            inicio,
            fin
        );

    const elementos = [];

    // ========================================================
    // STREAMERS
    // ========================================================

    const regexTwitch =
        /<a\b[^>]*href=["']https?:\/\/(?:www\.)?twitch\.tv\/([^"'?#/]+)[^>]*>([\s\S]*?)<\/a>/gi;

    let match;

    while (
        (
            match =
                regexTwitch.exec(
                    bloque
                )
        ) !== null
    ) {

        const login =
            normalizarLogin(
                match[1]
            );

        if (!login) {
            continue;
        }

        let displayName =
            limpiarHtml(
                match[2]
            );

        displayName =
            limpiarNombreStreamer(
                displayName
            );

        const nombresConocidos = {

            geega:
                "GEEGA",

            ledoo:
                "LEDOO",

            blooprint:
                "Blooprint",

            hjune:
                "hJune",

            hutnik:
                "Hutnik",

            disguisedtoast:
                "DisguisedToast",

            peterpark:
                "peterpark",

            fuslie:
                "fuslie",

            sven:
                "Sven",

            abe:
                "Abe",

            esfandtv:
                "EsfandTV",

            xchocobars:
                "xChocoBars",

            ironmouse:
                "ironmouse",

            willneff:
                "willneff",

            foolish:
                "Foolish",

            tinakitten:
                "TinaKitten",

            cyr:
                "CYR",

            mrwobblestwitch:
                "mrwobblestwitch",

            aceu:
                "aceu",

            zchum:
                "ZChum",

            fancyorb:
                "FancyOrb",

            itsryanhiga:
                "itsRyanHiga",

            welyn:
                "Welyn"

        };

        if (
            nombresConocidos[login]
        ) {

            displayName =
                nombresConocidos[
                    login
                ];

        }

        elementos.push({

            tipo:
                "streamer",

            login,

            displayName,

            index:
                match.index

        });

    }

    // ========================================================
    // RECOMPENSAS
    // ========================================================

    const nombresRecompensas = [

        "Rocket Launcher",

        "Assault Rifle",

        "Semi-automatic Rifle",

        "Double Barrel Shotgun",

        "Boonie Hat",

        "Small Backpack",

        "Furnace",

        "Wooden Door",

        "Large Wood Box",

        "Salvaged Sword",

        "Garage Door",

        "Locker",

        "Metal Facemask",

        "Metal Chestplate",

        "Vagabond Jacket",

        "Tactical Gloves"

    ];

    for (
        const nombre
        of nombresRecompensas
    ) {

        const regex =
            new RegExp(
                escapeRegExp(
                    nombre
                ),
                "i"
            );

        const resultado =
            regex.exec(
                bloque
            );

        if (!resultado) {
            continue;
        }

        /*
         * IMPORTANTE:
         *
         * Streamer Drop = true
         *
         * Esto evita que el extractor utilice el avatar
         * del streamer como imagen del reward.
         */

        const imagen =
            extraerImagenCercana(
                bloque,
                resultado.index,
                nombre,
                true
            );

        elementos.push({

            tipo:
                "drop",

            nombre,

            index:
                resultado.index,

            imagen

        });

    }

    elementos.sort(
        (a, b) =>
            a.index - b.index
    );

    let streamersPendientes = [];

    for (
        const elemento
        of elementos
    ) {

        if (
            elemento.tipo ===
            "streamer"
        ) {

            if (
                !streamersPendientes.some(
                    streamer =>
                        streamer.login ===
                        elemento.login
                )
            ) {

                streamersPendientes.push(
                    elemento
                );

            }

            continue;

        }

        if (
            elemento.tipo !==
            "drop"
        ) {
            continue;
        }

        const canales =
            streamersPendientes
                .slice(-2)
                .map(
                    streamer => ({

                        login:
                            streamer.login,

                        displayName:
                            streamer.displayName,

                        online:
                            false

                    })
                );

        const textoPosterior =
            limpiarHtml(
                bloque.slice(
                    elemento.index,
                    Math.min(
                        bloque.length,
                        elemento.index +
                            300
                    )
                )
            );

        const horasMatch =
            textoPosterior.match(
                /\b(\d+)\s+Hours?\b/i
            );

        const horas =
            horasMatch
                ? Number(
                    horasMatch[1]
                )
                : 1;

        if (
            canales.length
        ) {

            resultados.push({

                nombre:
                    elemento.nombre,

                horas,

                canales,

                imagen:
                    elemento.imagen ||
                    null

            });

        }

        streamersPendientes = [];

    }

    return resultados;

}

// ============================================================
// EXTRAER GENERAL DROPS
// ============================================================

function extraerGeneralDrops(
    html,
    textoPagina
) {

    const generalDrops = [];

    const generalNombres = [

        "Large Wood Box",

        "Auto Turret",

        "Small Box",

        "Pants",

        "Work Boots",

        "Hoodie"

    ];

    for (
        const nombre
        of generalNombres
    ) {

        const regex =
            new RegExp(
                `${escapeRegExp(nombre)}\\s+(\\d+)\\s+Hours?`,
                "i"
            );

        const match =
            regex.exec(
                textoPagina
            );

        if (!match) {
            continue;
        }

        const htmlRegex =
            new RegExp(
                escapeRegExp(nombre),
                "i"
            );

        const htmlMatch =
            htmlRegex.exec(
                html
            );

        let imagen = null;

        if (htmlMatch) {

            imagen =
                extraerImagenCercana(
                    html,
                    htmlMatch.index,
                    nombre,
                    false
                );

        }

        generalDrops.push({

            nombre,

            horas:
                Number(
                    match[1]
                ),

            imagen

        });

    }

    return generalDrops;

}

// ============================================================
// OBTENER DROPS FACEPUNCH
// ============================================================

async function obtenerDropsFacepunch() {

    try {

        console.log(
            "🌐 Consultando Drops actuales de Facepunch..."
        );

        const respuesta =
            await axios.get(
                FACEPUNCH_DROPS_URL,
                {
                    timeout: 20000,

                    headers: {
                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36",

                        Accept:
                            "text/html,application/xhtml+xml"
                    }
                }
            );

        const html =
            String(
                respuesta.data ||
                    ""
            );

        if (!html) {

            throw new Error(
                "Facepunch devolvió una respuesta vacía."
            );

        }

        const textoPagina =
            limpiarHtml(
                html
            );

        // ========================================================
        // CAMPAÑA
        // ========================================================

        let campaignName =
            "Twitch Drops";

        const campaignMatch =
            textoPagina.match(
                /(Twitch Drops Round \d+ Hosted by [^]+?)(?=\s+Rust Isles|\s+General Drops)/i
            );

        if (campaignMatch) {

            campaignName =
                campaignMatch[1].trim();

        }

        // ========================================================
        // TEMA
        // ========================================================

        let campaignTheme =
            null;

        const themeMatch =
            textoPagina.match(
                /\b(Rust Isles)\b/i
            );

        if (themeMatch) {

            campaignTheme =
                themeMatch[1];

        }

        // ========================================================
        // FECHAS
        // ========================================================

        let fechaInicio = null;
        let fechaFin = null;

        const fechaMatch =
            textoPagina.match(
                /([A-Z][a-z]+\s+\d{1,2},\s+\d{4}\s+at\s+\d{1,2}:\d{2}\s+[AP]M\s+UTC)\s*-\s*([A-Z][a-z]+\s+\d{1,2},\s+\d{4}\s+at\s+\d{1,2}:\d{2}\s+[AP]M\s+UTC)/i
            );

        if (fechaMatch) {

            fechaInicio =
                fechaMatch[1];

            fechaFin =
                fechaMatch[2];

        }

        // ========================================================
        // GENERAL
        // ========================================================

        const generalDrops =
            extraerGeneralDrops(
                html,
                textoPagina
            );

        // ========================================================
        // STREAMER
        // ========================================================

        const streamerDrops =
            extraerStreamerDrops(
                html
            );

        // ========================================================
        // ESTADOS
        // ========================================================

        const logins = [];

        for (
            const drop
            of streamerDrops
        ) {

            for (
                const canal
                of drop.canales
            ) {

                logins.push(
                    canal.login
                );

            }

        }

        const online =
            await obtenerStreamersOnline(
                logins
            );

        for (
            const drop
            of streamerDrops
        ) {

            for (
                const canal
                of drop.canales
            ) {

                canal.online =
                    online.has(
                        canal.login
                    );

            }

            drop.online =
                drop.canales.some(
                    canal =>
                        canal.online
                );

        }

        console.log(
            `🎁 Facepunch: ${generalDrops.length} drops generales, ${streamerDrops.length} streamer drops.`
        );

        console.log(
            `🟢 Streamer Drops con al menos un canal online: ${
                streamerDrops.filter(
                    drop =>
                        drop.online
                ).length
            }`
        );

        const dropsConImagen =
            [
                ...generalDrops,
                ...streamerDrops
            ].filter(
                drop =>
                    !!drop.imagen
            ).length;

        console.log(
            `🖼️ Drops con imagen detectada: ${dropsConImagen}/${generalDrops.length + streamerDrops.length}`
        );

        return {

            campaignName,

            campaignTheme,

            fechaInicio,

            fechaFin,

            generalDrops,

            streamerDrops,

            onlineCount:
                online.size,

            totalStreamers:
                new Set(
                    logins
                ).size,

            actualizado:
                new Date()

        };

    } catch (error) {

        console.error(
            "❌ Error obteniendo Drops desde Facepunch:",
            error.response?.status,
            error.response?.data ||
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
                true

        };

    }

}

// ============================================================
// FORMATEAR HORAS
// ============================================================

function formatearHoras(
    horas
) {

    const numero =
        Number(horas);

    if (
        !Number.isFinite(
            numero
        )
    ) {

        return "?";

    }

    if (
        numero === 1
    ) {

        return "1 hora";

    }

    return `${numero} horas`;

}

// ============================================================
// FORMATEAR CANALES
// ============================================================

function formatearCanales(
    canales = []
) {

    return canales
        .map(
            canal => {

                const estado =
                    canal.online
                        ? "🟢"
                        : "⚫";

                return (
                    `${estado} [${canal.displayName}](https://www.twitch.tv/${canal.login})`
                );

            }
        )
        .join(
            " • "
        );

}

// ============================================================
// EMBED INDIVIDUAL
// ============================================================

function crearEmbedIndividual(
    drop,
    datos
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
            .setDescription(
                `⏱️ **${formatearHoras(drop.horas)}**`
            );

    if (
        esStreamer &&
        Array.isArray(
            drop.canales
        ) &&
        drop.canales.length
    ) {

        embed.addFields({
            name:
                "🎥 Streamer(s)",

            value:
                formatearCanales(
                    drop.canales
                ),

            inline:
                false
        });

    }

    if (
        drop.imagen
    ) {

        embed.setImage(
            drop.imagen
        );

    }

    embed.setFooter({
        text:
            datos.campaignName
                ? `RustLogix • ${datos.campaignName}`
                : "RustLogix • Rust Twitch Drops"
    });

    embed.setTimestamp(
        datos.actualizado ||
            new Date()
    );

    return embed;

}

// ============================================================
// CREAR EMBEDS DE TODOS LOS DROPS
// ============================================================

function crearEmbedsDrops(
    datos
) {

    const drops = [];

    for (
        const drop
        of datos.generalDrops ||
        []
    ) {

        drops.push({

            tipo:
                "general",

            nombre:
                drop.nombre,

            horas:
                drop.horas,

            imagen:
                drop.imagen ||
                null,

            canales:
                []

        });

    }

    for (
        const drop
        of datos.streamerDrops ||
        []
    ) {

        drops.push({

            tipo:
                "streamer",

            nombre:
                drop.nombre,

            horas:
                drop.horas,

            imagen:
                drop.imagen ||
                null,

            canales:
                (drop.canales ||
                    []).map(
                    canal => ({

                        login:
                            canal.login,

                        displayName:
                            canal.displayName,

                        online:
                            !!canal.online

                    })
                )

        });

    }

    return drops.map(
        drop =>
            crearEmbedIndividual(
                drop,
                datos
            )
    );

}

// ============================================================
// CREAR EMBED ANTIGUO / COMPATIBILIDAD
// ============================================================

function crearEmbedFacepunchDrops(
    datos
) {

    const embed =
        new EmbedBuilder()
            .setColor(
                0x9146ff
            )
            .setTitle(
                "🎁 Rust Twitch Drops"
            );

    let descripcion =
        `**${datos.campaignName}**`;

    if (
        datos.campaignTheme
    ) {

        descripcion +=
            `\n🏝️ **${datos.campaignTheme}**`;

    }

    if (
        datos.fechaInicio &&
        datos.fechaFin
    ) {

        descripcion +=
            `\n⏰ ${datos.fechaInicio} → ${datos.fechaFin}`;

    } else if (
        datos.fechaFin
    ) {

        descripcion +=
            `\n⏰ Termina: **${datos.fechaFin}**`;

    }

    embed.setDescription(
        descripcion
    );

    const general =
        (datos.generalDrops || [])
            .map(
                drop =>
                    `📦 **${drop.nombre}** — ${formatearHoras(drop.horas)}`
            )
            .join("\n");

    if (general) {

        embed.addFields({

            name:
                `📦 Drops Generales (${datos.generalDrops.length})`,

            value:
                general.slice(
                    0,
                    1024
                ),

            inline:
                false

        });

    }

    const streamer =
        (datos.streamerDrops || [])
            .map(
                drop =>
                    `🎯 **${drop.nombre}** — ${formatearHoras(drop.horas)}\n${formatearCanales(drop.canales)}`
            )
            .join("\n\n");

    if (streamer) {

        embed.addFields({

            name:
                `🎯 Streamer Drops (${datos.streamerDrops.length})`,

            value:
                streamer.slice(
                    0,
                    1024
                ),

            inline:
                false

        });

    }

    embed.addFields({

        name:
            "📡 Estado de los canales",

        value:
            `🟢 ${datos.onlineCount} streamer(s) online de ${datos.totalStreamers}.`,

        inline:
            false

    });

    embed.addFields({

        name:
            "ℹ️ Cómo conseguirlos",

        value:
            "Los Drops generales cuentan viendo streams de Rust con Drops Enabled. Los Streamer Drops requieren ver el streamer indicado.",

        inline:
            false

    });

    embed.addFields({

        name:
            "⚠️ Importante",

        value:
            "Twitch solo cuenta un canal activo a la vez. Ver varios canales simultáneamente no acelera el progreso.",

        inline:
            false

    });

    embed.addFields({

        name:
            "⏱️ Progreso",

        value:
            "El progreso individual no se puede consultar desde la API utilizada por RustLogix. Puedes verlo directamente en tu Twitch Drops Inventory.",

        inline:
            false

    });

    embed.setFooter({

        text:
            "RustLogix • Facepunch + Twitch"

    });

    embed.setTimestamp(
        datos.actualizado
    );

    return embed;

}

// ============================================================
// OBTENER RUST DROPS
// ============================================================

async function obtenerRustDrops(
    discordUserId
) {

    if (!discordUserId) {

        throw new Error(
            "Falta el Discord User ID."
        );

    }

    const cuenta =
        await TwitchAccount.findOne({
            discordUserId
        });

    if (!cuenta) {

        return {

            vinculada:
                false,

            tokenValido:
                false,

            cuenta:
                null,

            juego:
                null,

            drops:
                [],

            claimed:
                [],

            fulfilled:
                [],

            facepunch:
                null

        };

    }

    const tokenInfo =
        await validarToken(
            cuenta.accessToken
        );

    if (!tokenInfo) {

        return {

            vinculada:
                true,

            tokenValido:
                false,

            cuenta:
                cuenta.twitchDisplayName ||
                cuenta.twitchLogin,

            drops:
                [],

            claimed:
                [],

            fulfilled:
                [],

            facepunch:
                null

        };

    }

    const facepunch =
        await obtenerDropsFacepunch();

    return {

        vinculada:
            true,

        tokenValido:
            true,

        cuenta:
            cuenta.twitchDisplayName ||
            cuenta.twitchLogin,

        twitchLogin:
            cuenta.twitchLogin,

        twitchUserId:
            cuenta.twitchUserId,

        juego: {

            id:
                "263490",

            name:
                "Rust"

        },

        drops:
            [],

        claimed:
            [],

        fulfilled:
            [],

        total:
            0,

        facepunch

    };

}

// ============================================================
// EMBED PRINCIPAL ANTIGUO
// ============================================================

function crearEmbedRustDrops(
    resultado
) {

    if (
        !resultado.vinculada
    ) {

        return new EmbedBuilder()
            .setColor(
                0xed4245
            )
            .setTitle(
                "🎁 Rust Drops"
            )
            .setDescription(
                "No tienes una cuenta de Twitch vinculada.\n\nUsa **/drops vincular** para conectar tu cuenta."
            )
            .setFooter({

                text:
                    "RustLogix • Twitch Drops"

            });

    }

    if (
        !resultado.tokenValido
    ) {

        return new EmbedBuilder()
            .setColor(
                0xfee75c
            )
            .setTitle(
                "🎁 Rust Drops"
            )
            .setDescription(
                `Cuenta vinculada: **${resultado.cuenta}**\n\n⚠️ La sesión de Twitch no pudo validarse.\n\nPrueba nuevamente con **/drops estado** o vuelve a vincular la cuenta.`
            )
            .setFooter({

                text:
                    "RustLogix • Twitch Drops"

            })
            .setTimestamp();

    }

    if (
        !resultado.facepunch ||
        resultado.facepunch.error
    ) {

        return new EmbedBuilder()
            .setColor(
                0xed4245
            )
            .setTitle(
                "🎁 Rust Drops"
            )
            .setDescription(
                `Cuenta Twitch: **${resultado.cuenta}**\n\n❌ No se pudieron obtener los Drops actuales desde Facepunch.\n\nInténtalo nuevamente en unos segundos.`
            )
            .setFooter({

                text:
                    "RustLogix • Twitch Drops"

            })
            .setTimestamp();

    }

    return crearEmbedFacepunchDrops(
        resultado.facepunch
    );

}

// ============================================================
// FUNCIÓN ANTERIOR
// ============================================================

async function obtenerRustDropsEmbed(
    discordUserId
) {

    const resultado =
        await obtenerRustDrops(
            discordUserId
        );

    return crearEmbedRustDrops(
        resultado
    );

}

// ============================================================
// SEPARAR ENTITLEMENTS
// ============================================================

function separarEntitlements(
    entitlements = []
) {

    const claimed = [];
    const fulfilled = [];

    for (
        const entitlement
        of entitlements
    ) {

        if (
            entitlement.fulfillment_status ===
            "CLAIMED"
        ) {

            claimed.push(
                entitlement
            );

        }

        if (
            entitlement.fulfillment_status ===
            "FULFILLED"
        ) {

            fulfilled.push(
                entitlement
            );

        }

    }

    return {

        claimed,

        fulfilled

    };

}

// ============================================================
// ORDENAR ENTITLEMENTS
// ============================================================

function ordenarPorFecha(
    entitlements = []
) {

    return [
        ...entitlements
    ].sort(
        (a, b) => {

            const fechaA =
                new Date(
                    a.timestamp ||
                        0
                ).getTime();

            const fechaB =
                new Date(
                    b.timestamp ||
                        0
                ).getTime();

            return (
                fechaB -
                fechaA
            );

        }
    );

}

// ============================================================
// OBTENER ENTITLEMENTS RUST
// ============================================================

async function obtenerRustEntitlements(
    accessToken
) {

    const rust =
        await obtenerJuegoRust(
            accessToken
        );

    if (!rust) {

        return {

            juego:
                null,

            entitlements:
                []

        };

    }

    const entitlements =
        await obtenerEntitlementsDrops(
            accessToken,
            rust.id
        );

    return {

        juego:
            rust,

        entitlements

    };

}

// ============================================================
// CREAR CLAVE DE CAMPAÑA
// ============================================================

function crearCampaignKey(
    datos
) {

    const drops = [

        ...(datos.generalDrops || []),

        ...(datos.streamerDrops || [])

    ];

    /*
     * IMPORTANTE:
     * La imagen NO forma parte de la campaignKey.
     */

    const texto =
        JSON.stringify(
            drops.map(
                drop => ({

                    tipo:
                        drop.tipo ||
                        (
                            drop.canales?.length
                                ? "streamer"
                                : "general"
                        ),

                    nombre:
                        drop.nombre,

                    horas:
                        drop.horas,

                    canales:
                        (drop.canales || [])
                            .map(
                                canal =>
                                    String(
                                        canal.login ||
                                            ""
                                    )
                                        .toLowerCase()
                            )
                            .sort()

                })
            )
        );

    return [

        datos.campaignName ||
            "",

        datos.campaignTheme ||
            "",

        datos.fechaInicio ||
            "",

        datos.fechaFin ||
            "",

        texto

    ].join("|");

}

// ============================================================
// CONVERTIR DATOS A DROPS GUARDABLES
// ============================================================

function convertirDatosAGuardado(
    datos
) {

    const drops = [];

    for (
        const drop
        of datos.generalDrops ||
        []
    ) {

        drops.push({

            tipo:
                "general",

            nombre:
                drop.nombre,

            horas:
                drop.horas,

            imagen:
                drop.imagen ||
                null,

            canales:
                []

        });

    }

    for (
        const drop
        of datos.streamerDrops ||
        []
    ) {

        drops.push({

            tipo:
                "streamer",

            nombre:
                drop.nombre,

            horas:
                drop.horas,

            imagen:
                drop.imagen ||
                null,

            canales:
                (drop.canales || [])
                    .map(
                        canal => ({

                            login:
                                canal.login,

                            displayName:
                                canal.displayName,

                            online:
                                !!canal.online

                        })
                    )

        });

    }

    return drops;

}

// ============================================================
// OBTENER FECHA DE ÚLTIMA REVISIÓN
// ============================================================

function obtenerFechaRevision(
    monitor
) {

    return (
        monitor.lastCheckedAt ||
        monitor.ultimaRevision ||
        new Date()
    );

}

// ============================================================
// GUARDAR FECHA DE REVISIÓN
// ============================================================

function establecerFechaRevision(
    monitor,
    fecha = new Date()
) {

    monitor.lastCheckedAt =
        fecha;

    if (
        Object.prototype.hasOwnProperty.call(
            monitor,
            "ultimaRevision"
        )
    ) {

        monitor.ultimaRevision =
            fecha;

    }

}

// ============================================================
// OBTENER CREADOR DEL MONITOR
// ============================================================

function obtenerCreador(
    monitor
) {

    return (
        monitor.createdBy ||
        monitor.creadoPor ||
        null
    );

}

// ============================================================
// GUARDAR CREADOR
// ============================================================

function establecerCreador(
    monitor,
    userId
) {

    if (!userId) {
        return;
    }

    monitor.createdBy =
        userId;

    if (
        Object.prototype.hasOwnProperty.call(
            monitor,
            "creadoPor"
        )
    ) {

        monitor.creadoPor =
            userId;

    }

}

// ============================================================
// CONSTRUIR DATOS DESDE MONITOR
// ============================================================

function datosDesdeMonitor(
    monitor
) {

    const drops =
        monitor.drops || [];

    return {

        campaignName:
            monitor.campaignName ||
            "Twitch Drops",

        campaignTheme:
            monitor.campaignTheme ||
            null,

        fechaInicio:
            monitor.fechaInicio ||
            null,

        fechaFin:
            monitor.fechaFin ||
            null,

        actualizado:
            obtenerFechaRevision(
                monitor
            ),

        generalDrops:
            drops
                .filter(
                    drop =>
                        drop.tipo ===
                        "general"
                )
                .map(
                    drop =>
                        drop.toObject
                            ? drop.toObject()
                            : drop
                ),

        streamerDrops:
            drops
                .filter(
                    drop =>
                        drop.tipo ===
                        "streamer"
                )
                .map(
                    drop =>
                        drop.toObject
                            ? drop.toObject()
                            : drop
                ),

        onlineCount:
            drops
                .filter(
                    drop =>
                        drop.tipo ===
                        "streamer"
                )
                .reduce(
                    (total, drop) =>
                        total +
                        (
                            drop.canales ||
                            []
                        ).filter(
                            canal =>
                                canal.online
                        ).length,
                    0
                ),

        totalStreamers:
            [
                ...new Set(
                    drops
                        .filter(
                            drop =>
                                drop.tipo ===
                                "streamer"
                        )
                        .flatMap(
                            drop =>
                                (
                                    drop.canales ||
                                    []
                                ).map(
                                    canal =>
                                        canal.login
                                )
                        )
                )
            ].length

    };

}

// ============================================================
// EDITAR MENSAJES DEL MONITOR
// ============================================================

async function editarMensajesMonitor(
    channel,
    monitor
) {

    if (
        !channel ||
        !monitor
    ) {

        return false;

    }

    const datos =
        datosDesdeMonitor(
            monitor
        );

    const embeds =
        crearEmbedsDrops(
            datos
        );

    if (!embeds.length) {

        console.warn(
            `⚠️ El monitor ${monitor._id} no tiene embeds para actualizar.`
        );

        return false;

    }

    const messageIds =
        Array.isArray(
            monitor.messageIds
        )
            ? monitor.messageIds
            : [];

    let todosCorrectos =
        true;

    for (
        let i = 0;
        i < messageIds.length;
        i++
    ) {

        const messageId =
            messageIds[i];

        try {

            const mensaje =
                await channel.messages.fetch(
                    messageId
                );

            const grupo =
                embeds.slice(
                    i * 10,
                    i * 10 + 10
                );

            if (!grupo.length) {
                continue;
            }

            await mensaje.edit({

                embeds:
                    grupo

            });

        } catch (error) {

            todosCorrectos =
                false;

            console.log(
                `⚠️ No se pudo editar mensaje Drops ${messageId}: ${error.message}`
            );

        }

    }

    return todosCorrectos;

}

// ============================================================
// BORRAR MENSAJES DEL MONITOR
// ============================================================

async function eliminarMensajesMonitor(
    channel,
    monitor
) {

    if (
        !channel ||
        !monitor
    ) {

        return;

    }

    for (
        const messageId
        of monitor.messageIds || []
    ) {

        try {

            const mensaje =
                await channel.messages.fetch(
                    messageId
                );

            await mensaje.delete();

            console.log(
                `🗑️ Mensaje Drops eliminado: ${messageId}`
            );

        } catch (error) {

            console.log(
                `ℹ️ Mensaje Drops ${messageId} ya no estaba disponible.`
            );

        }

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

    if (
        !channel ||
        typeof channel.send !==
            "function"
    ) {

        throw new Error(
            "El canal de Discord no es válido."
        );

    }

    const embeds =
        crearEmbedsDrops(
            datos
        );

    if (!embeds.length) {

        throw new Error(
            "Facepunch no devolvió Drops para publicar."
        );

    }

    const campaignKey =
        crearCampaignKey(
            datos
        );

    const cantidadMensajesNueva =
        Math.ceil(
            embeds.length / 10
        );

    let monitor =
        monitorExistente;

    // ========================================================
    // SI YA EXISTE MONITOR
    // ========================================================

    if (
        monitor
    ) {

        const cantidadAnterior =
            monitor.messageIds?.length ||
            0;

        const mismaCampana =
            monitor.campaignKey ===
            campaignKey;

        if (
            mismaCampana &&
            cantidadAnterior ===
                cantidadMensajesNueva
        ) {

            const mensajes = [];

            let todosEncontrados =
                true;

            for (
                const messageId
                of monitor.messageIds
            ) {

                try {

                    const mensaje =
                        await channel.messages.fetch(
                            messageId
                        );

                    mensajes.push(
                        mensaje
                    );

                } catch (error) {

                    todosEncontrados =
                        false;

                    console.log(
                        `⚠️ No se pudo recuperar mensaje Drops ${messageId}: ${error.message}`
                    );

                }

            }

            if (
                todosEncontrados &&
                mensajes.length ===
                    monitor.messageIds.length
            ) {

                for (
                    let i = 0;
                    i < mensajes.length;
                    i++
                ) {

                    const inicio =
                        i * 10;

                    const grupo =
                        embeds.slice(
                            inicio,
                            inicio + 10
                        );

                    await mensajes[i].edit({

                        embeds:
                            grupo

                    });

                }

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

                establecerFechaRevision(
                    monitor
                );

                monitor.active =
                    true;

                establecerCreador(
                    monitor,
                    creadoPor ||
                        obtenerCreador(
                            monitor
                        )
                );

                await monitor.save();

                console.log(
                    `🔄 Drops actualizados en ${channel.id} sin duplicar mensajes.`
                );

                return monitor;

            }

        }

        console.log(
            `♻️ Reconstruyendo mensajes Twitch Drops en ${channel.id}.`
        );

        await eliminarMensajesMonitor(
            channel,
            monitor
        );

    }

    // ========================================================
    // PUBLICAR MENSAJES NUEVOS
    // ========================================================

    const messageIds = [];

    for (
        let i = 0;
        i < embeds.length;
        i += 10
    ) {

        const grupo =
            embeds.slice(
                i,
                i + 10
            );

        const mensaje =
            await channel.send({

                embeds:
                    grupo

            });

        messageIds.push(
            mensaje.id
        );

        console.log(
            `🎁 Mensaje Drops publicado: ${mensaje.id} (${grupo.length} embeds)`
        );

    }

    // ========================================================
    // GUARDAR MONITOR
    // ========================================================

    if (!monitor) {

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

    establecerFechaRevision(
        monitor
    );

    monitor.active =
        true;

    establecerCreador(
        monitor,
        creadoPor ||
            obtenerCreador(
                monitor
            )
    );

    await monitor.save();

    console.log(
        `💾 Monitor Twitch Drops guardado para ${channel.guild.name} / #${channel.name}`
    );

    console.log(
        `💾 ${messageIds.length} mensaje(s) guardado(s) en MongoDB.`
    );

    return monitor;

}

// ============================================================
// PUBLICAR DESDE DISCORD
// ============================================================

async function publicarRustDrops(
    interaction
) {

    const resultado =
        await obtenerRustDrops(
            interaction.user.id
        );

    if (
        !resultado.vinculada
    ) {

        return {

            ok:
                false,

            motivo:
                "NO_VINCULADA"

        };

    }

    if (
        !resultado.tokenValido
    ) {

        return {

            ok:
                false,

            motivo:
                "TOKEN_INVALIDO"

        };

    }

    if (
        !resultado.facepunch ||
        resultado.facepunch.error
    ) {

        return {

            ok:
                false,

            motivo:
                "FACEPUNCH_ERROR"

        };

    }

    if (
        !interaction.channel
    ) {

        return {

            ok:
                false,

            motivo:
                "CANAL_INVALIDO"

        };

    }

    if (
        !interaction.guildId
    ) {

        return {

            ok:
                false,

            motivo:
                "SOLO_SERVIDOR"

        };

    }

    const channel =
        interaction.channel;

    let monitor =
        await RustDropsMonitor.findOne({

            guildId:
                interaction.guildId,

            channelId:
                channel.id,

            active:
                true

        });

    monitor =
        await publicarDropsEnCanal(

            channel,

            resultado.facepunch,

            monitor,

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
// REVISAR MONITORES AUTOMÁTICOS
// ============================================================

async function revisarDropsAutomaticos(
    client
) {

    if (
        dropsRevisando
    ) {

        console.log(
            "⏳ Revisión Twitch Drops anterior todavía ejecutándose..."
        );

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

            console.log(
                "🎁 No hay monitores Twitch Drops activos."
            );

            return;

        }

        console.log(
            `🔎 Revisando ${monitores.length} monitor(es) de Twitch Drops...`
        );

        const datos =
            await obtenerDropsFacepunch();

        if (
            !datos ||
            datos.error
        ) {

            console.log(
                "⚠️ No se pudo actualizar Twitch Drops esta ronda."
            );

            return;

        }

        const campaignKey =
            crearCampaignKey(
                datos
            );

        // ========================================================
        // REVISAR CADA MONITOR
        // ========================================================

        for (
            const monitor
            of monitores
        ) {

            try {

                let guild;

                try {

                    guild =
                        await client.guilds.fetch(
                            monitor.guildId
                        );

                } catch (error) {

                    console.log(
                        `⚠️ No se pudo obtener guild ${monitor.guildId}: ${error.message}`
                    );

                    continue;

                }

                if (!guild) {
                    continue;
                }

                let channel;

                try {

                    channel =
                        await guild.channels.fetch(
                            monitor.channelId
                        );

                } catch (error) {

                    console.log(
                        `⚠️ No se pudo obtener canal ${monitor.channelId}: ${error.message}`
                    );

                    continue;

                }

                if (
                    !channel ||
                    typeof channel.send !==
                        "function"
                ) {

                    console.log(
                        `⚠️ Canal de Drops no disponible: ${monitor.channelId}`
                    );

                    continue;

                }

                // ==================================================
                // CAMPAÑA CAMBIÓ
                // ==================================================

                if (
                    monitor.campaignKey !==
                    campaignKey
                ) {

                    console.log(
                        `🆕 Nueva campaña de Twitch Drops detectada para ${guild.name}.`
                    );

                    await publicarDropsEnCanal(

                        channel,

                        datos,

                        monitor,

                        obtenerCreador(
                            monitor
                        )

                    );

                    continue;

                }

                // ==================================================
                // ACTUALIZAR SOLO ESTADOS
                // ==================================================

                const estadosActuales =
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

                        estadosActuales.set(

                            String(
                                canal.login ||
                                    ""
                            ).toLowerCase(),

                            !!canal.online

                        );

                    }

                }

                let huboCambios =
                    false;

                for (
                    const drop
                    of monitor.drops
                ) {

                    if (
                        drop.tipo !==
                        "streamer"
                    ) {

                        continue;

                    }

                    for (
                        const canal
                        of drop.canales
                    ) {

                        const login =
                            String(
                                canal.login ||
                                    ""
                            ).toLowerCase();

                        if (
                            !estadosActuales.has(
                                login
                            )
                        ) {

                            continue;

                        }

                        const nuevoEstado =
                            estadosActuales.get(
                                login
                            );

                        if (
                            !!canal.online !==
                            nuevoEstado
                        ) {

                            console.log(

                                `📡 ${canal.displayName}: ${canal.online ? "ONLINE" : "OFFLINE"} → ${nuevoEstado ? "ONLINE" : "OFFLINE"}`

                            );

                            canal.online =
                                nuevoEstado;

                            huboCambios =
                                true;

                        }

                    }

                }

                establecerFechaRevision(
                    monitor
                );

                // ==================================================
                // EDITAR MENSAJES SI CAMBIÓ ONLINE/OFFLINE
                // ==================================================

                if (
                    huboCambios
                ) {

                    console.log(
                        `🔄 Actualizando estados Twitch Drops en ${guild.name}.`
                    );

                    const actualizado =
                        await editarMensajesMonitor(

                            channel,

                            monitor

                        );

                    if (
                        !actualizado
                    ) {

                        console.log(
                            `⚠️ Algunos mensajes del monitor ${monitor._id} no pudieron actualizarse.`
                        );

                    }

                }

                await monitor.save();

            } catch (error) {

                console.error(

                    `❌ Error revisando monitor Drops ${monitor.guildId}/${monitor.channelId}:`,

                    error.message

                );

            }

        }

    } catch (error) {

        console.error(
            "❌ Error general revisando Twitch Drops:",
            error
        );

    } finally {

        dropsRevisando =
            false;

    }

}

// ============================================================
// INICIAR SISTEMA AUTOMÁTICO
// ============================================================

function iniciarDropsAutomaticos(
    client
) {

    if (
        dropsAutomaticosIniciados
    ) {

        console.log(
            "⚠️ Sistema automático Twitch Drops ya estaba iniciado."
        );

        return;

    }

    if (!client) {

        console.error(
            "❌ No se puede iniciar Twitch Drops automático: falta el cliente Discord."
        );

        return;

    }

    dropsAutomaticosIniciados =
        true;

    console.log(
        "🎁 Sistema automático Twitch Drops iniciado cada 60 segundos."
    );

    setTimeout(
        async () => {

            try {

                await revisarDropsAutomaticos(
                    client
                );

            } catch (error) {

                console.error(
                    "❌ Error primera revisión Twitch Drops:",
                    error
                );

            }

        },
        5000
    );

    setInterval(
        async () => {

            try {

                await revisarDropsAutomaticos(
                    client
                );

            } catch (error) {

                console.error(
                    "❌ Error revisión automática Twitch Drops:",
                    error
                );

            }

        },
        INTERVALO_DROPS
    );

}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    validarToken,

    obtenerJuegoRust,

    obtenerEntitlementsDrops,

    obtenerRustEntitlements,

    separarEntitlements,

    ordenarPorFecha,

    obtenerRustDrops,

    crearEmbedRustDrops,

    obtenerRustDropsEmbed,

    obtenerDropsFacepunch,

    obtenerStreamersOnline,

    crearEmbedsDrops,

    publicarRustDrops,

    revisarDropsAutomaticos,

    iniciarDropsAutomaticos

};