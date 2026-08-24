const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { consultarRaid } = require("../services/rusthelp");

const raidCache = new Map();

function formatearRaideo(startingItems, raidingCost) {
    let texto = "";

    if (startingItems && startingItems.length > 0) {
        texto += "**⚡ Starting Items:**\n";
        texto += startingItems.map((item, index) => {
            let formato = `> ${index + 1}. **${item.herramienta}**`;
            if (item.tiempo && item.tiempo !== "N/A") formato += ` (⏱️ ${item.tiempo})`;
            if (item.cantidad) formato += ` [Cant: ${item.cantidad}]`;
            return formato;
        }).join("\n");
    }

    if (raidingCost && raidingCost.length > 0) {
        texto += "\n\n**🔨 Raiding Cost:**\n";
        texto += raidingCost.map((item, index) => {
            let formato = `> ${index + 1}. **${item.herramienta}**`;
            if (item.tiempo && item.tiempo !== "N/A") formato += ` (⏱️ ${item.tiempo})`;
            if (item.cantidad) formato += ` [Cant: ${item.cantidad}]`;
            return formato;
        }).join("\n");
    }

    return texto || "No hay datos disponibles.";
}

function crearTextoAmount(items) {
    if (!items || items.length === 0) return "No hay datos disponibles.";
    return items.map((item, index) => {
        let formato = `> ${index + 1}. **${item.herramienta}**`;
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
                { name: "🔨 Raideo", value: formatearRaideo(resultado.startingItems, resultado.raidingCost) }
            )
            .setFooter({ text: "Selecciona una categoría abajo | Fuente: RustHelp" })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`raid_raideo_${cacheKey}`).setLabel("Raideo").setStyle(ButtonStyle.Primary).setEmoji("🔨"),
            new ButtonBuilder().setCustomId(`raid_donde_${cacheKey}`).setLabel("Dónde encontrar").setStyle(ButtonStyle.Success).setEmoji("🔍")
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
    },

    async manejarBotonRaid(interaction) {
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

        if (tipo === "raideo") {
            embed.addFields({ name: "🔨 Raideo (Starting Items & Cost)", value: formatearRaideo(resultado.startingItems, resultado.raidingCost) });
        } else if (tipo === "donde") {
            embed.addFields({ name: "🔍 Dónde encontrar (Looted From)", value: crearTextoAmount(resultado.dondeEncontrar) });
        }

        await interaction.editReply({ embeds: [embed] });
    }
};