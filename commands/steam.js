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
const Tesseract = require("tesseract.js");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BATTLEMETRICS_API =
    "https://api.battlemetrics.com";

const BATTLEMETRICS_SERVER_ID =
    process.env.BATTLEMETRICS_SERVER_ID || "11378166";

const BATTLEMETRICS_TOKEN =
    process.env.BATTLEMETRICS_TOKEN;

// =====================================================
// UTILIDADES
// =====================================================

function normalizarNombre(nombre) {
    return String(nombre || "")
        .trim()
        .toLowerCase();
}

function limpiarOCR(texto) {
    if (!texto) return "";

    return String(texto)
        .replace(/\r/g, "")
        .replace(/\n/g, " ")
        .replace(/\t/g, " ")
        .replace(/\s+/g, " ")
        .replace(/[|{}[\]<>]/g, "")
        .trim();
}

// =====================================================
// OCR
// =====================================================

async function obtenerImagen(url) {
    console.log(`[OCR] Descargando imagen: ${url}`);

    const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 30000,
        headers: {
            "User-Agent": "Mozilla/5.0"
        }
    });

    return Buffer.from(response.data);
}

async function prepararImagen(buffer) {
    console.log("[OCR] Preparando imagen...");

    return await sharp(buffer)
        .rotate()
        .resize({
            width: 2400,
            withoutEnlargement: false
        })
        .grayscale()
        .normalize()
        .sharpen()
        .png()
        .toBuffer();
}

async function detectarNombreOCR(url) {
    console.log("==============================================");
    console.log("[OCR] INICIANDO DETECCIÓN DE NOMBRE");
    console.log("==============================================");

    const imagen = await obtenerImagen(url);
    const imagenPreparada = await prepararImagen(imagen);

    console.log("[OCR] Ejecutando Tesseract...");

    const resultado = await Tesseract.recognize(
        imagenPreparada,
        "eng",
        {
            logger: mensaje => {
                if (mensaje.status === "recognizing text") {
                    const porcentaje = Math.round(
                        (mensaje.progress || 0) * 100
                    );

                    console.log(
                        `[OCR] Progreso: ${porcentaje}%`
                    );
                }
            }
        }
    );

    const texto = resultado?.data?.text || "";

    console.log("[OCR] Texto detectado:");
    console.log(texto);

    const lineas = texto
        .split(/\r?\n/)
        .map(linea => limpiarOCR(linea))
        .filter(Boolean);

    let nombre = "";

    const candidatas = lineas.filter(linea =>
        linea.length >= 2 &&
        linea.length <= 40
    );

    if (candidatas.length) {
        candidatas.sort(
            (a, b) => a.length - b.length
        );

        nombre = candidatas[0];
    }

    if (!nombre) {
        nombre = limpiarOCR(texto);
    }

    console.log(
        `[OCR] Nombre final detectado: "${nombre}"`
    );

    console.log("==============================================");

    return nombre;
}

// =====================================================
// BATTLEMETRICS
// =====================================================

async function buscarEnBattleMetrics(nombre) {
    if (!BATTLEMETRICS_TOKEN) {
        throw new Error(
            "Falta BATTLEMETRICS_TOKEN en las variables de entorno."
        );
    }

    console.log("==============================================");
    console.log(
        `[BM] BUSCANDO NOMBRE EXACTO: "${nombre}"`
    );
    console.log(
        `[BM] SERVIDOR: ${BATTLEMETRICS_SERVER_ID}`
    );
    console.log("==============================================");

    const response = await axios.get(
        `${BATTLEMETRICS_API}/servers/${BATTLEMETRICS_SERVER_ID}`,
        {
            params: {
                include: "player,identifier"
            },

            headers: {
                Authorization:
                    `Bearer ${BATTLEMETRICS_TOKEN}`,

                Accept:
                    "application/json"
            },

            timeout: 30000
        }
    );

    const body = response.data;

    const included = Array.isArray(body?.included)
        ? body.included
        : [];

    console.log(
        `[BM] Recursos incluidos: ${included.length}`
    );

    const jugadores = included.filter(
        recurso =>
            recurso &&
            recurso.type === "player"
    );

    console.log(
        `[BM] Jugadores encontrados: ${jugadores.length}`
    );

    const nombreBuscado =
        normalizarNombre(nombre);

    const coincidencias =
        jugadores.filter(jugador => {
            const nombreBM =
                jugador?.attributes?.name;

            return (
                normalizarNombre(nombreBM) ===
                nombreBuscado
            );
        });

    console.log(
        `[BM] Coincidencias exactas: ${coincidencias.length}`
    );

    return coincidencias.map(jugador => ({
        battlemetricsId:
            String(jugador.id),

        nombre:
            jugador?.attributes?.name ||
            nombre
    }));
}

