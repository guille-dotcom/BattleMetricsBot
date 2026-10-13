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
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";

const FACEPUNCH_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8"
};

// ============================================================
// CACHE TWITCH TOKEN
// ============================================================

let twitchAccessToken = null;
let twitchTokenExpiresAt = 0;

// ============================================================
// UTILIDADES
// ============================================================

function limpiarTexto(texto) {

    if (!texto) {
        return "";
    }

    return String(texto)
        .replace(/\s+/g, " ")
        .replace(/\u00a0/g, " ")
        .trim();
}


// ------------------------------------------------------------
// CORRECCIÓN "Loading..."
// ------------------------------------------------------------

function limpiarNombreDrop(nombre) {

    nombre = limpiarTexto(nombre);

    if (!nombre) {
        return "";
    }

    // El HTML de Facepunch puede entregar:
    //
    // Loading... Bed
    // Loading... Garage Door
    // Loading... Thompson
    // Loading... COMING SOON
    //
    // El "Loading..." no forma parte del nombre real.

    nombre = nombre.replace(
        /^loading\s*\.\.\.\s*/i,
        ""
    );

    nombre = nombre.replace(
        /^loading\s*…\s*/i,
        ""
    );

    nombre = nombre.trim();

    return nombre;
}


// ============================================================
// URLS / IMÁGENES
// ============================================================

function normalizarUrlImagen(url) {

    if (!url) {
        return null;
    }

    url = String(url).trim();

    if (!url) {
        return null;
    }

    if (url.startsWith("//")) {
        return `https:${url}`;
    }

    if (url.startsWith("/")) {
        return `https://twitch.facepunch.com${url}`;
    }

    if (
        url.startsWith("data:") ||
        url.startsWith("blob:")
    ) {
        return null;
    }

    if (
        url.startsWith("http://") ||
        url.startsWith("https://")
    ) {
        return url;
    }

    return null;
}


function extraerPrimeraUrlSrcset(srcset) {

    if (!srcset) {
        return null;
    }

    const partes =
        String(srcset)
            .split(",")
            .map(x => x.trim())
            .filter(Boolean);

    if (!partes.length) {
        return null;
    }

    const ultima =
        partes[partes.length - 1];

    const url =
        ultima.split(/\s+/)[0];

    return normalizarUrlImagen(url);
}


function extraerUrlBackground(style) {

    if (!style) {
        return null;
    }

    const match =
        String(style).match(
            /url\(\s*['"]?([^'")]+)['"]?\s*\)/i
        );

    if (!match) {
        return null;
    }

    return normalizarUrlImagen(match[1]);
}


// ============================================================
// EXTRAER IMAGEN DE UN BLOQUE DROP
// ============================================================

