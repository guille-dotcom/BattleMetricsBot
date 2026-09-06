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
const { createWorker } = require("tesseract.js");

const ServerConfig = require("../models/ServerConfig");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BM_API = "https://api.battlemetrics.com";

const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/131.0.0.0 Safari/537.36";

// =====================================================
// OCR
// =====================================================

const OCR_GRUPOS = [
    {
        nombre: "latino",
        idiomas: "eng+spa+fra+deu+por"
    },
    {
        nombre: "cyrilico",
        idiomas: "rus+ukr+bul"
    },
    {
        nombre: "asiatico",
        idiomas: "chi_sim+jpn+kor"
    }
];

// =====================================================
// ESTADO
// =====================================================

const estadosOCR = new Map();
const modalesOCR = new Map();

// =====================================================
// NORMALIZACIÓN
// =====================================================

function normalizarNombre(nombre) {
    if (!nombre) return "";

    return String(nombre)
        .normalize("NFKC")
        .replace(/\s+/gu, " ")
        .trim();
}

function normalizarComparacion(nombre) {
    return normalizarNombre(nombre).toLowerCase();
}

// Comparación más tolerante para nombres Unicode
function normalizarComparacionFuerte(nombre) {
    if (!nombre) return "";

    return String(nombre)
        .normalize("NFKC")
        .replace(/[\u200B-\u200D\uFEFF]/gu, "")
        .replace(/\s+/gu, " ")
        .trim()
        .toLocaleLowerCase();
}

// =====================================================
// LIMPIEZA OCR
// =====================================================

function limpiarOCR(texto) {
    if (!texto) return "";

    return String(texto)
        .normalize("NFKC")
        .replace(/\r/g, "")
        .replace(/[“”„‟]/gu, '"')
        .replace(/[‘’‚‛]/gu, "'")
        .replace(/[–—−]/gu, "-")
        .replace(/¦/gu, "|")
        .replace(/[ \t]+/gu, " ")
        .replace(/\n{3,}/gu, "\n\n")
        .trim();
}

// =====================================================
// DESCARGAR IMAGEN
// =====================================================

async function obtenerImagen(url) {
    const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 30000,
        headers: {
            "User-Agent": USER_AGENT,
            Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
        },
        maxContentLength: 15 * 1024 * 1024,
        maxBodyLength: 15 * 1024 * 1024
    });

    return Buffer.from(response.data);
}

// =====================================================
// PREPARAR IMÁGENES
// =====================================================

async function prepararImagenes(buffer) {
    const imagenes = [];

    try {
        const metadata = await sharp(buffer).metadata();

        const anchoOriginal = metadata.width || 1000;

        const anchoObjetivo = Math.min(
            Math.max(anchoOriginal * 2, 1600),
            3000
        );

        // =================================================
        // 1. NORMAL
        // =================================================

        try {
            const normal = await sharp(buffer)
                .resize({
                    width: anchoObjetivo,
                    withoutEnlargement: false,
                    fit: "inside"
                })
                .sharpen({
                    sigma: 1.2
                })
                .png()
                .toBuffer();

            imagenes.push({
                nombre: "normal",
                buffer: normal
            });
        } catch (error) {
            console.error(
                "⚠️ Error preparando imagen normal:",
                error.message
            );
        }

        // =================================================
        // 2. GRIS
        // =================================================

        try {
            const gris = await sharp(buffer)
                .resize({
                    width: anchoObjetivo,
                    withoutEnlargement: false,
                    fit: "inside"
                })
                .grayscale()
                .normalize()
                .sharpen({
                    sigma: 1.5
                })
                .png()
                .toBuffer();

            imagenes.push({
                nombre: "gris",
                buffer: gris
            });
        } catch (error) {
            console.error(
                "⚠️ Error preparando imagen gris:",
                error.message
            );
        }

        // =================================================
        // 3. CONTRASTE
        // =================================================

        try {
            const contraste = await sharp(buffer)
                .resize({
                    width: anchoObjetivo,
                    withoutEnlargement: false,
                    fit: "inside"
                })
                .grayscale()
                .linear(1.5, -40)
                .sharpen({
                    sigma: 1.8
                })
                .png()
                .toBuffer();

            imagenes.push({
                nombre: "contraste",
                buffer: contraste
            });
        } catch (error) {
            console.error(
                "⚠️ Error preparando contraste:",
                error.message
            );
        }

        // =================================================
        // 4. ALTO CONTRASTE
        // =================================================

        try {
            const altoContraste = await sharp(buffer)
                .resize({
                    width: anchoObjetivo,
                    withoutEnlargement: false,
                    fit: "inside"
                })
                .grayscale()
                .normalize()
                .linear(2.0, -70)
                .sharpen({
                    sigma: 2
                })
                .png()
                .toBuffer();

            imagenes.push({
                nombre: "alto-contraste",
                buffer: altoContraste
            });
        } catch (error) {
            console.error(
                "⚠️ Error preparando alto contraste:",
                error.message
            );
        }

        return imagenes;
    } catch (error) {
        console.error(
            "❌ Error analizando imagen:",
            error.message
        );

        return [
            {
                nombre: "original",
                buffer
            }
        ];
    }
}

