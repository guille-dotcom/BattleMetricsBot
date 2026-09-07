const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const axios = require("axios");
const sharp = require("sharp");
const { createWorker } = require("tesseract.js");

const ServerConfig = require("../models/ServerConfig");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BM_API = "https://api.battlemetrics.com";
const BM_TOKEN = process.env.BATTLEMETRICS_TOKEN;

// =====================================================
// NORMALIZACIÓN
// =====================================================

function limpiarOCR(texto) {
    if (!texto) return "";

    return String(texto)
        .replace(/^[|│┃!¡:;.,'"`]+/u, "")
        .replace(/[|│┃]+$/u, "")
        .replace(/\s+/gu, " ")
        .trim();
}

function quitarSimbolosDecorativos(texto) {
    if (!texto) return "";

    return String(texto)
        .normalize("NFKC")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .replace(/\s+/gu, " ")
        .trim();
}

function compactarNombre(texto) {
    if (!texto) return "";

    return quitarSimbolosDecorativos(texto)
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}]/gu, "");
}

// =====================================================
// NORMALIZACIÓN VISUAL
// =====================================================

function normalizarVisual(texto) {
    if (!texto) return "";

    let s = String(texto)
        .normalize("NFKC")
        .toLocaleLowerCase();

    const mapa = {
        // Cirílico / caracteres parecidos
        "а": "a",
        "А": "a",
        "е": "e",
        "Е": "e",
        "ё": "e",
        "Ё": "e",
        "о": "o",
        "О": "o",
        "р": "p",
        "Р": "p",
        "с": "c",
        "С": "c",
        "у": "y",
        "У": "y",
        "х": "x",
        "Х": "x",
        "і": "i",
        "І": "i",
        "ј": "j",
        "Ј": "j",
        "қ": "q",
        "Қ": "q",
        "ғ": "g",
        "Ғ": "g",
        "ү": "y",
        "Ү": "y",
        "һ": "h",
        "Һ": "h",
        "ӏ": "l",
        "Л": "l",
        "л": "l",

        // Leetspeak
        "0": "o",
        "1": "i",
        "3": "e",
        "4": "a",
        "5": "s",
        "6": "g",
        "7": "t",
        "8": "b",
        "9": "g"
    };

    s = [...s]
        .map(c => mapa[c] || c)
        .join("");

    return s
        .replace(/[^\p{L}\p{N}]+/gu, "")
        .trim();
}

// =====================================================
// TOKENIZAR NOMBRE
// =====================================================

function obtenerTokens(texto) {
    if (!texto) return [];

    return String(texto)
        .normalize("NFKC")
        .toLocaleLowerCase()
        .split(/[^\p{L}\p{N}]+/gu)
        .map(x => x.trim())
        .filter(x => x.length > 0);
}

// =====================================================
// QUITAR CARACTERES DECORATIVOS
// =====================================================

function obtenerPartePrincipal(texto) {
    if (!texto) return "";

    const limpio = quitarSimbolosDecorativos(texto);

    const tokens = obtenerTokens(limpio);

    if (!tokens.length) {
        return "";
    }

    return tokens
        .sort((a, b) => b.length - a.length)[0];
}

// =====================================================
// DISTANCIA LEVENSHTEIN
// =====================================================

function distanciaLevenshtein(a, b) {
    a = a || "";
    b = b || "";

    const matriz = Array.from(
        { length: b.length + 1 },
        () => new Array(a.length + 1).fill(0)
    );

    for (let i = 0; i <= b.length; i++) {
        matriz[i][0] = i;
    }

    for (let j = 0; j <= a.length; j++) {
        matriz[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b[i - 1] === a[j - 1]) {
                matriz[i][j] = matriz[i - 1][j - 1];
            } else {
                matriz[i][j] = Math.min(
                    matriz[i - 1][j] + 1,
                    matriz[i][j - 1] + 1,
                    matriz[i - 1][j - 1] + 1
                );
            }
        }
    }

    return matriz[b.length][a.length];
}

function similitud(a, b) {
    a = a || "";
    b = b || "";

    if (!a || !b) return 0;

    const max = Math.max(a.length, b.length);

    if (!max) return 1;

    return 1 - distanciaLevenshtein(a, b) / max;
}

