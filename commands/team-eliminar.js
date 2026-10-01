const {
    SlashCommandBuilder
} = require("discord.js");

const KickTeamMember =
    require("../models/KickTeamMember");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("team-eliminar")
        .setDescription("Elimina un nombre de la lista disponible para crear Teams.")
        .addStringOption(option =>
            option
                .setName("nombre")
                .setDescription("Nombre que quieres eliminar de la lista.")
                .setRequired(true)
        ),

    async execute(interaction) {
        try {
            const nombre =
                interaction.options
                    .getString("nombre")
                    .trim();

            if (!nombre) {
                return interaction.reply({
                    content: "❌ Debes indicar un nombre.",
                    ephemeral: true
                });
            }

            const eliminado =
                await KickTeamMember.findOneAndDelete({
                    guildId: interaction.guild.id,
                    nombre: nombre
                });

            if (!eliminado) {
                return interaction.reply({
                    content: `❌ **${nombre}** no está en la lista.`,
                    ephemeral: true
                });
            }

            return interaction.reply({
                content: `✅ **${nombre}** fue eliminado de la lista de Teams.`
            });

        } catch (error) {
            console.error(
                "❌ Error en /team-eliminar:",
                error
            );

            if (interaction.replied || interaction.deferred) {
                return interaction.followUp({
                    content: "❌ Ocurrió un error al eliminar el nombre.",
                    ephemeral: true
                });
            }

            return interaction.reply({
                content: "❌ Ocurrió un error al eliminar el nombre.",
                ephemeral: true
            });
        }
    }
};