// =====================================================
// CREAR WORKER OCR
// =====================================================

async function crearWorkerSeguro(idiomas, grupo) {
    let worker = null;

    try {
        console.log(
            `🧠 Cargando OCR [${grupo}]: ${idiomas}`
        );

        worker = await createWorker(idiomas);

        console.log(
            `✅ OCR cargado [${grupo}]`
        );

        return worker;
    } catch (error) {
        console.error(
            `❌ No se pudo cargar OCR [${grupo}]:`,
            error.message
        );

        if (worker) {
            try {
                await worker.terminate();
            } catch (_) {}
        }

        return null;
    }
}

// =====================================================
// EJECUTAR OCR
// =====================================================

async function ejecutarOCR(buffer) {
    console.log(
        "🔎 Iniciando OCR multidioma avanzado..."
    );

    const imagenes = await prepararImagenes(buffer);

    if (!imagenes.length) {
        throw new Error(
            "No se pudieron preparar las imágenes para OCR."
        );
    }

    const resultados = [];

    // =================================================
    // PROCESAR GRUPOS
    // =================================================

    for (const grupo of OCR_GRUPOS) {
        let worker = null;

        try {
            worker = await crearWorkerSeguro(
                grupo.idiomas,
                grupo.nombre
            );

            if (!worker) {
                console.warn(
                    `⚠️ Saltando grupo OCR [${grupo.nombre}]`
                );

                continue;
            }

            const modosPSM = [6, 7, 11, 12];

            // =================================================
            // IMÁGENES
            // =================================================

            for (const imagen of imagenes) {
                for (const psm of modosPSM) {
                    try {
                        await worker.setParameters({
                            tessedit_pageseg_mode: String(psm),
                            preserve_interword_spaces: "1"
                        });

                        const resultado =
                            await worker.recognize(
                                imagen.buffer
                            );

                        const texto =
                            resultado?.data?.text || "";

                        if (texto.trim()) {
                            resultados.push({
                                grupo: grupo.nombre,
                                imagen: imagen.nombre,
                                psm,
                                texto: limpiarOCR(texto)
                            });
                        }
                    } catch (error) {
                        console.error(
                            `⚠️ OCR falló [${grupo.nombre}] ` +
                            `[${imagen.nombre}] ` +
                            `[PSM ${psm}]:`,
                            error.message
                        );
                    }
                }
            }
        } catch (error) {
            console.error(
                `❌ Error general grupo [${grupo.nombre}]:`,
                error.message
            );
        } finally {
            if (worker) {
                try {
                    await worker.terminate();
                } catch (error) {
                    console.warn(
                        "⚠️ Error cerrando worker OCR:",
                        error.message
                    );
                }
            }
        }
    }

    if (!resultados.length) {
        throw new Error(
            "OCR no pudo leer ningún texto de la imagen."
        );
    }

    console.log(
        `🧠 OCR completado: ${resultados.length} resultados`
    );

    // =================================================
    // DEBUG
    // =================================================

    for (const resultado of resultados.slice(0, 20)) {
        console.log(
            `📝 OCR [${resultado.grupo}] ` +
            `[${resultado.imagen}] ` +
            `[PSM ${resultado.psm}]: ` +
            JSON.stringify(resultado.texto)
        );
    }

    return resultados;
}

