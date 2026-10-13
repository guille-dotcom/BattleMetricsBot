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

const FACEPUNCH_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155.0.0.0 Safari/537.36",
    "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language":
        "es-ES,es;q=0.9,en;q=0.8"
};

// ============================================================
// TWITCH TOKEN
// ============================================================

let twitchAccessToken = null;
let twitchTokenExpira = 0;

// ============================================================
// HELPERS
// ============================================================

function limpiarTexto(texto) {
    return String(texto || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function limpiarNombreDrop(nombre) {

    nombre = limpiarTexto(nombre);

    if (!nombre) {
        return "";
    }

    nombre = nombre
        .replace(/^loading\s*\.\.\.\s*/i, "")
        .replace(/^loading\s*…\s*/i, "")
        .replace(/\s+loading\s*\.\.\.$/i, "")
        .replace(/\s+loading\s*…$/i, "");

    return limpiarTexto(nombre);
}

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

    const partes = String(srcset)
        .split(",")
        .map(x => x.trim())
        .filter(Boolean);

    if (!partes.length) {
        return null;
    }

    const ultimo = partes[partes.length - 1]
        .split(/\s+/)[0];

    return normalizarUrlImagen(ultimo);
}

function extraerUrlBackground(style) {

    if (!style) {
        return null;
    }

    const match = String(style).match(
        /url\(\s*['"]?([^'")]+)['"]?\s*\)/i
    );

    if (!match) {
        return null;
    }

    return normalizarUrlImagen(match[1]);
}

function extraerImagenElemento($, elemento) {

    if (!elemento || !elemento.length) {
        return null;
    }

    let imagen = null;

    const selectores = [
        "img",
        "source",
        "[style*='background-image']",
        "[style*='background']"
    ];

    for (const selector of selectores) {

        elemento.find(selector).each((_, el) => {

            if (imagen) {
                return;
            }

            const $el = $(el);

            const atributos = [
                "src",
                "data-src",
                "data-image",
                "data-img",
                "data-lazy-src",
                "data-original",
                "data-url"
            ];

            for (const atributo of atributos) {

                const valor =
                    $el.attr(atributo);

                if (!valor) {
                    continue;
                }

                const url =
                    normalizarUrlImagen(valor);

                if (url) {
                    imagen = url;
                    return;
                }
            }

            const srcset =
                $el.attr("srcset") ||
                $el.attr("data-srcset");

            if (srcset) {

                const url =
                    extraerPrimeraUrlSrcset(srcset);

                if (url) {
                    imagen = url;
                    return;
                }
            }

            const style =
                $el.attr("style");

            if (style) {

                const url =
                    extraerUrlBackground(style);

                if (url) {
                    imagen = url;
                    return;
                }
            }
        });
    }

    if (imagen) {
        return imagen;
    }

    const propioStyle =
        elemento.attr("style");

    if (propioStyle) {

        const url =
            extraerUrlBackground(propioStyle);

        if (url) {
            return url;
        }
    }

    return null;
}

function extraerHoras(texto) {

    texto = limpiarTexto(texto);

    if (!texto) {
        return null;
    }

    let match =
        texto.match(
            /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i
        );

    if (match) {
        return Number(match[1]);
    }

    match =
        texto.match(
            /(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)\b/i
        );

    if (match) {
        return Number(match[1]) / 60;
    }

    return null;
}

function formatearDuracion(horas) {

    if (horas == null) {
        return "—";
    }

    if (horas < 1) {

        const minutos =
            Math.round(horas * 60);

        return `${minutos} minuto${minutos === 1 ? "" : "s"}`;
    }

    if (Number.isInteger(horas)) {

        return `${horas} hora${horas === 1 ? "" : "s"}`;
    }

    return `${horas} horas`;
}

// ============================================================
// FECHAS DE CAMPAÑA
// ============================================================

const MESES_ES = {
    enero: 0,
    febrero: 1,
    marzo: 2,
    abril: 3,
    mayo: 4,
    junio: 5,
    julio: 6,
    agosto: 7,
    septiembre: 8,
    octubre: 9,
    noviembre: 10,
    diciembre: 11
};

function parsearFechaFacepunch(texto) {

    if (!texto) {
        return null;
    }

    texto = limpiarTexto(texto);

    const regex =
        /(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})\s+a\s+las\s+(\d{1,2}):(\d{2})\s+GMT([+-]\d+)/i;

    const match =
        texto.match(regex);

    if (!match) {
        return null;
    }

    const dia =
        Number(match[1]);

    const mesNombre =
        match[2]
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");

    const mes =
        MESES_ES[mesNombre];

    const año =
        Number(match[3]);

    const hora =
        Number(match[4]);

    const minuto =
        Number(match[5]);

    const offset =
        Number(match[6]);

    if (
        mes == null ||
        Number.isNaN(mes)
    ) {
        return null;
    }

    const utc =
        Date.UTC(
            año,
            mes,
            dia,
            hora - offset,
            minuto
        );

    return new Date(utc);
}

