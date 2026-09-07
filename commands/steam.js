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
// EXTRAER PARTES ÚTILES DE UN OCR MALO
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

        // Buscar secuencias alfanuméricas
        const alfanumericos =
            original.match(/[\p{L}\p{N}]{2,}/gu);

        if (alfanumericos) {
            for (const parte of alfanumericos) {
                candidatos.push(parte);
            }
        }
    }

    // =================================================
    // CORRECCIONES COMUNES DE OCR
    // =================================================

    const extras = [];

    for (const candidato of candidatos) {
        const lower =
            candidato.toLocaleLowerCase();

        // Tesseract suele confundir:
        // R -> Я / P
        // 3 -> З
        // N -> И / П
        // 0 -> О / O

        let posible = lower
            .replace(/[я]/gu, "r")
            .replace(/[з]/gu, "3")
            .replace(/[о]/gu, "0");

        if (posible !== lower) {
            extras.push(posible);
        }

        // Caso especial para nombres tipo R3N0
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
        worker = await crearWorkerSeguro(idiomas);

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

        if (!/[\p{L}\p{N}]/u.test(linea)) {
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
            extraerPartesUtilesOCR(linea);

        for (const parte of partes) {
            if (!candidatos.includes(parte)) {
                candidatos.push(parte);
            }
        }
    }

    return [...new Set(candidatos)];
}

// =====================================================
// PUNTUAR CANDIDATO
// =====================================================

function puntuarCandidato(texto) {
    if (!texto) return 0;

    const limpio =
        normalizarNombre(texto);

    let puntos = 0;

    if (/\s/u.test(limpio)) {
        puntos += 10;
    }

    if (/[\u0400-\u04FF]/u.test(limpio)) {
        puntos += 30;
    }

    if (/[\u3040-\u30FF]/u.test(limpio)) {
        puntos += 30;
    }

    if (/[\u4E00-\u9FFF]/u.test(limpio)) {
        puntos += 30;
    }

    if (/[\uAC00-\uD7AF]/u.test(limpio)) {
        puntos += 30;
    }

    if (
        limpio.length >= 3 &&
        limpio.length <= 30
    ) {
        puntos += 15;
    }

    if (/[\p{L}\p{N}]/u.test(limpio)) {
        puntos += 10;
    }

    return puntos;
}

// =====================================================
// SELECCIONAR MEJOR OCR
// =====================================================

function seleccionarMejorCandidato(candidatos) {
    if (!candidatos?.length) {
        return null;
    }

    return candidatos
        .map((texto) => ({
            texto,
            puntos: puntuarCandidato(texto)
        }))
        .sort(
            (a, b) => b.puntos - a.puntos
        )[0]?.texto || null;
}

// =====================================================
// DETECTAR NOMBRE
// =====================================================

async function detectarNombreOCR(buffer) {
    const imagenes =
        await prepararImagenes(buffer);

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
                extraerCandidatos(texto);

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
                limpiarOCR(textoCompleto)
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
                    b.total - a.total
            );

    const mejor =
        candidatosFinales[0];

    return {
        nombre:
            mejor?.nombre || null,

        candidatos:
            candidatosFinales
                .slice(0, 20)
                .map((x) => x.nombre),

        textoCompleto:
            limpiarOCR(textoCompleto)
    };
}

// =====================================================
// OBTENER SERVIDOR
// =====================================================

async function obtenerServidorConfigurado(guildId) {
    try {
        const config =
            await ServerConfig
                .findOne({ guildId })
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
// COMPROBAR SI UN NOMBRE CONTIENE UNA PARTE
// =====================================================

function nombreContieneParte(
    nombreJugador,
    consulta
) {
    const jugador =
        normalizarComparacion(
            nombreJugador
        );

    const buscado =
        normalizarComparacion(
            consulta
        );

    if (!jugador || !buscado) {
        return false;
    }

    if (jugador === buscado) {
        return true;
    }

    // Comparación quitando símbolos
    const jugadorLimpio =
        quitarSimbolosDecorativos(
            jugador
        )
            .toLocaleLowerCase()
            .replace(/\s+/gu, "");

    const buscadoLimpio =
        quitarSimbolosDecorativos(
            buscado
        )
            .toLocaleLowerCase()
            .replace(/\s+/gu, "");

    if (
        buscadoLimpio.length >= 2 &&
        jugadorLimpio.includes(
            buscadoLimpio
        )
    ) {
        return true;
    }

    return false;
}

// =====================================================
// EXTRAER CONSULTAS DE BÚSQUEDA
// =====================================================

function generarConsultasBusqueda(
    nombre,
    candidatosOCR = []
) {
    const consultas = [];

    const agregar = (valor) => {
        if (!valor) return;

        const limpio =
            normalizarNombre(valor);

        if (limpio.length < 2) {
            return;
        }

        if (
            !consultas.some(
                (x) =>
                    normalizarComparacion(
                        x
                    ) ===
                    normalizarComparacion(
                        limpio
                    )
            )
        ) {
            consultas.push(limpio);
        }
    };

    // Nombre original
    agregar(nombre);

    // Sin símbolos
    agregar(
        quitarSimbolosDecorativos(
            nombre
        )
    );

    // Candidatos OCR
    for (const candidato of candidatosOCR) {
        agregar(candidato);

        agregar(
            quitarSimbolosDecorativos(
                candidato
            )
        );

        const partes =
            extraerPartesUtilesOCR(
                candidato
            );

        for (const parte of partes) {
            agregar(parte);
        }
    }

    return consultas
        .filter(Boolean)
        .slice(0, 10);
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
        `[BM] 🎯 Servidor: ${serverId || "NINGUNO"}`
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

            for (const player of players) {
                if (!player?.id) {
                    continue;
                }

                todosLosJugadores.set(
                    String(player.id),
                    player
                );
            }

            // Si ya tenemos resultados,
            // podemos intentar compararlos.
            for (const player of players) {
                const nombreJugador =
                    player?.attributes?.name;

                if (!nombreJugador) {
                    continue;
                }

                console.log(
                    `[BM] 👤 ${player.id} | "${nombreJugador}"`
                );

                if (
                    nombreContieneParte(
                        nombreJugador,
                        consulta
                    )
                ) {
                    console.log(
                        `[BM] ✅ Coincidencia: ${player.id} | ${nombreJugador}`
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
            }
        }

        // =================================================
        // SEGUNDO PASO:
        // COMPARAR TODOS LOS RESULTADOS
        // =================================================

        const jugadores =
            [...todosLosJugadores.values()];

        for (const player of jugadores) {
            const nombreJugador =
                player?.attributes?.name;

            if (!nombreJugador) {
                continue;
            }

            for (
                const consulta
                of consultas
            ) {
                if (
                    nombreContieneParte(
                        nombreJugador,
                        consulta
                    )
                ) {
                    console.log(
                        `[BM] ✅ Coincidencia final: ${player.id} | ${nombreJugador}`
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
            }
        }

        console.log(
            `[BM] ❌ No se encontró "${nombre}" en ${serverId}`
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
            name: "📸 OCR detectado",
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
    data: new SlashCommandBuilder()
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
                normalizarNombre(nombre);

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