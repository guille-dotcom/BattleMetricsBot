const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const { consultarRaid } = require("../services/rusthelp");

// =====================================================
// CACHE
// =====================================================

const raidCache = new Map();

const CACHE_TIME = 5 * 60 * 1000;

// =====================================================
// UTILIDADES
// =====================================================

function limpiarTexto(texto) {
    return String(texto || "")
        .replace(/\s+/g, " ")
        .trim();
}

function limitarTexto(texto, max = 1024) {
    const limpio = limpiarTexto(texto);

    if (limpio.length <= max) {
        return limpio;
    }

    return limpio.slice(0, max - 3) + "...";
}

// =====================================================
// FORMATEAR RAID
// =====================================================

function formatearRaideo(startingItems, raidingCost) {
    let texto = "";

    // -------------------------------------------------
    // STARTING ITEMS
    // -------------------------------------------------

    if (startingItems && startingItems.length > 0) {
        texto += "**⚡ Starting Items:**\n";

        texto += startingItems
            .map((item, index) => {
                let formato =
                    `> ${index + 1}. **${limpiarTexto(item.herramienta)}**`;

                if (
                    item.tiempo &&
                    item.tiempo !== "N/A"
                ) {
                    formato += ` (⏱️ ${limpiarTexto(item.tiempo)})`;
                }

                if (item.cantidad) {
                    formato += ` [Cant: ${limpiarTexto(item.cantidad)}]`;
                }

                return formato;
            })
            .join("\n");
    }

    // -------------------------------------------------
    // RAIDING COST
    // -------------------------------------------------

    if (raidingCost && raidingCost.length > 0) {
        if (texto) {
            texto += "\n\n";
        }

        texto += "**🔨 Raiding Cost:**\n";

        texto += raidingCost
            .map((item, index) => {
                let formato =
                    `> ${index + 1}. **${limpiarTexto(item.herramienta)}**`;

                if (
                    item.tiempo &&
                    item.tiempo !== "N/A" &&
                    item.tiempo !== ""
                ) {
                    formato += ` (⏱️ ${limpiarTexto(item.tiempo)})`;
                }

                if (item.cantidad) {
                    formato += ` [Cant: ${limpiarTexto(item.cantidad)}]`;
                }

                return formato;
            })
            .join("\n");
    }

    return limitarTexto(
        texto || "No hay datos disponibles."
    );
}

// =====================================================
// FORMATEAR DÓNDE ENCONTRAR
// =====================================================

function crearTextoAmount(items) {
    if (!items || items.length === 0) {
        return "No hay datos disponibles.";
    }

    const texto = items
        .map((item, index) => {
            let formato =
                `> ${index + 1}. **${limpiarTexto(item.herramienta)}**`;

            if (
                item.tiempo &&
                item.tiempo !== "N/A" &&
                item.tiempo !== ""
            ) {
                formato += ` (⏱️ ${limpiarTexto(item.tiempo)})`;
            }

            return formato;
        })
        .join("\n");

    return limitarTexto(texto);
}

// =====================================================
// CREAR EMBED BASE
// =====================================================

function crearEmbed(resultado) {
    return new EmbedBuilder()
        .setTitle(`💥 Raid Calculator: ${resultado.nombre}`)
        .setURL(resultado.url)
        .setColor("#E67E22")
        .setFooter({
            text: "Selecciona una categoría abajo | Fuente: RustHelp"
        })
        .setTimestamp();
}

// =====================================================
// CREAR BOTONES
// =====================================================

function crearBotones(cacheKey) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`raid_raideo_${cacheKey}`)
            .setLabel("Raideo")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🔨"),

        new ButtonBuilder()
            .setCustomId(`raid_donde_${cacheKey}`)
            .setLabel("Dónde encontrar")
            .setStyle(ButtonStyle.Success)
            .setEmoji("🔍")
    );
}

