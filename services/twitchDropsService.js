// ============================================================
// RUSTLOGIX - TWITCH DROPS SERVICE
// Fuente oficial: https://twitch.facepunch.com/
// ============================================================

const axios = require("axios");
const cheerio = require("cheerio");
const { EmbedBuilder } = require("discord.js");
const RustDropsMonitor = require("../models/RustDropsMonitor");
const { iniciarVigilanciaStreamers } = require("./twitchStreamerDropWatcher");

const FACEPUNCH_URL = "https://twitch.facepunch.com/";
const INTERVALO_REVISION = 60 * 1000;
const MAX_DROPS_POR_PUBLICACION = 10;

let cliente = null;
let temporizadorIniciado = false;
let revisando = false;

// ============================================================
// UTILIDADES
// ============================================================

function limpiarTexto(texto) {
    return String(texto ?? "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function escaparMarkdown(texto) {
    return String(texto ?? "").replace(
        /([\\`*_{}\[\]()#+\-.!|>~])/g,
        "\\$1"
    );
}

function convertirUrl(url) {
    if (!url) return null;

    try {
        const resultado = new URL(
            String(url).trim().replace(/^["']|["']$/g, ""),
            FACEPUNCH_URL
        );

        return ["http:", "https:"].includes(resultado.protocol)
            ? resultado.href
            : null;
    } catch {
        return null;
    }
}

function esImagenValida(url) {
    if (!url || !/^https?:\/\//i.test(url)) return false;

    if (
        /static-cdn\.jtvnw\.net/i.test(url) ||
        /jtv_user_pictures/i.test(url) ||
        /profile_image/i.test(url) ||
        /discord\.com\/assets\//i.test(url)
    ) {
        return false;
    }

    return !/\.(svg|mp4|webm)(?:[?#].*)?$/i.test(url);
}

function obtenerUrlMedia($, elemento) {
    const nodo = $(elemento);

    const candidatos = [
        nodo.attr("poster"),
        nodo.attr("data-poster"),
        nodo.attr("data-thumbnail"),
        nodo.attr("data-image"),
        nodo.attr("data-image-url"),
        nodo.attr("data-src"),
        nodo.attr("data-original"),
        nodo.attr("data-lazy-src"),
        nodo.attr("src"),
        nodo.attr("content"),
        nodo.find("img").first().attr("src"),
        nodo.find("img").first().attr("data-src"),
        nodo.find("img").first().attr("data-original"),
        nodo.find("video").first().attr("poster")
    ];

    for (const candidato of candidatos) {
        const url = convertirUrl(candidato);
        if (esImagenValida(url)) return url;
    }

    const estilo =
        nodo.attr("style") ||
        nodo.find("[style]").first().attr("style");

    if (estilo) {
        for (const coincidencia of estilo.matchAll(
            /url\(\s*(['"]?)(.*?)\1\s*\)/gi
        )) {
            const url = convertirUrl(coincidencia[2]);
            if (esImagenValida(url)) return url;
        }
    }

    return null;
}

function obtenerImagenTarjeta($, tarjeta) {
    const selectores = [
        "img",
        "picture img",
        "video[poster]",
        "video[data-poster]",
        "[style*='background-image']",
        "[data-image]",
        "[data-image-url]",
        "[data-thumbnail]",
        "[data-poster]"
    ].join(", ");

    let imagen = null;

    tarjeta.find(selectores).each((_, elemento) => {
        if (imagen) return;

        const url = obtenerUrlMedia($, elemento);
        if (url && esImagenValida(url)) imagen = url;
    });

    return imagen;
}

// ============================================================
// DURACIÓN DE LAS RECOMPENSAS
// ============================================================

function extraerDuracion(texto) {
    const valor = limpiarTexto(texto);

    let coincidencia = valor.match(
        /^(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?)$/i
    );

    if (coincidencia) {
        const cantidad = Number(coincidencia[1]);
        const unidad = /^(minutes?|mins?)$/i.test(coincidencia[2])
            ? "min"
            : "h";

        return {
            cantidad,
            unidad,
            texto: `${cantidad} ${unidad}`
        };
    }

    coincidencia = valor.match(
        /^(?:(\d+(?:\.\d+)?)\s*h(?:ours?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:utes?)?)?)?$/i
    );

    if (
        coincidencia &&
        (coincidencia[1] !== undefined || coincidencia[2] !== undefined)
    ) {
        const horas = Number(coincidencia[1] || 0);
        const minutos = Number(coincidencia[2] || 0);

        if (horas > 0 && minutos > 0) {
            return {
                cantidad: horas * 60 + minutos,
                unidad: "min",
                texto: `${horas} h ${minutos} min`
            };
        }

        if (horas > 0) {
            return { cantidad: horas, unidad: "h", texto: `${horas} h` };
        }

        if (minutos > 0) {
            return {
                cantidad: minutos,
                unidad: "min",
                texto: `${minutos} min`
            };
        }
    }

    return null;
}

function obtenerTextoSinDuracion(texto) {
    return limpiarTexto(texto)
        .replace(
            /\b\d+(?:\.\d+)?\s*(?:minutes?|mins?|hours?|hrs?)\b/gi,
            " "
        )
        .replace(/\b\d+(?:\.\d+)?\s*[hm]\b/gi, " ")
        .replace(
            /\b(?:Sort by|Online|Random|General Drops|Streamer Drops)\b/gi,
            " "
        )
        .replace(/\s+/g, " ")
        .trim();
}

function esDropSinRevelar(texto) {
    return (
        /\bcoming\s+soon\b/i.test(texto) ||
        /\bvery\s+soon\b/i.test(texto) ||
        /\bto\s+be\s+announced\b/i.test(texto) ||
        /\bto\s+be\s+revealed\b/i.test(texto) ||
        /\bunknown\s+reward\b/i.test(texto) ||
        /\bpr[oó]ximamente\b/i.test(texto) ||
        /\bpor\s+revelar\b/i.test(texto) ||
        /\bpor\s+anunciar\b/i.test(texto)
    );
}

// ============================================================
// DETECCIÓN DE SECCIONES
// ============================================================

function buscarEncabezado($, expresion) {
    let encontrado = null;

    $("h1, h2, h3, h4, [role='heading']").each((_, elemento) => {
        if (encontrado) return;

        if (expresion.test(limpiarTexto($(elemento).text()))) {
            encontrado = elemento;
        }
    });

    return encontrado;
}

function obtenerOrden(elemento) {
    return elemento && Number.isFinite(elemento.__dropsOrder)
        ? elemento.__dropsOrder
        : -1;
}

function tieneMediosDeImagen($, elemento) {
    return $(elemento).find([
        "img",
        "picture",
        "video[poster]",
        "video[data-poster]",
        "[style*='background-image']",
        "[data-image]",
        "[data-image-url]",
        "[data-thumbnail]",
        "[data-poster]"
    ].join(", ")).length > 0;
}

function encontrarTarjeta($, nodo) {
    let actual = $(nodo);
    let tarjetaConImagen = null;
    let tarjetaConEnlace = null;

    for (let nivel = 0; nivel < 12; nivel++) {
        if (!actual || !actual.length) break;

        const texto = limpiarTexto(actual.text());

        if (texto.length > 0 && texto.length <= 350) {
            if (!tarjetaConEnlace && actual.find("a[href]").length > 0) {
                tarjetaConEnlace = actual;
            }

            if (tieneMediosDeImagen($, actual)) {
                tarjetaConImagen = actual;
                if (nivel >= 2) break;
            }
        }

        actual = actual.parent();
    }

    return tarjetaConImagen || tarjetaConEnlace;
}

function obtenerEnlaceStreamer($, tarjeta) {
    let resultado = null;

    tarjeta.find("a[href]").each((_, enlace) => {
        if (resultado) return;

        const href = convertirUrl($(enlace).attr("href"));
        const nombre = limpiarTexto($(enlace).text());

        if (!href || !nombre) return;

        try {
            const url = new URL(href);

            if (!/(^|\.)twitch\.tv$/i.test(url.hostname)) return;

            if (/\/(directory|downloads|settings|videos|p|search)(\/|$)/i.test(url.pathname)) {
                return;
            }

            const canal = url.pathname.split("/").filter(Boolean)[0];
            if (!canal) return;

            resultado = {
                nombre,
                url: `https://www.twitch.tv/${canal}`
            };
        } catch {
            return;
        }
    });

    return resultado;
}

