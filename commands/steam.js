const {

    SlashCommandBuilder,

    EmbedBuilder,

    ActionRowBuilder,

    ButtonBuilder,

    ButtonStyle

} = require("discord.js");

const axios = require("axios");

const STEAM_BASE = "https://steamcommunity.com";

const USER_AGENT =

    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

module.exports = {

    data: new SlashCommandBuilder()

        .setName("steam")

        .setDescription("Busca perfiles de Steam por nombre exacto")

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

            // ========================================================

            // SI ES UN ENLACE DE BATTLEMETRICS

            // ========================================================

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

                    const embed =

                        new EmbedBuilder()

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

            // ========================================================

            // BUSCAR STEAM

            // ========================================================

            console.log(

                `[STEAM] Buscando perfiles con nombre exacto: ${nombreBuscado}`

            );

            const perfiles =

                await buscarPerfilesSteam(

                    nombreBuscado

                );

            console.log(

                `[STEAM] PERFILES DEVUELTOS: ${perfiles.length}`

            );

            // ========================================================

            // SIN RESULTADOS

            // ========================================================

            if (!perfiles.length) {

                const embed =

                    new EmbedBuilder()

                        .setTitle("🔎 Búsqueda de Steam")

                        .setDescription(

                            `No se encontraron perfiles de Steam con el nombre exacto **${nombreBuscado}**.`

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

            // ========================================================

            // PAGINACIÓN

            // ========================================================

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

                        // ====================================================

                        // RUST CONFIRMADO

                        // ====================================================

                        if (perfil.tieneRust) {

                            descripcion +=

                                `🎮 **Rust: Sí**\n`;

                            if (perfil.inventarioRust) {

                                descripcion +=

                                    `🎒 **Inventario/skins de Rust: Sí**\n`;

                            } else {

                                descripcion +=

                                    `🎒 Inventario/skins de Rust: No confirmado\n`;

                            }

                        } else {

                            // ====================================================

                            // RUST NO CONFIRMADO

                            //

                            // NO significa que no tenga Rust.

                            // Simplemente no pudimos comprobarlo.

                            // ====================================================

                            descripcion +=

                                `🎮 **Rust: No confirmado**\n`;

                            descripcion +=

                                `🎒 Inventario/skins de Rust: No confirmado\n`;

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

                            `Página ${pagina + 1}/${totalPaginas} • ${perfiles.length} coincidencias exactas • Nombre: ${nombreBuscado}`

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

                                pagina >= totalPaginas - 1

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

                        if (pagina > 0) {

                            pagina--;

                        }

                    }

                    if (

                        buttonInteraction.customId ===

                        "steam_siguiente"

                    ) {

                        if (

                            pagina < totalPaginas - 1

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

                                            .setDisabled(true),

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

                                            .setDisabled(true)

                                    )

                            ]

                        });

                    } catch {

                        console.log(

                            "[STEAM] No se pudieron desactivar los botones."

                        );

                    }

                }

            );

        } catch (error) {

            console.error(

                "[STEAM] ERROR:",

                error

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



// ============================================================

// OBTENER NOMBRE DESDE BATTLEMETRICS

// ============================================================

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

                            USER_AGENT,

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

                "[STEAM] No se encontró el nombre en BattleMetrics."

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



// ============================================================

// BUSCAR PERFILES DE STEAM

// ============================================================

async function buscarPerfilesSteam(nombreBuscado) {

    const perfilesExactos = [];

    const vistos =

        new Set();

    const maxPaginas = 10;

    const cliente =

        axios.create({

            headers: {

                "User-Agent":

                    USER_AGENT,

                "Accept":

                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

                "Accept-Language":

                    "es-ES,es;q=0.9,en;q=0.8"

            },

            timeout: 20000

        });

    // ========================================================

    // OBTENER SESIÓN DE STEAM

    // ========================================================

    console.log(

        "[STEAM] Obteniendo sesión de Steam..."

    );

    const paginaInicial =

        await cliente.get(

            `${STEAM_BASE}/search/users/`

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

    // ========================================================

    // BUSCAR PÁGINAS

    // ========================================================

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

                    `${STEAM_BASE}/search/SearchCommunityAjax`,

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

                                USER_AGENT,

                            "Accept":

                                "application/json, text/javascript, */*; q=0.01",

                            "X-Requested-With":

                                "XMLHttpRequest",

                            "Referer":

                                `${STEAM_BASE}/search/users/?text=${encodeURIComponent(nombreBuscado)}`,

                            "Cookie":

                                cookies

                        },

                        timeout: 20000

                    }

                );

            // ====================================================

            // OBTENER HTML DE LA RESPUESTA

            // ====================================================

            let html = "";

            if (

                typeof response.data === "string"

            ) {

                try {

                    const json =

                        JSON.parse(

                            response.data

                        );

                    html =

                        json.html ||

                        json.results_html ||

                        json.resultsHtml ||

                        json.content ||

                        json.data ||

                        "";

                } catch {

                    html =

                        response.data;

                }

            } else if (

                response.data &&

                typeof response.data === "object"

            ) {

                html =

                    response.data.html ||

                    response.data.results_html ||

                    response.data.resultsHtml ||

                    response.data.content ||

                    response.data.data ||

                    "";

            }

            if (

                typeof html !== "string"

            ) {

                html = "";

            }

            console.log(

                `[STEAM] HTML recibido página ${pagina}: ${html.length} caracteres`

            );

            // ====================================================

            // SI ESTA PÁGINA NO TRAE RESULTADOS

            //

            // NO hacemos break inmediatamente.

            // Probamos la siguiente página para evitar que Steam

            // deje una página vacía temporalmente.

            // ====================================================

            if (!html.trim()) {

                console.log(

                    `[STEAM] Página ${pagina} vacía. Probando siguiente página.`

                );

                await esperar(500);

                continue;

            }

            // ====================================================

            // EXTRAER BLOQUES

            // ====================================================

            const bloques =

                extraerBloques(html);

            console.log(

                `[STEAM] Bloques search_row encontrados: ${bloques.length}`

            );

            if (!bloques.length) {

                console.log(

                    `[STEAM] No se encontraron search_row en página ${pagina}.`

                );

                // No cortar inmediatamente.

                // Intentamos continuar algunas páginas.

                await esperar(500);

                continue;

            }

            let coincidenciasExactas =

                0;

            // ====================================================

            // PROCESAR RESULTADOS

            // ====================================================

            for (

                const bloque of bloques

            ) {

                const perfil =

                    procesarBloque(

                        bloque

                    );

                if (!perfil) {

                    continue;

                }

                console.log(

                    `[STEAM] Resultado encontrado: "${perfil.nombre}"`

                );

                // ====================================================

                // COMPARACIÓN EXACTA

                //

                // CASE-SENSITIVE:

                //

                // low  = low

                // Low  != low

                // low1 != low

                // ====================================================

                if (

                    perfil.nombre !==

                    nombreBuscado

                ) {

                    console.log(

                        `[STEAM] DESCARTADO POR NOMBRE: "${perfil.nombre}"`

                    );

                    continue;

                }

                // ====================================================

                // EVITAR DUPLICADOS

                // ====================================================

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

                coincidenciasExactas++;

                console.log(

                    `[STEAM] ✅ NOMBRE EXACTO: ${perfil.nombre}`

                );

                console.log(

                    `[STEAM] Perfil: ${perfil.url}`

                );

                // ====================================================

                // COMPROBAR RUST

                // ====================================================

                const datosRust =

                    await comprobarRustSteam(

                        perfil

                    );

                perfil.tieneRust =

                    datosRust.tieneRust;

                perfil.inventarioRust =

                    datosRust.inventarioRust;

                if (

                    perfil.tieneRust

                ) {

                    console.log(

                        `[STEAM] ✅ RUST DETECTADO: ${perfil.nombre}`

                    );

                } else {

                    console.log(

                        `[STEAM] ⚪ RUST NO CONFIRMADO: ${perfil.nombre}`

                    );

                }

                // ====================================================

                // GUARDAR SIEMPRE

                // ====================================================

                perfilesExactos.push(

                    perfil

                );

                await esperar(250);

            }

            console.log(

                `[STEAM] Coincidencias exactas página ${pagina}: ${coincidenciasExactas}`

            );

            await esperar(500);

        } catch (error) {

            console.error(

                `[STEAM] Error página ${pagina}:`,

                error.message

            );

            // No rompemos toda la búsqueda por un error

            // de una página concreta.

            await esperar(1000);

            continue;

        }

    }

    // ========================================================

    // ORDEN FINAL

    //

    // RUST CONFIRMADO PRIMERO.

    // DESCONOCIDOS DESPUÉS.

    //

    // NO SE ELIMINA NINGÚN PERFIL.

    // ========================================================

    perfilesExactos.sort(

        (a, b) => {

            if (

                a.tieneRust &&

                !b.tieneRust

            ) {

                return -1;

            }

            if (

                !a.tieneRust &&

                b.tieneRust

            ) {

                return 1;

            }

            return 0;

        }

    );

    const cantidadRust =

        perfilesExactos.filter(

            perfil =>

                perfil.tieneRust

        ).length;

    const cantidadNoConfirmados =

        perfilesExactos.length -

        cantidadRust;

    console.log(

        `[STEAM] ========================================`

    );

    console.log(

        `[STEAM] RESULTADO FINAL`

    );

    console.log(

        `[STEAM] Nombre buscado: ${nombreBuscado}`

    );

    console.log(

        `[STEAM] Coincidencias exactas: ${perfilesExactos.length}`

    );

    console.log(

        `[STEAM] Rust confirmado: ${cantidadRust}`

    );

    console.log(

        `[STEAM] Rust no confirmado: ${cantidadNoConfirmados}`

    );

    console.log(

        `[STEAM] ========================================`

    );

    return perfilesExactos;

}



