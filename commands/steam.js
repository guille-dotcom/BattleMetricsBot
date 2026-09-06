const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require("discord.js");

const axios = require("axios");
const sharp = require("sharp");
const Tesseract = require("tesseract.js");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BATTLEMETRICS_API =
    "https://api.battlemetrics.com";

const BATTLEMETRICS_SERVER_ID =
    process.env.BATTLEMETRICS_SERVER_ID || "11378166";

const BATTLEMETRICS_TOKEN =
    process.env.BATTLEMETRICS_TOKEN;

// =====================================================
// NORMALIZAR NOMBRE
// =====================================================

function normalizarNombre(nombre) {

    return String(nombre || "")
        .replace(/\r/g, "")
        .replace(/\n/g, " ")
        .replace(/\t/g, " ")
        .replace(/\u00A0/g, " ")
        .replace(/[ ]{2,}/g, " ")
        .trim();

}

// =====================================================
// NORMALIZACIÓN PARA COMPARAR
// NO SE USA PARA MOSTRAR EL NOMBRE
// =====================================================

function normalizarComparacion(nombre) {

    return normalizarNombre(nombre)
        .toLowerCase()
        .normalize("NFKC");

}

// =====================================================
// LIMPIAR OCR
// IMPORTANTE:
// NO ELIMINAMOS | ^ _ ™ NI CARACTERES RUSOS
// =====================================================

function limpiarOCR(texto) {

    if (!texto) {
        return "";
    }

    let resultado =
        String(texto)
            .replace(/\r/g, "\n")
            .replace(/\u00A0/g, " ")
            .replace(/[ \t]+/g, " ");

    // Caracteres que Tesseract suele confundir
    resultado =
        resultado
            .replace(/[“”„‟]/g, '"')
            .replace(/[‘’‚‛]/g, "'")
            .replace(/[–—−]/g, "-")
            .replace(/¦/g, "|");

    // Conservamos:
    // letras latinas
    // letras rusas/cirílicas
    // números
    // espacios
    // | ^ _ ™
    // . , ' " - + = ! ? @ # $ % & * ( ) [ ] { } : ; / \
    //
    // No eliminamos caracteres Unicode.
    resultado =
        resultado
            .split("\n")
            .map(linea =>
                linea
                    .trim()
                    .replace(/[ ]{2,}/g, " ")
            )
            .filter(Boolean)
            .join("\n");

    return resultado.trim();

}

// =====================================================
// DESCARGAR IMAGEN
// =====================================================

async function obtenerImagen(url) {

    const response =
        await axios.get(
            url,
            {
                responseType:
                    "arraybuffer",
                timeout:
                    30000,
                maxContentLength:
                    15 * 1024 * 1024,
                headers: {
                    "User-Agent":
                        "Mozilla/5.0"
                }
            }
        );

    return Buffer.from(
        response.data
    );

}

// =====================================================
// CREAR VARIAS VERSIONES DE LA IMAGEN
// =====================================================

async function prepararImagenes(buffer) {

    const metadata =
        await sharp(buffer)
            .metadata();

    const ancho =
        metadata.width || 1920;

    const nuevoAncho =
        Math.max(
            2200,
            Math.min(
                4000,
                ancho * 2
            )
        );

    // -----------------------------------------------
    // VERSION 1
    // Color / contraste
    // -----------------------------------------------

    const normal =
        await sharp(buffer)
            .rotate()
            .resize({
                width:
                    Math.round(nuevoAncho),
                withoutEnlargement:
                    false
            })
            .normalize()
            .sharpen({
                sigma: 1.2
            })
            .png()
            .toBuffer();

    // -----------------------------------------------
    // VERSION 2
    // Escala de grises
    // -----------------------------------------------

    const gris =
        await sharp(buffer)
            .rotate()
            .resize({
                width:
                    Math.round(nuevoAncho),
                withoutEnlargement:
                    false
            })
            .grayscale()
            .normalize()
            .sharpen({
                sigma: 1.5
            })
            .png()
            .toBuffer();

    // -----------------------------------------------
    // VERSION 3
    // Alto contraste
    // -----------------------------------------------

    const contraste =
        await sharp(buffer)
            .rotate()
            .resize({
                width:
                    Math.round(nuevoAncho),
                withoutEnlargement:
                    false
            })
            .grayscale()
            .linear(
                1.6,
                -45
            )
            .sharpen({
                sigma: 2
            })
            .png()
            .toBuffer();

    return [
        normal,
        gris,
        contraste
    ];

}