function obtenerNombreRecompensa($, tarjeta, textoOriginal) {
    const selectores = [
        ".drop-type",
        ".drop-box-footer .drop-type",
        "[class*='drop-type']",
        "[class*='reward-name']",
        "[class*='item-name']"
    ];

    for (const selector of selectores) {
        const nombre = limpiarTexto(tarjeta.find(selector).first().text());

        if (nombre) {
            return nombre
                .replace(/^image:\s*/i, "")
                .replace(/^TwitchRivals\s+/i, "")
                .trim();
        }
    }

    return obtenerTextoSinDuracion(textoOriginal)
        .replace(/^image:\s*/i, "")
        .trim();
}

function extraerTarjetas($, inicioOrden, finOrden) {
    const recompensas = [];
    const duplicados = new Set();
    const elementos = $("body *").toArray();

    elementos.forEach((elemento, indice) => {
        elemento.__dropsOrder = indice;
    });

    for (const elemento of elementos) {
        const nodo = $(elemento);

        if (nodo.children().length > 0) continue;

        const duracion = extraerDuracion(nodo.text());
        if (!duracion) continue;

        const orden = obtenerOrden(elemento);

        if (orden <= inicioOrden || orden >= finOrden) continue;

        const tarjeta = encontrarTarjeta($, elemento);
        if (!tarjeta || !tarjeta.length) continue;

        const textoOriginal = limpiarTexto(tarjeta.text());
        const sinRevelar = esDropSinRevelar(textoOriginal);

        let streamer = null;
        let streamerUrl = null;
        let nombre = null;
        let imagen = null;

        if (sinRevelar) {
            nombre = "Próximamente";
        } else {
            const enlaceStreamer = obtenerEnlaceStreamer($, tarjeta);

            if (enlaceStreamer) {
                streamer = enlaceStreamer.nombre;
                streamerUrl = enlaceStreamer.url;
            }

            nombre = obtenerNombreRecompensa($, tarjeta, textoOriginal);

            if (
                !nombre ||
                nombre.length > 65 ||
                /^(watch|watching|available|getting|drops|hours?|minutes?|twitchrivals)$/i.test(nombre) ||
                /^(sort by|online random|coming soon|very soon|upcoming|live now)$/i.test(nombre)
            ) {
                continue;
            }

            imagen = obtenerImagenTarjeta($, tarjeta);
        }

        const clave = [
            nombre.toLowerCase(),
            duracion.texto,
            streamerUrl || ""
        ].join("-");

        if (duplicados.has(clave)) continue;
        duplicados.add(clave);

        recompensas.push({
            nombre,
            streamer,
            streamerUrl,
            tiempo: duracion.texto,
            imagen
        });
    }

    return recompensas;
}

