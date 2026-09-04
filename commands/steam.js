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
        const nombreBuscado = interaction.options
            .getString("nombre")
            .trim();

        await interaction.deferReply();

        try {
            console.log(
                `[STEAM] Buscando perfiles con nombre exacto: ${nombreBuscado}`
            );

            const perfiles = await buscarPerfilesSteam(nombreBuscado);

            if (perfiles.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(0x171a21)
                    .setTitle("🔎 Búsqueda de Steam")
                    .setDescription(
                        `No se encontraron perfiles con el nombre exacto:\n\n` +
                        `**${nombreBuscado}**`
                    )
                    .setFooter({
                        text: "Steam Community"
                    });

                return interaction.editReply({
                    embeds: [embed]
                });
            }

            const POR_PAGINA = 10;

            const paginas = [];

            for (
                let i = 0;
                i < perfiles.length;
                i += POR_PAGINA
            ) {
                paginas.push(
                    perfiles.slice(i, i + POR_PAGINA)
                );
            }

            let paginaActual = 0;

            function crearEmbed() {
                const perfilesPagina =
                    paginas[paginaActual];

                const embed = new EmbedBuilder()
                    .setColor(0x1b2838)
                    .setTitle(
                        `🔎 Perfiles de Steam`
                    )
                    .setDescription(
                        `Nombre buscado: **${nombreBuscado}**\n` +
                        `Coincidencias exactas: **${perfiles.length}**`
                    )
                    .setFooter({
                        text:
                            `Página ${paginaActual + 1}/${paginas.length}`
                    });

                for (
                    let i = 0;
                    i < perfilesPagina.length;
                    i++
                ) {
                    const perfil = perfilesPagina[i];

                    const numero =
                        paginaActual * POR_PAGINA +
                        i +
                        1;

                    let texto =
                        `🔗 [Abrir perfil](${perfil.url})`;

                    if (perfil.steamId) {
                        texto +=
                            `\n🆔 SteamID64: \`${perfil.steamId}\``;
                    }

                    embed.addFields({
                        name:
                            `${numero}. ${perfil.nombre}`,
                        value: texto,
                        inline: false
                    });
                }

                return embed;
            }

            function crearBotones() {
                return new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId("steam_anterior")
                            .setLabel("Anterior")
                            .setEmoji("◀️")
                            .setStyle(
                                ButtonStyle.Secondary
                            )
                            .setDisabled(
                                paginaActual === 0
                            ),

                        new ButtonBuilder()
                            .setCustomId("steam_siguiente")
                            .setLabel("Siguiente")
                            .setEmoji("▶️")
                            .setStyle(
                                ButtonStyle.Secondary
                            )
                            .setDisabled(
                                paginaActual ===
                                paginas.length - 1
                            )
                    );
            }

            const respuesta = {
                embeds: [crearEmbed()],
                components:
                    paginas.length > 1
                        ? [crearBotones()]
                        : []
            };

            await interaction.editReply(respuesta);

            if (paginas.length <= 1) {
                return;
            }

            const mensaje =
                await interaction.fetchReply();

            const collector =
                mensaje.createMessageComponentCollector({
                    time: 120000
                });

            collector.on(
                "collect",
                async buttonInteraction => {
                    if (
                        buttonInteraction.user.id !==
                        interaction.user.id
                    ) {
                        return buttonInteraction.reply({
                            content:
                                "❌ Solo la persona que ejecutó el comando puede utilizar estos botones.",
                            ephemeral: true
                        });
                    }

                    if (
                        buttonInteraction.customId ===
                        "steam_anterior"
                    ) {
                        if (paginaActual > 0) {
                            paginaActual--;
                        }
                    }

                    if (
                        buttonInteraction.customId ===
                        "steam_siguiente"
                    ) {
                        if (
                            paginaActual <
                            paginas.length - 1
                        ) {
                            paginaActual++;
                        }
                    }

                    await buttonInteraction.update({
                        embeds: [crearEmbed()],
                        components: [crearBotones()]
                    });
                }
            );

            collector.on("end", async () => {
                try {
                    const botonesFinales =
                        new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId(
                                        "steam_anterior_final"
                                    )
                                    .setLabel("Anterior")
                                    .setEmoji("◀️")
                                    .setStyle(
                                        ButtonStyle.Secondary
                                    )
                                    .setDisabled(true),

                                new ButtonBuilder()
                                    .setCustomId(
                                        "steam_siguiente_final"
                                    )
                                    .setLabel("Siguiente")
                                    .setEmoji("▶️")
                                    .setStyle(
                                        ButtonStyle.Secondary
                                    )
                                    .setDisabled(true)
                            );

                    await interaction.editReply({
                        components: [botonesFinales]
                    });
                } catch (error) {
                    // El mensaje puede haber sido eliminado.
                }
            });

        } catch (error) {
            console.error(
                "[STEAM] ERROR:",
                error
            );

            const embed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle(
                    "❌ Error buscando en Steam"
                )
                .setDescription(
                    "No se pudo realizar la búsqueda.\n\n" +
                    `\`${error.message}\``
                );

            try {
                await interaction.editReply({
                    embeds: [embed],
                    components: []
                });
            } catch (editError) {
                console.error(
                    "[STEAM] Error enviando error:",
                    editError
                );
            }
        }
    }
};


/* ============================================================
   BUSCAR PERFILES
   ============================================================ */

