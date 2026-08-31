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
    const limpio = String(texto || "").trim();

    if (limpio.length <= max) {
        return limpio;
    }

    return limpio.slice(0, max - 3) + "...";
}

// =====================================================
// FORMATEAR STARTING ITEMS
// =====================================================

function formatearStartingItems(items) {
    if (!Array.isArray(items) || items.length === 0) {
        return "No hay datos disponibles.";
    }

    const lineas = items.map((item, index) => {
        const nombre = limpiarTexto(item.herramienta);
        const tiempo = limpiarTexto(item.tiempo);
        const cantidad = limpiarTexto(item.cantidad);

        let linea = `**${index + 1}. ${nombre}**`;

        if (cantidad) {
            linea += ` — **×${cantidad.replace(/^x/i, "")}**`;
        }

        if (tiempo) {
            linea += ` — ⏱️ **${tiempo}**`;
        }

        return linea;
    });

    return limitarTexto(lineas.join("\n"));
}

// =====================================================
// FORMATEAR RAIDING COST
// =====================================================

function formatearRaidingCost(items) {
    if (!Array.isArray(items) || items.length === 0) {
        return "No hay datos disponibles.";
    }

    const lineas = items.map((item, index) => {
        const nombre = limpiarTexto(item.herramienta);
        const tiempo = limpiarTexto(item.tiempo);
        const cantidad = limpiarTexto(item.cantidad);

        let linea = `**${index + 1}. ${nombre}**`;

        if (cantidad) {
            linea += ` — **×${cantidad.replace(/^x/i, "")}**`;
        }

        if (tiempo) {
            linea += ` — ⏱️ **${tiempo}**`;
        }

        return linea;
    });

    return limitarTexto(lineas.join("\n"));
}

// =====================================================
// FORMATEAR DÓNDE ENCONTRAR
// =====================================================

function crearTextoAmount(items) {
    if (!Array.isArray(items) || items.length === 0) {
        return "No hay datos disponibles.";
    }

    const lineas = items.map((item, index) => {
        const nombre = limpiarTexto(item.herramienta);
        const tiempo = limpiarTexto(item.tiempo);

        let linea = `**${index + 1}. ${nombre}**`;

        if (tiempo) {
            linea += ` — ${tiempo}`;
        }

        return linea;
    });

    return limitarTexto(lineas.join("\n"));
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
            text: "Fuente: RustHelp"
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
// AGREGAR INFORMACIÓN DE RAID
// =====================================================

function agregarInformacionRaid(embed, resultado) {
    // =================================================
    // STARTING ITEMS
    // =================================================

    if (
        Array.isArray(resultado.startingItems) &&
        resultado.startingItems.length > 0
    ) {
        embed.addFields({
            name: "⚡ Starting Items",
            value: formatearStartingItems(
                resultado.startingItems
            ),
            inline: false
        });
    }

    // =================================================
    // RAIDING COST
    // =================================================

    if (
        Array.isArray(resultado.raidingCost) &&
        resultado.raidingCost.length > 0
    ) {
        embed.addFields({
            name: "🔨 Raiding Cost",
            value: formatearRaidingCost(
                resultado.raidingCost
            ),
            inline: false
        });
    }

    // =================================================
    // SIN DATOS
    // =================================================

    if (
        (!resultado.startingItems ||
            resultado.startingItems.length === 0) &&
        (!resultado.raidingCost ||
            resultado.raidingCost.length === 0)
    ) {
        embed.addFields({
            name: "🔨 Raideo",
            value: "No hay datos de raideo disponibles.",
            inline: false
        });
    }
}

// =====================================================
// COMANDO
// =====================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName("raid")
        .setDescription(
            "Calcula los costos de raid para un objeto de Rust."
        )
        .addStringOption(option =>
            option
                .setName("objeto")
                .setDescription(
                    "Nombre del objeto (ej: puerta de garaje)"
                )
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

        agregarInformacionRaid(
            embed,
            resultado
        );

        // =================================================
        // BOTONES
        // =================================================

        const row = crearBotones(cacheKey);

        // =================================================
        // RESPUESTA
        // =================================================

        try {
            await interaction.editReply({
                embeds: [embed],
                components: [row]
            });
        } catch (error) {
            console.error(
                "❌ Error enviando respuesta /raid:",
                error.message
            );
        }
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
            agregarInformacionRaid(
                embed,
                resultado
            );
        }

        // =================================================
        // DÓNDE ENCONTRAR
        // =================================================

        else if (tipo === "donde") {
            embed.addFields({
                name: "🔍 Dónde encontrar",
                value: crearTextoAmount(
                    resultado.dondeEncontrar
                ),
                inline: false
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
                components: [
                    crearBotones(cacheKey)
                ]
            });
        } catch (error) {
            console.error(
                "❌ Error actualizando botón /raid:",
                error.message
            );
        }
    }
};