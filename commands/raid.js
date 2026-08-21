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
// CACHE TEMPORAL DE RAIDS
// =====================================================

const raidsCache = new Map();

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
// CREAR TEXTO DE RECETA
// =====================================================

function crearTextoReceta(raid) {

    if (
        !raid.receta
    ) {
        return "";
    }

    return (
        `\n└ 🧪 **Receta:** ${raid.receta}`
    );
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
        .forEach(
            (raid, indice) => {

                texto +=
                    `${posiciones[indice]} **${raid.herramienta}**\n`;

                texto +=
                    `└ Cantidad: **${raid.cantidad}**`;

                if (
                    raid.polvora > 0
                ) {

                    texto +=
                        ` • 💥 Pólvora: **${formatearNumero(raid.polvora)}**`;
                }

                if (
                    raid.tiempo
                ) {

                    texto +=
                        ` • ⏱️ **${raid.tiempo}**`;
                }

                texto +=
                    crearTextoReceta(
                        raid
                    );

                texto +=
                    "\n\n";
            }
        );

    embed.setDescription(
        texto
    );

    embed.addFields({
        name:
            "💰 Economía",
        value:
            "Top 5 métodos que requieren **menos pólvora total** para fabricar el explosivo necesario."
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
        .forEach(
            (raid, indice) => {

                texto +=
                    `${posiciones[indice]} **${raid.herramienta}**\n`;

                texto +=
                    `└ Cantidad: **${raid.cantidad}**`;

                if (
                    raid.polvora > 0
                ) {

                    texto +=
                        ` • 💥 Pólvora: **${formatearNumero(raid.polvora)}**`;
                }

                if (
                    raid.tiempo
                ) {

                    texto +=
                        ` • ⏱️ **${raid.tiempo}**`;
                }

                texto +=
                    crearTextoReceta(
                        raid
                    );

                texto +=
                    "\n\n";
            }
        );

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

            // =================================================
            // CONSULTAR RUSTHELP
            // =================================================

            const resultado =
                await consultarRaid(
                    nombre
                );

            if (!resultado) {

                return interaction.editReply(
                    "❌ No encontré ese objeto en RustHelp."
                );
            }

            // =================================================
            // EMBED INICIAL
            // =================================================

            const embed =
                crearEmbedEconomia(
                    resultado
                );

            // =================================================
            // ENVIAR
            // =================================================

            await interaction.editReply({

                embeds: [
                    embed
                ],

                components:
                    crearBotones()

            });

            // =================================================
            // OBTENER MENSAJE
            // =================================================

            const mensaje =
                await interaction.fetchReply();

            // =================================================
            // CACHE
            // =================================================

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

        // =================================================
        // CACHE
        // =================================================

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

        // =================================================
        // CREAR EMBED
        // =================================================

        let nuevoEmbed;

        if (
            interaction.customId ===
            "raid_economia"
        ) {

            nuevoEmbed =
                crearEmbedEconomia(
                    resultado
                );

        } else if (
            interaction.customId ===
            "raid_cantidad"
        ) {

            nuevoEmbed =
                crearEmbedCantidad(
                    resultado
                );

        } else if (
            interaction.customId ===
            "raid_explosivos"
        ) {

            nuevoEmbed =
                crearEmbedExplosivos(
                    resultado
                );

        } else if (
            interaction.customId ===
            "raid_melee"
        ) {

            nuevoEmbed =
                crearEmbedMelee(
                    resultado
                );
        }

        // =================================================
        // ACTUALIZAR
        // =================================================

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
        }

        return true;
    }
};