// ============================================================
// FECHAS OFICIALES DE FACEPUNCH
// Lee data-date-id, cuyo último segmento es el timestamp Unix.
// ============================================================

function extraerFechasOficiales($) {
    const fechas = [];

    $(".event-date .date").each((_, elemento) => {
        const nodo = $(elemento);
        const texto = limpiarTexto(nodo.text());
        const identificador = nodo.attr("data-date-id");

        // Ejemplo:
        // c19300...-1792778400
        const coincidencia = identificador?.match(/-(\d{10,13})$/);

        let milisegundos = coincidencia
            ? Number(coincidencia[1])
            : NaN;

        // Compatibilidad con timestamps que vengan en milisegundos.
        if (Number.isFinite(milisegundos) && milisegundos < 1e12) {
            milisegundos *= 1000;
        }

        // Alternativa: timestamp declarado en un script asociado.
        if (!Number.isFinite(milisegundos) || milisegundos <= 0) {
            const bloque = nodo.closest(".event-date").html() || "";
            const scriptTimestamp = bloque.match(
                /new Date\(\s*(\d{13})\s*\)/i
            );

            if (scriptTimestamp) {
                milisegundos = Number(scriptTimestamp[1]);
            }
        }

        if (Number.isFinite(milisegundos) && milisegundos > 0) {
            fechas.push({
                texto,
                timestamp: milisegundos,
                iso: new Date(milisegundos).toISOString()
            });
        }
    });

    return fechas.slice(0, 2);
}

// ============================================================
// CONTADOR OFICIAL DE FACEPUNCH
// Se guardan los valores que devuelve el HTML.
// La cuenta regresiva de Discord se calcula usando las fechas.
// ============================================================

function extraerContadorOficial($) {
    const contador = $(".hero-countdown.counter").first();

    if (!contador.length) return null;

    const etiqueta = limpiarTexto(
        contador.find(".counter-label").first().text()
    );

    function leerNumero(selector) {
        const texto = limpiarTexto(
            contador.find(selector).first().text()
        );

        if (!texto) return null;

        const numero = Number(texto);
        return Number.isFinite(numero) && numero >= 0
            ? numero
            : null;
    }

    const resultado = {
        etiqueta: etiqueta || null,
        dias: leerNumero(".value.day"),
        horas: leerNumero(".value.hour"),
        minutos: leerNumero(".value.minute"),
        segundos: leerNumero(".value.second")
    };

    const tieneValores = [
        resultado.dias,
        resultado.horas,
        resultado.minutos,
        resultado.segundos
    ].some(valor => valor !== null);

    return tieneValores || resultado.etiqueta ? resultado : null;
}