// =====================================================
// OCR UNA PASADA
// =====================================================

async function ejecutarOCR(
    worker,
    imagen,
    psm
) {

    try {

        await worker.setParameters({
            tessedit_pageseg_mode:
                String(psm),

            preserve_interword_spaces:
                "1"
        });

        const resultado =
            await worker.recognize(
                imagen
            );

        return limpiarOCR(
            resultado?.data?.text || ""
        );

    } catch (error) {

        console.error(
            `❌ Error OCR PSM ${psm}:`,
            error.message
        );

        return "";

    }

}

// =====================================================
// EXTRAER POSIBLES NOMBRES
// =====================================================

function extraerCandidatos(texto) {

    if (!texto) {
        return [];
    }

    const lineas =
        texto
            .split("\n")
            .map(linea =>
                normalizarNombre(linea)
            )
            .filter(Boolean);

    const candidatos = [];

    for (
        const linea
        of lineas
    ) {

        let candidato =
            linea.trim();

        // Ignorar líneas claramente pertenecientes
        // a la interfaz del juego.
        const prohibidas = [
            /^health$/i,
            /^inventory$/i,
            /^crafting$/i,
            /^map$/i,
            /^options$/i,
            /^settings$/i,
            /^players?$/i,
            /^server$/i,
            /^disconnect$/i,
            /^respawn$/i,
            /^rust$/i,
            /^steam$/i,
            /^team$/i,
            /^chat$/i,
            /^loot$/i,
            /^open$/i,
            /^close$/i
        ];

        if (
            prohibidas.some(
                regex =>
                    regex.test(
                        candidato
                    )
            )
        ) {
            continue;
        }

        // Quitar basura típica al principio,
        // pero NO tocar | ^ _ ™.
        candidato =
            candidato
                .replace(
                    /^[|:;,.\-]+(?=\S)/,
                    ""
                )
                .trim();

        if (!candidato) {
            continue;
        }

        // Debe tener al menos una letra o número.
        if (
            !/[A-Za-zА-Яа-яЁё0-9]/u.test(
                candidato
            )
        ) {
            continue;
        }

        // Evitar líneas gigantes de interfaz.
        if (
            candidato.length > 80
        ) {
            continue;
        }

        // Evitar frases claramente largas.
        const cantidadPalabras =
            candidato
                .split(/\s+/)
                .length;

        if (
            cantidadPalabras > 8
        ) {
            continue;
        }

        candidatos.push(
            candidato
        );

    }

    return candidatos;

}

// =====================================================
// PUNTUAR CANDIDATO
// =====================================================

