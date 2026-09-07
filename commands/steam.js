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
const BM_TOKEN = process.env.BATTLEMETRICS_TOKEN;

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
// ESTADO TEMPORAL
// =====================================================

const estadosOCR = new Map();

// =====================================================
// NORMALIZACIÓN
// =====================================================

function normalizarNombre(texto) {
    if (!texto) return "";

    return String(texto)
        .normalize("NFKC")
        .replace(/\r/g, " ")
        .replace(/\n/g, " ")
        .replace(/\s+/gu, " ")
        .trim();
}

function normalizarComparacion(texto) {
    return normalizarNombre(texto)
        .toLocaleLowerCase()
        .normalize("NFKC")
        .replace(/\s+/gu, " ")
        .trim();
}

// =====================================================
// QUITAR SÍMBOLOS DECORATIVOS
// =====================================================

function quitarSimbolosDecorativos(texto) {
    if (!texto) return "";

    return String(texto)
        .normalize("NFKC")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .replace(/\s+/gu, " ")
        .trim();
}

// =====================================================
// COMPACTAR NOMBRE
// =====================================================

function compactarNombre(texto) {
    if (!texto) return "";

    return quitarSimbolosDecorativos(texto)
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}]/gu, "");
}

// =====================================================
// NORMALIZACIÓN VISUAL
// =====================================================
//
// Convierte caracteres que OCR suele confundir.
// NO modifica el nombre que mostramos.
// Solo se utiliza para comparar.
//
// =====================================================

function normalizarVisual(texto) {
    if (!texto) return "";

    let valor = compactarNombre(texto);

    const mapa = {
        "о": "0",
        "О": "0",
        "o": "0",

        "з": "3",
        "З": "3",

        "я": "r",
        "Я": "r",

        "е": "e",
        "Е": "e",

        "а": "a",
        "А": "a",

        "с": "c",
        "С": "c",

        "х": "x",
        "Х": "x",

        "у": "y",
        "У": "y",

        "в": "b",
        "В": "b",

        "н": "h",
        "Н": "h",

        "м": "m",
        "М": "m",

        "т": "t",
        "Т": "t",

        "р": "p",
        "Р": "p",

        "к": "k",
        "К": "k",

        "і": "i",
        "І": "i",

        "ї": "i",
        "Ї": "i"
    };

    let resultado = "";

    for (const caracter of valor) {
        resultado += mapa[caracter] || caracter;
    }

    return resultado;
}

// =====================================================
// DISTANCIA LEVENSHTEIN
// =====================================================

function distanciaLevenshtein(a, b) {
    a = String(a || "");
    b = String(b || "");

    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    const matriz = [];

    for (let i = 0; i <= b.length; i++) {
        matriz[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
        matriz[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matriz[i][j] = matriz[i - 1][j - 1];
            } else {
                matriz[i][j] = Math.min(
                    matriz[i - 1][j - 1] + 1,
                    matriz[i][j - 1] + 1,
                    matriz[i - 1][j] + 1
                );
            }
        }
    }

    return matriz[b.length][a.length];
}

// =====================================================
// SIMILITUD
// =====================================================

function similitudTexto(a, b) {
    const aa = normalizarVisual(a);
    const bb = normalizarVisual(b);

    if (!aa || !bb) return 0;

    if (aa === bb) {
        return 1;
    }

    if (aa.includes(bb) || bb.includes(aa)) {
        const menor = Math.min(aa.length, bb.length);
        const mayor = Math.max(aa.length, bb.length);

        if (menor >= 4) {
            return 0.90 - ((mayor - menor) * 0.03);
        }
    }

    const distancia = distanciaLevenshtein(aa, bb);
    const longitud = Math.max(aa.length, bb.length);

    if (!longitud) return 0;

    return Math.max(
        0,
        1 - distancia / longitud
    );
}

// =====================================================
// EXTRAER PARTES ÚTILES DE OCR
// =====================================================