// =====================================================
// EXTRAER CANDIDATOS
// =====================================================

function extraerCandidatos(resultados) {
    const candidatos = new Map();

    for (const resultado of resultados) {
        const texto = resultado.texto || "";

        const lineas = texto
            .split(/\n/gu)
            .map((linea) => limpiarOCR(linea))
            .filter(Boolean);

        for (const lineaOriginal of lineas) {
            let linea = lineaOriginal.trim();

            // =================================================
            // LONGITUD
            // =================================================

            if (
                linea.length < 2 ||
                linea.length > 64
            ) {
                continue;
            }

            // =================================================
            // TEXTO NO ÚTIL
            // =================================================

            if (
                /^(online|offline|players?|server|steam|rust|health|ping|fps|connect|disconnect)$/iu.test(
                    linea
                )
            ) {
                continue;
            }

            // =================================================
            // BASURA DE EXTREMOS
            // =================================================

            linea = linea
                .replace(/^[|:;,./\\]+/u, "")
                .replace(/[|:;,./\\]+$/u, "")
                .trim();

            if (!linea) {
                continue;
            }

            // =================================================
            // LETRAS / NÚMEROS UNICODE
            // =================================================

            if (!/[\p{L}\p{N}]/u.test(linea)) {
                continue;
            }

            // =================================================
            // EVITAR PÁRRAFOS
            // =================================================

            const palabras =
                linea.split(/\s+/u);

            if (palabras.length > 8) {
                continue;
            }

            const clave =
                normalizarComparacion(linea);

            if (!clave) {
                continue;
            }

            if (!candidatos.has(clave)) {
                candidatos.set(clave, {
                    nombre: linea,
                    apariciones: 0,
                    fuentes: []
                });
            }

            const candidato =
                candidatos.get(clave);

            candidato.apariciones++;

            candidato.fuentes.push({
                grupo: resultado.grupo,
                imagen: resultado.imagen,
                psm: resultado.psm
            });
        }
    }

    return [...candidatos.values()];
}

// =====================================================
// PUNTUAR CANDIDATO
// =====================================================

function puntuarCandidato(candidato) {
    const nombre = candidato.nombre;

    let score = 0;

    score += Math.min(
        candidato.apariciones * 15,
        90
    );

    if (
        nombre.length >= 3 &&
        nombre.length <= 32
    ) {
        score += 20;
    }

    if (
        nombre.length >= 5 &&
        nombre.length <= 24
    ) {
        score += 10;
    }

    if (/\s/u.test(nombre)) {
        score += 5;
    }

    if (/[|_^™]/u.test(nombre)) {
        score += 15;
    }

    if (/[-+*=~]/u.test(nombre)) {
        score += 5;
    }

    if (/\p{L}/u.test(nombre)) {
        score += 10;
    }

    if (/\p{N}/u.test(nombre)) {
        score += 3;
    }

    // Cirílico
    if (/[\u0400-\u04FF]/u.test(nombre)) {
        score += 30;
    }

    // Griego
    if (/[\u0370-\u03FF]/u.test(nombre)) {
        score += 25;
    }

    // Chino
    if (
        /[\u3400-\u4DBF\u4E00-\u9FFF]/u.test(nombre)
    ) {
        score += 35;
    }

    // Japonés
    if (
        /[\u3040-\u30FF]/u.test(nombre)
    ) {
        score += 35;
    }

    // Coreano
    if (
        /[\uAC00-\uD7AF]/u.test(nombre)
    ) {
        score += 35;
    }

    // Latín extendido
    if (
        /[\u00C0-\u024F]/u.test(nombre)
    ) {
        score += 15;
    }

    const caracteresEspeciales =
        nombre.replace(
            /[\p{L}\p{N}\s]/gu,
            ""
        ).length;

    if (caracteresEspeciales > 8) {
        score -= 20;
    }

    if (
        /^[\p{N}\s]+$/u.test(nombre)
    ) {
        score -= 30;
    }

    return score;
}

