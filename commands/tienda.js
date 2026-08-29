const {
    SlashCommandBuilder
} = require("discord.js");

const {
    publicarTiendaManual
} = require("../services/rustStore");

module.exports = {

    data:
        new SlashCommandBuilder()

            .setName(
                "tienda"
            )

            .setDescription(
                "Muestra la tienda semanal actual de Rust"
            ),

    async execute(
        interaction
    ) {

        await interaction.deferReply();

        try {

            await publicarTiendaManual(
                interaction
            );

        } catch (error) {

            console.error(
                "❌ ERROR COMANDO /TIENDA:",
                error
            );

            await interaction.editReply({

                content:
                    "❌ No pude obtener la tienda de Rust desde Steam en este momento."

            });

        }

    }

};