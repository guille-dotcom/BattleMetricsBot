const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const path = require("path");
const fs = require("fs");
const { google } = require("googleapis");

const ServerConfig = require("../models/ServerConfig");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const SHEET_RANGE = "Hoja 1!A:D";

const PAGE_TIMEOUT = 60000;

const WAIT_AFTER_LOAD = 2500;

// =====================================================
// GOOGLE SHEETS
// =====================================================

async function obtenerSheets() {

    const secretFilePath =
        "/etc/secrets/credentials.json";

    const localFilePath =
        path.join(
            __dirname,
            "../credentials.json"
        );

    const keyFile =
        fs.existsSync(secretFilePath)
            ? secretFilePath
            : localFilePath;

    if (!fs.existsSync(keyFile)) {

        throw new Error(
            "No se encontró credentials.json."
        );

    }

    const auth =
        new google.auth.GoogleAuth({

            keyFile,

            scopes: [
                "https://www.googleapis.com/auth/spreadsheets.readonly"
            ]

        });

    return google.sheets({

        version: "v4",

        auth

    });
}

// =====================================================
// NORMALIZAR BATTLEMETRICS URL
// =====================================================

function normalizarBattleMetricsUrl(valor) {

    if (!valor) {
        return null;
    }

    let url =
        String(valor).trim();

    if (!url) {
        return null;
    }

    if (/^\d+$/.test(url)) {

        return `https://www.battlemetrics.com/players/${url}`;

    }

    if (!url.startsWith("http")) {

        return `https://www.battlemetrics.com/players/${url}`;

    }

    return url;
}

// =====================================================
// OBTENER ID BATTLEMETRICS
// =====================================================

function obtenerBattleMetricsPlayerId(url) {

    if (!url) {
        return null;
    }

    const match =
        String(url).match(
            /battlemetrics\.com\/players\/(\d+)/i
        );

    return match
        ? match[1]
        : null;
}

// =====================================================
// NORMALIZAR STEAM
// =====================================================

function normalizarSteamUrl(valor) {

    if (!valor) {
        return null;
    }

    const url =
        String(valor).trim();

    if (!url) {
        return null;
    }

    if (url.startsWith("http")) {
        return url;
    }

    if (/^\d+$/.test(url)) {

        return `https://steamcommunity.com/profiles/${url}`;

    }

    return url;
}

// =====================================================
// CONECTAR A CHROME
// =====================================================

async function obtenerBrowser() {

    const puppeteer =
        require("puppeteer-core");

    const browserUrl =
        process.env.CHROME_BROWSER_URL ||
        "http://127.0.0.1:9222";

    try {

        console.log(
            `[PLANILLA] Conectando a Chrome: ${browserUrl}`
        );

        const browser =
            await puppeteer.connect({

                browserURL:
                    browserUrl,

                defaultViewport:
                    null

            });

        console.log(
            "[PLANILLA] Conectado al Chrome existente."
        );

        return {

            browser,

            conectadoExistente:
                true

        };

    } catch (error) {

        console.log(
            "[PLANILLA] No se pudo conectar al Chrome existente."
        );

    }

    const posiblesChrome = [

        process.env.CHROME_PATH,

        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",

        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",

        "/usr/bin/google-chrome",

        "/usr/bin/google-chrome-stable",

        "/usr/bin/chromium",

        "/usr/bin/chromium-browser"

    ].filter(Boolean);

    let executablePath = null;

    for (
        const posible
        of posiblesChrome
    ) {

        if (
            fs.existsSync(posible)
        ) {

            executablePath =
                posible;

            break;

        }

    }

    if (!executablePath) {

        throw new Error(
            "No se encontró Chrome/Chromium."
        );

    }

    const browser =
        await puppeteer.launch({

            executablePath,

            headless:
                true,

            args: [

                "--no-sandbox",

                "--disable-setuid-sandbox",

                "--disable-dev-shm-usage",

                "--disable-gpu"

            ],

            defaultViewport:
                null

        });

    return {

        browser,

        conectadoExistente:
            false

    };
}

// =====================================================
// ANALIZAR PERFIL BATTLEMETRICS
// =====================================================

