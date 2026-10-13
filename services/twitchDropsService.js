
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
    return String(texto || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function escaparMarkdown(texto) {
    return String(texto || "")
        .replace(/([\\`*_{}[\]()#+\-.!|>~])/g, "\\$1");
}

function obtenerImagenes($) {
    const imagenes = [];

    $("img").each((_, elemento) => {
        const imagen = $(elemento);
        const nombre = limpiarTexto(
            imagen.attr("alt") ||
            imagen.attr("title")
        );

        const src =
            imagen.attr("src") ||
            imagen.attr("data-src") ||
            imagen.attr("data-original");

        if (
            nombre &&
            src &&
            !src.startsWith("data:")
        ) {
            try {
                imagenes.push({
                    nombre,
                    url: new URL(src, FACEPUNCH_URL).href
                });
            } catch {}
        }
    });

    return imagenes;
}

function extraerRecompensas(texto, imagenes) {
    const resultado = [];
    const encontrados = new Set();

    const patron =
        /([A-Za-z0-9][A-Za-z0-9'’&!()_ -]{0,65}?)\s+(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?)(?=\s|$)/gi;

    let coincidencia;

    while (
        (coincidencia = patron.exec(texto)) !== null
    ) {
        let nombre = limpiarTexto(coincidencia[1])
            .replace(/^[\s:|•\-]+/, "")
            .replace(/\s+/g, " ");

        nombre = nombre
            .split(/\b(?:General Drops|Streamer Drops|Drops Metrics|Available across|Available to unlock)\b/i)[0]
            .trim();

        if (
            !nombre ||
            nombre.length > 65 ||
            /^(watch|watching|available|getting|drops|hours?|minutes?)$/i.test(nombre)
        ) {
            continue;
        }

        const cantidad = Number(coincidencia[2]);
        const unidad = /^(minutes?|mins?)$/i.test(coincidencia[3])
            ? "min"
            : "h";

        const clave = `${nombre.toLowerCase()}-${cantidad}-${unidad}`;

        if (encontrados.has(clave)) {
            continue;
        }

        encontrados.add(clave);

        const imagen = imagenes.find(
            item =>
                item.nombre.toLowerCase() === nombre.toLowerCase()
        );

        resultado.push({
            nombre,
            tiempo: `${cantidad} ${unidad}`,
            imagen: imagen?.url || null
        });
    }

    return resultado;
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

    if (
        respuesta.status !== 200 ||
        typeof respuesta.data !== "string"
    ) {
        throw new Error(
            "Facepunch no devolvió una página HTML válida."
        );
    }

    const $ = cheerio.load(respuesta.data);
    const textoCompleto = limpiarTexto(
        $("body").text()
    );

    if (
        !textoCompleto ||
        !/Twitch Drops/i.test(textoCompleto) ||
        !/General Drops|Streamer Drops/i.test(textoCompleto)
    ) {
        throw new Error(
            "No se reconoció la estructura oficial de Twitch Drops. No se actualizarán los anuncios."
        );
    }

    const imagenes = obtenerImagenes($);

    const campanaMatch = textoCompleto.match(
        /Twitch Drops?\s+(?:Round\s*)?#?\s*(\d+)\s+Hosted by\s+(.+?)(?=\s+(?:General Drops|Streamer Drops|Drops Metrics|October|November|December|January|February|March|April|May|June|July|August|September)\b)/i
    );

    const tituloAlternativo = textoCompleto.match(
        /Twitch Drops?\s+(?:Round\s*)?#?\s*(\d+)/i
    );

    const nombreCampana = campanaMatch
        ? `Twitch Drops Round ${campanaMatch[1]} — Hosted by ${campanaMatch[2]}`
        : tituloAlternativo
            ? `Twitch Drops Round ${tituloAlternativo[1]}`
            : null;

    const estado = /\bLive Now\b/i.test(textoCompleto)
        ? "En curso"
        : /\bUpcoming\b/i.test(textoCompleto)
            ? "Próximamente"
            : null;

    const fechasMatch = textoCompleto.match(
        /((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\s+at\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*UTC\s*[-–]\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\s+at\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*UTC)/i
    );

    const temaMatch = nombreCampana
        ? textoCompleto.match(
            new RegExp(
                nombreCampana
                    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
                "\\s+(.+?)\\s+(?:General Drops|Streamer Drops)",
                "i"
            )
        )
        : null;

    const indiceGeneral = textoCompleto.search(/General Drops/i);
    const indiceStreamer = textoCompleto.search(/Streamer Drops/i);
    const indiceMetricas = textoCompleto.search(/Drops Metrics/i);

    if (indiceGeneral < 0 || indiceStreamer < 0) {
        throw new Error(
            "No se encontraron las secciones oficiales de recompensas."
        );
    }

    const textoGenerales = textoCompleto.slice(
        indiceGeneral,
        indiceStreamer
    );

    const finStreamer =
        indiceMetricas > indiceStreamer
            ? indiceMetricas
            : textoCompleto.length;

    const textoStreamers = textoCompleto.slice(
        indiceStreamer,
        finStreamer
    );

    const generales = extraerRecompensas(
        textoGenerales,
        imagenes
    );

    const streamers = extraerRecompensas(
        textoStreamers,
        imagenes
    );

    if (
        !nombreCampana &&
        generales.length === 0 &&
        streamers.length === 0
    ) {
        throw new Error(
            "La página no contiene datos suficientes para crear un anuncio fiable."
        );
    }

    return {
        fuente: FACEPUNCH_URL,
        campana: nombreCampana || "Campaña oficial de Rust",
        estado: estado || "Consulta oficial",
        tema: temaMatch
            ? limpiarTexto(temaMatch[1])
            : null,
        fechas: fechasMatch
            ? limpiarTexto(fechasMatch[1])
            : null,
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
                value: "No se pudieron identificar recompensas en esta sección."
            });
            return;
        }

        const lineas = recompensas.slice(0, 20).map(
            recompensa =>
                `• **${escaparMarkdown(recompensa.nombre)}** — ${recompensa.tiempo}`
        );

        embed.addFields({
            name: titulo,
            value: lineas.join("\n").slice(0, 1024)
        });
    }

    agregarSeccion(
        "🌐 Recompensas generales",
        datos.generales
    );

    agregarSeccion(
        "🎮 Recompensas de streamers",
        datos.streamers
    );

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
    if (revisando || !cliente) {
        return;
    }

    revisando = true;

    try {
        const monitores = await RustDropsMonitor.find({
            active: true,
            channelId: { $exists: true, $ne: null }
        });

        if (!monitores.length) {
            return;
        }

        let datos;

        try {
            datos = await obtenerDropsOficiales();
        } catch (error) {
            console.error(
                "❌ No se pudieron consultar los Twitch Drops oficiales:",
                error.message
            );

            // Nunca borrar ni reemplazar el anuncio si falla Facepunch.
            return;
        }

        const firma = firmaCampana(datos);
        const embed = crearEmbedDrops(datos);

        for (const monitor of monitores) {
            try {
                if (monitor.campaignSignature === firma) {
                    monitor.lastCheckedAt = new Date();
                    await monitor.save();
                    continue;
                }

                const canal = await cliente.channels
                    .fetch(monitor.channelId)
                    .catch(() => null);

                if (
                    !canal ||
                    !canal.isTextBased() ||
                    !canal.messages
                ) {
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
        console.error(
            "❌ Error revisando monitores de Twitch Drops:",
            error
        );
    } finally {
        revisando = false;
    }
}

function iniciarDropsAutomaticos(client) {
    if (temporizadorIniciado) {
        return;
    }

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
