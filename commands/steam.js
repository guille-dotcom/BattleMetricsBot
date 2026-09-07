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
// CARACTERES DECORATIVOS
// =====================================================

const SIMBOLOS_DECORATIVOS = new Set(
    Array.from(
        `
★☆✦✧✪✫✬✭✮✯✰✵✶✷✸✹✺✻✼✽✾✿
❀❁❂❃❄❅❆❇❈❉❊❋
ツシッソンジヅヮヾゞ
么乂メ彡刃丂乙ム气氷火水雷風
꧁꧂༺༻༼༽『』「」【】《》〈〉〔〕〖〗〘〙〚〛
⟦⟧⟨⟩⟪⟫
<>[]{}()_|~^
!@#$%^&*+=?/\\
`
    )
);

// =====================================================
// MAPA VISUAL
// =====================================================

const MAPA_VISUAL = {
    // CIRÍLICO
    "а": "a",
    "А": "a",
    "б": "b",
    "Б": "b",
    "в": "b",
    "В": "b",
    "г": "g",
    "Г": "g",
    "д": "d",
    "Д": "d",
    "е": "e",
    "Е": "e",
    "ё": "e",
    "Ё": "e",
    "ж": "zh",
    "Ж": "zh",
    "з": "z",
    "З": "z",
    "и": "i",
    "И": "i",
    "й": "i",
    "Й": "i",
    "к": "k",
    "К": "k",
    "л": "l",
    "Л": "l",
    "м": "m",
    "М": "m",
    "н": "n",
    "Н": "n",
    "о": "o",
    "О": "o",
    "п": "p",
    "П": "p",
    "р": "p",
    "Р": "p",
    "с": "c",
    "С": "c",
    "т": "t",
    "Т": "t",
    "у": "y",
    "У": "y",
    "ф": "f",
    "Ф": "f",
    "х": "x",
    "Х": "x",
    "ц": "c",
    "Ц": "c",
    "ч": "ch",
    "Ч": "ch",
    "ш": "sh",
    "Ш": "sh",
    "щ": "sh",
    "Щ": "sh",
    "ы": "y",
    "Ы": "y",
    "э": "e",
    "Э": "e",
    "ю": "yu",
    "Ю": "yu",
    "я": "ya",
    "Я": "ya",

    "і": "i",
    "І": "i",
    "ї": "i",
    "Ї": "i",
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
    "Ӏ": "l",

    // LEETSPEAK
    "0": "o",
    "1": "i",
    "2": "z",
    "3": "e",
    "4": "a",
    "5": "s",
    "6": "g",
    "7": "t",
    "8": "b",
    "9": "g"
};

// =====================================================
// CARACTERES ESTILIZADOS
// =====================================================

const MAPA_ESTILIZADO = {
    // Superscript
    "ᵃ": "a",
    "ᵇ": "b",
    "ᶜ": "c",
    "ᵈ": "d",
    "ᵉ": "e",
    "ᶠ": "f",
    "ᵍ": "g",
    "ʰ": "h",
    "ⁱ": "i",
    "ʲ": "j",
    "ᵏ": "k",
    "ˡ": "l",
    "ᵐ": "m",
    "ⁿ": "n",
    "ᵒ": "o",
    "ᵖ": "p",
    "ʳ": "r",
    "ˢ": "s",
    "ᵗ": "t",
    "ᵘ": "u",
    "ᵛ": "v",
    "ʷ": "w",
    "ˣ": "x",
    "ʸ": "y",
    "ᶻ": "z",

    // Upper small / modifier
    "ᴬ": "a",
    "ᴮ": "b",
    "ᴰ": "d",
    "ᴱ": "e",
    "ᴳ": "g",
    "ᴴ": "h",
    "ᴵ": "i",
    "ᴶ": "j",
    "ᴷ": "k",
    "ᴸ": "l",
    "ᴹ": "m",
    "ᴺ": "n",
    "ᴼ": "o",
    "ᴾ": "p",
    "ᴿ": "r",
    "ᵀ": "t",
    "ᵁ": "u",
    "ⱽ": "v",
    "ᵂ": "w",

    // Small caps
    "ᴀ": "a",
    "ʙ": "b",
    "ᴄ": "c",
    "ᴅ": "d",
    "ᴇ": "e",
    "ꜰ": "f",
    "ɢ": "g",
    "ʜ": "h",
    "ɪ": "i",
    "ᴊ": "j",
    "ᴋ": "k",
    "ʟ": "l",
    "ᴍ": "m",
    "ɴ": "n",
    "ᴏ": "o",
    "ᴘ": "p",
    "ʀ": "r",
    "s": "s",
    "ᴛ": "t",
    "ᴜ": "u",
    "ᴠ": "v",
    "ᴡ": "w",
    "x": "x",
    "ʏ": "y",
    "ᴢ": "z",

    // IPA
    "ɐ": "a",
    "ɑ": "a",
    "ɒ": "a",
    "ɓ": "b",
    "ƈ": "c",
    "ɗ": "d",
    "ɛ": "e",
    "ƒ": "f",
    "ɠ": "g",
    "ɦ": "h",
    "ɨ": "i",
    "ʝ": "j",
    "ƙ": "k",
    "ɭ": "l",
    "ɱ": "m",
    "ŋ": "n",
    "ɵ": "o",
    "ƥ": "p",
    "ɍ": "r",
    "ʂ": "s",
    "ŧ": "t",
    "ʉ": "u",
    "ʋ": "v",
    "ɯ": "w",
    "ẋ": "x",
    "ƴ": "y",
    "ȥ": "z"
};

