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
// CONFIGURACIÓN OCR
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
// ESTADO TEMPORAL OCR
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
// LIMPIEZA OCR
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
        .map((linea) => linea.trim())
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
// PREPARAR IMÁGENES PARA OCR
// =====================================================

async function prepararImagenes(buffer) {
    const imagenes = [];

    // Imagen original procesada
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
        console.error("[OCR] Error preparando imagen original:", error.message);
    }

    // Imagen con más contraste
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
        console.error("[OCR] Error preparando imagen de contraste:", error.message);
    }

    // Imagen binarizada
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
        console.error("[OCR] Error preparando imagen binaria:", error.message);
    }

    return imagenes;
}

// =====================================================
// CREAR WORKER OCR
// =====================================================

async function crearWorkerSeguro(idiomas) {
    const worker = await createWorker(idiomas);

    return worker;
}

// =====================================================
// EJECUTAR OCR
// =====================================================

async function ejecutarOCR(buffer, idiomas) {
    let worker = null;

    try {
        worker = await crearWorkerSeguro(idiomas);

        const resultado = await worker.recognize(buffer);

        return resultado?.data?.text || "";
    } catch (error) {
        console.error(
            `[OCR] Error con idiomas ${idiomas}:`,
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
// EXTRAER CANDIDATOS DEL OCR
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

        const lower = linea.toLocaleLowerCase();

        // Ignorar textos típicos de interfaz
        const palabrasIgnoradas = [
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
            palabrasIgnoradas.some((palabra) =>
                lower === palabra
            )
        ) {
            continue;
        }

        if (linea.length < 2) continue;
        if (linea.length > 80) continue;

        // Debe contener al menos una letra o número
        if (!/[\p{L}\p{N}]/u.test(linea)) continue;

        candidatos.push(linea);
    }

    // Eliminar duplicados
    return [...new Set(candidatos)];
}

// =====================================================
// PUNTUAR CANDIDATO
// =====================================================

function puntuarCandidato(texto) {
    if (!texto) return 0;

    let puntos = 0;

    const limpio = normalizarNombre(texto);

    // Nombres con espacios suelen ser nombres de jugador
    if (/\s/u.test(limpio)) {
        puntos += 10;
    }

    // Unicode / cirílico / asiático
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

    // Longitud razonable
    if (limpio.length >= 3 && limpio.length <= 30) {
        puntos += 15;
    }

    // No parece una URL
    if (!/https?:\/\//i.test(limpio)) {
        puntos += 5;
    }

    // No parece un número puro
    if (!/^\d+$/u.test(limpio)) {
        puntos += 5;
    }

    return puntos;
}

// =====================================================
// SELECCIONAR MEJOR CANDIDATO
// =====================================================

function seleccionarMejorCandidato(candidatos) {
    if (!candidatos?.length) return null;

    const ordenados = candidatos
        .map((texto) => ({
            texto,
            puntos: puntuarCandidato(texto)
        }))
        .sort((a, b) => b.puntos - a.puntos);

    return ordenados[0]?.texto || null;
}

// =====================================================
// DETECTAR NOMBRE POR OCR
// =====================================================

async function detectarNombreOCR(buffer) {
    const imagenes = await prepararImagenes(buffer);

    if (!imagenes.length) {
        return {
            nombre: null,
            textoCompleto: ""
        };
    }

    const resultados = [];
    let textoCompleto = "";

    for (const grupo of OCR_GRUPOS) {
        console.log(
            `[OCR] Ejecutando grupo: ${grupo.nombre} (${grupo.idiomas})`
        );

        for (const imagen of imagenes) {
            const texto = await ejecutarOCR(
                imagen,
                grupo.idiomas
            );

            if (!texto) continue;

            textoCompleto += "\n" + texto;

            const candidatos = extraerCandidatos(texto);

            for (const candidato of candidatos) {
                resultados.push({
                    candidato,
                    puntos: puntuarCandidato(candidato),
                    grupo: grupo.nombre
                });
            }
        }
    }

    if (!resultados.length) {
        return {
            nombre: null,
            textoCompleto: limpiarOCR(textoCompleto)
        };
    }

    // Agrupar candidatos iguales
    const mapa = new Map();

    for (const resultado of resultados) {
        const clave = normalizarComparacion(
            resultado.candidato
        );

        if (!clave) continue;

        if (!mapa.has(clave)) {
            mapa.set(clave, {
                nombre: resultado.candidato,
                puntos: 0,
                veces: 0
            });
        }

        const actual = mapa.get(clave);

        actual.puntos += resultado.puntos;
        actual.veces += 1;
    }

    const candidatosFinales = [...mapa.values()]
        .map((item) => ({
            ...item,
            total: item.puntos + item.veces * 20
        }))
        .sort((a, b) => b.total - a.total);

    const mejor = candidatosFinales[0];

    return {
        nombre: mejor?.nombre || null,
        textoCompleto: limpiarOCR(textoCompleto)
    };
}

// =====================================================
// OBTENER SERVIDOR CONFIGURADO
// =====================================================

async function obtenerServidorConfigurado(guildId) {
    try {
        const config = await ServerConfig
            .findOne({ guildId })
            .lean();

        if (!config?.battleMetricsServerId) {
            return null;
        }

        return String(config.battleMetricsServerId);
    } catch (error) {
        console.error(
            "[BM] Error obteniendo configuración:",
            error
        );

        return null;
    }
}

// =====================================================
// BUSCAR EN BATTLEMETRICS
// =====================================================

async function buscarEnBattleMetrics(nombre, guildId) {
    const nombreBuscado = normalizarComparacion(nombre);

    const serverId = await obtenerServidorConfigurado(
        guildId
    );

    console.log(
        `[BM] 🎯 Servidor configurado: ${serverId || "NINGUNO"}`
    );

    if (!serverId) {
        return {
            encontrados: [],
            error: "NO_SERVER_CONFIGURED",
            serverId: null
        };
    }

    if (!BM_TOKEN) {
        console.error(
            "[BM] ❌ No existe BATTLEMETRICS_TOKEN en las variables de entorno."
        );

        return {
            encontrados: [],
            error: "NO_TOKEN",
            serverId
        };
    }

    console.log(
        `[BM] 🔎 Buscando: "${nombre}"`
    );

    console.log(
        `[BM] 🔎 Buscando SOLO en servidor: ${serverId}`
    );

    try {
        const response = await axios.get(
            `${BM_API}/players`,
            {
                params: {
                    "filter[search]": nombre,
                    "filter[servers]": serverId,
                    "page[size]": 100,
                    include: "server,identifier"
                },

                headers: {
                    Authorization: `Bearer ${BM_TOKEN}`,
                    "User-Agent": USER_AGENT,
                    Accept: "application/json"
                },

                timeout: 30000
            }
        );

        const players = Array.isArray(
            response.data?.data
        )
            ? response.data.data
            : [];

        console.log(
            `[BM] 👥 BattleMetrics devolvió ${players.length} jugadores`
        );

        const encontrados = [];

        // =================================================
        // COMPARACIÓN EXACTA
        // =================================================

        for (const player of players) {
            const nombreJugador =
                player?.attributes?.name;

            if (!nombreJugador) continue;

            console.log(
                `[BM] 👤 Player: ${player.id} | "${nombreJugador}"`
            );

            if (
                normalizarComparacion(nombreJugador) ===
                nombreBuscado
            ) {
                encontrados.push({
                    id: String(player.id),
                    nombre: nombreJugador,
                    atributos: player.attributes || {}
                });
            }
        }

        // =================================================
        // COMPARACIÓN SIN ESPACIOS
        // =================================================

        if (!encontrados.length) {
            const sinEspacios =
                nombreBuscado.replace(/\s+/gu, "");

            for (const player of players) {
                const nombreJugador =
                    player?.attributes?.name;

                if (!nombreJugador) continue;

                const jugadorSinEspacios =
                    normalizarComparacion(
                        nombreJugador
                    ).replace(/\s+/gu, "");

                if (
                    jugadorSinEspacios ===
                    sinEspacios
                ) {
                    encontrados.push({
                        id: String(player.id),
                        nombre: nombreJugador,
                        atributos: player.attributes || {}
                    });

                    break;
                }
            }
        }

        if (encontrados.length) {
            console.log(
                `[BM] ✅ Jugador encontrado: ${encontrados[0].id} ${encontrados[0].nombre}`
            );
        } else {
            console.log(
                `[BM] ❌ No se encontró "${nombre}" dentro del servidor ${serverId}`
            );
        }

        return {
            encontrados,
            error: null,
            serverId
        };

    } catch (error) {
        const status =
            error.response?.status || null;

        console.error(
            "[BM] ❌ Error consultando BattleMetrics:",
            status,
            error.response?.data || error.message
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
// CREAR EMBED DE RESULTADO
// =====================================================

function crearEmbedResultado({
    nombreBuscado,
    nombreOCR,
    resultado
}) {
    const embed = new EmbedBuilder()
        .setTitle("🎯 Resultado de búsqueda Steam")
        .setDescription(
            `**Nombre buscado:** ${nombreBuscado}`
        );

    if (nombreOCR) {
        embed.addFields({
            name: "📸 OCR detectado",
            value: `\`${nombreOCR}\``
        });
    }

    if (resultado.error === "NO_SERVER_CONFIGURED") {
        embed.addFields({
            name: "⚠️ Servidor no configurado",
            value:
                "No hay un servidor de BattleMetrics configurado para este servidor de Discord."
        });
    } else if (resultado.error === "NO_TOKEN") {
        embed.addFields({
            name: "⚠️ Token de BattleMetrics",
            value:
                "No se encontró `BATTLEMETRICS_TOKEN` en las variables de entorno."
        });
    } else if (resultado.error === "BM_403") {
        embed.addFields({
            name: "⚠️ BattleMetrics rechazó la consulta",
            value:
                "BattleMetrics devolvió HTTP 403 al consultar la API de jugadores."
        });
    } else if (resultado.error === "BM_401") {
        embed.addFields({
            name: "⚠️ Token rechazado",
            value:
                "BattleMetrics devolvió HTTP 401. El token no fue aceptado o está expirado."
        });
    } else if (resultado.error === "BM_ERROR") {
        embed.addFields({
            name: "⚠️ Error de BattleMetrics",
            value:
                "Ocurrió un error al consultar la API de BattleMetrics."
        });
    } else if (
        resultado.encontrados &&
        resultado.encontrados.length
    ) {
        const jugador =
            resultado.encontrados[0];

        embed.addFields({
            name: "✅ Jugador encontrado",
            value:
                `**Nombre:** ${jugador.nombre}\n` +
                `**BattleMetrics ID:** \`${jugador.id}\``
        });
    } else {
        embed.addFields({
            name: "❌ Resultado",
            value:
                `No se encontró **${nombreBuscado}** dentro del servidor de BattleMetrics configurado.`
        });
    }

    if (resultado.serverId) {
        embed.addFields({
            name: "🎯 Servidor consultado",
            value:
                `[Abrir servidor en BattleMetrics](${BM_API.replace(
                    "api.",
                    ""
                )}/servers/rust/${resultado.serverId})`
        });
    }

    return embed;
}

// =====================================================
// BOTONES OCR
// =====================================================

function crearBotonesOCR() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("steam_ocr_buscar")
            .setLabel("Buscar")
            .setEmoji("🔎")
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId("steam_ocr_corregir")
            .setLabel("Corregir")
            .setEmoji("✏️")
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId("steam_ocr_cancelar")
            .setLabel("Cancelar")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Danger)
    );
}

// =====================================================
// REALIZAR BÚSQUEDA
// =====================================================

async function ejecutarBusqueda(
    interaction,
    nombre,
    nombreOCR = null
) {
    const resultado =
        await buscarEnBattleMetrics(
            nombre,
            interaction.guild.id
        );

    const embed =
        crearEmbedResultado({
            nombreBuscado: nombre,
            nombreOCR,
            resultado
        });

    const jugador =
        resultado.encontrados?.[0];

    const row = new ActionRowBuilder();

    if (jugador) {
        row.addComponents(
            new ButtonBuilder()
                .setLabel("Abrir BattleMetrics")
                .setStyle(ButtonStyle.Link)
                .setURL(
                    `https://www.battlemetrics.com/players/${jugador.id}`
                )
        );
    }

    row.addComponents(
        new ButtonBuilder()
            .setLabel("Buscar en SteamID.com")
            .setStyle(ButtonStyle.Link)
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
// COMANDO
// =====================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName("steam")
        .setDescription(
            "Busca un jugador de Rust por nombre o captura de pantalla"
        )
        .addStringOption((option) =>
            option
                .setName("nombre")
                .setDescription(
                    "Nombre del jugador"
                )
                .setRequired(false)
        )
        .addAttachmentOption((option) =>
            option
                .setName("captura")
                .setDescription(
                    "Captura donde aparezca el nombre del jugador"
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
        // BÚSQUEDA DIRECTA POR NOMBRE
        // =================================================

        if (nombre && !captura) {
            await interaction.deferReply();

            console.log(
                `[STEAM] 🎯 Búsqueda directa: "${nombre}"`
            );

            await ejecutarBusqueda(
                interaction,
                normalizarNombre(nombre)
            );

            return;
        }

        // =================================================
        // SIN NOMBRE NI CAPTURA
        // =================================================

        if (!nombre && !captura) {
            return interaction.reply({
                content:
                    "❌ Debes introducir un nombre o adjuntar una captura de pantalla.",
                ephemeral: true
            });
        }

        // =================================================
        // CAPTURA OCR
        // =================================================

        await interaction.deferReply();

        try {
            console.log(
                "[STEAM] 📸 Descargando captura para OCR..."
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
                `[STEAM] 📸 OCR detectado: "${nombreDetectado || "NADA"}"`
            );

            if (!nombreDetectado) {
                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            "🎯 Resultado de búsqueda Steam"
                        )
                        .addFields({
                            name: "📸 OCR",
                            value:
                                "❌ No pude detectar un nombre de jugador en la captura."
                        })
                        .setFooter({
                            text:
                                "Puedes probar con una captura más clara o introducir el nombre manualmente."
                        });

                await interaction.editReply({
                    embeds: [embed]
                });

                return;
            }

            // Guardamos temporalmente el OCR
            estadosOCR.set(
                interaction.user.id,
                {
                    nombre: nombreDetectado,
                    creado: Date.now()
                }
            );

            const embed =
                new EmbedBuilder()
                    .setTitle(
                        "🎯 Resultado de búsqueda Steam"
                    )
                    .addFields({
                        name: "📸 OCR detectado",
                        value:
                            `\`${nombreDetectado}\``
                    })
                    .setDescription(
                        "Revisa el nombre detectado antes de buscarlo en BattleMetrics."
                    );

            await interaction.editReply({
                embeds: [embed],
                components: [
                    crearBotonesOCR()
                ]
            });

        } catch (error) {
            console.error(
                "[STEAM] ❌ Error procesando OCR:",
                error
            );

            await interaction.editReply({
                content:
                    "❌ Ocurrió un error procesando la captura."
            });
        }
    },

    // ===================================================
    // MANEJO DE BOTONES Y MODAL
    // ===================================================

    async handleInteraction(interaction) {
        // =================================================
        // BOTÓN BUSCAR
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
                        "❌ La sesión de OCR expiró. Vuelve a ejecutar `/steam`.",
                    ephemeral: true
                });
            }

            await interaction.deferUpdate();

            await ejecutarBusqueda(
                interaction,
                estado.nombre,
                estado.nombre
            );

            estadosOCR.delete(
                interaction.user.id
            );

            return;
        }

        // =================================================
        // BOTÓN CORREGIR
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
                        "❌ La sesión de OCR expiró. Vuelve a ejecutar `/steam`.",
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
                new ActionRowBuilder().addComponents(
                    input
                )
            );

            await interaction.showModal(
                modal
            );

            return;
        }

        // =================================================
        // BOTÓN CANCELAR
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
        // MODAL CORREGIR
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
                nombreLimpio
            );

            return;
        }
    }
};