async function analizarPerfilBattleMetrics(
    page,
    battlemetricsUrl,
    battleMetricsServerId
) {

    const resultado = {

        nuestroServidor:
            false,

        nombre:
            null,

        servidorActual:
            null,

        servidores:
            []

    };

    try {

        console.log(
            `[PLANILLA] Abriendo: ${battlemetricsUrl}`
        );

        await page.goto(
            battlemetricsUrl,
            {
                waitUntil:
                    "domcontentloaded",

                timeout:
                    PAGE_TIMEOUT
            }
        );

        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    WAIT_AFTER_LOAD
                )
        );

        try {

            await page.waitForFunction(

                () =>
                    document.body &&
                    document.body.innerText &&
                    document.body.innerText.length > 100,

                {
                    timeout:
                        15000
                }

            );

        } catch (_) {}

        const datos =
            await page.evaluate(
                () => {

                    const texto =
                        document.body
                            ? document.body.innerText
                            : "";

                    const links =
                        Array.from(
                            document.querySelectorAll("a")
                        ).map(
                            a => ({

                                text:
                                    (
                                        a.innerText ||
                                        a.textContent ||
                                        ""
                                    ).trim(),

                                href:
                                    a.href || ""

                            })
                        );

                    return {

                        texto,

                        links

                    };

                }
            );

        // =================================================
        // BUSCAR SERVIDORES
        // =================================================

        const servidoresEncontrados =
            [];

        for (
            const link
            of datos.links
        ) {

            if (!link.href) {
                continue;
            }

            const match =
                link.href.match(
                    /battlemetrics\.com\/servers\/(\d+)/i
                );

            if (!match) {
                continue;
            }

            const serverId =
                match[1];

            const nombreServidor =
                link.text ||
                `Servidor ${serverId}`;

            if (
                !servidoresEncontrados.some(
                    servidor =>
                        servidor.id ===
                        serverId
                )
            ) {

                servidoresEncontrados.push({

                    id:
                        serverId,

                    nombre:
                        nombreServidor

                });

            }

        }

        resultado.servidores =
            servidoresEncontrados;

        // =================================================
        // COMPARAR SERVIDOR
        // =================================================

        const serverObjetivo =
            String(
                battleMetricsServerId
            ).trim();

        const servidorNuestro =
            servidoresEncontrados.find(
                servidor =>
                    String(
                        servidor.id
                    ) === serverObjetivo
            );

        if (servidorNuestro) {

            resultado.nuestroServidor =
                true;

            resultado.servidorActual =
                servidorNuestro.nombre;

        }

        // =================================================
        // OBTENER NOMBRE
        // =================================================

        resultado.nombre =
            await page.evaluate(
                () => {

                    const posibles = [

                        "h1",

                        '[data-testid="player-name"]',

                        '[class*="PlayerName"]',

                        '[class*="player-name"]'

                    ];

                    for (
                        const selector
                        of posibles
                    ) {

                        const elemento =
                            document.querySelector(
                                selector
                            );

                        if (!elemento) {
                            continue;
                        }

                        const texto =
                            (
                                elemento.innerText ||
                                elemento.textContent ||
                                ""
                            ).trim();

                        if (texto) {
                            return texto;
                        }

                    }

                    return null;

                }
            );

        if (!resultado.nombre) {

            resultado.nombre =
                `Jugador ${
                    obtenerBattleMetricsPlayerId(
                        battlemetricsUrl
                    ) || ""
                }`.trim();

        }

        console.log(

            `[PLANILLA] ${resultado.nombre} | ` +

            `Nuestro servidor: ${resultado.nuestroServidor} | ` +

            `Servidor: ${resultado.servidorActual || "Ninguno"}`

        );

        return resultado;

    } catch (error) {

        console.error(

            `[PLANILLA] Error consultando ${battlemetricsUrl}:`,

            error.message

        );

        return resultado;
    }
}

// =====================================================
// CREAR EMBEDS
// =====================================================

function crearEmbedsJugadores(
    jugadores,
    serverId
) {

    const embeds = [];

    for (
        let inicio = 0;
        inicio < jugadores.length;
        inicio += 25
    ) {

        const grupo =
            jugadores.slice(
                inicio,
                inicio + 25
            );

        const embed =
            new EmbedBuilder()

                .setTitle(
                    "📋 Jugadores de la planilla"
                )

                .setColor(
                    0x57F287
                )

                .setTimestamp();

        embed.setDescription(

            `🟢 **Jugadores encontrados en el servidor**\n\n` +

            `🎮 Servidor BattleMetrics: \`${serverId}\`\n` +

            `👥 Jugadores encontrados: **${jugadores.length}**`

        );

        for (
            const jugador
            of grupo
        ) {

            let valor =

                `🎮 **Servidor:** ${
                    jugador.servidorActual ||
                    "Servidor configurado"
                }\n`;

            if (
                jugador.steamUrl
            ) {

                valor +=

                    `👤 **[Perfil de Steam](${jugador.steamUrl})**\n`;

            }

            if (
                jugador.battlemetricsUrl
            ) {

                valor +=

                    `📊 **[Perfil BattleMetrics](${jugador.battlemetricsUrl})**`;

            }

            embed.addFields({

                name:
                    `🟢 ${
                        jugador.nombre ||
                        `Jugador ${jugador.playerId}`
                    }`,

                value,

                inline:
                    false

            });

        }

        embeds.push(
            embed
        );

    }

    return embeds;
}

