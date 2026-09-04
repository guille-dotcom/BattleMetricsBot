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

        .setDescription("Busca perfiles de Steam por nombre exacto y filtra jugadores de Rust")

        .addStringOption(option =>

            option

                .setName("nombre")

                .setDescription("Nombre exacto de Steam o enlace de BattleMetrics")

                .setRequired(true)

                .setMaxLength(200)

        ),

    async execute(interaction) {

        const entrada =
            interaction.options.getString("nombre").trim();

        console.log(
            `[STEAM] Entrada recibida: ${entrada}`
        );

        await interaction.deferReply();

        try {

            let nombreBuscado = entrada;

            /* ========================================================
               SI ES UN ENLACE DE BATTLEMETRICS
               ======================================================== */

            if (
                entrada.includes("battlemetrics.com/players/")
            ) {

                console.log(
                    "[STEAM] Se detectó un enlace de BattleMetrics."
                );

                nombreBuscado =
                    await obtenerNombreBattleMetrics(
                        entrada
                    );

                if (!nombreBuscado) {

                    const embed = new EmbedBuilder()

                        .setTitle("❌ BattleMetrics")

                        .setDescription(
                            "No pude obtener el nombre del jugador desde ese perfil de BattleMetrics."
                        )

                        .setColor(0xff0000);

                    return interaction.editReply({

                        embeds: [embed],

                        components: []

                    });

                }

                console.log(
                    `[STEAM] Nombre obtenido desde BattleMetrics: ${nombreBuscado}`
                );

            }

            console.log(
                `[STEAM] Buscando perfiles con nombre exacto: ${nombreBuscado}`
            );

            const perfiles =
                await buscarPerfilesSteam(
                    nombreBuscado
                );

            console.log(
                `[STEAM] Perfiles con nombre exacto encontrados: ${perfiles.length}`
            );

            if (!perfiles.length) {

                const embed = new EmbedBuilder()

                    .setTitle("🔎 Búsqueda de Steam")

                    .setDescription(

                        `No se encontraron perfiles de Steam que:\n\n` +

                        `• Se llamen exactamente **${nombreBuscado}**\n` +

                        `• Tengan **Rust** visible en su perfil o inventario.`

                    )

                    .setColor(0x171a21)

                    .setFooter({

                        text: "Steam Community"

                    });

                return interaction.editReply({

                    embeds: [embed],

                    components: []

                });

            }

            let pagina = 0;

            const porPagina = 10;

            const totalPaginas =
                Math.ceil(
                    perfiles.length / porPagina
                );

            function crearEmbed() {

                const inicio =
                    pagina * porPagina;

                const perfilesPagina =
                    perfiles.slice(

                        inicio,

                        inicio + porPagina

                    );

                let descripcion = "";

                perfilesPagina.forEach(
                    (perfil, index) => {

                        descripcion +=
                            `**${inicio + index + 1}. ${perfil.nombre}**\n`;

                        descripcion +=
                            `🔗 [Ver perfil](${perfil.url})\n`;

                        if (perfil.steamid) {

                            descripcion +=
                                `🆔 \`${perfil.steamid}\`\n`;

                        }

                        if (
                            perfil.tieneRust
                        ) {

                            descripcion +=
                                `🎮 **Rust: Sí**\n`;

                        }

                        if (
                            perfil.inventarioRust
                        ) {

                            descripcion +=
                                `🎒 **Skins/Inventario Rust: Sí**\n`;

                        }

                        descripcion += "\n";

                    }
                );

                return new EmbedBuilder()

                    .setTitle("🔎 Búsqueda de Steam")

                    .setDescription(
                        descripcion
                    )

                    .setColor(0x171a21)

                    .setFooter({

                        text:
                            `Página ${pagina + 1}/${totalPaginas} • ${perfiles.length} perfiles de Rust • Nombre exacto: ${nombreBuscado}`

                    });

            }

            function crearBotones() {

                return new ActionRowBuilder()

                    .addComponents(

                        new ButtonBuilder()

                            .setCustomId(
                                "steam_anterior"
                            )

                            .setLabel(
                                "Anterior"
                            )

                            .setEmoji("⬅️")

                            .setStyle(
                                ButtonStyle.Secondary
                            )

                            .setDisabled(
                                pagina === 0
                            ),

                        new ButtonBuilder()

                            .setCustomId(
                                "steam_siguiente"
                            )

                            .setLabel(
                                "Siguiente"
                            )

                            .setEmoji("➡️")

                            .setStyle(
                                ButtonStyle.Secondary
                            )

                            .setDisabled(
                                pagina >=
                                totalPaginas - 1
                            )

                    );

            }

            const mensaje =
                await interaction.editReply({

                    embeds: [

                        crearEmbed()

                    ],

                    components:
                        totalPaginas > 1
                            ? [crearBotones()]
                            : []

                });

            if (
                totalPaginas <= 1
            ) {

                return;

            }

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
                                "❌ Solo la persona que ejecutó este comando puede usar estos botones.",

                            ephemeral: true

                        });

                    }

                    if (
                        buttonInteraction.customId ===
                        "steam_anterior"
                    ) {

                        if (
                            pagina > 0
                        ) {

                            pagina--;

                        }

                    }

                    if (
                        buttonInteraction.customId ===
                        "steam_siguiente"
                    ) {

                        if (
                            pagina <
                            totalPaginas - 1
                        ) {

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

                }
            );

            collector.on(
                "end",
                async () => {

                    try {

                        await interaction.editReply({

                            components: [

                                new ActionRowBuilder()

                                    .addComponents(

                                        new ButtonBuilder()

                                            .setCustomId(
                                                "steam_anterior"
                                            )

                                            .setLabel(
                                                "Anterior"
                                            )

                                            .setEmoji("⬅️")

                                            .setStyle(
                                                ButtonStyle.Secondary
                                            )

                                            .setDisabled(
                                                true
                                            ),

                                        new ButtonBuilder()

                                            .setCustomId(
                                                "steam_siguiente"
                                            )

                                            .setLabel(
                                                "Siguiente"
                                            )

                                            .setEmoji("➡️")

                                            .setStyle(
                                                ButtonStyle.Secondary
                                            )

                                            .setDisabled(
                                                true
                                            )

                                    )

                            ]

                        });

                    } catch (error) {

                        console.log(
                            "[STEAM] No se pudieron desactivar los botones."
                        );

                    }

                }
            );

        } catch (error) {

            console.error(
                "[STEAM] ERROR:",
                error.message
            );

            const embed =
                new EmbedBuilder()

                    .setTitle("❌ Error")

                    .setDescription(
                        "Ocurrió un error al buscar perfiles en Steam."
                    )

                    .setColor(0xff0000);

            if (
                interaction.deferred ||
                interaction.replied
            ) {

                await interaction.editReply({

                    embeds: [embed],

                    components: []

                });

            }

        }

    }

};


