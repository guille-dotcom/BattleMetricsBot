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
            ahora -
                datos.creado >
            CACHE_TIEMPO
        ) {

            raidsCache.delete(
                mensajeId
            );
        }
    }
}

// =====================================================
// FORMATEAR NUMEROS
// =====================================================

function formatearNumero(
    numero
) {

    return Number(
        numero || 0
    ).toLocaleString(
        "es-CL"
    );
}

// =====================================================
// MATERIALES
// =====================================================

function crearTextoMateriales(
    raid
) {

    if (
        !raid ||
        !Array.isArray(
            raid.ingredientes
        ) ||
        raid.ingredientes.length === 0
    ) {

        return "Sin materiales.";
    }

    const lineas = [];

    for (
        const ingrediente
        of raid.ingredientes
    ) {

        const nombre =
            String(
                ingrediente.nombre ||
                ""
            )
                .replace(
                    /\s+/g,
                    " "
                )
                .trim();

        const cantidad =
            Number(
                ingrediente.cantidad ||
                0
            );

        if (
            !nombre ||
            cantidad <= 0
        ) {
            continue;
        }

        const normalizado =
            nombre
                .toLowerCase()
                .normalize("NFD")
                .replace(
                    /[\u0300-\u036f]/g,
                    ""
                );

        let emoji =
            "📦";

        if (
            normalizado.includes(
                "sulfur"
            ) ||
            normalizado.includes(
                "azufre"
            )
        ) {

            emoji =
                "🪨";

        } else if (
            normalizado.includes(
                "charcoal"
            ) ||
            normalizado.includes(
                "carbon"
            )
        ) {

            emoji =
                "🪵";

        } else if (
            normalizado.includes(
                "metal fragments"
            ) ||
            normalizado.includes(
                "metal fragment"
            ) ||
            normalizado.includes(
                "fragmentos de metal"
            )
        ) {

            emoji =
                "🔩";

        } else if (
            normalizado.includes(
                "metal pipe"
            ) ||
            normalizado.includes(
                "tubo de metal"
            ) ||
            normalizado.includes(
                "tuberia metalica"
            )
        ) {

            emoji =
                "🔧";

        } else if (
            normalizado.includes(
                "low grade"
            )
        ) {

            emoji =
                "🛢️";

        } else if (
            normalizado.includes(
                "cloth"
            ) ||
            normalizado.includes(
                "tela"
            )
        ) {

            emoji =
                "🧵";

        } else if (
            normalizado.includes(
                "rope"
            ) ||
            normalizado.includes(
                "cuerda"
            )
        ) {

            emoji =
                "🪢";

        } else if (
            normalizado.includes(
                "tech trash"
            )
        ) {

            emoji =
                "💻";
        }

        lineas.push(
            `${emoji} **${nombre}:** ${formatearNumero(cantidad)}`
        );
    }

    return lineas.length > 0
        ? lineas.join("\n")
        : "Sin materiales.";
}

// =====================================================
// TEXTO RAID
// =====================================================

function crearTextoRaids(
    raids
) {

    if (
        !Array.isArray(raids) ||
        raids.length === 0
    ) {

        return null;
    }

    const posiciones = [
        "🥇",
        "🥈",
        "🥉",
        "4️⃣",
        "5️⃣",
        "6️⃣",
        "7️⃣",
        "8️⃣",
        "9️⃣",
        "🔟"
    ];

    const bloques = [];

    raids
        .slice(0, 10)
        .forEach(
            (
                raid,
                indice
            ) => {

                let bloque =
                    `${
                        posiciones[indice]
                    } **${
                        raid.herramienta ||
                        "Método desconocido"
                    }**\n`;

                bloque +=
                    `> 📦 Cantidad: **${formatearNumero(
                        raid.cantidad
                    )}**`;

                if (
                    Number(
                        raid.azufre ||
                        0
                    ) > 0
                ) {

                    bloque +=
                        `\n> 🪨 Azufre total: **${formatearNumero(
                            raid.azufre
                        )}**`;
                }

                if (
                    raid.tiempo
                ) {

                    bloque +=
                        `\n> ⏱️ Tiempo: **${raid.tiempo}**`;
                }

                const materiales =
                    crearTextoMateriales(
                        raid
                    );

                if (
                    materiales !==
                    "Sin materiales."
                ) {

                    bloque +=
                        `\n\n> **Raw Material Cost:**\n${materiales}`;
                }

                bloques.push(
                    bloque
                );
            }
        );

    return bloques.join(
        "\n\n"
    );
}

