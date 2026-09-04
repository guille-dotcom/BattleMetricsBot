const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const axios = require("axios");

module.exports = {

    data: new SlashCommandBuilder()

        .setName("steam")
        .setDescription("Busca perfiles de Steam por nombre exacto")

        .addStringOption(option =>

            option
                .setName("nombre")
                .setDescription("Nombre exacto del perfil de Steam")
                .setRequired(true)
                .setMaxLength(100)

        ),

    async execute(interaction) {

        const nombreBuscado = interaction.options.getString("nombre");

        console.log(`[STEAM] Buscando perfiles con nombre exacto: ${nombreBuscado}`);

        await interaction.deferReply();

        try {

            const perfiles = await buscarPerfilesSteam(nombreBuscado);

            console.log(`[STEAM] TOTAL COINCIDENCIAS EXACTAS: ${perfiles.length}`);

            if (!perfiles.length) {

                const embed = new EmbedBuilder()

                    .setTitle("🔎 Búsqueda de Steam")

                    .setDescription(
                        `No se encontraron perfiles con el nombre exacto: **${nombreBuscado}**`
                    )

                    .setColor(0x171a21)

                    .setFooter({
                        text: "Steam Community"
                    });

                return interaction.editReply({
                    embeds: [embed]
                });

            }

            let pagina = 0;

            const porPagina = 10;

            const totalPaginas = Math.ceil(perfiles.length / porPagina);

            function crearEmbed() {

                const inicio = pagina * porPagina;

                const perfilesPagina = perfiles.slice(
                    inicio,
                    inicio + porPagina
                );

                let descripcion = "";

                perfilesPagina.forEach((perfil, index) => {

                    descripcion +=
                        `**${inicio + index + 1}. ${perfil.nombre}**\n`;

                    descripcion +=
                        `🔗 [Ver perfil](${perfil.url})\n`;

                    if (perfil.steamid) {

                        descripcion +=
                            `🆔 \`${perfil.steamid}\`\n`;

                    }

                    descripcion += "\n";

                });

                return new EmbedBuilder()

                    .setTitle("🔎 Búsqueda de Steam")

                    .setDescription(descripcion)

                    .setColor(0x171a21)

                    .setFooter({
                        text: `Página ${pagina + 1}/${totalPaginas} • ${perfiles.length} coincidencias exactas`
                    });

            }

            function crearBotones() {

                return new ActionRowBuilder()

                    .addComponents(

                        new ButtonBuilder()

                            .setCustomId("steam_anterior")

                            .setLabel("Anterior")

                            .setEmoji("⬅️")

                            .setStyle(ButtonStyle.Secondary)

                            .setDisabled(pagina === 0),

                        new ButtonBuilder()

                            .setCustomId("steam_siguiente")

                            .setLabel("Siguiente")

                            .setEmoji("➡️")

                            .setStyle(ButtonStyle.Secondary)

                            .setDisabled(pagina >= totalPaginas - 1)

                    );

            }

            const mensaje = await interaction.editReply({

                embeds: [
                    crearEmbed()
                ],

                components: totalPaginas > 1
                    ? [crearBotones()]
                    : []

            });

            if (totalPaginas <= 1) {

                return;

            }

            const collector = mensaje.createMessageComponentCollector({
                time: 120000
            });

            collector.on("collect", async buttonInteraction => {

                if (buttonInteraction.user.id !== interaction.user.id) {

                    return buttonInteraction.reply({

                        content: "❌ Solo la persona que ejecutó este comando puede usar estos botones.",

                        ephemeral: true

                    });

                }

                if (buttonInteraction.customId === "steam_anterior") {

                    if (pagina > 0) {

                        pagina--;

                    }

                }

                if (buttonInteraction.customId === "steam_siguiente") {

                    if (pagina < totalPaginas - 1) {

                        pagina++;

                    }

                }

                await buttonInteraction.update({

                    embeds: [
                        crearEmbed()
                    ],

                    components: [
                        crearBotones()
                    ]

                });

            });

            collector.on("end", async () => {

                try {

                    await interaction.editReply({

                        components: [

                            new ActionRowBuilder()

                                .addComponents(

                                    new ButtonBuilder()

                                        .setCustomId("steam_anterior")

                                        .setLabel("Anterior")

                                        .setEmoji("⬅️")

                                        .setStyle(ButtonStyle.Secondary)

                                        .setDisabled(true),

                                    new ButtonBuilder()

                                        .setCustomId("steam_siguiente")

                                        .setLabel("Siguiente")

                                        .setEmoji("➡️")

                                        .setStyle(ButtonStyle.Secondary)

                                        .setDisabled(true)

                                )

                        ]

                    });

                } catch (error) {

                    console.log(
                        "[STEAM] No se pudieron desactivar los botones."
                    );

                }

            });

        } catch (error) {

            console.error(
                "[STEAM] ERROR:",
                error.message
            );

            const embed = new EmbedBuilder()

                .setTitle("❌ Error")

                .setDescription(
                    "Ocurrió un error al buscar perfiles en Steam."
                )

                .setColor(0xff0000);

            if (interaction.deferred || interaction.replied) {

                await interaction.editReply({
                    embeds: [embed],
                    components: []
                });

            }

        }

    }

};


/* ============================================================
   BUSCAR PERFILES
   ============================================================ */