/* ============================================================
   OBTENER NOMBRE DESDE BATTLEMETRICS
   ============================================================ */

async function obtenerNombreBattleMetrics(url) {

    try {

        console.log(
            `[STEAM] Abriendo BattleMetrics: ${url}`
        );

        const response =
            await axios.get(

                url,

                {

                    headers: {

                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",

                        "Accept":
                            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

                        "Accept-Language":
                            "es-ES,es;q=0.9,en;q=0.8"

                    },

                    timeout: 20000

                }

            );

        const html =
            response.data || "";

        let nombre = "";

        const patrones = [

            /<h1[^>]*>([\s\S]*?)<\/h1>/i,

            /<title[^>]*>([\s\S]*?)<\/title>/i,

            /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i

        ];

        for (
            const patron of patrones
        ) {

            const match =
                html.match(patron);

            if (!match) {

                continue;

            }

            let posibleNombre =
                limpiarHTML(
                    match[1]
                ).trim();

            posibleNombre =
                posibleNombre
                    .replace(
                        /\s*-\s*BattleMetrics.*$/i,
                        ""
                    )
                    .trim();

            if (
                posibleNombre &&
                posibleNombre.length <= 100
            ) {

                nombre =
                    posibleNombre;

                break;

            }

        }

        if (!nombre) {

            const posiblesNombres = [

                html.match(
                    /"name"\s*:\s*"([^"]+)"/i
                ),

                html.match(
                    /"displayName"\s*:\s*"([^"]+)"/i
                ),

                html.match(
                    /"username"\s*:\s*"([^"]+)"/i
                )

            ];

            for (
                const match of posiblesNombres
            ) {

                if (
                    match &&
                    match[1]
                ) {

                    nombre =
                        limpiarHTML(
                            match[1]
                        ).trim();

                    break;

                }

            }

        }

        if (!nombre) {

            console.log(
                "[STEAM] No se encontró el nombre en el HTML de BattleMetrics."
            );

            return null;

        }

        console.log(
            `[STEAM] Nombre BattleMetrics encontrado: ${nombre}`
        );

        return nombre;

    } catch (error) {

        console.error(
            "[STEAM] Error obteniendo BattleMetrics:",
            error.message
        );

        return null;

    }

}


