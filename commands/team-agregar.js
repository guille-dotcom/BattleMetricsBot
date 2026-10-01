const {
    SlashCommandBuilder
} = require("discord.js");

const KickTeamMember =
    require("../models/KickTeamMember");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("team-agregar")
        .setDescription("Agrega un nombre a la lista disponible para crear Teams.")
        .addStringOption(option =>
            option
                .setName("nombre")
                .setDescription("Nombre del jugador que quieres agregar.")
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

            const existente =
                await KickTeamMember.findOne({
                    guildId: interaction.guild.id,
                    nombre: nombre
                });

            if (existente) {
                return interaction.reply({
                    content: `❌ **${nombre}** ya está en la lista.`,
                    ephemeral: true
                });
            }

            await KickTeamMember.create({
                guildId: interaction.guild.id,
                nombre: nombre,
                creadoPor: interaction.user.id
            });

            return interaction.reply({
                content: `✅ **${nombre}** fue agregado a la lista de Teams.`
            });

        } catch (error) {
            console.error(
                "❌ Error en /team-agregar:",
                error
            );

            if (interaction.replied || interaction.deferred) {
                return interaction.followUp({
                    content: "❌ Ocurrió un error al agregar el nombre.",
                    ephemeral: true
                });
            }

            return interaction.reply({
                content: "❌ Ocurrió un error al agregar el nombre.",
                ephemeral: true
            });
        }
    }
};