function extraerPartesUtilesOCR(texto) {
    if (!texto) return [];

    const originales = [
        normalizarNombre(texto),
        quitarSimbolosDecorativos(texto)
    ];

    const candidatos = [];

    for (const original of originales) {
        if (!original) continue;

        candidatos.push(original);

        const tokens = original
            .split(/\s+/u)
            .filter(Boolean);

        for (const token of tokens) {
            if (token.length >= 2) {
                candidatos.push(token);
            }
        }

        const alfanumericos =
            original.match(/[\p{L}\p{N}]{2,}/gu);

        if (alfanumericos) {
            for (const parte of alfanumericos) {
                candidatos.push(parte);
            }
        }
    }

    const extras = [];

    for (const candidato of candidatos) {
        const lower =
            candidato.toLocaleLowerCase();

        let posible = lower
            .replace(/[я]/gu, "r")
            .replace(/[з]/gu, "3")
            .replace(/[о]/gu, "0");

        if (posible !== lower) {
            extras.push(posible);
        }

        const compacto = candidato
            .replace(/[^\p{L}\p{N}]/gu, "");

        if (compacto.length >= 3) {
            extras.push(compacto);
        }
    }

    return [
        ...new Set(
            [...candidatos, ...extras]
                .map((x) => normalizarNombre(x))
                .filter((x) => x.length >= 2)
        )
    ];
}

// =====================================================
// GENERAR VARIANTES DE OCR
// =====================================================
//
// Ejemplo:
//
// TR3NOT
//
// genera:
//
// TR3NOT
// TR3N0T
// R3NOT
// TR3NO
// R3N0
// 3N0T
//
// Esto ayuda cuando OCR agrega letras basura al inicio/final.
// =====================================================

function generarVariantesOCR(texto) {
    if (!texto) return [];

    const variantes = new Set();

    const agregar = (valor) => {
        if (!valor) return;

        const limpio = compactarNombre(valor);

        if (limpio.length >= 2) {
            variantes.add(limpio);
        }

        const visual = normalizarVisual(valor);

        if (visual.length >= 2) {
            variantes.add(visual);
        }
    };

    agregar(texto);

    const compacto = compactarNombre(texto);
    const visual = normalizarVisual(texto);

    agregar(compacto);
    agregar(visual);

    // ---------------------------------------------
    // Quitar progresivamente caracteres de extremos
    // ---------------------------------------------

    if (visual.length >= 4) {
        for (let i = 1; i <= 2; i++) {
            if (visual.length - i >= 4) {
                agregar(
                    visual.slice(i)
                );

                agregar(
                    visual.slice(
                        0,
                        visual.length - i
                    )
                );
            }
        }
    }

    // ---------------------------------------------
    // Ventanas internas
    // ---------------------------------------------

    if (visual.length >= 5) {
        for (let inicio = 0; inicio < visual.length; inicio++) {
            for (
                let longitud = 4;
                longitud <= 6;
                longitud++
            ) {
                if (
                    inicio + longitud <=
                    visual.length
                ) {
                    const parte =
                        visual.slice(
                            inicio,
                            inicio + longitud
                        );

                    if (
                        /[\p{L}\p{N}]/u.test(
                            parte
                        )
                    ) {
                        variantes.add(parte);
                    }
                }
            }
        }
    }

    return [...variantes];
}

// =====================================================
// LIMPIAR OCR
// =====================================================

function limpiarOCR(texto) {
    if (!texto) return "";

    let limpio = String(texto)
        .replace(/\r/g, "\n")
        .replace(/[|¦]/g, " ")
        .replace(/[«»]/g, " ")
        .replace(/\t/g, " ")
        .replace(/[ ]{2,}/g, " ");

    const lineas = limpio
        .split("\n")
        .map((linea) => normalizarNombre(linea))
        .filter(Boolean);

    return lineas.join("\n").trim();
}

// =====================================================
// OBTENER IMAGEN
// =====================================================

async function obtenerImagen(url) {
    const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 30000,
        headers: {
            "User-Agent": USER_AGENT
        }
    });

    return Buffer.from(response.data);
}

// =====================================================
// PREPARAR IMÁGENES
// =====================================================

async function prepararImagenes(buffer) {
    const imagenes = [];

    try {
        const original = await sharp(buffer)
            .rotate()
            .resize({
                width: 2200,
                withoutEnlargement: false
            })
            .grayscale()
            .normalize()
            .sharpen()
            .png()
            .toBuffer();

        imagenes.push(original);
    } catch (error) {
        console.error(
            "[OCR] Error imagen original:",
            error.message
        );
    }

    try {
        const contraste = await sharp(buffer)
            .rotate()
            .resize({
                width: 2600,
                withoutEnlargement: false
            })
            .grayscale()
            .linear(1.5, -50)
            .sharpen({
                sigma: 1.2
            })
            .png()
            .toBuffer();

        imagenes.push(contraste);
    } catch (error) {
        console.error(
            "[OCR] Error contraste:",
            error.message
        );
    }

    try {
        const binaria = await sharp(buffer)
            .rotate()
            .resize({
                width: 2800,
                withoutEnlargement: false
            })
            .grayscale()
            .normalize()
            .threshold(145)
            .png()
            .toBuffer();

        imagenes.push(binaria);
    } catch (error) {
        console.error(
            "[OCR] Error binaria:",
            error.message
        );
    }

    return imagenes;
}

