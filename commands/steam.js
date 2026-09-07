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
// CARACTERES / SÍMBOLOS UNICODE
// =====================================================

// Caracteres decorativos que pueden aparecer alrededor
// del nombre. NO se eliminan del nombre original.
// Solamente se ignoran durante la comparación.

const SIMBOLOS_DECORATIVOS = new Set([
    "★", "☆", "✦", "✧", "✪", "✫", "✬", "✭", "✮", "✯",
    "✰", "✵", "✶", "✷", "✸", "✹", "✺", "✻", "✼", "✽",
    "✾", "✿", "❀", "❁", "❂", "❃", "❄", "❅", "❆",
    "❇", "❈", "❉", "❊", "❋",

    "ツ", "シ", "ッ", "ソ", "ン", "ジ", "ヅ", "ヮ",
    "ヾ", "ゞ",

    "么", "乂", "メ", "彡", "刃", "丂", "乙", "ム",
    "气", "氷", "火", "水", "雷", "風",

    "꧁", "꧂", "༺", "༻", "༼", "༽",
    "『", "』", "「", "」", "【", "】",
    "《", "》", "〈", "〉", "〔", "〕",
    "〖", "〗", "〘", "〙", "〚", "〛",
    "⟦", "⟧", "⟨", "⟩", "⟪", "⟫",

    "「", "」", "『", "』", "﹃", "﹄",
    "‹", "›", "«", "»",

    "◥", "◤", "◢", "◣",
    "◀", "▶", "◁", "▷",
    "▲", "▼", "△", "▽",
    "◆", "◇", "■", "□",
    "●", "○", "◉", "◎",
    "☀", "☁", "☂", "☃",
    "☠", "☢", "☣", "⚡",
    "⚔", "⚒", "⚙",

    "乛", "乚", "乄", "々", "〆",
    "〄", "〠", "〃", "〒",

    "†", "‡", "※", "⁂",
    "•", "·", "∙", "⋆",
    "⋇", "⋈", "⋉", "⋊",

    "♡", "♥", "♦", "♣", "♠",
    "❤", "💀", "💎", "🔥",
    "⚡", "☠",

    "|", "│", "┃", "¦",
    "_", "-", "=", "+",
    "~", "^", "`",
    ".", ",", ":", ";",
    "'", "\"",
    "(", ")", "[", "]",
    "{", "}", "<", ">",
    "/", "\\",
    "!", "¡", "?", "¿",
    "#", "$", "%", "&",
    "*", "@"
]);

// =====================================================
// EQUIVALENCIAS VISUALES
// =====================================================

const MAPA_VISUAL = {
    // Cirílico
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
    "н": "h",
    "Н": "h",
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

    // Leetspeak / OCR
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
// LETRAS UNICODE ESTILIZADAS
// =====================================================

// Superíndices / modificadores frecuentes
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

    // IPA / variantes visuales
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
// LIMPIEZA OCR
// =====================================================

function limpiarOCR(texto) {
    if (!texto) return "";

    return String(texto)
        .replace(/[\r\n]+/gu, " ")
        .replace(/\s+/gu, " ")
        .trim();
}

// =====================================================
// NORMALIZADOR VISUAL
// =====================================================

function normalizarVisual(texto) {
    if (!texto) return "";

    let resultado = String(texto)
        .normalize("NFKC");

    let salida = "";

    for (const caracter of resultado) {
        if (MAPA_ESTILIZADO[caracter]) {
            salida += MAPA_ESTILIZADO[caracter];
            continue;
        }

        if (MAPA_VISUAL[caracter]) {
            salida += MAPA_VISUAL[caracter];
            continue;
        }

        // Separadores/símbolos decorativos
        if (SIMBOLOS_DECORATIVOS.has(caracter)) {
            continue;
        }

        salida += caracter;
    }

    return salida
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/gu, "")
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}]/gu, "");
}

// =====================================================
// NORMALIZACIÓN MÁS AGRESIVA PARA OCR
// =====================================================