// =====================================================
// PREFIJOS ESTILIZADOS
// =====================================================

const PREFIJOS_ESTILIZADOS = new Set([
    "ᵃ", "ᵇ", "ᶜ", "ᵈ", "ᵉ", "ᶠ", "ᵍ", "ʰ",
    "ⁱ", "ʲ", "ᵏ", "ˡ", "ᵐ", "ⁿ", "ᵒ", "ᵖ",
    "ʳ", "ˢ", "ᵗ", "ᵘ", "ᵛ", "ʷ", "ˣ", "ʸ", "ᶻ",

    "ᴬ", "ᴮ", "ᴰ", "ᴱ", "ᴳ", "ᴴ", "ᴵ", "ᴶ",
    "ᴷ", "ᴸ", "ᴹ", "ᴺ", "ᴼ", "ᴾ", "ᴿ", "ᵀ",
    "ᵁ", "ⱽ", "ᵂ",

    "ᴀ", "ʙ", "ᴄ", "ᴅ", "ᴇ", "ꜰ", "ɢ", "ʜ",
    "ɪ", "ᴊ", "ᴋ", "ʟ", "ᴍ", "ɴ", "ᴏ", "ᴘ",
    "ʀ", "ᴛ", "ᴜ", "ᴠ", "ᴡ", "ʏ", "ᴢ",

    "ɐ", "ɑ", "ɒ", "ɓ", "ƈ", "ɗ", "ɛ", "ƒ",
    "ɠ", "ɦ", "ɨ", "ʝ", "ƙ", "ɭ", "ɱ", "ŋ",
    "ɵ", "ƥ", "ɍ", "ʂ", "ŧ", "ʉ", "ʋ", "ɯ",
    "ẋ", "ƴ", "ȥ"
]);

// =====================================================
// LIMPIAR OCR
// =====================================================