// =====================================================
// EMBED BASE
// =====================================================

function crearEmbedBase(
    resultado,
    titulo,
    color
) {

    const embed =
        new EmbedBuilder()
            .setTitle(
                `${titulo} — ${
                    resultado.nombre ||
                    "Objeto"
                }`
            )
            .setColor(
                color
            )
            .setFooter({
                text:
                    "Datos obtenidos de RustHelp"
            })
            .setTimestamp();

    if (
        resultado.url
    ) {

        embed.setURL(
            resultado.url
        );
    }

    return embed;
}

// =====================================================
// ECONOMIA
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
        !Array.isArray(
            resultado.explosivosEconomia
        ) ||
        resultado.explosivosEconomia.length ===
            0
    ) {

        embed.setDescription(
            "❌ RustHelp no pudo encontrar métodos explosivos válidos."
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
            "💰 Orden",

        value:
            "Ordenado por el menor costo de **Raw Material Cost**."
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
        !Array.isArray(
            resultado.explosivosCantidad
        ) ||
        resultado.explosivosCantidad.length ===
            0
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
            "📦 Orden",

        value:
            "Ordenado por la menor cantidad de explosivos."
    });

    return embed;
}

// =====================================================
// EXPLOSIVOS
// =====================================================

function crearEmbedExplosivos(
    resultado
) {

    const embed =
        crearEmbedBase(
            resultado,
            "💣 Explosivos",
            0xe74c3c
        );

    if (
        !Array.isArray(
            resultado.explosivos
        ) ||
        resultado.explosivos.length ===
            0
    ) {

        embed.setDescription(
            "❌ No se encontraron explosivos válidos."
        );

        return embed;
    }

    embed.setDescription(
        crearTextoRaids(
            resultado.explosivos
        )
    );

    embed.addFields({
        name:
            "💣 Métodos de raideo",

        value:
            "Explosivos disponibles para destruir este objeto."
    });

    return embed;
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
        !Array.isArray(
            resultado.melee
        ) ||
        resultado.melee.length ===
            0
    ) {

        embed.setDescription(
            "❌ RustHelp no encontró métodos melee para este objeto."
        );

        return embed;
    }

    embed.setDescription(
        crearTextoRaids(
            resultado.melee
        )
    );

    embed.addFields({
        name:
            "🔨 Orden",

        value:
            "Ordenado de menor a mayor tiempo de raideo."
    });

    return embed;
}

// =====================================================
// MUNICION
// =====================================================

function crearEmbedMunicion(
    resultado
) {

    const embed =
        crearEmbedBase(
            resultado,
            "🔫 Munición",
            0xf1c40f
        );

    if (
        !Array.isArray(
            resultado.balas
        ) ||
        resultado.balas.length ===
            0
    ) {

        embed.setDescription(
            "❌ RustHelp no encontró munición para este objeto."
        );

        return embed;
    }

    embed.setDescription(
        crearTextoRaids(
            resultado.balas
        )
    );

    embed.addFields({
        name:
            "🔫 Munición",

        value:
            "Munición disponible para destruir este objeto."
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
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        "raid_municion"
                    )
                    .setLabel(
                        "Munición"
                    )
                    .setEmoji(
                        "🔫"
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

    // =================================================
    // EXECUTE
    // =================================================

    async execute(
        interaction
    ) {

        await interaction.deferReply();

        const nombre =
            interaction.options
                .getString(
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

                await interaction.editReply(
                    "❌ No encontré ese objeto en RustHelp."
                );

                return;
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
                    resultado:
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
                // Ignorar error secundario
            }
        }
    },

    // =================================================
    // MANEJAR BOTONES RAID
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

            "raid_melee",

            "raid_municion"
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

            case "raid_municion":

                nuevoEmbed =
                    crearEmbedMunicion(
                        resultado
                    );

                break;

            default:

                return false;
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

            try {

                if (
                    !interaction.replied &&
                    !interaction.deferred
                ) {

                    await interaction.reply({

                        content:
                            "❌ No pude actualizar el cálculo.",

                        ephemeral:
                            true
                    });
                }

            } catch {
                // Ignorar
            }
        }

        return true;
    }
};