// =====================================================
// REVISAR PLANILLA
// =====================================================

async function revisarPlanilla(
    guildId
) {

    let browserInfo =
        null;

    try {

        console.log(
            "=============================================="
        );

        console.log(
            `[PLANILLA] INICIANDO REVISIÓN | Guild: ${guildId}`
        );

        console.log(
            "=============================================="
        );

        // =================================================
        // CONFIGURACIÓN
        // =================================================

        const config =
            await ServerConfig.findOne({
                guildId
            });

        if (!config) {

            throw new Error(
                "Este servidor no tiene configuración."
            );

        }

        if (!config.sheetId) {

            throw new Error(
                "Este servidor no tiene una planilla configurada."
            );

        }

        if (!config.battleMetricsServerId) {

            throw new Error(
                "Este servidor no tiene configurado su servidor de BattleMetrics."
            );

        }

        const spreadsheetId =
            config.sheetId;

        const battleMetricsServerId =
            String(
                config.battleMetricsServerId
            ).trim();

        // =================================================
        // GOOGLE SHEETS
        // =================================================

        const sheets =
            await obtenerSheets();

        const response =
            await sheets.spreadsheets.values.get({

                spreadsheetId,

                range:
                    SHEET_RANGE

            });

        const rows =
            response.data.values || [];

        console.log(
            `[PLANILLA] Filas recibidas: ${rows.length}`
        );

        if (!rows.length) {

            return {

                encontrados:
                    [],

                revisados:
                    0,

                serverId:
                    battleMetricsServerId,

                sinDatos:
                    true

            };

        }

        // =================================================
        // LEER JUGADORES
        // =================================================

        const jugadores =
            [];

        for (
            let i = 0;
            i < rows.length;
            i++
        ) {

            const row =
                rows[i] || [];

            // COLUMNA A
            const bmValue =
                row[0]
                    ? String(
                        row[0]
                    ).trim()
                    : "";

            // COLUMNA D
            const steamValue =
                row[3]
                    ? String(
                        row[3]
                    ).trim()
                    : "";

            if (!bmValue) {
                continue;
            }

            // Ignorar encabezado
            if (

                bmValue
                    .toLowerCase()
                    .includes(
                        "battlemetrics"
                    ) &&

                !/\d{5,}/.test(
                    bmValue
                )

            ) {

                continue;

            }

            const battlemetricsUrl =
                normalizarBattleMetricsUrl(
                    bmValue
                );

            const playerId =
                obtenerBattleMetricsPlayerId(
                    battlemetricsUrl
                );

            if (!playerId) {

                console.log(
                    `[PLANILLA] Fila ${i + 1}: BM inválido`
                );

                continue;

            }

            jugadores.push({

                fila:
                    i + 1,

                playerId,

                battlemetricsUrl,

                // DIRECTAMENTE COLUMNA D
                steamUrl:
                    normalizarSteamUrl(
                        steamValue
                    )

            });

        }

        console.log(
            `[PLANILLA] Jugadores válidos: ${jugadores.length}`
        );

        if (!jugadores.length) {

            return {

                encontrados:
                    [],

                revisados:
                    0,

                serverId:
                    battleMetricsServerId,

                sinJugadores:
                    true

            };

        }

        // =================================================
        // CHROME
        // =================================================

        browserInfo =
            await obtenerBrowser();

        const browser =
            browserInfo.browser;

        const pages =
            await browser.pages();

        let page =
            pages.find(
                pagina =>
                    pagina
                        .url()
                        .includes(
                            "battlemetrics.com"
                        )
            );

        if (!page) {

            page =
                await browser.newPage();

        }

        await page.setViewport({

            width:
                1440,

            height:
                1000

        });

        // =================================================
        // REVISAR JUGADORES
        // =================================================

        const encontrados =
            [];

        for (
            let i = 0;
            i < jugadores.length;
            i++
        ) {

            const jugador =
                jugadores[i];

            console.log(

                `[PLANILLA] (${i + 1}/${jugadores.length}) ` +

                `Revisando ${jugador.battlemetricsUrl}`

            );

            const resultado =
                await analizarPerfilBattleMetrics(

                    page,

                    jugador.battlemetricsUrl,

                    battleMetricsServerId

                );

            if (
                resultado.nuestroServidor
            ) {

                encontrados.push({

                    ...jugador,

                    nombre:
                        resultado.nombre,

                    servidorActual:
                        resultado.servidorActual

                });

                console.log(

                    `[PLANILLA] 🟢 ENCONTRADO: ${resultado.nombre}`

                );

            } else {

                console.log(
                    "[PLANILLA] ⚪ No está en nuestro servidor."
                );

            }

        }

        console.log(
            `[PLANILLA] Revisión terminada. Encontrados: ${encontrados.length}`
        );

        return {

            encontrados,

            revisados:
                jugadores.length,

            serverId:
                battleMetricsServerId

        };

    } finally {

        // =================================================
        // CERRAR CHROME SOLO SI LO ABRIMOS NOSOTROS
        // =================================================

        if (

            browserInfo &&

            browserInfo.browser &&

            !browserInfo.conectadoExistente

        ) {

            try {

                await browserInfo.browser.close();

                console.log(
                    "[PLANILLA] Chrome cerrado."
                );

            } catch (error) {

                console.error(
                    "[PLANILLA] Error cerrando Chrome:",
                    error.message
                );

            }

        }

    }
}