// =====================================================
// PREFIJO / SUFIJO COMÚN
// =====================================================

function longitudCoincidenciaConsecutiva(a, b) {
    if (!a || !b) return 0;

    let mejor = 0;

    for (let i = 0; i < a.length; i++) {
        for (let j = 0; j < b.length; j++) {
            let k = 0;

            while (
                i + k < a.length &&
                j + k < b.length &&
                a[i + k] === b[j + k]
            ) {
                k++;
            }

            if (k > mejor) {
                mejor = k;
            }
        }
    }

    return mejor;
}

// =====================================================
// OCR
// =====================================================

async function procesarImagen(buffer) {
    const variantes = [];

    try {
        const original = await sharp(buffer)
            .resize({
                width: 1600,
                withoutEnlargement: false
            })
            .png()
            .toBuffer();

        variantes.push(original);
    } catch {}

    try {
        const gris = await sharp(buffer)
            .resize({
                width: 1800,
                withoutEnlargement: false
            })
            .grayscale()
            .normalize()
            .sharpen()
            .png()
            .toBuffer();

        variantes.push(gris);
    } catch {}

    try {
        const contraste = await sharp(buffer)
            .resize({
                width: 2000,
                withoutEnlargement: false
            })
            .grayscale()
            .linear(1.7, -80)
            .sharpen()
            .png()
            .toBuffer();

        variantes.push(contraste);
    } catch {}

    try {
        const binaria = await sharp(buffer)
            .resize({
                width: 2200,
                withoutEnlargement: false
            })
            .grayscale()
            .threshold(150)
            .png()
            .toBuffer();

        variantes.push(binaria);
    } catch {}

    return variantes;
}

async function ejecutarOCR(buffer) {
    let worker = null;

    try {
        console.log("[OCR] Iniciando...");

        worker = await createWorker("eng+rus");

        const variantes =
            await procesarImagen(buffer);

        const resultados = [];

        for (const imagen of variantes) {
            try {
                const resultado =
                    await worker.recognize(imagen);

                const texto =
                    resultado?.data?.text || "";

                if (texto.trim()) {
                    resultados.push(texto);
                }
            } catch (error) {
                console.log(
                    "[OCR] Error variante:",
                    error.message
                );
            }
        }

        await worker.terminate();
        worker = null;

        return resultados;
    } catch (error) {
        console.error(
            "[OCR] Error:",
            error
        );

        if (worker) {
            try {
                await worker.terminate();
            } catch {}
        }

        return [];
    }
}

// =====================================================
// EXTRAER CANDIDATOS OCR
// =====================================================

function extraerCandidatosOCR(textos) {
    const candidatos = [];

    for (const texto of textos) {
        if (!texto) continue;

        const lineas = String(texto)
            .split(/\r?\n/)
            .map(x => limpiarOCR(x))
            .filter(Boolean);

        for (const linea of lineas) {
            if (linea.length < 2) continue;
            if (linea.length > 50) continue;

            candidatos.push(linea);

            const limpio =
                quitarSimbolosDecorativos(linea);

            if (
                limpio &&
                limpio !== linea
            ) {
                candidatos.push(limpio);
            }
        }
    }

    return [
        ...new Set(candidatos)
    ];
}

// =====================================================
// CONSULTAS
// =====================================================

function generarConsultasBusqueda(nombre) {
    const consultas = new Set();

    function agregar(valor) {
        if (!valor) return;

        valor = limpiarOCR(valor);

        if (!valor) return;

        if (valor.length < 2) return;

        consultas.add(valor);
    }

    agregar(nombre);
    agregar(quitarSimbolosDecorativos(nombre));
    agregar(compactarNombre(nombre));
    agregar(normalizarVisual(nombre));

    const principal =
        obtenerPartePrincipal(nombre);

    agregar(principal);

    return [...consultas].slice(0, 25);
}

// =====================================================
// PUNTUACIÓN
// =====================================================