// =====================================================
// EMBED
// =====================================================

function crearEmbed(jugador) {
    const nombre = jugador.nombre;

    const battlemetricsURL =
        `https://www.battlemetrics.com/players/${jugador.battlemetricsId}`;

    const steamIDSearchURL =
        `https://www.steamid.com/search?q=${encodeURIComponent(nombre)}`;

    return new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle(`🎮 ${nombre}`)
        .addFields(
            {
                name: "🔎 Name Search",
                value:
                    `[Abrir búsqueda en SteamID.com](${steamIDSearchURL})`,
                inline: false
            },
            {
                name: "👤 BattleMetrics",
                value:
                    `[${nombre}](${battlemetricsURL})`,
                inline: false
            }
        )
        .setFooter({
            text:
                `BattleMetrics ID: ${jugador.battlemetricsId}`
        });
}

// =====================================================
// EJECUTAR BÚSQUEDA
// =====================================================

async function ejecutarBusqueda(
    interaction,
    nombre
) {
    const jugadores =
        await buscarEnBattleMetrics(nombre);

    if (!jugadores.length) {
        return interaction.editReply({
            content:
                `❌ No encontré ningún jugador con el nombre exacto **${nombre}** en el servidor configurado de BattleMetrics.`,
            embeds: [],
            components: []
        });
    }

    const embeds =
        jugadores.map(
            jugador => crearEmbed(jugador)
        );

    await interaction.editReply({
        content:
            `🔎 Resultados para **${nombre}** — ${jugadores.length} coincidencia(s)`,
        embeds:
            embeds.slice(0, 10),
        components: []
    });

    for (
        let i = 10;
        i < embeds.length;
        i += 10
    ) {
        await interaction.followUp({
            embeds:
                embeds.slice(i, i + 10)
        });
    }

    console.log("✅ Búsqueda terminada");
}

// =====================================================
// ERROR
// =====================================================

async function manejarError(
    interaction,
    error
) {
    console.error(
        "=============================================="
    );

    console.error("❌ ERROR EN /STEAM");

    console.error(
        error.response?.data ||
        error.message ||
        error
    );

    console.error(
        "=============================================="
    );

    let mensaje =
        "❌ Ocurrió un error al consultar BattleMetrics.";

    if (
        error.response?.status === 401 ||
        error.response?.status === 403
    ) {
        mensaje =
            "❌ BattleMetrics rechazó la solicitud. Revisa `BATTLEMETRICS_TOKEN`.";
    }

    if (
        error.response?.status === 429
    ) {
        mensaje =
            "⏳ BattleMetrics está limitando las solicitudes. Inténtalo nuevamente en unos momentos.";
    }

    try {
        await interaction.editReply({
            content: mensaje,
            embeds: [],
            components: []
        });
    } catch (discordError) {
        console.error(
            "❌ No se pudo enviar el error:",
            discordError.message
        );
    }
}

// =====================================================
// MODAL
// =====================================================

function crearModalCorreccion(
    nombre
) {
    const input =
        new TextInputBuilder()
            .setCustomId(
                "steam_nombre_corregido"
            )
            .setLabel(
                "Nombre del jugador"
            )
            .setStyle(
                TextInputStyle.Short
            )
            .setRequired(true)
            .setMaxLength(100)
            .setValue(nombre || "");

    const row =
        new ActionRowBuilder()
            .addComponents(input);

    return new ModalBuilder()
        .setCustomId(
            "steam_modal_corregir"
        )
        .setTitle(
            "Corregir nombre"
        )
        .addComponents(row);
}

// =====================================================
// COMANDO
// =====================================================

