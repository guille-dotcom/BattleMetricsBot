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
// FORMATEAR NÚMEROS
// =====================================================

function formatearNumero(numero) {

    return Number(numero || 0)
        .toLocaleString("es-CL");

}


// =====================================================
// CREAR EMBED ECONOMÍA
// =====================================================

function crearEmbedEconomia(resultado) {

    const embed =
        new EmbedBuilder()

            .setTitle(
                `💰 Raid Calculator — ${resultado.nombre}`
            )

            .setURL(
                resultado.url
            )

            .setColor(
                0x2ecc71
            );


    if (
        !resultado.explosivosEconomia ||
        resultado.explosivosEconomia.length === 0
    ) {

        embed.setDescription(
            "❌ RustHelp no encontró explosivos válidos para este objeto."
        );

        return embed;

    }


    const posiciones = [
        "🥇",
        "🥈",
        "🥉",
        "4️⃣",
        "5️⃣"
    ];


    let texto = "";


    resultado.explosivosEconomia
        .slice(0, 5)
        .forEach((raid, indice) => {

            texto +=
                `${posiciones[indice]} **${raid.herramienta}**\n`;

            texto +=
                `└ Cantidad: **${raid.cantidad}**`;

            texto +=
                ` • 🪨 Azufre: **${formatearNumero(raid.azufre)}**`;

            if (raid.tiempo) {

                texto +=
                    ` • ⏱️ **${raid.tiempo}**`;

            }

            texto += "\n\n";

        });


    embed.setDescription(
        texto
    );


    embed.addFields({

        name:
            "💰 Economía",

        value:
            "Top 5 métodos que requieren **menos azufre total** para raidear este objeto."

    });


    embed.setFooter({

        text:
            "Datos obtenidos de RustHelp"

    });


    embed.setTimestamp();


    return embed;

}


// =====================================================
// CREAR EMBED CANTIDAD
// =====================================================

function crearEmbedCantidad(resultado) {

    const embed =
        new EmbedBuilder()

            .setTitle(
                `📦 Raid Calculator — ${resultado.nombre}`
            )

            .setURL(
                resultado.url
            )

            .setColor(
                0x3498db
            );


    if (
        !resultado.explosivosCantidad ||
        resultado.explosivosCantidad.length === 0
    ) {

        embed.setDescription(
            "❌ RustHelp no encontró explosivos válidos para este objeto."
        );

        return embed;

    }


    const posiciones = [
        "🥇",
        "🥈",
        "🥉",
        "4️⃣",
        "5️⃣"
    ];


    let texto = "";


    resultado.explosivosCantidad
        .slice(0, 5)
        .forEach((raid, indice) => {

            texto +=
                `${posiciones[indice]} **${raid.herramienta}**\n`;

            texto +=
                `└ Cantidad: **${raid.cantidad}**`;

            texto +=
                ` • 🪨 Azufre: **${formatearNumero(raid.azufre)}**`;

            if (raid.tiempo) {

                texto +=
                    ` • ⏱️ **${raid.tiempo}**`;

            }

            texto += "\n\n";

        });


    embed.setDescription(
        texto
    );


    embed.addFields({

        name:
            "📦 Cantidad",

        value:
            "Top 5 métodos que requieren **menos unidades de explosivos** para raidear este objeto."

    });


    embed.setFooter({

        text:
            "Datos obtenidos de RustHelp"

    });


    embed.setTimestamp();


    return embed;

}


// =====================================================
// EMBED EXPLOSIVOS
// =====================================================

function crearEmbedExplosivos(resultado) {

    return crearEmbedEconomia(
        resultado
    );

}


// =====================================================
// EMBED MELEE
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


    const posiciones = [
        "🥇",
        "🥈",
        "🥉",
        "4️⃣",
        "5️⃣"
    ];


    let texto = "";


    resultado.melee
        .slice(0, 5)
        .forEach((raid, indice) => {

            texto +=
                `${posiciones[indice]} **${raid.herramienta}**\n`;

            texto +=
                `└ Cantidad: **${raid.cantidad}**`;

            if (raid.tiempo) {

                texto +=
                    ` • ⏱️ **${raid.tiempo}**`;

            }

            texto += "\n\n";

        });


    embed.setDescription(
        texto
    );


    embed.addFields({

        name:
            "🔨 Criterio",

        value:
            "Top 5 ordenados de menor a mayor **tiempo de raideo**."

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

    const fila1 =
        new ActionRowBuilder()

            .addComponents(

                new ButtonBuilder()

                    .setCustomId(
                        "raid_economia"
                    )

                    .setLabel(
                        "Economía"
                    )

                    .setEmoji(
                        "💰"
                    )

                    .setStyle(
                        ButtonStyle.Success
                    ),


                new ButtonBuilder()

                    .setCustomId(
                        "raid_cantidad"
                    )

                    .setLabel(
                        "Cantidad"
                    )

                    .setEmoji(
                        "📦"
                    )

                    .setStyle(
                        ButtonStyle.Primary
                    ),


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


    return [
        fila1
    ];

}


// =====================================================
// COMANDO /RAID
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
                crearEmbedEconomia(
                    resultado
                );


            await interaction.editReply({

                embeds: [
                    embed
                ],

                components:
                    crearBotones()

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
    // MANEJAR BOTONES RAID
    // =================================================

    async manejarBotonRaid(interaction) {

        if (
            !interaction.isButton()
        ) {

            return false;

        }


        const botonesValidos = [

            "raid_economia",
            "raid_cantidad",
            "raid_explosivos",
            "raid_melee"

        ];


        if (
            !botonesValidos.includes(
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

                ephemeral:
                    true

            });

            return true;

        }


        const url =
            embedActual.url;


        if (!url) {

            await interaction.reply({

                content:
                    "❌ No pude identificar el objeto.",

                ephemeral:
                    true

            });

            return true;

        }


        await interaction.deferUpdate();


        try {

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

                return true;

            }


            let nuevoEmbed;


            // =========================================
            // ECONOMÍA
            // =========================================

            if (
                interaction.customId ===
                "raid_economia"
            ) {

                nuevoEmbed =
                    crearEmbedEconomia(
                        resultado
                    );

            }


            // =========================================
            // CANTIDAD
            // =========================================

            else if (
                interaction.customId ===
                "raid_cantidad"
            ) {

                nuevoEmbed =
                    crearEmbedCantidad(
                        resultado
                    );

            }


            // =========================================
            // EXPLOSIVOS
            // =========================================

            else if (
                interaction.customId ===
                "raid_explosivos"
            ) {

                nuevoEmbed =
                    crearEmbedExplosivos(
                        resultado
                    );

            }


            // =========================================
            // MELEE
            // =========================================

            else {

                nuevoEmbed =
                    crearEmbedMelee(
                        resultado
                    );

            }


            await interaction.editReply({

                embeds: [
                    nuevoEmbed
                ],

                components:
                    crearBotones()

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