// =====================================================
// CREAR WORKER
// =====================================================

async function crearWorkerSeguro(idiomas) {
    return await createWorker(idiomas);
}

// =====================================================
// EJECUTAR OCR
// =====================================================

async function ejecutarOCR(buffer, idiomas) {
    let worker = null;

    try {
        worker =
            await crearWorkerSeguro(
                idiomas
            );

        const resultado =
            await worker.recognize(buffer);

        return resultado?.data?.text || "";
    } catch (error) {
        console.error(
            `[OCR] Error ${idiomas}:`,
            error.message
        );

        return "";
    } finally {
        if (worker) {
            try {
                await worker.terminate();
            } catch {}
        }
    }
}

// =====================================================
// EXTRAER CANDIDATOS
// =====================================================

function extraerCandidatos(texto) {
    const limpio = limpiarOCR(texto);

    if (!limpio) return [];

    const lineas = limpio
        .split("\n")
        .map((linea) => normalizarNombre(linea))
        .filter(Boolean);

    const candidatos = [];

    for (const linea of lineas) {
        if (!linea) continue;
        if (linea.length < 2) continue;
        if (linea.length > 80) continue;

        if (
            !/[\p{L}\p{N}]/u.test(
                linea
            )
        ) {
            continue;
        }

        const lower =
            linea.toLocaleLowerCase();

        const ignoradas = [
            "rust",
            "steam",
            "battlemetrics",
            "server",
            "servers",
            "players",
            "player",
            "online",
            "offline",
            "connect",
            "settings",
            "inventory",
            "friends",
            "profile",
            "hours",
            "level",
            "name",
            "search",
            "report",
            "play",
            "menu",
            "discord"
        ];

        if (
            ignoradas.includes(lower)
        ) {
            continue;
        }

        candidatos.push(linea);

        const partes =
            extraerPartesUtilesOCR(
                linea
            );

        for (const parte of partes) {
            if (
                !candidatos.includes(
                    parte
                )
            ) {
                candidatos.push(
                    parte
                );
            }
        }
    }

    return [
        ...new Set(candidatos)
    ];
}

// =====================================================
// PUNTUAR CANDIDATO OCR
// =====================================================

function puntuarCandidato(texto) {
    if (!texto) return 0;

    const limpio =
        normalizarNombre(texto);

    let puntos = 0;

    if (/\s/u.test(limpio)) {
        puntos += 10;
    }

    if (
        /[\u0400-\u04FF]/u.test(
            limpio
        )
    ) {
        puntos += 30;
    }

    if (
        /[\u3040-\u30FF]/u.test(
            limpio
        )
    ) {
        puntos += 30;
    }

    if (
        /[\u4E00-\u9FFF]/u.test(
            limpio
        )
    ) {
        puntos += 30;
    }

    if (
        /[\uAC00-\uD7AF]/u.test(
            limpio
        )
    ) {
        puntos += 30;
    }

    if (
        limpio.length >= 3 &&
        limpio.length <= 30
    ) {
        puntos += 15;
    }

    if (
        /[\p{L}\p{N}]/u.test(
            limpio
        )
    ) {
        puntos += 10;
    }

    return puntos;
}

// =====================================================
// DETECTAR NOMBRE
// =====================================================

async function detectarNombreOCR(buffer) {
    const imagenes =
        await prepararImagenes(
            buffer
        );

    if (!imagenes.length) {
        return {
            nombre: null,
            candidatos: [],
            textoCompleto: ""
        };
    }

    const resultados = [];
    let textoCompleto = "";

    for (const grupo of OCR_GRUPOS) {
        console.log(
            `[OCR] Ejecutando ${grupo.nombre}: ${grupo.idiomas}`
        );

        for (const imagen of imagenes) {
            const texto =
                await ejecutarOCR(
                    imagen,
                    grupo.idiomas
                );

            if (!texto) continue;

            textoCompleto +=
                "\n" + texto;

            const candidatos =
                extraerCandidatos(
                    texto
                );

            for (const candidato of candidatos) {
                resultados.push({
                    candidato,
                    puntos:
                        puntuarCandidato(
                            candidato
                        )
                });
            }
        }
    }

    if (!resultados.length) {
        return {
            nombre: null,
            candidatos: [],
            textoCompleto:
                limpiarOCR(
                    textoCompleto
                )
        };
    }

    const mapa = new Map();

    for (const resultado of resultados) {
        const clave =
            normalizarComparacion(
                resultado.candidato
            );

        if (!clave) continue;

        if (!mapa.has(clave)) {
            mapa.set(clave, {
                nombre:
                    resultado.candidato,
                puntos: 0,
                veces: 0
            });
        }

        const actual =
            mapa.get(clave);

        actual.puntos +=
            resultado.puntos;

        actual.veces++;
    }

    const candidatosFinales =
        [...mapa.values()]
            .map((item) => ({
                ...item,
                total:
                    item.puntos +
                    item.veces * 20
            }))
            .sort(
                (a, b) =>
                    b.total -
                    a.total
            );

    const mejor =
        candidatosFinales[0];

    return {
        nombre:
            mejor?.nombre || null,

        candidatos:
            candidatosFinales
                .slice(0, 20)
                .map(
                    (x) =>
                        x.nombre
                ),

        textoCompleto:
            limpiarOCR(
                textoCompleto
            )
    };
}