function puntuarCoincidencia(
    nombreJugador,
    consultas
) {
    if (!nombreJugador) return 0;

    const rawJugador =
        String(nombreJugador).trim();

    const jugadorLower =
        rawJugador.toLocaleLowerCase();

    const jugadorCompacto =
        compactarNombre(rawJugador);

    const jugadorVisual =
        normalizarVisual(rawJugador);

    const jugadorPrincipal =
        normalizarVisual(
            obtenerPartePrincipal(
                rawJugador
            )
        );

    let mejor = 0;

    for (const consulta of consultas) {
        if (!consulta) continue;

        const rawConsulta =
            String(consulta).trim();

        const consultaLower =
            rawConsulta.toLocaleLowerCase();

        const consultaCompacta =
            compactarNombre(rawConsulta);

        const consultaVisual =
            normalizarVisual(rawConsulta);

        const consultaPrincipal =
            normalizarVisual(
                obtenerPartePrincipal(
                    rawConsulta
                )
            );

        // =============================================
        // EXACTO REAL
        // =============================================

        if (
            jugadorLower ===
            consultaLower
        ) {
            mejor = Math.max(
                mejor,
                3000
            );
        }

        // =============================================
        // EXACTO VISUAL
        // =============================================

        if (
            jugadorVisual &&
            consultaVisual &&
            jugadorVisual === consultaVisual
        ) {
            mejor = Math.max(
                mejor,
                2800
            );
        }

        // =============================================
        // MISMO NOMBRE IGNORANDO DECORACIÓN
        // =============================================

        if (
            jugadorCompacto &&
            consultaCompacta &&
            jugadorCompacto === consultaCompacta
        ) {
            const tieneDecoracion =
                /[^\p{L}\p{N}]/u.test(
                    rawJugador
                );

            if (tieneDecoracion) {
                mejor = Math.max(
                    mejor,
                    2700
                );
            } else {
                mejor = Math.max(
                    mejor,
                    2500
                );
            }
        }

        // =============================================
        // PARTE PRINCIPAL EXACTA
        // =============================================

        if (
            jugadorPrincipal &&
            consultaPrincipal &&
            jugadorPrincipal ===
                consultaPrincipal
        ) {
            mejor = Math.max(
                mejor,
                2400
            );
        }

        // =============================================
        // COINCIDENCIA VISUAL DE PARTE PRINCIPAL
        // =============================================

        if (
            jugadorPrincipal &&
            consultaVisual
        ) {
            const simPrincipal =
                similitud(
                    jugadorPrincipal,
                    consultaVisual
                );

            if (simPrincipal >= 0.90) {
                mejor = Math.max(
                    mejor,
                    2200 +
                        Math.round(
                            simPrincipal * 100
                        )
                );
            }
        }

        // =============================================
        // CONTIENE TODO EL NOMBRE
        // =============================================

        if (
            consultaCompacta.length >= 4 &&
            jugadorCompacto.includes(
                consultaCompacta
            )
        ) {
            const diferencia =
                jugadorCompacto.length -
                consultaCompacta.length;

            let score = 0;

            if (diferencia === 0) {
                score = 2400;
            } else if (diferencia <= 2) {
                score = 2100;
            } else if (diferencia <= 4) {
                score = 1800;
            } else if (diferencia <= 7) {
                score = 1400;
            } else {
                score = 900;
            }

            mejor = Math.max(
                mejor,
                score
            );
        }

        // =============================================
        // COINCIDENCIA CONSECUTIVA
        // =============================================

        if (
            consultaCompacta.length >= 4 &&
            jugadorCompacto.length >= 2
        ) {
            const consecutiva =
                longitudCoincidenciaConsecutiva(
                    jugadorCompacto,
                    consultaCompacta
                );

            if (
                consecutiva >= 6
            ) {
                mejor = Math.max(
                    mejor,
                    1900
                );
            } else if (
                consecutiva >= 5
            ) {
                mejor = Math.max(
                    mejor,
                    1600
                );
            } else if (
                consecutiva >= 4
            ) {
                mejor = Math.max(
                    mejor,
                    1200
                );
            }
        }

        // =============================================
        // SIMILITUD GENERAL
        // =============================================

        if (
            jugadorCompacto &&
            consultaCompacta
        ) {
            const sim =
                similitud(
                    jugadorCompacto,
                    consultaCompacta
                );

            if (sim >= 0.95) {
                mejor = Math.max(
                    mejor,
                    1800 +
                        Math.round(
                            sim * 100
                        )
                );
            } else if (sim >= 0.85) {
                mejor = Math.max(
                    mejor,
                    1400 +
                        Math.round(
                            sim * 100
                        )
                );
            } else if (sim >= 0.75) {
                mejor = Math.max(
                    mejor,
                    1000 +
                        Math.round(
                            sim * 100
                        )
                );
            }
        }
    }

    // =================================================
    // PENALIZAR NOMBRES DEMASIADO CORTOS
    // =================================================

    if (
        jugadorCompacto.length <= 2 &&
        mejor < 2800
    ) {
        mejor -= 800;
    }

    return Math.max(
        0,
        mejor
    );
}

