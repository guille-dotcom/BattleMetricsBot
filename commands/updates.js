
const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const axios = require("axios");
const cheerio = require("cheerio");

const NEWS_URL = "https://www.rustyfields.com/news";
const TRANSLATE_URL = "https://translate.googleapis.com/translate_a/single";

const MESES = {
    Jan: "ene",
    Feb: "feb",
    Mar: "mar",
    Apr: "abr",
    May: "may",
    Jun: "jun",
    Jul: "jul",
    Aug: "ago",
    Sep: "sep",
    Oct: "oct",
    Nov: "nov",
    Dec: "dic"
};

function limpiarTexto(texto) {
    return String(texto || "")
        .replace(/\s+/g, " ")
        .trim();
}

function obtenerFuente(url) {
    try {
        const host = new URL(url).hostname.toLowerCase();

        if (host.includes("facepunch.com")) {
            return "Facepunch";
        }

        if (host.includes("rustafied.com")) {
            return "Rustafied";
        }

        if (
            host.includes("youtube.com") ||
            host.includes("youtu.be")
        ) {
            return "Shadowfrax";
        }

        return null;
    } catch {
        return null;
    }
}

function obtenerFecha(texto) {
    const match = texto.match(
        /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})\b/i
    );

    if (!match) {
        return {
            fecha: null,
            fechaTexto: "Fecha no disponible"
        };
    }

    const mes = match[1].slice(0, 1).toUpperCase() +
        match[1].slice(1, 3).toLowerCase();

    const fecha = new Date(
        Date.UTC(
            Number(match[3]),
            new Date(`${mes} 1, ${match[3]}`).getMonth(),
            Number(match[2])
        )
    );

    return {
        fecha,
        fechaTexto:
            `${match[2]} ${MESES[mes] || mes} ${match[3]}`
    };
}

// Traduce el texto del inglés al español.
// Si Google Translate falla, devuelve el texto original.
async function traducirTexto(texto) {
    const original = limpiarTexto(texto);

    if (!original) {
        return original;
    }

    try {
        const respuesta = await axios.get(TRANSLATE_URL, {
            params: {
                client: "gtx",
                sl: "auto",
                tl: "es",
                dt: "t",
                q: original
            },
            timeout: 12000,
            headers: {
                "User-Agent": "Mozilla/5.0"
            }
        });

        const segmentos = respuesta.data?.[0];

        if (!Array.isArray(segmentos)) {
            return original;
        }

        const traducido = segmentos
            .map(segmento => segmento?.[0] || "")
            .join("");

        return limpiarTexto(traducido) || original;
    } catch (error) {
        console.warn(
            "⚠️ No se pudo traducir una noticia:",
            error.message
        );

        return original;
    }
}

function extraerNoticias(html) {
    const $ = cheerio.load(html);
    const noticias = [];
    const urlsVistas = new Set();

    $("a[href]").each((_, elemento) => {
        const enlace = $(elemento).attr("href");
        const texto = limpiarTexto($(elemento).text());

        if (!enlace || texto.length < 35) {
            return;
        }

        let url;

        try {
            url = new URL(enlace, NEWS_URL).href;
        } catch {
            return;
        }

        const fuente = obtenerFuente(url);

        if (!fuente || urlsVistas.has(url)) {
            return;
        }

        const pathname = new URL(url).pathname;

        if (
            /^\/(news|store|support|careers|redeem)\/?$/i.test(
                pathname
            )
        ) {
            return;
        }

        const datosFecha = obtenerFecha(texto);

        let contenido = texto.replace(
            /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}\b/i,
            ""
        );

        contenido = limpiarTexto(
            contenido.replace(
                /^(Facepunch|Rustafied|Shadowfrax)\s+/i,
                ""
            )
        );

        if (contenido.length < 20) {
            return;
        }

        urlsVistas.add(url);

        noticias.push({
            fuente,
            url,
            contenido,
            fecha: datosFecha.fecha,
            fechaTexto: datosFecha.fechaTexto
        });
    });

    noticias.sort((a, b) => {
        if (!a.fecha) return 1;
        if (!b.fecha) return -1;

        return b.fecha.getTime() - a.fecha.getTime();
    });

    return noticias.slice(0, 8);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("updates")
        .setDescription(
            "Muestra las últimas novedades y adelantos de Rust en español"
        ),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const respuesta = await axios.get(NEWS_URL, {
                timeout: 20000,
                headers: {
                    "User-Agent":
                        "RustLogix/1.0 (Discord Rust news command)",
                    "Accept":
                        "text/html,application/xhtml+xml"
                }
            });

            const noticias = extraerNoticias(respuesta.data);

            if (noticias.length === 0) {
                await interaction.editReply({
                    content:
                        "⚠️ No encontré noticias de Rust.\n" +
                        `Consulta la fuente original: ${NEWS_URL}`
                });

                return;
            }

            // Traduce las noticias encontradas al español.
            const noticiasTraducidas = await Promise.all(
                noticias.map(async noticia => ({
                    ...noticia,
                    contenido: await traducirTexto(noticia.contenido)
                }))
            );

            const embed = new EmbedBuilder()
                .setColor(0xD35400)
                .setTitle("📰 RUST | Novedades y adelantos")
                .setURL(NEWS_URL)
                .setDescription(
                    "Últimas noticias, avances de desarrollo y " +
                    "actualizaciones de Rust, traducidos al español.\n\n" +
                    "🟠 Los adelantos pueden cambiar antes de publicarse. " +
                    "Consulta la fuente original para confirmar los detalles."
                )
                .setTimestamp()
                .setFooter({
                    text: "RustLogix • Noticias de Rust en español"
                });

            for (const noticia of noticiasTraducidas) {
                const icono =
                    noticia.fuente === "Facepunch"
                        ? "✅"
                        : "🔎";

                let resumen = limpiarTexto(noticia.contenido);

                if (resumen.length > 480) {
                    resumen = resumen.slice(0, 477).trimEnd() + "...";
                }

                const valor =
                    `${resumen}\n\n` +
                    `[Leer publicación original](${noticia.url})`;

                embed.addFields({
                    name:
                        `${icono} ${noticia.fuente} • ` +
                        noticia.fechaTexto,
                    value: valor.slice(0, 1024)
                });
            }

            await interaction.editReply({
                embeds: [embed]
            });

        } catch (error) {
            console.error(
                "❌ Error ejecutando /updates:",
                error.message
            );

            await interaction.editReply({
                content:
                    "❌ No pude obtener las novedades de Rust " +
                    "en este momento. Inténtalo más tarde.\n" +
                    `Noticias: ${NEWS_URL}`
            });
        }
    }
};
