const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { consultarRaid } = require("../services/rusthelp");

// Caché en memoria para almacenar temporalmente los resultados y que los botones funcionen
const raidCache = new Map();

// Función auxiliar para formatear los textos de los ítems
function crearTextoAmount(items) {
    if (!items || items.length === 0) return "No hay datos disponibles.";
    
    return items.map((item, index) => {
        let formato = `**${index + 1}. ${item.herramienta}**`;
        if (item.tiempo && item.tiempo !== "N/A") {
            formato += ` (⏱️ ${item.tiempo})`;
        }
        return formato;
    }).join("\n");
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("raid")
        .setDescription("Calcula los costos y métodos de raid para un objeto de Rust.")
        .addStringOption(option =>
            option.setName("objeto")
                .setDescription("Nombre del objeto a raidear (ej: puerta blindada, armario)")
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const query = interaction.options.getString("objeto");
        const resultado = await consultarRaid(query);

        if (!resultado) {
            return interaction.editReply(`❌ No se encontró información de raid para **"${query}"** en RustHelp.`);
        }

        // Guardamos el resultado en caché usando el ID del usuario o de la interacción
        const cacheKey = `${interaction.user.id}-${Date.now()}`;
        raidCache.set(cacheKey, resultado);

        // Limpiar caché antigua después de 5 minutos para no saturar memoria
        setTimeout(() => raidCache.delete(cacheKey), 5 * 60 * 1000);

        const embed = new EmbedBuilder()
            .setTitle(`💥 Raid Calculator: ${resultado.nombre}`)
            .setURL(resultado.url)
            .setColor("#E67E22")
            .addFields(
                { name: "💰 Opciones Principales & Alternativas", value: crearTextoAmount(resultado.explosivosEconomia) }
            )
            .setFooter({ text: `Usa los botones de abajo para cambiar de categoría | Fuente: RustHelp` })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`raid_eco_${cacheKey}`)
                .setLabel("Economía")
                .setStyle(ButtonStyle.Primary)
                .setEmoji("🪙"),
            new ButtonBuilder()
                .setCustomId(`raid_cant_${cacheKey}`)
                .setLabel("Cantidad")
                .setStyle(ButtonStyle.Primary)
                .setEmoji("📦"),
            new ButtonBuilder()
                .setCustomId(`raid_melee_${cacheKey}`)
                .setLabel("Melee")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("⛏️"),
            new ButtonBuilder()
                .setCustomId(`raid_balas_${cacheKey}`)
                .setLabel("Munición")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("🎯")
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
    },

    // Manejador de los botones (debes llamarlo desde tu interactionCreate global)
    async manejarBotonRaid(interaction) {
        const parts = interaction.customId.split("_");
        // customId esperado: raid_[tipo]_[cacheKey]
        if (parts.length < 3) return;

        const tipo = parts[1];
        const cacheKey = parts.slice(2).join("_");

        const resultado = raidCache.get(cacheKey);
        if (!resultado) {
            return interaction.reply({ 
                content: "⚠️ Estos botones han expirado. Por favor, vuelve a ejecutar el comando `/raid`.", 
                ephemeral: true 
            });
        }

        const embed = new EmbedBuilder()
            .setTitle(`💥 Raid Calculator: ${resultado.nombre}`)
            .setURL(resultado.url)
            .setColor("#E67E22")
            .setTimestamp();

        if (tipo === "eco") {
            embed.addFields({ name: "🪙 Opciones de Economía", value: crearTextoAmount(resultado.explosivosEconomia) });
        } else if (tipo === "cant") {
            embed.addFields({ name: "📦 Opciones por Cantidad", value: crearTextoAmount(resultado.explosivosCantidad) });
        } else if (tipo === "melee") {
            embed.addFields({ name: "⛏️ Herramientas Melee", value: crearTextoAmount(resultado.melee) });
        } else if (tipo === "balas") {
            embed.addFields({ name: "🎯 Munición de Raid", value: crearTextoAmount(resultado.balas) });
        }

        await interaction.update({ embeds: [embed] });
    }
};