module.exports = {
    data:
        new SlashCommandBuilder()
            .setName("steam")
            .setDescription(
                "Busca un jugador por nombre o captura de Rust"
            )

            .addStringOption(option =>
                option
                    .setName("nombre")
                    .setDescription(
                        "Nombre exacto del jugador"
                    )
                    .setRequired(false)
            )

            .addAttachmentOption(option =>
                option
                    .setName("captura")
                    .setDescription(
                        "Captura de Rust donde aparece el nombre"
                    )
                    .setRequired(false)
            ),

    async execute(interaction) {
        console.log("🎯 Ejecutando /steam");

        const nombre =
            interaction.options.getString(
                "nombre"
            );

        const captura =
            interaction.options.getAttachment(
                "captura"
            );

        console.log(
            `[STEAM] Nombre: ${nombre || "NINGUNO"}`
        );

        console.log(
            `[STEAM] Captura: ${
                captura
                    ? captura.url
                    : "NINGUNA"
            }`
        );

        if (!nombre && !captura) {
            return interaction.reply({
                content:
                    "❌ Debes proporcionar un **nombre** o una **captura de Rust**."
            });
        }

        // =================================================
        // NOMBRE ESCRITO
        // =================================================

        if (nombre) {
            await interaction.deferReply();

            try {
                await ejecutarBusqueda(
                    interaction,
                    nombre.trim()
                );
            } catch (error) {
                await manejarError(
                    interaction,
                    error
                );
            }

            return;
        }

        // =================================================
        // CAPTURA
        // =================================================

        await interaction.deferReply();

        try {
            if (
                !captura.contentType ||
                !captura.contentType.startsWith(
                    "image/"
                )
            ) {
                return interaction.editReply({
                    content:
                        "❌ El archivo debe ser una imagen."
                });
            }

            const nombreDetectado =
                await detectarNombreOCR(
                    captura.url
                );

            if (
                !nombreDetectado ||
                nombreDetectado.length < 2
            ) {
                return interaction.editReply({
                    content:
                        "❌ No pude detectar el nombre en la captura.\n\n" +
                        "Prueba con una captura donde el nombre se vea más grande o usa `/steam nombre:`."
                });
            }

            if (!interaction.client.steamOCR) {
                interaction.client.steamOCR =
                    new Map();
            }

            const id =
                interaction.id;

            interaction.client.steamOCR.set(
                id,
                {
                    nombre:
                        nombreDetectado,

                    usuario:
                        interaction.user.id,

                    creado:
                        Date.now()
                }
            );

            const embed =
                new EmbedBuilder()
                    .setColor("#FEE75C")
                    .setTitle(
                        "🔍 Nombre detectado"
                    )
                    .setDescription(
                        `El OCR detectó:\n\n**${nombreDetectado}**\n\n` +
                        "¿Es correcto?"
                    );

            const botones =
                new ActionRowBuilder()
                    .addComponents(

                        new ButtonBuilder()
                            .setCustomId(
                                `steam_ocr_buscar:${id}`
                            )
                            .setLabel(
                                "Buscar"
                            )
                            .setEmoji("✅")
                            .setStyle(
                                ButtonStyle.Success
                            ),

                        new ButtonBuilder()
                            .setCustomId(
                                `steam_ocr_corregir:${id}`
                            )
                            .setLabel(
                                "Corregir"
                            )
                            .setEmoji("✏️")
                            .setStyle(
                                ButtonStyle.Primary
                            ),

                        new ButtonBuilder()
                            .setCustomId(
                                `steam_ocr_cancelar:${id}`
                            )
                            .setLabel(
                                "Cancelar"
                            )
                            .setEmoji("❌")
                            .setStyle(
                                ButtonStyle.Danger
                            )
                    );

            await interaction.editReply({
                embeds: [embed],
                components: [botones]
            });

        } catch (error) {
            console.error(
                "[OCR] ERROR:",
                error
            );

            await interaction.editReply({
                content:
                    "❌ No pude procesar la captura."
            });
        }
    }
};

// =====================================================
// MANEJADOR DE BOTONES Y MODAL
// =====================================================