// =====================================================
// OBTENER SERVIDOR
// =====================================================

async function obtenerServidorConfigurado(
    guildId
) {
    try {
        const config =
            await ServerConfig
                .findOne({
                    guildId
                })
                .lean();

        if (
            !config?.battleMetricsServerId
        ) {
            return null;
        }

        return String(
            config.battleMetricsServerId
        );
    } catch (error) {
        console.error(
            "[BM] Error Mongo:",
            error.message
        );

        return null;
    }
}

// =====================================================
// SCORE ENTRE NOMBRE BM Y CONSULTA
// =====================================================

function puntuarCoincidencia(
    nombreJugador,
    consultas
) {
    if (!nombreJugador) return 0;

    const jugadorOriginal =
        normalizarNombre(
            nombreJugador
        );

    const jugador =
        compactarNombre(
            nombreJugador
        );

    const jugadorVisual =
        normalizarVisual(
            nombreJugador
        );

    if (!jugador) return 0;

    let mejor = 0;

    for (const consulta of consultas) {
        if (!consulta) continue;

        const consultaOriginal =
            normalizarNombre(
                consulta
            );

        const consultaCompacta =
            compactarNombre(
                consulta
            );

        const consultaVisual =
            normalizarVisual(
                consulta
            );

        if (
            !consultaCompacta ||
            consultaCompacta.length < 2
        ) {
            continue;
        }

        // ---------------------------------------------
        // Coincidencia exacta ignorando símbolos
        // ---------------------------------------------

        if (
            jugador ===
            consultaCompacta
        ) {
            mejor =
                Math.max(
                    mejor,
                    1000
                );

            continue;
        }

        // ---------------------------------------------
        // Coincidencia visual exacta
        // ---------------------------------------------

        if (
            jugadorVisual ===
            consultaVisual
        ) {
            mejor =
                Math.max(
                    mejor,
                    950
                );

            continue;
        }

        // ---------------------------------------------
        // Nombre BM contiene consulta
        // Solo permitido con consultas >= 4
        // ---------------------------------------------

        if (
            consultaCompacta.length >= 4 &&
            jugador.includes(
                consultaCompacta
            )
        ) {
            const diferencia =
                jugador.length -
                consultaCompacta.length;

            const puntos =
                850 -
                Math.min(
                    diferencia * 20,
                    250
                );

            mejor =
                Math.max(
                    mejor,
                    puntos
                );
        }

        // ---------------------------------------------
        // Consulta contiene nombre BM
        // ---------------------------------------------

        if (
            jugador.length >= 4 &&
            consultaCompacta.length >= 4 &&
            consultaCompacta.includes(
                jugador
            )
        ) {
            const diferencia =
                consultaCompacta.length -
                jugador.length;

            const puntos =
                800 -
                Math.min(
                    diferencia * 20,
                    250
                );

            mejor =
                Math.max(
                    mejor,
                    puntos
                );
        }

        // ---------------------------------------------
        // Similitud visual
        // ---------------------------------------------

        const similitud =
            similitudTexto(
                jugadorVisual,
                consultaVisual
            );

        if (similitud >= 0.95) {
            mejor =
                Math.max(
                    mejor,
                    900
                );
        } else if (similitud >= 0.85) {
            mejor =
                Math.max(
                    mejor,
                    780
                );
        } else if (similitud >= 0.75) {
            mejor =
                Math.max(
                    mejor,
                    620
                );
        } else if (similitud >= 0.65) {
            mejor =
                Math.max(
                    mejor,
                    450
                );
        }

        // ---------------------------------------------
        // Coincidencia por fragmento largo
        // ---------------------------------------------

        if (
            consultaVisual.length >= 4 &&
            jugadorVisual.length >= 4
        ) {
            let mejorFragmento = 0;

            const minimo =
                Math.min(
                    consultaVisual.length,
                    jugadorVisual.length
                );

            for (
                let longitud = minimo;
                longitud >= 4;
                longitud--
            ) {
                for (
                    let inicio = 0;
                    inicio + longitud <=
                    consultaVisual.length;
                    inicio++
                ) {
                    const fragmento =
                        consultaVisual.slice(
                            inicio,
                            inicio + longitud
                        );

                    if (
                        jugadorVisual.includes(
                            fragmento
                        )
                    ) {
                        mejorFragmento =
                            Math.max(
                                mejorFragmento,
                                longitud
                            );
                    }
                }
            }

            if (
                mejorFragmento >= 5
            ) {
                mejor =
                    Math.max(
                        mejor,
                        650 +
                            Math.min(
                                mejorFragmento *
                                    15,
                                120
                            )
                    );
            }
        }
    }

    return mejor;
}