function puntuarCandidato(nombre) {

    let puntos = 0;

    const texto =
        normalizarNombre(
            nombre
        );

    if (!texto) {
        return -999;
    }

    // Nombres normales suelen tener
    // una longitud razonable.
    if (
        texto.length >= 2 &&
        texto.length <= 35
    ) {
        puntos += 10;
    }

    if (
        texto.length >= 4 &&
        texto.length <= 25
    ) {
        puntos += 5;
    }

    // Conserva símbolos que suelen aparecer
    // en nombres reales de Rust.
    if (
        texto.includes("|")
    ) {
        puntos += 15;
    }

    if (
        texto.includes("^")
    ) {
        puntos += 8;
    }

    if (
        texto.includes("_")
    ) {
        puntos += 5;
    }

    if (
        texto.includes("™")
    ) {
        puntos += 10;
    }

    if (
        texto.includes("-")
    ) {
        puntos += 3;
    }

    // Letras cirílicas = perfectamente válido.
    if (
        /[А-Яа-яЁё]/u.test(
            texto
        )
    ) {
        puntos += 10;
    }

    // Nombre compuesto como:
    // F.O.L™ | sobrich
    if (
        /\s\|\s/u.test(
            texto
        )
    ) {
        puntos += 20;
    }

    // Nombres con varios segmentos
    // separados por |.
    if (
        texto.includes("|")
    ) {

        const partes =
            texto
                .split("|")
                .map(x =>
                    x.trim()
                )
                .filter(Boolean);

        if (
            partes.length >= 2
        ) {
            puntos += 10;
        }

    }

    // Penalizar texto con demasiados números.
    const numeros =
        (
            texto.match(
                /[0-9]/g
            ) || []
        ).length;

    if (
        numeros >
        texto.length * 0.5
    ) {
        puntos -= 8;
    }

    // Penalizar frases que parecen UI.
    const ui =
        [
            "press",
            "click",
            "hold",
            "use",
            "open",
            "close",
            "inventory",
            "health",
            "server",
            "players",
            "menu",
            "options"
        ];

    for (
        const palabra
        of ui
    ) {

        if (
            texto
                .toLowerCase()
                .includes(
                    palabra
                )
        ) {

            puntos -= 15;

        }

    }

    return puntos;

}

// =====================================================
// COMBINAR CANDIDATOS
// =====================================================

function seleccionarMejorCandidato(
    candidatos
) {

    if (
        !candidatos.length
    ) {
        return null;
    }

    const mapa =
        new Map();

    for (
        const candidato
        of candidatos
    ) {

        const limpio =
            normalizarNombre(
                candidato
            );

        if (!limpio) {
            continue;
        }

        const clave =
            normalizarComparacion(
                limpio
            );

        const anterior =
            mapa.get(
                clave
            );

        if (!anterior) {

            mapa.set(
                clave,
                {
                    nombre:
                        limpio,
                    apariciones:
                        1,
                    puntuacion:
                        puntuarCandidato(
                            limpio
                        )
                }
            );

        } else {

            anterior.apariciones++;

        }

    }

    const lista =
        Array.from(
            mapa.values()
        );

    for (
        const item
        of lista
    ) {

        item.puntuacion +=
            item.apariciones *
            12;

    }

    lista.sort(
        (a, b) =>
            b.puntuacion -
            a.puntuacion
    );

    return (
        lista[0]?.nombre ||
        null
    );

}

// =====================================================
// OCR PRINCIPAL
// =====================================================

async function detectarNombreOCR(
    buffer
) {

    console.log(
        "🔎 Iniciando OCR avanzado..."
    );

    const imagenes =
        await prepararImagenes(
            buffer
        );

    let worker;

    try {

        console.log(
            "🧠 Cargando Tesseract con inglés + ruso..."
        );

        worker =
            await Tesseract.createWorker(
                "eng+rus",
                1,
                {
                    logger:
                        message => {

                            if (
                                message.status ===
                                "recognizing text"
                            ) {

                                const progreso =
                                    Math.round(
                                        (
                                            message.progress ||
                                            0
                                        ) * 100
                                    );

                                if (
                                    progreso %
                                        25 ===
                                    0
                                ) {

                                    console.log(
                                        `🔎 OCR: ${progreso}%`
                                    );

                                }

                            }

                        }
                }
            );

        const candidatos =
            [];

        // Varias configuraciones.
        const modos =
            [
                6,
                7,
                11,
                12
            ];

        for (
            let i = 0;
            i < imagenes.length;
            i++
        ) {

            console.log(
                `🔎 Analizando versión de imagen ${i + 1}/${imagenes.length}...`
            );

            for (
                const psm
                of modos
            ) {

                const texto =
                    await ejecutarOCR(
                        worker,
                        imagenes[i],
                        psm
                    );

                if (!texto) {
                    continue;
                }

                console.log(
                    `📝 OCR PSM ${psm}:`,
                    texto
                );

                const encontrados =
                    extraerCandidatos(
                        texto
                    );

                candidatos.push(
                    ...encontrados
                );

            }

        }

        console.log(
            "🔎 Candidatos encontrados:",
            candidatos
        );

        const mejor =
            seleccionarMejorCandidato(
                candidatos
            );

        if (
            !mejor
        ) {

            throw new Error(
                "No se pudo detectar un nombre en la captura."
            );

        }

        console.log(
            `✅ Nombre OCR seleccionado: "${mejor}"`
        );

        return mejor;

    } finally {

        if (
            worker
        ) {

            try {

                await worker.terminate();

            } catch {

                // Ignorar error al cerrar worker.

            }

        }

    }

}