function normalizarOCR(texto) {
    if (!texto) return "";

    let valor = normalizarVisual(texto);

    // Errores frecuentes de OCR
    valor = valor
        .replace(/rn/g, "m")
        .replace(/vv/g, "w")
        .replace(/cl/g, "d")
        .replace(/ii/g, "n");

    return valor;
}

// =====================================================
// QUITAR DECORACIÓN
// =====================================================

function quitarDecoracion(texto) {
    if (!texto) return "";

    let resultado = "";

    for (const caracter of String(texto).normalize("NFKC")) {
        if (SIMBOLOS_DECORATIVOS.has(caracter)) {
            continue;
        }

        resultado += caracter;
    }

    return resultado
        .replace(/\s+/gu, " ")
        .trim();
}

// =====================================================
// COMPACTAR
// =====================================================

function compactarNombre(texto) {
    return normalizarVisual(texto);
}

// =====================================================
// TOKENS
// =====================================================

function obtenerTokens(texto) {
    if (!texto) return [];

    return quitarDecoracion(texto)
        .split(/\s+/u)
        .filter(Boolean);
}

// =====================================================
// PARTE PRINCIPAL
// =====================================================

function obtenerPartePrincipal(texto) {
    const tokens = obtenerTokens(texto);

    if (!tokens.length) {
        return "";
    }

    const ordenados = [...tokens]
        .sort((a, b) => {
            return compactarNombre(b).length -
                compactarNombre(a).length;
        });

    return ordenados[0] || "";
}

// =====================================================
// LEVENSHTEIN
// =====================================================