// =====================================================
// COMANDO
// =====================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName("raid")
        .setDescription("Calcula los costos de raid para un objeto de Rust.")
        .addStringOption(option =>
            option
                .setName("objeto")
                .setDescription("Nombre del objeto (ej: puerta de garaje)")
                .setRequired(true)
                .setMaxLength(100)
        ),

    // =================================================
    // EXECUTE
    // =================================================

    async execute(interaction) {
        await interaction.deferReply();

        const query = interaction.options
            .getString("objeto")
            ?.trim();

        if (!query) {
            return interaction.editReply(
                "❌ Debes indicar un objeto."
            );
        }

        console.log(
            `🔨 /raid solicitado por ${interaction.user.tag}: ${query}`
        );

        let resultado;

        try {
            resultado = await consultarRaid(query);
        } catch (error) {
            console.error(
                "❌ Error ejecutando /raid:",
                error
            );

            return interaction.editReply(
                "❌ Ocurrió un error al consultar RustHelp."
            );
        }

        // =================================================
        // SIN RESULTADOS
        // =================================================

        if (!resultado) {
            return interaction.editReply(
                `❌ No se encontró información para **"${query}"**.`
            );
        }

        // =================================================
        // CACHE KEY
        // =================================================

        const cacheKey =
            `${interaction.user.id}_${Date.now()}_${Math.random()
                .toString(36)
                .slice(2, 8)}`;

        raidCache.set(cacheKey, resultado);

        setTimeout(() => {
            raidCache.delete(cacheKey);
        }, CACHE_TIME);

        // =================================================
        // EMBED
        // =================================================

        const embed = crearEmbed(resultado);

        embed.addFields({
            name: "🔨 Raideo",
            value: formatearRaideo(
                resultado.startingItems,
                resultado.raidingCost
            )
        });

        // =================================================
        // BOTONES
        // =================================================

        const row = crearBotones(cacheKey);

        // =================================================
        // RESPUESTA
        // =================================================

        await interaction.editReply({
            embeds: [embed],
            components: [row]
        });
    },

    // =====================================================
    // MANEJAR BOTONES
    // =====================================================

    async manejarBotonRaid(interaction) {
        const customId = interaction.customId;

        if (!customId.startsWith("raid_")) {
            return;
        }

        const parts = customId.split("_");

        if (parts.length < 3) {
            return;
        }

        const tipo = parts[1];

        const cacheKey = parts
            .slice(2)
            .join("_");

        const resultado = raidCache.get(cacheKey);

        // =================================================
        // CACHE EXPIRADO
        // =================================================

        if (!resultado) {
            return interaction.reply({
                content:
                    "⚠️ Estos botones han expirado. " +
                    "Vuelve a ejecutar `/raid`.",
                ephemeral: true
            });
        }

        // =================================================
        // EMBED
        // =================================================

        const embed = crearEmbed(resultado);

        // =================================================
        // RAIDEO
        // =================================================

        if (tipo === "raideo") {
            embed.addFields({
                name: "🔨 Raideo",
                value: formatearRaideo(
                    resultado.startingItems,
                    resultado.raidingCost
                )
            });
        }

        // =================================================
        // DÓNDE ENCONTRAR
        // =================================================

        else if (tipo === "donde") {
            embed.addFields({
                name: "🔍 Dónde encontrar",
                value: crearTextoAmount(
                    resultado.dondeEncontrar
                )
            });
        }

        // =================================================
        // TIPO DESCONOCIDO
        // =================================================

        else {
            return interaction.reply({
                content:
                    "⚠️ Esta opción de raid no es válida.",
                ephemeral: true
            });
        }

        // =================================================
        // RESPONDER
        // =================================================

        try {
            await interaction.update({
                embeds: [embed],
                components: [crearBotones(cacheKey)]
            });
        } catch (error) {
            console.error(
                "❌ Error actualizando botón /raid:",
                error.message
            );
        }
    }
};