// =====================================================
// EMBED SIN JUGADORES
// =====================================================

function crearEmbedSinJugadores(
    resultado
) {

    return new EmbedBuilder()

        .setTitle(
            "📋 Revisión de planilla"
        )

        .setDescription(

            "🔴 **Ningún jugador de la planilla está actualmente en el servidor configurado.**"

        )

        .addFields(

            {

                name:
                    "🎮 Servidor configurado",

                value:
                    `BattleMetrics ID: \`${resultado.serverId}\``,

                inline:
                    false

            },

            {

                name:
                    "📊 Jugadores revisados",

                value:
                    `${resultado.revisados}`,

                inline:
                    true

            }

        )

        .setColor(
            0xED4245
        )

        .setTimestamp();
}

// =====================================================
// COMANDO /PLANILLA
// =====================================================

module.exports = {

    data:
        new SlashCommandBuilder()

            .setName(
                "planilla"
            )

            .setDescription(
                "Revisa los jugadores de la planilla que están jugando en el servidor"
            ),

    async execute(
        interaction
    ) {

        await interaction.deferReply();

        try {

            const resultado =
                await revisarPlanilla(
                    interaction.guild.id
                );

            // =================================================
            // SIN JUGADORES EN PLANILLA
            // =================================================

            if (
                resultado.sinDatos
            ) {

                return interaction.editReply(
                    "❌ La planilla está vacía."
                );

            }

            if (
                resultado.sinJugadores
            ) {

                return interaction.editReply(
                    "❌ No encontré jugadores válidos en la planilla."
                );

            }

            // =================================================
            // NADIE EN EL SERVIDOR
            // =================================================

            if (
                !resultado.encontrados.length
            ) {

                return interaction.editReply({

                    embeds: [

                        crearEmbedSinJugadores(
                            resultado
                        )

                    ]

                });

            }

            // =================================================
            // RESULTADOS
            // =================================================

            const embeds =
                crearEmbedsJugadores(

                    resultado.encontrados,

                    resultado.serverId

                );

            await interaction.editReply({

                embeds: [
                    embeds[0]
                ]

            });

            for (
                let i = 1;
                i < embeds.length;
                i++
            ) {

                await interaction.followUp({

                    embeds: [
                        embeds[i]
                    ]

                });

            }

        } catch (error) {

            console.error(
                "[PLANILLA] ERROR:",
                error
            );

            await interaction.editReply(

                "❌ Ocurrió un error al revisar la planilla.\n\n" +

                `\`${error.message || "Error desconocido"}\``

            );

        }

    },

    // =====================================================
    // EXPORTAR FUNCIONES PARA AUTOMÁTICO
    // =====================================================

    revisarPlanilla,

    crearEmbedsJugadores,

    crearEmbedSinJugadores

};