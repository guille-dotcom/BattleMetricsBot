const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder
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

// Convierte caracteres visualmente parecidos.
// Esto ayuda con nombres rusos/cirílicos y OCR.
function normalizarVisual(texto) {
    if (!texto) return "";

    let valor = String(texto)
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
        "2": "z",
        "3": "e",
        "4": "a",
        "5": "s",
        "6": "g",
        "7": "t",
        "8": "b",
        "9": "g"
    };

    valor = [...valor]
        .map(c => mapa[c] || c)
        .join("");

    return valor
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/gu, "")
        .replace(/[^\p{L}\p{N}]/gu, "");
}

function obtenerTokens(texto) {
    if (!texto) return [];

    return quitarSimbolosDecorativos(texto)
        .split(/\s+/u)
        .filter(Boolean);
}

function obtenerPartePrincipal(texto) {
    const tokens = obtenerTokens(texto);

    if (!tokens.length) {
        return "";
    }

    return tokens
        .filter(token => token.length >= 2)
        .sort((a, b) => b.length - a.length)[0] || tokens[0];
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
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
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

function similarity(a, b) {
    a = String(a || "");
    b = String(b || "");

    if (!a || !b) return 0;

    if (a === b) return 1;

    const distancia = levenshtein(a, b);
    const max = Math.max(a.length, b.length);

    if (!max) return 1;

    return 1 - distancia / max;
}

function longitudCoincidenciaConsecutiva(a, b) {
    if (!a || !b) return 0;

    let maximo = 0;

    for (let i = 0; i < a.length; i++) {
        for (let j = 0; j < b.length; j++) {
            let contador = 0;

            while (
                i + contador < a.length &&
                j + contador < b.length &&
                a[i + contador] === b[j + contador]
            ) {
                contador++;
            }

            if (contador > maximo) {
                maximo = contador;
            }
        }
    }

    return maximo;
}

// =====================================================
// PREPROCESAMIENTO OCR
// =====================================================

async function crearPreprocesamientos(buffer) {
    const resultados = [];

    // Original
    resultados.push(buffer);

    // Escalado + grayscale + contraste
    try {
        const imagen = await sharp(buffer)
            .resize({
                width: 1800,
                withoutEnlargement: false
            })
            .grayscale()
            .normalize()
            .sharpen()
            .png()
            .toBuffer();

        resultados.push(imagen);
    } catch {}

    // Threshold suave
    try {
        const imagen = await sharp(buffer)
            .resize({
                width: 1800,
                withoutEnlargement: false
            })
            .grayscale()
            .normalize()
            .threshold(150)
            .png()
            .toBuffer();

        resultados.push(imagen);
    } catch {}

    // Threshold alto
    try {
        const imagen = await sharp(buffer)
            .resize({
                width: 2000,
                withoutEnlargement: false
            })
            .grayscale()
            .normalize()
            .threshold(190)
            .png()
            .toBuffer();

        resultados.push(imagen);
    } catch {}

    // Más nitidez
    try {
        const imagen = await sharp(buffer)
            .resize({
                width: 2000,
                withoutEnlargement: false
            })
            .sharpen({
                sigma: 2
            })
            .normalize()
            .png()
            .toBuffer();

        resultados.push(imagen);
    } catch {}

    return resultados;
}

// =====================================================
// OCR
// =====================================================

async function ejecutarOCR(buffer) {
    const worker = await createWorker("eng+rus");

    const resultados = [];

    try {
        const imagenes = await crearPreprocesamientos(buffer);

        for (let i = 0; i < imagenes.length; i++) {
            try {
                const resultado = await worker.recognize(imagenes[i]);

                const texto = limpiarOCR(
                    resultado?.data?.text || ""
                );

                if (texto) {
                    resultados.push(texto);

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

    return resultados;
}

// =====================================================
// GENERAR CONSULTAS
// =====================================================

function generarConsultasOCR(textos) {
    const consultas = new Set();

    for (const textoOriginal of textos) {
        const texto = limpiarOCR(textoOriginal);

        if (!texto) continue;

        consultas.add(texto);

        const decoradoQuitado = quitarSimbolosDecorativos(texto);

        if (decoradoQuitado) {
            consultas.add(decoradoQuitado);
        }

        const compacto = compactarNombre(texto);

        if (compacto) {
            consultas.add(compacto);
        }

        const visual = normalizarVisual(texto);

        if (visual) {
            consultas.add(visual);
        }

        const principal = obtenerPartePrincipal(texto);

        if (principal) {
            consultas.add(principal);

            const principalVisual = normalizarVisual(principal);

            if (principalVisual) {
                consultas.add(principalVisual);
            }
        }
    }

    return [...consultas]
        .filter(x => x && x.length >= 2)
        .slice(0, 12);
}

// =====================================================
// BATTLEMETRICS API
// =====================================================

async function consultarBattleMetrics(consulta, serverId) {
    if (!BM_TOKEN) {
        throw new Error(
            "Falta BATTLEMETRICS_TOKEN en las variables de entorno."
        );
    }

    if (!serverId) {
        throw new Error(
            "No hay un servidor BattleMetrics configurado."
        );
    }

    console.log(
        `[BM] Buscando "${consulta}" EXCLUSIVAMENTE EN SERVIDOR ${serverId}`
    );

    const params = {
        "filter[search]": consulta,
        "filter[servers]": String(serverId),
        "page[size]": 100
    };

    const response = await axios.get(
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

    return Array.isArray(response.data?.data)
        ? response.data.data
        : [];
}

// =====================================================
// SCORE DE CANDIDATOS
// =====================================================

function puntuarCandidato(nombreJugador, consultas) {
    if (!nombreJugador) {
        return {
            score: 0,
            motivo: "sin nombre"
        };
    }

    const nombreOriginal = String(nombreJugador);

    const nombreLower = nombreOriginal.toLocaleLowerCase();

    const nombreDecorado = quitarSimbolosDecorativos(
        nombreOriginal
    ).toLocaleLowerCase();

    const nombreCompacto = compactarNombre(
        nombreOriginal
    );

    const nombreVisual = normalizarVisual(
        nombreOriginal
    );

    const parteJugador = obtenerPartePrincipal(
        nombreOriginal
    );

    const parteJugadorCompacta = compactarNombre(
        parteJugador
    );

    const parteJugadorVisual = normalizarVisual(
        parteJugador
    );

    let mejorScore = 0;
    let mejorMotivo = "sin coincidencia";

    for (const consultaOriginal of consultas) {
        if (!consultaOriginal) continue;

        const consulta = String(consultaOriginal);

        const consultaLower = consulta.toLocaleLowerCase();

        const consultaDecorada = quitarSimbolosDecorativos(
            consulta
        ).toLocaleLowerCase();

        const consultaCompacta = compactarNombre(
            consulta
        );

        const consultaVisual = normalizarVisual(
            consulta
        );

        const parteConsulta = obtenerPartePrincipal(
            consulta
        );

        const parteConsultaCompacta = compactarNombre(
            parteConsulta
        );

        const parteConsultaVisual = normalizarVisual(
            parteConsulta
        );

        // =================================================
        // COINCIDENCIA EXACTA DEL NOMBRE
        // =================================================

        if (
            nombreLower === consultaLower &&
            consultaLower.length >= 2
        ) {
            if (3200 > mejorScore) {
                mejorScore = 3200;
                mejorMotivo = "nombre exacto";
            }
        }

        // =================================================
        // EXACTO IGNORANDO DECORACIÓN
        // =================================================

        if (
            nombreDecorado === consultaDecorada &&
            consultaDecorada.length >= 2
        ) {
            if (3000 > mejorScore) {
                mejorScore = 3000;
                mejorMotivo = "coincidencia exacta sin decoración";
            }
        }

        // =================================================
        // EXACTO VISUAL
        // =================================================

        if (
            nombreVisual === consultaVisual &&
            consultaVisual.length >= 2
        ) {
            if (2900 > mejorScore) {
                mejorScore = 2900;
                mejorMotivo = "coincidencia visual exacta";
            }
        }

        // =================================================
        // EXACTO COMPACTO
        // =================================================

        if (
            nombreCompacto === consultaCompacta &&
            consultaCompacta.length >= 3
        ) {
            if (2800 > mejorScore) {
                mejorScore = 2800;
                mejorMotivo = "coincidencia compacta exacta";
            }
        }

        // =================================================
        // PARTE PRINCIPAL EXACTA
        // =================================================

        if (
            parteJugadorCompacta &&
            parteConsultaCompacta &&
            parteJugadorCompacta === parteConsultaCompacta &&
            parteConsultaCompacta.length >= 4
        ) {
            if (2300 > mejorScore) {
                mejorScore = 2300;
                mejorMotivo = "parte principal exacta";
            }
        }

        // =================================================
        // PARTE PRINCIPAL VISUAL
        // =================================================

        if (
            parteJugadorVisual &&
            parteConsultaVisual &&
            parteJugadorVisual === parteConsultaVisual &&
            parteConsultaVisual.length >= 4
        ) {
            if (2200 > mejorScore) {
                mejorScore = 2200;
                mejorMotivo = "parte principal visual";
            }
        }

        // =================================================
        // SIMILITUD COMPLETA
        // =================================================

        if (
            consultaCompacta.length >= 4 &&
            nombreCompacto.length >= 3
        ) {
            const sim = similarity(
                consultaCompacta,
                nombreCompacto
            );

            if (sim >= 0.90) {
                const score = Math.round(1900 * sim);

                if (score > mejorScore) {
                    mejorScore = score;
                    mejorMotivo = `similitud ${(sim * 100).toFixed(1)}%`;
                }
            }
        }

        // =================================================
        // SIMILITUD VISUAL
        // =================================================

        if (
            consultaVisual.length >= 4 &&
            nombreVisual.length >= 3
        ) {
            const sim = similarity(
                consultaVisual,
                nombreVisual
            );

            if (sim >= 0.86) {
                const score = Math.round(1750 * sim);

                if (score > mejorScore) {
                    mejorScore = score;
                    mejorMotivo =
                        `similitud visual ${(sim * 100).toFixed(1)}%`;
                }
            }
        }

        // =================================================
        // COINCIDENCIA DE SUBCADENA
        // SOLO PARA CADENAS SUFICIENTEMENTE LARGAS
        // =================================================

        if (
            consultaCompacta.length >= 5 &&
            nombreCompacto.length >= 5
        ) {
            if (
                nombreCompacto.includes(consultaCompacta) ||
                consultaCompacta.includes(nombreCompacto)
            ) {
                const menor = Math.min(
                    consultaCompacta.length,
                    nombreCompacto.length
                );

                const score = 1000 + menor * 35;

                if (score > mejorScore) {
                    mejorScore = score;
                    mejorMotivo = "subcadena";
                }
            }

            const coincidencia = longitudCoincidenciaConsecutiva(
                consultaVisual,
                nombreVisual
            );

            const minimo = Math.min(
                consultaVisual.length,
                nombreVisual.length
            );

            if (
                coincidencia >= 5 &&
                minimo > 0 &&
                coincidencia / minimo >= 0.55
            ) {
                const score = 850 + coincidencia * 40;

                if (score > mejorScore) {
                    mejorScore = score;
                    mejorMotivo =
                        `coincidencia visual parcial (${coincidencia})`;
                }
            }
        }
    }

    // Nombres extremadamente cortos:
    // no queremos que "W" gane contra un nombre OCR largo.
    if (nombreCompacto.length <= 2 && mejorScore < 2800) {
        mejorScore = Math.min(mejorScore, 250);
        mejorMotivo = "nombre demasiado corto";
    }

    return {
        score: mejorScore,
        motivo: mejorMotivo
    };
}

// =====================================================
// BUSCAR Y RANKEAR
// =====================================================

async function buscarJugadorBattleMetrics(
    consultas,
    serverId
) {
    const jugadores = new Map();

    for (const consulta of consultas) {
        try {
            const resultados = await consultarBattleMetrics(
                consulta,
                serverId
            );

            console.log(
                `[BM] "${consulta}" -> ${resultados.length} resultados`
            );

            for (const jugador of resultados) {
                if (!jugador?.id) continue;

                if (!jugadores.has(String(jugador.id))) {
                    jugadores.set(
                        String(jugador.id),
                        jugador
                    );
                }
            }
        } catch (error) {
            console.log(
                `[BM] Error buscando "${consulta}":`,
                error.response?.status || error.message
            );
        }
    }

    const candidatos = [];

    for (const jugador of jugadores.values()) {
        const nombre =
            jugador.attributes?.name ||
            jugador.attributes?.displayName ||
            "";

        if (!nombre) continue;

        const puntuacion = puntuarCandidato(
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

    candidatos.sort((a, b) => {
        if (b.score !== a.score) {
            return b.score - a.score;
        }

        // En empate, preferimos el nombre más largo.
        // Esto ayuda a que "DareN ^_^" gane a "daren"
        // cuando la coincidencia es equivalente.
        return b.nombre.length - a.nombre.length;
    });

    console.log("\n[BM] ================================");
    console.log("[BM] CANDIDATOS DEL SERVIDOR");
    console.log("[BM] ================================");

    for (const candidato of candidatos.slice(0, 15)) {
        console.log(
            `[BM] ${candidato.nombre} | ` +
            `ID: ${candidato.jugador.id} | ` +
            `Score: ${candidato.score} | ` +
            `${candidato.motivo}`
        );
    }

    console.log("[BM] ================================\n");

    if (!candidatos.length) {
        return null;
    }

    const mejor = candidatos[0];

    // Umbral para evitar falsos positivos.
    if (mejor.score < 850) {
        console.log(
            `[BM] ❌ Ninguna coincidencia suficientemente fuerte. Mejor: ${mejor.nombre} (${mejor.score})`
        );

        return null;
    }

    console.log(
        `[BM] ✅ SELECCIONADO: ${mejor.nombre} (${mejor.jugador.id})`
    );

    return mejor;
}

// =====================================================
// COMANDO
// =====================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName("steam")
        .setDescription("Busca un jugador de Rust en BattleMetrics")
        .addStringOption(option =>
            option
                .setName("nombre")
                .setDescription("Nombre del jugador")
                .setRequired(false)
        )
        .addAttachmentOption(option =>
            option
                .setName("imagen")
                .setDescription("Captura donde aparece el nombre")
                .setRequired(false)
        ),

    async execute(interaction) {
        // IMPORTANTE:
        // Evita Unknown interaction / 10062
        await interaction.deferReply();

        try {
            const nombreIngresado =
                interaction.options.getString("nombre");

            const imagen =
                interaction.options.getAttachment("imagen");

            // =================================================
            // OBTENER SERVIDOR CONFIGURADO
            // =================================================

            const config = await ServerConfig.findOne({
                guildId: interaction.guildId
            });

            const serverId =
                config?.battleMetricsServerId;

            if (!serverId) {
                return interaction.editReply({
                    content:
                        "❌ No hay un servidor de BattleMetrics configurado para este servidor de Discord."
                });
            }

            console.log(
                `[STEAM] Servidor configurado: ${serverId}`
            );

            // =================================================
            // DETERMINAR NOMBRE / OCR
            // =================================================

            let textoOCR = "";
            let consultas = [];

            if (imagen) {
                console.log(
                    `[OCR] Imagen recibida: ${imagen.url}`
                );

                try {
                    const response = await axios.get(
                        imagen.url,
                        {
                            responseType: "arraybuffer",
                            timeout: 30000
                        }
                    );

                    const buffer = Buffer.from(
                        response.data
                    );

                    const textosOCR =
                        await ejecutarOCR(buffer);

                    if (textosOCR.length) {
                        // Elegimos el texto más útil.
                        textosOCR.sort(
                            (a, b) => b.length - a.length
                        );

                        textoOCR = limpiarOCR(
                            textosOCR[0]
                        );
                    }

                    consultas =
                        generarConsultasOCR(
                            textosOCR
                        );
                } catch (error) {
                    console.error(
                        "[OCR] Error:",
                        error
                    );
                }
            }

            // Si el usuario escribió nombre manualmente,
            // también se agrega como consulta.
            if (nombreIngresado) {
                const nombreLimpio =
                    limpiarOCR(nombreIngresado);

                if (nombreLimpio) {
                    consultas.unshift(
                        nombreLimpio
                    );
                }
            }

            consultas = [
                ...new Set(
                    consultas
                        .map(x => limpiarOCR(x))
                        .filter(Boolean)
                )
            ].slice(0, 12);

            if (!consultas.length) {
                return interaction.editReply({
                    content:
                        "❌ No pude detectar ningún nombre. Prueba con una captura más clara o escribe el nombre manualmente."
                });
            }

            console.log(
                "[STEAM] Consultas:",
                consultas
            );

            // =================================================
            // BUSCAR EXCLUSIVAMENTE EN EL SERVIDOR
            // =================================================

            const resultado =
                await buscarJugadorBattleMetrics(
                    consultas,
                    serverId
                );

            // =================================================
            // SIN COINCIDENCIA
            // =================================================

            if (!resultado) {
                const embed = new EmbedBuilder()
                    .setTitle("🎯 Resultado de búsqueda Steam")
                    .setDescription(
                        "Revisa el nombre detectado antes de buscarlo en BattleMetrics."
                    )
                    .addFields(
                        {
                            name: "📸 OCR detectado",
                            value:
                                `\`${textoOCR || "No detectado"}\``
                        },
                        {
                            name: "🔎 Nombre buscado",
                            value:
                                `\`${nombreIngresado || textoOCR || consultas[0]}\``
                        },
                        {
                            name: "🛡️ Servidor",
                            value:
                                `\`${serverId}\``
                        },
                        {
                            name: "❌ Resultado",
                            value:
                                "No encontré una coincidencia suficientemente fuerte **dentro del servidor configurado**."
                        }
                    )
                    .setColor(0xff0000);

                return interaction.editReply({
                    embeds: [embed]
                });
            }

            // =================================================
            // RESULTADO
            // =================================================

            const jugador = resultado.jugador;

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

            // =================================================
            // EMBED
            // =================================================

            const embed = new EmbedBuilder()
                .setTitle("🎯 Resultado de búsqueda Steam")
                .setDescription(
                    "Coincidencia encontrada dentro del servidor configurado."
                )
                .addFields(
                    {
                        name: "📸 OCR detectado",
                        value:
                            `\`${textoOCR || "No usado"}\``
                    },
                    {
                        name: "🔎 Nombre buscado",
                        value:
                            `\`${nombreIngresado || textoOCR || consultas[0]}\``
                    },
                    {
                        name: "👤 Jugador encontrado",
                        value:
                            `**${nombreJugador}**`
                    },
                    {
                        name: "🆔 BattleMetrics ID",
                        value:
                            `\`${playerId}\``
                    },
                    {
                        name: "🛡️ Servidor configurado",
                        value:
                            `[Abrir servidor](${serverUrl})`
                    }
                )
                .setColor(0x5865f2);

            // =================================================
            // BOTONES
            // =================================================

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel("BattleMetrics")
                        .setStyle(ButtonStyle.Link)
                        .setURL(battleMetricsUrl),

                    new ButtonBuilder()
                        .setLabel("Name Search")
                        .setStyle(ButtonStyle.Link)
                        .setURL(steamSearchUrl)
                );

            await interaction.editReply({
                embeds: [embed],
                components: [row]
            });

        } catch (error) {
            console.error(
                "[STEAM] ERROR:",
                error
            );

            const mensaje =
                error?.response?.status === 429
                    ? "⚠️ BattleMetrics está limitando temporalmente las solicitudes."
                    : "❌ Ocurrió un error al realizar la búsqueda.";

            try {
                await interaction.editReply({
                    content: mensaje,
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