function extraerImagenDrop($, elemento) {

    if (!elemento) {
        return null;
    }

    const candidatos = [];

    function agregar(valor) {

        const url =
            normalizarUrlImagen(valor);

        if (!url) {
            return;
        }

        if (!candidatos.includes(url)) {
            candidatos.push(url);
        }
    }


    // ========================================================
    // 1. ATRIBUTOS DEL PROPIO ELEMENTO
    // ========================================================

    const attrs =
        elemento.attribs || {};

    [
        "src",
        "data-src",
        "data-image",
        "data-img",
        "data-background",
        "data-bg",
        "data-thumbnail",
        "poster"
    ].forEach(attr => {

        if (attrs[attr]) {
            agregar(attrs[attr]);
        }
    });


    [
        "srcset",
        "data-srcset"
    ].forEach(attr => {

        if (attrs[attr]) {
            agregar(
                extraerPrimeraUrlSrcset(
                    attrs[attr]
                )
            );
        }
    });


    if (attrs.style) {
        agregar(
            extraerUrlBackground(
                attrs.style
            )
        );
    }


    // ========================================================
    // 2. IMÁGENES DENTRO DEL ELEMENTO
    // ========================================================

    $(elemento)
        .find("img")
        .each((_, img) => {

            const imgAttrs =
                img.attribs || {};

            [
                "src",
                "data-src",
                "data-image",
                "data-img",
                "data-original",
                "data-lazy-src",
                "data-thumbnail"
            ].forEach(attr => {

                if (imgAttrs[attr]) {
                    agregar(
                        imgAttrs[attr]
                    );
                }
            });


            [
                "srcset",
                "data-srcset"
            ].forEach(attr => {

                if (imgAttrs[attr]) {
                    agregar(
                        extraerPrimeraUrlSrcset(
                            imgAttrs[attr]
                        )
                    );
                }
            });
        });


    // ========================================================
    // 3. SOURCE
    // ========================================================

    $(elemento)
        .find("source")
        .each((_, source) => {

            const sourceAttrs =
                source.attribs || {};

            if (sourceAttrs.src) {
                agregar(
                    sourceAttrs.src
                );
            }

            if (sourceAttrs.srcset) {
                agregar(
                    extraerPrimeraUrlSrcset(
                        sourceAttrs.srcset
                    )
                );
            }
        });


    // ========================================================
    // 4. BACKGROUND
    // ========================================================

    $(elemento)
        .find("[style]")
        .each((_, el) => {

            const style =
                $(el).attr("style");

            agregar(
                extraerUrlBackground(
                    style
                )
            );
        });


    // ========================================================
    // 5. PRIORIDAD A IMÁGENES FACEPUNCH / STEAM
    // ========================================================

    const imagenPrioritaria =
        candidatos.find(url =>
            /files\.facepunch\.com/i.test(url) ||
            /steamstatic\.com/i.test(url) ||
            /steamcommunity\.com/i.test(url) ||
            /economy\/image/i.test(url) ||
            /fastly/i.test(url) ||
            /cloudflare/i.test(url)
        );

    if (imagenPrioritaria) {
        return imagenPrioritaria;
    }


    return candidatos[0] || null;
}


// ============================================================
// TWITCH TOKEN
// ============================================================

async function obtenerTwitchAccessToken() {

    const clientId =
        process.env.TWITCH_CLIENT_ID;

    const clientSecret =
        process.env.TWITCH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {

        console.log(
            "⚠️ Faltan TWITCH_CLIENT_ID o TWITCH_CLIENT_SECRET."
        );

        return null;
    }


    if (
        twitchAccessToken &&
        Date.now() < twitchTokenExpiresAt
    ) {
        return twitchAccessToken;
    }


    try {

        const response =
            await axios.post(
                "https://id.twitch.tv/oauth2/token",
                null,
                {
                    params: {
                        client_id: clientId,
                        client_secret: clientSecret,
                        grant_type: "client_credentials"
                    },
                    timeout: 30000
                }
            );


        twitchAccessToken =
            response.data.access_token;

        twitchTokenExpiresAt =
            Date.now() +
            ((response.data.expires_in - 60) * 1000);


        return twitchAccessToken;

    } catch (error) {

        console.error(
            "❌ Error obteniendo token Twitch:",
            error.response?.data ||
            error.message
        );

        return null;
    }
}


// ============================================================
// STREAMERS ONLINE EN RUST
// ============================================================