async function buscarPerfilesSteam(nombreBuscado) {
    const resultados = [];

    const MAX_PAGINAS = 20;
    const RESULTADOS_POR_PAGINA = 50;

    for (
        let pagina = 0;
        pagina < MAX_PAGINAS;
        pagina++
    ) {
        const inicio =
            pagina * RESULTADOS_POR_PAGINA;

        const url =
            "https://steamcommunity.com/search/users/?" +
            `text=${encodeURIComponent(nombreBuscado)}` +
            `&start=${inicio}`;

        console.log(
            `[STEAM] Buscando página ${pagina + 1}`
        );

        let response;

        try {
            response = await axios.get(url, {
                timeout: 20000,
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                        "AppleWebKit/537.36 (KHTML, like Gecko) " +
                        "Chrome/139.0.0.0 Safari/537.36",

                    "Accept":
                        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

                    "Accept-Language":
                        "es-ES,es;q=0.9,en;q=0.8"
                }
            });
        } catch (error) {
            console.error(
                `[STEAM] Error página ${pagina + 1}:`,
                error.message
            );

            break;
        }

        const html = response.data;

        if (
            !html ||
            typeof html !== "string"
        ) {
            break;
        }

        /*
         * Steam coloca cada resultado dentro de:
         *
         * <div class="search_row">
         *
         * Extraemos cada bloque.
         */

        const bloques =
            html.match(
                /<div[^>]*class=["']search_row["'][^>]*>[\s\S]*?<\/div>\s*<\/div>/gi
            ) || [];

        console.log(
            `[STEAM] Resultados encontrados en HTML: ${bloques.length}`
        );

        if (bloques.length === 0) {
            /*
             * Segundo método por si Steam cambia ligeramente
             * la estructura HTML.
             */
            const bloquesAlternativos =
                html.split(
                    'class="search_row"'
                );

            if (
                bloquesAlternativos.length <= 1
            ) {
                break;
            }

            for (
                let i = 1;
                i < bloquesAlternativos.length;
                i++
            ) {
                procesarBloque(
                    bloquesAlternativos[i],
                    nombreBuscado,
                    resultados
                );
            }
        } else {
            for (const bloque of bloques) {
                procesarBloque(
                    bloque,
                    nombreBuscado,
                    resultados
                );
            }
        }

        /*
         * Si Steam devuelve menos resultados de una página,
         * normalmente hemos llegado al final.
         */

        const cantidadResultados =
            bloques.length;

        if (
            cantidadResultados < 50 &&
            cantidadResultados !== 0
        ) {
            break;
        }

        await esperar(700);
    }

    /*
     * Eliminar duplicados.
     */

    const unicos = [];

    for (const perfil of resultados) {
        const existe = unicos.some(
            p =>
                p.url.toLowerCase() ===
                perfil.url.toLowerCase()
        );

        if (!existe) {
            unicos.push(perfil);
        }
    }

    console.log(
        `[STEAM] TOTAL COINCIDENCIAS EXACTAS: ${unicos.length}`
    );

    return unicos;
}


/* ============================================================
   PROCESAR RESULTADO
   ============================================================ */

function procesarBloque(
    bloque,
    nombreBuscado,
    resultados
) {
    if (!bloque) {
        return;
    }

    /*
     * Buscar nombre del perfil.
     */

    let nombre = null;

    const nombreMatch =
        bloque.match(
            /class=["'][^"']*searchPersonaName[^"']*["'][^>]*>([\s\S]*?)<\/a>/i
        );

    if (nombreMatch) {
        nombre =
            limpiarHTML(
                nombreMatch[1]
            ).trim();
    }

    /*
     * Si no encontramos el nombre, intentar otro formato.
     */

    if (!nombre) {
        const nombreAlternativo =
            bloque.match(
                /searchPersonaName[^>]*>([\s\S]*?)<\/a>/i
            );

        if (nombreAlternativo) {
            nombre =
                limpiarHTML(
                    nombreAlternativo[1]
                ).trim();
        }
    }

    if (!nombre) {
        return;
    }

    /*
     * COMPARACIÓN EXACTA.
     *
     * "Train9"  -> sí
     * "Train90" -> no
     * "The Train9" -> no
     * "Train9_" -> no
     */

    if (nombre !== nombreBuscado) {
        return;
    }

    /*
     * Buscar URL del perfil.
     */

    const urlMatch =
        bloque.match(
            /href=["'](https?:\/\/steamcommunity\.com\/[^"']+)["']/i
        );

    if (!urlMatch) {
        return;
    }

    let url =
        limpiarHTML(
            urlMatch[1]
        ).trim();

    /*
     * Limpiar parámetros innecesarios.
     */

    url = url.split("?")[0];

    /*
     * SteamID64.
     */

    const steamIdMatch =
        url.match(
            /\/profiles\/(\d{17})/i
        );

    const steamId =
        steamIdMatch
            ? steamIdMatch[1]
            : null;

    /*
     * Evitar duplicados.
     */

    const existe =
        resultados.some(
            perfil =>
                perfil.url.toLowerCase() ===
                url.toLowerCase()
        );

    if (existe) {
        return;
    }

    resultados.push({
        nombre,
        url,
        steamId
    });

    console.log(
        `[STEAM] COINCIDENCIA: ${nombre} | ${url}`
    );
}


/* ============================================================
   LIMPIAR HTML
   ============================================================ */

function limpiarHTML(texto) {
    if (!texto) {
        return "";
    }

    return texto
        .replace(/<[^>]*>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
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