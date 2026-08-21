const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const {
    consultarRaid
} = require("../services/rusthelp");


// =====================================================
// FORMATEAR NUMEROS
// =====================================================

function formatearNumero(numero) {

    return Number(numero || 0)
        .toLocaleString("es-CL");
}


// =====================================================
// CREAR EMBED EXPLOSIVOS
// =====================================================

function crearEmbedExplosivos(resultado) {

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


    if (
        !resultado.explosivos ||
        resultado.explosivos.length === 0
    ) {

        embed.setDescription(
            "❌ RustHelp no encontró métodos explosivos para este objeto."
        );

        return embed;
    }


    let texto = "";


    resultado.explosivos
        .forEach(
            (raid, indice) => {

                const posiciones = [
                    "🥇",
                    "🥈",
                    "🥉",
                    "4️⃣",
                    "5️⃣"
                ];


                texto +=
                    `${posiciones[indice] || `${indice + 1}️⃣`} **${raid.herramienta}**\n`;


                texto +=
                    `└ Cantidad: **${raid.cantidad}**`;


                if (
                    raid.azufre > 0
                ) {

                    texto +=
                        ` • 🪨 Azufre: **${formatearNumero(raid.azufre)}**`;

                }


                if (
                    raid.tiempo
                ) {

                    texto +=
                        ` • ⏱️ **${raid.tiempo}**`;

                }


                texto += "\n\n";

            }
        );


    embed.setDescription(
        texto
    );


    embed.addFields({

        name:
            "💰 Criterio",

        value:
            "Ordenado de menor a mayor cantidad de **azufre total**."

    });


    embed.setFooter({

        text:
            "Datos obtenidos de RustHelp"

    });


    embed.setTimestamp();


    return embed;
}


// =====================================================
// CREAR EMBED MELEE
// =====================================================

function crearEmbedMelee(resultado) {

    const embed =
        new EmbedBuilder()

            .setTitle(
                `🔨 Raid Calculator — ${resultado.nombre}`
            )

            .setURL(
                resultado.url
            )

            .setColor(
                0x8b5a2b
            );


    if (
        !resultado.melee ||
        resultado.melee.length === 0
    ) {

        embed.setDescription(
            "❌ RustHelp no encontró métodos melee para este objeto."
        );

        return embed;
    }


    let texto = "";


    resultado.melee
        .forEach(
            (raid, indice) => {

                const posiciones = [
                    "🥇",
                    "🥈",
                    "🥉",
                    "4️⃣",
                    "5️⃣"
                ];


                texto +=
                    `${posiciones[indice] || `${indice + 1}️⃣`} **${raid.herramienta}**\n`;


                texto +=
                    `└ Cantidad: **${raid.cantidad}**`;


                if (
                    raid.tiempo
                ) {

                    texto +=
                        ` • ⏱️ **${raid.tiempo}**`;

                }


                texto += "\n\n";

            }
        );


    embed.setDescription(
        texto
    );


    embed.addFields({

        name:
            "🔨 Criterio",

        value:
            "Ordenado de menor a mayor **tiempo de raideo**."

    });


    embed.setFooter({

        text:
            "Datos obtenidos de RustHelp"

    });


    embed.setTimestamp();


    return embed;
}


// =====================================================
// BOTONES
// =====================================================

function crearBotones() {

    return new ActionRowBuilder()
        .addComponents(

            new ButtonBuilder()

                .setCustomId(
                    "raid_explosivos"
                )

                .setLabel(
                    "Explosivos"
                )

                .setEmoji(
                    "💣"
                )

                .setStyle(
                    ButtonStyle.Danger
                ),


            new ButtonBuilder()

                .setCustomId(
                    "raid_melee"
                )

                .setLabel(
                    "Melee"
                )

                .setEmoji(
                    "🔨"
                )

                .setStyle(
                    ButtonStyle.Secondary
                )

        );
}


// =====================================================
// COMANDO
// =====================================================

module.exports = {

    data:

        new SlashCommandBuilder()

            .setName(
                "raid"
            )

            .setDescription(
                "Consulta cuánto cuesta raidear un objeto de Rust"
            )

            .addStringOption(
                option =>
                    option

                        .setName(
                            "item"
                        )

                        .setDescription(
                            "Nombre del objeto que quieres raidear"
                        )

                        .setRequired(
                            true
                        )
            ),


    async execute(interaction) {

        await interaction.deferReply();


        const nombre =
            interaction.options.getString(
                "item"
            );


        try {

            const resultado =
                await consultarRaid(
                    nombre
                );


            if (!resultado) {

                return interaction.editReply(
                    "❌ No encontré ese objeto en RustHelp."
                );

            }


            const embed =
                crearEmbedExplosivos(
                    resultado
                );


            const botones =
                crearBotones();


            await interaction.editReply({

                embeds: [
                    embed
                ],

                components: [
                    botones
                ]

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

    },


    // =================================================
    // MANEJAR BOTONES
    // =================================================

    async manejarBotonRaid(interaction) {

        if (
            !interaction.isButton()
        ) {

            return false;
        }


        if (
            ![
                "raid_explosivos",
                "raid_melee"
            ].includes(
                interaction.customId
            )
        ) {

            return false;
        }


        const mensaje =
            interaction.message;


        const embedActual =
            mensaje.embeds?.[0];


        if (!embedActual) {

            await interaction.reply({

                content:
                    "❌ No pude obtener los datos del raid.",

                ephemeral: true

            });

            return true;
        }


        const url =
            embedActual.url;


        if (!url) {

            await interaction.reply({

                content:
                    "❌ No pude identificar el objeto.",

                ephemeral: true

            });

            return true;
        }


        await interaction.deferUpdate();


        try {

            // =================================================
            // EXTRAER SLUG DESDE URL
            // =================================================

            const partes =
                url.split("/");


            const slug =
                partes[
                    partes.length - 1
                ];


            const resultado =
                await consultarRaid(
                    slug
                );


            if (!resultado) {

                return;
            }


            let nuevoEmbed;


            if (
                interaction.customId ===
                "raid_explosivos"
            ) {

                nuevoEmbed =
                    crearEmbedExplosivos(
                        resultado
                    );

            } else {

                nuevoEmbed =
                    crearEmbedMelee(
                        resultado
                    );

            }


            await interaction.editReply({

                embeds: [
                    nuevoEmbed
                ],

                components: [
                    crearBotones()
                ]

            });


        } catch (error) {

            console.error(
                "❌ Error botón /raid:",
                error
            );

        }


        return true;
    }

};