/* ============================================================
   BUSCAR PERFILES
   ============================================================ */

async function buscarPerfilesSteam(nombreBuscado) {

    const perfiles = [];

    const vistos = new Set();

    const resultadosPorPagina = 50;

    const maxPaginas = 20;

    const cliente = axios.create({

        headers: {

            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",

            "Accept":
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

            "Accept-Language":
                "es-ES,es;q=0.9,en;q=0.8"

        },

        timeout: 20000

    });


    /* ========================================================
       OBTENER SESIÓN DE STEAM
       ======================================================== */

    console.log(
        "[STEAM] Obteniendo sesión de Steam..."
    );

    const paginaInicial =
        await cliente.get(
            "https://steamcommunity.com/search/users/"
        );

    let cookies = "";

    if (
        paginaInicial.headers &&
        paginaInicial.headers["set-cookie"]
    ) {

        cookies =
            paginaInicial.headers["set-cookie"]

                .map(
                    cookie =>
                        cookie.split(";")[0]
                )

                .join("; ");

    }

    let sessionid = "";

    const sessionMatch =
        cookies.match(
            /sessionid=([^;]+)/
        );

    if (sessionMatch) {

        sessionid =
            sessionMatch[1];

    }

    if (!sessionid) {

        const htmlInicial =
            paginaInicial.data || "";

        const htmlSession =
            htmlInicial.match(
                /g_sessionID\s*=\s*["']([^"']+)["']/
            );

        if (htmlSession) {

            sessionid =
                htmlSession[1];

        }

    }

    if (!sessionid) {

        throw new Error(
            "Steam no devolvió una sessionid."
        );

    }

    console.log(
        "[STEAM] Sesión obtenida correctamente."
    );


    /* ========================================================
       BUSCAR PÁGINAS
       ======================================================== */

    for (
        let pagina = 1;
        pagina <= maxPaginas;
        pagina++
    ) {

        console.log(
            `[STEAM] Buscando página ${pagina}`
        );

        try {

            const response =
                await cliente.get(

                    "https://steamcommunity.com/search/SearchCommunityAjax",

                    {

                        params: {

                            text:
                                nombreBuscado,

                            filter:
                                "users",

                            sessionid:
                                sessionid,

                            steamid_user:
                                "false",

                            page:
                                pagina

                        },

                        headers: {

                            "User-Agent":
                                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",

                            "Accept":
                                "application/json, text/javascript, */*; q=0.01",

                            "X-Requested-With":
                                "XMLHttpRequest",

                            "Referer":
                                `https://steamcommunity.com/search/users/?text=${encodeURIComponent(nombreBuscado)}`,

                            "Cookie":
                                cookies

                        },

                        timeout: 20000

                    }

                );

            let html = "";

            if (
                typeof response.data ===
                "string"
            ) {

                try {

                    const json =
                        JSON.parse(
                            response.data
                        );

                    html =
                        json.html ||
                        json.results_html ||
                        json.content ||
                        "";

                } catch {

                    html =
                        response.data;

                }

            } else if (
                response.data
            ) {

                html =
                    response.data.html ||
                    response.data.results_html ||
                    response.data.content ||
                    "";

            }

            if (!html) {

                console.log(
                    "[STEAM] Steam no devolvió HTML de resultados."
                );

                break;

            }

            const bloques =
                extraerBloques(html);

            console.log(
                `[STEAM] Resultados encontrados en HTML: ${bloques.length}`
            );

            if (!bloques.length) {

                break;

            }

            let coincidenciasPagina = 0;

            for (
                const bloque of bloques
            ) {

                const perfil =
                    procesarBloque(
                        bloque,
                        nombreBuscado
                    );

                if (!perfil) {

                    continue;

                }

                /*
                 * COMPARACIÓN EXACTA.
                 */

                if (
                    perfil.nombre !==
                    nombreBuscado
                ) {

                    continue;

                }

                if (
                    vistos.has(
                        perfil.url
                    )
                ) {

                    continue;

                }

                vistos.add(
                    perfil.url
                );

                console.log(
                    `[STEAM] Comprobando Rust: ${perfil.nombre} - ${perfil.url}`
                );

                const datosRust =
                    await comprobarRustSteam(
                        perfil
                    );

                if (
                    !datosRust.tieneRust
                ) {

                    console.log(
                        `[STEAM] DESCARTADO: ${perfil.nombre} no tiene Rust visible.`
                    );

                    continue;

                }

                perfil.tieneRust =
                    datosRust.tieneRust;

                perfil.inventarioRust =
                    datosRust.inventarioRust;

                perfiles.push(
                    perfil
                );

                coincidenciasPagina++;

                console.log(
                    `[STEAM] ACEPTADO: ${perfil.nombre} tiene Rust.`
                );

                await esperar(300);

            }

            console.log(
                `[STEAM] Coincidencias exactas de Rust página ${pagina}: ${coincidenciasPagina}`
            );

            if (
                bloques.length <
                resultadosPorPagina
            ) {

                break;

            }

            await esperar(500);

        } catch (error) {

            console.error(
                `[STEAM] Error página ${pagina}:`,
                error.message
            );

            break;

        }

    }

    return perfiles;

}