// =====================================================
// SELECCIONAR MEJOR CANDIDATO
// =====================================================

function seleccionarMejorCandidato(resultados) {
    const candidatos =
        extraerCandidatos(resultados);

    if (!candidatos.length) {
        return null;
    }

    for (const candidato of candidatos) {
        candidato.score =
            puntuarCandidato(candidato);
    }

    candidatos.sort(
        (a, b) => b.score - a.score
    );

    console.log(
        "🏆 Ranking OCR:"
    );

    for (
        const candidato of candidatos.slice(0, 15)
    ) {
        console.log(
            `   ${candidato.score} pts | ` +
            `${JSON.stringify(candidato.nombre)} | ` +
            `${candidato.apariciones} apariciones`
        );
    }

    return candidatos[0];
}

// =====================================================
// DETECTAR NOMBRE OCR
// =====================================================

async function detectarNombreOCR(buffer) {
    const resultados =
        await ejecutarOCR(buffer);

    const mejor =
        seleccionarMejorCandidato(resultados);

    if (!mejor) {
        return null;
    }

    console.log(
        `🎯 Nombre OCR seleccionado: ` +
        `${JSON.stringify(mejor.nombre)} ` +
        `(${mejor.score} pts)`
    );

    return {
        nombre: mejor.nombre,
        score: mejor.score,
        resultados
    };
}

// =====================================================
// OBTENER SERVIDOR CONFIGURADO DESDE MONGODB
// =====================================================

async function obtenerServidorConfigurado(guildId) {
    if (!guildId) {
        return null;
    }

    try {
        const config =
            await ServerConfig.findOne({
                guildId
            }).lean();

        if (!config) {
            console.warn(
                `⚠️ No existe configuración para guild ${guildId}`
            );

            return null;
        }

        const serverId =
            config.battleMetricsServerId;

        if (!serverId) {
            console.warn(
                `⚠️ La guild ${guildId} no tiene battleMetricsServerId configurado.`
            );

            return null;
        }

        console.log(
            `🎯 Servidor BM configurado: ${serverId}`
        );

        return String(serverId);
    } catch (error) {
        console.error(
            "❌ Error leyendo ServerConfig:",
            error.message
        );

        return null;
    }
}

// =====================================================
// OBTENER SERVIDOR BM
// =====================================================

async function obtenerServidorBattleMetrics(serverId) {
    try {
        console.log(
            `🌐 Consultando servidor BM ${serverId}...`
        );

        const response = await axios.get(
            `${BM_API}/servers/${encodeURIComponent(serverId)}`,
            {
                params: {
                    include: "player,identifier"
                },
                headers: {
                    "User-Agent": USER_AGENT,
                    Accept: "application/json"
                },
                timeout: 30000
            }
        );

        return response.data;
    } catch (error) {
        console.error(
            `❌ Error obteniendo servidor BM ${serverId}:`,
            error.response?.status ||
            error.message
        );

        return null;
    }
}

// =====================================================
// OBTENER JUGADORES DEL SERVIDOR
// =====================================================