module.exports.handleInteraction =
    async function (
        interaction
    ) {

        // =================================================
        // BOTONES
        // =================================================

        if (interaction.isButton()) {

            if (
                !interaction.customId.startsWith(
                    "steam_ocr_"
                )
            ) {
                return false;
            }

            const partes =
                interaction.customId.split(":");

            const accion =
                partes[0];

            const id =
                partes[1];

            const datos =
                interaction.client.steamOCR?.get(
                    id
                );

            if (!datos) {
                return interaction.reply({
                    content:
                        "❌ Esta búsqueda expiró. Ejecuta `/steam` nuevamente.",
                    ephemeral: true
                });
            }

            if (
                datos.usuario !==
                interaction.user.id
            ) {
                return interaction.reply({
                    content:
                        "❌ Solo la persona que inició esta búsqueda puede usar estos botones.",
                    ephemeral: true
                });
            }

            // =============================================
            // CANCELAR
            // =============================================

            if (
                accion ===
                "steam_ocr_cancelar"
            ) {
                interaction.client.steamOCR.delete(
                    id
                );

                await interaction.update({
                    content:
                        "❌ Búsqueda cancelada.",
                    embeds: [],
                    components: []
                });

                return true;
            }

            // =============================================
            // CORREGIR
            // =============================================

            if (
                accion ===
                "steam_ocr_corregir"
            ) {
                if (
                    !interaction.client.steamOCRModal
                ) {
                    interaction.client.steamOCRModal =
                        new Map();
                }

                interaction.client.steamOCRModal.set(
                    interaction.user.id,
                    id
                );

                const modal =
                    crearModalCorreccion(
                        datos.nombre
                    );

                await interaction.showModal(
                    modal
                );

                return true;
            }

            // =============================================
            // BUSCAR
            // =============================================

            if (
                accion ===
                "steam_ocr_buscar"
            ) {
                await interaction.deferUpdate();

                try {
                    const nombre =
                        datos.nombre;

                    interaction.client.steamOCR.delete(
                        id
                    );

                    await interaction.editReply({
                        content:
                            `🔎 Buscando **${nombre}**...`,
                        embeds: [],
                        components: []
                    });

                    await ejecutarBusqueda(
                        interaction,
                        nombre
                    );

                } catch (error) {
                    await manejarError(
                        interaction,
                        error
                    );
                }

                return true;
            }
        }

        // =================================================
        // MODAL
        // =================================================

        if (
            interaction.isModalSubmit()
        ) {

            if (
                interaction.customId !==
                "steam_modal_corregir"
            ) {
                return false;
            }

            const id =
                interaction.client.steamOCRModal?.get(
                    interaction.user.id
                );

            if (!id) {
                return interaction.reply({
                    content:
                        "❌ Esta corrección expiró.",
                    ephemeral: true
                });
            }

            const datos =
                interaction.client.steamOCR?.get(
                    id
                );

            if (!datos) {
                return interaction.reply({
                    content:
                        "❌ Esta búsqueda expiró.",
                    ephemeral: true
                });
            }

            const nuevoNombre =
                interaction.fields
                    .getTextInputValue(
                        "steam_nombre_corregido"
                    )
                    .trim();

            if (!nuevoNombre) {
                return interaction.reply({
                    content:
                        "❌ El nombre no puede estar vacío.",
                    ephemeral: true
                });
            }

            datos.nombre =
                nuevoNombre;

            interaction.client.steamOCR.set(
                id,
                datos
            );

            interaction.client.steamOCRModal.delete(
                interaction.user.id
            );

            const embed =
                new EmbedBuilder()
                    .setColor("#57F287")
                    .setTitle(
                        "🔍 Nombre confirmado"
                    )
                    .setDescription(
                        `Nombre a buscar:\n\n**${nuevoNombre}**\n\n` +
                        "¿Quieres realizar la búsqueda?"
                    );

            const botones =
                new ActionRowBuilder()
                    .addComponents(

                        new ButtonBuilder()
                            .setCustomId(
                                `steam_ocr_buscar:${id}`
                            )
                            .setLabel(
                                "Buscar"
                            )
                            .setEmoji("✅")
                            .setStyle(
                                ButtonStyle.Success
                            ),

                        new ButtonBuilder()
                            .setCustomId(
                                `steam_ocr_corregir:${id}`
                            )
                            .setLabel(
                                "Corregir"
                            )
                            .setEmoji("✏️")
                            .setStyle(
                                ButtonStyle.Primary
                            ),

                        new ButtonBuilder()
                            .setCustomId(
                                `steam_ocr_cancelar:${id}`
                            )
                            .setLabel(
                                "Cancelar"
                            )
                            .setEmoji("❌")
                            .setStyle(
                                ButtonStyle.Danger
                            )
                    );

            await interaction.reply({
                embeds: [embed],
                components: [botones]
            });

            return true;
        }

        return false;
    };