/* ============================================================
   COMPROBAR RUST EN STEAM
   ============================================================ */

async function comprobarRustSteam(perfil) {

    const resultado = {

        tieneRust: false,

        inventarioRust: false

    };

    if (
        !perfil.steamid &&
        !perfil.url
    ) {

        return resultado;

    }

    try {

        let steamid =
            perfil.steamid;

        if (!steamid) {

            const match =
                perfil.url.match(
                    /\/profiles\/(\d+)/
                );

            if (match) {

                steamid =
                    match[1];

            }

        }

        if (!steamid) {

            console.log(
                "[STEAM] No se pudo obtener SteamID64 para comprobar Rust."
            );

            return resultado;

        }

        const headers = {

            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",

            "Accept":
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

            "Accept-Language":
                "es-ES,es;q=0.9,en;q=0.8"

        };


        /* ========================================================
           COMPROBAR JUEGOS DEL PERFIL
           ======================================================== */

        const juegosURL =
            `https://steamcommunity.com/profiles/${steamid}/games/?tab=all`;

        try {

            const juegosResponse =
                await axios.get(

                    juegosURL,

                    {

                        headers:

                            headers,

                        timeout: 12000

                    }

                );

            const juegosHTML =
                juegosResponse.data || "";

            /*
             * Rust utiliza el AppID 252490.
             */

            if (
                juegosHTML.includes(
                    "app/252490"
                )
                ||
                juegosHTML.includes(
                    "252490"
                )
                ||
                /Rust/i.test(
                    juegosHTML
                )
            ) {

                resultado.tieneRust =
                    true;

                console.log(
                    `[STEAM] Rust encontrado en juegos: ${steamid}`
                );

            }

        } catch (error) {

            console.log(
                `[STEAM] No se pudo comprobar juegos de ${steamid}: ${error.message}`
            );

        }


        /* ========================================================
           COMPROBAR INVENTARIO DE RUST
           ======================================================== */

        const inventarioURL =
            `https://steamcommunity.com/inventory/${steamid}/252490/2?l=english&count=1`;

        try {

            const inventarioResponse =
                await axios.get(

                    inventarioURL,

                    {

                        headers:

                            headers,

                        timeout: 12000

                    }

                );

            const inventario =
                inventarioResponse.data;

            if (
                inventario &&
                typeof inventario ===
                "object"
            ) {

                if (
                    inventario.success === 1
                ) {

                    resultado.inventarioRust =
                        true;

                    resultado.tieneRust =
                        true;

                    console.log(
                        `[STEAM] Inventario de Rust encontrado: ${steamid}`
                    );

                }

            }

        } catch (error) {

            console.log(
                `[STEAM] No se pudo comprobar inventario de ${steamid}: ${error.message}`
            );

        }

    } catch (error) {

        console.log(
            `[STEAM] Error comprobando Rust de ${perfil.nombre}: ${error.message}`
        );

    }

    return resultado;

}