// =====================================================
// EXTRAER CONSULTAS DE BÚSQUEDA
// =====================================================

function generarConsultasBusqueda(
    nombre,
    candidatosOCR = []
) {
    const consultas = [];

    const agregar = (
        valor,
        prioridad = false
    ) => {
        if (!valor) return;

        const limpio =
            normalizarNombre(
                valor
            );

        if (
            limpio.length < 2
        ) {
            return;
        }

        const existe =
            consultas.some(
                (x) =>
                    normalizarComparacion(
                        x.valor
                    ) ===
                    normalizarComparacion(
                        limpio
                    )
            );

        if (!existe) {
            consultas.push({
                valor: limpio,
                prioridad
            });
        }
    };

    // Nombre OCR principal
    agregar(
        nombre,
        true
    );

    // Sin símbolos
    agregar(
        quitarSimbolosDecorativos(
            nombre
        ),
        true
    );

    // Variantes OCR del principal
    for (
        const variante
        of generarVariantesOCR(
            nombre
        )
    ) {
        agregar(
            variante,
            true
        );
    }

    // Candidatos OCR
    for (
        const candidato
        of candidatosOCR
    ) {
        agregar(
            candidato,
            false
        );

        agregar(
            quitarSimbolosDecorativos(
                candidato
            ),
            false
        );

        for (
            const variante
            of generarVariantesOCR(
                candidato
            )
        ) {
            agregar(
                variante,
                false
            );
        }
    }

    // Ordenar:
    // primero las consultas prioritarias
    consultas.sort(
        (a, b) =>
            Number(b.prioridad) -
            Number(a.prioridad)
    );

    // Máximo 20 consultas
    return consultas
        .slice(0, 20)
        .map(
            (x) => x.valor
        );
}

// =====================================================
// CONSULTA BATTLEMETRICS
// =====================================================

async function consultarBattleMetrics(
    consulta,
    serverId
) {
    console.log(
        `[BM] 🔎 Consulta: "${consulta}"`
    );

    const response =
        await axios.get(
            `${BM_API}/players`,
            {
                params: {
                    "filter[search]":
                        consulta,

                    "filter[servers]":
                        serverId,

                    "page[size]": 100,

                    include:
                        "server,identifier"
                },

                headers: {
                    Authorization:
                        `Bearer ${BM_TOKEN}`,

                    "User-Agent":
                        USER_AGENT,

                    Accept:
                        "application/json"
                },

                timeout: 30000
            }
        );

    return Array.isArray(
        response.data?.data
    )
        ? response.data.data
        : [];
}

// =====================================================
// BUSCAR BATTLEMETRICS
// =====================================================

