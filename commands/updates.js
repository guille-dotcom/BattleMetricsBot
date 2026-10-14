
const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const axios = require("axios");
const cheerio = require("cheerio");

const NEWS_URL = "https://www.rustyfields.com/news";

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

        if (host.includes("youtube.com") ||
            host.includes("youtu.be")) {
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

    const fecha = new Date(
        Date.UTC(
            Number(match[3]),
            new Date(
                `${match[1]} 1, ${match[3]}`
            ).getMonth(),
            Number(match[2])
        )
    );

    return {
        fecha,
        fechaTexto:
            `${match[2]} ${MESES[match[1]] || match[1]} ${match[3]}`
    };
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

        if (
            /\/(news|store|support|careers|redeem)\/?$/i.test(
                new URL(url).pathname
            )
        ) {
            return;
        }

        urlsVistas.add(url);

        const datosFecha = obtenerFecha(texto);

        let contenido = texto
            .replace(
                /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}\b/i,
                ""
            )
            .trim();

        contenido = contenido.replace(
            /^(Facepunch|Rustafied|Shadowfrax)\s+/i,
            ""
        );

        if (contenido.length < 20) {
            return;
        }

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
            "Muestra las últimas novedades y adelantos de Rust"
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

            const noticias = extraerNoticias(
                respuesta.data
            );

            if (noticias.length === 0) {
                await interaction.editReply({
                    content:
                        "⚠️ No encontré noticias de Rust. " +
                        "Puedes consultar la página original:\n" +
                        NEWS_URL
                });

                return;
            }

            const embed = new EmbedBuilder()
                .setColor(0xD35400)
                .setTitle("📰 RUST | Updates y adelantos")
                .setURL(NEWS_URL)
                .setDescription(
                    "Últimas noticias, avances de desarrollo " +
                    "y actualizaciones de Rust.\n\n" +
                    "🟠 Los adelantos pueden cambiar antes " +
                    "de publicarse. Revisa la fuente original " +
                    "para confirmar cada novedad."
                )
                .setTimestamp()
                .setFooter({
                    text: "RustLogix • Noticias de Rust"
                });

            for (const noticia of noticias) {
                const icono =
                    noticia.fuente === "Facepunch"
                        ? "✅"
                        : "🔎";

                const resumen =
                    noticia.contenido.length > 650
                        ? noticia.contenido.slice(0, 647) + "..."
                        : noticia.contenido;

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
                    "Noticias: " + NEWS_URL
            });
        }
    }
};
