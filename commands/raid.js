const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { consultarRaid } = require("../services/rusthelp");

const raidCache = new Map();

function crearTextoAmount(items) {
    if (!items || items.length === 0) return "No hay datos disponibles.";
    return items.map((item, index) => {
        let formato = `**${index + 1}. ${item.herramienta}**`;
        if (item.tiempo && item.tiempo !== "N/A" && item.tiempo !== "") {
            formato += ` (⏱️ ${item.tiempo})`;
        }
        return formato;
    }).join("\n");
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("raid")
        .setDescription("Calcula los costos de raid para un objeto de Rust.")
        .addStringOption(option =>
            option.setName("objeto")
                .setDescription("Nombre del objeto (ej: puerta de garaje)")
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();
        const query = interaction.options.getString("objeto");
        const resultado = await consultarRaid(query);

        if (!resultado) {
            return interaction.editReply(`❌ No se encontró información para **"${query}"**.`);
        }

        const cacheKey = `${interaction.user.id}-${Date.now()}`;
        raidCache.set(cacheKey, resultado);
        setTimeout(() => raidCache.delete(cacheKey), 5 * 60 * 1000);

        const embed = new EmbedBuilder()
            .setTitle(`💥 Raid Calculator: ${resultado.nombre}`)
            .setURL(resultado.url)
            .setColor("#E67E22")
            .addFields(
                { name: "💰 Opciones de Raid", value: crearTextoAmount(resultado.explosivosEconomia) }
            )
            .setFooter({ text: "Selecciona una categoría abajo | Fuente: RustHelp" })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`raid_eco_${cacheKey}`).setLabel("Economía").setStyle(ButtonStyle.Primary).setEmoji("🪙"),
            new ButtonBuilder().setCustomId(`raid_cant_${cacheKey}`).setLabel("Cantidad").setStyle(ButtonStyle.Primary).setEmoji("📦"),
            new ButtonBuilder().setCustomId(`raid_melee_${cacheKey}`).setLabel("Melee").setStyle(ButtonStyle.Secondary).setEmoji("⛏️"),
            new ButtonBuilder().setCustomId(`raid_balas_${cacheKey}`).setLabel("Munición").setStyle(ButtonStyle.Secondary).setEmoji("🎯"),
            new ButtonBuilder().setCustomId(`raid_donde_${cacheKey}`).setLabel("Dónde encontrar").setStyle(ButtonStyle.Success).setEmoji("🔍")
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
    },

    async manejarBotonRaid(interaction) {
        // Previene el error de "la interacción falló" si el bot tarda un segundo en procesar
        await interaction.deferUpdate();

        const parts = interaction.customId.split("_");
        if (parts.length < 3) return;

        const tipo = parts[1];
        const cacheKey = parts.slice(2).join("_");
        const resultado = raidCache.get(cacheKey);

        if (!resultado) {
            return interaction.followUp({ content: "⚠️ Estos botones han expirado. Vuelve a ejecutar `/raid`.", ephemeral: true });
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
        } else if (tipo === "donde") {
            embed.addFields({ name: "🔍 Dónde encontrar / Loot", value: crearTextoAmount(resultado.dondeEncontrar) });
        }

        await interaction.editReply({ embeds: [embed] });
    }
};