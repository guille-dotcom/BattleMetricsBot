const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const axios = require("axios");
const cheerio = require("cheerio");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const STEAM_BASE = "https://steamcommunity.com";
const STEAM_SEARCH_URL = `${STEAM_BASE}/search/users/`;

const RESULTADOS_POR_PAGINA = 10;
const MAX_PAGINAS = 10;
const DELAY_ENTRE_PAGINAS = 800;

// =====================================================
// AXIOS
// =====================================================

const steam = axios.create({
    timeout: 20000,
    maxRedirects: 5,

    validateStatus: () => true,

    headers: {
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/139.0.0.0 Safari/537.36",

        "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9," +
            "image/avif,image/webp,image/apng,*/*;q=0.8",

        "Accept-Language":
            "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7"
    }
});

// =====================================================
// UTILIDADES
// =====================================================

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function limpiarTexto(texto) {
    return String(texto || "")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizarUrl(url) {
    if (!url) {
        return "";
    }

    let resultado = String(url).trim();

    if (resultado.startsWith("//")) {
        resultado = "https:" + resultado;
    }

    if (resultado.startsWith("/")) {
        resultado = STEAM_BASE + resultado;
    }

    return resultado;
}

function extraerSteamID64(url) {
    if (!url) {
        return null;
    }

    const match = String(url).match(
        /steamcommunity\.com\/profiles\/(\d{17})/i
    );

    return match ? match[1] : null;
}

// =====================================================
// EXTRAER PERFILES DE LA PÁGINA
// =====================================================

function extraerPerfiles(html) {
    const perfiles = [];

    if (!html) {
        return perfiles;
    }

    const $ = cheerio.load(html);

    $(".search_row").each((index, elemento) => {
        const fila = $(elemento);

        let enlace =
            fila.find("a.searchPersonaName").first();

        let nombre =
            limpiarTexto(enlace.text());

        let url =
            enlace.attr("href") || "";

        // ---------------------------------------------
        // MÉTODO ALTERNATIVO
        // ---------------------------------------------

        if (!url) {
            fila.find("a").each((i, elementoLink) => {
                if (url) {
                    return;
                }

                const href =
                    $(elementoLink).attr("href") || "";

                if (
                    href.includes(
                        "steamcommunity.com/id/"
                    ) ||
                    href.includes(
                        "steamcommunity.com/profiles/"
                    )
                ) {
                    url = href;

                    nombre =
                        limpiarTexto(
                            $(elementoLink).text()
                        );
                }
            });
        }

        if (!nombre || !url) {
            return;
        }

        url = normalizarUrl(url);

        perfiles.push({
            nombre,
            url,
            steamID64:
                extraerSteamID64(url)
        });
    });

    // =================================================
    // ELIMINAR DUPLICADOS
    // =================================================

    const vistos = new Set();

    return perfiles.filter(perfil => {
        const clave =
            perfil.steamID64 ||
            perfil.url.toLowerCase();

        if (vistos.has(clave)) {
            return false;
        }

        vistos.add(clave);

        return true;
    });
}

// =====================================================
// FILTRAR NOMBRE EXACTO
// =====================================================

function filtrarNombreExacto(
    perfiles,
    nombreBuscado
) {
    return perfiles.filter(perfil => {
        /*
         * IMPORTANTE:
         *
         * Se utiliza ===
         *
         * Por tanto:
         *
         * low    -> coincide con low
         * Low    -> NO coincide
         * LOW    -> NO coincide
         * low123 -> NO coincide
         * the low -> NO coincide
         */

        return perfil.nombre === nombreBuscado;
    });
}

// =====================================================
// BUSCAR UNA PÁGINA
// =====================================================

async function buscarPagina(
    nombre,
    pagina
) {
    const url =
        `${STEAM_SEARCH_URL}` +
        `?text=${encodeURIComponent(nombre)}` +
        `&filter=users` +
        `&page=${pagina}`;

    console.log(
        `[STEAM] Buscando página ${pagina}: ${url}`
    );

    try {
        const respuesta =
            await steam.get(url);

        console.log(
            `[STEAM] Página ${pagina}: HTTP ${respuesta.status}`
        );

        if (respuesta.status !== 200) {
            return [];
        }

        const perfiles =
            extraerPerfiles(
                String(
                    respuesta.data || ""
                )
            );

        console.log(
            `[STEAM] Perfiles encontrados en página ${pagina}: ${perfiles.length}`
        );

        return perfiles;

    } catch (error) {
        console.log(
            `[STEAM] Error página ${pagina}: ${error.message}`
        );

        return [];
    }
}

// =====================================================
// BUSCAR TODOS LOS PERFILES CON NOMBRE EXACTO
// =====================================================

async function buscarPerfilesExactos(
    nombreBuscado
) {
    console.log(
        `[STEAM] ========================================`
    );

    console.log(
        `[STEAM] BUSCANDO NOMBRE EXACTO: "${nombreBuscado}"`
    );

    console.log(
        `[STEAM] ========================================`
    );

    const resultados = [];
    const vistos = new Set();

    for (
        let pagina = 1;
        pagina <= MAX_PAGINAS;
        pagina++
    ) {
        const perfiles =
            await buscarPagina(
                nombreBuscado,
                pagina
            );

        if (perfiles.length === 0) {
            console.log(
                `[STEAM] Página ${pagina} sin resultados.`
            );

            break;
        }

        // =================================================
        // SOLO NOMBRES EXACTOS
        // =================================================

        const exactos =
            filtrarNombreExacto(
                perfiles,
                nombreBuscado
            );

        console.log(
            `[STEAM] Coincidencias EXACTAS en página ${pagina}: ${exactos.length}`
        );

        for (const perfil of exactos) {
            const clave =
                perfil.steamID64 ||
                perfil.url.toLowerCase();

            if (!vistos.has(clave)) {
                vistos.add(clave);

                resultados.push(perfil);
            }
        }

        // =================================================
        // SI LA PÁGINA TIENE MENOS DE 10,
        // YA NO HAY MÁS PÁGINAS
        // =================================================

        if (
            perfiles.length <
            RESULTADOS_POR_PAGINA
        ) {
            break;
        }

        if (
            pagina < MAX_PAGINAS
        ) {
            await esperar(
                DELAY_ENTRE_PAGINAS
            );
        }
    }

    console.log(
        `[STEAM] ========================================`
    );

    console.log(
        `[STEAM] RESULTADO FINAL: ${resultados.length} perfiles exactos`
    );

    console.log(
        `[STEAM] ========================================`
    );

    return resultados;
}

// =====================================================
// CREAR DESCRIPCIÓN
// =====================================================

function crearDescripcion(
    perfil,
    numero
) {
    let texto =
        `**${numero}. ${perfil.nombre}**\n`;

    texto +=
        `🔗 ${perfil.url}\n`;

    if (perfil.steamID64) {
        texto +=
            `🆔 SteamID64: \`${perfil.steamID64}\``;
    } else {
        texto +=
            `🆔 SteamID64: No disponible`;
    }

    return texto;
}

// =====================================================
// CREAR EMBED
// =====================================================

function crearEmbed(
    perfiles,
    pagina,
    nombreBuscado
) {
    const inicio =
        pagina *
        RESULTADOS_POR_PAGINA;

    const paginaPerfiles =
        perfiles.slice(
            inicio,
            inicio +
                RESULTADOS_POR_PAGINA
        );

    const totalPaginas =
        Math.max(
            1,
            Math.ceil(
                perfiles.length /
                    RESULTADOS_POR_PAGINA
            )
        );

    return new EmbedBuilder()
        .setTitle(
            `🔎 Perfiles de Steam — "${nombreBuscado}"`
        )
        .setDescription(
            paginaPerfiles
                .map(
                    (perfil, index) =>
                        crearDescripcion(
                            perfil,
                            inicio +
                                index +
                                1
                        )
                )
                .join("\n\n")
        )
        .setFooter({
            text:
                `Página ${pagina + 1}/${totalPaginas} • ` +
                `${perfiles.length} coincidencias exactas`
        });
}

// =====================================================
// BOTONES
// =====================================================

function crearBotones(
    pagina,
    total,
    usuarioId,
    deshabilitados = false
) {
    const totalPaginas =
        Math.max(
            1,
            Math.ceil(
                total /
                    RESULTADOS_POR_PAGINA
            )
        );

    const anterior =
        new ButtonBuilder()
            .setCustomId(
                `steam_anterior_${usuarioId}`
            )
            .setLabel("Anterior")
            .setEmoji("⬅️")
            .setStyle(
                ButtonStyle.Secondary
            )
            .setDisabled(
                deshabilitados ||
                pagina <= 0
            );

    const siguiente =
        new ButtonBuilder()
            .setCustomId(
                `steam_siguiente_${usuarioId}`
            )
            .setLabel("Siguiente")
            .setEmoji("➡️")
            .setStyle(
                ButtonStyle.Secondary
            )
            .setDisabled(
                deshabilitados ||
                pagina >=
                    totalPaginas - 1
            );

    return new ActionRowBuilder()
        .addComponents(
            anterior,
            siguiente
        );
}

// =====================================================
// COMANDO
// =====================================================

module.exports = {
    data:
        new SlashCommandBuilder()
            .setName("steam")
            .setDescription(
                "Busca perfiles de Steam por nombre exacto"
            )
            .addStringOption(
                option =>
                    option
                        .setName("nombre")
                        .setDescription(
                            "Nombre exacto del perfil de Steam"
                        )
                        .setRequired(true)
            ),

    async execute(interaction) {
        const nombre =
            interaction.options
                .getString("nombre")
                .trim();

        console.log(
            `[STEAM] Entrada recibida: "${nombre}"`
        );

        await interaction.deferReply();

        // =================================================
        // BUSCAR
        // =================================================

        const perfiles =
            await buscarPerfilesExactos(
                nombre
            );

        // =================================================
        // SIN RESULTADOS
        // =================================================

        if (
            perfiles.length === 0
        ) {
            await interaction.editReply({
                content:
                    `❌ No se encontraron perfiles de Steam cuyo nombre sea exactamente **${nombre}**.`
            });

            console.log(
                `[STEAM] No hay coincidencias exactas para "${nombre}".`
            );

            return;
        }

        // =================================================
        // PAGINACIÓN
        // =================================================

        let pagina = 0;

        const actualizar =
            async () => {
                await interaction.editReply({
                    embeds: [
                        crearEmbed(
                            perfiles,
                            pagina,
                            nombre
                        )
                    ],

                    components: [
                        crearBotones(
                            pagina,
                            perfiles.length,
                            interaction.user.id
                        )
                    ]
                });
            };

        await actualizar();

        // =================================================
        // COLLECTOR
        // =================================================

        const mensaje =
            await interaction.fetchReply();

        const collector =
            mensaje.createMessageComponentCollector({
                time: 120000
            });

        collector.on(
            "collect",
            async boton => {
                try {
                    // -------------------------------------
                    // SOLO EL USUARIO QUE EJECUTÓ /STEAM
                    // -------------------------------------

                    if (
                        boton.user.id !==
                        interaction.user.id
                    ) {
                        await boton.reply({
                            content:
                                "❌ Solo la persona que ejecutó `/steam` puede utilizar estos botones.",
                            ephemeral: true
                        });

                        return;
                    }

                    const totalPaginas =
                        Math.max(
                            1,
                            Math.ceil(
                                perfiles.length /
                                    RESULTADOS_POR_PAGINA
                            )
                        );

                    if (
                        boton.customId.startsWith(
                            "steam_anterior_"
                        )
                    ) {
                        pagina =
                            Math.max(
                                0,
                                pagina - 1
                            );
                    }

                    if (
                        boton.customId.startsWith(
                            "steam_siguiente_"
                        )
                    ) {
                        pagina =
                            Math.min(
                                totalPaginas - 1,
                                pagina + 1
                            );
                    }

                    await boton.update({
                        embeds: [
                            crearEmbed(
                                perfiles,
                                pagina,
                                nombre
                            )
                        ],

                        components: [
                            crearBotones(
                                pagina,
                                perfiles.length,
                                interaction.user.id
                            )
                        ]
                    });

                } catch (error) {
                    console.log(
                        `[STEAM] Error en botón: ${error.message}`
                    );
                }
            }
        );

        // =================================================
        // FINAL DEL COLLECTOR
        // =================================================

        collector.on(
            "end",
            async () => {
                try {
                    await interaction.editReply({
                        components: [
                            crearBotones(
                                pagina,
                                perfiles.length,
                                interaction.user.id,
                                true
                            )
                        ]
                    });
                } catch {
                    // El mensaje puede haber sido eliminado.
                }
            }
        );
    }
};