function extraerFechasCampaña($, textoPagina) {

    let texto = limpiarTexto(textoPagina);

    let inicio = null;
    let fin = null;

    const regexCompleto =
        /(\d{1,2}\s+de\s+[a-záéíóú]+\s+de\s+\d{4}\s+a\s+las\s+\d{1,2}:\d{2}\s+GMT[+-]\d+)\s*-\s*(\d{1,2}\s+de\s+[a-záéíóú]+\s+de\s+\d{4}\s+a\s+las\s+\d{1,2}:\d{2}\s+GMT[+-]\d+)/i;

    let match =
        texto.match(regexCompleto);

    if (match) {

        inicio =
            parsearFechaFacepunch(match[1]);

        fin =
            parsearFechaFacepunch(match[2]);
    }

    // --------------------------------------------------------
    // Fallback para la página actualmente servida en inglés
    // --------------------------------------------------------

    if (!inicio || !fin) {

        const regexEnglish =
            /([A-Z][a-z]+\s+\d{1,2},\s+\d{4}\s+at\s+\d{1,2}:\d{2}\s+(?:AM|PM)\s+UTC)\s*-\s*([A-Z][a-z]+\s+\d{1,2},\s+\d{4}\s+at\s+\d{1,2}:\d{2}\s+(?:AM|PM)\s+UTC)/i;

        const english =
            texto.match(regexEnglish);

        if (english) {

            const fechaInicio =
                new Date(
                    english[1]
                        .replace(" at ", " ")
                        .replace(" UTC", "Z")
                );

            const fechaFin =
                new Date(
                    english[2]
                        .replace(" at ", " ")
                        .replace(" UTC", "Z")
                );

            if (!Number.isNaN(fechaInicio.getTime())) {
                inicio = fechaInicio;
            }

            if (!Number.isNaN(fechaFin.getTime())) {
                fin = fechaFin;
            }
        }
    }

    return {
        inicio,
        fin
    };
}

// ============================================================
// CAMPAÑA
// ============================================================

