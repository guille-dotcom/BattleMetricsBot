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

function convertirASegundosVista(tiempo) {
    const texto = String(tiempo || "").toLowerCase().replace(/,/g, ".");
    if (!texto) return 0;
    let total = 0;
    const horas = texto.match(/(\d+(?:\.\d+)?)\s*h/);
    const minutos = texto.match(/(\d+(?:\.\d+)?)\s*m/);
    const segundos = texto.match(/(\d+(?:\.\d+)?)\s*s/);
    if (horas) total += parseFloat(horas[1]) * 3600;
    if (minutos) total += parseFloat(minutos[1]) * 60;
    if (segundos) total += parseFloat(segundos[1]);
    return total;
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

        let linea = `**${index + 1}.** ${nombre}`;

        if (cantidad && cantidad !== "x0" && cantidad !== "0") {
            const cantidadLimpia = cantidad.split(" ")[0].replace(/^x/i, "");
            linea += ` \`×${cantidadLimpia}\``;
        }

        if (tiempo) {
            linea += ` ⏱️ \`${tiempo}\``;
        }

        return linea;
    });

    return limitarTexto(lineas.join("\n"));
}

// =====================================================
// FORMATEAR RAIDING COST (Ordenado por menor tiempo)
// =====================================================

function formatearRaidingCost(items) {
    if (!Array.isArray(items) || items.length === 0) {
        return "No hay datos disponibles.";
    }

    // Ordenamos explícitamente de menor a mayor tiempo
    const itemsOrdenados = [...items].sort((a, b) => {
        return convertirASegundosVista(a.tiempo) - convertirASegundosVista(b.tiempo);
    });

    const lineas = itemsOrdenados.map((item, index) => {
        const nombre = limpiarTexto(item.herramienta);
        const tiempo = limpiarTexto(item.tiempo);
        const cantidad = limpiarTexto(item.cantidad);

        let linea = `**${index + 1}.** ${nombre}`;

        if (cantidad) {
            const cantidadLimpia = cantidad.replace(/^x/i, "");
            linea += ` \`×${cantidadLimpia}\``;
        }

        if (tiempo) {
            linea += ` ⏱️ \`${tiempo}\``;
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

        let linea = `**${index + 1}.** ${nombre}`;

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
    if (
        Array.isArray(resultado.startingItems) &&
        resultado.startingItems.length > 0
    ) {
        embed.addFields({
            name: "⚡ Starting Items",
            value: formatearStartingItems(resultado.startingItems),
            inline: false
        });
    }

    if (
        Array.isArray(resultado.raidingCost) &&
        resultado.raidingCost.length > 0
    ) {
        embed.addFields({
            name: "🔨 Raiding Cost",
            value: formatearRaidingCost(resultado.raidingCost),
            inline: false
        });
    }

    if (
        (!resultado.startingItems || resultado.startingItems.length === 0) &&
        (!resultado.raidingCost || resultado.raidingCost.length === 0)
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
        .setDescription("Calcula los costos de raid para un objeto de Rust.")
        .addStringOption(option =>
            option
                .setName("objeto")
                .setDescription("Nombre del objeto (ej: puerta de garaje)")
                .setRequired(true)
                .setMaxLength(100)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const query = interaction.options.getString("objeto")?.trim();

        if (!query) {
            return interaction.editReply("❌ Debes indicar un objeto.");
        }

        let resultado;

        try {
            resultado = await consultarRaid(query);
        } catch (error) {
            console.error("❌ Error ejecutando /raid:", error);
            return interaction.editReply("❌ Ocurrió un error al consultar RustHelp.");
        }

        if (!resultado) {
            return interaction.editReply(`❌ No se encontró información para **"${query}"**.`);
        }

        const cacheKey = `${interaction.user.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        raidCache.set(cacheKey, resultado);

        setTimeout(() => {
            raidCache.delete(cacheKey);
        }, CACHE_TIME);

        const embed = crearEmbed(resultado);
        agregarInformacionRaid(embed, resultado);

        const row = crearBotones(cacheKey);

        try {
            await interaction.editReply({
                embeds: [embed],
                components: [row]
            });
        } catch (error) {
            console.error("❌ Error enviando respuesta /raid:", error.message);
        }
    },

    async manejarBotonRaid(interaction) {
        const customId = interaction.customId;

        if (!customId.startsWith("raid_")) {
            return;
        }

        const parts = customId.split("_");

        if (parts.length < 3) {
            return;
        }

        // Evita el error de tiempo de respuesta de Discord de inmediato
        await interaction.deferUpdate();

        const tipo = parts[1];
        const cacheKey = parts.slice(2).join("_");
        const resultado = raidCache.get(cacheKey);

        if (!resultado) {
            return interaction.followUp({
                content: "⚠️ Estos botones han expirado. Vuelve a ejecutar `/raid`.",
                ephemeral: true
            });
        }

        const embed = crearEmbed(resultado);

        if (tipo === "raideo") {
            agregarInformacionRaid(embed, resultado);
        } else if (tipo === "donde") {
            embed.addFields({
                name: "🔍 Dónde encontrar",
                value: crearTextoAmount(resultado.dondeEncontrar),
                inline: false
            });
        } else {
            return interaction.followUp({
                content: "⚠️ Esta opción de raid no es válida.",
                ephemeral: true
            });
        }

        try {
            await interaction.editReply({
                embeds: [embed],
                components: [crearBotones(cacheKey)]
            });
        } catch (error) {
            console.error("❌ Error actualizando botón /raid:", error.message);
        }
    }
};