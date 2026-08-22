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
// CACHE
// =====================================================

const raidsCache =
    new Map();

const CACHE_TIEMPO =
    30 * 60 * 1000;

// =====================================================
// LIMPIAR CACHE
// =====================================================

function limpiarCache() {

    const ahora =
        Date.now();

    for (
        const [
            mensajeId,
            datos
        ]
        of raidsCache.entries()
    ) {

        if (
            ahora - datos.creado >
            CACHE_TIEMPO
        ) {

            raidsCache.delete(
                mensajeId
            );

        }

    }

}

// =====================================================
// FORMATEAR NÚMEROS
// =====================================================

function formatearNumero(numero) {

    return Number(
        numero || 0
    ).toLocaleString(
        "es-CL"
    );

}

// =====================================================
// TEXTO RAID
// =====================================================

function crearTextoRaids(raids) {

    if (
        !raids ||
        raids.length === 0
    ) {

        return null;

    }

    const posiciones = [

        "🥇",
        "🥈",
        "🥉",
        "4️⃣",
        "5️⃣"

    ];

    let texto = "";

    raids
        .slice(0, 10)
        .forEach(
            (raid, indice) => {

                texto +=
                    `${posiciones[indice]} **${raid.herramienta}**\n`;

                texto +=
                    `└ Cantidad: **${raid.cantidad}**`;

                if (
                    Number(raid.polvora) > 0
                ) {

                    texto +=
                        ` • 💥 Pólvora: **${formatearNumero(raid.polvora)}**`;

                }

                if (
                    Number(raid.azufre) > 0
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

                texto +=
                    "\n\n";

            }
        );

    return texto.trim();

}

// =====================================================
// EMBED BASE
// =====================================================

function crearEmbedBase(
    resultado,
    titulo,
    color
) {

    return new EmbedBuilder()

        .setTitle(
            `${titulo} — ${resultado.nombre}`
        )

        .setURL(
            resultado.url
        )

        .setColor(
            color
        )

        .setFooter({

            text:
                "Datos obtenidos de RustHelp"

        })

        .setTimestamp();

}

// =====================================================
// ECONOMÍA
// =====================================================

function crearEmbedEconomia(
    resultado
) {

    const embed =
        crearEmbedBase(
            resultado,
            "💰 Raid Calculator",
            0x2ecc71
        );

    if (
        !resultado.explosivosEconomia ||
        resultado.explosivosEconomia.length === 0
    ) {

        embed.setDescription(
            "❌ RustHelp no pudo obtener métodos explosivos válidos para este objeto."
        );

        return embed;

    }

    embed.setDescription(
        crearTextoRaids(
            resultado.explosivosEconomia
        )
    );

    embed.addFields({

        name:
            "💰 Economía",

        value:
            "Ordenado por la **menor cantidad de pólvora total** necesaria."

    });

    return embed;

}

// =====================================================
// CANTIDAD
// =====================================================

function crearEmbedCantidad(
    resultado
) {

    const embed =
        crearEmbedBase(
            resultado,
            "📦 Raid Calculator",
            0x3498db
        );

    if (
        !resultado.explosivosCantidad ||
        resultado.explosivosCantidad.length === 0
    ) {

        embed.setDescription(
            "❌ No se encontraron métodos explosivos válidos."
        );

        return embed;

    }

    embed.setDescription(
        crearTextoRaids(
            resultado.explosivosCantidad
        )
    );

    embed.addFields({

        name:
            "📦 Cantidad",

        value:
            "Ordenado por la **menor cantidad de explosivos** necesarios."

    });

    return embed;

}

// =====================================================
// EXPLOSIVOS
// =====================================================

function crearEmbedExplosivos(
    resultado
) {

    return crearEmbedCantidad(
        resultado
    );

}

// =====================================================
// MELEE
// =====================================================

function crearEmbedMelee(
    resultado
) {

    const embed =
        crearEmbedBase(
            resultado,
            "🔨 Raid Calculator",
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
        .forEach(
            (raid, indice) => {

                texto +=
                    `${posiciones[indice]} **${raid.herramienta}**\n`;

                texto +=
                    `└ Cantidad: **${raid.cantidad}**`;

                if (
                    raid.tiempo
                ) {

                    texto +=
                        ` • ⏱️ **${raid.tiempo}**`;

                }

                texto +=
                    "\n\n";

            }
        );

    embed.setDescription(
        texto.trim()
    );

    embed.addFields({

        name:
            "🔨 Criterio",

        value:
            "Ordenado de menor a mayor **tiempo de raideo**."

    });

    return embed;

}

// =====================================================
// BOTONES
// =====================================================

function crearBotones() {

    const fila =
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
        fila
    ];

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
                            "Objeto de Rust, por ejemplo: puerta de madera"
                        )

                        .setRequired(
                            true
                        )
            ),

    async execute(
        interaction
    ) {

        await interaction.deferReply();

        const nombre =
            interaction.options.getString(
                "item"
            );

        try {

            console.log(
                `🎯 /raid solicitado: ${nombre}`
            );

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

            const mensaje =
                await interaction.fetchReply();

            limpiarCache();

            raidsCache.set(
                mensaje.id,
                {

                    resultado,

                    creado:
                        Date.now()

                }
            );

            console.log(
                `✅ Raid guardado en cache: ${mensaje.id} → ${resultado.nombre}`
            );

        } catch (error) {

            console.error(
                "❌ Error comando /raid:",
                error
            );

            try {

                await interaction.editReply(
                    "❌ Ocurrió un error consultando RustHelp."
                );

            } catch {

                // Ignorar

            }

        }

    },

    // =================================================
    // BOTONES
    // =================================================

    async manejarBotonRaid(
        interaction
    ) {

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

        limpiarCache();

        const datos =
            raidsCache.get(
                interaction.message.id
            );

        if (!datos) {

            await interaction.reply({

                content:
                    "❌ Los datos de este raid ya no están disponibles. Ejecuta nuevamente `/raid`.",

                ephemeral:
                    true

            });

            return true;

        }

        const resultado =
            datos.resultado;

        let nuevoEmbed;

        switch (
            interaction.customId
        ) {

            case "raid_economia":

                nuevoEmbed =
                    crearEmbedEconomia(
                        resultado
                    );

                break;

            case "raid_cantidad":

                nuevoEmbed =
                    crearEmbedCantidad(
                        resultado
                    );

                break;

            case "raid_explosivos":

                nuevoEmbed =
                    crearEmbedExplosivos(
                        resultado
                    );

                break;

            case "raid_melee":

                nuevoEmbed =
                    crearEmbedMelee(
                        resultado
                    );

                break;

        }

        try {

            await interaction.update({

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

            if (
                !interaction.replied &&
                !interaction.deferred
            ) {

                try {

                    await interaction.reply({

                        content:
                            "❌ No pude actualizar el cálculo.",

                        ephemeral:
                            true

                    });

                } catch {

                    // Ignorar

                }

            }

        }

        return true;

    }

};