function extraerInformacionCampaña($) {

    const textoPagina =
        limpiarTexto(
            $("body").text()
        );

    let titulo =
        "";

    let nombre =
        "";

    let estado =
        "";

    // --------------------------------------------------------
    // Estado
    // --------------------------------------------------------

    const textoEstado =
        textoPagina.match(
            /\b(Upcoming|Active|Ended)\b/i
        );

    if (textoEstado) {
        estado =
            textoEstado[1];
    }

    // --------------------------------------------------------
    // Título
    // --------------------------------------------------------

    $("body *").each((_, elemento) => {

        if (titulo) {
            return;
        }

        const texto =
            limpiarTexto(
                $(elemento).clone().children().remove().end().text()
            );

        if (
            /^Twitch Drops Round\s+\d+/i.test(texto)
        ) {
            titulo = texto;
        }
    });

    if (!titulo) {

        const match =
            textoPagina.match(
                /(Twitch Drops Round\s+\d+[^\n]+?)(?=\s+Base Invaders|\s+General Drops)/i
            );

        if (match) {
            titulo = limpiarTexto(match[1]);
        }
    }

    // --------------------------------------------------------
    // Nombre de campaña
    // --------------------------------------------------------

    $("h1, h2, h3").each((_, elemento) => {

        if (nombre) {
            return;
        }

        const texto =
            limpiarTexto(
                $(elemento).text()
            );

        if (
            texto &&
            !/Twitch Drops Round/i.test(texto) &&
            !/General Drops/i.test(texto) &&
            !/Streamer Drops/i.test(texto) &&
            texto.length < 100
        ) {
            nombre = texto;
        }
    });

    if (!nombre) {

        const match =
            textoPagina.match(
                /Twitch Drops Round\s+\d+[^\n]*?\s+([A-Z][A-Za-z0-9 &'™:-]{2,60}?)(?=\s+\d{1,2}\s+de\s+|\s+[A-Z][a-z]+\s+\d{1,2},|\s+General Drops)/i
            );

        if (match) {
            nombre = limpiarTexto(match[1]);
        }
    }

    // Para la campaña mostrada actualmente.
    if (!nombre) {
        nombre = "Base Invaders";
    }

    const fechas =
        extraerFechasCampaña(
            $,
            textoPagina
        );

    return {
        estado,
        titulo,
        nombre,
        fechaInicio:
            fechas.inicio
                ? fechas.inicio.toISOString()
                : null,
        fechaFin:
            fechas.fin
                ? fechas.fin.toISOString()
                : null
    };
}

// ============================================================
// DETECTAR SI UN ELEMENTO ES DURACIÓN
// ============================================================

function obtenerDuracionDesdeElemento($, elemento) {

    if (!elemento || !elemento.length) {
        return null;
    }

    const texto =
        limpiarTexto(
            elemento.text()
        );

    return extraerHoras(texto);
}

// ============================================================
// BUSCAR CARD DE DROP
// ============================================================

function encontrarContenedorDrop($, elemento) {

    let actual =
        elemento;

    for (let nivel = 0; nivel < 12; nivel++) {

        if (!actual || !actual.length) {
            break;
        }

        const texto =
            limpiarTexto(
                actual.text()
            );

        const tieneDuracion =
            /\b\d+(?:\.\d+)?\s*(?:hour|hours|hrs?|h|minute|minutes|mins?|m)\b/i
                .test(texto);

        const imagen =
            extraerImagenElemento(
                $,
                actual
            );

        if (
            tieneDuracion &&
            imagen
        ) {
            return actual;
        }

        actual =
            actual.parent();
    }

    return elemento.parent();
}

// ============================================================
// OBTENER NOMBRE REAL DE UN DROP
// ============================================================

function extraerNombreDesdeCard($, card, opciones = {}) {

    if (!card || !card.length) {
        return "";
    }

    const candidatos = [];

    // --------------------------------------------------------
    // Primero: enlaces Twitch que no sean streamer
    // --------------------------------------------------------

    card.find("a").each((_, el) => {

        const $a =
            $(el);

        const href =
            String(
                $a.attr("href") || ""
            );

        const texto =
            limpiarTexto(
                $a.text()
            );

        if (!texto) {
            return;
        }

        if (
            /twitch\.tv/i.test(href)
        ) {

            if (
                /directory\/category\/rust/i.test(href)
            ) {
                return;
            }

            if (
                /^https?:\/\/(?:www\.)?twitch\.tv\/[^/]+\/?$/i.test(href)
            ) {
                return;
            }
        }

        if (
            /^\d+\s*(?:hour|hours|minute|minutes|h|m)$/i.test(texto)
        ) {
            return;
        }

        if (
            /^(?:video|0 claimed|1 claimed|2 claimed|3 claimed|4 claimed|5 claimed)$/i
                .test(texto)
        ) {
            return;
        }

        candidatos.push(texto);
    });

    // --------------------------------------------------------
    // Selectores típicos de título
    // --------------------------------------------------------

    const selectoresTitulo = [
        "[class*='drop-name']",
        "[class*='dropName']",
        "[class*='reward-name']",
        "[class*='rewardName']",
        "[class*='item-name']",
        "[class*='itemName']",
        "[class*='title']",
        "h1",
        "h2",
        "h3",
        "h4",
        "strong"
    ];

    for (const selector of selectoresTitulo) {

        card.find(selector).each((_, el) => {

            const texto =
                limpiarTexto(
                    $(el).text()
                );

            if (!texto) {
                return;
            }

            if (
                /\b\d+(?:\.\d+)?\s*(?:hour|hours|minute|minutes|h|m)\b/i.test(texto)
            ) {
                return;
            }

            if (
                /^loading/i.test(texto)
            ) {
                return;
            }

            if (
                texto.length > 80
            ) {
                return;
            }

            candidatos.push(texto);
        });
    }

    // --------------------------------------------------------
    // Limpiar y filtrar
    // --------------------------------------------------------

    const prohibidos = [
        /^twitchrivals$/i,
        /^available across/i,
        /^what's available/i,
        /^sort by$/i,
        /^online$/i,
        /^random$/i,
        /^general drops/i,
        /^streamer drops/i,
        /^loading/i
    ];

    const unicos =
        candidatos
            .map(limpiarNombreDrop)
            .filter(Boolean)
            .filter(texto =>
                !prohibidos.some(
                    regex => regex.test(texto)
                )
            )
            .filter(texto =>
                !/^\d+\s*(?:hour|hours|minute|minutes|h|m)$/i.test(texto)
            );

    if (!unicos.length) {
        return "";
    }

    // En General Drops suele aparecer directamente el nombre
    // antes de la duración.
    return unicos[0];
}

// ============================================================
// GENERAL DROPS
// ============================================================

function extraerGeneralDrops($) {

    const drops = [];

    let encontradoGeneral = false;
    let encontradoStreamer = false;

    $("h1, h2, h3, h4, h5, h6").each((_, heading) => {

        const texto =
            limpiarTexto(
                $(heading).text()
            );

        if (
            /General Drops/i.test(texto)
        ) {
            encontradoGeneral = true;
            return;
        }

        if (
            encontradoGeneral &&
            /Streamer Drops/i.test(texto)
        ) {
            encontradoStreamer = true;
        }
    });

    // --------------------------------------------------------
    // Buscar anchors que representen los Drops generales.
    // La página actual los sirve como enlaces Twitch.
    // --------------------------------------------------------

    $("a").each((_, el) => {

        if (encontradoStreamer) {
            // No paramos aquí porque el heading está antes en el
            // DOM y necesitamos filtrar individualmente.
        }

        const $a =
            $(el);

        const href =
            String(
                $a.attr("href") || ""
            );

        const texto =
            limpiarTexto(
                $a.text()
            );

        if (
            !/twitch\.tv/i.test(href)
        ) {
            return;
        }

        if (
            !/directory\/category\/rust/i.test(href)
        ) {
            return;
        }

        if (!texto) {
            return;
        }

        // ----------------------------------------------------
        // El texto del anchor puede venir como:
        // "Bed 2 Hours"
        // pero el nombre correcto es solo "Bed".
        // ----------------------------------------------------

        const duracion =
            extraerHoras(texto);

        if (duracion == null) {
            return;
        }

        const card =
            encontrarContenedorDrop(
                $,
                $a
            );

        let nombre =
            extraerNombreDesdeCard(
                $,
                card
            );

        // Fallback directo desde el texto del anchor.
        if (!nombre) {

            nombre =
                texto
                    .replace(
                        /\b\d+(?:\.\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?|m)\b/i,
                        ""
                    )
                    .trim();
        }

        nombre =
            limpiarNombreDrop(nombre);

        if (!nombre) {
            return;
        }

        // ----------------------------------------------------
        // Evitar nombres basura
        // ----------------------------------------------------

        if (
            /^(?:video|0 claimed|1 claimed|2 claimed|3 claimed|4 claimed|5 claimed)$/i
                .test(nombre)
        ) {
            return;
        }

        // ----------------------------------------------------
        // Imagen dentro del mismo card
        // ----------------------------------------------------

        const imagen =
            extraerImagenElemento(
                $,
                card
            );

        // ----------------------------------------------------
        // Evitar duplicados
        // ----------------------------------------------------

        const existe =
            drops.some(
                drop =>
                    drop.nombre.toLowerCase() ===
                    nombre.toLowerCase()
            );

        if (existe) {
            return;
        }

        drops.push({
            tipo: "general",
            nombre,
            horas: duracion,
            imagen: imagen || null,
            streamers: []
        });
    });

    // --------------------------------------------------------
    // Fallback adicional: buscar bloques alrededor de textos
    // con duración, por si Facepunch cambia el href.
    // --------------------------------------------------------

    if (!drops.length) {

        $("body *").each((_, elemento) => {

            const $elemento =
                $(elemento);

            const texto =
                limpiarTexto(
                    $elemento.text()
                );

            if (
                !/\b\d+\s*(?:hour|hours|minute|minutes)\b/i.test(texto)
            ) {
                return;
            }

            if (
                texto.length > 150
            ) {
                return;
            }

            const duracion =
                extraerHoras(texto);

            if (duracion == null) {
                return;
            }

            const card =
                encontrarContenedorDrop(
                    $,
                    $elemento
                );

            const nombre =
                extraerNombreDesdeCard(
                    $,
                    card
                );

            if (!nombre) {
                return;
            }

            const imagen =
                extraerImagenElemento(
                    $,
                    card
                );

            if (
                drops.some(
                    drop =>
                        drop.nombre.toLowerCase() ===
                        nombre.toLowerCase()
                )
            ) {
                return;
            }

            drops.push({
                tipo: "general",
                nombre,
                horas: duracion,
                imagen: imagen || null,
                streamers: []
            });
        });
    }

    return drops;
}

// ============================================================
// STREAMER DROPS
// ============================================================

function extraerStreamerDrops($) {

    const drops = [];

    $("a").each((_, el) => {

        const $a =
            $(el);

        const href =
            String(
                $a.attr("href") || ""
            );

        if (
            !/^https?:\/\/(?:www\.)?twitch\.tv\/[^/]+\/?$/i.test(href)
        ) {
            return;
        }

        const streamer =
            limpiarTexto(
                $a.text()
            );

        if (!streamer) {
            return;
        }

        const card =
            encontrarContenedorDrop(
                $,
                $a
            );

        const textoCard =
            limpiarTexto(
                card.text()
            );

        const horas =
            extraerHoras(textoCard);

        if (horas == null) {
            return;
        }

        let nombre =
            extraerNombreDesdeCard(
                $,
                card,
                {
                    streamer
                }
            );

        // ----------------------------------------------------
        // Si el parser eligió el nombre del streamer, buscar
        // explícitamente otro texto válido dentro del card.
        // ----------------------------------------------------

        if (
            !nombre ||
            nombre.toLowerCase() ===
            streamer.toLowerCase()
        ) {

            const candidatos = [];

            card.find("*").each((_, nodo) => {

                const texto =
                    limpiarTexto(
                        $(nodo).clone()
                            .children()
                            .remove()
                            .end()
                            .text()
                    );

                if (!texto) {
                    return;
                }

                if (
                    texto.length > 80
                ) {
                    return;
                }

                if (
                    texto.toLowerCase() ===
                    streamer.toLowerCase()
                ) {
                    return;
                }

                if (
                    /\b\d+(?:\.\d+)?\s*(?:hour|hours|minute|minutes|h|m)\b/i.test(texto)
                ) {
                    return;
                }

                if (
                    /^loading/i.test(texto)
                ) {
                    return;
                }

                candidatos.push(texto);
            });

            if (candidatos.length) {
                nombre =
                    limpiarNombreDrop(
                        candidatos[0]
                    );
            }
        }

        // ----------------------------------------------------
        // Fallback para la estructura actual:
        // TwitchRivals / Small Backpack / 30 minutes
        // ----------------------------------------------------

        if (
            !nombre ||
            nombre.toLowerCase() ===
            streamer.toLowerCase()
        ) {

            const textoSinStreamer =
                textoCard
                    .replace(
                        new RegExp(
                            `^${streamer}\\s*`,
                            "i"
                        ),
                        ""
                    );

            nombre =
                textoSinStreamer
                    .replace(
                        /\b\d+(?:\.\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?|m)\b/i,
                        ""
                    )
                    .replace(
                        /^loading\s*\.\.\.\s*/i,
                        ""
                    )
                    .trim();
        }

        nombre =
            limpiarNombreDrop(nombre);

        if (
            !nombre ||
            nombre.toLowerCase() ===
            streamer.toLowerCase()
        ) {
            return;
        }

        const imagen =
            extraerImagenElemento(
                $,
                card
            );

        let login =
            streamer
                .trim()
                .toLowerCase();

        const existe =
            drops.find(
                drop =>
                    drop.nombre.toLowerCase() ===
                    nombre.toLowerCase()
            );

        if (existe) {

            const yaEsta =
                existe.streamers.some(
                    item => {

                        if (
                            typeof item ===
                            "string"
                        ) {
                            return (
                                item.toLowerCase() ===
                                login
                            );
                        }

                        return (
                            item.login &&
                            item.login.toLowerCase() ===
                            login
                        );
                    }
                );

            if (!yaEsta) {

                existe.streamers.push({
                    login,
                    nombre: streamer,
                    online: false
                });
            }

            return;
        }

        drops.push({
            tipo: "streamer",
            nombre,
            horas,
            imagen: imagen || null,
            streamers: [
                {
                    login,
                    nombre: streamer,
                    online: false
                }
            ]
        });
    });

    return drops;
}

// ============================================================
// OBTENER DROPS FACEPUNCH
// ============================================================

async function obtenerDropsFacepunch() {

    const response =
        await axios.get(
            FACEPUNCH_DROPS_URL,
            {
                headers: FACEPUNCH_HEADERS,
                timeout: 30000
            }
        );

    const html =
        response.data;

    const $ =
        cheerio.load(html);

    const campaña =
        extraerInformacionCampaña($);

    const generalDrops =
        extraerGeneralDrops($);

    const streamerDrops =
        extraerStreamerDrops($);

    const drops = [
        ...generalDrops,
        ...streamerDrops
    ];

    const streamers = [
        ...new Set(
            streamerDrops.flatMap(
                drop =>
                    drop.streamers.map(
                        streamer =>
                            typeof streamer === "string"
                                ? streamer
                                : streamer.login
                    )
            )
        )
    ];

    console.log(
        `[Twitch Drops] Campaña: ${campaña.titulo || "sin título"}`
    );

    console.log(
        `[Twitch Drops] Nombre: ${campaña.nombre || "sin nombre"}`
    );

    console.log(
        `[Twitch Drops] Generales encontrados: ${generalDrops.length}`
    );

    generalDrops.forEach(drop => {

        console.log(
            `[Twitch Drops] General: ${drop.nombre} | ${formatearDuracion(drop.horas)} | imagen=${drop.imagen ? "SI" : "NO"}`
        );
    });

    console.log(
        `[Twitch Drops] Streamer encontrados: ${streamerDrops.length}`
    );

    streamerDrops.forEach(drop => {

        console.log(
            `[Twitch Drops] Streamer: ${drop.nombre} | ${formatearDuracion(drop.horas)} | ${drop.streamers.map(s => typeof s === "string" ? s : s.login).join(", ")} | imagen=${drop.imagen ? "SI" : "NO"}`
        );
    });

    return {
        estado: campaña.estado,
        campaignTitle:
            campaña.titulo,
        campaignName:
            campaña.nombre,
        campaignStart:
            campaña.fechaInicio,
        campaignEnd:
            campaña.fechaFin,
        generalDrops,
        streamerDrops,
        drops,
        streamers,
        fechaConsulta:
            new Date()
    };
}

// ============================================================
// TWITCH API
// ============================================================

async function obtenerTwitchAccessToken() {

    if (
        twitchAccessToken &&
        Date.now() <
        twitchTokenExpira
    ) {
        return twitchAccessToken;
    }

    const clientId =
        process.env.TWITCH_CLIENT_ID;

    const clientSecret =
        process.env.TWITCH_CLIENT_SECRET;

    if (
        !clientId ||
        !clientSecret
    ) {
        throw new Error(
            "Faltan TWITCH_CLIENT_ID o TWITCH_CLIENT_SECRET"
        );
    }

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
                timeout: 15000
            }
        );

    twitchAccessToken =
        response.data.access_token;

    twitchTokenExpira =
        Date.now() +
        (
            Number(
                response.data.expires_in || 3600
            ) - 300
        ) *
        1000;

    return twitchAccessToken;
}