async function buscarEnBattleMetrics(
    nombre,
    guildId,
    candidatosOCR = []
) {
    const serverId =
        await obtenerServidorConfigurado(
            guildId
        );

    console.log(
        `[BM] 🎯 Servidor: ${
            serverId || "NINGUNO"
        }`
    );

    if (!serverId) {
        return {
            encontrados: [],
            error:
                "NO_SERVER_CONFIGURED",
            serverId: null
        };
    }

    if (!BM_TOKEN) {
        console.error(
            "[BM] ❌ Falta BATTLEMETRICS_TOKEN"
        );

        return {
            encontrados: [],
            error: "NO_TOKEN",
            serverId
        };
    }

    const consultas =
        generarConsultasBusqueda(
            nombre,
            candidatosOCR
        );

    console.log(
        "[BM] 🔎 Consultas:",
        consultas
    );

    const todosLosJugadores =
        new Map();

    try {
        // =================================================
        // PRIMERA FASE:
        // RECOPILAR RESULTADOS
        // NO DEVOLVER EL PRIMERO
        // =================================================

        for (
            const consulta
            of consultas
        ) {
            let players = [];

            try {
                players =
                    await consultarBattleMetrics(
                        consulta,
                        serverId
                    );
            } catch (error) {
                const status =
                    error.response?.status;

                console.error(
                    `[BM] ❌ Error buscando "${consulta}":`,
                    status,
                    error.response?.data ||
                        error.message
                );

                if (status === 403) {
                    return {
                        encontrados: [],
                        error: "BM_403",
                        serverId
                    };
                }

                if (status === 401) {
                    return {
                        encontrados: [],
                        error: "BM_401",
                        serverId
                    };
                }

                continue;
            }

            console.log(
                `[BM] 👥 "${consulta}" → ${players.length} resultados`
            );

            for (
                const player
                of players
            ) {
                if (!player?.id) {
                    continue;
                }

                todosLosJugadores.set(
                    String(
                        player.id
                    ),
                    player
                );
            }
        }

        // =================================================
        // SEGUNDA FASE:
        // PUNTUAR TODOS LOS RESULTADOS
        // =================================================

        const puntuados = [];

        for (
            const player
            of todosLosJugadores.values()
        ) {
            const nombreJugador =
                player?.attributes?.name;

            if (!nombreJugador) {
                continue;
            }

            const score =
                puntuarCoincidencia(
                    nombreJugador,
                    consultas
                );

            console.log(
                `[BM] 👤 ${player.id} | "${nombreJugador}" | score=${score}`
            );

            puntuados.push({
                player,
                score
            });
        }

        // =================================================
        // ORDENAR
        // =================================================

        puntuados.sort(
            (a, b) =>
                b.score -
                a.score
        );

        console.log(
            "[BM] 🏆 TOP CANDIDATOS:"
        );

        for (
            const candidato
            of puntuados.slice(0, 10)
        ) {
            console.log(
                `[BM] ⭐ ${candidato.player.id} | "${candidato.player.attributes?.name}" | score=${candidato.score}`
            );
        }

        // =================================================
        // ACEPTAR SOLO COINCIDENCIAS FUERTES
        // =================================================

        const mejor =
            puntuados[0];

        if (
            mejor &&
            mejor.score >= 650
        ) {
            const player =
                mejor.player;

            const nombreJugador =
                player.attributes?.name;

            console.log(
                `[BM] ✅ MEJOR COINCIDENCIA: ${player.id} | "${nombreJugador}" | score=${mejor.score}`
            );

            return {
                encontrados: [
                    {
                        id: String(
                            player.id
                        ),

                        nombre:
                            nombreJugador,

                        atributos:
                            player.attributes ||
                            {}
                    }
                ],

                error: null,
                serverId
            };
        }

        // =================================================
        // NADA SUFICIENTEMENTE BUENO
        // =================================================

        console.log(
            `[BM] ❌ Ningún resultado alcanzó el score mínimo para "${nombre}"`
        );

        return {
            encontrados: [],
            error: null,
            serverId
        };

    } catch (error) {
        const status =
            error.response?.status;

        console.error(
            "[BM] ❌ Error general:",
            status,
            error.response?.data ||
                error.message
        );

        if (status === 403) {
            return {
                encontrados: [],
                error: "BM_403",
                serverId
            };
        }

        if (status === 401) {
            return {
                encontrados: [],
                error: "BM_401",
                serverId
            };
        }

        return {
            encontrados: [],
            error: "BM_ERROR",
            serverId
        };
    }
}

// =====================================================
// EMBED RESULTADO
// =====================================================