async function obtenerJugadoresDelServidor(serverId) {
    const encontrados = [];

    // =================================================
    // PRIMER INTENTO:
    // /servers/:id?include=player,identifier
    // =================================================

    const dataServidor =
        await obtenerServidorBattleMetrics(
            serverId
        );

    if (dataServidor) {
        const included =
            Array.isArray(dataServidor.included)
                ? dataServidor.included
                : [];

        const players =
            included.filter(
                (item) =>
                    item &&
                    item.type === "player"
            );

        console.log(
            `👥 Jugadores recibidos desde BM: ${players.length}`
        );

        for (const player of players) {
            const nombre =
                player.attributes?.name;

            if (!nombre) {
                continue;
            }

            encontrados.push({
                id: String(player.id),
                nombre,
                atributos:
                    player.attributes || {}
            });
        }
    }

    return encontrados;
}

// =====================================================
// BATTLEMETRICS
// =====================================================

async function buscarEnBattleMetrics(
    nombre,
    guildId
) {
    const nombreBuscado =
        normalizarComparacionFuerte(nombre);

    console.log(
        `🔎 Buscando en BattleMetrics: ` +
        `${JSON.stringify(nombre)}`
    );

    // =================================================
    // OBTENER SERVIDOR CONFIGURADO
    // =================================================

    const serverId =
        await obtenerServidorConfigurado(
            guildId
        );

    if (!serverId) {
        console.warn(
            "⚠️ No hay servidor BattleMetrics configurado."
        );

        return {
            encontrados: [],
            error: "NO_SERVER_CONFIGURED"
        };
    }

    console.log(
        `🎯 Buscando SOLO dentro del servidor BM ${serverId}`
    );

    // =================================================
    // OBTENER JUGADORES DEL SERVIDOR
    // =================================================

    const jugadores =
        await obtenerJugadoresDelServidor(
            serverId
        );

    console.log(
        `🔎 Comparando ${jugadores.length} jugadores...`
    );

    // =================================================
    // COINCIDENCIA EXACTA NORMALIZADA
    // =================================================

    for (const jugador of jugadores) {
        const nombreJugador =
            normalizarComparacionFuerte(
                jugador.nombre
            );

        if (
            nombreJugador ===
            nombreBuscado
        ) {
            console.log(
                `✅ Jugador encontrado: ` +
                `${JSON.stringify(jugador.nombre)} ` +
                `(${jugador.id})`
            );

            return {
                encontrados: [jugador],
                error: null,
                serverId
            };
        }
    }

    // =================================================
    // SEGUNDO INTENTO:
    // COMPARACIÓN SIN ESPACIOS
    // =================================================

    const nombreSinEspacios =
        nombreBuscado.replace(/\s+/gu, "");

    for (const jugador of jugadores) {
        const nombreJugador =
            normalizarComparacionFuerte(
                jugador.nombre
            ).replace(/\s+/gu, "");

        if (
            nombreJugador ===
            nombreSinEspacios
        ) {
            console.log(
                `✅ Coincidencia encontrada sin espacios: ` +
                `${JSON.stringify(jugador.nombre)} ` +
                `(${jugador.id})`
            );

            return {
                encontrados: [jugador],
                error: null,
                serverId
            };
        }
    }

    console.log(
        `❌ No se encontró "${nombre}" dentro del servidor ${serverId}`
    );

    return {
        encontrados: [],
        error: null,
        serverId
    };
}

// =====================================================
// OBTENER DATOS PLAYER
// =====================================================

async function obtenerDatosPlayer(playerId) {
    try {
        const response = await axios.get(
            `${BM_API}/players/${encodeURIComponent(playerId)}`,
            {
                params: {
                    include: "server,identifier"
                },
                headers: {
                    "User-Agent": USER_AGENT,
                    Accept: "application/json"
                },
                timeout: 30000
            }
        );

        return response.data;
    } catch (error) {
        console.error(
            `❌ Error obteniendo player ${playerId}:`,
            error.response?.status ||
            error.message
        );

        return null;
    }
}

// =====================================================
// CREAR EMBED
// =====================================================

