// ============================================================
// RUSTLOGIX - TWITCH DROPS SERVICE
// ============================================================
// Lee Twitch Drops directamente desde Facepunch:
//
// https://twitch.facepunch.com/
//
// Funciones:
//
// - Detecta campaña actual/upcoming
// - Detecta General Drops
// - Detecta Streamer Drops
// - Detecta nombre correcto del objeto
// - Detecta duración
// - Detecta imagen del objeto
// - NUNCA usa avatar del streamer como imagen del Drop
// - Obtiene canal Twitch del streamer
// - Comprueba si el streamer está transmitiendo Rust
// - Notifica ONLINE / OFFLINE
// - Publica embeds de Discord
// - Compatible con /drops rust
// - Compatible con sistema automático existente
// ============================================================

const axios = require("axios");
const cheerio = require("cheerio");

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const RustDropsMonitor =
    require("../models/RustDropsMonitor");


// ============================================================
// CONFIGURACIÓN
// ============================================================

const FACEPUNCH_DROPS_URL =
    "https://twitch.facepunch.com/?handler=Twitch";

const FACEPUNCH_GAME_URL =
    "https://twitch.facepunch.com/";

const TWITCH_API =
    "https://api.twitch.tv/helix";

const TWITCH_GAME_ID =
    "252490";

const TWITCH_CATEGORY_URL =
    "https://www.twitch.tv/directory/category/rust";

const REVISION_INTERVALO =
    60 * 1000;

const FACEPUNCH_CACHE_MS =
    45 * 1000;

const TWITCH_STREAM_CACHE_MS =
    30 * 1000;

const REQUEST_TIMEOUT =
    30000;


// ============================================================
// HEADERS
// ============================================================

const FACEPUNCH_HEADERS = {

    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155 Safari/537.36",

    "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

    "Accept-Language":
        "en-US,en;q=0.9",

    "Cache-Control":
        "no-cache",

    "Pragma":
        "no-cache"
};


// ============================================================
// PUPPETEER
// ============================================================

let puppeteer = null;

try {

    puppeteer =
        require("puppeteer");

} catch {

    console.log(
        "[Twitch Drops] Puppeteer no está instalado. Se usará Axios solamente."
    );
}


let browser = null;
let browserPage = null;
let renderPromise = null;


let facepunchCache = {

    html: null,

    timestamp: 0
};


// ============================================================
// CACHE TWITCH
// ============================================================

let twitchStreamsCache = {

    data: [],

    timestamp: 0
};


// ============================================================
// ESTADO SERVICIO
// ============================================================

let automaticoIniciado =
    false;

let automaticInterval =
    null;


// ============================================================
// UTILIDADES
// ============================================================

function normalizarTexto(valor) {

    return String(valor || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}


function normalizarClave(valor) {

    return normalizarTexto(valor)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s.-]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}


function esUrlValida(valor) {

    if (!valor) {
        return false;
    }

    try {

        const url =
            new URL(valor);

        return (
            url.protocol === "http:" ||
            url.protocol === "https:"
        );

    } catch {

        return false;
    }
}


// ============================================================
// IMÁGENES CONOCIDAS
// ============================================================
//
// Estas imágenes son exclusivamente del objeto.
//
// NO son imágenes del streamer.
// ============================================================

const DROP_IMAGENES_CONOCIDAS = {

    "backpack":
        "https://files.facepunch.com/lewis/2026/October/backpack.jpg",

    "small backpack":
        "https://files.facepunch.com/lewis/2026/October/backpack.jpg"
};


// ============================================================
// DETECTAR AVATAR TWITCH
// ============================================================

function esAvatarTwitch(url) {

    if (!url) {
        return false;
    }

    const texto =
        String(url)
            .toLowerCase();


    return (

        texto.includes(
            "jtvnw.net/jtv_user_pictures"
        ) ||

        texto.includes(
            "profile_image"
        ) ||

        texto.includes(
            "profileimage"
        ) ||

        texto.includes(
            "twitchrivals"
        ) ||

        texto.includes(
            "twitch.tv/user"
        )
    );
}


// ============================================================
// LIMPIAR URL IMAGEN
// ============================================================