// =====================================================
// BATTLEMETRICS
// =====================================================

async function consultarBattleMetrics(
    consulta,
    serverId,
    usarServidor = true
) {
    if (!BM_TOKEN) {
        throw new Error(
            "Falta BATTLEMETRICS_TOKEN."
        );
    }

    const params = {
        "filter[search]": consulta,
        "page[size]": 100
    };

    if (
        usarServidor &&
        serverId
    ) {
        params["filter[servers]"] =
            serverId;
    }

    const respuesta =
        await axios.get(
            `${BM_API}/players`,
            {
                params,
                headers: {
                    Authorization:
                        `Bearer ${BM_TOKEN}`,
                    Accept:
                        "application/vnd.api+json"
                },
                timeout: 20000
            }
        );

    return Array.isArray(
        respuesta.data?.data
    )
        ? respuesta.data.data
        : [];
}

// =====================================================
// PUNTUAR JUGADORES
// =====================================================

function puntuarJugadores(
    jugadores,
    consultas
) {
    return jugadores
        .map(player => {
            const nombre =
                player?.attributes?.name ||
                "";

            return {
                player,
                nombre,
                score:
                    puntuarCoincidencia(
                        nombre,
                        consultas
                    )
            };
        })
        .sort((a, b) => {
            if (
                b.score !== a.score
            ) {
                return (
                    b.score -
                    a.score
                );
            }

            const aCompacto =
                compactarNombre(
                    a.nombre
                );

            const bCompacto =
                compactarNombre(
                    b.nombre
                );

            const aTieneDecoracion =
                /[^\p{L}\p{N}]/u.test(
                    a.nombre
                );

            const bTieneDecoracion =
                /[^\p{L}\p{N}]/u.test(
                    b.nombre
                );

            // Si empatan, preferir nombre decorado.
            if (
                aTieneDecoracion !==
                bTieneDecoracion
            ) {
                return aTieneDecoracion
                    ? -1
                    : 1;
            }

            // Preferir nombre más largo
            // cuando es una versión decorada.
            if (
                aTieneDecoracion &&
                bTieneDecoracion
            ) {
                return (
                    b.nombre.length -
                    a.nombre.length
                );
            }

            // Preferir mayor cantidad de caracteres
            // coincidentes.
            return (
                bCompacto.length -
                aCompacto.length
            );
        });
}

// =====================================================
// BÚSQUEDA COMPLETA
// =====================================================