// =====================================================
// BATTLEMETRICS
// =====================================================

async function buscarEnBattleMetrics(
    nombre
) {

    if (
        !BATTLEMETRICS_TOKEN
    ) {

        throw new Error(
            "Falta BATTLEMETRICS_TOKEN en las variables de entorno."
        );

    }

    const response =
        await axios.get(
            `${BATTLEMETRICS_API}/servers/${BATTLEMETRICS_SERVER_ID}`,
            {
                params: {
                    include:
                        "player,identifier"
                },

                headers: {
                    Authorization:
                        `Bearer ${BATTLEMETRICS_TOKEN}`,

                    Accept:
                        "application/json"
                },

                timeout:
                    30000
            }
        );

    const body =
        response.data;

    const included =
        Array.isArray(
            body?.included
        )
            ? body.included
            : [];

    const jugadores =
        included.filter(
            recurso =>
                recurso &&
                recurso.type ===
                    "player"
        );

    const nombreBuscado =
        normalizarComparacion(
            nombre
        );

    const coincidencias =
        jugadores.filter(
            jugador => {

                const nombreBM =
                    jugador
                        ?.attributes
                        ?.name;

                return (
                    normalizarComparacion(
                        nombreBM
                    ) ===
                    nombreBuscado
                );

            }
        );

    return coincidencias.map(
        jugador => ({

            battlemetricsId:
                String(
                    jugador.id
                ),

            nombre:
                jugador
                    ?.attributes
                    ?.name ||
                nombre

        })
    );

}

// =====================================================
// EMBED
// =====================================================

function crearEmbed(
    jugador
) {

    const nombre =
        jugador.nombre;

    const battlemetricsURL =
        `https://www.battlemetrics.com/players/${jugador.battlemetricsId}`;

    const steamIDSearchURL =
        `https://www.steamid.com/search?q=${encodeURIComponent(nombre)}`;

    return new EmbedBuilder()

        .setColor(
            "#5865F2"
        )

        .setTitle(
            `🎮 ${nombre}`
        )

        .addFields(

            {
                name:
                    "🔎 Name Search",

                value:
                    `[Abrir búsqueda en SteamID.com](${steamIDSearchURL})`,

                inline:
                    false
            },

            {
                name:
                    "👤 BattleMetrics",

                value:
                    `[${nombre}](${battlemetricsURL})`,

                inline:
                    false
            }

        )

        .setFooter({

            text:
                `BattleMetrics ID: ${jugador.battlemetricsId}`

        });

}

// =====================================================
// EJECUTAR BÚSQUEDA
// =====================================================

async function ejecutarBusqueda(
    interaction,
    nombre
) {

    nombre =
        normalizarNombre(
            nombre
        );

    if (!nombre) {

        return interaction.editReply({

            content:
                "❌ El nombre está vacío."

        });

    }

    try {

        const jugadores =
            await buscarEnBattleMetrics(
                nombre
            );

        if (
            !jugadores.length
        ) {

            return interaction.editReply({

                content:
                    `❌ No encontré ningún jugador con el nombre exacto **${nombre}** en el servidor configurado de BattleMetrics.`

            });

        }

        const embeds =
            jugadores.map(
                jugador =>
                    crearEmbed(
                        jugador
                    )
            );

        await interaction.editReply({

            content:
                `🔎 Resultados para **${nombre}** — ${jugadores.length} coincidencia(s)`,

            embeds:
                embeds.slice(
                    0,
                    10
                )

        });

        for (
            let i = 10;
            i < embeds.length;
            i += 10
        ) {

            await interaction.followUp({

                embeds:
                    embeds.slice(
                        i,
                        i + 10
                    )

            });

        }

    } catch (
        error
    ) {

        manejarError(
            interaction,
            error
        );

    }

}