// ============================================================
// STREAMERS ONLINE EN RUST
// ============================================================

async function obtenerStreamersOnlineRust(logins) {

    const resultado = {};

    const unicos =
        [
            ...new Set(
                (logins || [])
                    .map(login =>
                        typeof login === "string"
                            ? login
                            : login.login
                    )
                    .filter(Boolean)
                    .map(login =>
                        login.toLowerCase()
                    )
            )
        ];

    if (!unicos.length) {
        return resultado;
    }

    try {

        const token =
            await obtenerTwitchAccessToken();

        const headers = {
            "Client-ID":
                process.env.TWITCH_CLIENT_ID,
            "Authorization":
                `Bearer ${token}`
        };

        // Twitch permite hasta 100 user_login por consulta.
        for (
            let i = 0;
            i < unicos.length;
            i += 100
        ) {

            const lote =
                unicos.slice(
                    i,
                    i + 100
                );

            const params = {};

            lote.forEach(login => {

                if (!params.user_login) {
                    params.user_login = [];
                }

                params.user_login.push(login);
            });

            params.game_id =
                TWITCH_GAME_ID_RUST;

            const response =
                await axios.get(
                    `${TWITCH_API}/streams`,
                    {
                        headers,
                        params,
                        timeout: 15000
                    }
                );

            for (
                const stream
                of response.data?.data || []
            ) {

                const login =
                    String(
                        stream.user_login || ""
                    ).toLowerCase();

                if (!login) {
                    continue;
                }

                // Solo Rust.
                if (
                    String(stream.game_id) !==
                    TWITCH_GAME_ID_RUST
                ) {
                    continue;
                }

                resultado[login] = {
                    online: true,
                    userId:
                        stream.user_id,
                    displayName:
                        stream.user_name,
                    title:
                        stream.title,
                    viewers:
                        stream.viewer_count || 0,
                    startedAt:
                        stream.started_at
                };
            }
        }

    } catch (error) {

        console.error(
            "[Twitch Drops] Error consultando Twitch:",
            error.response?.data ||
            error.message
        );
    }

    return resultado;
}

