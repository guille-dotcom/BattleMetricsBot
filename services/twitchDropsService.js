// services/twitchDropsService.js

const axios = require("axios");
const { EmbedBuilder } = require("discord.js");

const TwitchAccount = require("../models/TwitchAccount");

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

const FACEPUNCH_DROPS_URL =
    "https://twitch.facepunch.com/?handler=Twitch";

let twitchAppToken = null;
let twitchAppTokenExpiresAt = 0;

/**
 * ============================================================
 * CONFIGURACIÓN
 * ============================================================
 */

function validarConfiguracion() {
    if (!TWITCH_CLIENT_ID) {
        throw new Error("Falta la variable TWITCH_CLIENT_ID.");
    }
}

/**
 * ============================================================
 * HEADERS TWITCH
 * ============================================================
 */

function getHeaders(accessToken) {
    validarConfiguracion();

    if (!accessToken) {
        throw new Error("No se recibió un access token de Twitch.");
    }

    return {
        "Client-ID": TWITCH_CLIENT_ID,
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
    };
}

/**
 * ============================================================
 * VALIDAR TOKEN DEL USUARIO
 * ============================================================
 */

async function validarToken(accessToken) {
    try {
        const respuesta = await axios.get(
            "https://id.twitch.tv/oauth2/validate",
            {
                headers: {
                    Authorization: `OAuth ${accessToken}`
                },
                timeout: 10000
            }
        );

        const datos = respuesta.data || null;

        if (datos) {
            console.log("🔎 DIAGNÓSTICO TOKEN TWITCH");
            console.log(
                "🔎 Client ID configurado:",
                TWITCH_CLIENT_ID
            );
            console.log(
                "🔎 Client ID del token:",
                datos.client_id || "NO DEVUELTO"
            );
            console.log(
                "🔎 Usuario del token:",
                datos.login || "NO DEVUELTO"
            );
            console.log(
                "🔎 User ID del token:",
                datos.user_id || "NO DEVUELTO"
            );
            console.log(
                "🔎 Scopes del token:",
                Array.isArray(datos.scopes)
                    ? datos.scopes.join(", ") || "NINGUNO"
                    : "NO DEVUELTO"
            );
            console.log(
                "🔎 Expira en:",
                datos.expires_in ?? "NO DEVUELTO"
            );

            if (
                datos.client_id &&
                datos.client_id !== TWITCH_CLIENT_ID
            ) {
                console.error(
                    "❌ ALERTA: El Client ID del token NO coincide con TWITCH_CLIENT_ID."
                );
            } else if (
                datos.client_id &&
                datos.client_id === TWITCH_CLIENT_ID
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
            error.response?.data || error.message
        );

        return null;
    }
}

/**
 * ============================================================
 * OBTENER JUEGO RUST
 * ============================================================
 */

async function obtenerJuegoRust(accessToken) {
    try {
        const respuesta = await axios.get(
            "https://api.twitch.tv/helix/games",
            {
                params: {
                    name: "Rust"
                },
                headers: getHeaders(accessToken),
                timeout: 15000
            }
        );

        const juegos =
            respuesta.data?.data || [];

        if (!juegos.length) {
            console.log(
                "⚠️ Twitch no devolvió el juego Rust."
            );

            return null;
        }

        const rust =
            juegos.find(
                juego =>
                    String(juego.name).toLowerCase() ===
                    "rust"
            );

        if (rust) {
            console.log(
                `🎮 Rust encontrado en Twitch: ${rust.name} (${rust.id})`
            );
        }

        return rust || juegos[0];

    } catch (error) {
        console.error(
            "❌ Error obteniendo Rust desde Twitch:",
            error.response?.status,
            error.response?.data || error.message
        );

        return null;
    }
}

/**
 * ============================================================
 * ENTITLEMENTS TWITCH
 * ============================================================
 */

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
                params.game_id = gameId;
            }

            if (fulfillmentStatus) {
                params.fulfillment_status =
                    fulfillmentStatus;
            }

            if (cursor) {
                params.after = cursor;
            }

            console.log(
                "🎁 Consultando Twitch Entitlements...",
                {
                    game_id: gameId || "todos",
                    fulfillment_status:
                        fulfillmentStatus || "todos",
                    tiene_cursor: !!cursor
                }
            );

            const respuesta = await axios.get(
                "https://api.twitch.tv/helix/entitlements/drops",
                {
                    params,
                    headers: getHeaders(accessToken),
                    timeout: 15000
                }
            );

            const datos =
                respuesta.data?.data || [];

            todos.push(...datos);

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
            error.response?.data || error.message
        );

        return [];
    }
}