function crearEmbed(
    nombreBuscado,
    resultados,
    nombreOCR = null,
    errorBusqueda = null,
    serverId = null
) {
    const embed =
        new EmbedBuilder()
            .setTitle(
                "🎯 Resultado de búsqueda Steam"
            )
            .setDescription(
                `**Nombre buscado:** ${nombreBuscado}`
            )
            .setColor(0x5865f2)
            .setTimestamp();

    if (nombreOCR) {
        embed.addFields({
            name: "📸 OCR detectado",
            value: `\`${nombreOCR}\``,
            inline: false
        });
    }

    // =================================================
    // SIN SERVIDOR CONFIGURADO
    // =================================================

    if (
        errorBusqueda ===
        "NO_SERVER_CONFIGURED"
    ) {
        embed.addFields({
            name: "⚠️ Servidor no configurado",
            value:
                "Este servidor de Discord no tiene configurado un servidor de BattleMetrics.",
            inline: false
        });

        return embed;
    }

    // =================================================
    // NO ENCONTRADO
    // =================================================

    if (!resultados.length) {
        embed.addFields({
            name: "❌ Resultado",
            value:
                serverId
                    ? `No se encontró **${nombreBuscado}** dentro del servidor de BattleMetrics configurado.`
                    : "No se encontró el jugador en BattleMetrics.",
            inline: false
        });

        if (serverId) {
            embed.addFields({
                name: "🎯 Servidor consultado",
                value:
                    `[Abrir servidor en BattleMetrics](https://www.battlemetrics.com/servers/rust/${serverId})`,
                inline: false
            });
        }

        embed.addFields({
            name: "🔎 Búsqueda manual",
            value:
                `[Abrir búsqueda en SteamID.com](https://www.steamid.com/search?q=${encodeURIComponent(nombreBuscado)})`,
            inline: false
        });

        return embed;
    }

    // =================================================
    // RESULTADOS
    // =================================================

    for (
        const resultado of resultados.slice(0, 10)
    ) {
        const playerId =
            resultado.id;

        const nombre =
            resultado.nombre ||
            nombreBuscado;

        embed.addFields({
            name: `👤 ${nombre}`,
            value:
                `**BattleMetrics:** ` +
                `[Abrir jugador](https://www.battlemetrics.com/players/${encodeURIComponent(playerId)})\n` +
                `**SteamID.com:** ` +
                `[Buscar nombre](https://www.steamid.com/search?q=${encodeURIComponent(nombre)})`,
            inline: false
        });
    }

    return embed;
}

// =====================================================
// EJECUTAR BÚSQUEDA
// =====================================================

async function ejecutarBusqueda(
    interaction,
    nombre,
    nombreOCR = null
) {
    nombre =
        normalizarNombre(nombre);

    if (!nombre) {
        throw new Error(
            "El nombre está vacío."
        );
    }

    const busqueda =
        await buscarEnBattleMetrics(
            nombre,
            interaction.guild?.id
        );

    const embed =
        crearEmbed(
            nombre,
            busqueda.encontrados,
            nombreOCR,
            busqueda.error,
            busqueda.serverId
        );

    return {
        resultados:
            busqueda.encontrados,
        embed
    };
}

// =====================================================
// COMANDO
// =====================================================

