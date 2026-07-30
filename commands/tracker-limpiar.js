const {
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlags
} = require("discord.js");

const Tracker = require("../models/TrackerSchema");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("tracker-limpiar")
        .setDescription("Elimina trackers activos de este servidor")
        .addBooleanOption(option =>
            option
                .setName("confirmar")
                .setDescription("Confirma el borrado de todos los trackers")
                .setRequired(true)
        ),

    async execute(interaction) {
        try {
            const confirmar = interaction.options.getBoolean("confirmar");

            if (!confirmar) {
                return await interaction.reply({
                    content: "❌ Cancelado. Debes usar `/tracker-limpiar confirmar:true` para borrar los trackers.",
                    flags: MessageFlags.Ephemeral
                });
            }

            await interaction.deferReply();

            // Borramos de MongoDB todos los trackers que correspondan a este servidor (guildId)
            const resultado = await Tracker.deleteMany({ guildId: interaction.guild.id });
            const eliminados = resultado.deletedCount || 0;

            const embed = new EmbedBuilder()
                .setTitle("🧹 Trackers limpiados")
                .setDescription(
`Se eliminaron **${eliminados}** trackers activos de este servidor.

📡 El sistema seguirá funcionando normalmente.`
                )
                .setColor(0xff0000)
                .setTimestamp()
                .setFooter({
                    text: "RustLogix"
                });

            await interaction.editReply({
                embeds: [embed]
            });

        } catch (error) {
            console.error("ERROR LIMPIANDO TRACKERS:", error);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply("❌ Error limpiando trackers.");
            } else {
                await interaction.reply({
                    content: "❌ Error limpiando trackers.",
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    }
};