function crearEmbedResultado({
    nombreBuscado,
    nombreOCR,
    resultado
}) {
    const embed =
        new EmbedBuilder()
            .setTitle(
                "🎯 Resultado de búsqueda Steam"
            )
            .setDescription(
                `**Nombre buscado:** ${nombreBuscado}`
            );

    if (nombreOCR) {
        embed.addFields({
            name:
                "📸 OCR detectado",

            value:
                `\`${nombreOCR}\``
        });
    }

    if (
        resultado.error ===
        "NO_SERVER_CONFIGURED"
    ) {
        embed.addFields({
            name:
                "⚠️ Servidor no configurado",

            value:
                "No hay un servidor de BattleMetrics configurado para este servidor de Discord."
        });
    }

    else if (
        resultado.error ===
        "NO_TOKEN"
    ) {
        embed.addFields({
            name:
                "⚠️ Token de BattleMetrics",

            value:
                "No se encontró `BATTLEMETRICS_TOKEN` en las variables de entorno."
        });
    }

    else if (
        resultado.error ===
        "BM_403"
    ) {
        embed.addFields({
            name:
                "⚠️ BattleMetrics rechazó la consulta",

            value:
                "BattleMetrics devolvió HTTP 403 al consultar la API de jugadores."
        });
    }

    else if (
        resultado.error ===
        "BM_401"
    ) {
        embed.addFields({
            name:
                "⚠️ Token rechazado",

            value:
                "BattleMetrics devolvió HTTP 401. Revisa `BATTLEMETRICS_TOKEN`."
        });
    }

    else if (
        resultado.error ===
        "BM_ERROR"
    ) {
        embed.addFields({
            name:
                "⚠️ Error de BattleMetrics",

            value:
                "Ocurrió un error al consultar la API de BattleMetrics."
        });
    }

    else if (
        resultado.encontrados?.length
    ) {
        const jugador =
            resultado.encontrados[0];

        embed.addFields({
            name:
                "✅ Jugador encontrado",

            value:
                `**Nombre:** ${jugador.nombre}\n` +
                `**BattleMetrics ID:** \`${jugador.id}\``
        });
    }

    else {
        embed.addFields({
            name:
                "❌ Resultado",

            value:
                `No se encontró **${nombreBuscado}** dentro del servidor de BattleMetrics configurado.`
        });
    }

    if (resultado.serverId) {
        embed.addFields({
            name:
                "🎯 Servidor consultado",

            value:
                `[Abrir servidor en BattleMetrics](https://www.battlemetrics.com/servers/rust/${resultado.serverId})`
        });
    }

    return embed;
}

// =====================================================
// BOTONES OCR
// =====================================================

function crearBotonesOCR() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(
                    "steam_ocr_buscar"
                )
                .setLabel("Buscar")
                .setEmoji("🔎")
                .setStyle(
                    ButtonStyle.Primary
                ),

            new ButtonBuilder()
                .setCustomId(
                    "steam_ocr_corregir"
                )
                .setLabel("Corregir")
                .setEmoji("✏️")
                .setStyle(
                    ButtonStyle.Secondary
                ),

            new ButtonBuilder()
                .setCustomId(
                    "steam_ocr_cancelar"
                )
                .setLabel("Cancelar")
                .setEmoji("❌")
                .setStyle(
                    ButtonStyle.Danger
                )
        );
}

// =====================================================
// EJECUTAR BÚSQUEDA
// =====================================================