// ============================================================
// DATOS DE CAMPAÑA
// ============================================================

function extraerDatosCampana($, textoCompleto) {
    const encabezados = $("h1, h2, h3, h4, [role='heading']")
        .toArray()
        .map(elemento => ({
            texto: limpiarTexto($(elemento).text()),
            orden: obtenerOrden(elemento)
        }));

    const encabezadoCampana = encabezados.find(item =>
        /Twitch\s*Drops/i.test(item.texto) &&
        /Hosted\s*by/i.test(item.texto)
    );

    let numero = null;
    let anfitrion = null;

    const textoCabecera = encabezadoCampana?.texto || textoCompleto;

    const coincidenciaCabecera = textoCabecera.match(
        /Twitch\s*Drops\s*(?:Round\s*)?#?\s*(\d+)\s*Hosted\s*by\s+(.+?)(?=Base Invaders|General Drops|Streamer Drops|$)/i
    );

    if (coincidenciaCabecera) {
        numero = coincidenciaCabecera[1];
        anfitrion = limpiarTexto(coincidenciaCabecera[2]);
    }

    if (!numero) {
        const coincidencia = textoCompleto.match(
            /Twitch\s*Drops\s*(?:Round\s*)?#?\s*(\d+)/i
        );

        if (coincidencia) numero = coincidencia[1];
    }

    if (!anfitrion) {
        const coincidencia = textoCompleto.match(
            /Twitch\s*Drops\s*(?:Round\s*)?#?\s*\d+\s*Hosted\s*by\s+(.+?)(?=Base Invaders|General Drops|Streamer Drops|$)/i
        );

        if (coincidencia) anfitrion = limpiarTexto(coincidencia[1]);
    }

    // Primero usamos los timestamps oficiales del HTML.
    const fechasOficiales = extraerFechasOficiales($);

    let fechaInicioTexto = fechasOficiales[0]?.texto || null;
    let fechaFinTexto = fechasOficiales[1]?.texto || null;

    let inicioCampana = fechasOficiales[0]?.iso || null;
    let finCampana = fechasOficiales[1]?.iso || null;

    // Fallback si Facepunch no proporciona data-date-id.
    if (!inicioCampana || !finCampana) {
        const regexFechaEspanol =
            /(\d{1,2}\s+de\s+[a-záéíóú]+\s+de\s+\d{4}\s+a\s+las\s+\d{1,2}:\d{2}\s*(?:GMT|UTC)\s*[+-]\d{1,2}(?::?\d{2})?)\s*[-–]\s*(\d{1,2}\s+de\s+[a-záéíóú]+\s+de\s+\d{4}\s+a\s+las\s+\d{1,2}:\d{2}\s*(?:GMT|UTC)\s*[+-]\d{1,2}(?::?\d{2})?)/i;

        const fechasMatch = textoCompleto.match(regexFechaEspanol);

        if (fechasMatch) {
            fechaInicioTexto ||= fechasMatch[1];
            fechaFinTexto ||= fechasMatch[2];

            inicioCampana ||= convertirFechaOficial(fechasMatch[1]);
            finCampana ||= convertirFechaOficial(fechasMatch[2]);
        }
    }

    const fechas = fechaInicioTexto && fechaFinTexto
        ? `${fechaInicioTexto} - ${fechaFinTexto}`
        : null;

    const contadorOficial = extraerContadorOficial($);

    let estado = null;

    if (inicioCampana && finCampana) {
        const ahora = Date.now();
        const inicio = new Date(inicioCampana).getTime();
        const fin = new Date(finCampana).getTime();

        if (ahora < inicio) {
            estado = "Próximamente";
        } else if (ahora < fin) {
            estado = "En curso";
        } else {
            estado = "Finalizada";
        }
    } else if (/\bLive\s*Now\b/i.test(textoCompleto)) {
        estado = "En curso";
    } else if (/\bUpcoming\b/i.test(textoCompleto)) {
        estado = "Próximamente";
    }

    let tema = null;

    if (/\bBase\s+Invaders\b/i.test(textoCompleto)) {
        tema = "Base Invaders";
    } else {
        const temaEncabezado = encabezados.find(item =>
            item.orden > (encabezadoCampana?.orden ?? -1) &&
            !/Twitch Drops|General Drops|Streamer Drops|Drops Metrics|Upcoming|Live Now/i.test(item.texto)
        );

        tema = temaEncabezado?.texto || null;
    }

    return {
        campana: numero
            ? `Twitch Drops Round ${numero}${anfitrion ? ` — Hosted by ${anfitrion}` : ""}`
            : null,
        estado,
        tema,
        fechas,
        inicioCampana,
        finCampana,
        contadorOficial
    };
}