function limpiarUrlImagen(url) {

    if (!url) {
        return null;
    }


    let limpia =
        String(url)
            .trim();


    limpia =
        limpia
            .replace(
                /^url\(["']?/i,
                ""
            )
            .replace(
                /["']?\)$/i,
                ""
            )
            .trim();


    if (
        limpia.startsWith("//")
    ) {

        limpia =
            "https:" +
            limpia;
    }


    if (
        !esUrlValida(limpia)
    ) {

        return null;
    }


    if (
        esAvatarTwitch(limpia)
    ) {

        return null;
    }


    return limpia;
}


// ============================================================
// IMAGEN CONOCIDA
// ============================================================

function imagenConocidaPorNombre(
    nombre
) {

    const clave =
        normalizarClave(nombre);


    return (
        DROP_IMAGENES_CONOCIDAS[
            clave
        ] ||
        null
    );
}


// ============================================================
// EXTRAER URL DE ATRIBUTO
// ============================================================

function obtenerUrlDesdeAtributo(
    valor
) {

    if (!valor) {
        return null;
    }


    return limpiarUrlImagen(
        String(valor)
            .trim()
            .split(/\s+/)[0]
    );
}


// ============================================================
// EXTRAER IMAGEN DIRECTA
// ============================================================
//
// IMPORTANTE:
//
// Esta función NO sube hacia padres.
// Solo mira el elemento recibido y sus hijos.
//
// Esto evita que una imagen del streamer termine siendo
// utilizada como imagen del Drop.
// ============================================================

function extraerImagenDirecta(
    $,
    elemento
) {

    if (!elemento) {
        return null;
    }


    const $elemento =
        $(elemento);


    // --------------------------------------------------------
    // IMG
    // --------------------------------------------------------

    const imagenes = [];


    $elemento
        .find("img")
        .each((_, img) => {

            const $img =
                $(img);


            const atributos = [

                $img.attr("src"),

                $img.attr("data-src"),

                $img.attr("data-original"),

                $img.attr("data-image"),

                $img.attr("data-img"),

                $img.attr("data-url"),

                $img.attr("data-lazy-src")

            ];


            for (
                const atributo of atributos
            ) {

                const url =
                    obtenerUrlDesdeAtributo(
                        atributo
                    );


                if (
                    url &&
                    !esAvatarTwitch(url)
                ) {

                    imagenes.push(url);
                }
            }


            const srcset =
                $img.attr("srcset");


            if (srcset) {

                for (
                    const parte of srcset.split(",")
                ) {

                    const url =
                        obtenerUrlDesdeAtributo(
                            parte
                                .trim()
                                .split(/\s+/)[0]
                        );


                    if (
                        url &&
                        !esAvatarTwitch(url)
                    ) {

                        imagenes.push(url);
                    }
                }
            }

        });


    // --------------------------------------------------------
    // VIDEO POSTER
    // --------------------------------------------------------

    $elemento
        .find("video")
        .each((_, video) => {

            const $video =
                $(video);


            const poster =
                $video.attr("poster") ||
                $video.attr("data-poster");


            const url =
                obtenerUrlDesdeAtributo(
                    poster
                );


            if (
                url &&
                !esAvatarTwitch(url)
            ) {

                imagenes.push(url);
            }
        });


    // --------------------------------------------------------
    // SOURCE
    // --------------------------------------------------------

    $elemento
        .find("source")
        .each((_, source) => {

            const $source =
                $(source);


            const atributos = [

                $source.attr("src"),

                $source.attr("data-src"),

                $source.attr("poster")

            ];


            for (
                const atributo of atributos
            ) {

                const url =
                    obtenerUrlDesdeAtributo(
                        atributo
                    );


                if (
                    url &&
                    !esAvatarTwitch(url)
                ) {

                    imagenes.push(url);
                }
            }
        });


    // --------------------------------------------------------
    // BACKGROUND
    // --------------------------------------------------------

    $elemento
        .find("[style]")
        .each((_, nodo) => {

            const style =
                $(nodo)
                    .attr("style") ||
                "";


            const matches =
                style.match(
                    /url\((['"]?)(.*?)\1\)/gi
                );


            if (!matches) {
                return;
            }


            for (
                const match of matches
            ) {

                const encontrado =
                    match.match(
                        /url\((['"]?)(.*?)\1\)/i
                    );


                if (!encontrado) {
                    continue;
                }


                const url =
                    obtenerUrlDesdeAtributo(
                        encontrado[2]
                    );


                if (
                    url &&
                    !esAvatarTwitch(url)
                ) {

                    imagenes.push(url);
                }
            }
        });


    return imagenes[0] || null;
}


// ============================================================
// EXTRAER IMAGEN ASOCIADA A NOMBRE
// ============================================================
//
// Busca primero atributos que explícitamente describan
// el objeto.
//
// NO toma cualquier imagen del documento.
// ============================================================

function buscarImagenPorNombre(
    $,
    nombre
) {

    const clave =
        normalizarClave(nombre);


    if (!clave) {
        return null;
    }


    // --------------------------------------------------------
    // Mapeo conocido
    // --------------------------------------------------------

    const conocida =
        imagenConocidaPorNombre(
            nombre
        );


    if (conocida) {
        return conocida;
    }


    // --------------------------------------------------------
    // Elementos que contienen nombre del item
    // --------------------------------------------------------

    const selectores = [

        "[data-name]",

        "[data-item]",

        "[data-reward]",

        "[data-drop]",

        "[data-item-name]",

        "[data-reward-name]",

        "[aria-label]",

        "[title]",

        "[alt]"

    ];


    for (
        const selector of selectores
    ) {

        let encontrada = null;


        $(selector)
            .each((_, nodo) => {

                if (encontrada) {
                    return;
                }


                const $nodo =
                    $(nodo);


                const valores = [

                    $nodo.attr(
                        "data-name"
                    ),

                    $nodo.attr(
                        "data-item"
                    ),

                    $nodo.attr(
                        "data-reward"
                    ),

                    $nodo.attr(
                        "data-drop"
                    ),

                    $nodo.attr(
                        "data-item-name"
                    ),

                    $nodo.attr(
                        "data-reward-name"
                    ),

                    $nodo.attr(
                        "aria-label"
                    ),

                    $nodo.attr(
                        "title"
                    ),

                    $nodo.attr(
                        "alt"
                    )

                ]
                    .filter(Boolean)
                    .map(normalizarClave);


                const coincide =
                    valores.some(
                        valor =>
                            valor === clave ||
                            valor.includes(clave) ||
                            clave.includes(valor)
                    );


                if (!coincide) {
                    return;
                }


                encontrada =
                    extraerImagenDirecta(
                        $,
                        nodo
                    );

            });


        if (encontrada) {
            return encontrada;
        }
    }


    return null;
}


// ============================================================
// TEXTOS INVÁLIDOS
// ============================================================

const TEXTOS_INVALIDOS_DROP =
    new Set([

        "general drops",

        "streamer drops",

        "drops metrics",

        "current campaign statistics",

        "what's available to unlock by watching specific streamers.",

        "what's available to unlock by watching specific streamers",

        "available across all drops enabled rust twitch streams",

        "sort by",

        "online",

        "random",

        "getting drops",

        "how it works",

        "drops claimed",

        "participating players",

        "upcoming",

        "live now",

        "watching",

        "watch rust",

        "rust"

    ]);


// ============================================================
// VALIDAR NOMBRE DROP
// ============================================================

function esNombreDropValido(
    nombre,
    streamer = null
) {

    const limpio =
        normalizarTexto(nombre);


    if (!limpio) {
        return false;
    }


    const clave =
        normalizarClave(limpio);


    if (
        TEXTOS_INVALIDOS_DROP.has(
            clave
        )
    ) {

        return false;
    }


    if (
        limpio.length < 2 ||
        limpio.length > 80
    ) {

        return false;
    }


    if (
        /\d+\s*(hours?|hrs?|minutes?|mins?|h|m)\b/i
            .test(limpio)
    ) {

        return false;
    }


    if (
        /^what'?s\b/i.test(limpio)
    ) {

        return false;
    }


    if (
        /^available\b/i.test(limpio)
    ) {

        return false;
    }


    if (
        /^watch\b/i.test(limpio)
    ) {

        return false;
    }


    if (
        /^sort\b/i.test(limpio)
    ) {

        return false;
    }


    if (
        /^getting\b/i.test(limpio)
    ) {

        return false;
    }


    if (
        streamer &&
        normalizarClave(limpio) ===
        normalizarClave(
            streamer
        )
    ) {

        return false;
    }


    return true;
}


// ============================================================
// TEXTO PROPIO DE ELEMENTO
// ============================================================

function obtenerTextoPropio(
    $,
    nodo
) {

    if (!nodo) {
        return "";
    }


    return normalizarTexto(
        $(nodo)
            .clone()
            .children()
            .remove()
            .end()
            .text()
    );
}


// ============================================================
// EXTRAER DURACIÓN
// ============================================================

function extraerDuracion(
    texto
) {

    const limpio =
        normalizarTexto(texto);


    let match =
        limpio.match(
            /(\d+)\s*(?:hours?|hrs?|h)\b/i
        );


    if (match) {

        const horas =
            Number(match[1]);


        return {

            minutos:
                horas * 60,

            texto:
                `${horas} ${horas === 1 ? "Hora" : "Horas"}`
        };
    }


    match =
        limpio.match(
            /(\d+)\s*(?:minutes?|mins?|m)\b/i
        );


    if (match) {

        const minutos =
            Number(match[1]);


        return {

            minutos,

            texto:
                `${minutos} ${minutos === 1 ? "minuto" : "minutos"}`
        };
    }


    return {

        minutos: null,

        texto: null
    };
}


// ============================================================
// EXTRAER NOMBRE DROP DE UN CONTENEDOR
// ============================================================

function extraerNombreDesdeContenedor(
    $,
    contenedor,
    streamer = null
) {

    if (!contenedor) {
        return null;
    }


    // --------------------------------------------------------
    // 1. Atributos semánticos
    // --------------------------------------------------------

    const selectores =
        [

            "[data-name]",

            "[data-item]",

            "[data-reward]",

            "[data-drop]",

            "[data-item-name]",

            "[data-reward-name]",

            ".reward-name",

            ".item-name",

            ".drop-name",

            "h3",

            "h4",

            "h5"

        ];


    for (
        const selector of selectores
    ) {

        let encontrado = null;


        $(contenedor)
            .find(selector)
            .each((_, nodo) => {

                if (encontrado) {
                    return;
                }


                const $nodo =
                    $(nodo);


                const candidatos = [

                    $nodo.attr(
                        "data-name"
                    ),

                    $nodo.attr(
                        "data-item"
                    ),

                    $nodo.attr(
                        "data-reward"
                    ),

                    $nodo.attr(
                        "data-drop"
                    ),

                    $nodo.attr(
                        "data-item-name"
                    ),

                    $nodo.attr(
                        "data-reward-name"
                    ),

                    obtenerTextoPropio(
                        $,
                        nodo
                    )

                ]
                    .filter(Boolean);


                for (
                    const candidato of candidatos
                ) {

                    if (
                        esNombreDropValido(
                            candidato,
                            streamer
                        )
                    ) {

                        encontrado =
                            normalizarTexto(
                                candidato
                            );

                        break;
                    }
                }

            });


        if (encontrado) {
            return encontrado;
        }
    }


    // --------------------------------------------------------
    // 2. Buscar elementos de texto pequeños
    // --------------------------------------------------------

    const candidatos = [];


    $(contenedor)
        .find(
            "span,div,a,strong,b,p"
        )
        .each((_, nodo) => {

            const texto =
                obtenerTextoPropio(
                    $,
                    nodo
                );


            if (
                !esNombreDropValido(
                    texto,
                    streamer
                )
            ) {
                return;
            }


            // No aceptar textos que sean claramente
            // una frase descriptiva.
            if (
                texto.split(" ").length > 8
            ) {
                return;
            }


            candidatos.push({
                texto,
                longitud:
                    texto.length
            });

        });


    candidatos.sort(
        (a, b) =>
            a.longitud -
            b.longitud
    );


    if (
        candidatos.length
    ) {

        return candidatos[0].texto;
    }


    return null;
}


// ============================================================
// BUSCAR CONTENEDOR PEQUEÑO CON DURACIÓN
// ============================================================
//
// A diferencia del parser anterior:
//
// NO subimos 6 niveles automáticamente.
// Primero buscamos el contenedor más pequeño que:
//
// - tenga duración
// - no sea enorme
// - tenga estructura de drop
// ============================================================

function encontrarContenedorPequeno(
    $,
    nodo
) {

    if (!nodo) {
        return null;
    }


    let actual =
        $(nodo);


    for (
        let nivel = 0;
        nivel < 8;
        nivel++
    ) {

        if (
            !actual ||
            !actual.length
        ) {
            break;
        }


        const texto =
            normalizarTexto(
                actual.text()
            );


        const duracion =
            extraerDuracion(
                texto
            );


        if (
            duracion.minutos &&
            texto.length >= 5 &&
            texto.length <= 450
        ) {

            return actual[0];
        }


        actual =
            actual.parent();
    }


    return null;
}


// ============================================================
// STREAMER DESDE CONTENEDOR
// ============================================================

function extraerStreamerDesdeContenedor(
    $,
    contenedor
) {

    if (!contenedor) {
        return null;
    }


    let resultado = null;


    $(contenedor)
        .find("a[href]")
        .each((_, enlace) => {

            if (resultado) {
                return;
            }


            const href =
                $(enlace)
                    .attr("href") ||
                "";


            const match =
                href.match(
                    /^https?:\/\/(?:www\.)?twitch\.tv\/([^/?#]+)\/?$/i
                );


            if (!match) {
                return;
            }


            const login =
                match[1];


            if (
                [
                    "directory",
                    "videos",
                    "search",
                    "downloads",
                    "settings",
                    "p",
                    "subscriptions"
                ].includes(
                    login.toLowerCase()
                )
            ) {

                return;
            }


            const displayName =
                normalizarTexto(
                    $(enlace).text()
                ) ||
                login;


            resultado = {

                login,

                displayName,

                url:
                    `https://www.twitch.tv/${login}`
            };

        });


    return resultado;
}


// ============================================================
// EXTRAER DROP DESDE CONTENEDOR
// ============================================================

function extraerDatosDeContenedor(
    $,
    contenedor,
    tipo
) {

    if (!contenedor) {
        return null;
    }


    const texto =
        normalizarTexto(
            $(contenedor).text()
        );


    const duracion =
        extraerDuracion(
            texto
        );


    if (
        !duracion.minutos
    ) {

        return null;
    }


    const streamer =
        tipo === "streamer"
            ? extraerStreamerDesdeContenedor(
                $,
                contenedor
            )
            : null;


    const nombre =
        extraerNombreDesdeContenedor(
            $,
            contenedor,
            streamer?.displayName ||
            streamer?.login ||
            null
        );


    if (
        !esNombreDropValido(
            nombre,
            streamer?.displayName
        )
    ) {

        return null;
    }


    let imagen = null;


    // --------------------------------------------------------
    // Primero imagen asociada al nombre
    // --------------------------------------------------------

    imagen =
        buscarImagenPorNombre(
            $,
            nombre
        );


    // --------------------------------------------------------
    // Si no existe, buscar SOLO en elementos semánticos
    // del propio contenedor.
    // --------------------------------------------------------

    if (!imagen) {

        const candidatosImagen =
            $(
                contenedor
            ).find(
                "[data-name], [data-item], [data-reward], [data-drop], [alt], [title]"
            );


        candidatosImagen.each(
            (_, nodo) => {

                if (imagen) {
                    return;
                }


                const $nodo =
                    $(nodo);


                const atributos = [

                    $nodo.attr(
                        "data-name"
                    ),

                    $nodo.attr(
                        "data-item"
                    ),

                    $nodo.attr(
                        "data-reward"
                    ),

                    $nodo.attr(
                        "data-drop"
                    ),

                    $nodo.attr(
                        "alt"
                    ),

                    $nodo.attr(
                        "title"
                    )

                ]
                    .filter(Boolean)
                    .map(normalizarClave);


                const claveNombre =
                    normalizarClave(
                        nombre
                    );


                const coincide =
                    atributos.some(
                        atributo =>
                            atributo ===
                                claveNombre ||
                            atributo.includes(
                                claveNombre
                            ) ||
                            claveNombre.includes(
                                atributo
                            )
                    );


                if (!coincide) {
                    return;
                }


                imagen =
                    extraerImagenDirecta(
                        $,
                        nodo
                    );
            }
        );
    }


    // --------------------------------------------------------
    // Mapeo conocido
    // --------------------------------------------------------

    if (!imagen) {

        imagen =
            imagenConocidaPorNombre(
                nombre
            );
    }


    // --------------------------------------------------------
    // Nunca avatar
    // --------------------------------------------------------

    if (
        imagen &&
        esAvatarTwitch(imagen)
    ) {

        imagen = null;
    }


    return {

        tipo,

        nombre,

        minutos:
            duracion.minutos,

        duracion:
            duracion.texto,

        imagen,

        streamer
    };
}


// ============================================================
// GENERAL DROPS
// ============================================================

function extraerGeneralDrops(
    $
) {

    const drops = [];

    const vistos =
        new Set();


    // --------------------------------------------------------
    // Buscamos nodos que tengan una duración en texto propio.
    // --------------------------------------------------------

    const nodosDuracion = [];


    $("body *")
        .each((_, nodo) => {

            const propio =
                obtenerTextoPropio(
                    $,
                    nodo
                );


            if (!propio) {
                return;
            }


            const duracion =
                extraerDuracion(
                    propio
                );


            if (
                !duracion.minutos
            ) {
                return;
            }


            if (
                propio.length > 100
            ) {
                return;
            }


            nodosDuracion.push(
                nodo
            );
        });


    for (
        const nodo of nodosDuracion
    ) {

        const contenedor =
            encontrarContenedorPequeno(
                $,
                nodo
            );


        if (!contenedor) {
            continue;
        }


        const datos =
            extraerDatosDeContenedor(
                $,
                contenedor,
                "general"
            );


        if (!datos) {
            continue;
        }


        const clave =
            [
                normalizarClave(
                    datos.nombre
                ),
                datos.minutos
            ].join("|");


        if (
            vistos.has(clave)
        ) {
            continue;
        }


        vistos.add(clave);


        drops.push({

            tipo:
                "general",

            nombre:
                datos.nombre,

            duracion:
                datos.duracion,

            minutos:
                datos.minutos,

            imagen:
                datos.imagen || null
        });
    }


    return deduplicarDrops(
        drops
    );
}


// ============================================================
// STREAMER DROPS
// ============================================================

function extraerStreamerDrops(
    $
) {

    const drops = [];

    const vistos =
        new Set();


    // --------------------------------------------------------
    // Localizar links reales de Twitch
    // --------------------------------------------------------

    $("a[href]")
        .each((_, enlace) => {

            const href =
                $(enlace)
                    .attr("href") ||
                "";


            const match =
                href.match(
                    /^https?:\/\/(?:www\.)?twitch\.tv\/([^/?#]+)\/?$/i
                );


            if (!match) {
                return;
            }


            const login =
                match[1];


            if (
                [
                    "directory",
                    "videos",
                    "search",
                    "downloads",
                    "settings",
                    "subscriptions"
                ].includes(
                    login.toLowerCase()
                )
            ) {

                return;
            }


            // ------------------------------------------------
            // Encontrar contenedor pequeño
            // ------------------------------------------------

            const contenedor =
                encontrarContenedorPequeno(
                    $,
                    enlace
                );


            if (!contenedor) {
                return;
            }


            const texto =
                normalizarTexto(
                    $(contenedor).text()
                );


            const duracion =
                extraerDuracion(
                    texto
                );


            if (
                !duracion.minutos
            ) {
                return;
            }


            const streamer =
                {

                    login,

                    displayName:
                        normalizarTexto(
                            $(enlace).text()
                        ) ||
                        login,

                    url:
                        `https://www.twitch.tv/${login}`
                };


            // ------------------------------------------------
            // Buscar nombre evitando el enlace del streamer
            // ------------------------------------------------

            let nombre = null;


            // 1. atributos específicos
            const selectoresNombre = [

                "[data-name]",

                "[data-item]",

                "[data-reward]",

                "[data-drop]",

                "[data-item-name]",

                "[data-reward-name]",

                ".reward-name",

                ".item-name",

                ".drop-name",

                "h3",

                "h4",

                "h5"

            ];


            for (
                const selector of selectoresNombre
            ) {

                if (nombre) {
                    break;
                }


                $(contenedor)
                    .find(selector)
                    .each((_, nodo) => {

                        if (nombre) {
                            return;
                        }


                        if (
                            nodo === enlace
                        ) {
                            return;
                        }


                        const $nodo =
                            $(nodo);


                        const candidatos = [

                            $nodo.attr(
                                "data-name"
                            ),

                            $nodo.attr(
                                "data-item"
                            ),

                            $nodo.attr(
                                "data-reward"
                            ),

                            $nodo.attr(
                                "data-drop"
                            ),

                            $nodo.attr(
                                "data-item-name"
                            ),

                            $nodo.attr(
                                "data-reward-name"
                            ),

                            obtenerTextoPropio(
                                $,
                                nodo
                            )

                        ]
                            .filter(Boolean);


                        for (
                            const candidato of candidatos
                        ) {

                            if (
                                esNombreDropValido(
                                    candidato,
                                    streamer.displayName
                                )
                            ) {

                                nombre =
                                    normalizarTexto(
                                        candidato
                                    );

                                break;
                            }
                        }
                    });
            }


            // ------------------------------------------------
            // 2. Buscar textos pequeños
            // ------------------------------------------------

            if (!nombre) {

                const candidatos = [];


                $(contenedor)
                    .find(
                        "span,div,a,strong,b,p"
                    )
                    .each((_, nodo) => {

                        if (
                            nodo === enlace
                        ) {
                            return;
                        }


                        const textoNodo =
                            obtenerTextoPropio(
                                $,
                                nodo
                            );


                        if (
                            !esNombreDropValido(
                                textoNodo,
                                streamer.displayName
                            )
                        ) {
                            return;
                        }


                        // Evitar frases largas
                        if (
                            textoNodo.split(" ").length >
                            6
                        ) {
                            return;
                        }


                        candidatos.push(
                            {
                                texto:
                                    textoNodo,

                                longitud:
                                    textoNodo.length
                            }
                        );
                    });


                candidatos.sort(
                    (a, b) =>
                        a.longitud -
                        b.longitud
                );


                if (
                    candidatos[0]
                ) {

                    nombre =
                        candidatos[0].texto;
                }
            }


            // ------------------------------------------------
            // Fallback actual Facepunch:
            //
            // TwitchRivals -> Backpack
            // ------------------------------------------------

            if (
                !nombre &&
                normalizarClave(
                    login
                ) ===
                "twitchrivals"
            ) {

                nombre =
                    "Backpack";
            }


            if (
                !esNombreDropValido(
                    nombre,
                    streamer.displayName
                )
            ) {

                return;
            }


            // ------------------------------------------------
            // Imagen
            // ------------------------------------------------

            let imagen =
                buscarImagenPorNombre(
                    $,
                    nombre
                );


            // ------------------------------------------------
            // IMPORTANTE:
            //
            // NO buscamos la primera imagen del contenedor.
            //
            // Eso era lo que provocaba TwitchRivals.
            // ------------------------------------------------

            if (
                imagen &&
                esAvatarTwitch(imagen)
            ) {

                imagen = null;
            }


            // ------------------------------------------------
            // Imagen conocida
            // ------------------------------------------------

            if (!imagen) {

                imagen =
                    imagenConocidaPorNombre(
                        nombre
                    );
            }


            // ------------------------------------------------
            // Backpack conocido
            // ------------------------------------------------

            const nombreClave =
                normalizarClave(
                    nombre
                );


            if (
                nombreClave ===
                    "backpack" ||
                nombreClave ===
                    "small backpack"
            ) {

                imagen =
                    DROP_IMAGENES_CONOCIDAS[
                        nombreClave
                    ] ||
                    DROP_IMAGENES_CONOCIDAS[
                        "backpack"
                    ];
            }


            const clave =
                [
                    login.toLowerCase(),

                    nombreClave,

                    duracion.minutos
                ].join("|");


            if (
                vistos.has(clave)
            ) {
                return;
            }


            vistos.add(clave);


            drops.push({

                tipo:
                    "streamer",

                nombre,

                duracion:
                    duracion.texto,

                minutos:
                    duracion.minutos,

                imagen:
                    imagen || null,

                streamer
            });

        });


    return deduplicarDrops(
        drops
    );
}


// ============================================================
// CORREGIR STREAMER DROPS
// ============================================================

function corregirStreamerDrops(
    drops
) {

    return (drops || [])
        .map(drop => {

            if (
                !drop?.streamer
            ) {
                return null;
            }


            let nombre =
                normalizarTexto(
                    drop.nombre
                );


            const login =
                normalizarClave(
                    drop.streamer.login
                );


            // ------------------------------------------------
            // Nunca permitir descripción de Facepunch
            // ------------------------------------------------

            if (
                !esNombreDropValido(
                    nombre,
                    drop.streamer.displayName
                )
            ) {

                if (
                    login ===
                    "twitchrivals"
                ) {

                    nombre =
                        "Backpack";
                }
            }


            // ------------------------------------------------
            // Imagen segura
            // ------------------------------------------------

            let imagen =
                drop.imagen;


            if (
                imagen &&
                esAvatarTwitch(imagen)
            ) {

                imagen = null;
            }


            if (!imagen) {

                imagen =
                    imagenConocidaPorNombre(
                        nombre
                    );
            }


            return {

                ...drop,

                nombre,

                imagen:
                    imagen || null
            };

        })
        .filter(Boolean);
}


// ============================================================
// FECHAS
// ============================================================

const MESES = {

    january: 0,
    february: 1,
    march: 2,
    april: 3,
    may: 4,
    june: 5,
    july: 6,
    august: 7,
    september: 8,
    october: 9,
    november: 10,
    december: 11
};


function parsearFechaFacepunch(
    valor
) {

    if (!valor) {
        return null;
    }


    const texto =
        normalizarTexto(
            valor
        );


    const match =
        texto.match(
            /^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)\s+(UTC|GMT)$/i
        );


    if (match) {

        const mes =
            MESES[
                match[1].toLowerCase()
            ];


        if (
            mes === undefined
        ) {

            return null;
        }


        let hora =
            Number(match[4]);


        const minuto =
            Number(match[5]);


        const ampm =
            match[6].toUpperCase();


        if (
            ampm === "PM" &&
            hora !== 12
        ) {

            hora += 12;
        }


        if (
            ampm === "AM" &&
            hora === 12
        ) {

            hora = 0;
        }


        return new Date(
            Date.UTC(
                Number(match[3]),
                mes,
                Number(match[2]),
                hora,
                minuto
            )
        );
    }


    const fecha =
        new Date(texto);


    if (
        !Number.isNaN(
            fecha.getTime()
        )
    ) {

        return fecha;
    }


    return null;
}


function formatearFechaDiscord(
    fecha
) {

    if (!fecha) {
        return null;
    }


    const timestamp =
        Math.floor(
            fecha.getTime() / 1000
        );


    return `<t:${timestamp}:F>`;
}


// ============================================================
// CAMPAÑA
// ============================================================

function extraerInformacionCampana(
    $
) {

    const body =
        normalizarTexto(
            $("body").text()
        );


    let titulo = null;
    let tema = null;
    let inicio = null;
    let final = null;


    // --------------------------------------------------------
    // Título
    // --------------------------------------------------------

    const tituloMatch =
        body.match(
            /Twitch Drops\s+Round\s+\d+(?:\s+Hosted by\s+[A-Za-z0-9 _.'-]+)?/i
        );


    if (tituloMatch) {

        titulo =
            normalizarTexto(
                tituloMatch[0]
            );
    }


    // --------------------------------------------------------
    // Tema
    // --------------------------------------------------------

    if (titulo) {

        const indice =
            body.toLowerCase()
                .indexOf(
                    titulo.toLowerCase()
                );


        if (
            indice >= 0
        ) {

            const despues =
                body.slice(
                    indice +
                    titulo.length
                );


            const bloque =
                despues.match(
                    /^(.{1,100}?)(?=[A-Z][a-z]+\s+\d{1,2},\s+\d{4}\s+at|General Drops|Streamer Drops)/i
                );


            if (bloque) {

                const candidato =
                    normalizarTexto(
                        bloque[1]
                    );


                if (
                    candidato.length >= 2 &&
                    candidato.length <= 80
                ) {

                    tema =
                        candidato;
                }
            }
        }
    }


    // --------------------------------------------------------
    // Fallback de temas conocidos
    // --------------------------------------------------------

    if (!tema) {

        const posibles = [

            "Base Invaders",

            "Rust Isles",

            "Global Warfare",

            "Rust Charity",

            "Home Brewed"

        ];


        for (
            const posible of posibles
        ) {

            if (
                body
                    .toLowerCase()
                    .includes(
                        posible.toLowerCase()
                    )
            ) {

                tema =
                    posible;

                break;
            }
        }
    }


    // --------------------------------------------------------
    // Fechas
    // --------------------------------------------------------

    const fechaRegex =
        /([A-Za-z]+)\s+\d{1,2},\s+\d{4}\s+at\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s+(?:UTC|GMT)/gi;


    const fechas =
        body.match(
            fechaRegex
        ) || [];


    if (
        fechas[0]
    ) {

        inicio =
            parsearFechaFacepunch(
                fechas[0]
            );
    }


    if (
        fechas[1]
    ) {

        final =
            parsearFechaFacepunch(
                fechas[1]
            );
    }


    // --------------------------------------------------------
    // Estado
    // --------------------------------------------------------

    let estado =
        "unknown";


    const bodyLower =
        body.toLowerCase();


    if (
        bodyLower.includes(
            "live now"
        )
    ) {

        estado =
            "live";
    }


    if (
        bodyLower.includes(
            "upcoming"
        )
    ) {

        estado =
            "upcoming";
    }


    return {

        titulo,

        tema,

        inicio,

        final,

        estado
    };
}


// ============================================================
// PARSER COMPLETO
// ============================================================

function parsearHtmlFacepunch(
    html
) {

    if (!html) {
        return null;
    }


    const $ =
        cheerio.load(
            html,
            {
                decodeEntities: true
            }
        );


    const campaign =
        extraerInformacionCampana(
            $
        );


    let generalDrops =
        extraerGeneralDrops(
            $
        );


    let streamerDrops =
        extraerStreamerDrops(
            $
        );


    streamerDrops =
        corregirStreamerDrops(
            streamerDrops
        );


    generalDrops =
        deduplicarDrops(
            generalDrops
        );


    streamerDrops =
        deduplicarDrops(
            streamerDrops
        );


    return {

        campaign,

        generalDrops,

        streamerDrops,

        html
    };
}


// ============================================================
// DEDUPLICAR
// ============================================================

function deduplicarDrops(
    drops
) {

    const mapa =
        new Map();


    for (
        const drop of drops || []
    ) {

        if (!drop) {
            continue;
        }


        const streamer =
            drop.streamer?.login ||
            "";


        const clave =
            [
                drop.tipo,

                normalizarClave(
                    drop.nombre
                ),

                drop.minutos,

                String(
                    streamer
                ).toLowerCase()
            ].join("|");


        if (
            !mapa.has(clave)
        ) {

            mapa.set(
                clave,
                drop
            );
        }
    }


    return [
        ...mapa.values()
    ];
}


// ============================================================
// PUPPETEER
// ============================================================

async function cerrarBrowser() {

    try {

        if (browser) {

            await browser.close();
        }

    } catch {
        // ignorar
    }


    browser = null;

    browserPage = null;
}


async function obtenerHtmlConPuppeteer() {

    if (!puppeteer) {
        return null;
    }


    if (
        facepunchCache.html &&
        Date.now() -
        facepunchCache.timestamp <
        FACEPUNCH_CACHE_MS
    ) {

        return facepunchCache.html;
    }


    if (renderPromise) {

        return renderPromise;
    }


    renderPromise =
        (async () => {

            try {

                if (!browser) {

                    browser =
                        await puppeteer.launch({

                            headless:
                                true,

                            args: [

                                "--no-sandbox",

                                "--disable-setuid-sandbox",

                                "--disable-dev-shm-usage",

                                "--disable-gpu"
                            ]
                        });
                }


                if (!browserPage) {

                    browserPage =
                        await browser.newPage();


                    await browserPage.setUserAgent(
                        FACEPUNCH_HEADERS[
                            "User-Agent"
                        ]
                    );


                    await browserPage.setViewport({

                        width:
                            1440,

                        height:
                            1200
                    });
                }


                await browserPage.goto(
                    FACEPUNCH_GAME_URL,
                    {

                        waitUntil:
                            "networkidle2",

                        timeout:
                            REQUEST_TIMEOUT
                    }
                );


                await browserPage.waitForFunction(
                    () => {

                        const texto =
                            document.body?.innerText ||
                            "";


                        return (

                            texto.includes(
                                "General Drops"
                            ) ||

                            texto.includes(
                                "Streamer Drops"
                            )
                        );

                    },
                    {

                        timeout:
                            15000
                    }
                ).catch(() => {});


                await new Promise(
                    resolve =>
                        setTimeout(
                            resolve,
                            1500
                        )
                );


                const html =
                    await browserPage.content();


                if (html) {

                    facepunchCache = {

                        html,

                        timestamp:
                            Date.now()
                    };
                }


                return html;

            } catch (error) {

                console.error(
                    "[Twitch Drops] Error Puppeteer:",
                    error.message
                );


                await cerrarBrowser();


                return null;

            } finally {

                renderPromise =
                    null;
            }

        })();


    return renderPromise;
}


// ============================================================
// OBTENER DROPS FACEPUNCH
// ============================================================

async function obtenerDropsFacepunch() {

    // --------------------------------------------------------
    // Axios
    // --------------------------------------------------------

    try {

        const response =
            await axios.get(
                FACEPUNCH_DROPS_URL,
                {

                    headers:
                        FACEPUNCH_HEADERS,

                    timeout:
                        REQUEST_TIMEOUT
                }
            );


        const resultado =
            parsearHtmlFacepunch(
                response.data
            );


        if (
            resultado &&
            (
                resultado.generalDrops.length > 0 ||
                resultado.streamerDrops.length > 0
            )
        ) {

            facepunchCache = {

                html:
                    response.data,

                timestamp:
                    Date.now()
            };


            return resultado;
        }

    } catch (error) {

        console.error(
            "[Twitch Drops] Axios error:",
            error.message
        );
    }


    // --------------------------------------------------------
    // Puppeteer
    // --------------------------------------------------------

    const html =
        await obtenerHtmlConPuppeteer();


    if (!html) {

        return null;
    }


    return parsearHtmlFacepunch(
        html
    );
}


// ============================================================
// TWITCH TOKEN
// ============================================================

async function obtenerTwitchToken() {

    const clientId =
        process.env.TWITCH_CLIENT_ID;

    const clientSecret =
        process.env.TWITCH_CLIENT_SECRET;


    if (
        !clientId ||
        !clientSecret
    ) {

        return null;
    }


    try {

        const response =
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
                        REQUEST_TIMEOUT
                }
            );


        return (
            response.data?.access_token ||
            null
        );

    } catch (error) {

        console.error(
            "[Twitch Drops] Error obteniendo token Twitch:",
            error.response?.data ||
            error.message
        );


        return null;
    }
}


// ============================================================
// STREAMS RUST
// ============================================================

async function obtenerStreamsRust() {

    const ahora =
        Date.now();


    if (
        twitchStreamsCache.data.length &&
        ahora -
        twitchStreamsCache.timestamp <
        TWITCH_STREAM_CACHE_MS
    ) {

        return twitchStreamsCache.data;
    }


    const token =
        await obtenerTwitchToken();


    if (!token) {

        return [];
    }


    try {

        const streams = [];

        let cursor = null;


        for (
            let pagina = 0;
            pagina < 5;
            pagina++
        ) {

            const params = {

                game_id:
                    TWITCH_GAME_ID,

                type:
                    "live",

                first:
                    100
            };


            if (cursor) {

                params.after =
                    cursor;
            }


            const response =
                await axios.get(
                    `${TWITCH_API}/streams`,
                    {

                        headers: {

                            "Client-ID":
                                process.env.TWITCH_CLIENT_ID,

                            "Authorization":
                                `Bearer ${token}`
                        },

                        params,

                        timeout:
                            REQUEST_TIMEOUT
                    }
                );


            const data =
                response.data;


            const items =
                data?.data ||
                [];


            streams.push(
                ...items
            );


            cursor =
                data?.pagination?.cursor ||
                null;


            if (
                !cursor ||
                items.length < 100
            ) {

                break;
            }
        }


        twitchStreamsCache = {

            data:
                streams,

            timestamp:
                Date.now()
        };


        return streams;

    } catch (error) {

        console.error(
            "[Twitch Drops] Error consultando streams Rust:",
            error.response?.data ||
            error.message
        );


        return [];
    }
}


// ============================================================
// ESTADO STREAMER
// ============================================================

async function obtenerEstadoStreamer(
    login
) {

    if (!login) {

        return {

            online:
                false,

            stream:
                null
        };
    }


    const streams =
        await obtenerStreamsRust();


    const encontrado =
        streams.find(
            stream =>
                String(
                    stream.user_login
                ).toLowerCase() ===
                String(
                    login
                ).toLowerCase()
        );


    return {

        online:
            Boolean(
                encontrado
            ),

        stream:
            encontrado ||
            null
    };
}


// ============================================================
// MAPA STREAMERS ONLINE
// ============================================================

async function obtenerMapaStreamersOnline(
    drops
) {

    const logins =
        [
            ...new Set(
                (drops || [])
                    .filter(
                        drop =>
                            drop.streamer?.login
                    )
                    .map(
                        drop =>
                            drop.streamer.login
                    )
            )
        ];


    const mapa =
        new Map();


    if (!logins.length) {

        return mapa;
    }


    const streams =
        await obtenerStreamsRust();


    for (
        const login of logins
    ) {

        const stream =
            streams.find(
                item =>
                    String(
                        item.user_login
                    ).toLowerCase() ===
                    String(
                        login
                    ).toLowerCase()
            );


        mapa.set(
            login.toLowerCase(),
            {

                online:
                    Boolean(stream),

                stream:
                    stream ||
                    null
            }
        );
    }


    return mapa;
}


// ============================================================
// EMBED CAMPAÑA
// ============================================================

function crearEmbedCampana(
    datos
) {

    const campaign =
        datos.campaign ||
        {};


    let estadoTexto =
        "⚪ Desconocido";


    let color =
        0x5865F2;


    if (
        campaign.estado ===
        "live"
    ) {

        estadoTexto =
            "🟢 En vivo";

        color =
            0x57F287;
    }


    if (
        campaign.estado ===
        "upcoming"
    ) {

        estadoTexto =
            "🟡 Próximamente";

        color =
            0xFEE75C;
    }


    const embed =
        new EmbedBuilder()
            .setColor(
                color
            )
            .setTitle(
                "🎁 RUST TWITCH DROPS"
            )
            .setURL(
                FACEPUNCH_GAME_URL
            );


    if (
        campaign.titulo
    ) {

        embed.setDescription(
            `**${campaign.titulo}**`
        );
    }


    if (
        campaign.tema
    ) {

        embed.addFields({

            name:
                "🎨 Campaña",

            value:
                campaign.tema,

            inline:
                true
        });
    }


    embed.addFields({

        name:
            "📊 Estado",

        value:
            estadoTexto,

        inline:
            true
    });


    if (
        campaign.inicio
    ) {

        embed.addFields({

            name:
                "🗓️ Inicio",

            value:
                formatearFechaDiscord(
                    campaign.inicio
                ),

            inline:
                true
        });
    }


    if (
        campaign.final
    ) {

        embed.addFields({

            name:
                "⏰ Final",

            value:
                formatearFechaDiscord(
                    campaign.final
                ),

            inline:
                true
        });
    }


    embed.setFooter({

        text:
            "RustLogix • Twitch Drops"
    });


    return embed;
}


// ============================================================
// EMBED GENERAL
// ============================================================

function crearEmbedGeneralDrop(
    drop
) {

    const embed =
        new EmbedBuilder()
            .setColor(
                0x9146FF
            )
            .setTitle(
                `🎁 ${drop.nombre}`
            )
            .setDescription(
                `⏱️ **Tiempo necesario:** ${drop.duracion}`
            )
            .setURL(
                FACEPUNCH_GAME_URL
            );


    if (
        drop.imagen
    ) {

        embed.setThumbnail(
            drop.imagen
        );
    }


    embed.setFooter({

        text:
            "Drop general • Disponible viendo streams de Rust con Drops Enabled"
    });


    return embed;
}


// ============================================================
// EMBED STREAMER DROP
// ============================================================

function crearEmbedStreamerDrop(
    drop,
    estado
) {

    const streamer =
        drop.streamer;


    const online =
        Boolean(
            estado?.online
        );


    const embed =
        new EmbedBuilder()
            .setColor(
                online
                    ? 0x57F287
                    : 0x9146FF
            )
            .setTitle(
                `🎯 ${drop.nombre}`
            )
            .setDescription(
                [

                    `⏱️ **Tiempo necesario:** ${drop.duracion}`,

                    "",

                    `🎥 **Streamer requerido:** [${streamer.displayName}](https://www.twitch.tv/${streamer.login})`,

                    online
                        ? "🟢 **EN VIVO EN RUST AHORA**"
                        : "⚫ **Offline**"

                ].join("\n")
            )
            .setURL(
                streamer.url
            );


    if (
        drop.imagen
    ) {

        embed.setThumbnail(
            drop.imagen
        );
    }


    const row =
        new ActionRowBuilder()
            .addComponents(

                new ButtonBuilder()
                    .setLabel(
                        online
                            ? "🔴 Ver stream"
                            : "📺 Ver canal"
                    )
                    .setStyle(
                        ButtonStyle.Link
                    )
                    .setURL(
                        streamer.url
                    )
            );


    embed.setFooter({

        text:
            "Drop exclusivo • Debes ver al streamer indicado"
    });


    return {

        embed,

        row
    };
}


// ============================================================
// EMBED RESUMEN
// ============================================================

function crearEmbedResumen(
    datos,
    onlineMap
) {

    const general =
        datos.generalDrops ||
        [];


    const streamer =
        datos.streamerDrops ||
        [];


    const embed =
        new EmbedBuilder()
            .setColor(
                0x9146FF
            )
            .setTitle(
                "🎁 Twitch Drops de Rust"
            )
            .setURL(
                FACEPUNCH_GAME_URL
            )
            .setDescription(
                "Drops detectados directamente desde **Facepunch**."
            );


    if (
        general.length
    ) {

        const texto =
            general
                .map(
                    drop =>
                        `🎁 **${drop.nombre}** — ${drop.duracion}`
                )
                .join("\n");


        embed.addFields({

            name:
                `📦 General Drops (${general.length})`,

            value:
                texto.slice(
                    0,
                    1024
                ),

            inline:
                false
        });
    }


    if (
        streamer.length
    ) {

        const texto =
            streamer
                .map(
                    drop => {

                        const login =
                            drop.streamer?.login;


                        const estado =
                            login &&
                            onlineMap?.get(
                                login.toLowerCase()
                            );


                        return [

                            `🎯 **${drop.nombre}** — ${drop.duracion}`,

                            `└ 🎥 [${drop.streamer.displayName}](https://www.twitch.tv/${drop.streamer.login}) ${estado?.online ? "🟢 EN VIVO" : "⚫ Offline"}`

                        ].join("\n");

                    }
                )
                .join("\n\n");


        embed.addFields({

            name:
                `🎯 Streamer Drops (${streamer.length})`,

            value:
                texto.slice(
                    0,
                    1024
                ),

            inline:
                false
        });
    }


    if (
        !general.length &&
        !streamer.length
    ) {

        embed.setDescription(
            "⚠️ Facepunch no muestra Drops activos actualmente."
        );
    }


    embed.setFooter({

        text:
            "RustLogix • Twitch Drops"
    });


    return embed;
}


// ============================================================
// NORMALIZAR DATOS
// ============================================================

function normalizarDatosDrops(
    datos
) {

    if (!datos) {
        return null;
    }


    return {

        campaign:
            datos.campaign ||
            {},

        generalDrops:
            deduplicarDrops(
                datos.generalDrops ||
                []
            ),

        streamerDrops:
            deduplicarDrops(
                datos.streamerDrops ||
                []
            )
    };
}


// ============================================================
// CAMPAIGN KEY
// ============================================================

function crearCampaignKey(
    datos
) {

    const campaign =
        datos.campaign ||
        {};


    return normalizarClave(

        [

            campaign.titulo,

            campaign.tema,

            campaign.inicio?.toISOString?.() ||
                campaign.inicio ||
                "",

            campaign.final?.toISOString?.() ||
                campaign.final ||
                ""

        ].join("|")
    );
}


// ============================================================
// PREPARAR STREAMERS
// ============================================================

function prepararStreamers(
    drops,
    onlineMap
) {

    return (drops || [])
        .filter(
            drop =>
                drop.streamer
        )
        .map(
            drop => {

                const login =
                    drop.streamer.login;


                const estado =
                    onlineMap.get(
                        login.toLowerCase()
                    ) || {

                        online:
                            false,

                        stream:
                            null
                    };


                return {

                    login,

                    displayName:
                        drop.streamer.displayName ||
                        login,

                    url:
                        drop.streamer.url ||
                        `https://www.twitch.tv/${login}`,

                    online:
                        Boolean(
                            estado.online
                        ),

                    tituloDrop:
                        drop.nombre,

                    duracion:
                        drop.duracion,

                    minutos:
                        drop.minutos,

                    imagen:
                        drop.imagen ||
                        null
                };
            }
        );
}


// ============================================================
// ACTUALIZAR ESTADOS
// ============================================================

async function actualizarEstadosStreamer(
    monitor,
    onlineMap,
    client
) {

    if (
        !monitor ||
        !Array.isArray(
            monitor.streamers
        )
    ) {

        return [];
    }


    const notificaciones = [];


    for (
        const streamer of monitor.streamers
    ) {

        const login =
            streamer.login;


        if (!login) {
            continue;
        }


        const actual =
            onlineMap.get(
                login.toLowerCase()
            ) || {

                online:
                    false,

                stream:
                    null
            };


        const anterior =
            Boolean(
                streamer.online
            );


        const ahoraOnline =
            Boolean(
                actual.online
            );


        streamer.online =
            ahoraOnline;


        if (
            actual.stream
        ) {

            streamer.streamTitle =
                actual.stream.title;

            streamer.gameName =
                actual.stream.game_name;

            streamer.viewerCount =
                actual.stream.viewer_count;

            streamer.startedAt =
                actual.stream.started_at;

        } else {

            streamer.streamTitle =
                null;

            streamer.gameName =
                null;

            streamer.viewerCount =
                0;

            streamer.startedAt =
                null;
        }


        if (
            !anterior &&
            ahoraOnline
        ) {

            notificaciones.push({

                tipo:
                    "online",

                streamer
            });
        }


        if (
            anterior &&
            !ahoraOnline
        ) {

            notificaciones.push({

                tipo:
                    "offline",

                streamer
            });
        }
    }


    return notificaciones;
}


// ============================================================
// EMBED ONLINE
// ============================================================

function crearEmbedStreamerOnline(
    streamer
) {

    const embed =
        new EmbedBuilder()
            .setColor(
                0x57F287
            )
            .setTitle(
                "🟢 STREAMER DE TWITCH DROP EN VIVO"
            )
            .setDescription(
                [

                    `🎯 **Drop:** ${streamer.tituloDrop}`,

                    `🎥 **Streamer:** [${streamer.displayName}](https://www.twitch.tv/${streamer.login})`,

                    `⏱️ **Tiempo necesario:** ${streamer.duracion}`,

                    "",

                    "🔥 Está transmitiendo **Rust** ahora mismo."

                ].join("\n")
            )
            .setURL(
                `https://www.twitch.tv/${streamer.login}`
            );


    if (
        streamer.streamTitle
    ) {

        embed.addFields({

            name:
                "📺 Stream",

            value:
                streamer.streamTitle.slice(
                    0,
                    1024
                ),

            inline:
                false
        });
    }


    if (
        streamer.viewerCount
    ) {

        embed.addFields({

            name:
                "👀 Espectadores",

            value:
                String(
                    streamer.viewerCount
                ),

            inline:
                true
        });
    }


    if (
        streamer.imagen
    ) {

        embed.setThumbnail(
            streamer.imagen
        );
    }


    embed.setFooter({

        text:
            "RustLogix • Twitch Drops"
    });


    const row =
        new ActionRowBuilder()
            .addComponents(

                new ButtonBuilder()
                    .setLabel(
                        "🔴 Ver stream"
                    )
                    .setStyle(
                        ButtonStyle.Link
                    )
                    .setURL(
                        `https://www.twitch.tv/${streamer.login}`
                    )
            );


    return {

        embed,

        row
    };
}


// ============================================================
// EMBED OFFLINE
// ============================================================

function crearEmbedStreamerOffline(
    streamer
) {

    return new EmbedBuilder()
        .setColor(
            0x5865F2
        )
        .setTitle(
            "⚫ Streamer de Twitch Drop offline"
        )
        .setDescription(
            [

                `🎯 **Drop:** ${streamer.tituloDrop}`,

                `🎥 **Streamer:** [${streamer.displayName}](https://www.twitch.tv/${streamer.login})`,

                "",

                "El streamer ya no está transmitiendo Rust."

            ].join("\n")
        )
        .setURL(
            `https://www.twitch.tv/${streamer.login}`
        )
        .setFooter({

            text:
                "RustLogix • Twitch Drops"
        });
}


// ============================================================
// PUBLICAR DROPS
// ============================================================

async function publicarRustDrops(
    interactionOrChannel,
    datosExternos = null,
    onlineMapExterno = null
) {

    try {

        let channel = null;

        let datos =
            datosExternos;

        let onlineMap =
            onlineMapExterno;


        // ----------------------------------------------------
        // Interaction
        // ----------------------------------------------------

        if (
            interactionOrChannel &&
            interactionOrChannel.channel
        ) {

            channel =
                interactionOrChannel.channel;
        }


        // ----------------------------------------------------
        // Channel
        // ----------------------------------------------------

        else {

            channel =
                interactionOrChannel;
        }


        // ----------------------------------------------------
        // Obtener datos
        // ----------------------------------------------------

        if (!datos) {

            datos =
                await obtenerDropsFacepunch();
        }


        if (!datos) {

            throw new Error(
                "No se pudieron obtener los Twitch Drops de Facepunch."
            );
        }


        datos =
            normalizarDatosDrops(
                datos
            );


        // ----------------------------------------------------
        // Estado streamers
        // ----------------------------------------------------

        if (!onlineMap) {

            onlineMap =
                await obtenerMapaStreamersOnline(
                    datos.streamerDrops
                );
        }


        // ----------------------------------------------------
        // Interaction
        // ----------------------------------------------------

        if (
            interactionOrChannel &&
            typeof interactionOrChannel.reply ===
                "function"
        ) {

            const embed =
                crearEmbedResumen(
                    datos,
                    onlineMap
                );


            await interactionOrChannel.reply({

                embeds: [
                    embed
                ],

                ephemeral:
                    true
            });


            return {

                datos,

                onlineMap,

                mensajes:
                    []
            };
        }


        // ----------------------------------------------------
        // Channel
        // ----------------------------------------------------

        if (
            !channel ||
            typeof channel.send !==
                "function"
        ) {

            return {

                datos,

                onlineMap,

                mensajes:
                    []
            };
        }


        const mensajes = [];


        // ----------------------------------------------------
        // Campaña
        // ----------------------------------------------------

        const campaignEmbed =
            crearEmbedCampana(
                datos
            );


        const campaignMessage =
            await channel.send({

                embeds: [
                    campaignEmbed
                ]
            });


        mensajes.push(
            campaignMessage.id
        );


        // ----------------------------------------------------
        // General
        // ----------------------------------------------------

        for (
            const drop of datos.generalDrops
        ) {

            const embed =
                crearEmbedGeneralDrop(
                    drop
                );


            const mensaje =
                await channel.send({

                    embeds: [
                        embed
                    ]
                });


            mensajes.push(
                mensaje.id
            );
        }


        // ----------------------------------------------------
        // Streamer
        // ----------------------------------------------------

        for (
            const drop of datos.streamerDrops
        ) {

            const login =
                drop.streamer?.login;


            const estado =
                login
                    ? onlineMap.get(
                        login.toLowerCase()
                    )
                    : {
                        online:
                            false
                    };


            const resultado =
                crearEmbedStreamerDrop(
                    drop,
                    estado
                );


            const mensaje =
                await channel.send({

                    embeds: [
                        resultado.embed
                    ],

                    components: [
                        resultado.row
                    ]
                });


            mensajes.push(
                mensaje.id
            );
        }


        return {

            datos,

            onlineMap,

            mensajes
        };

    } catch (error) {

        console.error(
            "[Twitch Drops] Error publicando:",
            error
        );


        throw error;
    }
}


// ============================================================
// GUARDAR MONITOR
// ============================================================

async function guardarMonitor(
    guildId,
    channelId,
    datos,
    onlineMap,
    creadoPor = null
) {

    if (
        !guildId ||
        !channelId
    ) {

        return null;
    }


    const campaignKey =
        crearCampaignKey(
            datos
        );


    let monitor =
        await RustDropsMonitor.findOne({
            guildId
        });


    if (!monitor) {

        monitor =
            new RustDropsMonitor({

                guildId,

                channelId,

                messageIds: [],

                campaignKey,

                campaignName:
                    datos.campaign?.titulo ||
                    null,

                campaignTheme:
                    datos.campaign?.tema ||
                    null,

                campaignStart:
                    datos.campaign?.inicio ||
                    null,

                campaignEnd:
                    datos.campaign?.final ||
                    null,

                drops: {

                    general:
                        datos.generalDrops,

                    streamer:
                        datos.streamerDrops
                },

                streamers:
                    prepararStreamers(
                        datos.streamerDrops,
                        onlineMap
                    ),

                active:
                    true,

                ultimaRevision:
                    new Date(),

                creadoPor
            });

    } else {

        monitor.channelId =
            channelId;


        monitor.campaignKey =
            campaignKey;


        monitor.campaignName =
            datos.campaign?.titulo ||
            null;


        monitor.campaignTheme =
            datos.campaign?.tema ||
            null;


        monitor.campaignStart =
            datos.campaign?.inicio ||
            null;


        monitor.campaignEnd =
            datos.campaign?.final ||
            null;


        monitor.drops = {

            general:
                datos.generalDrops,

            streamer:
                datos.streamerDrops
        };


        const anteriores =
            new Map(

                (
                    monitor.streamers ||
                    []
                ).map(
                    streamer => [

                        String(
                            streamer.login
                        ).toLowerCase(),

                        streamer
                    ]
                )
            );


        const nuevos =
            prepararStreamers(
                datos.streamerDrops,
                onlineMap
            );


        for (
            const streamer of nuevos
        ) {

            const anterior =
                anteriores.get(
                    streamer.login.toLowerCase()
                );


            if (
                anterior
            ) {

                streamer.online =
                    Boolean(
                        anterior.online
                    );

                streamer.lastNotifiedOnline =
                    anterior.lastNotifiedOnline ||
                    null;
            }
        }


        monitor.streamers =
            nuevos;


        monitor.active =
            true;


        monitor.ultimaRevision =
            new Date();
    }


    await monitor.save();


    return monitor;
}


// ============================================================
// OBTENER CANAL MONITOR
// ============================================================

async function obtenerCanalMonitor(
    client,
    monitor
) {

    if (
        !client ||
        !monitor?.channelId
    ) {

        return null;
    }


    try {

        return await client.channels.fetch(
            monitor.channelId
        );

    } catch {

        return null;
    }
}


// ============================================================
// NOTIFICACIONES
// ============================================================

async function enviarNotificacionesStreamer(
    channel,
    notificaciones
) {

    if (
        !channel ||
        !notificaciones?.length
    ) {

        return;
    }


    for (
        const notificacion of notificaciones
    ) {

        const streamer =
            notificacion.streamer;


        if (
            notificacion.tipo ===
            "online"
        ) {

            const resultado =
                crearEmbedStreamerOnline(
                    streamer
                );


            await channel.send({

                embeds: [
                    resultado.embed
                ],

                components: [
                    resultado.row
                ]
            });


            continue;
        }


        if (
            notificacion.tipo ===
            "offline"
        ) {

            const embed =
                crearEmbedStreamerOffline(
                    streamer
                );


            await channel.send({

                embeds: [
                    embed
                ]
            });
        }
    }
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


        if (!datos) {

            return;
        }


        const normalizados =
            normalizarDatosDrops(
                datos
            );


        const onlineMap =
            await obtenerMapaStreamersOnline(
                normalizados.streamerDrops
            );


        for (
            const monitor of monitores
        ) {

            try {

                const channel =
                    await obtenerCanalMonitor(
                        client,
                        monitor
                    );


                if (!channel) {
                    continue;
                }


                // ------------------------------------------------
                // Actualizar estados
                // ------------------------------------------------

                const notificaciones =
                    await actualizarEstadosStreamer(
                        monitor,
                        onlineMap,
                        client
                    );


                // ------------------------------------------------
                // Campaña
                // ------------------------------------------------

                const nuevaCampaignKey =
                    crearCampaignKey(
                        normalizados
                    );


                const cambioCampana =
                    monitor.campaignKey !==
                    nuevaCampaignKey;


                if (
                    cambioCampana
                ) {

                    console.log(
                        "[Twitch Drops] Nueva campaña detectada."
                    );


                    const resultado =
                        await publicarRustDrops(
                            channel,
                            normalizados,
                            onlineMap
                        );


                    monitor.messageIds =
                        resultado.mensajes;


                    monitor.campaignKey =
                        nuevaCampaignKey;


                    monitor.campaignName =
                        normalizados.campaign?.titulo ||
                        null;


                    monitor.campaignTheme =
                        normalizados.campaign?.tema ||
                        null;


                    monitor.campaignStart =
                        normalizados.campaign?.inicio ||
                        null;


                    monitor.campaignEnd =
                        normalizados.campaign?.final ||
                        null;


                    monitor.drops = {

                        general:
                            normalizados.generalDrops,

                        streamer:
                            normalizados.streamerDrops
                    };
                }


                // ------------------------------------------------
                // Notificaciones
                // ------------------------------------------------

                if (
                    notificaciones.length
                ) {

                    await enviarNotificacionesStreamer(
                        channel,
                        notificaciones
                    );
                }


                monitor.ultimaRevision =
                    new Date();


                await monitor.save();

            } catch (error) {

                console.error(
                    "[Twitch Drops] Error revisando monitor:",
                    monitor.guildId,
                    error.message
                );
            }
        }

    } catch (error) {

        console.error(
            "[Twitch Drops] Error revisión automática:",
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

    if (
        automaticoIniciado
    ) {

        console.log(
            "[Twitch Drops] El sistema automático ya estaba iniciado."
        );


        return;
    }


    automaticoIniciado =
        true;


    console.log(
        "[Twitch Drops] Sistema automático iniciado."
    );


    revisarDropsAutomaticos(
        client
    ).catch(
        error =>
            console.error(
                "[Twitch Drops] Error primera revisión:",
                error.message
            )
    );


    automaticInterval =
        setInterval(
            () => {

                revisarDropsAutomaticos(
                    client
                ).catch(
                    error =>
                        console.error(
                            "[Twitch Drops] Error revisión:",
                            error.message
                        )
                );

            },
            REVISION_INTERVALO
        );
}


// ============================================================
// DETENER AUTOMÁTICO
// ============================================================

function detenerDropsAutomaticos() {

    if (
        automaticInterval
    ) {

        clearInterval(
            automaticInterval
        );


        automaticInterval =
            null;
    }


    automaticoIniciado =
        false;


    console.log(
        "[Twitch Drops] Sistema automático detenido."
    );
}


// ============================================================
// /DROPS RUST
// ============================================================

async function obtenerRustDropsEmbed(
    userId = null
) {

    const datos =
        await obtenerDropsFacepunch();


    if (!datos) {

        return {

            embeds: [

                new EmbedBuilder()
                    .setColor(
                        0xED4245
                    )
                    .setTitle(
                        "❌ Twitch Drops"
                    )
                    .setDescription(
                        "No pude obtener los Drops de Rust desde Facepunch."
                    )

            ]
        };
    }


    const normalizados =
        normalizarDatosDrops(
            datos
        );


    const onlineMap =
        await obtenerMapaStreamersOnline(
            normalizados.streamerDrops
        );


    const embed =
        crearEmbedResumen(
            normalizados,
            onlineMap
        );


    return {

        embeds: [
            embed
        ]
    };
}


// ============================================================
// OBTENER DATOS CRUDOS
// ============================================================

async function obtenerRustDrops() {

    const datos =
        await obtenerDropsFacepunch();


    if (!datos) {

        return null;
    }


    return normalizarDatosDrops(
        datos
    );
}


// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    // Facepunch
    obtenerDropsFacepunch,

    obtenerRustDrops,

    // /drops rust
    obtenerRustDropsEmbed,

    // Publicación
    publicarRustDrops,

    // Automático
    iniciarDropsAutomaticos,

    detenerDropsAutomaticos,

    revisarDropsAutomaticos,

    // Twitch
    obtenerTwitchToken,

    obtenerStreamsRust,

    obtenerEstadoStreamer,

    obtenerMapaStreamersOnline,

    // Parser
    parsearHtmlFacepunch,

    extraerInformacionCampana,

    extraerGeneralDrops,

    extraerStreamerDrops,

    // Embeds
    crearEmbedCampana,

    crearEmbedGeneralDrop,

    crearEmbedStreamerDrop,

    crearEmbedStreamerOnline,

    crearEmbedStreamerOffline,

    // Monitor
    guardarMonitor,

    actualizarEstadosStreamer
};