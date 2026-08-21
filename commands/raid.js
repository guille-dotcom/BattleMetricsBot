const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const {
    consultarRaid
} = require("../services/rusthelp");

module.exports = {

    data: new SlashCommandBuilder()

        .setName("raid")

        .setDescription(
            "Consulta cuánto cuesta raidear un objeto de Rust"
        )

        .addStringOption(option =>
            option
                .setName("item")
                .setDescription(
                    "Nombre del objeto que quieres raidear"
                )
                .setRequired(true)
        ),

    async execute(interaction) {

        await interaction.deferReply();

        const nombre =
            interaction.options.getString("item");

        try {

            const resultado =
                await consultarRaid(nombre);

            if (!resultado) {

                return interaction.editReply(
                    "❌ No encontré ese objeto en RustHelp."
                );

            }

            const embed =
                new EmbedBuilder()

                    .setTitle(
                        `💣 Raid Calculator — ${resultado.nombre}`
                    )

                    .setURL(
                        resultado.url
                    )

                    .setColor(
                        0xff5500
                    );

            // =================================================
            // EXPLOSIVOS
            // =================================================

            if (
                resultado.explosivos.length > 0
            ) {

                let textoExplosivos = "";

                for (
                    const raid
                    of resultado.explosivos.slice(0, 8)
                ) {

                    textoExplosivos +=
                        `💥 **${raid.herramienta}**\n` +
                        `└ Cantidad: **${raid.cantidad}**` +
                        ` • Tiempo: **${raid.tiempo}**\n`;

                }

                embed.addFields({
                    name: "💣 Explosivos",
                    value:
                        textoExplosivos ||
                        "No disponible"
                });

            }

            // =================================================
            // MELEE
            // =================================================

            if (
                resultado.melee.length > 0
            ) {

                let textoMelee = "";

                for (
                    const raid
                    of resultado.melee.slice(0, 8)
                ) {

                    textoMelee +=
                        `🔨 **${raid.herramienta}**\n` +
                        `└ Cantidad: **${raid.cantidad}**` +
                        ` • Tiempo: **${raid.tiempo}**\n`;

                }

                embed.addFields({
                    name: "🔨 Melee / Otros",
                    value:
                        textoMelee ||
                        "No disponible"
                });

            }

            embed.setFooter({
                text: "Datos obtenidos de RustHelp"
            });

            embed.setTimestamp();

            await interaction.editReply({
                embeds: [embed]
            });

        } catch (error) {

            console.error(
                "❌ Error comando /raid:",
                error
            );

            await interaction.editReply(
                "❌ Ocurrió un error consultando RustHelp."
            );

        }

    }
};