// Convierte fechas escritas en español a UTC respetando GMT-3, etc.
function convertirFechaOficial(fecha) {
    if (!fecha) return null;

    const texto = limpiarTexto(fecha);

    const meses = {
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

    const espanol = texto.match(
        /(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})\s+a\s+las\s+(\d{1,2}):(\d{2})\s*(GMT|UTC)\s*([+-]\d{1,2})(?::?(\d{2}))?/i
    );

    if (espanol) {
        const dia = Number(espanol[1]);
        const mes = meses[espanol[2].toLowerCase()];
        const anio = Number(espanol[3]);
        const hora = Number(espanol[4]);
        const minuto = Number(espanol[5]);
        const signo = espanol[7].startsWith("-") ? -1 : 1;
        const desfaseHoras = Math.abs(Number(espanol[7]));
        const desfaseMinutos = Number(espanol[8] || 0);

        if (
            mes === undefined ||
            hora > 23 ||
            minuto > 59 ||
            desfaseHoras > 14 ||
            desfaseMinutos > 59
        ) {
            return null;
        }

        const comprobacion = new Date(Date.UTC(anio, mes, dia));

        if (
            comprobacion.getUTCFullYear() !== anio ||
            comprobacion.getUTCMonth() !== mes ||
            comprobacion.getUTCDate() !== dia
        ) {
            return null;
        }

        const desfaseTotal = signo * (
            desfaseHoras * 60 + desfaseMinutos
        );

        return new Date(
            Date.UTC(anio, mes, dia, hora, minuto) -
            desfaseTotal * 60 * 1000
        ).toISOString();
    }

    const ingles = texto.replace(/\s+at\s+/i, " ");
    const milisegundos = Date.parse(ingles);

    return Number.isFinite(milisegundos)
        ? new Date(milisegundos).toISOString()
        : null;
}

// ============================================================
// CONSULTA A FACEPUNCH
// ============================================================

async function obtenerDropsOficiales() {
    const respuesta = await axios.get(FACEPUNCH_URL, {
        timeout: 25000,
        maxRedirects: 5,
        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
            "Accept-Language": "es-CL,es;q=0.9,en-US;q=0.8,en;q=0.7"
        }
    });

    if (respuesta.status !== 200 || typeof respuesta.data !== "string") {
        throw new Error("Facepunch no devolvió una página HTML válida.");
    }

    const $ = cheerio.load(respuesta.data);
    const textoCompleto = limpiarTexto($("body").text());

    if (
        !textoCompleto ||
        !/Twitch\s*Drops/i.test(textoCompleto) ||
        !/General Drops/i.test(textoCompleto) ||
        !/Streamer Drops/i.test(textoCompleto)
    ) {
        throw new Error(
            "No se reconoció la estructura oficial de Twitch Drops."
        );
    }

    $("body *").each((indice, elemento) => {
        elemento.__dropsOrder = indice;
    });

    const general = buscarEncabezado($, /^General Drops\b/i);
    const streamer = buscarEncabezado($, /^Streamer Drops\b/i);
    const metricas = buscarEncabezado($, /^Drops Metrics\b/i);

    if (!general || !streamer) {
        throw new Error("No se encontraron las secciones oficiales de Drops.");
    }

    const ordenGeneral = obtenerOrden(general);
    const ordenStreamer = obtenerOrden(streamer);
    const ordenMetricas = metricas
        ? obtenerOrden(metricas)
        : Number.MAX_SAFE_INTEGER;

    const generales = extraerTarjetas($, ordenGeneral, ordenStreamer);
    const streamers = extraerTarjetas($, ordenStreamer, ordenMetricas);

    const campana = extraerDatosCampana($, textoCompleto);

    if (!generales.length && !streamers.length) {
        throw new Error("No se pudieron identificar las recompensas oficiales.");
    }

    console.log(
        "🟣 Twitch Drops extraídos:",
        JSON.stringify({
            campana: campana.campana,
            estado: campana.estado,
            tema: campana.tema,
            fechas: campana.fechas,
            inicioCampana: campana.inicioCampana,
            finCampana: campana.finCampana,
            contadorOficial: campana.contadorOficial,
            generales: generales.map(({ nombre, tiempo, imagen }) => ({
                nombre,
                tiempo,
                imagen: Boolean(imagen)
            })),
            streamers: streamers.map(({
                nombre,
                streamer,
                streamerUrl,
                tiempo,
                imagen
            }) => ({
                nombre,
                streamer,
                streamerUrl,
                tiempo,
                imagen: Boolean(imagen)
            }))
        })
    );

    return {
        fuente: FACEPUNCH_URL,
        campana: campana.campana || "Campaña oficial de Rust",
        estado: campana.estado || "Consulta oficial",
        tema: campana.tema,
        fechas: campana.fechas,
        inicioCampana: campana.inicioCampana,
        finCampana: campana.finCampana,
        contadorOficial: campana.contadorOficial,
        generales,
        streamers,
        consultado: new Date().toISOString()
    };
}