module.exports = {
    data:
        new SlashCommandBuilder()
            .setName("steam")
            .setDescription(
                "Busca un jugador de Rust en el servidor configurado de BattleMetrics"
            )
            .addStringOption(
                (option) =>
                    option
                        .setName("nombre")
                        .setDescription(
                            "Nombre exacto del jugador"
                        )
                        .setRequired(false)
            )
            .addAttachmentOption(
                (option) =>
                    option
                        .setName("captura")
                        .setDescription(
                            "Captura donde aparece el nombre del jugador"
                        )
                        .setRequired(false)
            ),

    // =================================================
    // EXECUTE
    // =================================================

    async execute(interaction) {
        console.log(
            "🎯 Ejecutando /steam"
        );

        const nombre =
            interaction.options.getString(
                "nombre"
            );

        const captura =
            interaction.options.getAttachment(
                "captura"
            );

        // =================================================
        // BÚSQUEDA POR NOMBRE
        // =================================================

        if (nombre && !captura) {
            try {
                await interaction.deferReply();

                const resultado =
                    await ejecutarBusqueda(
                        interaction,
                        nombre
                    );

                await interaction.editReply({
                    embeds: [
                        resultado.embed
                    ]
                });

                return;
            } catch (error) {
                console.error(
                    "❌ Error /steam:",
                    error
                );

                try {
                    await interaction.editReply({
                        content:
                            "❌ Ocurrió un error realizando la búsqueda."
                    });
                } catch (_) {}

                return;
            }
        }

        // =================================================
        // OCR POR CAPTURA
        // =================================================

        if (captura) {
            console.log(
                `📸 OCR solicitado por ${interaction.user.tag}`
            );

            try {
                await interaction.deferReply();

                if (
                    !captura.contentType ||
                    !captura.contentType.startsWith(
                        "image/"
                    )
                ) {
                    await interaction.editReply({
                        content:
                            "❌ El archivo debe ser una imagen."
                    });

                    return;
                }

                console.log(
                    `📥 Descargando captura: ${captura.url}`
                );

                const buffer =
                    await obtenerImagen(
                        captura.url
                    );

                console.log(
                    `📦 Imagen descargada: ${buffer.length} bytes`
                );

                const resultadoOCR =
                    await detectarNombreOCR(
                        buffer
                    );

                if (!resultadoOCR) {
                    await interaction.editReply({
                        content:
                            "❌ No pude detectar ningún nombre en la captura."
                    });

                    return;
                }

                const nombreDetectado =
                    resultadoOCR.nombre;

                // =================================================
                // GUARDAR ESTADO
                // =================================================

                estadosOCR.set(
                    interaction.user.id,
                    {
                        nombre:
                            nombreDetectado,
                        score:
                            resultadoOCR.score,
                        timestamp:
                            Date.now()
                    }
                );

                // =================================================
                // EXPIRACIÓN
                // =================================================

                setTimeout(() => {
                    const estado =
                        estadosOCR.get(
                            interaction.user.id
                        );

                    if (
                        estado &&
                        Date.now() -
                            estado.timestamp >
                            10 * 60 * 1000
                    ) {
                        estadosOCR.delete(
                            interaction.user.id
                        );
                    }
                }, 10 * 60 * 1000);

                // =================================================
                // EMBED OCR
                // =================================================

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            "📸 Nombre detectado"
                        )
                        .setDescription(
                            `Encontré este nombre en la captura:\n\n` +
                            `# \`${nombreDetectado}\``
                        )
                        .addFields({
                            name:
                                "🎯 Confianza interna",
                            value:
                                `${resultadoOCR.score} puntos`,
                            inline: true
                        })
                        .setColor(0x57f287)
                        .setFooter({
                            text:
                                "Comprueba que el nombre sea correcto antes de buscar."
                        })
                        .setTimestamp();

                // =================================================
                // BOTONES
                // =================================================

                const botones =
                    new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(
                                    "steam_ocr_buscar"
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
                                    "steam_ocr_corregir"
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
                                    "steam_ocr_cancelar"
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

                await interaction.editReply({
                    embeds: [embed],
                    components: [botones]
                });

                return;
            } catch (error) {
                console.error(
                    "❌ Error OCR /steam:",
                    error
                );

                try {
                    await interaction.editReply({
                        content:
                            `❌ Error procesando la captura:\n\`${error.message}\``
                    });
                } catch (_) {}

                return;
            }
        }

        // =================================================
        // NINGUNA OPCIÓN
        // =================================================

        await interaction.reply({
            content:
                "❌ Debes indicar un nombre o adjuntar una captura.",
            ephemeral: true
        });
    },

    // =====================================================
    // MANEJAR BOTONES / MODALES
    // =====================================================

    async handleInteraction(interaction) {

        // =================================================
        // BUSCAR OCR
        // =================================================

        if (
            interaction.isButton() &&
            interaction.customId ===
                "steam_ocr_buscar"
        ) {
            const estado =
                estadosOCR.get(
                    interaction.user.id
                );

            if (!estado) {
                await interaction.reply({
                    content:
                        "❌ La búsqueda OCR expiró. Vuelve a enviar la captura.",
                    ephemeral: true
                });

                return true;
            }

            try {
                await interaction.deferUpdate();

                const resultado =
                    await ejecutarBusqueda(
                        interaction,
                        estado.nombre,
                        estado.nombre
                    );

                estadosOCR.delete(
                    interaction.user.id
                );

                await interaction.editReply({
                    embeds: [
                        resultado.embed
                    ],
                    components: []
                });

                return true;
            } catch (error) {
                console.error(
                    "❌ Error buscando OCR:",
                    error
                );

                try {
                    await interaction.editReply({
                        content:
                            "❌ Ocurrió un error realizando la búsqueda.",
                        embeds: [],
                        components: []
                    });
                } catch (_) {}

                return true;
            }
        }

        // =================================================
        // CORREGIR OCR
        // =================================================

        if (
            interaction.isButton() &&
            interaction.customId ===
                "steam_ocr_corregir"
        ) {
            const estado =
                estadosOCR.get(
                    interaction.user.id
                );

            if (!estado) {
                await interaction.reply({
                    content:
                        "❌ La búsqueda OCR expiró. Vuelve a enviar la captura.",
                    ephemeral: true
                });

                return true;
            }

            const modal =
                new ModalBuilder()
                    .setCustomId(
                        "steam_ocr_modal"
                    )
                    .setTitle(
                        "✏️ Corregir nombre"
                    );

            const input =
                new TextInputBuilder()
                    .setCustomId(
                        "steam_ocr_nombre"
                    )
                    .setLabel(
                        "Nombre del jugador"
                    )
                    .setStyle(
                        TextInputStyle.Short
                    )
                    .setRequired(true)
                    .setMaxLength(64)
                    .setValue(
                        estado.nombre
                    );

            modal.addComponents(
                new ActionRowBuilder()
                    .addComponents(input)
            );

            modalesOCR.set(
                interaction.user.id,
                Date.now()
            );

            await interaction.showModal(
                modal
            );

            return true;
        }

        // =================================================
        // CANCELAR OCR
        // =================================================

        if (
            interaction.isButton() &&
            interaction.customId ===
                "steam_ocr_cancelar"
        ) {
            estadosOCR.delete(
                interaction.user.id
            );

            await interaction.update({
                content:
                    "❌ Búsqueda cancelada.",
                embeds: [],
                components: []
            });

            return true;
        }

        // =================================================
        // MODAL CORRECCIÓN
        // =================================================

        if (
            interaction.isModalSubmit() &&
            interaction.customId ===
                "steam_ocr_modal"
        ) {
            const nombre =
                interaction.fields.getTextInputValue(
                    "steam_ocr_nombre"
                );

            const nombreLimpio =
                normalizarNombre(nombre);

            if (!nombreLimpio) {
                await interaction.reply({
                    content:
                        "❌ El nombre no puede estar vacío.",
                    ephemeral: true
                });

                return true;
            }

            try {
                await interaction.deferReply();

                const resultado =
                    await ejecutarBusqueda(
                        interaction,
                        nombreLimpio,
                        nombreLimpio
                    );

                estadosOCR.delete(
                    interaction.user.id
                );

                modalesOCR.delete(
                    interaction.user.id
                );

                await interaction.editReply({
                    embeds: [
                        resultado.embed
                    ]
                });

                return true;
            } catch (error) {
                console.error(
                    "❌ Error modal OCR:",
                    error
                );

                try {
                    await interaction.editReply({
                        content:
                            "❌ Ocurrió un error realizando la búsqueda."
                    });
                } catch (_) {}

                return true;
            }
        }

        return false;
    }
};