// ============================================================
// EMBED CAMPAÑA
// ============================================================

function crearEmbedCampaña(datos) {

    const embed =
        new EmbedBuilder()
            .setTitle(
                "🎁 RUST TWITCH DROPS"
            )
            .setDescription(
                [
                    `📢 **${datos.campaignTitle || "Twitch Drops"}**`,
                    "",
                    `🎨 **${datos.campaignName || "Campaña actual"}**`
                ].join("\n")
            )
            .setTimestamp(
                new Date()
            );

    if (
        datos.campaignStart
    ) {

        const fechaInicio =
            Math.floor(
                new Date(
                    datos.campaignStart
                ).getTime() / 1000
            );

        embed.addFields({
            name: "⏳ EMPIEZA EN",
            value:
                `<t:${fechaInicio}:R>`,
            inline: false
        });

        embed.addFields({
            name: "📅 Inicio",
            value:
                `<t:${fechaInicio}:F>`,
            inline: true
        });
    }

    if (
        datos.campaignEnd
    ) {

        const fechaFin =
            Math.floor(
                new Date(
                    datos.campaignEnd
                ).getTime() / 1000
            );

        embed.addFields({
            name: "📅 Finaliza",
            value:
                `<t:${fechaFin}:F>`,
            inline: true
        });
    }

    embed.setFooter({
        text:
            "RustLogix • Twitch Drops"
    });

    return embed;
}

