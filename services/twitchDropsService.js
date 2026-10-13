
const axios = require("axios");
const cheerio = require("cheerio");
const { EmbedBuilder } = require("discord.js");
const RustDropsMonitor = require("../models/RustDropsMonitor");

const FACEPUNCH_URL = "https://twitch.facepunch.com/";
const INTERVALO_REVISION = 5 * 60 * 1000;

let cliente = null;
let temporizadorIniciado = false;
let revisando = false;

function limpiarTexto(texto) {
    return String(texto ?? "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function escaparMarkdown(texto) {
    return String(texto ?? "").replace(/([\\`*_{}\[\]()#+\-.!|>~])/g, "\\$1");
}

function normalizarNombre(texto) {
    return limpiarTexto(texto)
        .replace(/^image:\s*/i, "")
        .replace(/\s+/g, " ")
        .trim();
}

function obtenerUrlMedia($, elemento) {
    const nodo = $(elemento);

    const candidatos = [
        nodo.attr("src"),
        nodo.attr("data-src"),
        nodo.attr("data-original"),
        nodo.attr("data-lazy-src"),
        nodo.attr("poster"),
        nodo.find("source").first().attr("src"),
        nodo.find("img").first().attr("src"),
        nodo.find("img").first().attr("data-src"),
        nodo.find("video").first().attr("poster")
    ];

    for (const candidato of candidatos) {
        if (!candidato || candidato.startsWith("data:")) continue;

        try {
            return new URL(candidato, FACEPUNCH_URL).href;
        } catch {
            // Probar el siguiente atributo.
        }
    }

    return null;
}

function obtenerImagenTarjeta($, tarjeta) {
    if (!tarjeta || !tarjeta.length) return null;

    let imagen = null;

    tarjeta.find("img, video, source").each((_, elemento) => {
        if (imagen) return;

        const url = obtenerUrlMedia($, elemento);

        if (
            url &&
            /^https?:\/\//i.test(url) &&
            !/\.svg(?:[?#].*)?$/i.test(url)
        ) {
            imagen = url;
        }
    });

    return imagen;
}

function obtenerTextoSinDuracion(texto) {
    return limpiarTexto(texto)
        .replace(
            /\b\d+(?:\.\d+)?\s*(?:minutes?|mins?|hours?|hrs?)\b/gi,
            " "
        )
        .replace(
            /\b(?:Sort by|Online|Random|General Drops|Streamer Drops)\b/gi,
            " "
        )
        .replace(/\s+/g, " ")
        .trim();
}

function extraerDuracion(texto) {
    const coincidencia = limpiarTexto(texto).match(
        /^(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?)$/i
    );

    if (!coincidencia) return null;

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

function encontrarTarjeta($, nodo, duracion) {
    let actual = $(nodo);

    // La duración puede venir vacía o con una estructura inesperada.
    const duracionTexto = limpiarTexto(
        duracion?.texto ?? duracion?.text ?? ""
    );

    for (let nivel = 0; nivel < 10; nivel++) {
        if (!actual || !actual.length) break;

        const textoTarjeta = limpiarTexto(actual.text());
        const textoSinDuracion = obtenerTextoSinDuracion(textoTarjeta);

        if (
            textoTarjeta &&
            textoSinDuracion.length > 1 &&
            textoTarjeta.length <= 220 &&
            (!duracionTexto || textoTarjeta.length > duracionTexto.length)
        ) {
            // Preferir un contenedor que incluya imagen o enlace de recompensa.
            const tieneImagen = actual.find("img, video, source").length > 0;
            const tieneEnlace = actual.find("a").length > 0;

            if (tieneImagen || tieneEnlace || nivel >= 2) {
                return actual;
            }
        }

        const padre = actual.parent();

        if (!padre || !padre.length) break;
        actual = padre;
    }

    return null;
}

function extraerTarjetas($, inicioOrden, finOrden) {
    const recompensas = [];
    const duplicados = new Set();

    $("body *").each((indice, elemento) => {
        elemento.__dropsOrder = indice;
    });

    const elementos = $("body *").toArray();

    for (const elemento of elementos) {
        const nodo = $(elemento);

        // Las duraciones se buscan en nodos hoja para evitar repetir tarjetas.
        if (nodo.children().length > 0) continue;

        const duracion = extraerDuracion(nodo.text());
        if (!duracion) continue;

        const orden = obtenerOrden(elemento);

        if (orden <= inicioOrden || orden >= finOrden) continue;

        const tarjeta = encontrarTarjeta($, elemento, duracion);

        if (!tarjeta || !tarjeta.length) continue;

        let textoTarjeta = obtenerTextoSinDuracion(tarjeta.text());
        const nombresEnlaces = [];

        tarjeta.find("a").each((_, enlace) => {
            const nombreEnlace = limpiarTexto($(enlace).text());
            const href = $(enlace).attr("href") || "";

            if (
                nombreEnlace &&
                /twitch\.tv/i.test(href) &&
                !/^(online|random|sort by)$/i.test(nombreEnlace)
            ) {
                nombresEnlaces.push(nombreEnlace);
            }
        });

        let streamer = null;

        for (const nombreEnlace of nombresEnlaces) {
            if (
                textoTarjeta.toLowerCase().includes(nombreEnlace.toLowerCase()) &&
                !/^(rust|twitch)$/i.test(nombreEnlace)
            ) {
                streamer = nombreEnlace;
                textoTarjeta = textoTarjeta.replace(
                    new RegExp(escaparRegex(nombreEnlace), "i"),
                    " "
                );
                break;
            }
        }

        const nombre = normalizarNombre(textoTarjeta)
            .replace(/^[\s:|•\-–]+/, "")
            .replace(/[\s:|•\-–]+$/, "");

        if (
            !nombre ||
            nombre.length > 65 ||
            /^(watch|watching|available|getting|drops|hours?|minutes?|twitchrivals)$/i.test(nombre) ||
            /^(sort by|online random)$/i.test(nombre)
        ) {
            continue;
        }

        const clave = `${nombre.toLowerCase()}-${duracion.text}`;

        if (duplicados.has(clave)) continue;
        duplicados.add(clave);

        recompensas.push({
            nombre,
            streamer,
            tiempo: duracion.text,
            imagen: obtenerImagenTarjeta($, tarjeta)
        });
    }

    return recompensas;
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

    const estado = /\bLive Now\b/i.test(textoCompleto)
        ? "En curso"
        : /\bUpcoming\b/i.test(textoCompleto)
            ? "Próximamente"
            : null;

    const fechasMatch = textoCompleto.match(
        /((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\s+at\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*UTC\s*[-–]\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\s+at\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*UTC)/i
    );

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
        fechas: fechasMatch ? limpiarTexto(fechasMatch[1]) : null
    };
}

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

    return {
        fuente: FACEPUNCH_URL,
        campana: campana.campana || "Campaña oficial de Rust",
        estado: campana.estado || "Consulta oficial",
        tema: campana.tema,
        fechas: campana.fechas,
        generales,
        streamers,
        consultado: new Date().toISOString()
    };
}

function crearEmbedDrops(datos) {
    const embed = new EmbedBuilder()
        .setColor(0x9146ff)
        .setTitle("🎁 Rust — Twitch Drops oficiales")
        .setURL(FACEPUNCH_URL)
        .setDescription(
            `**Campaña:** ${datos.campana}\n` +
            `**Estado:** ${datos.estado}` +
            (datos.tema ? `\n**Tema:** ${datos.tema}` : "") +
            (datos.fechas ? `\n**Fechas:** ${datos.fechas}` : "")
        )
        .setFooter({
            text: "RustLogix • Fuente oficial de Facepunch"
        })
        .setTimestamp(new Date(datos.consultado));

    function agregarSeccion(titulo, recompensas) {
        if (!recompensas.length) {
            embed.addFields({
                name: titulo,
                value: "No se identificaron recompensas en esta sección."
            });
            return;
        }

        const lineas = recompensas.slice(0, 20).map(recompensa => {
            const nombre = escaparMarkdown(recompensa.nombre);
            const visible = recompensa.imagen
                ? `[${nombre}](${recompensa.imagen})`
                : `**${nombre}**`;

            const streamer = recompensa.streamer
                ? ` — ${escaparMarkdown(recompensa.streamer)}`
                : "";

            return `• ${visible} — ${recompensa.tiempo}${streamer}`;
        });

        embed.addFields({
            name: titulo,
            value: lineas.join("\n").slice(0, 1024)
        });
    }

    agregarSeccion("🌐 Recompensas generales", datos.generales);
    agregarSeccion("🎮 Recompensas de streamers", datos.streamers);

    const primeraImagen = [
        ...datos.generales,
        ...datos.streamers
    ].find(recompensa => recompensa.imagen)?.imagen;

    if (primeraImagen) embed.setThumbnail(primeraImagen);

    embed.addFields({
        name: "🔗 Fuente",
        value: `[Consultar Facepunch](${FACEPUNCH_URL})`
    });

    return embed;
}

function firmaCampana(datos) {
    return JSON.stringify({
        campana: datos.campana,
        estado: datos.estado,
        tema: datos.tema,
        fechas: datos.fechas,
        generales: datos.generales,
        streamers: datos.streamers
    });
}

async function publicarRustDrops(interaction) {
    const datos = await obtenerDropsOficiales();

    await interaction.editReply({
        embeds: [crearEmbedDrops(datos)],
        allowedMentions: { parse: [] }
    });

    return datos;
}

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
        const embed = crearEmbedDrops(datos);

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

                let mensaje = null;

                if (monitor.messageId) {
                    mensaje = await canal.messages
                        .fetch(monitor.messageId)
                        .catch(() => null);
                }

                if (monitor.campaignSignature === firma && mensaje) {
                    monitor.lastCheckedAt = new Date();
                    await monitor.save();
                    continue;
                }

                if (mensaje) {
                    await mensaje.edit({
                        embeds: [embed],
                        allowedMentions: { parse: [] }
                    });
                } else {
                    mensaje = await canal.send({
                        embeds: [embed],
                        allowedMentions: { parse: [] }
                    });
                }

                monitor.messageId = mensaje.id;
                monitor.campaignName = datos.campana;
                monitor.campaignSignature = firma;
                monitor.lastCheckedAt = new Date();

                await monitor.save();

                console.log(
                    `✅ Twitch Drops actualizados en ${canal.guild?.name || canal.id}`
                );
            } catch (error) {
                console.error(
                    `❌ Error actualizando Twitch Drops en ${monitor.guildId}:`,
                    error.message
                );
            }
        }
    } catch (error) {
        console.error("❌ Error revisando monitores de Twitch Drops:", error);
    } finally {
        revisando = false;
    }
}

function iniciarDropsAutomaticos(client) {
    if (temporizadorIniciado) return;

    cliente = client;
    temporizadorIniciado = true;

    console.log(
        "🟣 Monitor oficial de Twitch Drops iniciado (cada 5 minutos)."
    );

    revisarDropsAutomaticos().catch(console.error);

    setInterval(() => {
        revisarDropsAutomaticos().catch(console.error);
    }, INTERVALO_REVISION);
}

module.exports = {
    obtenerDropsOficiales,
    crearEmbedDrops,
    publicarRustDrops,
    iniciarDropsAutomaticos,
    revisarDropsAutomaticos
};
