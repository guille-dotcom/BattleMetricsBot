const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
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
// NORMALIZACIÓN DE NOMBRES
// =====================================================

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

function normalizarVisual(texto) {
    if (!texto) return "";

    let s = String(texto)
        .normalize("NFKC")
        .toLocaleLowerCase();

    const mapa = {
        "а": "a",
        "е": "e",
        "ё": "e",
        "о": "o",
        "р": "p",
        "с": "c",
        "у": "y",
        "х": "x",
        "і": "i",
        "ј": "j",
        "қ": "q",
        "ғ": "g",
        "ү": "y",
        "һ": "h",
        "ӏ": "l",

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
// LEVENSHTEIN
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
                matriz[i][j] =
                    Math.min(
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
    let worker;

    try {
        worker = await createWorker("eng+rus");

        const variantes = await procesarImagen(buffer);

        const resultados = [];

        for (const imagen of variantes) {
            try {
                const resultado = await worker.recognize(imagen);

                if (resultado?.data?.text) {
                    resultados.push(resultado.data.text);
                }
            } catch (error) {
                console.log("[OCR] Error:", error.message);
            }
        }

        await worker.terminate();

        return resultados;
    } catch (error) {
        if (worker) {
            try {
                await worker.terminate();
            } catch {}
        }

        console.error("[OCR] Error general:", error);
        return [];
    }
}

// =====================================================
// EXTRAER POSIBLES NOMBRES DEL OCR
// =====================================================

function extraerCandidatosOCR(textos) {
    const candidatos = [];

    for (const texto of textos) {
        if (!texto) continue;

        const lineas = String(texto)
            .split(/\r?\n/)
            .map(x => x.trim())
            .filter(Boolean);

        for (const linea of lineas) {
            const limpia = linea
                .replace(/\s+/gu, " ")
                .trim();

            if (!limpia) continue;

            if (limpia.length < 2) continue;
            if (limpia.length > 40) continue;

            candidatos.push(limpia);

            const sinDecoracion = quitarSimbolosDecorativos(limpia);

            if (
                sinDecoracion &&
                sinDecoracion !== limpia
            ) {
                candidatos.push(sinDecoracion);
            }
        }
    }

    return [...new Set(candidatos)];
}

// =====================================================
// GENERAR CONSULTAS
// =====================================================

function generarConsultasBusqueda(nombre) {
    const consultas = new Set();

    function agregar(valor) {
        if (!valor) return;

        const limpio = String(valor).trim();

        if (!limpio) return;

        if (limpio.length < 2) return;

        consultas.add(limpio);
    }

    agregar(nombre);
    agregar(quitarSimbolosDecorativos(nombre));
    agregar(compactarNombre(nombre));
    agregar(normalizarVisual(nombre));

    return [...consultas].slice(0, 25);
}

// =====================================================
// PUNTUACIÓN
// =====================================================

function puntuarCoincidencia(nombreJugador, consultas) {
    if (!nombreJugador) return 0;

    const rawJugador = String(nombreJugador).trim();

    const jugadorLower = rawJugador.toLocaleLowerCase();

    const jugadorLimpio = quitarSimbolosDecorativos(rawJugador);
    const jugadorCompacto = compactarNombre(rawJugador);
    const jugadorVisual = normalizarVisual(rawJugador);

    let mejor = 0;

    for (const consulta of consultas) {
        if (!consulta) continue;

        const rawConsulta = String(consulta).trim();

        const consultaLower =
            rawConsulta.toLocaleLowerCase();

        const consultaLimpia =
            quitarSimbolosDecorativos(rawConsulta);

        const consultaCompacta =
            compactarNombre(rawConsulta);

        const consultaVisual =
            normalizarVisual(rawConsulta);

        // ---------------------------------------------
        // Coincidencia exacta del nombre original
        // ---------------------------------------------

        if (jugadorLower === consultaLower) {
            mejor = Math.max(mejor, 2000);
        }

        // ---------------------------------------------
        // Mismo nombre ignorando decoración
        // ---------------------------------------------

        if (
            jugadorCompacto &&
            consultaCompacta &&
            jugadorCompacto === consultaCompacta
        ) {
            // Si el jugador tiene decoración adicional,
            // preferimos ese perfil sobre uno totalmente plano.
            const jugadorTieneDecoracion =
                /[^\p{L}\p{N}]/u.test(rawJugador);

            if (jugadorTieneDecoracion) {
                mejor = Math.max(mejor, 1900);
            } else {
                mejor = Math.max(mejor, 1800);
            }
        }

        // ---------------------------------------------
        // Coincidencia visual
        // ---------------------------------------------

        if (
            jugadorVisual &&
            consultaVisual &&
            jugadorVisual === consultaVisual
        ) {
            mejor = Math.max(mejor, 1750);
        }

        // ---------------------------------------------
        // Nombre limpio exacto
        // ---------------------------------------------

        if (
            jugadorLimpio &&
            consultaLimpia &&
            jugadorLimpio.toLocaleLowerCase() ===
                consultaLimpia.toLocaleLowerCase()
        ) {
            mejor = Math.max(mejor, 1700);
        }

        // ---------------------------------------------
        // Contiene consulta
        // ---------------------------------------------

        if (
            consultaCompacta &&
            jugadorCompacto.includes(consultaCompacta)
        ) {
            const diferencia =
                jugadorCompacto.length -
                consultaCompacta.length;

            let score = 1200;

            if (diferencia <= 2) score = 1350;
            else if (diferencia <= 5) score = 1250;

            mejor = Math.max(mejor, score);
        }

        // ---------------------------------------------
        // Consulta contiene jugador
        // ---------------------------------------------

        if (
            jugadorCompacto &&
            consultaCompacta.includes(jugadorCompacto)
        ) {
            mejor = Math.max(mejor, 1100);
        }

        // ---------------------------------------------
        // Similitud
        // ---------------------------------------------

        if (
            jugadorCompacto &&
            consultaCompacta
        ) {
            const sim = similitud(
                jugadorCompacto,
                consultaCompacta
            );

            if (sim >= 0.95) {
                mejor = Math.max(
                    mejor,
                    1500 + Math.round(sim * 100)
                );
            } else if (sim >= 0.85) {
                mejor = Math.max(
                    mejor,
                    1200 + Math.round(sim * 100)
                );
            } else if (sim >= 0.70) {
                mejor = Math.max(
                    mejor,
                    900 + Math.round(sim * 100)
                );
            }
        }
    }

    return mejor;
}

// =====================================================
// BATTLEMETRICS API
// =====================================================

async function consultarBattleMetrics(
    consulta,
    serverId,
    usarServidor = true
) {
    if (!BM_TOKEN) {
        throw new Error(
            "Falta BATTLEMETRICS_TOKEN en las variables de entorno."
        );
    }

    const params = {
        "filter[search]": consulta,
        "page[size]": 100
    };

    if (usarServidor && serverId) {
        params["filter[servers]"] = serverId;
    }

    const respuesta = await axios.get(
        `${BM_API}/players`,
        {
            params,
            headers: {
                Authorization: `Bearer ${BM_TOKEN}`,
                Accept: "application/vnd.api+json"
            },
            timeout: 20000
        }
    );

    return Array.isArray(respuesta.data?.data)
        ? respuesta.data.data
        : [];
}

// =====================================================
// PUNTUAR JUGADORES
// =====================================================

function puntuarJugadores(jugadores, consultas) {
    return jugadores
        .map(player => {
            const nombre =
                player?.attributes?.name ||
                "";

            return {
                player,
                nombre,
                score: puntuarCoincidencia(
                    nombre,
                    consultas
                )
            };
        })
        .sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }

            // Desempate:
            // preferir nombres decorados cuando el nombre
            // buscado es exactamente su versión limpia.

            const aDecorado =
                /[^\p{L}\p{N}]/u.test(a.nombre);

            const bDecorado =
                /[^\p{L}\p{N}]/u.test(b.nombre);

            if (aDecorado !== bDecorado) {
                return aDecorado ? -1 : 1;
            }

            return a.nombre.length - b.nombre.length;
        });
}