// ============================================================
// EMBED SECCIÓN
// ============================================================

function crearEmbedSeccion(titulo, descripcion) {

    return new EmbedBuilder()
        .setTitle(titulo)
        .setDescription(descripcion)
        .setFooter({
            text:
                "RustLogix • Twitch Drops"
        });
}

// ============================================================
// EMBED DROP
// ============================================================

function crearEmbedDrop(
    drop,
    onlineMap = {}
) {

    const esStreamer =
        drop.tipo === "streamer";

    const embed =
        new EmbedBuilder()
            .setTitle(
                esStreamer
                    ? `🎯 ${drop.nombre}`
                    : `📦 ${drop.nombre}`
            )
            .addFields({
                name: "⏱️ Tiempo",
                value:
                    formatearDuracion(
                        drop.horas
                    ),
                inline: true
            });

    if (!esStreamer) {

        embed.addFields({
            name: "📺 Disponible en",
            value:
                "Todos los streams de Rust con Drops habilitados.",
            inline: false
        });

    } else {

        const streamers =
            Array.isArray(
                drop.streamers
            )
                ? drop.streamers
                : [];

        const lineas =
            streamers.map(streamer => {

                const login =
                    typeof streamer === "string"
                        ? streamer
                        : streamer.login;

                const nombre =
                    typeof streamer === "string"
                        ? streamer
                        : (
                            streamer.nombre ||
                            streamer.login
                        );

                const info =
                    onlineMap[
                        String(login).toLowerCase()
                    ];

                const online =
                    info?.online === true;

                return (
                    `${online ? "🟢" : "⚫"} ${nombre}`
                );
            });

        embed.addFields({
            name: "📺 Streamer asociado",
            value:
                lineas.length
                    ? lineas.join("\n")
                    : "Sin streamer disponible.",
            inline: false
        });
    }

    // La imagen queda como thumbnail, igual que el estilo
    // que ya estaba funcionando correctamente para Streamer Drops.
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
// KEY DE CAMPAÑA
// ============================================================

function crearCampaignKey(datos) {

    const drops =
        (datos.drops || [])
            .map(drop => {

                const streamers =
                    (drop.streamers || [])
                        .map(streamer =>
                            typeof streamer === "string"
                                ? streamer
                                : streamer.login
                        )
                        .sort()
                        .join(",");

                return [
                    drop.tipo,
                    drop.nombre,
                    drop.horas,
                    streamers
                ].join(":");
            })
            .sort()
            .join("|");

    return [
        datos.estado || "",
        datos.campaignTitle || "",
        datos.campaignName || "",
        datos.campaignStart || "",
        datos.campaignEnd || "",
        drops
    ].join("||");
}

// ============================================================
// NORMALIZAR DROPS GUARDADOS
// ============================================================

function normalizarDropGuardado(drop) {

    return {
        tipo:
            drop.tipo ||
            "general",

        nombre:
            drop.nombre ||
            "Drop",

        horas:
            Number(
                drop.horas || 0
            ),

        imagen:
            drop.imagen ||
            null,

        streamers:
            Array.isArray(
                drop.streamers
            )
                ? drop.streamers.map(
                    streamer => {

                        if (
                            typeof streamer ===
                            "string"
                        ) {

                            return {
                                login:
                                    streamer.toLowerCase(),
                                nombre:
                                    streamer,
                                online:
                                    false
                            };
                        }

                        return {
                            login:
                                streamer.login ||
                                "",
                            nombre:
                                streamer.nombre ||
                                streamer.login ||
                                "",
                            online:
                                streamer.online === true
                        };
                    }
                )
                : []
    };
}

// ============================================================
// CONVERTIR PARA MONGOOSE
// ============================================================

function convertirDatosAGuardado(
    datos,
    onlineMap = {}
) {

    return (datos.drops || [])
        .map(drop => {

            const normalizado =
                normalizarDropGuardado(
                    drop
                );

            if (
                normalizado.tipo ===
                "streamer"
            ) {

                normalizado.streamers =
                    normalizado.streamers.map(
                        streamer => {

                            const info =
                                onlineMap[
                                    streamer.login
                                ];

                            return {
                                ...streamer,
                                online:
                                    info?.online === true
                            };
                        }
                    );
            }

            return normalizado;
        });
}

// ============================================================
// MENSAJES A ENVIAR
// ============================================================

function crearGruposMensajesDrops(
    datos,
    onlineMap = {}
) {

    const mensajes = [];

    // --------------------------------------------------------
    // 1. Campaña
    // --------------------------------------------------------

    mensajes.push({
        tipo: "header",
        embeds: [
            crearEmbedCampaña(
                datos
            )
        ]
    });

    // --------------------------------------------------------
    // 2. General Drops
    // --------------------------------------------------------

    if (
        datos.generalDrops?.length
    ) {

        const embedsGenerales =
            datos.generalDrops.map(
                drop =>
                    crearEmbedDrop(
                        drop,
                        onlineMap
                    )
            );

        mensajes.push({
            tipo: "general",
            embeds:
                embedsGenerales.slice(
                    0,
                    10
                )
        });
    }

    // --------------------------------------------------------
    // 3. Streamer Drops
    // --------------------------------------------------------

    if (
        datos.streamerDrops?.length
    ) {

        const embedsStreamer =
            datos.streamerDrops.map(
                drop =>
                    crearEmbedDrop(
                        drop,
                        onlineMap
                    )
            );

        // Discord permite máximo 10 embeds por mensaje.
        for (
            let i = 0;
            i < embedsStreamer.length;
            i += 10
        ) {

            mensajes.push({
                tipo:
                    i === 0
                        ? "streamer"
                        : "streamer_extra",
                embeds:
                    embedsStreamer.slice(
                        i,
                        i + 10
                    )
            });
        }
    }

    return mensajes;
}

// ============================================================
// PUBLICAR RUST DROPS
// ============================================================

async function publicarRustDrops(
    channel,
    datos,
    onlineMap = {}
) {

    const mensajes =
        crearGruposMensajesDrops(
            datos,
            onlineMap
        );

    const enviados = [];

    for (
        const grupo
        of mensajes
    ) {

        try {

            const mensaje =
                await channel.send({
                    embeds:
                        grupo.embeds
                });

            enviados.push({
                channelId:
                    channel.id,

                messageId:
                    mensaje.id,

                tipo:
                    grupo.tipo
            });

        } catch (error) {

            console.error(
                "[Twitch Drops] Error enviando mensaje:",
                error.message
            );
        }
    }

    return enviados;
}

// ============================================================
// EDITAR MENSAJES EXISTENTES
// ============================================================

async function editarMensajesMonitor(
    client,
    monitor,
    datos,
    onlineMap
) {

    if (
        !Array.isArray(
            monitor.mensajes
        )
    ) {
        return false;
    }

    let cambio = false;

    const generalDrops =
        datos.generalDrops || [];

    const streamerDrops =
        datos.streamerDrops || [];

    for (
        const registro
        of monitor.mensajes
    ) {

        try {

            const channel =
                await client.channels.fetch(
                    registro.channelId
                );

            if (!channel) {
                continue;
            }

            const mensaje =
                await channel.messages.fetch(
                    registro.messageId
                );

            if (!mensaje) {
                continue;
            }

            let embeds = [];

            // ------------------------------------------------
            // HEADER
            // ------------------------------------------------

            if (
                registro.tipo ===
                "header"
            ) {

                embeds = [
                    crearEmbedCampaña(
                        datos
                    )
                ];
            }

            // ------------------------------------------------
            // GENERALES
            // ------------------------------------------------

            else if (
                registro.tipo ===
                "general"
            ) {

                embeds =
                    generalDrops.map(
                        drop =>
                            crearEmbedDrop(
                                drop,
                                onlineMap
                            )
                    );
            }

            // ------------------------------------------------
            // STREAMER
            // ------------------------------------------------

            else if (
                registro.tipo ===
                "streamer" ||
                registro.tipo ===
                "streamer_extra"
            ) {

                const indice =
                    registro.tipo ===
                    "streamer"
                        ? 0
                        : 1;

                // Repartir los grupos exactamente igual
                // que al publicar.
                const inicio =
                    indice * 10;

                embeds =
                    streamerDrops
                        .slice(
                            inicio,
                            inicio + 10
                        )
                        .map(
                            drop =>
                                crearEmbedDrop(
                                    drop,
                                    onlineMap
                                )
                        );
            }

            if (!embeds.length) {
                continue;
            }

            await mensaje.edit({
                embeds
            });

            cambio = true;

        } catch (error) {

            console.error(
                "[Twitch Drops] Error editando mensaje:",
                error.message
            );
        }
    }

    return cambio;
}

// ============================================================
// ACTUALIZAR ESTADOS DE STREAMERS
// ============================================================

function actualizarEstadosStreamer(
    drops,
    onlineMap
) {

    let cambio = false;

    for (
        const drop
        of drops
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

            const online =
                onlineMap[
                    login.toLowerCase()
                ]?.online === true;

            if (
                typeof streamer ===
                "string"
            ) {
                continue;
            }

            if (
                streamer.online !==
                online
            ) {

                streamer.online =
                    online;

                cambio = true;
            }
        }
    }

    return cambio;
}