// ============================================================
// CUENTA REGRESIVA PARA DISCORD
// Se calcula con los timestamps oficiales, no con números estáticos.
// ============================================================

function crearCampoCuentaRegresiva(datos) {
    const ahora = Date.now();

    const inicio = datos.inicioCampana
        ? new Date(datos.inicioCampana).getTime()
        : NaN;

    const fin = datos.finCampana
        ? new Date(datos.finCampana).getTime()
        : NaN;

    let objetivo;
    let titulo;

    if (Number.isFinite(inicio) && ahora < inicio) {
        objetivo = inicio;
        titulo = "⏳ COMIENZA EN";
    } else if (Number.isFinite(fin) && ahora < fin) {
        objetivo = fin;
        titulo = "🏁 FINALIZA EN";
    } else {
        return null;
    }

    const totalSegundos = Math.max(
        0,
        Math.floor((objetivo - ahora) / 1000)
    );

    const dias = Math.floor(totalSegundos / 86400);
    const horas = Math.floor((totalSegundos % 86400) / 3600);
    const minutos = Math.floor((totalSegundos % 3600) / 60);
    const segundos = totalSegundos % 60;
    const timestampDiscord = Math.floor(objetivo / 1000);

    return {
        name: titulo,
        value:
            `**${dias}** Días\n` +
            `**${horas}** Horas\n` +
            `**${minutos}** Minutos\n` +
            `**${segundos}** Segundos\n\n` +
            `<t:${timestampDiscord}:R>`,
        inline: false
    };
}

// ============================================================
// EMBEDS
// ============================================================

function crearEmbedSeccion(titulo, descripcion, datos) {
    const embed = new EmbedBuilder()
        .setColor(0x9146ff)
        .setTitle(titulo)
        .setURL(FACEPUNCH_URL)
        .setDescription(descripcion)
        .setFooter({
            text: "RustLogix • Fuente oficial de Facepunch"
        })
        .setTimestamp(new Date(datos.consultado));

    const cuentaRegresiva = crearCampoCuentaRegresiva(datos);
    if (cuentaRegresiva) embed.addFields(cuentaRegresiva);

    if (datos.tema) {
        embed.addFields({
            name: "🎯 Campaña",
            value: datos.tema,
            inline: true
        });
    }

    if (datos.fechas) {
        embed.addFields({
            name: "📅 Fechas oficiales",
            value: datos.fechas,
            inline: false
        });
    }

    if (datos.contadorOficial?.etiqueta) {
        embed.addFields({
            name: "⏱️ Contador oficial de Facepunch",
            value: datos.contadorOficial.etiqueta,
            inline: true
        });
    }

    return embed;
}