// =====================================================
// MANEJO DE ERRORES
// =====================================================

async function manejarError(
    interaction,
    error
) {

    console.error(
        "❌ ERROR /STEAM:",
        error
    );

    const mensaje =
        error?.message ||
        "Error desconocido.";

    try {

        if (
            interaction.deferred ||
            interaction.replied
        ) {

            await interaction.editReply({

                content:
                    `❌ Error procesando /steam:\n\`${mensaje}\``

            });

        } else {

            await interaction.reply({

                content:
                    `❌ Error procesando /steam:\n\`${mensaje}\``,

                ephemeral:
                    true

            });

        }

    } catch (
        replyError
    ) {

        console.error(
            "❌ Error enviando error de /steam:",
            replyError
        );

    }

}

// =====================================================
// OBTENER MAP OCR
// =====================================================

function obtenerMapaOCR(
    client
) {

    if (
        !client.steamOCR
    ) {

        client.steamOCR =
            new Map();

    }

    return client.steamOCR;

}

// =====================================================
// COMANDO
// =====================================================

module.exports = {

    data:
        new SlashCommandBuilder()

            .setName(
                "steam"
            )

            .setDescription(
                "Busca un jugador por nombre o mediante una captura de Rust"
            )

            .addStringOption(
                option =>
                    option
                        .setName(
                            "nombre"
                        )
                        .setDescription(
                            "Nombre exacto del jugador"
                        )
                        .setRequired(
                            false
                        )
            )

            .addAttachmentOption(
                option =>
                    option
                        .setName(
                            "captura"
                        )
                        .setDescription(
                            "Captura de Rust donde aparece el nombre"
                        )
                        .setRequired(
                            false
                        )
            ),

    // =================================================
    // EXECUTE
    // =================================================

    async execute(
        interaction
    ) {

        const nombre =
            interaction.options.getString(
                "nombre"
            );

        const captura =
            interaction.options.getAttachment(
                "captura"
            );

        if (
            !nombre &&
            !captura
        ) {

            return interaction.reply({

                content:
                    "❌ Debes proporcionar un **nombre** o una **captura de Rust**.",

                ephemeral:
                    true

            });

        }

        // =================================================
        // BÚSQUEDA DIRECTA POR NOMBRE
        // =================================================

        if (
            nombre
        ) {

            await interaction.deferReply();

            return ejecutarBusqueda(
                interaction,
                nombre
            );

        }

        // =================================================
        // CAPTURA
        // =================================================

        if (
            captura
        ) {

            const tipo =
                captura.contentType ||
                "";

            if (
                !tipo.startsWith(
                    "image/"
                )
            ) {

                return interaction.reply({

                    content:
                        "❌ El archivo debe ser una imagen.",

                    ephemeral:
                        true

                });

            }

            await interaction.deferReply();

            try {

                console.log(
                    `📸 OCR solicitado por ${interaction.user.tag}`
                );

                const buffer =
                    await obtenerImagen(
                        captura.url
                    );

                const nombreDetectado =
                    await detectarNombreOCR(
                        buffer
                    );

                const mapa =
                    obtenerMapaOCR(
                        interaction.client
                    );

                const id =
                    interaction.id;

                mapa.set(
                    id,
                    {
                        nombre:
                            nombreDetectado,

                        usuario:
                            interaction.user.id,

                        creado:
                            Date.now()
                    }
                );

                const botones =
                    new ActionRowBuilder()
                        .addComponents(

                            new ButtonBuilder()

                                .setCustomId(
                                    `steam_ocr_buscar:${id}`
                                )

                                .setLabel(
                                    "Buscar"
                                )

                                .setEmoji(
                                    "✅"
                                )

                                .setStyle(
                                    ButtonStyle.Success
                                ),

                            new ButtonBuilder()

                                .setCustomId(
                                    `steam_ocr_corregir:${id}`
                                )

                                .setLabel(
                                    "Corregir"
                                )

                                .setEmoji(
                                    "✏️"
                                )

                                .setStyle(
                                    ButtonStyle.Primary
                                ),

                            new ButtonBuilder()

                                .setCustomId(
                                    `steam_ocr_cancelar:${id}`
                                )

                                .setLabel(
                                    "Cancelar"
                                )

                                .setEmoji(
                                    "❌"
                                )

                                .setStyle(
                                    ButtonStyle.Danger
                                )

                        );

                const embed =
                    new EmbedBuilder()

                        .setColor(
                            "#5865F2"
                        )

                        .setTitle(
                            "🔍 Nombre detectado"
                        )

                        .setDescription(
                            `El OCR detectó:\n\n**${nombreDetectado}**\n\n¿Es correcto?`
                        )

                        .setFooter({
                            text:
                                "Puedes corregir manualmente el nombre antes de buscar."
                        });

                return interaction.editReply({

                    embeds: [
                        embed
                    ],

                    components: [
                        botones
                    ]

                });

            } catch (
                error
            ) {

                return manejarError(
                    interaction,
                    error
                );

            }

        }

    },

    // =================================================
    // MANEJAR BOTONES / MODAL
    // =================================================

    async handleInteraction(
        interaction
    ) {

        // =================================================
        // BOTONES
        // =================================================

        if (
            interaction.isButton() &&
            interaction.customId.startsWith(
                "steam_ocr_"
            )
        ) {

            const partes =
                interaction.customId.split(
                    ":"
                );

            const accion =
                partes[0];

            const id =
                partes[1];

            const mapa =
                obtenerMapaOCR(
                    interaction.client
                );

            const datos =
                mapa.get(
                    id
                );

            if (
                !datos
            ) {

                await interaction.reply({

                    content:
                        "❌ Esta búsqueda de OCR ya expiró. Ejecuta `/steam` nuevamente.",

                    ephemeral:
                        true

                });

                return true;

            }

            if (
                datos.usuario !==
                interaction.user.id
            ) {

                await interaction.reply({

                    content:
                        "❌ Solo la persona que realizó la búsqueda puede utilizar estos botones.",

                    ephemeral:
                        true

                });

                return true;

            }

            // =============================================
            // CANCELAR
            // =============================================

            if (
                accion ===
                "steam_ocr_cancelar"
            ) {

                mapa.delete(
                    id
                );

                await interaction.update({

                    content:
                        "❌ Búsqueda cancelada.",

                    embeds: [],

                    components: []

                });

                return true;

            }

            // =============================================
            // BUSCAR
            // =============================================

            if (
                accion ===
                "steam_ocr_buscar"
            ) {

                const nombre =
                    datos.nombre;

                mapa.delete(
                    id
                );

                await interaction.update({

                    content:
                        `🔎 Buscando **${nombre}** en BattleMetrics...`,

                    embeds: [],

                    components: []

                });

                return ejecutarBusqueda(
                    interaction,
                    nombre
                )
                    .then(
                        () => true
                    )
                    .catch(
                        error => {

                            console.error(
                                "❌ Error búsqueda OCR:",
                                error
                            );

                            return true;

                        }
                    );

            }

            // =============================================
            // CORREGIR
            // =============================================

            if (
                accion ===
                "steam_ocr_corregir"
            ) {

                if (
                    !interaction.client.steamOCRModal
                ) {

                    interaction.client.steamOCRModal =
                        new Map();

                }

                interaction.client.steamOCRModal.set(

                    interaction.user.id,

                    id

                );

                const modal =
                    new ModalBuilder()

                        .setCustomId(
                            "steam_modal_corregir"
                        )

                        .setTitle(
                            "✏️ Corregir nombre"
                        );

                const input =
                    new TextInputBuilder()

                        .setCustomId(
                            "nombre"
                        )

                        .setLabel(
                            "Nombre del jugador"
                        )

                        .setStyle(
                            TextInputStyle.Short
                        )

                        .setRequired(
                            true
                        )

                        .setMaxLength(
                            100
                        )

                        .setValue(
                            datos.nombre
                        );

                const row =
                    new ActionRowBuilder()
                        .addComponents(
                            input
                        );

                modal.addComponents(
                    row
                );

                await interaction.showModal(
                    modal
                );

                return true;

            }

        }

        // =================================================
        // MODAL CORRECCIÓN
        // =================================================

        if (
            interaction.isModalSubmit() &&
            interaction.customId ===
                "steam_modal_corregir"
        ) {

            if (
                !interaction.client.steamOCRModal
            ) {

                interaction.client.steamOCRModal =
                    new Map();

            }

            const id =
                interaction.client.steamOCRModal.get(
                    interaction.user.id
                );

            if (
                !id
            ) {

                await interaction.reply({

                    content:
                        "❌ Esta corrección ya expiró. Ejecuta `/steam` nuevamente.",

                    ephemeral:
                        true

                });

                return true;

            }

            interaction.client.steamOCRModal.delete(
                interaction.user.id
            );

            const mapa =
                obtenerMapaOCR(
                    interaction.client
                );

            const datos =
                mapa.get(
                    id
                );

            if (
                !datos
            ) {

                await interaction.reply({

                    content:
                        "❌ Esta búsqueda ya expiró. Ejecuta `/steam` nuevamente.",

                    ephemeral:
                        true

                });

                return true;

            }

            if (
                datos.usuario !==
                interaction.user.id
            ) {

                await interaction.reply({

                    content:
                        "❌ No puedes modificar esta búsqueda.",

                    ephemeral:
                        true

                });

                return true;

            }

            const nuevoNombre =
                normalizarNombre(
                    interaction.fields.getTextInputValue(
                        "nombre"
                    )
                );

            if (
                !nuevoNombre
            ) {

                await interaction.reply({

                    content:
                        "❌ El nombre no puede estar vacío.",

                    ephemeral:
                        true

                });

                return true;

            }

            datos.nombre =
                nuevoNombre;

            mapa.set(
                id,
                datos
            );

            const botones =
                new ActionRowBuilder()
                    .addComponents(

                        new ButtonBuilder()

                            .setCustomId(
                                `steam_ocr_buscar:${id}`
                            )

                            .setLabel(
                                "Buscar"
                            )

                            .setEmoji(
                                "✅"
                            )

                            .setStyle(
                                ButtonStyle.Success
                            ),

                        new ButtonBuilder()

                            .setCustomId(
                                `steam_ocr_corregir:${id}`
                            )

                            .setLabel(
                                "Corregir"
                            )

                            .setEmoji(
                                "✏️"
                            )

                            .setStyle(
                                ButtonStyle.Primary
                            ),

                        new ButtonBuilder()

                            .setCustomId(
                                `steam_ocr_cancelar:${id}`
                            )

                            .setLabel(
                                "Cancelar"
                            )

                            .setEmoji(
                                "❌"
                            )

                            .setStyle(
                                ButtonStyle.Danger
                            )

                    );

            const embed =
                new EmbedBuilder()

                    .setColor(
                        "#5865F2"
                    )

                    .setTitle(
                        "🔍 Nombre corregido"
                    )

                    .setDescription(
                        `Nombre a buscar:\n\n**${nuevoNombre}**\n\n¿Quieres buscarlo en BattleMetrics?`
                    );

            await interaction.reply({

                embeds: [
                    embed
                ],

                components: [
                    botones
                ]

            });

            return true;

        }

        return false;

    }

};