async function buscarEnBattleMetrics(
    nombre,
    serverId
) {
    const consultas =
        generarConsultasBusqueda(
            nombre
        );

    console.log(
        "[BM] Consultas:",
        consultas
    );

    const jugadoresMap =
        new Map();

    // =================================================
    // PRIMERA PASADA:
    // CON SERVIDOR
    // =================================================

    for (
        const consulta of consultas
    ) {
        try {
            console.log(
                `[BM] Buscando "${consulta}" con servidor...`
            );

            const resultados =
                await consultarBattleMetrics(
                    consulta,
                    serverId,
                    true
                );

            for (
                const player of resultados
            ) {
                if (!player?.id) {
                    continue;
                }

                jugadoresMap.set(
                    String(player.id),
                    player
                );
            }
        } catch (error) {
            console.log(
                `[BM] Error "${consulta}":`,
                error.response?.status ||
                    error.message
            );
        }
    }

    let puntuados =
        puntuarJugadores(
            [...jugadoresMap.values()],
            consultas
        );

    console.log(
        `[BM] ${puntuados.length} candidatos encontrados.`
    );

    for (
        const item of puntuados.slice(
            0,
            15
        )
    ) {
        console.log(
            `[BM] ${item.player.id} | "${item.nombre}" | score=${item.score}`
        );
    }

    // =================================================
    // FALLBACK SIN SERVIDOR
    // =================================================

    if (
        !puntuados.length ||
        puntuados[0].score < 2200
    ) {
        console.log(
            "[BM] Ejecutando búsqueda global..."
        );

        for (
            const consulta of consultas.slice(
                0,
                10
            )
        ) {
            try {
                console.log(
                    `[BM] Global "${consulta}"...`
                );

                const resultados =
                    await consultarBattleMetrics(
                        consulta,
                        serverId,
                        false
                    );

                for (
                    const player of resultados
                ) {
                    if (!player?.id) {
                        continue;
                    }

                    jugadoresMap.set(
                        String(player.id),
                        player
                    );
                }
            } catch (error) {
                console.log(
                    `[BM] Error global "${consulta}":`,
                    error.response?.status ||
                        error.message
                );
            }
        }

        puntuados =
            puntuarJugadores(
                [...jugadoresMap.values()],
                consultas
            );
    }

    // =================================================
    // RESULTADOS FINALES
    // =================================================

    console.log(
        "[BM] ===== RESULTADOS FINALES ====="
    );

    for (
        const item of puntuados.slice(
            0,
            15
        )
    ) {
        console.log(
            `[BM] ${item.player.id} | "${item.nombre}" | score=${item.score}`
        );
    }

    console.log(
        "[BM] ==============================="
    );

    if (!puntuados.length) {
        console.log(
            "[BM] ❌ No se encontraron jugadores."
        );

        return null;
    }

    const mejor =
        puntuados[0];

    if (
        mejor.score < 800
    ) {
        console.log(
            `[BM] ❌ Mejor resultado demasiado débil: "${mejor.nombre}"`
        );

        return null;
    }

    console.log(
        `[BM] ✅ MEJOR: ${mejor.player.id} | "${mejor.nombre}" | score=${mejor.score}`
    );

    return mejor.player;
}

// =====================================================
// EMBED
// =====================================================

function crearEmbedResultado({
    nombreBuscado,
    ocr,
    jugador,
    serverId
}) {
    const embed =
        new EmbedBuilder()
            .setTitle(
                "🎯 Resultado de búsqueda Steam"
            )
            .setDescription(
                "Revisa el nombre detectado antes de buscarlo en BattleMetrics."
            );

    embed.addFields({
        name: "📸 OCR detectado",
        value:
            `\`${ocr || "No detectado"}\``
    });

    embed.addFields({
        name: "🔎 Nombre buscado",
        value:
            `\`${nombreBuscado || "No especificado"}\``
    });

    if (jugador) {
        const nombre =
            jugador.attributes?.name ||
            "Desconocido";

        embed.addFields({
            name: "✅ Jugador encontrado",
            value:
                `**${nombre}** BattleMetrics ID: \`${jugador.id}\``
        });
    } else {
        embed.addFields({
            name: "❌ Jugador encontrado",
            value:
                "No se encontró una coincidencia suficientemente fiable."
        });
    }

    if (serverId) {
        embed.addFields({
            name: "🎯 Servidor consultado",
            value:
                `[Abrir servidor en BattleMetrics](https://www.battlemetrics.com/servers/${serverId})`
        });
    }

    return embed;
}

// =====================================================
// BOTONES
// =====================================================

function crearBotonesResultado(
    jugador,
    nombre
) {
    const botones = [];

    if (jugador?.id) {
        botones.push(
            new ButtonBuilder()
                .setLabel(
                    "BattleMetrics"
                )
                .setStyle(
                    ButtonStyle.Link
                )
                .setURL(
                    `https://www.battlemetrics.com/players/${jugador.id}`
                )
        );
    }

    if (nombre) {
        botones.push(
            new ButtonBuilder()
                .setLabel(
                    "Name Search"
                )
                .setStyle(
                    ButtonStyle.Link
                )
                .setURL(
                    `https://www.steamid.com/search?q=${encodeURIComponent(
                        nombre
                    )}`
                )
        );
    }

    if (!botones.length) {
        return null;
    }

    return new ActionRowBuilder()
        .addComponents(
            botones
        );
}

// =====================================================
// EXPORTAR COMANDO
// =====================================================