async function ejecutarBusqueda(
    interaction,
    nombre,
    nombreOCR = null,
    candidatosOCR = []
) {
    const resultado =
        await buscarEnBattleMetrics(
            nombre,
            interaction.guild.id,
            candidatosOCR
        );

    const embed =
        crearEmbedResultado({
            nombreBuscado:
                nombre,

            nombreOCR,

            resultado
        });

    const jugador =
        resultado.encontrados?.[0];

    const row =
        new ActionRowBuilder();

    if (jugador) {
        row.addComponents(
            new ButtonBuilder()
                .setLabel(
                    "Abrir BattleMetrics"
                )
                .setStyle(
                    ButtonStyle.Link
                )
                .setURL(
                    `https://www.battlemetrics.com/players/${jugador.id}`
                )
        );
    }

    row.addComponents(
        new ButtonBuilder()
            .setLabel(
                "Buscar en SteamID.com"
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

    await interaction.editReply({
        embeds: [embed],
        components: [row]
    });
}

// =====================================================
// COMANDO /STEAM
// =====================================================

module.exports = {

    data:
        new SlashCommandBuilder()
            .setName("steam")
            .setDescription(
                "Busca un jugador de Rust por nombre o captura"
            )

            .addStringOption(
                (option) =>
                    option
                        .setName("nombre")
                        .setDescription(
                            "Nombre del jugador"
                        )
                        .setRequired(false)
            )

            .addAttachmentOption(
                (option) =>
                    option
                        .setName("captura")
                        .setDescription(
                            "Captura donde aparezca el nombre"
                        )
                        .setRequired(false)
            ),

    async execute(interaction) {

        const nombre =
            interaction.options.getString(
                "nombre"
            );

        const captura =
            interaction.options.getAttachment(
                "captura"
            );

        // =================================================
        // NOMBRE DIRECTO
        // =================================================

        if (nombre && !captura) {

            await interaction.deferReply();

            const nombreLimpio =
                normalizarNombre(
                    nombre
                );

            console.log(
                `[STEAM] 🎯 Búsqueda directa: "${nombreLimpio}"`
            );

            await ejecutarBusqueda(
                interaction,
                nombreLimpio,
                null,
                [nombreLimpio]
            );

            return;
        }

        // =================================================
        // SIN DATOS
        // =================================================

        if (!nombre && !captura) {
            return interaction.reply({
                content:
                    "❌ Debes introducir un nombre o adjuntar una captura.",
                ephemeral: true
            });
        }

        // =================================================
        // OCR
        // =================================================

        await interaction.deferReply();

        try {

            console.log(
                "[STEAM] 📸 Descargando captura..."
            );

            const buffer =
                await obtenerImagen(
                    captura.url
                );

            console.log(
                "[STEAM] 🔎 Ejecutando OCR..."
            );

            const ocr =
                await detectarNombreOCR(
                    buffer
                );

            const nombreDetectado =
                ocr.nombre;

            console.log(
                `[STEAM] 📸 OCR principal: "${nombreDetectado || "NADA"}"`
            );

            console.log(
                "[STEAM] 📋 Candidatos OCR:",
                ocr.candidatos
            );

            if (!nombreDetectado) {

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            "🎯 Resultado de búsqueda Steam"
                        )
                        .addFields({
                            name:
                                "📸 OCR",

                            value:
                                "❌ No pude detectar un nombre de jugador."
                        })
                        .setFooter({
                            text:
                                "Prueba con una captura más clara."
                        });

                await interaction.editReply({
                    embeds: [embed],
                    components: []
                });

                return;
            }

            estadosOCR.set(
                interaction.user.id,
                {
                    nombre:
                        nombreDetectado,

                    candidatos:
                        ocr.candidatos,

                    creado:
                        Date.now()
                }
            );

            const embed =
                new EmbedBuilder()
                    .setTitle(
                        "🎯 Resultado de búsqueda Steam"
                    )
                    .setDescription(
                        "Revisa el nombre detectado antes de buscarlo en BattleMetrics."
                    )
                    .addFields({
                        name:
                            "📸 OCR detectado",

                        value:
                            `\`${nombreDetectado}\``
                    });

            await interaction.editReply({
                embeds: [embed],

                components: [
                    crearBotonesOCR()
                ]
            });

        } catch (error) {

            console.error(
                "[STEAM] ❌ Error OCR:",
                error
            );

            await interaction.editReply({
                content:
                    "❌ Ocurrió un error procesando la captura.",

                components: []
            });
        }
    },

    // ===================================================
    // BOTONES / MODAL
    // ===================================================

    async handleInteraction(
        interaction
    ) {

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
                return interaction.reply({
                    content:
                        "❌ La sesión de OCR expiró. Ejecuta `/steam` nuevamente.",
                    ephemeral: true
                });
            }

            await interaction.deferUpdate();

            await ejecutarBusqueda(
                interaction,

                estado.nombre,

                estado.nombre,

                estado.candidatos || []
            );

            estadosOCR.delete(
                interaction.user.id
            );

            return;
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
                return interaction.reply({
                    content:
                        "❌ La sesión de OCR expiró.",
                    ephemeral: true
                });
            }

            const modal =
                new ModalBuilder()
                    .setCustomId(
                        "steam_ocr_modal"
                    )
                    .setTitle(
                        "Corregir nombre"
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
                    .setValue(
                        estado.nombre
                    )
                    .setMaxLength(100);

            modal.addComponents(
                new ActionRowBuilder()
                    .addComponents(
                        input
                    )
            );

            await interaction.showModal(
                modal
            );

            return;
        }

        // =================================================
        // CANCELAR
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

            return;
        }

        // =================================================
        // MODAL
        // =================================================

        if (
            interaction.isModalSubmit() &&
            interaction.customId ===
                "steam_ocr_modal"
        ) {

            const nombre =
                interaction.fields
                    .getTextInputValue(
                        "steam_ocr_nombre"
                    );

            const nombreLimpio =
                normalizarNombre(
                    nombre
                );

            if (!nombreLimpio) {
                return interaction.reply({
                    content:
                        "❌ Debes introducir un nombre válido.",
                    ephemeral: true
                });
            }

            estadosOCR.delete(
                interaction.user.id
            );

            await interaction.deferUpdate();

            await ejecutarBusqueda(
                interaction,

                nombreLimpio,

                nombreLimpio,

                [nombreLimpio]
            );

            return;
        }
    }
};