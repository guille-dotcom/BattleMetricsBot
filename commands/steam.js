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

    for (const caracter of String(texto)) {
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
        .normalize("NFKC")
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
// COMPACTAR
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
// NÚCLEO
// =====================================================

function obtenerNucleoNombre(texto) {
    if (!texto) return "";

    let limpio = "";

    for (const caracter of String(texto)) {
        if (SIMBOLOS_DECORATIVOS.has(caracter)) {
            continue;
        }

        limpio += caracter;
    }

    limpio = limpio.trim();

    if (!limpio) return "";

    const caracteres =
        Array.from(limpio);

    let inicio = 0;

    while (
        inicio < caracteres.length &&
        PREFIJOS_ESTILIZADOS.has(
            caracteres[inicio]
        )
    ) {
        inicio++;
    }

    return compactarNombre(
        caracteres
            .slice(inicio)
            .join("")
    );
}

// =====================================================
// VARIANTES
// =====================================================

function obtenerVariantesNombre(texto) {
    if (!texto) return [];

    const variantes = new Set();

    const original =
        String(texto).trim();

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
        obtenerNucleoNombre(
            original
        );

    if (nucleo) {
        variantes.add(nucleo);
    }

    return Array.from(
        variantes
    );
}

// =====================================================
// LEVENSHTEIN
// =====================================================

function levenshtein(a, b) {
    a = String(a || "");
    b = String(b || "");

    const matrix =
        Array.from(
            {
                length:
                    b.length + 1
            },
            () =>
                new Array(
                    a.length + 1
                ).fill(0)
        );

    for (
        let i = 0;
        i <= b.length;
        i++
    ) {
        matrix[i][0] = i;
    }

    for (
        let j = 0;
        j <= a.length;
        j++
    ) {
        matrix[0][j] = j;
    }

    for (
        let i = 1;
        i <= b.length;
        i++
    ) {
        for (
            let j = 1;
            j <= a.length;
            j++
        ) {
            if (
                b[i - 1] ===
                a[j - 1]
            ) {
                matrix[i][j] =
                    matrix[i - 1][j - 1];
            } else {
                matrix[i][j] =
                    Math.min(
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

    const max =
        Math.max(
            a.length,
            b.length
        );

    if (!max) return 1;

    return (
        1 -
        levenshtein(a, b) /
            max
    );
}

// =====================================================
// MEJOR SUBSECUENCIA
// =====================================================

function mejorSubsecuencia(a, b) {
    a = compactarNombre(a);
    b = compactarNombre(b);

    if (!a || !b) return 0;

    let mejor = 0;

    for (
        let inicio = 0;
        inicio < a.length;
        inicio++
    ) {
        let i = inicio;
        let j = 0;
        let contador = 0;

        while (
            i < a.length &&
            j < b.length
        ) {
            if (
                a[i] === b[j]
            ) {
                contador++;
                i++;
                j++;
            } else {
                j++;
            }
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
    const mapa =
        new Map();

    function agregar(
        texto,
        prioridad
    ) {
        if (!texto) return;

        const limpio =
            limpiarOCR(texto);

        if (!limpio) return;

        const key =
            limpio.toLowerCase();

        const anterior =
            mapa.get(key);

        if (
            !anterior ||
            prioridad >
                anterior.prioridad
        ) {
            mapa.set(
                key,
                {
                    texto: limpio,
                    tipo,
                    prioridad
                }
            );
        }
    }

    for (
        const texto of textos || []
    ) {
        if (!texto) continue;

        const raw =
            limpiarOCR(texto);

        if (!raw) continue;

        agregar(raw, 100);

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
        // ELIMINAR RUIDO DEL PRINCIPIO
        // ---------------------------------------------

        const bases = [
            raw,
            sinDecoracion,
            visual,
            compacto
        ];

        for (
            const base of bases
        ) {
            if (!base) continue;

            const chars =
                Array.from(base);

            if (
                chars.length >= 5
            ) {
                agregar(
                    chars
                        .slice(1)
                        .join(""),
                    80
                );
            }

            if (
                chars.length >= 6
            ) {
                agregar(
                    chars
                        .slice(2)
                        .join(""),
                    70
                );
            }
        }

        // ---------------------------------------------
        // PARTES DE 3+ CARACTERES
        //
        // Sirve para conseguir candidatos
        // aunque el OCR completo tenga errores.
        // ---------------------------------------------

        const compactoBase =
            compactarNombre(
                raw
            );

        if (
            compactoBase.length >= 4
        ) {
            for (
                let i = 0;
                i <=
                    compactoBase.length - 3;
                i++
            ) {
                const parte =
                    compactoBase.slice(
                        i,
                        i + 3
                    );

                agregar(
                    parte,
                    35
                );
            }
        }
    }

    return Array.from(
        mapa.values()
    );
}

// =====================================================
// PREPROCESAR IMAGEN
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
        const procesada =
            await prepararImagenOCR(
                buffer
            );

        worker =
            await createWorker(
                "eng+rus"
            );

        const resultado =
            await worker.recognize(
                procesada
            );

        return limpiarOCR(
            resultado?.data?.text ||
            ""
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
            "Falta BATTLEMETRICS_TOKEN."
        );
    }

    const params = {
        "filter[search]":
            consulta,

        // MUY IMPORTANTE:
        // SOLO EL SERVIDOR CONFIGURADO
        "filter[servers]":
            String(serverId),

        "page[size]": 100
    };

    console.log(
        `[BM] "${consulta}" -> SOLO servidor ${serverId}`
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
// PUNTUAR CANDIDATO
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

    const jugador =
        compactarNombre(
            nombreJugador
        );

    const nucleoJugador =
        obtenerNucleoNombre(
            nombreJugador
        );

    // ---------------------------------------------
    // Nombres demasiado cortos NO son candidatos
    // ---------------------------------------------

    if (
        jugador.length < 4
    ) {
        return {
            score: 0,
            motivo:
                "nombre demasiado corto"
        };
    }

    let mejorScore = 0;
    let mejorMotivo =
        "sin coincidencia";

    for (
        const consultaInfo of consultas
    ) {
        const consulta =
            consultaInfo.texto;

        const tipo =
            consultaInfo.tipo;

        const prioridad =
            consultaInfo.prioridad;

        const q =
            compactarNombre(
                consulta
            );

        if (
            q.length < 3
        ) {
            continue;
        }

        const nucleoConsulta =
            obtenerNucleoNombre(
                consulta
            );

        // =============================================
        // EXACTO
        // =============================================

        if (
            jugador === q &&
            q.length >= 4
        ) {
            const score =
                tipo === "manual"
                    ? 5000
                    : 4700;

            if (
                score > mejorScore
            ) {
                mejorScore = score;
                mejorMotivo =
                    "coincidencia exacta";
            }
        }

        // =============================================
        // NÚCLEO EXACTO
        // =============================================

        if (
            nucleoJugador &&
            nucleoConsulta &&
            nucleoJugador.length >= 4 &&
            nucleoConsulta.length >= 4 &&
            nucleoJugador ===
                nucleoConsulta
        ) {
            const score =
                4600 +
                Math.min(
                    500,
                    nucleoJugador.length * 25
                );

            if (
                score > mejorScore
            ) {
                mejorScore =
                    score;

                mejorMotivo =
                    "núcleo exacto";
            }
        }

        // =============================================
        // UNO CONTIENE AL OTRO
        // =============================================

        if (
            q.length >= 4 &&
            jugador.length >= 4
        ) {
            if (
                jugador.includes(q)
            ) {
                const porcentaje =
                    q.length /
                    jugador.length;

                if (
                    porcentaje >= 0.55
                ) {
                    const score =
                        3000 +
                        Math.round(
                            porcentaje *
                                1000
                        ) +
                        Math.min(
                            100,
                            prioridad
                        );

                    if (
                        score > mejorScore
                    ) {
                        mejorScore =
                            score;

                        mejorMotivo =
                            "nombre contiene OCR";
                    }
                }
            }

            if (
                q.includes(jugador)
            ) {
                const porcentaje =
                    jugador.length /
                    q.length;

                if (
                    porcentaje >= 0.55
                ) {
                    const score =
                        2800 +
                        Math.round(
                            porcentaje *
                                900
                        );

                    if (
                        score > mejorScore
                    ) {
                        mejorScore =
                            score;

                        mejorMotivo =
                            "OCR contiene nombre";
                    }
                }
            }
        }

        // =============================================
        // NÚCLEO DENTRO DEL OCR
        // =============================================

        if (
            nucleoJugador &&
            nucleoJugador.length >= 4 &&
            q.length >= 4
        ) {
            if (
                q.includes(
                    nucleoJugador
                )
            ) {
                const porcentaje =
                    nucleoJugador.length /
                    q.length;

                if (
                    porcentaje >= 0.55
                ) {
                    const score =
                        3700 +
                        Math.round(
                            porcentaje *
                                700
                        );

                    if (
                        score > mejorScore
                    ) {
                        mejorScore =
                            score;

                        mejorMotivo =
                            "núcleo encontrado en OCR";
                    }
                }
            }

            if (
                jugador.endsWith(
                    nucleoJugador
                )
            ) {
                const diferencia =
                    jugador.length -
                    nucleoJugador.length;

                if (
                    diferencia <= 4
                ) {
                    const score =
                        3600 +
                        nucleoJugador.length *
                            30;

                    if (
                        score > mejorScore
                    ) {
                        mejorScore =
                            score;

                        mejorMotivo =
                            "núcleo con prefijo";
                    }
                }
            }
        }

        // =============================================
        // SIMILITUD
        // =============================================

        if (
            q.length >= 4 &&
            jugador.length >= 4
        ) {
            const sim =
                similarity(
                    jugador,
                    q
                );

            if (
                sim >= 0.80
            ) {
                const score =
                    2500 +
                    Math.round(
                        sim * 1200
                    );

                if (
                    score > mejorScore
                ) {
                    mejorScore =
                        score;

                    mejorMotivo =
                        `similitud ${Math.round(sim * 100)}%`;
                }
            }
        }

        // =============================================
        // SUBSECUENCIA
        // =============================================

        if (
            q.length >= 4 &&
            jugador.length >= 4
        ) {
            const sub =
                mejorSubsecuencia(
                    jugador,
                    q
                );

            const porcentaje =
                sub /
                Math.max(
                    jugador.length,
                    q.length
                );

            if (
                sub >= 4 &&
                porcentaje >= 0.55
            ) {
                const score =
                    2200 +
                    Math.round(
                        porcentaje *
                            1000
                    );

                if (
                    score > mejorScore
                ) {
                    mejorScore =
                        score;

                    mejorMotivo =
                        `secuencia OCR ${sub}`;
                }
            }
        }
    }

    return {
        score: mejorScore,
        motivo: mejorMotivo
    };
}

// =====================================================
// BUSCAR CANDIDATOS
// =====================================================

async function buscarJugadores({
    consultas,
    serverId
}) {
    const jugadores =
        new Map();

    for (
        const consultaInfo of consultas
    ) {
        const consulta =
            consultaInfo.texto;

        // NO hacemos consultas de 1-2 caracteres
        if (
            compactarNombre(
                consulta
            ).length < 3
        ) {
            continue;
        }

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

                const nombre =
                    obtenerNombreBM(
                        jugador
                    );

                if (
                    !id ||
                    !nombre
                ) {
                    continue;
                }

                // -----------------------------------------
                // SEGURIDAD EXTRA
                // -----------------------------------------
                // Aunque la API ya está filtrada por servidor,
                // solo aceptamos jugadores que llegaron de
                // esta búsqueda filtrada.

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
                `[BM] Error "${consulta}":`,
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

        if (!nombre) {
            continue;
        }

        const compacto =
            compactarNombre(
                nombre
            );

        // Nunca mostrar nombres de 1-3 caracteres
        if (
            compacto.length < 4
        ) {
            continue;
        }

        const resultado =
            puntuarNombre(
                nombre,
                consultas
            );

        if (
            resultado.score < 2000
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

            return (
                compactarNombre(
                    b.nombre
                ).length -
                compactarNombre(
                    a.nombre
                ).length
            );
        }
    );

    // Eliminar duplicados por nombre normalizado
    const vistos =
        new Set();

    const finales = [];

    for (
        const candidato of candidatos
    ) {
        const key =
            compactarNombre(
                candidato.nombre
            );

        if (
            vistos.has(key)
        ) {
            continue;
        }

        vistos.add(key);

        finales.push(
            candidato
        );

        if (
            finales.length >= 4
        ) {
            break;
        }
    }

    console.log(
        "[BM] CANDIDATOS FINALES:"
    );

    finales.forEach(
        (candidato, index) => {
            console.log(
                `${index + 1}. ${candidato.nombre} | ` +
                `ID ${obtenerIdBM(candidato.jugador)} | ` +
                `Score ${candidato.score} | ` +
                candidato.motivo
            );
        }
    );

    return finales;
}

// =====================================================
// CREAR RESULTADO FINAL
// =====================================================

function crearEmbedJugador(
    jugador,
    textoOCR,
    nombreIngresado,
    serverId,
    score,
    motivo
) {
    const nombre =
        obtenerNombreBM(
            jugador
        );

    const id =
        obtenerIdBM(
            jugador
        );

    const bmUrl =
        `https://www.battlemetrics.com/players/${encodeURIComponent(id)}`;

    const steamUrl =
        `https://www.steamid.com/search?q=${encodeURIComponent(nombre)}`;

    const serverUrl =
        `https://www.battlemetrics.com/servers/${encodeURIComponent(String(serverId))}`;

    const embed =
        new EmbedBuilder()
            .setTitle(
                "🎯 Resultado de búsqueda Steam"
            )
            .setDescription(
                "Jugador seleccionado dentro del servidor configurado."
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
                        "👤 Jugador",
                    value:
                        `\`${nombre}\``
                },
                {
                    name:
                        "🆔 BattleMetrics ID",
                    value:
                        `\`${id}\``
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
                        `${score} — ${motivo}`
                }
            );

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
                        bmUrl
                    ),

                new ButtonBuilder()
                    .setLabel(
                        "SteamID.com"
                    )
                    .setStyle(
                        ButtonStyle.Link
                    )
                    .setURL(
                        steamUrl
                    ),

                new ButtonBuilder()
                    .setLabel(
                        "Servidor BM"
                    )
                    .setStyle(
                        ButtonStyle.Link
                    )
                    .setURL(
                        serverUrl
                    )
            );

    return {
        embeds: [embed],
        components: [row]
    };
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
                `[STEAM] SOLO SERVIDOR: ${serverId}`
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
                    "[STEAM] Procesando imagen..."
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
                        `[OCR] ${textoOCR || "(vacío)"}`
                    );

                } catch (error) {
                    console.error(
                        "[OCR] Error:",
                        error
                    );
                }
            }

            // =================================================
            // TEXTO OCR
            // =================================================

            const textosOCR = [];

            if (textoOCR) {
                const partes =
                    textoOCR
                        .split(/\s+/)
                        .map(
                            x =>
                                x.trim()
                        )
                        .filter(Boolean);

                textosOCR.push(
                    ...partes
                );

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

            if (
                nombreIngresado
            ) {
                consultas.push(
                    ...generarConsultas(
                        [nombreIngresado],
                        "manual"
                    )
                );
            }

            if (
                textosOCR.length
            ) {
                consultas.push(
                    ...generarConsultas(
                        textosOCR,
                        "ocr"
                    )
                );
            }

            // =================================================
            // DEDUPLICAR
            // =================================================

            const mapa =
                new Map();

            for (
                const consulta of consultas
            ) {
                const key =
                    `${consulta.tipo}:${consulta.texto.toLowerCase()}`;

                if (
                    !mapa.has(key)
                ) {
                    mapa.set(
                        key,
                        consulta
                    );
                }
            }

            const consultasFinales =
                Array.from(
                    mapa.values()
                );

            console.log(
                "[STEAM] CONSULTAS:"
            );

            consultasFinales.forEach(
                consulta => {
                    console.log(
                        `[${consulta.tipo}] ${consulta.texto}`
                    );
                }
            );

            if (
                !nombreIngresado &&
                !textoOCR
            ) {
                return interaction.editReply({
                    content:
                        "❌ No se pudo detectar ningún nombre."
                });
            }

            // =================================================
            // BUSCAR CANDIDATOS
            // =================================================

            console.log(
                "[STEAM] BUSCANDO CANDIDATOS..."
            );

            const candidatos =
                await buscarJugadores({
                    consultas:
                        consultasFinales,
                    serverId
                });

            // =================================================
            // SIN RESULTADOS
            // =================================================

            if (
                !candidatos.length
            ) {
                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            "🎯 Resultado de búsqueda Steam"
                        )
                        .setDescription(
                            "No encontré jugadores suficientemente parecidos dentro del servidor configurado."
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
            // UNA COINCIDENCIA MUY SUPERIOR
            // =================================================

            const primero =
                candidatos[0];

            const segundo =
                candidatos[1];

            const diferencia =
                segundo
                    ? primero.score -
                        segundo.score
                    : 9999;

            // Si el primero es claramente superior,
            // lo mostramos directamente.
            if (
                primero.score >= 4300 &&
                diferencia >= 500
            ) {
                const resultado =
                    crearEmbedJugador(
                        primero.jugador,
                        textoOCR,
                        nombreIngresado,
                        serverId,
                        primero.score,
                        primero.motivo
                    );

                return interaction.editReply(
                    resultado
                );
            }

            // =================================================
            // VARIAS COINCIDENCIAS
            // =================================================

            const embed =
                new EmbedBuilder()
                    .setTitle(
                        "🎯 Coincidencias encontradas"
                    )
                    .setDescription(
                        "Encontré varios jugadores parecidos dentro del servidor configurado. Selecciona el correcto:"
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
                                "🖥️ Servidor",
                            value:
                                `\`${serverId}\``
                        }
                    );

            candidatos.forEach(
                (candidato, index) => {
                    embed.addFields({
                        name:
                            `${index + 1}️⃣ ${candidato.nombre}`,
                        value:
                            `Coincidencia: ${candidato.score}`
                    });
                }
            );

            // =================================================
            // BOTONES
            // =================================================

            const row =
                new ActionRowBuilder();

            candidatos.forEach(
                (candidato, index) => {
                    const id =
                        obtenerIdBM(
                            candidato.jugador
                        );

                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(
                                `steam_select_${interaction.id}_${index}`
                            )
                            .setLabel(
                                `${index + 1}️⃣ ${candidato.nombre}`.slice(
                                    0,
                                    80
                                )
                            )
                            .setStyle(
                                ButtonStyle.Primary
                            )
                    );
                }
            );

            const mensaje =
                await interaction.editReply({
                    embeds: [embed],
                    components: [row],
                    fetchReply: true
                });

            // =================================================
            // COLLECTOR
            // =================================================

            const collector =
                mensaje.createMessageComponentCollector({
                    time: 60000
                });

            collector.on(
                "collect",
                async buttonInteraction => {
                    if (
                        !buttonInteraction.customId.startsWith(
                            `steam_select_${interaction.id}_`
                        )
                    ) {
                        return;
                    }

                    if (
                        buttonInteraction.user.id !==
                        interaction.user.id
                    ) {
                        return buttonInteraction.reply({
                            content:
                                "❌ Esta selección pertenece a otra persona.",
                            ephemeral: true
                        });
                    }

                    const partes =
                        buttonInteraction
                            .customId
                            .split("_");

                    const index =
                        Number(
                            partes[
                                partes.length - 1
                            ]
                        );

                    const seleccionado =
                        candidatos[index];

                    if (
                        !seleccionado
                    ) {
                        return buttonInteraction.reply({
                            content:
                                "❌ Ese jugador ya no está disponible.",
                            ephemeral: true
                        });
                    }

                    const resultado =
                        crearEmbedJugador(
                            seleccionado.jugador,
                            textoOCR,
                            nombreIngresado,
                            serverId,
                            seleccionado.score,
                            seleccionado.motivo
                        );

                    await buttonInteraction.update(
                        resultado
                    );

                    collector.stop(
                        "seleccionado"
                    );
                }
            );

            collector.on(
                "end",
                async (_, reason) => {
                    if (
                        reason ===
                        "seleccionado"
                    ) {
                        return;
                    }

                    try {
                        const mensajeActual =
                            await interaction.fetchReply();

                        const componentesDesactivados =
                            mensajeActual.components.map(
                                fila => ({
                                    type:
                                        fila.type,
                                    components:
                                        fila.components.map(
                                            boton => ({
                                                type:
                                                    boton.type,
                                                style:
                                                    boton.style,
                                                label:
                                                    boton.label,
                                                custom_id:
                                                    boton.customId,
                                                disabled:
                                                    true
                                            })
                                        )
                                })
                            );

                        await interaction.editReply({
                            components:
                                componentesDesactivados
                        });

                    } catch (_) {}
                }
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
                    "[STEAM] ERROR RESPUESTA:",
                    editError
                );
            }
        }
    }
};