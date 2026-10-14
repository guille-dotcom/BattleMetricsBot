const axios = require("axios");
const cheerio = require("cheerio");
const { EmbedBuilder } = require("discord.js");
const RustDropsMonitor = require("../models/RustDropsMonitor");

const {
    iniciarVigilanciaStreamers
} = require("./twitchStreamerDropWatcher");

const FACEPUNCH_URL = "https://twitch.facepunch.com/";
const INTERVALO_REVISION = 5 * 60 * 1000;
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

function normalizarNombre(texto) {
    return limpiarTexto(texto)
        .replace(/^image:\s*/i, "")
        .replace(/^TwitchRivals\s+/i, "")
        .replace(/\s+/g, " ")
        .trim();
}

function convertirUrl(url) {
    if (!url) return null;

    const valor = String(url).trim().replace(/^["']|["']$/g, "");

    if (!valor || /^(data|blob|javascript):/i.test(valor)) {
        return null;
    }

    try {
        const resultado = new URL(valor, FACEPUNCH_URL);

        if (!["http:", "https:"].includes(resultado.protocol)) {
            return null;
        }

        return resultado.href;
    } catch {
        return null;
    }
}

function esImagenValida(url) {
    if (!url || !/^https?:\/\//i.test(url)) {
        return false;
    }

    if (
        /static-cdn\.jtvnw\.net/i.test(url) ||
        /jtv_user_pictures/i.test(url) ||
        /profile_image/i.test(url) ||
        /discord\.com\/assets\//i.test(url)
    ) {
        return false;
    }

    return (
        !/\.svg(?:[?#].*)?$/i.test(url) &&
        !/\.mp4(?:[?#].*)?$/i.test(url) &&
        !/\.webm(?:[?#].*)?$/i.test(url)
    );
}

function extraerUrlDeEstilo(estilo) {
    if (!estilo) return null;

    const coincidencias = [
        ...String(estilo).matchAll(
            /url\(\s*(['"]?)(.*?)\1\s*\)/gi
        )
    ];

    for (const coincidencia of coincidencias) {
        const url = convertirUrl(coincidencia[2]);

        if (esImagenValida(url)) {
            return url;
        }
    }

    return null;
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
        nodo.attr("srcset")?.split(",").pop()?.trim().split(/\s+/)[0],
        nodo.attr("data-srcset")?.split(",").pop()?.trim().split(/\s+/)[0],
        nodo.find("img").first().attr("src"),
        nodo.find("img").first().attr("data-src"),
        nodo.find("img").first().attr("data-original"),
        nodo.find("img").first().attr("srcset")
            ?.split(",").pop()?.trim().split(/\s+/)[0],
        nodo.find("video").first().attr("poster"),
        nodo.find("video").first().attr("data-poster"),
        nodo.find("source").first().attr("poster"),
        nodo.find("source").first().attr("data-poster")
    ];

    for (const candidato of candidatos) {
        const url = convertirUrl(candidato);

        if (esImagenValida(url)) {
            return url;
        }
    }

    const estilos = [
        nodo.attr("style"),
        nodo.attr("data-style"),
        nodo.find("[style]").first().attr("style")
    ].filter(Boolean);

    for (const estilo of estilos) {
        const url = extraerUrlDeEstilo(estilo);

        if (url) return url;
    }

    return null;
}

function obtenerImagenTarjeta($, tarjeta) {
    if (!tarjeta || !tarjeta.length) return null;

    const selectores = [
        "img",
        "picture img",
        "video[poster]",
        "video[data-poster]",
        "source[poster]",
        "[style*='background-image']",
        "[data-image]",
        "[data-image-url]",
        "[data-thumbnail]",
        "[data-poster]"
    ].join(", ");

    const candidatos = [];

    tarjeta.find(selectores).each((_, elemento) => {
        const url = obtenerUrlMedia($, elemento);

        if (url && esImagenValida(url) && !candidatos.includes(url)) {
            candidatos.push(url);
        }
    });

    if (candidatos.length) {
        return candidatos[0];
    }

    return extraerUrlDeEstilo(tarjeta.attr("style"));
}

// ============================================================
// DURACIÓN Y DETECCIÓN DE RECOMPENSAS
// ============================================================

function extraerDuracion(texto) {
    const valor = limpiarTexto(texto);

    let coincidencia = valor.match(
        /^(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?)$/i
    );

    if (coincidencia) {
        const cantidad = Number(coincidencia[1]);
        const unidad = /^(?:minutes?|mins?)$/i.test(coincidencia[2])
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
        (
            coincidencia[1] !== undefined ||
            coincidencia[2] !== undefined
        )
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
            return {
                cantidad: horas,
                unidad: "h",
                texto: `${horas} h`
            };
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

function escaparRegex(texto) {
    return String(texto).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buscarEncabezado($, expresion) {
    let encontrado = null;

    $("h1, h2, h3, h4, [role='heading']").each((_, elemento) => {
        if (encontrado) return;

        const texto = limpiarTexto($(elemento).text());

        if (expresion.test(texto)) {
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
        "source[poster]",
        "[style*='background-image']",
        "[data-image]",
        "[data-image-url]",
        "[data-thumbnail]",
        "[data-poster]"
    ].join(", ")).length > 0;
}

function encontrarTarjeta($, nodo, duracion) {
    let actual = $(nodo);
    let tarjetaConImagen = null;
    let tarjetaConEnlace = null;
    const duracionTexto = limpiarTexto(duracion?.texto);

    for (let nivel = 0; nivel < 12; nivel++) {
        if (!actual || !actual.length) break;

        const textoTarjeta = limpiarTexto(actual.text());
        const textoSinDuracion = obtenerTextoSinDuracion(textoTarjeta);

        const esCandidato =
            textoTarjeta.length > 0 &&
            textoTarjeta.length <= 350 &&
            textoSinDuracion.length > 1 &&
            (
                !duracionTexto ||
                textoTarjeta.length > duracionTexto.length
            );

        if (esCandidato) {
            if (!tarjetaConEnlace && actual.find("a").length > 0) {
                tarjetaConEnlace = actual;
            }

            if (tieneMediosDeImagen($, actual)) {
                tarjetaConImagen = actual;

                if (nivel >= 2) break;
            }
        }

        const padre = actual.parent();

        if (!padre || !padre.length) break;

        actual = padre;
    }

    return tarjetaConImagen || tarjetaConEnlace;
}

function esDropSinRevelar(texto) {
    const valor = limpiarTexto(texto);

    return (
        /\bcoming\s+soon\b/i.test(valor) ||
        /\bvery\s+soon\b/i.test(valor) ||
        /\bto\s+be\s+announced\b/i.test(valor) ||
        /\bto\s+be\s+revealed\b/i.test(valor) ||
        /\bunknown\s+reward\b/i.test(valor) ||
        /\bpr[oó]ximamente\b/i.test(valor) ||
        /\bpor\s+revelar\b/i.test(valor) ||
        /\bpor\s+anunciar\b/i.test(valor) ||
        /\bpr[oó]ximamente\s+disponible\b/i.test(valor)
    );
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
            return normalizarNombre(nombre);
        }
    }

    return normalizarNombre(obtenerTextoSinDuracion(textoOriginal));
}

function obtenerEnlaceStreamer($, tarjeta) {
    let resultado = null;

    tarjeta.find("a[href]").each((_, enlace) => {
        if (resultado) return;

        const href = convertirUrl($(enlace).attr("href"));
        const nombre = limpiarTexto($(enlace).text());

        if (!href || !nombre) return;

        let url;

        try {
            url = new URL(href);
        } catch {
            return;
        }

        if (
            !/(^|\.)twitch\.tv$/i.test(url.hostname) ||
            /\/(directory|downloads|settings|videos|p|search)(\/|$)/i.test(url.pathname)
        ) {
            return;
        }

        const canal = url.pathname.split("/").filter(Boolean)[0];

        if (!canal) return;

        resultado = {
            nombre,
            url: `https://www.twitch.tv/${canal}`
        };
    });

    return resultado;
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

        const tarjeta = encontrarTarjeta($, elemento, duracion);

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

        const tiempo = duracion.texto;
        const clave = `${nombre.toLowerCase()}-${tiempo}-${streamerUrl || streamer || ""}`;

        if (duplicados.has(clave)) continue;

        duplicados.add(clave);

        recompensas.push({
            nombre,
            streamer,
            streamerUrl,
            tiempo,
            imagen
        });
    }

    return recompensas;
}

// ============================================================
// DATOS DE CAMPAÑA Y FECHAS OFICIALES
// ============================================================

function convertirFechaOficial(fecha) {
    if (!fecha) return null;

    const milisegundos = Date.parse(
        fecha.replace(/\s+at\s+/i, " ")
    );

    return Number.isFinite(milisegundos)
        ? new Date(milisegundos).toISOString()
        : null;
}

function extraerDatosCampana($, textoCompleto) {
    const encabezados = $("h1, h2, h3, h4, [role='heading']")
        .toArray()
        .map(elemento => ({
            texto: limpiarTexto($(elemento).text()),
            orden: obtenerOrden(elemento)
        }));

    const encabezadoCampana = encabezados.find(item =>
        /Twitch Drops/i.test(item.texto) &&
        /Hosted by/i.test(item.texto)
    );

    let numero = null;
    let anfitrion = null;

    if (encabezadoCampana) {
        const coincidencia = encabezadoCampana.texto.match(
            /Twitch Drops\s+(?:Round\s*)?#?\s*(\d+)\s+Hosted by\s+(.+)/i
        );

        if (coincidencia) {
            numero = coincidencia[1];
            anfitrion = limpiarTexto(coincidencia[2]);
        }
    }

    if (!numero) {
        const coincidencia = textoCompleto.match(
            /Twitch Drops\s+(?:Round\s*)?#?\s*(\d+)/i
        );

        if (coincidencia) numero = coincidencia[1];
    }

    const estadoOriginal = /\bLive Now\b/i.test(textoCompleto)
        ? "En curso"
        : /\bUpcoming\b/i.test(textoCompleto)
            ? "Próximamente"
            : null;

    const fechasMatch = textoCompleto.match(
        /((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\s+at\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*UTC\s*[-–]\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\s+at\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*UTC)/i
    );

    const partesFecha = fechasMatch
        ? fechasMatch[1].match(
            /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\s+at\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*UTC/gi
        ) || []
        : [];

    const inicioCampana = convertirFechaOficial(partesFecha[0]);
    const finCampana = convertirFechaOficial(partesFecha[1]);

    let estado = estadoOriginal;

    if (inicioCampana && finCampana) {
        const ahora = Date.now();
        const inicioMs = new Date(inicioCampana).getTime();
        const finMs = new Date(finCampana).getTime();

        if (ahora < inicioMs) {
            estado = "Próximamente";
        } else if (ahora < finMs) {
            estado = "En curso";
        } else {
            estado = "Finalizada";
        }
    }

    const tema = encabezados.find(item =>
        item.orden > (encabezadoCampana?.orden ?? -1) &&
        !/Twitch Drops|General Drops|Streamer Drops|Drops Metrics/i.test(item.texto)
    );

    return {
        campana: numero
            ? `Twitch Drops Round ${numero}${anfitrion ? ` — Hosted by ${anfitrion}` : ""}`
            : null,
        estado,
        tema: tema?.texto || null,
        fechas: fechasMatch ? limpiarTexto(fechasMatch[1]) : null,
        inicioCampana,
        finCampana
    };
}

// ============================================================
// CONSULTA OFICIAL DE FACEPUNCH
// ============================================================

async function obtenerDropsOficiales() {
    const respuesta = await axios.get(FACEPUNCH_URL, {
        timeout: 25000,
        maxRedirects: 5,
        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9"
        }
    });

    if (respuesta.status !== 200 || typeof respuesta.data !== "string") {
        throw new Error("Facepunch no devolvió una página HTML válida.");
    }

    const $ = cheerio.load(respuesta.data);
    const textoCompleto = limpiarTexto($("body").text());

    if (
        !textoCompleto ||
        !/Twitch Drops/i.test(textoCompleto) ||
        !/General Drops/i.test(textoCompleto) ||
        !/Streamer Drops/i.test(textoCompleto)
    ) {
        throw new Error(
            "No se reconoció la estructura oficial de Twitch Drops. No se actualizarán los anuncios."
        );
    }

    $("body *").each((indice, elemento) => {
        elemento.__dropsOrder = indice;
    });

    const general = buscarEncabezado($, /^General Drops\b/i);
    const streamer = buscarEncabezado($, /^Streamer Drops\b/i);
    const metricas = buscarEncabezado($, /^Drops Metrics\b/i);

    if (!general || !streamer) {
        throw new Error("No se encontraron los encabezados de recompensas.");
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
        throw new Error(
            "No se pudieron identificar las recompensas dentro de las secciones oficiales."
        );
    }

    console.log(
        "🟣 Twitch Drops extraídos:",
        JSON.stringify({
            generales: generales.map(({ nombre, tiempo, imagen }) => ({
                nombre,
                tiempo,
                imagen: Boolean(imagen)
            })),
            streamers: streamers.map(({ nombre, streamer, streamerUrl, tiempo, imagen }) => ({
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
        generales,
        streamers,
        consultado: new Date().toISOString()
    };
}

// ============================================================
// CUENTA REGRESIVA DE CAMPAÑA
// ============================================================

function crearCampoCuentaRegresiva(datos) {
    const ahora = Date.now();

    const inicio = datos.inicioCampana
        ? new Date(datos.inicioCampana).getTime()
        : null;

    const fin = datos.finCampana
        ? new Date(datos.finCampana).getTime()
        : null;

    let objetivo = null;
    let titulo = null;

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
// CREACIÓN DE EMBEDS
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

    if (cuentaRegresiva) {
        embed.addFields(cuentaRegresiva);
    }

    if (datos.tema) {
        embed.addFields({
            name: "🎯 Campaña",
            value: datos.tema,
            inline: true
        });
    }

    if (datos.fechas) {
        embed.addFields({
            name: "📅 Fechas",
            value: datos.fechas,
            inline: false
        });
    }

    return embed;
}

function crearEmbedsDrops(datos) {
    const embeds = [];

    embeds.push(
        crearEmbedSeccion(
            "🎁 DROPS GENERALES",
            `Recompensas disponibles para la campaña general de Rust.\n\n**Campaña:** ${datos.campana}\n**Estado:** ${datos.estado}`,
            datos
        )
    );

    for (const recompensa of (datos.generales || [])) {
        const esProximamente = /^Próximamente$/i.test(recompensa.nombre);

        const embed = new EmbedBuilder()
            .setColor(0x9146ff)
            .setTitle(`🎁 ${recompensa.nombre}`)
            .setURL(FACEPUNCH_URL)
            .setDescription(
                `**Campaña:** ${datos.campana}\n` +
                `**Estado:** ${datos.estado}` +
                (esProximamente
                    ? "\n\nEl objeto se encuentra pendiente de revelación oficial."
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

        if (cuentaRegresiva) {
            embed.addFields(cuentaRegresiva);
        }

        if (!esProximamente && esImagenValida(recompensa.imagen)) {
            embed.setImage(recompensa.imagen);
        }

        embeds.push(embed);
    }

    embeds.push(
        crearEmbedSeccion(
            "🎮 DROPS ESPECÍFICOS DE STREAMERS",
            `Recompensas vinculadas a canales concretos de Twitch.\n\n**Campaña:** ${datos.campana}\n**Estado:** ${datos.estado}`,
            datos
        )
    );

    for (const recompensa of (datos.streamers || [])) {
        const esProximamente = /^Próximamente$/i.test(recompensa.nombre);

        const embed = new EmbedBuilder()
            .setColor(0x6441a5)
            .setTitle(`🎮 ${recompensa.nombre}`)
            .setURL(recompensa.streamerUrl || FACEPUNCH_URL)
            .setDescription(
                `**Campaña:** ${datos.campana}\n` +
                `**Estado:** ${datos.estado}` +
                (esProximamente
                    ? "\n\nEl objeto se encuentra pendiente de revelación oficial."
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
            const nombreCanal = escaparMarkdown(recompensa.streamer);
            const urlCanal = recompensa.streamerUrl || FACEPUNCH_URL;

            embed.addFields({
                name: "🎮 Canal de Twitch",
                value: `[${nombreCanal}](${urlCanal})`,
                inline: true
            });
        }

        const cuentaRegresiva = crearCampoCuentaRegresiva(datos);

        if (cuentaRegresiva) {
            embed.addFields(cuentaRegresiva);
        }

        if (!esProximamente && esImagenValida(recompensa.imagen)) {
            embed.setImage(recompensa.imagen);
        }

        embeds.push(embed);
    }

    return embeds.slice(0, MAX_DROPS_POR_PUBLICACION);
}

function crearEmbedDrops(datos) {
    return crearEmbedsDrops(datos)[0] || new EmbedBuilder()
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
            content: "No se encontraron recompensas oficiales para mostrar.",
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
        `✅ /drops rust: publicados ${embeds.length} mensajes individuales.`
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
// PUBLICACIÓN AUTOMÁTICA
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
                "❌ No se pudieron consultar los Twitch Drops oficiales:",
                error.message
            );

            return;
        }

        const firma = firmaCampana(datos);
        const embeds = crearEmbedsDrops(datos);

        if (!embeds.length) {
            console.warn(
                "⚠️ La página oficial no produjo embeds. Se conservan los anuncios existentes."
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
                        `⚠️ Canal de Twitch Drops no disponible: ${monitor.channelId}`
                    );
                    continue;
                }

                const idsGuardados = obtenerIdsMensajes(monitor);
                const mensajesPorPosicion = [];

                for (const id of idsGuardados) {
                    const mensaje = await canal.messages
                        .fetch(id)
                        .catch(() => null);

                    mensajesPorPosicion.push(mensaje);
                }

                const mismaFirma = monitor.campaignSignature === firma;

                const todosExisten =
                    mensajesPorPosicion.length === embeds.length &&
                    mensajesPorPosicion.every(Boolean);

                if (mismaFirma && todosExisten) {
                    monitor.lastCheckedAt = new Date();
                    await monitor.save();
                    continue;
                }

                const nuevosIds = [];

                for (let i = 0; i < embeds.length; i++) {
                    const embed = embeds[i];
                    let mensaje = mensajesPorPosicion[i] || null;

                    if (mensaje) {
                        await mensaje.edit({
                            content: "",
                            embeds: [embed],
                            allowedMentions: { parse: [] }
                        });
                    } else {
                        mensaje = await canal.send({
                            embeds: [embed],
                            allowedMentions: { parse: [] }
                        });
                    }

                    nuevosIds.push(mensaje.id);
                }

                for (
                    let i = embeds.length;
                    i < mensajesPorPosicion.length;
                    i++
                ) {
                    const mensaje = mensajesPorPosicion[i];

                    if (!mensaje) continue;

                    await mensaje.delete().catch(error => {
                        console.warn(
                            `⚠️ No se pudo eliminar el mensaje antiguo ${mensaje.id}:`,
                            error.message
                        );
                    });
                }

                guardarIdsMensajes(monitor, nuevosIds);
                monitor.campaignName = datos.campana;
                monitor.campaignSignature = firma;
                monitor.lastCheckedAt = new Date();

                await monitor.save();

                console.log(
                    `✅ Twitch Drops actualizados en ${canal.guild?.name || canal.id}: ` +
                    `${embeds.length} mensajes.`
                );
            } catch (error) {
                console.error(
                    `❌ Error actualizando Twitch Drops en ${monitor.guildId}:`,
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

    iniciarVigilanciaStreamers(
        client,
        obtenerDropsOficiales
    );

    temporizadorIniciado = true;

    console.log(
        "🟣 Monitor oficial de Twitch Drops iniciado (cada 5 minutos)."
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