function levenshtein(a, b) {
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
            if (b[i - 1] === a[j - 1]) {
                matriz[i][j] =
                    matriz[i - 1][j - 1];
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

function similarity(a, b) {
    if (!a || !b) return 0;

    if (a === b) return 1;

    const distancia =
        levenshtein(a, b);

    const maximo =
        Math.max(a.length, b.length);

    if (!maximo) return 1;

    return 1 - distancia / maximo;
}

// =====================================================
// LONGITUD DE COINCIDENCIA
// =====================================================

function coincidenciaConsecutiva(a, b) {
    if (!a || !b) return 0;

    let maximo = 0;

    for (let i = 0; i < a.length; i++) {
        for (let j = 0; j < b.length; j++) {
            let contador = 0;

            while (
                i + contador < a.length &&
                j + contador < b.length &&
                a[i + contador] ===
                    b[j + contador]
            ) {
                contador++;
            }

            maximo =
                Math.max(
                    maximo,
                    contador
                );
        }
    }

    return maximo;
}

// =====================================================
// COMPARAR NOMBRE
// =====================================================

function puntuarNombre(nombreJugador, consultas) {
    if (!nombreJugador) {
        return {
            score: 0,
            motivo: "sin nombre"
        };
    }

    const original =
        String(nombreJugador);

    const limpio =
        quitarDecoracion(original);

    const visual =
        normalizarVisual(original);

    const ocrJugador =
        normalizarOCR(original);

    const compacto =
        compactarNombre(original);

    let mejorScore = 0;
    let mejorMotivo = "sin coincidencia";

    for (const consultaOriginal of consultas) {
        if (!consultaOriginal) continue;

        const consulta =
            String(consultaOriginal);

        const consultaLimpia =
            quitarDecoracion(consulta);

        const consultaVisual =
            normalizarVisual(consulta);

        const consultaOCR =
            normalizarOCR(consulta);

        const consultaCompacta =
            compactarNombre(consulta);

        // ---------------------------------------------
        // EXACTO ORIGINAL
        // ---------------------------------------------

        if (
            original.toLocaleLowerCase() ===
            consulta.toLocaleLowerCase()
        ) {
            if (3500 > mejorScore) {
                mejorScore = 3500;
                mejorMotivo = "nombre exacto";
            }
        }

        // ---------------------------------------------
        // EXACTO SIN DECORACIÓN
        // ---------------------------------------------

        if (
            limpio.toLocaleLowerCase() ===
            consultaLimpia.toLocaleLowerCase() &&
            consultaLimpia.length >= 3
        ) {
            if (3300 > mejorScore) {
                mejorScore = 3300;
                mejorMotivo =
                    "exacto sin decoración";
            }
        }

        // ---------------------------------------------
        // EXACTO VISUAL
        // ---------------------------------------------

        if (
            visual === consultaVisual &&
            consultaVisual.length >= 3
        ) {
            if (3200 > mejorScore) {
                mejorScore = 3200;
                mejorMotivo =
                    "coincidencia visual exacta";
            }
        }

        // ---------------------------------------------
        // EXACTO OCR
        // ---------------------------------------------

        if (
            ocrJugador === consultaOCR &&
            consultaOCR.length >= 3
        ) {
            if (3100 > mejorScore) {
                mejorScore = 3100;
                mejorMotivo =
                    "coincidencia OCR exacta";
            }
        }

        // ---------------------------------------------
        // SIMILITUD VISUAL
        // ---------------------------------------------

        if (
            consultaVisual.length >= 4 &&
            visual.length >= 4
        ) {
            const sim =
                similarity(
                    consultaVisual,
                    visual
                );

            if (sim >= 0.70) {
                let score =
                    Math.round(
                        2500 * sim
                    );

                // Bonus para nombres de longitud similar
                const diferencia =
                    Math.abs(
                        consultaVisual.length -
                        visual.length
                    );

                if (diferencia <= 1) {
                    score += 250;
                } else if (diferencia <= 2) {
                    score += 100;
                }

                if (score > mejorScore) {
                    mejorScore = score;
                    mejorMotivo =
                        `similitud visual ${(sim * 100).toFixed(1)}%`;
                }
            }
        }

        // ---------------------------------------------
        // SIMILITUD OCR
        // ---------------------------------------------

        if (
            consultaOCR.length >= 4 &&
            ocrJugador.length >= 4
        ) {
            const sim =
                similarity(
                    consultaOCR,
                    ocrJugador
                );

            if (sim >= 0.70) {
                let score =
                    Math.round(
                        2350 * sim
                    );

                const diferencia =
                    Math.abs(
                        consultaOCR.length -
                        ocrJugador.length
                    );

                if (diferencia <= 1) {
                    score += 200;
                }

                if (score > mejorScore) {
                    mejorScore = score;
                    mejorMotivo =
                        `similitud OCR ${(sim * 100).toFixed(1)}%`;
                }
            }
        }

        // ---------------------------------------------
        // COINCIDENCIA DE SECUENCIA
        // ---------------------------------------------

        if (
            consultaVisual.length >= 5 &&
            visual.length >= 5
        ) {
            const coincidencia =
                coincidenciaConsecutiva(
                    consultaVisual,
                    visual
                );

            if (coincidencia >= 4) {
                const proporcion =
                    coincidencia /
                    Math.max(
                        consultaVisual.length,
                        visual.length
                    );

                if (proporcion >= 0.55) {
                    const score =
                        1000 +
                        coincidencia * 120;

                    if (score > mejorScore) {
                        mejorScore = score;
                        mejorMotivo =
                            `secuencia ${coincidencia} caracteres`;
                    }
                }
            }
        }

        // ---------------------------------------------
        // SUBCADENA
        // ---------------------------------------------

        if (
            consultaCompacta.length >= 5 &&
            compacto.length >= 5
        ) {
            if (
                compacto.includes(
                    consultaCompacta
                ) ||
                consultaCompacta.includes(
                    compacto
                )
            ) {
                const menor =
                    Math.min(
                        consultaCompacta.length,
                        compacto.length
                    );

                const score =
                    900 +
                    menor * 50;

                if (score > mejorScore) {
                    mejorScore = score;
                    mejorMotivo =
                        "coincidencia parcial";
                }
            }
        }
    }

    // ---------------------------------------------
    // PENALIZAR NOMBRES MUY CORTOS
    // ---------------------------------------------

    if (
        compacto.length <= 2 &&
        mejorScore < 3000
    ) {
        mejorScore = 100;
        mejorMotivo =
            "nombre demasiado corto";
    }

    return {
        score: mejorScore,
        motivo: mejorMotivo
    };
}

// =====================================================
// PREPROCESAMIENTOS OCR
// =====================================================

async function crearPreprocesamientos(buffer) {
    const imagenes = [];

    imagenes.push(buffer);

    try {
        imagenes.push(
            await sharp(buffer)
                .resize({
                    width: 1800,
                    withoutEnlargement: false
                })
                .grayscale()
                .normalize()
                .sharpen()
                .png()
                .toBuffer()
        );
    } catch {}

    try {
        imagenes.push(
            await sharp(buffer)
                .resize({
                    width: 1800,
                    withoutEnlargement: false
                })
                .grayscale()
                .normalize()
                .threshold(150)
                .png()
                .toBuffer()
        );
    } catch {}

    try {
        imagenes.push(
            await sharp(buffer)
                .resize({
                    width: 2000,
                    withoutEnlargement: false
                })
                .grayscale()
                .normalize()
                .threshold(190)
                .png()
                .toBuffer()
        );
    } catch {}

    try {
        imagenes.push(
            await sharp(buffer)
                .resize({
                    width: 2000,
                    withoutEnlargement: false
                })
                .normalize()
                .sharpen({
                    sigma: 2
                })
                .png()
                .toBuffer()
        );
    } catch {}

    return imagenes;
}

// =====================================================
// OCR
// =====================================================

async function ejecutarOCR(buffer) {
    const worker =
        await createWorker("eng+rus");

    const textos = [];

    try {
        const imagenes =
            await crearPreprocesamientos(
                buffer
            );

        for (
            let i = 0;
            i < imagenes.length;
            i++
        ) {
            try {
                const resultado =
                    await worker.recognize(
                        imagenes[i]
                    );

                const texto =
                    limpiarOCR(
                        resultado?.data?.text ||
                        ""
                    );

                if (texto) {
                    textos.push(texto);

                    console.log(
                        `[OCR] Procesamiento ${i + 1}: "${texto}"`
                    );
                }
            } catch (error) {
                console.log(
                    `[OCR] Error procesamiento ${i + 1}:`,
                    error.message
                );
            }
        }
    } finally {
        await worker.terminate();
    }

    return textos;
}

// =====================================================
// GENERAR CONSULTAS
// =====================================================

function generarConsultas(textos) {
    const consultas =
        new Set();

    for (const texto of textos) {
        if (!texto) continue;

        const limpio =
            limpiarOCR(texto);

        consultas.add(limpio);

        const sinDecoracion =
            quitarDecoracion(limpio);

        if (sinDecoracion) {
            consultas.add(
                sinDecoracion
            );
        }

        const visual =
            normalizarVisual(limpio);

        if (visual) {
            consultas.add(visual);
        }

        const ocr =
            normalizarOCR(limpio);

        if (ocr) {
            consultas.add(ocr);
        }

        const compacto =
            compactarNombre(limpio);

        if (compacto) {
            consultas.add(compacto);
        }

        const principal =
            obtenerPartePrincipal(
                limpio
            );

        if (principal) {
            consultas.add(principal);

            const principalVisual =
                normalizarVisual(
                    principal
                );

            if (principalVisual) {
                consultas.add(
                    principalVisual
                );
            }
        }
    }

    return [
        ...consultas
    ]
        .filter(
            x =>
                x &&
                x.length >= 2
        )
        .slice(0, 15);
}

// =====================================================
// BATTLEMETRICS
// =====================================================

async function consultarBattleMetrics(
    consulta,
    serverId
) {
    if (!BM_TOKEN) {
        throw new Error(
            "Falta BATTLEMETRICS_TOKEN."
        );
    }

    if (!serverId) {
        throw new Error(
            "No hay servidor configurado."
        );
    }

    console.log(
        `[BM] Buscando "${consulta}" EXCLUSIVAMENTE EN SERVIDOR ${serverId}`
    );

    const params = {
        "filter[search]": consulta,

        // MUY IMPORTANTE:
        // TODA búsqueda está limitada al servidor.
        "filter[servers]": String(serverId),

        "page[size]": 100
    };

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
// BUSCAR JUGADOR
// =====================================================

async function buscarJugador(
    consultas,
    serverId
) {
    const jugadores =
        new Map();

    for (const consulta of consultas) {
        try {
            const resultados =
                await consultarBattleMetrics(
                    consulta,
                    serverId
                );

            console.log(
                `[BM] "${consulta}" -> ${resultados.length} resultados`
            );

            for (const jugador of resultados) {
                if (!jugador?.id) {
                    continue;
                }

                const id =
                    String(jugador.id);

                if (!jugadores.has(id)) {
                    jugadores.set(
                        id,
                        jugador
                    );
                }
            }
        } catch (error) {
            console.log(
                `[BM] Error "${consulta}":`,
                error.response?.status ||
                error.message
            );
        }
    }

    const candidatos = [];

    for (
        const jugador of jugadores.values()
    ) {
        const nombre =
            jugador.attributes?.name ||
            jugador.attributes?.displayName ||
            "";

        if (!nombre) {
            continue;
        }

        const puntuacion =
            puntuarNombre(
                nombre,
                consultas
            );

        candidatos.push({
            jugador,
            nombre,
            score: puntuacion.score,
            motivo: puntuacion.motivo
        });
    }

    candidatos.sort(
        (a, b) => {
            if (
                b.score !== a.score
            ) {
                return b.score -
                    a.score;
            }

            return (
                b.nombre.length -
                a.nombre.length
            );
        }
    );

    console.log(
        "\n[BM] ================================"
    );

    console.log(
        "[BM] CANDIDATOS DEL SERVIDOR"
    );

    console.log(
        "[BM] ================================"
    );

    for (
        const candidato of
        candidatos.slice(0, 20)
    ) {
        console.log(
            `[BM] ${candidato.nombre} | ` +
            `ID: ${candidato.jugador.id} | ` +
            `Score: ${candidato.score} | ` +
            `${candidato.motivo}`
        );
    }

    console.log(
        "[BM] ================================\n"
    );

    if (!candidatos.length) {
        return null;
    }

    const mejor =
        candidatos[0];

    // Umbral alto para evitar
    // falsos positivos.
    if (
        mejor.score < 850
    ) {
        console.log(
            `[BM] ❌ Sin coincidencia fuerte. Mejor: ${mejor.nombre} (${mejor.score})`
        );

        return null;
    }

    console.log(
        `[BM] ✅ SELECCIONADO: ${mejor.nombre} (${mejor.jugador.id})`
    );

    return mejor;
}

// =====================================================
// COMANDO /STEAM
// =====================================================

module.exports = {
    data:
        new SlashCommandBuilder()
            .setName("steam")
            .setDescription(
                "Busca un jugador de Rust en BattleMetrics"
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
            const nombreIngresado =
                interaction.options.getString(
                    "nombre"
                );

            const imagen =
                interaction.options.getAttachment(
                    "imagen"
                );

            // =============================================
            // SERVIDOR CONFIGURADO
            // =============================================

            const config =
                await ServerConfig.findOne({
                    guildId:
                        interaction.guildId
                });

            const serverId =
                config?.battleMetricsServerId;

            if (!serverId) {
                return interaction.editReply({
                    content:
                        "❌ No hay un servidor de BattleMetrics configurado."
                });
            }

            console.log(
                `[STEAM] Servidor configurado: ${serverId}`
            );

            // =============================================
            // OCR
            // =============================================

            let textoOCR = "";

            let consultas = [];

            if (imagen) {
                console.log(
                    `[OCR] Imagen recibida: ${imagen.url}`
                );

                try {
                    const response =
                        await axios.get(
                            imagen.url,
                            {
                                responseType:
                                    "arraybuffer",
                                timeout:
                                    30000
                            }
                        );

                    const buffer =
                        Buffer.from(
                            response.data
                        );

                    const textosOCR =
                        await ejecutarOCR(
                            buffer
                        );

                    if (
                        textosOCR.length
                    ) {
                        // Preferimos el texto
                        // más informativo.
                        textosOCR.sort(
                            (a, b) =>
                                b.length -
                                a.length
                        );

                        textoOCR =
                            limpiarOCR(
                                textosOCR[0]
                            );
                    }

                    consultas =
                        generarConsultas(
                            textosOCR
                        );

                } catch (error) {
                    console.error(
                        "[OCR] Error:",
                        error
                    );
                }
            }

            // =============================================
            // NOMBRE MANUAL
            // =============================================

            if (nombreIngresado) {
                consultas.unshift(
                    limpiarOCR(
                        nombreIngresado
                    )
                );
            }

            consultas = [
                ...new Set(
                    consultas.filter(
                        Boolean
                    )
                )
            ].slice(0, 15);

            console.log(
                "[STEAM] Consultas:",
                consultas
            );

            if (!consultas.length) {
                return interaction.editReply({
                    content:
                        "❌ No pude detectar ningún nombre."
                });
            }

            // =============================================
            // BUSCAR EXCLUSIVAMENTE EN EL SERVIDOR
            // =============================================

            const resultado =
                await buscarJugador(
                    consultas,
                    serverId
                );

            // =============================================
            // SIN RESULTADO
            // =============================================

            if (!resultado) {
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
                                    `\`${textoOCR || "No detectado"}\``
                            },
                            {
                                name:
                                    "🔎 Nombre buscado",
                                value:
                                    `\`${nombreIngresado || textoOCR || consultas[0]}\``
                            },
                            {
                                name:
                                    "🛡️ Servidor",
                                value:
                                    `\`${serverId}\``
                            },
                            {
                                name:
                                    "❌ Resultado",
                                value:
                                    "No encontré una coincidencia suficientemente fuerte **dentro del servidor configurado**."
                            }
                        )
                        .setColor(
                            0xff0000
                        );

                return interaction.editReply({
                    embeds: [
                        embed
                    ]
                });
            }

            // =============================================
            // RESULTADO
            // =============================================

            const jugador =
                resultado.jugador;

            const nombreJugador =
                jugador.attributes?.name ||
                jugador.attributes?.displayName ||
                "Desconocido";

            const playerId =
                jugador.id;

            const battleMetricsUrl =
                `https://www.battlemetrics.com/players/${playerId}`;

            const serverUrl =
                `https://www.battlemetrics.com/servers/${serverId}`;

            const steamSearchUrl =
                `https://www.steamid.com/search?q=${encodeURIComponent(
                    nombreJugador
                )}`;

            // =============================================
            // EMBED
            // =============================================

            const embed =
                new EmbedBuilder()
                    .setTitle(
                        "🎯 Resultado de búsqueda Steam"
                    )
                    .setDescription(
                        "Coincidencia encontrada dentro del servidor configurado."
                    )
                    .addFields(
                        {
                            name:
                                "📸 OCR detectado",
                            value:
                                `\`${textoOCR || "No usado"}\``
                        },
                        {
                            name:
                                "🔎 Nombre buscado",
                            value:
                                `\`${nombreIngresado || textoOCR || consultas[0]}\``
                        },
                        {
                            name:
                                "👤 Jugador encontrado",
                            value:
                                `**${nombreJugador}**`
                        },
                        {
                            name:
                                "🆔 BattleMetrics ID",
                            value:
                                `\`${playerId}\``
                        },
                        {
                            name:
                                "🛡️ Servidor configurado",
                            value:
                                `[Abrir servidor](${serverUrl})`
                        }
                    )
                    .setColor(
                        0x5865f2
                    );

            // =============================================
            // BOTONES
            // =============================================

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
                                battleMetricsUrl
                            ),

                        new ButtonBuilder()
                            .setLabel(
                                "Name Search"
                            )
                            .setStyle(
                                ButtonStyle.Link
                            )
                            .setURL(
                                steamSearchUrl
                            )
                    );

            await interaction.editReply({
                embeds: [
                    embed
                ],
                components: [
                    row
                ]
            });

        } catch (error) {
            console.error(
                "[STEAM] ERROR:",
                error
            );

            const mensaje =
                error?.response?.status ===
                429
                    ? "⚠️ BattleMetrics está limitando temporalmente las solicitudes."
                    : "❌ Ocurrió un error al realizar la búsqueda.";

            try {
                await interaction.editReply({
                    content:
                        mensaje,
                    embeds: [],
                    components: []
                });
            } catch (editError) {
                console.error(
                    "[STEAM] Error enviando error:",
                    editError
                );
            }
        }
    }
};