function limpiarOCR(texto) {
    if (!texto) return "";

    return String(texto)
        .replace(/\r/g, " ")
        .replace(/\n/g, " ")
        .replace(/\t/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// =====================================================
// NORMALIZACIÓN VISUAL
// =====================================================

function normalizarVisual(texto) {
    if (!texto) return "";

    let resultado = "";

    for (const caracter of String(texto).normalize("NFKC")) {
        if (MAPA_ESTILIZADO[caracter]) {
            resultado += MAPA_ESTILIZADO[caracter];
            continue;
        }

        if (MAPA_VISUAL[caracter]) {
            resultado += MAPA_VISUAL[caracter];
            continue;
        }

        resultado += caracter.toLowerCase();
    }

    return resultado
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

// =====================================================
// NORMALIZACIÓN OCR
// =====================================================

function normalizarOCR(texto) {
    if (!texto) return "";

    return normalizarVisual(
        limpiarOCR(texto)
    );
}

// =====================================================
// QUITAR DECORACIÓN
// =====================================================

function quitarDecoracion(texto) {
    if (!texto) return "";

    let resultado = "";

    for (const caracter of String(texto)) {
        if (SIMBOLOS_DECORATIVOS.has(caracter)) {
            continue;
        }

        resultado += caracter;
    }

    return resultado
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/\s+/g, "");
}

// =====================================================
// COMPACTAR NOMBRE
// =====================================================

function compactarNombre(texto) {
    if (!texto) return "";

    return normalizarVisual(
        quitarDecoracion(texto)
    )
        .replace(/[^a-z0-9]/gi, "")
        .toLowerCase();
}

// =====================================================
// OBTENER NÚCLEO
// =====================================================

function obtenerNucleoNombre(texto) {
    if (!texto) return "";

    let original = String(texto)
        .replace(/[\u200B-\u200D\uFEFF]/g, "");

    let limpio = "";

    for (const caracter of original) {
        if (SIMBOLOS_DECORATIVOS.has(caracter)) {
            continue;
        }

        limpio += caracter;
    }

    limpio = limpio.trim();

    if (!limpio) return "";

    const caracteres = Array.from(limpio);

    let inicio = 0;

    while (
        inicio < caracteres.length &&
        PREFIJOS_ESTILIZADOS.has(caracteres[inicio])
    ) {
        inicio++;
    }

    const nucleo = caracteres
        .slice(inicio)
        .join("");

    return compactarNombre(nucleo);
}

// =====================================================
// VARIANTES
// =====================================================

function obtenerVariantesNombre(texto) {
    if (!texto) return [];

    const variantes = new Set();

    const original = String(texto).trim();

    if (original) {
        variantes.add(
            original.toLowerCase()
        );
    }

    const sinDecoracion =
        quitarDecoracion(original);

    if (sinDecoracion) {
        variantes.add(
            sinDecoracion.toLowerCase()
        );
    }

    const visual =
        normalizarVisual(
            sinDecoracion
        );

    if (visual) {
        variantes.add(
            visual.toLowerCase()
        );
    }

    const compacto =
        compactarNombre(original);

    if (compacto) {
        variantes.add(compacto);
    }

    const nucleo =
        obtenerNucleoNombre(original);

    if (nucleo) {
        variantes.add(nucleo);
    }

    return Array.from(variantes);
}

// =====================================================
// LEVENSHTEIN
// =====================================================

function levenshtein(a, b) {
    a = String(a || "");
    b = String(b || "");

    const matrix = Array.from(
        {
            length: b.length + 1
        },
        () =>
            new Array(
                a.length + 1
            ).fill(0)
    );

    for (let i = 0; i <= b.length; i++) {
        matrix[i][0] = i;
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (
                b[i - 1] ===
                a[j - 1]
            ) {
                matrix[i][j] =
                    matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + 1
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

// =====================================================
// SIMILITUD
// =====================================================

function similarity(a, b) {
    a = compactarNombre(a);
    b = compactarNombre(b);

    if (!a || !b) return 0;

    if (a === b) return 1;

    const maxLength =
        Math.max(
            a.length,
            b.length
        );

    if (!maxLength) return 1;

    return 1 - (
        levenshtein(a, b) /
        maxLength
    );
}

// =====================================================
// COINCIDENCIA CONSECUTIVA
// =====================================================

function coincidenciaConsecutiva(a, b) {
    a = compactarNombre(a);
    b = compactarNombre(b);

    if (!a || !b) return 0;

    let mejor = 0;

    for (let i = 0; i < a.length; i++) {
        let contador = 0;

        while (
            i + contador < a.length &&
            i + contador < b.length &&
            a[i + contador] ===
                b[i + contador]
        ) {
            contador++;
        }

        if (contador > mejor) {
            mejor = contador;
        }
    }

    return mejor;
}

// =====================================================
// GENERAR CONSULTAS
// =====================================================

function generarConsultas(
    textos,
    tipo = "ocr"
) {
    const mapa = new Map();

    function agregar(
        texto,
        prioridad = 0
    ) {
        if (!texto) return;

        const limpio =
            limpiarOCR(texto);

        if (!limpio) return;

        const clave =
            limpio.toLowerCase();

        const existente =
            mapa.get(clave);

        if (
            !existente ||
            prioridad >
                existente.prioridad
        ) {
            mapa.set(
                clave,
                {
                    texto: limpio,
                    tipo,
                    prioridad
                }
            );
        }
    }

    for (const texto of textos || []) {
        if (!texto) continue;

        const raw =
            limpiarOCR(texto);

        if (!raw) continue;

        agregar(
            raw,
            100
        );

        const sinDecoracion =
            quitarDecoracion(raw);

        if (sinDecoracion) {
            agregar(
                sinDecoracion,
                95
            );
        }

        const visual =
            normalizarVisual(
                sinDecoracion
            );

        if (visual) {
            agregar(
                visual,
                90
            );
        }

        const compacto =
            compactarNombre(raw);

        if (compacto) {
            agregar(
                compacto,
                85
            );
        }

        // ---------------------------------------------
        // QUITAR POSIBLE RUIDO OCR DEL PRINCIPIO
        // ---------------------------------------------

        const variantesBase = [
            raw,
            sinDecoracion,
            visual
        ];

        for (
            const base of variantesBase
        ) {
            if (!base) continue;

            const chars =
                Array.from(base);

            // Quitar 1 carácter
            if (chars.length >= 5) {
                const sinUno =
                    chars
                        .slice(1)
                        .join("");

                agregar(
                    sinUno,
                    80
                );

                const compactoSinUno =
                    compactarNombre(
                        sinUno
                    );

                if (compactoSinUno) {
                    agregar(
                        compactoSinUno,
                        75
                    );
                }
            }

            // Quitar 2 caracteres
            if (chars.length >= 6) {
                const sinDos =
                    chars
                        .slice(2)
                        .join("");

                agregar(
                    sinDos,
                    70
                );

                const compactoSinDos =
                    compactarNombre(
                        sinDos
                    );

                if (compactoSinDos) {
                    agregar(
                        compactoSinDos,
                        65
                    );
                }
            }
        }
    }

    return Array.from(
        mapa.values()
    );
}

// =====================================================
// PREPROCESAMIENTO OCR
// =====================================================

async function prepararImagenOCR(
    buffer
) {
    return sharp(buffer)
        .resize({
            width: 1800,
            withoutEnlargement: false
        })
        .grayscale()
        .normalize()
        .sharpen()
        .png()
        .toBuffer();
}

// =====================================================
// OCR
// =====================================================

async function ejecutarOCR(
    buffer
) {
    let worker = null;

    try {
        const imagenProcesada =
            await prepararImagenOCR(
                buffer
            );

        worker =
            await createWorker(
                "eng+rus"
            );

        const resultado =
            await worker.recognize(
                imagenProcesada
            );

        return limpiarOCR(
            resultado?.data?.text || ""
        );

    } catch (error) {
        console.error(
            "[OCR] Error:",
            error
        );

        return "";

    } finally {
        if (worker) {
            try {
                await worker.terminate();
            } catch (_) {}
        }
    }
}

// =====================================================
// BATTLEMETRICS
// =====================================================

async function consultarBattleMetrics(
    consulta,
    serverId
) {
    if (!serverId) {
        throw new Error(
            "No hay serverId configurado."
        );
    }

    if (!BM_TOKEN) {
        throw new Error(
            "Falta BATTLEMETRICS_TOKEN en .env"
        );
    }

    const params = {
        "filter[search]": consulta,
        "filter[servers]":
            String(serverId),
        "page[size]": 100
    };

    console.log(
        `[BM] Buscando "${consulta}" SOLO en servidor ${serverId}`
    );

    const response =
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
        response.data?.data
    )
        ? response.data.data
        : [];
}

// =====================================================
// NOMBRE BM
// =====================================================

function obtenerNombreBM(
    player
) {
    return (
        player?.attributes?.name ||
        player?.attributes?.identifier ||
        player?.attributes?.username ||
        ""
    );
}

// =====================================================
// ID BM
// =====================================================

function obtenerIdBM(
    player
) {
    return String(
        player?.id || ""
    );
}

// =====================================================
// PUNTUAR NOMBRE
// =====================================================

function puntuarNombre(
    nombreJugador,
    consultas
) {
    if (!nombreJugador) {
        return {
            score: 0,
            motivo: "sin nombre"
        };
    }

    const variantesJugador =
        obtenerVariantesNombre(
            nombreJugador
        );

    const compactoJugador =
        compactarNombre(
            nombreJugador
        );

    const nucleoJugador =
        obtenerNucleoNombre(
            nombreJugador
        );

    let mejorScore = 0;
    let mejorMotivo =
        "sin coincidencia";

    for (
        const consultaInfo of consultas
    ) {
        const consulta =
            consultaInfo?.texto || "";

        const tipo =
            consultaInfo?.tipo ||
            "ocr";

        const prioridad =
            consultaInfo?.prioridad ||
            0;

        if (!consulta) continue;

        const compactoConsulta =
            compactarNombre(
                consulta
            );

        const nucleoConsulta =
            obtenerNucleoNombre(
                consulta
            );

        if (!compactoConsulta) {
            continue;
        }

        const longitudConsulta =
            compactoConsulta.length;

        const consultaOCRMuyCorta =
            tipo === "ocr" &&
            longitudConsulta <= 3;

        // =================================================
        // EXACTO ORIGINAL
        // =================================================

        const originalLower =
            String(nombreJugador)
                .toLowerCase();

        const consultaLower =
            String(consulta)
                .toLowerCase();

        if (
            originalLower ===
            consultaLower
        ) {
            const score =
                consultaOCRMuyCorta
                    ? 350
                    : (
                        tipo === "manual"
                            ? 3700
                            : 3500
                    );

            if (
                score > mejorScore
            ) {
                mejorScore = score;

                mejorMotivo =
                    consultaOCRMuyCorta
                        ? "coincidencia exacta OCR corta"
                        : "nombre exacto";
            }
        }

        // =================================================
        // EXACTO SIN DECORACIÓN
        // =================================================

        const sinDecoracionJugador =
            compactarNombre(
                quitarDecoracion(
                    nombreJugador
                )
            );

        if (
            sinDecoracionJugador &&
            sinDecoracionJugador ===
                compactoConsulta
        ) {
            const score =
                consultaOCRMuyCorta
                    ? 300
                    : (
                        tipo === "manual"
                            ? 3600
                            : 3350
                    );

            if (
                score > mejorScore
            ) {
                mejorScore = score;

                mejorMotivo =
                    "coincidencia sin decoración";
            }
        }

        // =================================================
        // EXACTO VISUAL
        // =================================================

        const visualJugador =
            normalizarVisual(
                quitarDecoracion(
                    nombreJugador
                )
            );

        if (
            visualJugador &&
            visualJugador ===
                compactoConsulta
        ) {
            const score =
                consultaOCRMuyCorta
                    ? 280
                    : (
                        tipo === "manual"
                            ? 3500
                            : 3250
                    );

            if (
                score > mejorScore
            ) {
                mejorScore = score;

                mejorMotivo =
                    "coincidencia visual exacta";
            }
        }

        // =================================================
        // EXACTO NORMALIZADO
        // =================================================

        if (
            compactoJugador &&
            compactoJugador ===
                compactoConsulta
        ) {
            const score =
                consultaOCRMuyCorta
                    ? 250
                    : 3150;

            if (
                score > mejorScore
            ) {
                mejorScore = score;

                mejorMotivo =
                    "coincidencia OCR exacta";
            }
        }

        // =================================================
        // NÚCLEO DEL NOMBRE
        // =================================================

        if (
            nucleoJugador &&
            nucleoConsulta &&
            nucleoJugador.length >= 4 &&
            nucleoConsulta.length >= 4
        ) {
            // ---------------------------------------------
            // Núcleo exacto
            // ---------------------------------------------

            if (
                nucleoJugador ===
                nucleoConsulta
            ) {
                const score =
                    3400 +
                    Math.min(
                        250,
                        nucleoJugador.length * 10
                    );

                if (
                    score > mejorScore
                ) {
                    mejorScore = score;

                    mejorMotivo =
                        "núcleo del nombre exacto";
                }
            }

            // ---------------------------------------------
            // Ruido OCR al principio
            //
            // wFOX1C
            // foxic
            // ---------------------------------------------

            if (
                compactoConsulta.length >
                    nucleoJugador.length &&
                compactoConsulta.endsWith(
                    nucleoJugador
                )
            ) {
                const diferencia =
                    compactoConsulta.length -
                    nucleoJugador.length;

                if (
                    diferencia >= 1 &&
                    diferencia <= 2
                ) {
                    const score =
                        3200 +
                        Math.min(
                            200,
                            nucleoJugador.length * 15
                        ) -
                        diferencia * 100;

                    if (
                        score > mejorScore
                    ) {
                        mejorScore =
                            score;

                        mejorMotivo =
                            "núcleo exacto con ruido OCR inicial";
                    }
                }
            }

            // ---------------------------------------------
            // Prefijo estilizado
            //
            // nrfoxic
            // foxic
            // ---------------------------------------------

            if (
                compactoJugador.endsWith(
                    nucleoConsulta
                )
            ) {
                const diferencia =
                    compactoJugador.length -
                    nucleoConsulta.length;

                if (
                    diferencia >= 1 &&
                    diferencia <= 3
                ) {
                    const score =
                        3150 +
                        Math.min(
                            200,
                            nucleoConsulta.length * 15
                        ) -
                        diferencia * 100;

                    if (
                        score > mejorScore
                    ) {
                        mejorScore =
                            score;

                        mejorMotivo =
                            "núcleo exacto con prefijo estilizado";
                    }
                }
            }
        }

        // =================================================
        // VARIANTES
        // =================================================

        for (
            const variante of variantesJugador
        ) {
            if (!variante) continue;

            // ---------------------------------------------
            // Igualdad
            // ---------------------------------------------

            if (
                variante ===
                compactoConsulta
            ) {
                if (
                    !consultaOCRMuyCorta &&
                    longitudConsulta >= 4
                ) {
                    const score = 3000;

                    if (
                        score > mejorScore
                    ) {
                        mejorScore =
                            score;

                        mejorMotivo =
                            "variante exacta";
                    }
                }
            }

            // ---------------------------------------------
            // SUBSTRING
            // ---------------------------------------------

            if (
                longitudConsulta >= 4 &&
                variante.length >= 4
            ) {
                if (
                    variante.includes(
                        compactoConsulta
                    )
                ) {
                    const porcentaje =
                        compactoConsulta.length /
                        variante.length;

                    if (
                        porcentaje >= 0.65
                    ) {
                        const score =
                            2000 +
                            Math.round(
                                porcentaje * 700
                            );

                        if (
                            score > mejorScore
                        ) {
                            mejorScore =
                                score;

                            mejorMotivo =
                                "coincidencia contenida";
                        }
                    }
                }

                if (
                    compactoConsulta.includes(
                        variante
                    )
                ) {
                    const porcentaje =
                        variante.length /
                        compactoConsulta.length;

                    if (
                        porcentaje >= 0.65
                    ) {
                        const score =
                            1950 +
                            Math.round(
                                porcentaje * 650
                            );

                        if (
                            score > mejorScore
                        ) {
                            mejorScore =
                                score;

                            mejorMotivo =
                                "nombre contenido en OCR";
                        }
                    }
                }
            }

            // ---------------------------------------------
            // SIMILITUD
            // ---------------------------------------------

            if (
                longitudConsulta >= 4 &&
                variante.length >= 4
            ) {
                const sim =
                    similarity(
                        variante,
                        compactoConsulta
                    );

                if (sim >= 0.90) {
                    const score =
                        2700 +
                        Math.round(
                            sim * 350
                        );

                    if (
                        score > mejorScore
                    ) {
                        mejorScore =
                            score;

                        mejorMotivo =
                            `similitud alta (${Math.round(sim * 100)}%)`;
                    }

                } else if (
                    sim >= 0.80
                ) {
                    const score =
                        2300 +
                        Math.round(
                            sim * 300
                        );

                    if (
                        score > mejorScore
                    ) {
                        mejorScore =
                            score;

                        mejorMotivo =
                            `similitud buena (${Math.round(sim * 100)}%)`;
                    }

                } else if (
                    sim >= 0.70
                ) {
                    const score =
                        1900 +
                        Math.round(
                            sim * 250
                        );

                    if (
                        score > mejorScore
                    ) {
                        mejorScore =
                            score;

                        mejorMotivo =
                            `similitud (${Math.round(sim * 100)}%)`;
                    }
                }
            }

            // ---------------------------------------------
            // SECUENCIA
            // ---------------------------------------------

            if (
                longitudConsulta >= 4
            ) {
                const secuencia =
                    coincidenciaConsecutiva(
                        variante,
                        compactoConsulta
                    );

                if (
                    secuencia >= 4
                ) {
                    const score =
                        1000 +
                        secuencia * 100;

                    if (
                        score > mejorScore
                    ) {
                        mejorScore =
                            score;

                        mejorMotivo =
                            `secuencia ${secuencia}`;
                    }
                }
            }
        }

        // =================================================
        // PENALIZAR CANDIDATOS MUY CORTOS
        // =================================================

        const compactoCandidato =
            compactarNombre(
                nombreJugador
            );

        if (
            compactoCandidato.length <= 2 &&
            consultaOCRMuyCorta
        ) {
            mejorScore = Math.min(
                mejorScore,
                150
            );

            mejorMotivo =
                "candidato demasiado corto para OCR";
        }

        // =================================================
        // BONUS LONGITUD
        // =================================================

        if (
            mejorScore > 0 &&
            longitudConsulta >= 5 &&
            compactoCandidato.length >= 5
        ) {
            const diferenciaLongitud =
                Math.abs(
                    compactoCandidato.length -
                    longitudConsulta
                );

            if (
                diferenciaLongitud === 0
            ) {
                mejorScore += 120;

            } else if (
                diferenciaLongitud === 1
            ) {
                mejorScore += 80;

            } else if (
                diferenciaLongitud === 2
            ) {
                mejorScore += 40;
            }
        }

        // =================================================
        // BONUS PRIORIDAD
        // =================================================

        if (
            mejorScore > 0 &&
            longitudConsulta >= 5
        ) {
            mejorScore += Math.min(
                100,
                prioridad
            );
        }
    }

    return {
        score: mejorScore,
        motivo: mejorMotivo
    };
}

// =====================================================
// BUSCAR JUGADOR
// =====================================================

async function buscarJugador({
    consultas,
    serverId
}) {
    const jugadores = new Map();

    for (
        const consultaInfo of consultas
    ) {
        const consulta =
            consultaInfo?.texto;

        if (!consulta) continue;

        try {
            const resultados =
                await consultarBattleMetrics(
                    consulta,
                    serverId
                );

            console.log(
                `[BM] "${consulta}" -> ${resultados.length} resultados`
            );

            for (
                const jugador of resultados
            ) {
                const id =
                    obtenerIdBM(
                        jugador
                    );

                if (!id) continue;

                if (
                    !jugadores.has(id)
                ) {
                    jugadores.set(
                        id,
                        jugador
                    );
                }
            }

        } catch (error) {
            console.error(
                `[BM] Error buscando "${consulta}":`,
                error?.response?.status ||
                error?.message ||
                error
            );
        }
    }

    const candidatos = [];

    for (
        const jugador of jugadores.values()
    ) {
        const nombre =
            obtenerNombreBM(
                jugador
            );

        if (!nombre) continue;

        const resultado =
            puntuarNombre(
                nombre,
                consultas
            );

        if (
            resultado.score <= 0
        ) {
            continue;
        }

        candidatos.push({
            jugador,
            nombre,
            score:
                resultado.score,
            motivo:
                resultado.motivo
        });
    }

    candidatos.sort(
        (a, b) => {
            if (
                b.score !==
                a.score
            ) {
                return (
                    b.score -
                    a.score
                );
            }

            const longitudA =
                compactarNombre(
                    a.nombre
                ).length;

            const longitudB =
                compactarNombre(
                    b.nombre
                ).length;

            return (
                longitudB -
                longitudA
            );
        }
    );

    console.log(
        "[BM] TOP CANDIDATOS:"
    );

    candidatos
        .slice(0, 15)
        .forEach(
            (candidato, index) => {
                console.log(
                    `${index + 1}. ${candidato.nombre} | ` +
                    `ID ${obtenerIdBM(candidato.jugador)} | ` +
                    `Score ${candidato.score} | ` +
                    `${candidato.motivo}`
                );
            }
        );

    return candidatos[0] || null;
}

// =====================================================
// SLASH COMMAND
// =====================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName("steam")
        .setDescription(
            "Busca un jugador en BattleMetrics usando nombre o captura OCR."
        )
        .addStringOption(
            option =>
                option
                    .setName("nombre")
                    .setDescription(
                        "Nombre del jugador"
                    )
                    .setRequired(false)
        )
        .addAttachmentOption(
            option =>
                option
                    .setName("imagen")
                    .setDescription(
                        "Captura donde aparece el nombre"
                    )
                    .setRequired(false)
        ),

    async execute(interaction) {
        // =================================================
        // DEFER INMEDIATO
        // =================================================

        await interaction.deferReply();

        try {
            console.log(
                "\n======================================"
            );

            console.log(
                "[STEAM] INICIANDO /steam"
            );

            // =================================================
            // CONFIGURACIÓN
            // =================================================

            const config =
                await ServerConfig.findOne({
                    guildId:
                        interaction.guildId
                });

            if (!config) {
                return interaction.editReply({
                    content:
                        "❌ Este servidor no tiene configuración guardada."
                });
            }

            const serverId =
                config.battleMetricsServerId;

            if (!serverId) {
                return interaction.editReply({
                    content:
                        "❌ Este servidor no tiene un BattleMetrics Server ID configurado."
                });
            }

            console.log(
                `[STEAM] BattleMetrics Server ID: ${serverId}`
            );

            // =================================================
            // INPUT
            // =================================================

            const nombreIngresado =
                interaction.options.getString(
                    "nombre"
                );

            const imagen =
                interaction.options.getAttachment(
                    "imagen"
                );

            let textoOCR = "";

            // =================================================
            // OCR
            // =================================================

            if (imagen) {
                console.log(
                    "[STEAM] Imagen recibida:"
                );

                console.log(
                    imagen.url
                );

                try {
                    const response =
                        await axios.get(
                            imagen.url,
                            {
                                responseType:
                                    "arraybuffer",
                                timeout:
                                    20000
                            }
                        );

                    textoOCR =
                        await ejecutarOCR(
                            Buffer.from(
                                response.data
                            )
                        );

                    console.log(
                        "[OCR] Texto detectado:"
                    );

                    console.log(
                        textoOCR ||
                        "(vacío)"
                    );

                } catch (error) {
                    console.error(
                        "[OCR] Error descargando/procesando imagen:",
                        error
                    );
                }
            }

            // =================================================
            // TEXTOS OCR
            // =================================================

            const textosOCR = [];

            if (textoOCR) {
                const lineas =
                    textoOCR
                        .split(/\s+/)
                        .map(
                            x =>
                                x.trim()
                        )
                        .filter(Boolean);

                for (
                    const linea of lineas
                ) {
                    textosOCR.push(
                        linea
                    );
                }

                if (
                    textoOCR.trim()
                ) {
                    textosOCR.push(
                        textoOCR.trim()
                    );
                }
            }

            // =================================================
            // CONSULTAS
            // =================================================

            const consultas = [];

            if (nombreIngresado) {
                const manuales =
                    generarConsultas(
                        [nombreIngresado],
                        "manual"
                    );

                consultas.push(
                    ...manuales
                );
            }

            if (
                textosOCR.length
            ) {
                const ocr =
                    generarConsultas(
                        textosOCR,
                        "ocr"
                    );

                consultas.push(
                    ...ocr
                );
            }

            // =================================================
            // DEDUPLICAR
            // =================================================

            const mapaConsultas =
                new Map();

            for (
                const consulta of consultas
            ) {
                const key =
                    `${consulta.tipo}:${consulta.texto.toLowerCase()}`;

                const existente =
                    mapaConsultas.get(
                        key
                    );

                if (
                    !existente ||
                    consulta.prioridad >
                        existente.prioridad
                ) {
                    mapaConsultas.set(
                        key,
                        consulta
                    );
                }
            }

            const consultasFinales =
                Array.from(
                    mapaConsultas.values()
                );

            console.log(
                "[STEAM] CONSULTAS GENERADAS:"
            );

            consultasFinales.forEach(
                consulta => {
                    console.log(
                        `- [${consulta.tipo}] ${consulta.texto} | prioridad ${consulta.prioridad}`
                    );
                }
            );

            // =================================================
            // VALIDAR
            // =================================================

            if (
                !nombreIngresado &&
                !textoOCR
            ) {
                return interaction.editReply({
                    content:
                        "❌ No se pudo detectar ningún nombre. Escribe un nombre o adjunta una captura."
                });
            }

            if (
                !consultasFinales.length
            ) {
                return interaction.editReply({
                    content:
                        "❌ No se pudo generar una búsqueda válida."
                });
            }

            // =================================================
            // BUSCAR
            // =================================================

            console.log(
                "[STEAM] BUSCANDO EN BATTLEMETRICS..."
            );

            const encontrado =
                await buscarJugador({
                    consultas:
                        consultasFinales,
                    serverId
                });

            if (!encontrado) {
                console.log(
                    "[STEAM] No se encontró coincidencia."
                );

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            "🎯 Resultado de búsqueda Steam"
                        )
                        .setDescription(
                            "No encontré una coincidencia suficientemente fuerte en el servidor configurado de BattleMetrics."
                        )
                        .addFields(
                            {
                                name:
                                    "📸 OCR detectado",
                                value:
                                    `\`${textoOCR || "No disponible"}\``
                            },
                            {
                                name:
                                    "🔎 Nombre buscado",
                                value:
                                    `\`${nombreIngresado || "Usando OCR"}\``
                            },
                            {
                                name:
                                    "🖥️ Servidor",
                                value:
                                    `\`${serverId}\``
                            }
                        );

                return interaction.editReply({
                    embeds: [embed]
                });
            }

            // =================================================
            // RESULTADO
            // =================================================

            const jugador =
                encontrado.jugador;

            const nombreJugador =
                encontrado.nombre;

            const bmId =
                obtenerIdBM(
                    jugador
                );

            console.log(
                "[STEAM] JUGADOR ENCONTRADO:"
            );

            console.log(
                `Nombre: ${nombreJugador}`
            );

            console.log(
                `ID: ${bmId}`
            );

            console.log(
                `Score: ${encontrado.score}`
            );

            console.log(
                `Motivo: ${encontrado.motivo}`
            );

            // =================================================
            // URLS
            // =================================================

            const bmPlayerUrl =
                `https://www.battlemetrics.com/players/${encodeURIComponent(
                    bmId
                )}`;

            const bmServerUrl =
                `https://www.battlemetrics.com/servers/${encodeURIComponent(
                    String(serverId)
                )}`;

            const steamSearchUrl =
                `https://www.steamid.com/search?q=${encodeURIComponent(
                    nombreJugador
                )}`;

            // =================================================
            // EMBED
            // =================================================

            const embed =
                new EmbedBuilder()
                    .setTitle(
                        "🎯 Resultado de búsqueda Steam"
                    )
                    .setDescription(
                        "Revisa el nombre detectado antes de buscarlo en BattleMetrics."
                    )
                    .addFields(
                        {
                            name:
                                "📸 OCR detectado",
                            value:
                                `\`${textoOCR || "No se utilizó OCR"}\``
                        },
                        {
                            name:
                                "🔎 Nombre buscado",
                            value:
                                `\`${nombreIngresado || "Detectado por OCR"}\``
                        },
                        {
                            name:
                                "👤 Jugador encontrado",
                            value:
                                `\`${nombreJugador}\``
                        },
                        {
                            name:
                                "🆔 BattleMetrics ID",
                            value:
                                `\`${bmId}\``
                        },
                        {
                            name:
                                "🖥️ Servidor",
                            value:
                                `\`${serverId}\``
                        },
                        {
                            name:
                                "🎯 Coincidencia",
                            value:
                                `${encontrado.score} — ${encontrado.motivo}`
                        }
                    );

            // =================================================
            // BOTONES
            // =================================================

            const row =
                new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel(
                                "BattleMetrics"
                            )
                            .setStyle(
                                ButtonStyle.Link
                            )
                            .setURL(
                                bmPlayerUrl
                            ),

                        new ButtonBuilder()
                            .setLabel(
                                "SteamID.com"
                            )
                            .setStyle(
                                ButtonStyle.Link
                            )
                            .setURL(
                                steamSearchUrl
                            ),

                        new ButtonBuilder()
                            .setLabel(
                                "Servidor BM"
                            )
                            .setStyle(
                                ButtonStyle.Link
                            )
                            .setURL(
                                bmServerUrl
                            )
                    );

            // =================================================
            // RESPUESTA
            // =================================================

            await interaction.editReply({
                embeds: [embed],
                components: [row]
            });

            console.log(
                "[STEAM] /steam terminado correctamente."
            );

            console.log(
                "======================================\n"
            );

        } catch (error) {
            console.error(
                "[STEAM] ERROR:",
                error
            );

            try {
                await interaction.editReply({
                    content:
                        "❌ Ocurrió un error al realizar la búsqueda.",
                    embeds: [],
                    components: []
                });
            } catch (editError) {
                console.error(
                    "[STEAM] Error enviando respuesta de error:",
                    editError
                );
            }
        }
    }
};