// =====================================================
// BUSCAR EN BATTLEMETRICS
// =====================================================

async function buscarEnBattleMetrics(
    nombre,
    serverId
) {
    const consultas =
        generarConsultasBusqueda(nombre);

    console.log(
        "[BM] Consultas:",
        consultas
    );

    const jugadoresMap = new Map();

    // =================================================
    // PRIMERA BÚSQUEDA:
    // CON SERVIDOR
    // =================================================

    for (const consulta of consultas) {
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

            for (const player of resultados) {
                if (!player?.id) continue;

                jugadoresMap.set(
                    String(player.id),
                    player
                );
            }
        } catch (error) {
            console.log(
                `[BM] Error buscando "${consulta}":`,
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
        "[BM] Candidatos encontrados:",
        puntuados.length
    );

    for (const item of puntuados.slice(0, 10)) {
        console.log(
            `[BM] ${item.player.id} | "${item.nombre}" | score=${item.score}`
        );
    }

    // =================================================
    // SEGUNDA BÚSQUEDA:
    // SIN SERVIDOR
    //
    // Esto permite encontrar perfiles como:
    // "DareN ^_^"
    // aunque BattleMetrics no los entregue
    // usando directamente filter[servers].
    // =================================================

    if (
        puntuados.length === 0 ||
        puntuados[0].score < 1800
    ) {
        console.log(
            "[BM] Mejor coincidencia insuficiente."
        );

        console.log(
            "[BM] Buscando también sin filtro de servidor..."
        );

        for (
            const consulta of consultas.slice(0, 8)
        ) {
            try {
                console.log(
                    `[BM] Fallback "${consulta}" sin servidor...`
                );

                const resultados =
                    await consultarBattleMetrics(
                        consulta,
                        serverId,
                        false
                    );

                for (const player of resultados) {
                    if (!player?.id) continue;

                    jugadoresMap.set(
                        String(player.id),
                        player
                    );
                }
            } catch (error) {
                console.log(
                    `[BM] Error fallback "${consulta}":`,
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
    // MOSTRAR TOP
    // =================================================

    console.log(
        "[BM] ===== MEJORES RESULTADOS ====="
    );

    for (
        const item of puntuados.slice(0, 10)
    ) {
        console.log(
            `[BM] ${item.player.id} | "${item.nombre}" | score=${item.score}`
        );
    }

    console.log(
        "[BM] ==============================="
    );

    if (!puntuados.length) {
        return null;
    }

    const mejor = puntuados[0];

    if (mejor.score < 650) {
        console.log(
            "[BM] ❌ Ningún resultado suficientemente parecido."
        );

        return null;
    }

    console.log(
        `[BM] ✅ MEJOR COINCIDENCIA: ${mejor.player.id} | "${mejor.nombre}" | score=${mejor.score}`
    );

    return mejor.player;
}

// =====================================================
// EMBED RESULTADO
// =====================================================

function crearEmbedResultado({
    nombreBuscado,
    ocr,
    jugador,
    serverId
}) {
    const embed =
        new EmbedBuilder()
            .setTitle("🎯 Resultado de búsqueda Steam")
            .setDescription(
                "Revisa el nombre detectado antes de buscarlo en BattleMetrics."
            );

    embed.addFields({
        name: "📸 OCR detectado",
        value: `\`${ocr || "No detectado"}\``
    });

    embed.addFields({
        name: "🔎 Nombre buscado",
        value: `\`${nombreBuscado || "No especificado"}\``
    });

    if (jugador) {
        const nombre =
            jugador.attributes?.name ||
            "Desconocido";

        embed.addFields({
            name: "✅ Jugador encontrado",
            value:
                `**${nombre}**\n` +
                `BattleMetrics ID: \`${jugador.id}\``
        });
    } else {
        embed.addFields({
            name: "❌ Jugador",
            value: "No se encontró una coincidencia."
        });
    }

    if (serverId) {
        embed.addFields({
            name: "🎯 Servidor consultado",
            value:
                `[Abrir servidor en BattleMetrics](${BM_API.replace(
                    "/api",
                    ""
                )}/servers/${serverId})`
        });
    }

    return embed;
}

// =====================================================
// BOTONES RESULTADO
// =====================================================

function crearBotonesResultado(jugador, nombre) {
    const botones = [];

    if (jugador?.id) {
        botones.push(
            new ButtonBuilder()
                .setLabel("BattleMetrics")
                .setStyle(ButtonStyle.Link)
                .setURL(
                    `https://www.battlemetrics.com/players/${jugador.id}`
                )
        );
    }

    if (nombre) {
        botones.push(
            new ButtonBuilder()
                .setLabel("Name Search")
                .setStyle(ButtonStyle.Link)
                .setURL(
                    `https://www.steamid.com/search?q=${encodeURIComponent(
                        nombre
                    )}`
                )
        );
    }

    return new ActionRowBuilder().addComponents(
        botones
    );
}

// =====================================================
// COMANDO
// =====================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName("steam")
        .setDescription(
            "Busca un jugador de Steam/BattleMetrics"
        )
        .addStringOption(option =>
            option
                .setName("nombre")
                .setDescription(
                    "Nombre del jugador"
                )
                .setRequired(false)
        )
        .addAttachmentOption(option =>
            option
                .setName("imagen")
                .setDescription(
                    "Captura del nombre del jugador"
                )
                .setRequired(false)
        ),

    async execute(interaction) {
        let nombre =
            interaction.options.getString(
                "nombre"
            );

        const imagen =
            interaction.options.getAttachment(
                "imagen"
            );

        let ocrDetectado = "";

        // =================================================
        // RESPONDER RÁPIDO PARA EVITAR UNKNOWN INTERACTION
        // =================================================

        await interaction.deferReply();

        // =================================================
        // OCR
        // =================================================

        if (imagen) {
            try {
                console.log(
                    "[OCR] Descargando imagen..."
                );

                const respuesta =
                    await axios.get(
                        imagen.url,
                        {
                            responseType: "arraybuffer",
                            timeout: 30000
                        }
                    );

                console.log(
                    "[OCR] Ejecutando OCR..."
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

                if (!nombre && candidatos.length) {
                    nombre = candidatos[0];
                }

                ocrDetectado =
                    candidatos[0] ||
                    textos[0] ||
                    "";
            } catch (error) {
                console.error(
                    "[OCR] Error:",
                    error
                );
            }
        }

        if (!nombre) {
            return interaction.editReply({
                content:
                    "❌ Necesito un nombre o una imagen para buscar al jugador."
            });
        }

        // =================================================
        // CONFIGURACIÓN SERVIDOR
        // =================================================

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

        // =================================================
        // BUSCAR
        // =================================================

        let jugador = null;

        try {
            console.log(
                `[BM] Buscando jugador: "${nombre}"`
            );

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

        // =================================================
        // EMBED
        // =================================================

        const embed =
            crearEmbedResultado({
                nombreBuscado: nombre,
                ocr: ocrDetectado,
                jugador,
                serverId
            });

        const row =
            crearBotonesResultado(
                jugador,
                nombre
            );

        // =================================================
        // RESPUESTA
        // =================================================

        return interaction.editReply({
            embeds: [embed],
            components:
                row.components.length
                    ? [row]
                    : []
        });
    }
};