module.exports = {
    data:
        new SlashCommandBuilder()
            .setName("steam")
            .setDescription(
                "Busca un jugador de Steam/BattleMetrics"
            )
            .addStringOption(
                option =>
                    option
                        .setName(
                            "nombre"
                        )
                        .setDescription(
                            "Nombre del jugador"
                        )
                        .setRequired(
                            false
                        )
            )
            .addAttachmentOption(
                option =>
                    option
                        .setName(
                            "imagen"
                        )
                        .setDescription(
                            "Captura del nombre del jugador"
                        )
                        .setRequired(
                            false
                        )
            ),

    async execute(
        interaction
    ) {
        try {
            const nombreInput =
                interaction.options.getString(
                    "nombre"
                );

            const imagen =
                interaction.options.getAttachment(
                    "imagen"
                );

            let nombre =
                nombreInput
                    ? limpiarOCR(
                        nombreInput
                    )
                    : "";

            let ocrDetectado = "";

            // =============================================
            // DEFER
            // =============================================

            await interaction.deferReply();

            // =============================================
            // OCR
            // =============================================

            if (imagen) {
                try {
                    console.log(
                        "[OCR] Descargando imagen..."
                    );

                    const respuesta =
                        await axios.get(
                            imagen.url,
                            {
                                responseType:
                                    "arraybuffer",
                                timeout:
                                    30000
                            }
                        );

                    console.log(
                        "[OCR] Procesando imagen..."
                    );

                    const textos =
                        await ejecutarOCR(
                            Buffer.from(
                                respuesta.data
                            )
                        );

                    const candidatos =
                        extraerCandidatosOCR(
                            textos
                        );

                    console.log(
                        "[OCR] Candidatos:",
                        candidatos
                    );

                    if (!nombre) {
                        nombre =
                            candidatos[0] ||
                            "";
                    }

                    ocrDetectado =
                        candidatos[0] ||
                        "";
                } catch (error) {
                    console.error(
                        "[OCR] Error:",
                        error
                    );
                }
            }

            // =============================================
            // VALIDAR NOMBRE
            // =============================================

            if (!nombre) {
                return interaction.editReply({
                    content:
                        "❌ No pude detectar ningún nombre. Usa `/steam nombre:` o adjunta una captura."
                });
            }

            nombre =
                limpiarOCR(
                    nombre
                );

            // =============================================
            // CONFIGURACIÓN DEL SERVIDOR
            // =============================================

            let serverId = null;

            try {
                const config =
                    await ServerConfig.findOne({
                        guildId:
                            interaction.guildId
                    });

                serverId =
                    config?.battleMetricsServerId ||
                    null;
            } catch (error) {
                console.error(
                    "[CONFIG] Error:",
                    error
                );
            }

            if (!serverId) {
                return interaction.editReply({
                    content:
                        "❌ Este servidor no tiene configurado un BattleMetrics Server ID."
                });
            }

            // =============================================
            // BÚSQUEDA
            // =============================================

            console.log(
                `[BM] Buscando: "${nombre}"`
            );

            let jugador = null;

            try {
                jugador =
                    await buscarEnBattleMetrics(
                        nombre,
                        serverId
                    );
            } catch (error) {
                console.error(
                    "[BM] Error general:",
                    error
                );

                return interaction.editReply({
                    content:
                        "❌ Ocurrió un error al consultar BattleMetrics."
                });
            }

            // =============================================
            // EMBED
            // =============================================

            const embed =
                crearEmbedResultado({
                    nombreBuscado:
                        nombre,
                    ocr:
                        ocrDetectado ||
                        nombre,
                    jugador,
                    serverId
                });

            const row =
                crearBotonesResultado(
                    jugador,
                    nombre
                );

            return interaction.editReply({
                embeds: [
                    embed
                ],
                components:
                    row
                        ? [row]
                        : []
            });
        } catch (error) {
            console.error(
                "[STEAM] Error:",
                error
            );

            try {
                if (
                    interaction.deferred ||
                    interaction.replied
                ) {
                    return interaction.editReply({
                        content:
                            "❌ Ocurrió un error ejecutando `/steam`."
                    });
                }

                return interaction.reply({
                    content:
                        "❌ Ocurrió un error ejecutando `/steam`.",
                    flags:
                        MessageFlags.Ephemeral
                });
            } catch {}
        }
    }
};