function crearEmbedsDrops(datos) {
    const embeds = [];

    embeds.push(
        crearEmbedSeccion(
            "🎁 DROPS GENERALES",
            `Recompensas generales de Rust.\n\n` +
            `**Campaña:** ${datos.campana}\n` +
            `**Estado:** ${datos.estado}`,
            datos
        )
    );

    for (const recompensa of datos.generales || []) {
        const proximamente = /^Próximamente$/i.test(recompensa.nombre);

        const embed = new EmbedBuilder()
            .setColor(0x9146ff)
            .setTitle(`🎁 ${recompensa.nombre}`)
            .setURL(FACEPUNCH_URL)
            .setDescription(
                `**Campaña:** ${datos.campana}\n` +
                `**Estado:** ${datos.estado}` +
                (proximamente
                    ? "\n\nEl objeto está pendiente de revelación oficial."
                    : "")
            )
            .addFields(
                {
                    name: "⏱️ Tiempo necesario",
                    value: recompensa.tiempo || "Duración no detectada",
                    inline: true
                },
                {
                    name: "📦 Tipo",
                    value: "Drop general",
                    inline: true
                },
                {
                    name: "🔗 Fuente oficial",
                    value: `[Consultar Facepunch](${FACEPUNCH_URL})`
                }
            )
            .setFooter({
                text: "RustLogix • Fuente oficial de Facepunch"
            })
            .setTimestamp(new Date(datos.consultado));

        const cuentaRegresiva = crearCampoCuentaRegresiva(datos);
        if (cuentaRegresiva) embed.addFields(cuentaRegresiva);

        if (!proximamente && esImagenValida(recompensa.imagen)) {
            embed.setImage(recompensa.imagen);
        }

        embeds.push(embed);
    }

    embeds.push(
        crearEmbedSeccion(
            "🎮 DROPS ESPECÍFICOS DE STREAMERS",
            `Recompensas vinculadas a canales de Twitch.\n\n` +
            `**Campaña:** ${datos.campana}\n` +
            `**Estado:** ${datos.estado}`,
            datos
        )
    );

    for (const recompensa of datos.streamers || []) {
        const proximamente = /^Próximamente$/i.test(recompensa.nombre);

        const embed = new EmbedBuilder()
            .setColor(0x6441a5)
            .setTitle(`🎮 ${recompensa.nombre}`)
            .setURL(recompensa.streamerUrl || FACEPUNCH_URL)
            .setDescription(
                `**Campaña:** ${datos.campana}\n` +
                `**Estado:** ${datos.estado}` +
                (proximamente
                    ? "\n\nEl objeto está pendiente de revelación oficial."
                    : "")
            )
            .addFields(
                {
                    name: "⏱️ Tiempo necesario",
                    value: recompensa.tiempo || "Duración no detectada",
                    inline: true
                },
                {
                    name: "📦 Tipo",
                    value: "Drop específico de streamer",
                    inline: true
                },
                {
                    name: "🔗 Fuente oficial",
                    value: `[Consultar Facepunch](${FACEPUNCH_URL})`
                }
            )
            .setFooter({
                text: "RustLogix • Fuente oficial de Facepunch"
            })
            .setTimestamp(new Date(datos.consultado));

        if (recompensa.streamer) {
            embed.addFields({
                name: "🎮 Canal de Twitch",
                value:
                    `[${escaparMarkdown(recompensa.streamer)}]` +
                    `(${recompensa.streamerUrl || FACEPUNCH_URL})`,
                inline: true
            });
        }

        const cuentaRegresiva = crearCampoCuentaRegresiva(datos);
        if (cuentaRegresiva) embed.addFields(cuentaRegresiva);

        if (!proximamente && esImagenValida(recompensa.imagen)) {
            embed.setImage(recompensa.imagen);
        }

        embeds.push(embed);
    }

    return embeds.slice(0, MAX_DROPS_POR_PUBLICACION);
}

function crearEmbedDrops(datos) {
    return crearEmbedsDrops(datos)[0] ||
        new EmbedBuilder()
            .setColor(0x9146ff)
            .setTitle("🎁 Rust — Twitch Drops oficiales")
            .setURL(FACEPUNCH_URL)
            .setDescription("No se encontraron recompensas disponibles.");
}

// ============================================================
// FIRMA DE CAMPAÑA
// ============================================================

function firmaCampana(datos) {
    return JSON.stringify({
        campana: datos.campana,
        estado: datos.estado,
        tema: datos.tema,
        fechas: datos.fechas,
        inicioCampana: datos.inicioCampana,
        finCampana: datos.finCampana,
        // Cambia cada minuto para actualizar la cuenta regresiva.
        cuentaRegresivaTick: Math.floor(Date.now() / INTERVALO_REVISION),
        generales: datos.generales,
        streamers: datos.streamers
    });
}

// ============================================================
// PUBLICACIÓN MANUAL: /DROPS RUST
// ============================================================

async function publicarRustDrops(interaction) {
    const datos = await obtenerDropsOficiales();
    const embeds = crearEmbedsDrops(datos);

    if (!embeds.length) {
        await interaction.editReply({
            content: "No se encontraron recompensas oficiales.",
            embeds: []
        });

        return datos;
    }

    await interaction.editReply({
        content: "",
        embeds: [embeds[0]],
        allowedMentions: { parse: [] }
    });

    for (const embed of embeds.slice(1)) {
        await interaction.followUp({
            embeds: [embed],
            allowedMentions: { parse: [] }
        });
    }

    console.log(
        `✅ /drops rust: publicados ${embeds.length} mensajes independientes.`
    );

    return datos;
}

// ============================================================
// COMPATIBILIDAD CON MONGODB
// ============================================================

function obtenerIdsMensajes(monitor) {
    if (Array.isArray(monitor.messageIds) && monitor.messageIds.length) {
        return monitor.messageIds
            .map(id => String(id).trim())
            .filter(Boolean);
    }

    if (!monitor.messageId) return [];

    return String(monitor.messageId)
        .split(",")
        .map(id => id.trim())
        .filter(Boolean);
}