/* ============================================================
   EXTRAER BLOQUES
   ============================================================ */

function extraerBloques(html) {

    const bloques = [];

    const regex =
        /<div[^>]+class=["'][^"']*search_row[^"']*["'][^>]*>[\s\S]*?(?=<div[^>]+class=["'][^"']*search_row[^"']*["']|$)/gi;

    let match;

    while (
        (match = regex.exec(html)) !== null
    ) {

        bloques.push(
            match[0]
        );

    }

    return bloques;

}


/* ============================================================
   PROCESAR RESULTADO
   ============================================================ */

function procesarBloque(
    bloque,
    nombreBuscado
) {

    try {

        let nombre = "";

        const nombreMatch =

            bloque.match(

                /class=["'][^"']*searchPersonaName[^"']*["'][^>]*>([\s\S]*?)<\/a>/i

            )

            ||

            bloque.match(

                /searchPersonaName[^>]*>([\s\S]*?)</i

            );

        if (nombreMatch) {

            nombre =
                limpiarHTML(
                    nombreMatch[1]
                ).trim();

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

        let url =
            urlMatch[1];

        if (
            url.startsWith("/")
        ) {

            url =
                `https://steamcommunity.com${url}`;

        }

        url =
            url.split("?")[0];

        let steamid = "";

        const steamidMatch =
            url.match(
                /\/profiles\/(\d+)/
            );

        if (steamidMatch) {

            steamid =
                steamidMatch[1];

        }

        return {

            nombre:
                nombre,

            url:
                url,

            steamid:
                steamid

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

        .replace(
            /<br\s*\/?>/gi,
            " "
        )

        .replace(
            /<[^>]*>/g,
            ""
        )

        .replace(
            /&nbsp;/gi,
            " "
        )

        .replace(
            /&amp;/gi,
            "&"
        )

        .replace(
            /&quot;/gi,
            '"'
        )

        .replace(
            /&#39;/gi,
            "'"
        )

        .replace(
            /&lt;/gi,
            "<"
        )

        .replace(
            /&gt;/gi,
            ">"
        )

        .replace(
            /\s+/g,
            " "
        )

        .trim();

}


/* ============================================================
   ESPERA
   ============================================================ */

function esperar(ms) {

    return new Promise(
        resolve => {

            setTimeout(
                resolve,
                ms
            );

        }
    );

}