// ============================================================
// REVISIÓN AUTOMÁTICA
// ============================================================

let revisando = false;

async function revisarDropsAutomaticos(
    client
) {

    if (revisando) {
        return;
    }

    revisando = true;

    try {

        const monitores =
            await RustDropsMonitor.find({
                activo: true
            });

        if (!monitores.length) {
            return;
        }

        const datos =
            await obtenerDropsFacepunch();

        if (
            !datos.drops.length
        ) {

            console.log(
                "[Twitch Drops] No se encontraron Drops en Facepunch."
            );

            return;
        }

        const onlineMap =
            await obtenerStreamersOnlineRust(
                datos.streamers
            );

        const campaignKey =
            crearCampaignKey(
                datos
            );

        for (
            const monitor
            of monitores
        ) {

            try {

                const campaignChanged =
                    monitor.campaignKey !==
                    campaignKey;

                // ------------------------------------------------
                // NUEVA CAMPAÑA
                // ------------------------------------------------

                if (
                    campaignChanged ||
                    !Array.isArray(
                        monitor.mensajes
                    ) ||
                    !monitor.mensajes.length
                ) {

                    const channel =
                        await client.channels.fetch(
                            monitor.channelId
                        );

                    if (!channel) {
                        continue;
                    }

                    // Si había una campaña anterior, no borramos
                    // mensajes históricos. La nueva campaña se publica
                    // como nuevo bloque.
                    const mensajes =
                        await publicarRustDrops(
                            channel,
                            datos,
                            onlineMap
                        );

                    monitor.drops =
                        convertirDatosAGuardado(
                            datos,
                            onlineMap
                        );

                    monitor.mensajes =
                        mensajes;

                    monitor.campaignKey =
                        campaignKey;

                    // Guardar metadata de campaña si el modelo
                    // tiene estos campos.
                    if (
                        "campaignTitle"
                        in monitor
                    ) {
                        monitor.campaignTitle =
                            datos.campaignTitle;
                    }

                    if (
                        "campaignName"
                        in monitor
                    ) {
                        monitor.campaignName =
                            datos.campaignName;
                    }

                    if (
                        "campaignStart"
                        in monitor
                    ) {
                        monitor.campaignStart =
                            datos.campaignStart
                                ? new Date(
                                    datos.campaignStart
                                )
                                : null;
                    }

                    if (
                        "campaignEnd"
                        in monitor
                    ) {
                        monitor.campaignEnd =
                            datos.campaignEnd
                                ? new Date(
                                    datos.campaignEnd
                                )
                                : null;
                    }

                    await monitor.save();

                    console.log(
                        `[Twitch Drops] Nueva campaña publicada en ${monitor.channelId}`
                    );

                    continue;
                }

                // ------------------------------------------------
                // MISMA CAMPAÑA
                // ------------------------------------------------

                const dropsGuardados =
                    Array.isArray(
                        monitor.drops
                    )
                        ? monitor.drops.map(
                            normalizarDropGuardado
                        )
                        : [];

                const cambioStreamer =
                    actualizarEstadosStreamer(
                        dropsGuardados,
                        onlineMap
                    );

                if (
                    cambioStreamer
                ) {

                    monitor.drops =
                        dropsGuardados;

                    await monitor.save();

                    await editarMensajesMonitor(
                        client,
                        monitor,
                        {
                            ...datos,
                            drops:
                                dropsGuardados,
                            generalDrops:
                                dropsGuardados.filter(
                                    drop =>
                                        drop.tipo ===
                                        "general"
                                ),
                            streamerDrops:
                                dropsGuardados.filter(
                                    drop =>
                                        drop.tipo ===
                                        "streamer"
                                )
                        },
                        onlineMap
                    );

                    console.log(
                        `[Twitch Drops] Estado de streamer actualizado en ${monitor.channelId}`
                    );
                }

            } catch (error) {

                console.error(
                    `[Twitch Drops] Error procesando monitor ${monitor._id}:`,
                    error.message
                );
            }
        }

    } catch (error) {

        console.error(
            "[Twitch Drops] Error en revisión automática:",
            error.response?.data ||
            error.message
        );

    } finally {

        revisando = false;
    }
}

// ============================================================
// INICIAR SERVICIO AUTOMÁTICO
// ============================================================

let intervaloAutomatico = null;

function iniciarDropsAutomaticos(
    client
) {

    if (intervaloAutomatico) {
        return;
    }

    console.log(
        "[Twitch Drops] Servicio automático iniciado."
    );

    setTimeout(
        () => {

            revisarDropsAutomaticos(
                client
            ).catch(error => {

                console.error(
                    "[Twitch Drops] Error inicial:",
                    error.message
                );
            });

        },
        5000
    );

    intervaloAutomatico =
        setInterval(
            () => {

                revisarDropsAutomaticos(
                    client
                ).catch(error => {

                    console.error(
                        "[Twitch Drops] Error automático:",
                        error.message
                    );
                });

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

    crearEmbedCampaña,

    crearGruposMensajesDrops,

    publicarRustDrops,

    revisarDropsAutomaticos,

    iniciarDropsAutomaticos

};