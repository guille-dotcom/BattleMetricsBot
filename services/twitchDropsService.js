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
// CONTROL DEL SERVICIO
// ============================================================

let intervaloAutomatico = null;
let revisando = false;

// ============================================================
// UTILIDADES
// ============================================================

function limpiarTexto(texto) {

    return String(texto || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function limpiarNombreDrop(nombre) {

    nombre =
        limpiarTexto(nombre);

    if (!nombre) {
        return "";
    }

    nombre =
        nombre
            .replace(
                /^loading\s*\.\.\.\s*/i,
                ""
            )
            .replace(
                /^loading\s*…\s*/i,
                ""
            )
            .replace(
                /\s+loading\s*\.\.\.$/i,
                ""
            )
            .replace(
                /\s+loading\s*…$/i,
                ""
            );

    return limpiarTexto(nombre);
}

function normalizarUrlImagen(url) {

    if (!url) {
        return null;
    }

    url =
        String(url)
            .trim()
            .replace(
                /&amp;/g,
                "&"
            );

    if (!url) {
        return null;
    }

    if (
        url.startsWith("data:")
    ) {
        return null;
    }

    if (
        url.startsWith("//")
    ) {
        return `https:${url}`;
    }

    if (
        url.startsWith("/")
    ) {
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

    const partes =
        String(srcset)
            .split(",")
            .map(
                parte =>
                    parte.trim()
            )
            .filter(Boolean);

    if (!partes.length) {
        return null;
    }

    const ultimo =
        partes[
            partes.length - 1
        ]
            .split(/\s+/)[0];

    return normalizarUrlImagen(
        ultimo
    );
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

    return normalizarUrlImagen(
        match[1]
    );
}

// ============================================================
// IMÁGENES
// ============================================================

function extraerImagenElemento(
    $,
    elemento
) {

    if (
        !elemento ||
        !elemento.length
    ) {
        return null;
    }

    let imagen = null;

    const selectores = [
        "img",
        "source",
        "[style*='background-image']",
        "[style*='background']"
    ];

    for (
        const selector
        of selectores
    ) {

        elemento
            .find(selector)
            .each((_, el) => {

                if (imagen) {
                    return;
                }

                const $el =
                    $(el);

                const atributos = [
                    "src",
                    "data-src",
                    "data-image",
                    "data-img",
                    "data-lazy-src",
                    "data-original",
                    "data-url"
                ];

                for (
                    const atributo
                    of atributos
                ) {

                    const valor =
                        $el.attr(
                            atributo
                        );

                    if (!valor) {
                        continue;
                    }

                    const url =
                        normalizarUrlImagen(
                            valor
                        );

                    if (url) {

                        imagen =
                            url;

                        return;
                    }
                }

                if (imagen) {
                    return;
                }

                const srcset =
                    $el.attr(
                        "srcset"
                    ) ||
                    $el.attr(
                        "data-srcset"
                    );

                if (srcset) {

                    const url =
                        extraerPrimeraUrlSrcset(
                            srcset
                        );

                    if (url) {

                        imagen =
                            url;

                        return;
                    }
                }

                const style =
                    $el.attr(
                        "style"
                    );

                if (style) {

                    const url =
                        extraerUrlBackground(
                            style
                        );

                    if (url) {

                        imagen =
                            url;
                    }
                }
            });

        if (imagen) {
            return imagen;
        }
    }

    const style =
        elemento.attr(
            "style"
        );

    if (style) {

        const url =
            extraerUrlBackground(
                style
            );

        if (url) {
            return url;
        }
    }

    return null;
}

// ============================================================
// DURACIÓN
// ============================================================

function extraerHoras(texto) {

    texto =
        limpiarTexto(texto);

    if (!texto) {
        return null;
    }

    let match =
        texto.match(
            /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i
        );

    if (match) {

        return Number(
            match[1]
        );
    }

    match =
        texto.match(
            /(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)\b/i
        );

    if (match) {

        return (
            Number(match[1]) /
            60
        );
    }

    return null;
}

function formatearDuracion(horas) {

    if (
        horas === null ||
        horas === undefined ||
        Number.isNaN(
            Number(horas)
        )
    ) {
        return "—";
    }

    horas =
        Number(horas);

    if (horas < 1) {

        const minutos =
            Math.round(
                horas * 60
            );

        return (
            `${minutos} minuto` +
            `${minutos === 1 ? "" : "s"}`
        );
    }

    if (
        Number.isInteger(horas)
    ) {

        return (
            `${horas} hora` +
            `${horas === 1 ? "" : "s"}`
        );
    }

    return `${horas} horas`;
}

// ============================================================
// FECHAS
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
    setiembre: 8,
    octubre: 9,
    noviembre: 10,
    diciembre: 11
};

const MESES_EN = {
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
    december: 11,
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    sept: 8,
    oct: 9,
    nov: 10,
    dec: 11
};

function parsearFechaFacepunch(
    texto
) {

    if (!texto) {
        return null;
    }

    texto =
        limpiarTexto(texto);

    // ========================================================
    // ESPAÑOL
    //
    // 23 de octubre de 2026 a las 15:00 GMT-3
    // ========================================================

    let regex =
        /(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})\s+a\s+las\s+(\d{1,2}):(\d{2})\s+GMT\s*([+-]\d{1,2})(?::?(\d{2}))?/i;

    let match =
        texto.match(
            regex
        );

    if (match) {

        const dia =
            Number(match[1]);

        const mesNombre =
            match[2]
                .toLowerCase()
                .normalize("NFD")
                .replace(
                    /[\u0300-\u036f]/g,
                    ""
                );

        const mes =
            MESES_ES[
                mesNombre
            ];

        const año =
            Number(match[3]);

        const hora =
            Number(match[4]);

        const minuto =
            Number(match[5]);

        const offsetHoras =
            Number(match[6]);

        const offsetMinutos =
            Number(match[7] || 0);

        if (
            mes === undefined ||
            Number.isNaN(mes)
        ) {
            return null;
        }

        const offsetTotalMinutos =
            (
                offsetHoras *
                60
            ) +
            (
                offsetHoras >= 0
                    ? offsetMinutos
                    : -offsetMinutos
            );

        const utc =
            Date.UTC(
                año,
                mes,
                dia,
                hora,
                minuto
            ) -
            (
                offsetTotalMinutos *
                60 *
                1000
            );

        return new Date(utc);
    }

    // ========================================================
    // INGLÉS
    //
    // October 23, 2026 at 15:00 GMT-3
    // Oct 23, 2026 at 15:00 GMT-3
    // ========================================================

    regex =
        /([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\s+(?:at\s+)?(\d{1,2}):(\d{2})\s*([AP]M)?\s*GMT\s*([+-]\d{1,2})(?::?(\d{2}))?/i;

    match =
        texto.match(
            regex
        );

    if (match) {

        const mesNombre =
            match[1]
                .toLowerCase();

        const mes =
            MESES_EN[
                mesNombre
            ];

        const dia =
            Number(match[2]);

        const año =
            Number(match[3]);

        let hora =
            Number(match[4]);

        const minuto =
            Number(match[5]);

        const ampm =
            match[6];

        const offsetHoras =
            Number(match[7]);

        const offsetMinutos =
            Number(match[8] || 0);

        if (
            mes === undefined
        ) {
            return null;
        }

        if (ampm) {

            if (
                /^PM$/i.test(
                    ampm
                ) &&
                hora < 12
            ) {
                hora += 12;
            }

            if (
                /^AM$/i.test(
                    ampm
                ) &&
                hora === 12
            ) {
                hora = 0;
            }
        }

        const offsetTotalMinutos =
            (
                offsetHoras *
                60
            ) +
            (
                offsetHoras >= 0
                    ? offsetMinutos
                    : -offsetMinutos
            );

        const utc =
            Date.UTC(
                año,
                mes,
                dia,
                hora,
                minuto
            ) -
            (
                offsetTotalMinutos *
                60 *
                1000
            );

        return new Date(utc);
    }

    // ========================================================
    // FORMATO CON COMA
    //
    // October 23, 2026, 15:00 GMT-3
    // ========================================================

    regex =
        /([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4}),?\s+(\d{1,2}):(\d{2})\s*([AP]M)?\s*GMT\s*([+-]\d{1,2})(?::?(\d{2}))?/i;

    match =
        texto.match(
            regex
        );

    if (match) {

        const mes =
            MESES_EN[
                match[1].toLowerCase()
            ];

        const dia =
            Number(match[2]);

        const año =
            Number(match[3]);

        let hora =
            Number(match[4]);

        const minuto =
            Number(match[5]);

        const ampm =
            match[6];

        const offsetHoras =
            Number(match[7]);

        const offsetMinutos =
            Number(match[8] || 0);

        if (
            mes === undefined
        ) {
            return null;
        }

        if (ampm) {

            if (
                /^PM$/i.test(
                    ampm
                ) &&
                hora < 12
            ) {
                hora += 12;
            }

            if (
                /^AM$/i.test(
                    ampm
                ) &&
                hora === 12
            ) {
                hora = 0;
            }
        }

        const offsetTotalMinutos =
            (
                offsetHoras *
                60
            ) +
            (
                offsetHoras >= 0
                    ? offsetMinutos
                    : -offsetMinutos
            );

        const utc =
            Date.UTC(
                año,
                mes,
                dia,
                hora,
                minuto
            ) -
            (
                offsetTotalMinutos *
                60 *
                1000
            );

        return new Date(utc);
    }

    // ========================================================
    // FECHA ISO / DATE NORMAL
    // ========================================================

    const fecha =
        new Date(
            texto
        );

    if (
        !Number.isNaN(
            fecha.getTime()
        ) &&
        /\d{4}-\d{2}-\d{2}/.test(
            texto
        )
    ) {

        return fecha;
    }

    return null;
}

function extraerFechasCampaña(
    $,
    textoPagina
) {

    let inicio = null;
    let fin = null;

    // ========================================================
    // ATRIBUTOS DATETIME
    // ========================================================

    const fechasAtributos = [];

    $(
        "[datetime], [data-start], [data-end], [data-start-date], [data-end-date], [data-start-time], [data-end-time]"
    ).each((_, elemento) => {

        const $elemento =
            $(elemento);

        const atributos = [
            "datetime",
            "data-start",
            "data-end",
            "data-start-date",
            "data-end-date",
            "data-start-time",
            "data-end-time"
        ];

        for (
            const atributo
            of atributos
        ) {

            const valor =
                $elemento.attr(
                    atributo
                );

            if (!valor) {
                continue;
            }

            const fecha =
                parsearFechaFacepunch(
                    valor
                );

            if (fecha) {

                fechasAtributos.push({
                    atributo,
                    fecha
                });
            }
        }
    });

    const inicioAtributo =
        fechasAtributos.find(
            item =>
                /start/i.test(
                    item.atributo
                )
        );

    const finAtributo =
        fechasAtributos.find(
            item =>
                /end/i.test(
                    item.atributo
                )
        );

    if (inicioAtributo) {
        inicio =
            inicioAtributo.fecha;
    }

    if (finAtributo) {
        fin =
            finAtributo.fecha;
    }

    // ========================================================
    // TEXTO VISIBLE
    // ========================================================

    const texto =
        limpiarTexto(
            textoPagina
        );

    // ========================================================
    // ESPAÑOL: DOS FECHAS
    // ========================================================

    if (!inicio || !fin) {

        const regexES =
            /(\d{1,2}\s+de\s+[a-záéíóú]+\s+de\s+\d{4}\s+a\s+las\s+\d{1,2}:\d{2}\s+GMT\s*[+-]\d{1,2}(?::?\d{2})?)\s*(?:-|–|—|hasta|to)\s*(\d{1,2}\s+de\s+[a-záéíóú]+\s+de\s+\d{4}\s+a\s+las\s+\d{1,2}:\d{2}\s+GMT\s*[+-]\d{1,2}(?::?\d{2})?)/i;

        const match =
            texto.match(
                regexES
            );

        if (match) {

            const fechaInicio =
                parsearFechaFacepunch(
                    match[1]
                );

            const fechaFin =
                parsearFechaFacepunch(
                    match[2]
                );

            if (fechaInicio) {
                inicio =
                    fechaInicio;
            }

            if (fechaFin) {
                fin =
                    fechaFin;
            }
        }
    }

    // ========================================================
    // INGLÉS: MES DÍA, AÑO
    // ========================================================

    if (!inicio || !fin) {

        const regexEN =
            /([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}\s+(?:at\s+)?\d{1,2}:\d{2}\s*(?:AM|PM)?\s*GMT\s*[+-]\d{1,2}(?::?\d{2})?)\s*(?:-|–|—|to|until)\s*([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}\s+(?:at\s+)?\d{1,2}:\d{2}\s*(?:AM|PM)?\s*GMT\s*[+-]\d{1,2}(?::?\d{2})?)/i;

        const match =
            texto.match(
                regexEN
            );

        if (match) {

            const fechaInicio =
                parsearFechaFacepunch(
                    match[1]
                );

            const fechaFin =
                parsearFechaFacepunch(
                    match[2]
                );

            if (fechaInicio) {
                inicio =
                    fechaInicio;
            }

            if (fechaFin) {
                fin =
                    fechaFin;
            }
        }
    }

    // ========================================================
    // FECHAS INDIVIDUALES EN ESPAÑOL
    // ========================================================

    if (!inicio || !fin) {

        const regexES =
            /\d{1,2}\s+de\s+[a-záéíóú]+\s+de\s+\d{4}\s+a\s+las\s+\d{1,2}:\d{2}\s+GMT\s*[+-]\d{1,2}(?::?\d{2})?/gi;

        const matches =
            texto.match(
                regexES
            ) || [];

        const fechas =
            matches
                .map(
                    valor =>
                        parsearFechaFacepunch(
                            valor
                        )
                )
                .filter(Boolean);

        if (
            !inicio &&
            fechas.length >= 1
        ) {
            inicio =
                fechas[0];
        }

        if (
            !fin &&
            fechas.length >= 2
        ) {
            fin =
                fechas[1];
        }
    }

    // ========================================================
    // FECHAS INDIVIDUALES EN INGLÉS
    // ========================================================

    if (!inicio || !fin) {

        const regexEN =
            /[A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}\s+(?:at\s+)?\d{1,2}:\d{2}\s*(?:AM|PM)?\s*GMT\s*[+-]\d{1,2}(?::?\d{2})?/gi;

        const matches =
            texto.match(
                regexEN
            ) || [];

        const fechas =
            matches
                .map(
                    valor =>
                        parsearFechaFacepunch(
                            valor
                        )
                )
                .filter(Boolean);

        if (
            !inicio &&
            fechas.length >= 1
        ) {
            inicio =
                fechas[0];
        }

        if (
            !fin &&
            fechas.length >= 2
        ) {
            fin =
                fechas[1];
        }
    }

    // ========================================================
    // SCRIPTS
    // ========================================================

    const scripts =
        $("script")
            .map(
                (_, elemento) =>
                    $(elemento).html() || ""
            )
            .get()
            .join("\n");

    // ========================================================
    // CAMPOS START / END EN JSON
    // ========================================================

    if (
        scripts &&
        (!inicio || !fin)
    ) {

        const patronesInicio = [
            /["'](?:startDate|start_date|startTime|start_time|campaignStart|campaign_start)["']\s*:\s*["']([^"']+)["']/gi,
            /(?:startDate|start_date|startTime|start_time|campaignStart|campaign_start)\s*=\s*["']([^"']+)["']/gi
        ];

        const patronesFin = [
            /["'](?:endDate|end_date|endTime|end_time|campaignEnd|campaign_end)["']\s*:\s*["']([^"']+)["']/gi,
            /(?:endDate|end_date|endTime|end_time|campaignEnd|campaign_end)\s*=\s*["']([^"']+)["']/gi
        ];

        for (
            const regex
            of patronesInicio
        ) {

            const match =
                regex.exec(
                    scripts
                );

            if (!match) {
                continue;
            }

            const fecha =
                parsearFechaFacepunch(
                    match[1]
                );

            if (fecha) {

                inicio =
                    fecha;

                break;
            }
        }

        for (
            const regex
            of patronesFin
        ) {

            const match =
                regex.exec(
                    scripts
                );

            if (!match) {
                continue;
            }

            const fecha =
                parsearFechaFacepunch(
                    match[1]
                );

            if (fecha) {

                fin =
                    fecha;

                break;
            }
        }
    }

    // ========================================================
    // ISO EN SCRIPTS
    // ========================================================

    if (!inicio || !fin) {

        const isoRegex =
            /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})/g;

        const fechasISO =
            scripts.match(
                isoRegex
            ) || [];

        const fechasValidas =
            fechasISO
                .map(
                    valor =>
                        new Date(valor)
                )
                .filter(
                    fecha =>
                        !Number.isNaN(
                            fecha.getTime()
                        )
                );

        if (
            !inicio &&
            fechasValidas.length >= 1
        ) {

            inicio =
                fechasValidas[0];
        }

        if (
            !fin &&
            fechasValidas.length >= 2
        ) {

            fin =
                fechasValidas[1];
        }
    }

    return {
        inicio,
        fin
    };
}

// ============================================================
// INFORMACIÓN DE CAMPAÑA
// ============================================================

function extraerInformacionCampaña($) {

    const textoPagina =
        limpiarTexto(
            $("body").text()
        );

    let titulo = "";
    let nombre = "";
    let estado = "";

    // ========================================================
    // ESTADO
    // ========================================================

    const matchEstado =
        textoPagina.match(
            /\b(Upcoming|Active|Ended)\b/i
        );

    if (matchEstado) {

        estado =
            matchEstado[1];
    }

    // ========================================================
    // TÍTULO
    // ========================================================

    const elementos =
        $("h1, h2, h3, h4, h5, h6, strong, b");

    elementos.each((_, elemento) => {

        if (titulo) {
            return;
        }

        const texto =
            limpiarTexto(
                $(elemento)
                    .clone()
                    .children()
                    .remove()
                    .end()
                    .text()
            );

        if (
            /^Twitch Drops Round\s+\d+/i.test(
                texto
            )
        ) {

            titulo =
                texto;
        }
    });

    if (!titulo) {

        const match =
            textoPagina.match(
                /(Twitch Drops Round\s+\d+.*?Hosted by\s+[A-Za-z0-9_.™'-]+)/i
            );

        if (match) {

            titulo =
                limpiarTexto(
                    match[1]
                );
        }
    }

    // ========================================================
    // NOMBRE / TEMA
    // ========================================================

    const headings =
        $("h1, h2, h3");

    headings.each((_, elemento) => {

        if (nombre) {
            return;
        }

        const texto =
            limpiarTexto(
                $(elemento).text()
            );

        if (!texto) {
            return;
        }

        if (
            /Twitch Drops Round/i.test(
                texto
            )
        ) {
            return;
        }

        if (
            /General Drops/i.test(
                texto
            )
        ) {
            return;
        }

        if (
            /Streamer Drops/i.test(
                texto
            )
        ) {
            return;
        }

        if (
            /Upcoming|Active|Ended/i.test(
                texto
            )
        ) {
            return;
        }

        if (
            texto.length <= 80
        ) {

            nombre =
                texto;
        }
    });

    if (!nombre) {

        const match =
            textoPagina.match(
                /Twitch Drops Round\s+\d+[^\n]*?\s+(Base Invaders)\s+/i
            );

        if (match) {

            nombre =
                limpiarTexto(
                    match[1]
                );
        }
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
// CONTENEDOR DE DROP
// ============================================================

function encontrarContenedorDrop(
    $,
    elemento
) {

    let actual =
        elemento;

    for (
        let nivel = 0;
        nivel < 12;
        nivel++
    ) {

        if (
            !actual ||
            !actual.length
        ) {
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

        if (
            tieneDuracion &&
            texto.length < 350
        ) {

            return actual;
        }

        actual =
            actual.parent();
    }

    return elemento.parent();
}

// ============================================================
// NOMBRE DE DROP
// ============================================================

function extraerNombreDesdeCard(
    $,
    card,
    opciones = {}
) {

    if (
        !card ||
        !card.length
    ) {
        return "";
    }

    const candidatos = [];

    const streamer =
        opciones.streamer ||
        "";

    // ========================================================
    // ENLACES
    // ========================================================

    card.find("a").each((_, elemento) => {

        const $a =
            $(elemento);

        const href =
            String(
                $a.attr("href") ||
                ""
            );

        const texto =
            limpiarTexto(
                $a.text()
            );

        if (!texto) {
            return;
        }

        if (
            /directory\/category\/rust/i.test(
                href
            )
        ) {

            candidatos.push(
                texto
            );

            return;
        }

        if (
            /^https?:\/\/(?:www\.)?twitch\.tv\/[^/]+\/?$/i.test(
                href
            )
        ) {
            return;
        }

        if (
            /claimed/i.test(
                texto
            )
        ) {
            return;
        }

        if (
            /^video$/i.test(
                texto
            )
        ) {
            return;
        }

        if (
            /\b\d+(?:\.\d+)?\s*(?:hour|hours|minute|minutes|h|m)\b/i.test(
                texto
            )
        ) {
            return;
        }

        candidatos.push(
            texto
        );
    });

    // ========================================================
    // SELECTORES DE NOMBRE
    // ========================================================

    const selectores = [
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
        "strong",
        "b"
    ];

    for (
        const selector
        of selectores
    ) {

        card
            .find(selector)
            .each((_, elemento) => {

                const texto =
                    limpiarTexto(
                        $(elemento).text()
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
                    /^loading/i.test(
                        texto
                    )
                ) {
                    return;
                }

                if (
                    /claimed/i.test(
                        texto
                    )
                ) {
                    return;
                }

                if (
                    /\b\d+(?:\.\d+)?\s*(?:hour|hours|minute|minutes|h|m)\b/i.test(
                        texto
                    )
                ) {
                    return;
                }

                candidatos.push(
                    texto
                );
            });
    }

    const prohibidos = [
        /^video$/i,
        /^online$/i,
        /^random$/i,
        /^available/i,
        /^what'?s available/i,
        /^general drops/i,
        /^streamer drops/i,
        /^loading/i,

        // ====================================================
        // ELEMENTOS DE LA INTERFAZ DE TWITCH
        // ====================================================

        /^twitch$/i,
        /^twitch account$/i,
        /^twitch drops$/i,
        /^twitch account drops$/i,
        /^account$/i,
        /^sign in$/i,
        /^log in$/i,
        /^login$/i
    ];

    const nombres =
        candidatos
            .map(
                limpiarNombreDrop
            )
            .filter(Boolean)
            .filter(
                nombre =>
                    !prohibidos.some(
                        regex =>
                            regex.test(
                                nombre
                            )
                    )
            )
            .filter(
                nombre =>
                    !/^\d+\s*(?:hour|hours|minute|minutes|h|m)$/i.test(
                        nombre
                    )
            );

    if (!nombres.length) {
        return "";
    }

    if (
        streamer &&
        nombres[0].toLowerCase() ===
        streamer.toLowerCase()
    ) {

        const otro =
            nombres.find(
                nombre =>
                    nombre.toLowerCase() !==
                    streamer.toLowerCase()
            );

        if (otro) {
            return otro;
        }

        return "";
    }

    return nombres[0];
}

// ============================================================
// GENERAL DROPS
// ============================================================

function extraerGeneralDrops($) {

    const drops = [];

    $(
        "a[href*='twitch.tv/directory/category/rust']"
    ).each((_, elemento) => {

        const $a =
            $(elemento);

        const texto =
            limpiarTexto(
                $a.text()
            );

        if (!texto) {
            return;
        }

        const horas =
            extraerHoras(
                texto
            );

        if (horas == null) {
            return;
        }

        const card =
            encontrarContenedorDrop(
                $,
                $a
            );

        let nombre =
            limpiarNombreDrop(
                texto.replace(
                    /\b\d+(?:\.\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?|m)\b/i,
                    ""
                )
            );

        if (
            !nombre ||
            /^video$/i.test(nombre)
        ) {

            nombre =
                extraerNombreDesdeCard(
                    $,
                    card
                );
        }

        nombre =
            limpiarNombreDrop(
                nombre
            );

        if (!nombre) {
            return;
        }

        if (
            /^(?:video|claimed|twitch|twitch account|twitch drops)$/i.test(
                nombre
            )
        ) {
            return;
        }

        const imagen =
            extraerImagenElemento(
                $,
                card
            );

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

            tipo:
                "general",

            nombre,

            horas,

            imagen:
                imagen || null,

            streamers:
                []
        });
    });

    return drops;
}

// ============================================================
// STREAMER DROPS
// ============================================================

function extraerStreamerDrops($) {

    const drops = [];

    const streamersProcesados =
        new Set();

    $(
        "a[href]"
    ).each((_, elemento) => {

        const $a =
            $(elemento);

        const href =
            String(
                $a.attr("href") ||
                ""
            );

        // ====================================================
        // SOLO LINKS DIRECTOS A TWITCH
        // ====================================================

        if (
            !/^https?:\/\/(?:www\.)?twitch\.tv\/[^/]+\/?$/i.test(
                href
            )
        ) {
            return;
        }

        if (
            /directory/i.test(
                href
            )
        ) {
            return;
        }

        let streamer =
            limpiarTexto(
                $a.text()
            );

        if (!streamer) {

            const partes =
                href
                    .split("/")
                    .filter(Boolean);

            streamer =
                partes[
                    partes.length - 1
                ];
        }

        if (!streamer) {
            return;
        }

        // ====================================================
        // FILTRAR ELEMENTOS QUE NO SON STREAMERS
        // ====================================================

        const login =
            streamer
                .toLowerCase()
                .replace(
                    /^@/,
                    ""
                );

        const streamersInvalidos = new Set([
            "twitch",
            "twitchaccount",
            "twitch-account",
            "twitch_account",
            "twitchdrops",
            "twitch-drops",
            "twitch_drops",
            "account",
            "login",
            "signin",
            "sign-in",
            "signup",
            "sign-up",
            "directory",
            "search",
            "videos",
            "browse"
        ]);

        if (
            streamersInvalidos.has(
                login
            )
        ) {
            return;
        }

        // ====================================================
        // EVITAR DUPLICADOS
        // ====================================================

        if (
            streamersProcesados.has(
                login
            )
        ) {
            return;
        }

        // ====================================================
        // CONTENEDOR
        // ====================================================

        const card =
            encontrarContenedorDrop(
                $,
                $a
            );

        const textoCard =
            limpiarTexto(
                card.text()
            );

        // ====================================================
        // DEBE TENER DURACIÓN
        // ====================================================

        const horas =
            extraerHoras(
                textoCard
            );

        if (horas == null) {
            return;
        }

        // ====================================================
        // EVITAR CARDS QUE NO SON STREAMER DROPS
        //
        // Si el contenedor únicamente representa navegación
        // de Twitch, no lo consideramos Drop.
        // ====================================================

        if (
            /\b(?:general drops|available on|all streams)\b/i.test(
                textoCard
            ) &&
            !/\bstreamer drops\b/i.test(
                textoCard
            )
        ) {
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

        if (nombre) {

            nombre =
                nombre
                    .replace(
                        new RegExp(
                            `^${streamer}\\s+`,
                            "i"
                        ),
                        ""
                    )
                    .replace(
                        /loading\s*\.\.\./gi,
                        ""
                    )
                    .replace(
                        /loading\s*…/gi,
                        ""
                    )
                    .trim();
        }

        // ====================================================
        // CANDIDATOS ALTERNATIVOS
        // ====================================================

        if (
            !nombre ||
            nombre.toLowerCase() ===
            login
        ) {

            const candidatos = [];

            card.find("*").each(
                (_, nodo) => {

                    const texto =
                        limpiarTexto(
                            $(nodo)
                                .clone()
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

                    const textoNormalizado =
                        texto
                            .toLowerCase()
                            .replace(
                                /\s+/g,
                                " "
                            )
                            .trim();

                    if (
                        textoNormalizado ===
                        login
                    ) {
                        return;
                    }

                    if (
                        textoNormalizado ===
                        streamer.toLowerCase()
                    ) {
                        return;
                    }

                    if (
                        /^(?:twitch|twitch account|twitch drops|account|login|sign in|log in)$/i.test(
                            texto
                        )
                    ) {
                        return;
                    }

                    if (
                        /loading/i.test(
                            texto
                        )
                    ) {
                        return;
                    }

                    if (
                        /claimed/i.test(
                            texto
                        )
                    ) {
                        return;
                    }

                    if (
                        /\b\d+(?:\.\d+)?\s*(?:hour|hours|minute|minutes|h|m)\b/i.test(
                            texto
                        )
                    ) {
                        return;
                    }

                    candidatos.push(
                        texto
                    );
                }
            );

            if (candidatos.length) {

                nombre =
                    limpiarNombreDrop(
                        candidatos[0]
                    );
            }
        }

        if (!nombre) {
            return;
        }

        // ====================================================
        // FILTRO FINAL DE SEGURIDAD
        // ====================================================

        if (
            /^(?:twitch|twitch account|twitch drops|account|login|sign in|log in)$/i.test(
                nombre
            )
        ) {
            return;
        }

        if (
            /^twitch\s+(?:account|drops)$/i.test(
                nombre
            )
        ) {
            return;
        }

        if (
            nombre.length > 80
        ) {
            return;
        }

        // ====================================================
        // IMAGEN
        // ====================================================

        const imagen =
            extraerImagenElemento(
                $,
                card
            );

        // ====================================================
        // CREAR DROP
        // ====================================================

        let drop =
            drops.find(
                item =>
                    item.nombre.toLowerCase() ===
                    nombre.toLowerCase()
            );

        if (!drop) {

            drop = {

                tipo:
                    "streamer",

                nombre,

                horas,

                imagen:
                    imagen || null,

                streamers:
                    []
            };

            drops.push(
                drop
            );
        }

        // ====================================================
        // ASOCIAR STREAMER
        // ====================================================

        const yaExiste =
            drop.streamers.some(
                item => {

                    const itemLogin =
                        typeof item === "string"
                            ? item
                            : item.login;

                    return (
                        String(
                            itemLogin || ""
                        ).toLowerCase() ===
                        login
                    );
                }
            );

        if (!yaExiste) {

            drop.streamers.push({

                login,

                nombre:
                    streamer,

                online:
                    false
            });
        }

        streamersProcesados.add(
            login
        );
    });

    return drops;
}

// ============================================================
// OBTENER DROPS DE FACEPUNCH
// ============================================================

async function obtenerDropsFacepunch() {

    const response =
        await axios.get(
            FACEPUNCH_DROPS_URL,
            {
                headers:
                    FACEPUNCH_HEADERS,

                timeout:
                    30000
            }
        );

    const html =
        response.data;

    if (
        !html ||
        typeof html !== "string"
    ) {

        throw new Error(
            "Facepunch no devolvió HTML válido."
        );
    }

    const $ =
        cheerio.load(
            html
        );

    const campaña =
        extraerInformacionCampaña(
            $
        );

    const generalDrops =
        extraerGeneralDrops(
            $
        );

    const streamerDrops =
        extraerStreamerDrops(
            $
        );

    const drops = [
        ...generalDrops,
        ...streamerDrops
    ];

    const streamers = [
        ...new Set(
            streamerDrops.flatMap(
                drop =>
                    (
                        drop.streamers ||
                        []
                    )
                        .map(
                            streamer =>
                                typeof streamer === "string"
                                    ? streamer
                                    : streamer.login
                        )
                        .filter(Boolean)
            )
        )
    ];

    console.log(
        `[Twitch Drops] Campaña: ${campaña.titulo || "sin título"}`
    );

    console.log(
        `[Twitch Drops] Tema: ${campaña.nombre || "sin tema"}`
    );

    console.log(
        `[Twitch Drops] Estado: ${campaña.estado || "desconocido"}`
    );

    console.log(
        `[Twitch Drops] Inicio: ${campaña.fechaInicio || "no encontrado"}`
    );

    console.log(
        `[Twitch Drops] Final: ${campaña.fechaFin || "no encontrado"}`
    );

    console.log(
        `[Twitch Drops] General Drops: ${generalDrops.length}`
    );

    for (
        const drop
        of generalDrops
    ) {

        console.log(
            `[Twitch Drops] 📦 ${drop.nombre} | ${formatearDuracion(drop.horas)} | imagen=${drop.imagen ? "SI" : "NO"}`
        );
    }

    console.log(
        `[Twitch Drops] Streamer Drops: ${streamerDrops.length}`
    );

    for (
        const drop
        of streamerDrops
    ) {

        const asociados =
            (
                drop.streamers ||
                []
            )
                .map(
                    streamer =>
                        typeof streamer === "string"
                            ? streamer
                            : streamer.login
                )
                .join(", ");

        console.log(
            `[Twitch Drops] 🎯 ${drop.nombre} | ${formatearDuracion(drop.horas)} | ${asociados} | imagen=${drop.imagen ? "SI" : "NO"}`
        );
    }

    console.log(
        `[Twitch Drops] Streamers asociados: ${streamers.length}`
    );

    return {

        estado:
            campaña.estado,

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
// TOKEN TWITCH
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
            "Faltan TWITCH_CLIENT_ID o TWITCH_CLIENT_SECRET."
        );
    }

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
                    15000
            }
        );

    twitchAccessToken =
        response.data.access_token;

    twitchTokenExpira =
        Date.now() +
        (
            Number(
                response.data.expires_in ||
                3600
            ) - 300
        ) *
        1000;

    return twitchAccessToken;
}

// ============================================================
// STREAMERS ONLINE EN RUST
// ============================================================

async function obtenerStreamersOnlineRust(
    logins
) {

    const resultado = {};

    const unicos =
        [
            ...new Set(
                (
                    logins ||
                    []
                )
                    .map(
                        login =>
                            typeof login === "string"
                                ? login
                                : login.login
                    )
                    .filter(Boolean)
                    .map(
                        login =>
                            String(
                                login
                            )
                                .toLowerCase()
                                .replace(
                                    /^@/,
                                    ""
                                )
                    )
                    .filter(Boolean)
            )
        ];

    if (!unicos.length) {
        return resultado;
    }

    try {

        const token =
            await obtenerTwitchAccessToken();

        const clientId =
            process.env.TWITCH_CLIENT_ID;

        if (!clientId) {
            throw new Error(
                "Falta TWITCH_CLIENT_ID."
            );
        }

        const headers = {

            "Client-ID":
                clientId,

            "Authorization":
                `Bearer ${token}`,

            "Accept":
                "application/json"
        };

        // ====================================================
        // TWITCH NO ACEPTA BIEN EL ARRAY DE AXIOS:
        //
        // user_login[]=a&user_login[]=b
        //
        // Construimos manualmente:
        //
        // user_login=a&user_login=b
        // ====================================================

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

            const parametros = [
                `game_id=${encodeURIComponent(
                    TWITCH_GAME_ID_RUST
                )}`
            ];

            for (
                const login
                of lote
            ) {

                parametros.push(
                    `user_login=${encodeURIComponent(
                        login
                    )}`
                );
            }

            const url =
                `${TWITCH_API}/streams?${parametros.join("&")}`;

            const response =
                await axios.get(
                    url,
                    {
                        headers,

                        timeout:
                            15000
                    }
                );

            for (
                const stream
                of (
                    response.data?.data ||
                    []
                )
            ) {

                const login =
                    String(
                        stream.user_login ||
                        ""
                    ).toLowerCase();

                if (!login) {
                    continue;
                }

                if (
                    String(
                        stream.game_id
                    ) !==
                    TWITCH_GAME_ID_RUST
                ) {
                    continue;
                }

                resultado[login] = {

                    online:
                        true,

                    userId:
                        stream.user_id,

                    displayName:
                        stream.user_name,

                    title:
                        stream.title,

                    viewers:
                        stream.viewer_count ||
                        0,

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

function crearEmbedCampaña(
    datos
) {

    datos =
        datos || {};

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
            .setTimestamp();

    // ========================================================
    // ESTADO
    // ========================================================

    if (
        datos.estado
    ) {

        let estadoTexto =
            datos.estado;

        if (
            /^upcoming$/i.test(
                datos.estado
            )
        ) {

            estadoTexto =
                "🟡 Próximamente";

        } else if (
            /^active$/i.test(
                datos.estado
            )
        ) {

            estadoTexto =
                "🟢 Drops activos";

        } else if (
            /^ended$/i.test(
                datos.estado
            )
        ) {

            estadoTexto =
                "🔴 Finalizados";
        }

        embed.addFields({
            name:
                "📌 Estado",

            value:
                estadoTexto,

            inline:
                true
        });
    }

    // ========================================================
    // INICIO
    // ========================================================

    if (
        datos.campaignStart
    ) {

        const timestamp =
            Math.floor(
                new Date(
                    datos.campaignStart
                ).getTime() /
                1000
            );

        if (
            Number.isFinite(
                timestamp
            )
        ) {

            embed.addFields({
                name:
                    "⏳ EMPIEZA EN",

                value:
                    `<t:${timestamp}:R>`,

                inline:
                    false
            });

            embed.addFields({
                name:
                    "📅 Inicio",

                value:
                    `<t:${timestamp}:F>`,

                inline:
                    true
            });
        }
    }

    // ========================================================
    // FINAL
    // ========================================================

    if (
        datos.campaignEnd
    ) {

        const timestamp =
            Math.floor(
                new Date(
                    datos.campaignEnd
                ).getTime() /
                1000
            );

        if (
            Number.isFinite(
                timestamp
            )
        ) {

            embed.addFields({
                name:
                    "📅 Finaliza",

                value:
                    `<t:${timestamp}:F>`,

                inline:
                    true
            });
        }
    }

    embed.setFooter({
        text:
            "RustLogix • Twitch Drops"
    });

    return embed;
}

// ============================================================
// EMBED DROP
// ============================================================

function crearEmbedDrop(
    drop,
    onlineMap = {}
) {

    if (!drop) {

        throw new Error(
            "No se recibió información del Drop."
        );
    }

    const esStreamer =
        drop.tipo ===
        "streamer";

    const embed =
        new EmbedBuilder()
            .setTitle(
                esStreamer
                    ? `🎯 ${drop.nombre}`
                    : `📦 ${drop.nombre}`
            )
            .addFields({
                name:
                    "⏱️ Tiempo",

                value:
                    formatearDuracion(
                        drop.horas
                    ),

                inline:
                    true
            });

    // ========================================================
    // GENERAL
    // ========================================================

    if (!esStreamer) {

        embed.addFields({
            name:
                "📺 Disponible en",

            value:
                "Todos los streams de Rust con Drops habilitados.",

            inline:
                false
        });
    }

    // ========================================================
    // STREAMER
    // ========================================================

    else {

        const streamers =
            Array.isArray(
                drop.streamers
            )
                ? drop.streamers
                : [];

        const lineas =
            streamers.map(
                streamer => {

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

                    if (!login) {
                        return null;
                    }

                    const info =
                        onlineMap[
                            String(
                                login
                            ).toLowerCase()
                        ];

                    const online =
                        info?.online === true;

                    return (
                        `${online ? "🟢" : "⚫"} [${nombre}](https://twitch.tv/${encodeURIComponent(login)})`
                    );
                }
            )
            .filter(Boolean);

        embed.addFields({
            name:
                "📺 Streamer asociado",

            value:
                lineas.length
                    ? lineas.join("\n")
                    : "Sin streamer disponible.",

            inline:
                false
        });
    }

    // ========================================================
    // IMAGEN GRANDE
    // ========================================================

    if (
        drop.imagen
    ) {

        embed.setImage(
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
// CAMPAIGN KEY
// ============================================================

function crearCampaignKey(
    datos
) {

    datos =
        datos || {};

    const drops =
        (
            datos.drops ||
            []
        )
            .map(
                drop => {

                    const streamers =
                        (
                            drop.streamers ||
                            []
                        )
                            .map(
                                streamer =>
                                    typeof streamer === "string"
                                        ? streamer
                                        : streamer.login
                            )
                            .filter(Boolean)
                            .sort()
                            .join(",");

                    return [
                        drop.tipo,
                        drop.nombre,
                        drop.horas,
                        streamers
                    ].join(":");
                }
            )
            .sort()
            .join("|");

    return [
        datos.campaignTitle || "",
        datos.campaignName || "",
        datos.campaignStart || "",
        datos.campaignEnd || "",
        drops
    ].join("||");
}

// ============================================================
// NORMALIZAR DROP GUARDADO
// ============================================================

function normalizarDropGuardado(
    drop
) {

    drop =
        drop || {};

    return {

        tipo:
            drop.tipo ||
            "general",

        nombre:
            drop.nombre ||
            "Drop",

        horas:
            Number(
                drop.horas ||
                0
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
// CONVERTIR DATOS PARA MONGOOSE
// ============================================================

function convertirDatosAGuardado(
    datos,
    onlineMap = {}
) {

    datos =
        datos || {};

    return (
        datos.drops ||
        []
    )
        .map(
            drop => {

                const normalizado =
                    normalizarDropGuardado(
                        drop
                    );

                if (
                    normalizado.tipo ===
                    "streamer"
                ) {

                    normalizado.streamers =
                        normalizado.streamers
                            .map(
                                streamer => {

                                    const info =
                                        onlineMap[
                                            String(
                                                streamer.login ||
                                                ""
                                            ).toLowerCase()
                                        ];

                                    return {

                                        ...streamer,

                                        online:
                                            info?.online ===
                                            true
                                    };
                                }
                            );
                }

                return normalizado;
            }
        );
}

// ============================================================
// CREAR GRUPOS DE MENSAJES
//
// Cada Drop va en su propio mensaje.
//
// ORDEN:
//
// 1. Campaña
// 2. General Drop 1
// 3. General Drop 2
// 4. ...
// 5. Streamer Drop 1
// 6. Streamer Drop 2
// ============================================================

function crearGruposMensajesDrops(
    datos,
    onlineMap = {}
) {

    datos =
        datos || {};

    const mensajes = [];

    // ========================================================
    // CAMPAÑA
    // ========================================================

    mensajes.push({

        tipo:
            "header",

        embeds: [
            crearEmbedCampaña(
                datos
            )
        ]
    });

    // ========================================================
    // GENERAL DROPS
    // ========================================================

    for (
        const drop
        of (
            datos.generalDrops ||
            []
        )
    ) {

        mensajes.push({

            tipo:
                "general",

            embeds: [
                crearEmbedDrop(
                    drop,
                    onlineMap
                )
            ]
        });
    }

    // ========================================================
    // STREAMER DROPS
    // ========================================================

    for (
        const drop
        of (
            datos.streamerDrops ||
            []
        )
    ) {

        mensajes.push({

            tipo:
                "streamer",

            embeds: [
                crearEmbedDrop(
                    drop,
                    onlineMap
                )
            ]
        });
    }

    return mensajes;
}

// ============================================================
// PUBLICAR RUST DROPS
//
// COMPATIBLE CON:
//
// /drops rust
// publicarRustDrops(interaction)
//
// AUTOMÁTICO
// publicarRustDrops(channel, datos, onlineMap)
// ============================================================

async function publicarRustDrops(
    primerParametro,
    datos = null,
    onlineMap = {}
) {

    try {

        let interaction = null;
        let channel = null;

        // ========================================================
        // LLAMADA DESDE /DROPS
        // ========================================================

        if (
            primerParametro &&
            primerParametro.channel &&
            primerParametro.options
        ) {

            interaction =
                primerParametro;

            channel =
                interaction.channel;

            if (!datos) {

                datos =
                    await obtenerDropsFacepunch();
            }

            if (
                !onlineMap ||
                typeof onlineMap !== "object" ||
                !Object.keys(
                    onlineMap
                ).length
            ) {

                onlineMap =
                    await obtenerStreamersOnlineRust(
                        datos.streamers ||
                        []
                    );
            }
        }

        // ========================================================
        // LLAMADA AUTOMÁTICA
        // ========================================================

        else {

            channel =
                primerParametro;
        }

        // ========================================================
        // VALIDAR CANAL
        // ========================================================

        if (!channel) {

            throw new Error(
                "No se encontró el canal donde publicar los Rust Drops."
            );
        }

        // ========================================================
        // SI NO HAY DATOS, OBTENERLOS
        // ========================================================

        if (!datos) {

            datos =
                await obtenerDropsFacepunch();
        }

        // ========================================================
        // VALIDAR DROPS
        // ========================================================

        if (
            !datos ||
            !Array.isArray(
                datos.drops
            ) ||
            datos.drops.length === 0
        ) {

            throw new Error(
                "Facepunch no devolvió Drops de Rust."
            );
        }

        // ========================================================
        // OBTENER STREAMERS ONLINE
        // ========================================================

        if (
            !onlineMap ||
            typeof onlineMap !== "object"
        ) {

            onlineMap = {};
        }

        if (
            !Object.keys(
                onlineMap
            ).length &&
            Array.isArray(
                datos.streamers
            ) &&
            datos.streamers.length
        ) {

            onlineMap =
                await obtenerStreamersOnlineRust(
                    datos.streamers
                );
        }

        // ========================================================
        // CREAR MENSAJES
        // ========================================================

        const grupos =
            crearGruposMensajesDrops(
                datos,
                onlineMap
            );

        if (
            !grupos ||
            !grupos.length
        ) {

            throw new Error(
                "No hay mensajes de Rust Drops para publicar."
            );
        }

        // ========================================================
        // PUBLICAR
        // ========================================================

        const mensajesPublicados = [];

        for (
            const grupo
            of grupos
        ) {

            if (
                !grupo ||
                !Array.isArray(
                    grupo.embeds
                ) ||
                !grupo.embeds.length
            ) {
                continue;
            }

            const mensaje =
                await channel.send({
                    embeds:
                        grupo.embeds
                });

            mensajesPublicados.push({

                channelId:
                    channel.id,

                messageId:
                    mensaje.id,

                tipo:
                    grupo.tipo
            });
        }

        // ========================================================
        // RESULTADO
        // ========================================================

        return {

            ok:
                true,

            cantidadDrops:
                datos.drops.length,

            cantidadMensajes:
                mensajesPublicados.length,

            mensajes:
                mensajesPublicados,

            datos,

            onlineMap
        };

    } catch (error) {

        console.error(
            "❌ Error publicando Rust Drops de Twitch:",
            error
        );

        throw error;
    }
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

            if (
                typeof streamer ===
                "string"
            ) {
                continue;
            }

            const login =
                String(
                    streamer.login ||
                    ""
                ).toLowerCase();

            if (!login) {
                continue;
            }

            const online =
                onlineMap[
                    login
                ]?.online === true;

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
// EDITAR MENSAJES DEL MONITOR
//
// [0] header
// [1] general 1
// [2] general 2
// ...
// [N] streamer
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

    const drops =
        Array.isArray(
            monitor.drops
        )
            ? monitor.drops.map(
                normalizarDropGuardado
            )
            : [];

    const embeds = [];

    // ========================================================
    // HEADER
    // ========================================================

    embeds.push(
        crearEmbedCampaña(
            datos
        )
    );

    // ========================================================
    // DROPS
    // ========================================================

    for (
        const drop
        of drops
    ) {

        embeds.push(
            crearEmbedDrop(
                drop,
                onlineMap
            )
        );
    }

    let cambio = false;

    // ========================================================
    // EDITAR CADA MENSAJE
    // ========================================================

    for (
        let i = 0;
        i < monitor.mensajes.length;
        i++
    ) {

        const registro =
            monitor.mensajes[i];

        if (
            !registro ||
            !registro.channelId ||
            !registro.messageId
        ) {
            continue;
        }

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

            if (
                !embeds[i]
            ) {
                continue;
            }

            await mensaje.edit({
                embeds: [
                    embeds[i]
                ]
            });

            cambio = true;

        } catch (error) {

            console.error(
                `[Twitch Drops] Error editando mensaje ${registro.messageId}:`,
                error.message
            );
        }
    }

    return cambio;
}

// ============================================================
// REVISAR DROPS AUTOMÁTICOS
// ============================================================

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
                activo:
                    true
            });

        if (
            !monitores.length
        ) {
            return;
        }

        // ====================================================
        // FACEPUNCH UNA SOLA VEZ
        // ====================================================

        const datos =
            await obtenerDropsFacepunch();

        if (
            !datos ||
            !datos.drops ||
            !datos.drops.length
        ) {

            console.log(
                "[Twitch Drops] No se encontraron Drops en Facepunch."
            );

            return;
        }

        // ====================================================
        // STREAMERS ONLINE
        // ====================================================

        const onlineMap =
            await obtenerStreamersOnlineRust(
                datos.streamers ||
                []
            );

        const campaignKey =
            crearCampaignKey(
                datos
            );

        console.log(
            `[Twitch Drops] Streamers ONLINE EN RUST: ${
                Object.keys(
                    onlineMap
                ).length
            }`
        );

        // ====================================================
        // PROCESAR MONITORES
        // ====================================================

        for (
            const monitor
            of monitores
        ) {

            try {

                const expectedMessages =
                    1 +
                    (
                        datos.drops?.length ||
                        0
                    );

                const mensajesActuales =
                    Array.isArray(
                        monitor.mensajes
                    )
                        ? monitor.mensajes.length
                        : 0;

                const campaignChanged =
                    monitor.campaignKey !==
                    campaignKey;

                const formatoAntiguo =
                    mensajesActuales !==
                    expectedMessages;

                // ====================================================
                // NUEVA CAMPAÑA / MIGRACIÓN DE FORMATO
                // ====================================================

                if (
                    campaignChanged ||
                    formatoAntiguo
                ) {

                    const channel =
                        await client.channels.fetch(
                            monitor.channelId
                        );

                    if (!channel) {
                        continue;
                    }

                    if (
                        campaignChanged
                    ) {

                        console.log(
                            `[Twitch Drops] 🆕 Nueva campaña en ${monitor.channelId}`
                        );

                    } else {

                        console.log(
                            `[Twitch Drops] 🔄 Actualizando formato de mensajes en ${monitor.channelId}`
                        );
                    }

                    // ==================================================
                    // PUBLICAR NUEVO BLOQUE
                    // ==================================================

                    const resultadoPublicacion =
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
                        resultadoPublicacion.mensajes;

                    monitor.campaignKey =
                        campaignKey;

                    await monitor.save();

                    continue;
                }

                // ====================================================
                // MISMA CAMPAÑA
                // ACTUALIZAR ONLINE/OFFLINE
                // ====================================================

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

                    const datosEdicion = {

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
                    };

                    await editarMensajesMonitor(
                        client,
                        monitor,
                        datosEdicion,
                        onlineMap
                    );

                    console.log(
                        `[Twitch Drops] 🔄 Estado de streamer actualizado en ${monitor.channelId}`
                    );
                }

            } catch (error) {

                console.error(
                    `[Twitch Drops] ❌ Error procesando monitor ${monitor._id}:`,
                    error.message
                );
            }
        }

    } catch (error) {

        console.error(
            "[Twitch Drops] ❌ Error en revisión automática:",
            error.response?.data ||
            error.message
        );

    } finally {

        revisando =
            false;
    }
}

// ============================================================
// INICIAR SERVICIO AUTOMÁTICO
// ============================================================

function iniciarDropsAutomaticos(
    client
) {

    if (
        intervaloAutomatico
    ) {

        console.log(
            "[Twitch Drops] El servicio automático ya está iniciado."
        );

        return;
    }

    console.log(
        "[Twitch Drops] Servicio automático iniciado."
    );

    // Primera revisión a los 5 segundos.
    setTimeout(
        () => {

            revisarDropsAutomaticos(
                client
            ).catch(error => {

                console.error(
                    "[Twitch Drops] Error en revisión inicial:",
                    error.message
                );
            });

        },
        5000
    );

    // Revisar cada minuto.
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