async function obtenerStreamersOnlineRust(logins) {

    const resultado = {};

    if (!Array.isArray(logins) || !logins.length) {
        return resultado;
    }


    const token =
        await obtenerTwitchAccessToken();

    if (!token) {
        return resultado;
    }


    const clientId =
        process.env.TWITCH_CLIENT_ID;

    const loginsUnicos =
        [
            ...new Set(
                logins
                    .filter(Boolean)
                    .map(x =>
                        String(x)
                            .trim()
                            .toLowerCase()
                    )
            )
        ];


    for (
        let i = 0;
        i < loginsUnicos.length;
        i += 100
    ) {

        const lote =
            loginsUnicos.slice(
                i,
                i + 100
            );

        try {

            const params =
                lote
                    .map(login =>
                        `user_login=${encodeURIComponent(login)}`
                    )
                    .join("&");


            const response =
                await axios.get(
                    `${TWITCH_API}/streams?${params}`,
                    {
                        headers: {
                            "Client-ID": clientId,
                            Authorization:
                                `Bearer ${token}`
                        },
                        timeout: 30000
                    }
                );


            const streams =
                response.data?.data || [];


            for (const stream of streams) {

                const login =
                    String(
                        stream.user_login || ""
                    )
                        .toLowerCase();

                if (!login) {
                    continue;
                }


                const esRust =
                    String(
                        stream.game_id || ""
                    ) === TWITCH_GAME_ID_RUST ||
                    String(
                        stream.game_name || ""
                    ).toLowerCase() === "rust";


                if (esRust) {

                    resultado[login] = {
                        online: true,
                        titulo:
                            stream.title || "",
                        game:
                            stream.game_name || "Rust",
                        viewerCount:
                            stream.viewer_count || 0,
                        startedAt:
                            stream.started_at || null,
                        thumbnailUrl:
                            stream.thumbnail_url || null
                    };
                }
            }

        } catch (error) {

            console.error(
                "❌ Error consultando streamers Twitch:",
                error.response?.data ||
                error.message
            );
        }
    }


    return resultado;
}


// ============================================================
// OBTENER HTML FACEPUNCH
// ============================================================

async function obtenerHtmlFacepunch() {

    const response =
        await axios.get(
            FACEPUNCH_DROPS_URL,
            {
                headers: FACEPUNCH_HEADERS,
                timeout: 30000
            }
        );

    return response.data;
}


// ============================================================
// EXTRAER GENERAL DROPS
// ============================================================

function extraerGeneralDrops($) {

    const drops = [];

    const vistos = new Set();


    function agregarDrop(nombre, horas, imagen = null) {

        nombre =
            limpiarNombreDrop(nombre);

        if (!nombre) {
            return;
        }


        horas =
            Number(horas) || 0;


        const key =
            `${nombre.toLowerCase()}|${horas}`;


        if (vistos.has(key)) {

            // Si ya existe pero esta segunda
            // búsqueda encontró una imagen,
            // aprovechamos la imagen.
            const existente =
                drops.find(
                    x =>
                        x.nombre.toLowerCase() ===
                        nombre.toLowerCase() &&
                        x.horas === horas
                );

            if (
                existente &&
                !existente.imagen &&
                imagen
            ) {
                existente.imagen = imagen;
            }

            return;
        }


        vistos.add(key);


        drops.push({
            tipo: "general",
            nombre,
            horas,
            imagen
        });
    }


    // ========================================================
    // BUSCAR LA SECCIÓN GENERAL DROPS
    // ========================================================

    let inicio = null;
    let fin = null;


    $("body *").each((_, el) => {

        const texto =
            limpiarTexto(
                $(el)
                    .clone()
                    .children()
                    .remove()
                    .end()
                    .text()
            );


        if (
            !inicio &&
            /^general drops$/i.test(texto)
        ) {
            inicio = el;
        }


        if (
            inicio &&
            !fin &&
            /^streamer drops$/i.test(texto)
        ) {
            fin = el;
        }
    });


    // ========================================================
    // SI TENEMOS SECCIÓN, RECORRER SUS ELEMENTOS
    // ========================================================

    if (inicio) {

        const elementos = [];

        let actual =
            inicio.nextSibling;

        while (
            actual &&
            actual !== fin
        ) {

            if (actual.type === "tag") {
                elementos.push(actual);
            }

            actual =
                actual.nextSibling;
        }


        for (const elemento of elementos) {

            const texto =
                limpiarTexto(
                    $(elemento).text()
                );


            if (!texto) {
                continue;
            }


            const match =
                texto.match(
                    /(?:Loading\.\.\.\s*)?(.+?)\s+(\d+(?:\.\d+)?)\s*(?:h|hour|hours)\b/i
                );


            if (!match) {
                continue;
            }


            let nombre =
                limpiarNombreDrop(
                    match[1]
                );


            if (!nombre) {
                continue;
            }


            const horas =
                Number(match[2]);


            const imagen =
                extraerImagenDrop(
                    $,
                    elemento
                );


            agregarDrop(
                nombre,
                horas,
                imagen
            );
        }
    }


    // ========================================================
    // FALLBACK: BUSCAR TEXTOS CON HORAS
    // ========================================================

    if (!drops.length) {

        $("body *").each((_, el) => {

            const texto =
                limpiarTexto(
                    $(el).text()
                );


            if (!texto) {
                return;
            }


            if (
                texto.length > 200
            ) {
                return;
            }


            const match =
                texto.match(
                    /(?:Loading\.\.\.\s*)?(.+?)\s+(\d+(?:\.\d+)?)\s*(?:h|hour|hours)\b/i
                );


            if (!match) {
                return;
            }


            let nombre =
                limpiarNombreDrop(
                    match[1]
                );


            if (!nombre) {
                return;
            }


            // Evitar agarrar títulos grandes,
            // etiquetas o textos irrelevantes.
            if (
                /general drops/i.test(nombre) ||
                /streamer drops/i.test(nombre)
            ) {
                return;
            }


            const horas =
                Number(match[2]);


            const imagen =
                extraerImagenDrop(
                    $,
                    el
                );


            agregarDrop(
                nombre,
                horas,
                imagen
            );
        });
    }


    // ========================================================
    // DEBUG
    // ========================================================

    for (const drop of drops) {

        console.log(
            `🖼️ General Drop "${drop.nombre}":`,
            drop.imagen || "NO ENCONTRADA"
        );
    }


    return drops;
}