async function buscarPerfilesSteam(nombreBuscado) {

    const perfiles = [];

    const vistos = new Set();

    const nombreExacto = nombreBuscado.trim();

    const maxPaginas = 20;

    const resultadosPorPagina = 50;

    for (let pagina = 0; pagina < maxPaginas; pagina++) {

        console.log(
            `[STEAM] Buscando página ${pagina + 1}`
        );

        const start = pagina * resultadosPorPagina;

        try {

            const response = await axios.get(
                "https://steamcommunity.com/search/SearchCommunityAjax",
                {

                    params: {

                        text: nombreExacto,

                        filter: "users",

                        start: start,

                        count: resultadosPorPagina

                    },

                    headers: {

                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/139.0.0.0 Safari/537.36",

                        "Accept":
                            "application/json, text/javascript, */*; q=0.01",

                        "X-Requested-With":
                            "XMLHttpRequest",

                        "Referer":
                            "https://steamcommunity.com/search/users/"

                    },

                    timeout: 15000

                }
            );

            let html = "";

            if (typeof response.data === "string") {

                try {

                    const json = JSON.parse(response.data);

                    html =
                        json.html ||
                        json.results_html ||
                        json.content ||
                        "";

                } catch {

                    html = response.data;

                }

            } else if (response.data) {

                html =
                    response.data.html ||
                    response.data.results_html ||
                    response.data.content ||
                    "";

            }

            if (!html) {

                console.log(
                    "[STEAM] La página no devolvió resultados."
                );

                break;

            }

            const bloques = extraerBloques(html);

            console.log(
                `[STEAM] Resultados encontrados en HTML: ${bloques.length}`
            );

            if (!bloques.length) {

                break;

            }

            let coincidenciasPagina = 0;

            for (const bloque of bloques) {

                const perfil = procesarBloque(
                    bloque,
                    nombreExacto
                );

                if (!perfil) {

                    continue;

                }

                if (perfil.nombre !== nombreExacto) {

                    continue;

                }

                if (vistos.has(perfil.url)) {

                    continue;

                }

                vistos.add(perfil.url);

                perfiles.push(perfil);

                coincidenciasPagina++;

            }

            console.log(
                `[STEAM] Coincidencias exactas página ${pagina + 1}: ${coincidenciasPagina}`
            );

            if (bloques.length < resultadosPorPagina) {

                break;

            }

            await esperar(500);

        } catch (error) {

            console.error(
                `[STEAM] Error página ${pagina + 1}:`,
                error.message
            );

            break;

        }

    }

    return perfiles;

}


/* ============================================================
   EXTRAER BLOQUES
   ============================================================ */

function extraerBloques(html) {

    const bloques = [];

    const regex =
        /<div[^>]+class=["'][^"']*search_row[^"']*["'][^>]*>[\s\S]*?(?=<div[^>]+class=["'][^"']*search_row[^"']*["']|$)/gi;

    let match;

    while ((match = regex.exec(html)) !== null) {

        bloques.push(match[0]);

    }

    return bloques;

}


/* ============================================================
   PROCESAR RESULTADO
   ============================================================ */

function procesarBloque(bloque, nombreBuscado) {

    try {

        let nombre = "";

        const nombreMatch =

            bloque.match(
                /class=["'][^"']*searchPersonaName[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i
            )

            ||

            bloque.match(
                /class=["'][^"']*searchPersonaName[^"']*["'][^>]*>([\s\S]*?)</i
            );

        if (nombreMatch) {

            nombre = limpiarHTML(
                nombreMatch[1]
            ).trim();

        }

        if (!nombre) {

            const textoMatch =
                bloque.match(
                    /searchPersonaName[^>]*>([\s\S]*?)</i
                );

            if (textoMatch) {

                nombre = limpiarHTML(
                    textoMatch[1]
                ).trim();

            }

        }

        if (!nombre) {

            return null;

        }

        const urlMatch =

            bloque.match(
                /href=["'](https?:\/\/steamcommunity\.com\/(?:profiles\/\d+|id\/[^"'?#]+)[^"']*)["']/i
            )

            ||

            bloque.match(
                /href=["'](\/(?:profiles\/\d+|id\/[^"'?#]+)[^"']*)["']/i
            );

        if (!urlMatch) {

            return null;

        }

        let url = urlMatch[1];

        if (url.startsWith("/")) {

            url =
                `https://steamcommunity.com${url}`;

        }

        url = url.split("&")[0];

        let steamid = "";

        const steamidMatch =
            url.match(
                /\/profiles\/(\d+)/
            );

        if (steamidMatch) {

            steamid = steamidMatch[1];

        }

        return {

            nombre: nombre,

            url: url,

            steamid: steamid

        };

    } catch (error) {

        console.error(
            "[STEAM] Error procesando resultado:",
            error.message
        );

        return null;

    }

}


/* ============================================================
   LIMPIAR HTML
   ============================================================ */

function limpiarHTML(texto) {

    if (!texto) {

        return "";

    }

    return texto

        .replace(/<br\s*\/?>/gi, " ")

        .replace(/<[^>]*>/g, "")

        .replace(/&nbsp;/gi, " ")

        .replace(/&amp;/gi, "&")

        .replace(/&quot;/gi, '"')

        .replace(/&#39;/gi, "'")

        .replace(/&lt;/gi, "<")

        .replace(/&gt;/gi, ">")

        .replace(/\s+/g, " ")

        .trim();

}


/* ============================================================
   ESPERA
   ============================================================ */

function esperar(ms) {

    return new Promise(resolve => {

        setTimeout(resolve, ms);

    });

}