function guardarIdsMensajes(monitor, ids) {
    monitor.messageId = ids.join(",");

    if (RustDropsMonitor.schema.path("messageIds")) {
        monitor.messageIds = ids;
    }
}

// ============================================================
// REVISIÓN AUTOMÁTICA
// ============================================================

async function revisarDropsAutomaticos() {
    if (revisando || !cliente) return;

    revisando = true;

    try {
        const monitores = await RustDropsMonitor.find({
            active: true,
            channelId: { $exists: true, $ne: null }
        });

        if (!monitores.length) return;

        let datos;

        try {
            datos = await obtenerDropsOficiales();
        } catch (error) {
            console.error(
                "❌ No se pudieron consultar los Drops oficiales:",
                error.message
            );

            return;
        }

        const firma = firmaCampana(datos);
        const embeds = crearEmbedsDrops(datos);

        if (!embeds.length) {
            console.warn(
                "⚠️ No se generaron embeds. Se conservan los mensajes actuales."
            );
            return;
        }

        for (const monitor of monitores) {
            try {
                const canal = await cliente.channels
                    .fetch(monitor.channelId)
                    .catch(() => null);

                if (!canal || !canal.isTextBased() || !canal.messages) {
                    console.warn(
                        `⚠️ Canal de Drops no disponible: ${monitor.channelId}`
                    );
                    continue;
                }

                const idsGuardados = obtenerIdsMensajes(monitor);
                const mensajes = [];

                for (const id of idsGuardados) {
                    const mensaje = await canal.messages
                        .fetch(id)
                        .catch(() => null);

                    mensajes.push(mensaje);
                }

                const mismaFirma = monitor.campaignSignature === firma;
                const todosExisten =
                    mensajes.length === embeds.length &&
                    mensajes.every(Boolean);

                if (mismaFirma && todosExisten) {
                    monitor.lastCheckedAt = new Date();
                    await monitor.save();
                    continue;
                }

                const nuevosIds = [];

                for (let i = 0; i < embeds.length; i++) {
                    let mensaje = mensajes[i] || null;

                    if (mensaje) {
                        await mensaje.edit({
                            content: "",
                            embeds: [embeds[i]],
                            allowedMentions: { parse: [] }
                        });
                    } else {
                        mensaje = await canal.send({
                            embeds: [embeds[i]],
                            allowedMentions: { parse: [] }
                        });
                    }

                    nuevosIds.push(mensaje.id);
                }

                for (let i = embeds.length; i < mensajes.length; i++) {
                    const mensaje = mensajes[i];

                    if (mensaje) {
                        await mensaje.delete().catch(error => {
                            console.warn(
                                `⚠️ No se pudo eliminar el mensaje ${mensaje.id}:`,
                                error.message
                            );
                        });
                    }
                }

                guardarIdsMensajes(monitor, nuevosIds);

                monitor.campaignKey =
                    datos.inicioCampana ||
                    datos.campana ||
                    null;

                monitor.campaignName = datos.campana;
                monitor.campaignSignature = firma;
                monitor.lastCheckedAt = new Date();

                await monitor.save();

                console.log(
                    `✅ Twitch Drops actualizados en ` +
                    `${canal.guild?.name || canal.id}: ` +
                    `${embeds.length} mensajes.`
                );
            } catch (error) {
                console.error(
                    `❌ Error actualizando Drops en ${monitor.guildId}:`,
                    error
                );
            }
        }
    } catch (error) {
        console.error(
            "❌ Error revisando monitores de Twitch Drops:",
            error
        );
    } finally {
        revisando = false;
    }
}

// ============================================================
// INICIAR MONITOR
// ============================================================

function iniciarDropsAutomaticos(client) {
    if (temporizadorIniciado) return;

    cliente = client;

    iniciarVigilanciaStreamers(client, obtenerDropsOficiales);

    temporizadorIniciado = true;

    console.log(
        "🟣 Monitor oficial de Twitch Drops iniciado. Actualización cada minuto."
    );

    revisarDropsAutomaticos().catch(console.error);

    setInterval(() => {
        revisarDropsAutomaticos().catch(console.error);
    }, INTERVALO_REVISION);
}

// ============================================================
// EXPORTACIONES
// ============================================================

module.exports = {
    obtenerDropsOficiales,
    crearEmbedDrops,
    crearEmbedsDrops,
    publicarRustDrops,
    iniciarDropsAutomaticos,
    revisarDropsAutomaticos
};