// ============================================================
// EXTRAER STREAMER DROPS
// ============================================================

function extraerStreamerDrops($) {

    const drops = [];

    const vistos = new Map();


    function agregarDrop(
        nombre,
        horas,
        streamer,
        imagen
    ) {

        nombre =
            limpiarNombreDrop(nombre);

        streamer =
            limpiarTexto(streamer)
                .replace(/^@/, "")
                .trim()
                .toLowerCase();


        if (!nombre || !streamer) {
            return;
        }


        const key =
            `${nombre.toLowerCase()}|${horas}`;


        if (!vistos.has(key)) {

            const drop = {

                tipo: "streamer",

                nombre,

                horas,

                streamers: [
                    streamer
                ],

                imagen:
                    imagen || null
            };


            vistos.set(
                key,
                drop
            );

            drops.push(drop);

            return;
        }


        const existente =
            vistos.get(key);


        if (
            !existente.streamers.includes(
                streamer
            )
        ) {

            existente.streamers.push(
                streamer
            );
        }


        if (
            !existente.imagen &&
            imagen
        ) {

            existente.imagen =
                imagen;
        }
    }


    // ========================================================
    // LINKS TWITCH
    // ========================================================

    const linksTwitch = [];


    $("a[href]").each((_, el) => {

        const href =
            $(el).attr("href") || "";


        if (
            !/twitch\.tv\//i.test(
                href
            )
        ) {
            return;
        }


        const match =
            href.match(
                /twitch\.tv\/([^/?#]+)/i
            );


        if (!match) {
            return;
        }


        const login =
            match[1]
                .trim()
                .toLowerCase();


        if (!login) {
            return;
        }


        linksTwitch.push({
            el,
            login
        });
    });


    console.log(
        `🔎 Links Twitch encontrados en Facepunch: ${linksTwitch.length}`
    );


    // ========================================================
    // PROCESAR CADA LINK
    // ========================================================

    for (const item of linksTwitch) {

        const {
            el,
            login
        } = item;


        let encontrado = false;


        // ----------------------------------------------------
        // SUBIR POR EL DOM
        // ----------------------------------------------------

        let actual = el;


        for (
            let nivel = 0;
            nivel < 12 && actual;
            nivel++
        ) {

            const texto =
                limpiarTexto(
                    $(actual).text()
                );


            if (!texto) {

                actual =
                    actual.parent;

                continue;
            }


            const horaMatch =
                texto.match(
                    /(\d+(?:\.\d+)?)\s*(?:h|hour|hours)\b/i
                );


            if (!horaMatch) {

                actual =
                    actual.parent;

                continue;
            }


            let nombre =
                limpiarTexto(
                    $(actual)
                        .find(
                            "h1,h2,h3,h4,h5,h6,.title,.name,.drop-name"
                        )
                        .first()
                        .text()
                );


            nombre =
                limpiarNombreDrop(
                    nombre
                );


            if (!nombre) {

                const partes =
                    texto.split(
                        /\s{2,}|\n/
                    )
                        .map(x =>
                            limpiarTexto(x)
                        )
                        .filter(Boolean);


                for (const parte of partes) {

                    if (
                        parte.length < 3
                    ) {
                        continue;
                    }


                    if (
                        /\d+(?:\.\d+)?\s*(?:h|hour|hours)\b/i
                            .test(parte)
                    ) {
                        continue;
                    }


                    if (
                        /watch|twitch|streamer|drops/i
                            .test(parte)
                    ) {
                        continue;
                    }


                    nombre =
                        limpiarNombreDrop(
                            parte
                        );

                    if (nombre) {
                        break;
                    }
                }
            }


            if (nombre) {

                const horas =
                    Number(
                        horaMatch[1]
                    );


                const imagen =
                    extraerImagenDrop(
                        $,
                        actual
                    );


                agregarDrop(
                    nombre,
                    horas,
                    login,
                    imagen
                );


                encontrado = true;

                break;
            }


            actual =
                actual.parent;
        }


        // ----------------------------------------------------
        // FALLBACK POR VENTANA DE HTML
        // ----------------------------------------------------

        if (!encontrado) {

            const html =
                $.html();

            const index =
                html.toLowerCase()
                    .indexOf(
                        `twitch.tv/${login}`
                    );


            if (index !== -1) {

                const ventana =
                    html.substring(
                        Math.max(
                            0,
                            index - 4000
                        ),
                        Math.min(
                            html.length,
                            index + 4000
                        )
                    );


                const match =
                    ventana.match(
                        /(?:Loading\.\.\.\s*)?([^<>{}\n]{3,100}?)\s+(\d+(?:\.\d+)?)\s*(?:h|hour|hours)\b/i
                    );


                if (match) {

                    const nombre =
                        limpiarNombreDrop(
                            match[1]
                        );


                    const horas =
                        Number(
                            match[2]
                        );


                    agregarDrop(
                        nombre,
                        horas,
                        login,
                        null
                    );
                }
            }
        }
    }


    return drops;
}


// ============================================================
// SCRAPEAR FACEPUNCH
// ============================================================

async function obtenerDropsFacepunch() {

    try {

        const html =
            await obtenerHtmlFacepunch();

        const $ =
            cheerio.load(html);


        const generalDrops =
            extraerGeneralDrops($);


        const streamerDrops =
            extraerStreamerDrops($);


        console.log(
            `🎁 General Drops: ${generalDrops.length}`
        );

        console.log(
            `🎥 Streamer Drops: ${streamerDrops.length}`
        );


        const streamers = [
            ...new Set(
                streamerDrops.flatMap(
                    drop =>
                        drop.streamers || []
                )
            )
        ];


        console.log(
            `📺 Streamers asociados: ${streamers.length}`
        );


        return {

            generalDrops,

            streamerDrops,

            streamers,

            fechaConsulta:
                Date.now()
        };

    } catch (error) {

        console.error(
            "❌ Error obteniendo Twitch Drops de Facepunch:",
            error.response?.status ||
            error.message
        );


        return {

            generalDrops: [],

            streamerDrops: [],

            streamers: [],

            fechaConsulta:
                Date.now()
        };
    }
}


// ============================================================
// CREAR EMBED DROP
// ============================================================

function crearEmbedDrop(
    drop,
    onlineMap = {}
) {

    const embed =
        new EmbedBuilder()
            .setTitle(
                `🎁 ${drop.nombre}`
            )
            .setDescription(
                `⏱️ **${drop.horas}h**`
            );


    if (
        drop.tipo === "streamer" &&
        Array.isArray(drop.streamers) &&
        drop.streamers.length
    ) {

        const lineas =
            drop.streamers.map(
                streamer => {

                    const info =
                        onlineMap[
                            String(
                                streamer
                            ).toLowerCase()
                        ];


                    const online =
                        info?.online === true;


                    return (
                        `${online ? "🟢" : "⚫"} ` +
                        `**${streamer}**`
                    );
                }
            );


        embed.addFields({
            name:
                "📺 Streamer",
            value:
                lineas.join("\n")
        });
    }


    if (drop.imagen) {

        embed.setThumbnail(
            drop.imagen
        );
    }


    embed.setFooter({
        text:
            "RustLogix • Twitch Drops"
    });


    return embed;
}


// ============================================================
// CREAR CAMPAIGN KEY
// ============================================================

function crearCampaignKey(
    datos
) {

    const general =
        datos.generalDrops
            .map(drop =>
                `${drop.nombre}|${drop.horas}`
            )
            .sort();


    const streamer =
        datos.streamerDrops
            .map(drop =>
                `${drop.nombre}|${drop.horas}|${
                    (drop.streamers || [])
                        .slice()
                        .sort()
                        .join(",")
                }`
            )
            .sort();


    // IMPORTANTE:
    // La imagen NO forma parte de la key.
    // Si Facepunch cambia una URL de imagen,
    // no queremos considerar eso una campaña nueva.

    return JSON.stringify({
        general,
        streamer
    });
}


// ============================================================
// CONVERTIR DATOS A GUARDADO
// ============================================================

function convertirDatosAGuardado(
    datos,
    onlineMap = {}
) {

    const drops = [];


    for (
        const drop of datos.generalDrops
    ) {

        drops.push({

            tipo: "general",

            nombre:
                drop.nombre,

            horas:
                drop.horas,

            imagen:
                drop.imagen || null,

            streamers: []
        });
    }


    for (
        const drop of datos.streamerDrops
    ) {

        drops.push({

            tipo: "streamer",

            nombre:
                drop.nombre,

            horas:
                drop.horas,

            imagen:
                drop.imagen || null,

            streamers:
                (drop.streamers || [])
                    .map(streamer => ({

                        login:
                            streamer,

                        online:
                            onlineMap[
                                String(
                                    streamer
                                ).toLowerCase()
                            ]?.online === true
                    }))
        });
    }


    return drops;
}


// ============================================================
// CREAR GRUPOS DE MENSAJES
// ============================================================

function crearGruposMensajesDrops(
    drops,
    onlineMap = {}
) {

    const grupos = [];

    let actual = [];

    for (const drop of drops) {

        if (
            actual.length >= 10
        ) {

            grupos.push(actual);

            actual = [];
        }


        actual.push(drop);
    }


    if (actual.length) {
        grupos.push(actual);
    }


    return grupos.map(
        grupo =>
            grupo.map(
                drop => {

                    const copy = {
                        ...drop
                    };


                    if (
                        drop.tipo === "streamer" &&
                        Array.isArray(
                            drop.streamers
                        )
                    ) {

                        copy.streamers =
                            drop.streamers.map(
                                streamer => {

                                    const login =
                                        typeof streamer === "string"
                                            ? streamer
                                            : streamer.login;


                                    return login;
                                }
                            );
                    }


                    return crearEmbedDrop(
                        copy,
                        onlineMap
                    );
                }
            )
    );
}


// ============================================================
// EDITAR MENSAJES EXISTENTES
// ============================================================

async function editarMensajesMonitor(
    monitor,
    client,
    onlineMap = {}
) {

    if (
        !monitor.mensajes ||
        !Array.isArray(
            monitor.mensajes
        )
    ) {
        return;
    }


    for (
        const mensajeInfo
        of monitor.mensajes
    ) {

        try {

            const channel =
                await client.channels.fetch(
                    mensajeInfo.channelId
                );


            if (!channel) {
                continue;
            }


            const mensaje =
                await channel.messages.fetch(
                    mensajeInfo.messageId
                );


            if (!mensaje) {
                continue;
            }


            const embeds =
                (monitor.drops || []).map(
                    drop => {

                        const copy = {
                            ...drop
                        };


                        if (
                            drop.tipo === "streamer" &&
                            Array.isArray(
                                drop.streamers
                            )
                        ) {

                            copy.streamers =
                                drop.streamers.map(
                                    streamer =>
                                        typeof streamer === "string"
                                            ? streamer
                                            : streamer.login
                                );
                        }


                        return crearEmbedDrop(
                            copy,
                            onlineMap
                        );
                    }
                );


            await mensaje.edit({
                embeds
            });

        } catch (error) {

            console.error(
                "❌ Error editando mensaje Twitch Drops:",
                error.message
            );
        }
    }
}


// ============================================================
// PUBLICAR RUST DROPS
// ============================================================

async function publicarRustDrops(
    client,
    monitor,
    datos,
    onlineMap = {}
) {

    const guild =
        client.guilds.cache.get(
            monitor.guildId
        );


    if (!guild) {
        return false;
    }


    const channel =
        guild.channels.cache.get(
            monitor.channelId
        );


    if (!channel) {

        console.error(
            `❌ Canal Twitch Drops no encontrado en ${guild.name}.`
        );

        return false;
    }


    const drops =
        convertirDatosAGuardado(
            datos,
            onlineMap
        );


    if (!drops.length) {

        console.log(
            "⚠️ Facepunch no devolvió Drops para publicar."
        );

        return false;
    }


    const grupos =
        crearGruposMensajesDrops(
            drops,
            onlineMap
        );


    const mensajes = [];


    for (
        const embeds
        of grupos
    ) {

        if (!embeds.length) {
            continue;
        }


        const mensaje =
            await channel.send({
                embeds
            });


        mensajes.push({

            channelId:
                channel.id,

            messageId:
                mensaje.id
        });
    }


    monitor.drops =
        drops;

    monitor.mensajes =
        mensajes;


    monitor.campaignKey =
        crearCampaignKey(
            datos
        );


    monitor.markModified(
        "drops"
    );

    monitor.markModified(
        "mensajes"
    );


    await monitor.save();


    return true;
}


// ============================================================
// REVISIÓN AUTOMÁTICA
// ============================================================

async function revisarDropsAutomaticos(
    client
) {

    try {

        const monitores =
            await RustDropsMonitor.find({
                activo: true
            });


        if (!monitores.length) {
            return;
        }


        // ====================================================
        // FACEPUNCH
        // ====================================================

        const datos =
            await obtenerDropsFacepunch();


        if (
            !datos.generalDrops.length &&
            !datos.streamerDrops.length
        ) {

            console.log(
                "⚠️ No hay Twitch Drops disponibles en Facepunch."
            );

            return;
        }


        // ====================================================
        // STREAMERS
        // ====================================================

        const streamers =
            datos.streamers || [];


        const onlineMap =
            await obtenerStreamersOnlineRust(
                streamers
            );


        console.log(
            `🟢 Streamers ONLINE EN RUST: ${
                Object.keys(onlineMap).length
            }`
        );


        for (
            const drop
            of datos.streamerDrops
        ) {

            console.log(
                `🎯 Streamer Drop: ${
                    drop.nombre
                } (${
                    drop.horas
                }h) → ${
                    (drop.streamers || []).join(", ")
                }`
            );


            if (drop.imagen) {

                console.log(
                    `🖼️ Imagen: ${drop.imagen}`
                );
            }
        }


        // ====================================================
        // PROCESAR CADA MONITOR
        // ====================================================

        for (
            const monitor
            of monitores
        ) {

            try {

                const guild =
                    client.guilds.cache.get(
                        monitor.guildId
                    );


                if (!guild) {
                    continue;
                }


                const campaignKey =
                    crearCampaignKey(
                        datos
                    );


                // =================================================
                // NUEVA CAMPAÑA
                // =================================================

                if (
                    monitor.campaignKey !==
                    campaignKey
                ) {

                    const publicada =
                        await publicarRustDrops(
                            client,
                            monitor,
                            datos,
                            onlineMap
                        );


                    if (publicada) {

                        console.log(
                            `🆕 Nueva campaña Twitch Drops en ${guild.name}.`
                        );
                    }


                    continue;
                }


                // =================================================
                // MISMA CAMPAÑA
                // ACTUALIZAR ESTADOS ONLINE
                // =================================================

                let cambioEstado =
                    false;


                const dropsActuales =
                    monitor.drops || [];


                for (
                    const drop
                    of dropsActuales
                ) {

                    if (
                        drop.tipo !==
                        "streamer"
                    ) {
                        continue;
                    }


                    if (
                        !Array.isArray(
                            drop.streamers
                        )
                    ) {
                        continue;
                    }


                    for (
                        const streamer
                        of drop.streamers
                    ) {

                        const login =
                            typeof streamer === "string"
                                ? streamer
                                : streamer.login;


                        if (!login) {
                            continue;
                        }


                        const onlineAhora =
                            onlineMap[
                                String(
                                    login
                                ).toLowerCase()
                            ]?.online === true;


                        if (
                            typeof streamer ===
                            "string"
                        ) {

                            const index =
                                drop.streamers.indexOf(
                                    streamer
                                );


                            if (
                                index !== -1
                            ) {

                                drop.streamers[
                                    index
                                ] = {

                                    login:
                                        streamer,

                                    online:
                                        onlineAhora
                                };


                                cambioEstado =
                                    true;
                            }

                        } else {

                            const anterior =
                                streamer.online === true;


                            if (
                                anterior !==
                                onlineAhora
                            ) {

                                streamer.online =
                                    onlineAhora;

                                cambioEstado =
                                    true;
                            }
                        }
                    }
                }


                // =================================================
                // SI CAMBIÓ ONLINE/OFFLINE:
                // EDITAR LOS MISMOS MENSAJES
                // =================================================

                if (cambioEstado) {

                    monitor.markModified(
                        "drops"
                    );

                    await monitor.save();


                    await editarMensajesMonitor(
                        monitor,
                        client,
                        onlineMap
                    );


                    console.log(
                        `🔄 Actualizado estado de streamers en ${guild.name}.`
                    );
                }

            } catch (error) {

                console.error(
                    `❌ Error procesando monitor Twitch Drops ${monitor.guildId}:`,
                    error.message
                );
            }
        }

    } catch (error) {

        console.error(
            "❌ Error en revisión automática Twitch Drops:",
            error.message
        );
    }
}


// ============================================================
// INICIAR AUTOMÁTICO
// ============================================================

function iniciarDropsAutomaticos(
    client
) {

    console.log(
        "⏳ Twitch Drops automático iniciado."
    );


    setTimeout(
        () => {

            revisarDropsAutomaticos(
                client
            );

        },
        5000
    );


    setInterval(
        () => {

            revisarDropsAutomaticos(
                client
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