// ============================================================

// COMPROBAR RUST EN STEAM

// ============================================================

async function comprobarRustSteam(perfil) {

    const resultado = {

        tieneRust: false,

        inventarioRust: false

    };

    try {

        let steamid =

            perfil.steamid;

        // ========================================================

        // OBTENER STEAMID DESDE URL

        // ========================================================

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

        // ========================================================

        // RESOLVER /ID/

        // ========================================================

        if (!steamid) {

            console.log(

                `[STEAM] Resolviendo SteamID64 desde: ${perfil.url}`

            );

            try {

                const perfilResponse =

                    await axios.get(

                        perfil.url,

                        {

                            headers: {

                                "User-Agent":

                                    USER_AGENT,

                                "Accept":

                                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

                                "Accept-Language":

                                    "es-ES,es;q=0.9,en;q=0.8"

                            },

                            timeout: 15000

                        }

                    );

                const perfilHTML =

                    perfilResponse.data || "";

                const steamIDMatch =

                    perfilHTML.match(

                        /g_steamID\s*=\s*["'](\d+)["']/i

                    ) ||

                    perfilHTML.match(

                        /"steamid"\s*:\s*"(\d+)"/i

                    ) ||

                    perfilHTML.match(

                        /"steamID64"\s*:\s*"(\d+)"/i

                    ) ||

                    perfilHTML.match(

                        /\/profiles\/(\d+)/i

                    );

                if (

                    steamIDMatch &&

                    steamIDMatch[1]

                ) {

                    steamid =

                        steamIDMatch[1];

                    perfil.steamid =

                        steamid;

                    console.log(

                        `[STEAM] SteamID64 encontrado: ${steamid}`

                    );

                }

            } catch (error) {

                console.log(

                    `[STEAM] Error resolviendo SteamID64: ${error.message}`

                );

            }

        }

        // ========================================================

        // SI NO TENEMOS STEAMID

        // ========================================================

        if (!steamid) {

            console.log(

                "[STEAM] No se pudo obtener SteamID64."

            );

            return resultado;

        }

        const headers = {

            "User-Agent":

                USER_AGENT,

            "Accept":

                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

            "Accept-Language":

                "es-ES,es;q=0.9,en;q=0.8"

        };

        // ========================================================

        // PERFIL PRINCIPAL

        // ========================================================

        try {

            console.log(

                `[STEAM] Analizando perfil público: ${steamid}`

            );

            const perfilURL =

                `${STEAM_BASE}/profiles/${steamid}`;

            const perfilResponse =

                await axios.get(

                    perfilURL,

                    {

                        headers:

                            headers,

                        timeout:

                            15000

                    }

                );

            const perfilHTML =

                perfilResponse.data || "";

            // ====================================================

            // REFERENCIAS A RUST

            // ====================================================

            const referenciasRust = [

                // Inventario / skins

                /#252490_/i,

                // Inventario Rust

                /\/inventory\/(?:\d+)\/252490/i,

                // Gamecards

                /\/gamecards\/252490/i,

                // AppID

                /appid["'=:\s]+["']?252490/i,

                // Steam App

                /\/app\/252490(?:\/|["'#?])/i,

                // AppID directo

                /\b252490\b/i,

                // Nombre Rust

                /\bRust\b/i

            ];

            let rustEncontrado =

                false;

            for (

                const patron of referenciasRust

            ) {

                if (

                    patron.test(

                        perfilHTML

                    )

                ) {

                    rustEncontrado =

                        true;

                    break;

                }

            }

            // ====================================================

            // INVENTARIO / SKINS

            // ====================================================

            if (

                /#252490_/i.test(

                    perfilHTML

                )

                ||

                /\/inventory\/(?:\d+)\/252490/i.test(

                    perfilHTML

                )

            ) {

                resultado.inventarioRust =

                    true;

                resultado.tieneRust =

                    true;

                console.log(

                    `[STEAM] ✅ Inventario/skins de Rust detectado: ${steamid}`

                );

            }

            // ====================================================

            // REFERENCIA GENERAL A RUST

            // ====================================================

            if (

                rustEncontrado

            ) {

                resultado.tieneRust =

                    true;

                console.log(

                    `[STEAM] ✅ Referencia de Rust encontrada: ${steamid}`

                );

            }

        } catch (error) {

            console.log(

                `[STEAM] Error comprobando perfil ${steamid}: ${error.message}`

            );

        }

        // ========================================================

        // PÁGINA DE JUEGOS

        // ========================================================

        try {

            const juegosURL =

                `${STEAM_BASE}/profiles/${steamid}/games/?tab=all`;

            const juegosResponse =

                await axios.get(

                    juegosURL,

                    {

                        headers:

                            headers,

                        timeout:

                            12000

                    }

                );

            const juegosHTML =

                juegosResponse.data || "";

            if (

                juegosHTML.includes(

                    "/app/252490/"

                )

                ||

                juegosHTML.includes(

                    "app/252490"

                )

                ||

                /\b252490\b/.test(

                    juegosHTML

                )

                ||

                /\bRust\b/i.test(

                    juegosHTML

                )

            ) {

                resultado.tieneRust =

                    true;

                console.log(

                    `[STEAM] ✅ Rust encontrado en juegos: ${steamid}`

                );

            }

        } catch (error) {

            console.log(

                `[STEAM] Error comprobando juegos ${steamid}: ${error.message}`

            );

        }

        // ========================================================

        // INVENTARIO DIRECTO

        // ========================================================

        try {

            const inventarioURL =

                `${STEAM_BASE}/inventory/${steamid}/252490/2?l=english&count=1`;

            const inventarioResponse =

                await axios.get(

                    inventarioURL,

                    {

                        headers:

                            headers,

                        timeout:

                            12000

                    }

                );

            const inventario =

                inventarioResponse.data;

            if (

                inventario &&

                inventario.success === 1

            ) {

                resultado.inventarioRust =

                    true;

                resultado.tieneRust =

                    true;

                console.log(

                    `[STEAM] ✅ Inventario directo de Rust encontrado: ${steamid}`

                );

            }

        } catch (error) {

            if (

                error.response &&

                error.response.status === 403

            ) {

                console.log(

                    `[STEAM] Inventario ${steamid} devuelve 403. NO se descarta.`

                );

            } else {

                console.log(

                    `[STEAM] Error comprobando inventario ${steamid}: ${error.message}`

                );

            }

        }

    } catch (error) {

        console.log(

            `[STEAM] Error comprobando Rust: ${error.message}`

        );

    }

    return resultado;

}



// ============================================================

// EXTRAER BLOQUES DE RESULTADOS

// ============================================================

function extraerBloques(html) {

    const bloques = [];

    const regex =

        /<div[^>]+class=["'][^"']*search_row[^"']*["'][^>]*>[\s\S]*?(?=<div[^>]+class=["'][^"']*search_row[^"']*["'][^>]*>|$)/gi;

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



// ============================================================

// PROCESAR RESULTADO DE STEAM

// ============================================================

function procesarBloque(

    bloque

) {

    try {

        let nombre = "";

        // ========================================================

        // NOMBRE PRINCIPAL

        // ========================================================

        const nombreMatch =

            bloque.match(

                /class=["'][^"']*searchPersonaName[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i

            )

            ||

            bloque.match(

                /searchPersonaName[^>]*>([\s\S]*?)<\/[^>]+>/i

            );

        if (nombreMatch) {

            nombre =

                limpiarHTML(

                    nombreMatch[1]

                ).trim();

        }

        // ========================================================

        // FALLBACK DE NOMBRE

        // ========================================================

        if (!nombre) {

            const posiblesNombres = [

                bloque.match(

                    /<span[^>]*>([^<]+)<\/span>/i

                ),

                bloque.match(

                    /<div[^>]*>([^<]+)<\/div>/i

                )

            ];

            for (

                const match of posiblesNombres

            ) {

                if (

                    match &&

                    match[1]

                ) {

                    const posible =

                        limpiarHTML(

                            match[1]

                        ).trim();

                    if (

                        posible &&

                        posible.length <= 100

                    ) {

                        nombre =

                            posible;

                        break;

                    }

                }

            }

        }

        if (!nombre) {

            return null;

        }

        // ========================================================

        // URL DEL PERFIL

        // ========================================================

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

        // ========================================================

        // CONVERTIR URL RELATIVA

        // ========================================================

        if (

            url.startsWith("/")

        ) {

            url =

                `${STEAM_BASE}${url}`;

        }

        // ========================================================

        // QUITAR QUERY

        // ========================================================

        url =

            url.split("?")[0];

        // ========================================================

        // OBTENER STEAMID64

        // ========================================================

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

                steamid,

            tieneRust:

                false,

            inventarioRust:

                false

        };

    } catch (error) {

        console.error(

            "[STEAM] Error procesando resultado:",

            error.message

        );

        return null;

    }

}



// ============================================================

// LIMPIAR HTML

// ============================================================

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



// ============================================================

// ESPERA

// ============================================================

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