/**
 * ============================================================
 * TOKEN DE APLICACIÓN TWITCH
 * ============================================================
 */

async function obtenerTwitchAppToken() {
    if (
        twitchAppToken &&
        Date.now() < twitchAppTokenExpiresAt
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
        const respuesta = await axios.post(
            "https://id.twitch.tv/oauth2/token",
            null,
            {
                params: {
                    client_id: TWITCH_CLIENT_ID,
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
                respuesta.data?.expires_in || 0
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
            error.response?.data || error.message
        );

        twitchAppToken = null;
        twitchAppTokenExpiresAt = 0;

        return null;
    }
}

/**
 * ============================================================
 * COMPROBAR STREAMERS ONLINE
 * ============================================================
 */

async function obtenerStreamersOnline(logins = []) {
    const nombres = [
        ...new Set(
            logins
                .map(nombre =>
                    String(nombre || "")
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
                const login of lote
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
                            "Authorization":
                                `Bearer ${appToken}`
                        },
                        timeout: 15000
                    }
                );

            const streams =
                respuesta.data?.data || [];

            for (
                const stream of streams
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
            error.response?.data || error.message
        );

        return new Set();
    }
}

/**
 * ============================================================
 * DECODIFICAR HTML
 * ============================================================
 */

function decodificarHtml(texto = "") {
    return String(texto)
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&apos;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&#x27;/gi, "'")
        .replace(/&#x2F;/gi, "/")
        .replace(/&#160;/gi, " ")
        .trim();
}

function limpiarHtml(texto = "") {
    return decodificarHtml(
        String(texto)
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
    );
}

function normalizarLogin(nombre = "") {
    return String(nombre)
        .trim()
        .replace(/^@/, "")
        .toLowerCase();
}

/**
 * ============================================================
 * EXTRAER STREAMERS + RECOMPENSAS
 *
 * La estructura real de Facepunch es:
 *
 * streamer
 * streamer
 * recompensa
 * tiempo
 *
 * streamer
 * recompensa
 * tiempo
 *
 * Por eso procesamos el HTML en orden.
 * ============================================================
 */

function extraerStreamerDrops(html) {
    const resultados = [];

    /**
     * Primero obtenemos los enlaces Twitch en orden.
     */
    const regexEnlaces =
        /<a\b[^>]*href=["']https?:\/\/(?:www\.)?twitch\.tv\/([^"'?#\/]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;

    const enlaces = [];

    let match;

    while (
        (match =
            regexEnlaces.exec(html)) !== null
    ) {
        const login =
            normalizarLogin(
                match[1]
            );

        if (!login) {
            continue;
        }

        const displayName =
            limpiarHtml(
                match[2]
            ) || match[1];

        enlaces.push({
            login,
            displayName,
            index:
                match.index
        });
    }

    /**
     * Los enlaces de Rust streams / Twitch Drops
     * aparecen también en otras partes de la página.
     *
     * Nos quedamos únicamente con los streamers que
     * están después de "Streamer Drops".
     */
    const indiceStreamerDrops =
        html.search(
            /Streamer Drops/i
        );

    if (
        indiceStreamerDrops === -1
    ) {
        return [];
    }

    const indiceFinal =
        html.search(
            /Drops Metrics/i
        );

    const inicio =
        indiceStreamerDrops;

    const fin =
        indiceFinal !== -1
            ? indiceFinal
            : html.length;

    const bloque =
        html.slice(
            inicio,
            fin
        );

    /**
     * Enlaces Twitch dentro exclusivamente
     * del bloque Streamer Drops.
     */
    const regexStreamer =
        /<a\b[^>]*href=["']https?:\/\/(?:www\.)?twitch\.tv\/([^"'?#\/]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;

    const streamers =
        [];

    while (
        (match =
            regexStreamer.exec(
                bloque
            )) !== null
    ) {
        const login =
            normalizarLogin(
                match[1]
            );

        if (!login) {
            continue;
        }

        const displayName =
            limpiarHtml(
                match[2]
            ) || match[1];

        streamers.push({
            login,
            displayName,
            index:
                match.index
        });
    }

    /**
     * Eliminamos duplicados consecutivos.
     */
    const streamersUnicos =
        [];

    for (
        const streamer of streamers
    ) {
        const anterior =
            streamersUnicos[
                streamersUnicos.length - 1
            ];

        if (
            anterior &&
            anterior.login ===
                streamer.login
        ) {
            continue;
        }

        streamersUnicos.push(
            streamer
        );
    }

    /**
     * Quitamos la parte de HTML y trabajamos
     * con texto manteniendo posiciones aproximadas.
     *
     * Buscamos cada recompensa en el HTML y tomamos
     * los streamers inmediatamente anteriores.
     */

    const nombresRecompensas =
        [
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

    /**
     * Creamos una lista de posiciones de recompensas
     * directamente sobre el bloque HTML.
     */
    const recompensasEncontradas =
        [];

    for (
        const nombre of nombresRecompensas
    ) {
        const regex =
            new RegExp(
                escapeRegExp(nombre),
                "i"
            );

        const resultado =
            regex.exec(
                bloque
            );

        if (!resultado) {
            continue;
        }

        recompensasEncontradas.push({
            nombre,
            index:
                resultado.index
        });
    }

    /**
     * Orden correcto según la página.
     */
    recompensasEncontradas.sort(
        (a, b) =>
            a.index - b.index
    );

    /**
     * Para cada recompensa:
     *
     * - buscamos los enlaces Twitch anteriores
     * - ignoramos streamers que estén demasiado lejos
     * - tomamos como máximo los streamers que aparecen
     *   desde la recompensa anterior hasta ésta.
     *
     * La página actual coloca 1 o 2 streamers por drop.
     */
    for (
        let i = 0;
        i < recompensasEncontradas.length;
        i++
    ) {
        const recompensa =
            recompensasEncontradas[i];

        const anterior =
            i > 0
                ? recompensasEncontradas[
                    i - 1
                ]
                : null;

        const limiteInicio =
            anterior
                ? anterior.index
                : 0;

        const limiteFin =
            recompensa.index;

        const canales =
            streamersUnicos.filter(
                streamer =>
                    streamer.index >=
                        limiteInicio &&
                    streamer.index <
                        limiteFin
            );

        /**
         * Normalmente hay 1 o 2 canales.
         */
        const canalesFinales =
            canales.slice(
                Math.max(
                    0,
                    canales.length - 2
                )
            );

        /**
         * Horas:
         * buscamos "1 Hour", "2 Hours", etc.
         * después de la recompensa.
         */
        const textoPosterior =
            limpiarHtml(
                bloque.slice(
                    recompensa.index,
                    Math.min(
                        bloque.length,
                        recompensa.index +
                            800
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
            canalesFinales.length
        ) {
            resultados.push({
                nombre:
                    recompensa.nombre,
                horas,
                canales:
                    canalesFinales
                        .map(
                            canal => ({
                                login:
                                    canal.login,
                                displayName:
                                    canal.displayName
                            })
                        )
            });
        }
    }

    /**
     * Si el algoritmo anterior no encuentra algo,
     * utilizamos un parser alternativo basado en el
     * texto visible de la página.
     */
    if (
        resultados.length <
        recompensasEncontradas.length
    ) {
        console.log(
            `⚠️ Parser principal encontró ${resultados.length}/${recompensasEncontradas.length} streamer drops.`
        );
    }

    return resultados;
}

function escapeRegExp(texto) {
    return String(texto).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );
}

/**
 * ============================================================
 * OBTENER DROPS DESDE FACEPUNCH
 * ============================================================
 */

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
                respuesta.data || ""
            );

        if (!html) {
            throw new Error(
                "Facepunch devolvió una respuesta vacía."
            );
        }

        /**
         * ========================================================
         * CAMPAÑA
         * ========================================================
         */

        let campaignName =
            "Twitch Drops";

        const campaignMatch =
            html.match(
                /<h1[^>]*>([\s\S]*?)<\/h1>/i
            );

        if (campaignMatch) {
            const posibleNombre =
                limpiarHtml(
                    campaignMatch[1]
                );

            if (
                posibleNombre &&
                !/^Drops Metrics$/i.test(
                    posibleNombre
                )
            ) {
                campaignName =
                    posibleNombre;
            }
        }

        /**
         * ========================================================
         * NOMBRE DE CAMPAÑA REAL
         * ========================================================
         *
         * En la página actual aparece:
         *
         * Twitch Drops Round 53 Hosted by Rustoria
         * Rust Isles
         */

        const textoPagina =
            limpiarHtml(html);

        const campaignTextoMatch =
            textoPagina.match(
                /(Twitch Drops[^]{0,120}?)(?=Rust Isles|General Drops)/i
            );

        if (
            campaignTextoMatch
        ) {
            const texto =
                campaignTextoMatch[1]
                    .replace(
                        /\s+/g,
                        " "
                    )
                    .trim();

            if (
                texto.toLowerCase()
                    .includes(
                        "twitch drops"
                    )
            ) {
                campaignName =
                    texto;
            }
        }

        /**
         * ========================================================
         * SUBTÍTULO / TEMA
         * ========================================================
         */

        let campaignTheme =
            null;

        const rustIslesMatch =
            textoPagina.match(
                /(Rust Isles)/i
            );

        if (
            rustIslesMatch
        ) {
            campaignTheme =
                rustIslesMatch[1];
        }

        /**
         * ========================================================
         * FECHAS
         * ========================================================
         */

        let fechaInicio =
            null;

        let fechaFin =
            null;

        const fechaMatch =
            textoPagina.match(
                /([A-Z][a-z]+\s+\d{1,2},\s+\d{4}\s+at\s+\d{1,2}:\d{2}\s+[AP]M\s+UTC)\s*-\s*([A-Z][a-z]+\s+\d{1,2},\s+\d{4}\s+at\s+\d{1,2}:\d{2}\s+[AP]M\s+UTC)/i
            );

        if (
            fechaMatch
        ) {
            fechaInicio =
                fechaMatch[1];

            fechaFin =
                fechaMatch[2];
        }

        /**
         * ========================================================
         * GENERAL DROPS
         * ========================================================
         */

        const generalDrops =
            [];

        const generalNombres =
            [
                "Large Wood Box",
                "Auto Turret",
                "Small Box",
                "Pants",
                "Work Boots",
                "Hoodie"
            ];

        for (
            const nombre of generalNombres
        ) {
            const regex =
                new RegExp(
                    `${escapeRegExp(nombre)}\\s+(\\d+)\\s+Hours?`,
                    "i"
                );

            const match =
                textoPagina.match(
                    regex
                );

            if (match) {
                generalDrops.push({
                    nombre,
                    horas:
                        Number(
                            match[1]
                        )
                });
            }
        }

        /**
         * ========================================================
         * STREAMER DROPS
         * ========================================================
         */

        const streamerDrops =
            extraerStreamerDrops(
                html
            );

        /**
         * ========================================================
         * COMPROBAR ONLINE
         * ========================================================
         */

        const logins =
            [];

        for (
            const drop of streamerDrops
        ) {
            for (
                const canal of drop.canales
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
            const drop of streamerDrops
        ) {
            for (
                const canal of drop.canales
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
            generalDrops: [],
            streamerDrops: [],
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

/**
 * ============================================================
 * FORMATEAR HORAS
 * ============================================================
 */

function formatearHoras(horas) {
    const numero =
        Number(horas);

    if (
        !Number.isFinite(numero)
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

/**
 * ============================================================
 * FORMATEAR CANALES
 * ============================================================
 */

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
        .join(" • ");
}

/**
 * ============================================================
 * EMBED
 * ============================================================
 */

function crearEmbedFacepunchDrops(
    datos
) {
    const embed =
        new EmbedBuilder()
            .setColor(0x9146ff)
            .setTitle(
                "🎁 Rust Twitch Drops"
            );

    /**
     * ========================================================
     * CAMPAÑA
     * ========================================================
     */

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
    } else {
        descripcion +=
            "\n⏰ Fecha de finalización no disponible";
    }

    embed.setDescription(
        descripcion
    );

    /**
     * ========================================================
     * GENERAL DROPS
     * ========================================================
     */

    if (
        datos.generalDrops.length
    ) {
        const texto =
            datos.generalDrops
                .map(
                    drop =>
                        `📦 **${drop.nombre}** — ${formatearHoras(drop.horas)}`
                )
                .join("\n");

        embed.addFields({
            name:
                `📦 Drops Generales (${datos.generalDrops.length})`,
            value:
                texto.slice(
                    0,
                    1024
                ),
            inline:
                false
        });
    }

    /**
     * ========================================================
     * STREAMER DROPS
     * ========================================================
     */

    if (
        datos.streamerDrops.length
    ) {
        const bloques =
            datos.streamerDrops.map(
                drop => {
                    const canales =
                        formatearCanales(
                            drop.canales
                        );

                    return (
                        `🎯 **${drop.nombre}** — ${formatearHoras(drop.horas)}\n` +
                        canales
                    );
                }
            );

        /**
         * Discord permite máximo 1024 caracteres
         * por field.
         */
        let parte =
            "";

        let numeroParte =
            1;

        for (
            const bloque of bloques
        ) {
            const nuevoTexto =
                parte
                    ? `${parte}\n\n${bloque}`
                    : bloque;

            if (
                nuevoTexto.length >
                1000
            ) {
                embed.addFields({
                    name:
                        numeroParte === 1
                            ? `🎯 Streamer Drops (${datos.streamerDrops.length})`
                            : "🎯 Streamer Drops (cont.)",
                    value:
                        parte,
                    inline:
                        false
                });

                numeroParte++;

                parte =
                    bloque;
            } else {
                parte =
                    nuevoTexto;
            }
        }

        if (
            parte
        ) {
            embed.addFields({
                name:
                    numeroParte === 1
                        ? `🎯 Streamer Drops (${datos.streamerDrops.length})`
                        : "🎯 Streamer Drops (cont.)",
                value:
                    parte,
                inline:
                    false
            });
        }
    }

    /**
     * ========================================================
     * ESTADO ONLINE
     * ========================================================
     */

    embed.addFields({
        name:
            "📡 Estado de los canales",
        value:
            `🟢 ${datos.onlineCount} streamer(s) online de ${datos.totalStreamers}.`,
        inline:
            false
    });

    /**
     * ========================================================
     * INFORMACIÓN
     * ========================================================
     */

    embed.addFields({
        name:
            "ℹ️ Cómo conseguirlos",
        value:
            "Los Drops generales cuentan viendo streams de Rust con Drops Enabled. " +
            "Los Streamer Drops requieren ver al streamer indicado.",
        inline:
            false
    });

    embed.addFields({
        name:
            "⚠️ Importante",
        value:
            "Twitch solo cuenta un canal activo a la vez. " +
            "Ver varios canales simultáneamente no acelera el progreso.",
        inline:
            false
    });

    embed.addFields({
        name:
            "⏱️ Progreso",
        value:
            "El progreso individual no se puede consultar desde la API utilizada por RustLogix. " +
            "Puedes verlo directamente en tu Twitch Drops Inventory.",
        inline:
            false
    });

    embed
        .setFooter({
            text:
                "RustLogix • Facepunch + Twitch"
        })
        .setTimestamp(
            datos.actualizado
        );

    return embed;
}

/**
 * ============================================================
 * OBTENER RUST DROPS
 * ============================================================
 */

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

    if (
        tokenInfo.client_id &&
        tokenInfo.client_id !==
            TWITCH_CLIENT_ID
    ) {
        console.error(
            "❌ EL TOKEN DE TWITCH PERTENECE A OTRO CLIENT ID."
        );
    }

    /**
     * Los Drops activos se obtienen directamente
     * de Facepunch.
     */
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

/**
 * ============================================================
 * EMBED PRINCIPAL
 * ============================================================
 */

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
                "No tienes una cuenta de Twitch vinculada.\n\n" +
                "Usa **/drops vincular** para conectar tu cuenta."
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
                `Cuenta vinculada: **${resultado.cuenta}**\n\n` +
                "⚠️ La sesión de Twitch no pudo validarse.\n\n" +
                "Prueba nuevamente con **/drops estado** o vuelve a vincular la cuenta."
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
                `Cuenta Twitch: **${resultado.cuenta}**\n\n` +
                "❌ No se pudieron obtener los Drops actuales desde Facepunch.\n\n" +
                "Inténtalo nuevamente en unos segundos."
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

/**
 * ============================================================
 * FUNCIÓN PRINCIPAL
 * ============================================================
 */

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

/**
 * ============================================================
 * COMPATIBILIDAD CON SISTEMA ANTERIOR
 * ============================================================
 */

function separarEntitlements(
    entitlements = []
) {
    const claimed =
        [];

    const fulfilled =
        [];

    for (
        const entitlement of entitlements
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

/**
 * ============================================================
 * EXPORTS
 * ============================================================
 */

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
    obtenerStreamersOnline
};