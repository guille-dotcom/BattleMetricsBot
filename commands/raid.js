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
// NORMALIZAR TEXTO
// =====================================================

function normalizarTexto(
    texto
) {

    return String(
        texto || ""
    )
        .normalize("NFD")
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .toLowerCase()
        .replace(
            /[^a-z0-9\s]/g,
            " "
        )
        .replace(
            /\s+/g,
            " "
        )
        .trim();
}

// =====================================================
// OBTENER COMPONENTES DE AMOUNT
// =====================================================
//
// Ejemplo:
//
// Rocket ×1
// Explosive 5.56 ×8
//
// Se muestra:
//
// 🚀 Rocket ×1
// 🔫 Explosive 5.56 ×8
//
// =====================================================

function obtenerComponentesRaid(
    raid
) {

    if (
        !raid
    ) {
        return [];
    }

    if (
        Array.isArray(
            raid.componentes
        ) &&
        raid.componentes.length > 0
    ) {

        return raid.componentes;
    }

    if (
        Array.isArray(
            raid.amount
        ) &&
        raid.amount.length > 0
    ) {

        return raid.amount;
    }

    if (
        Array.isArray(
            raid.ingredientes
        ) &&
        raid.ingredientes.length > 0
    ) {

        return raid.ingredientes;
    }

    return [];
}

// =====================================================
// EMOJI DE ITEM
// =====================================================

function obtenerEmojiItem(
    nombre
) {

    const normalizado =
        normalizarTexto(
            nombre
        );

    if (
        normalizado.includes(
            "rocket"
        ) &&
        !normalizado.includes(
            "hv"
        )
    ) {

        return "🚀";
    }

    if (
        normalizado.includes(
            "high velocity"
        ) ||
        normalizado.includes(
            "hv rocket"
        )
    ) {

        return "🚀";
    }

    if (
        normalizado.includes(
            "c4"
        ) ||
        normalizado.includes(
            "timed explosive"
        )
    ) {

        return "💣";
    }

    if (
        normalizado.includes(
            "explosive 5 56"
        ) ||
        normalizado.includes(
            "explosive 556"
        )
    ) {

        return "🔫";
    }

    if (
        normalizado.includes(
            "satchel"
        )
    ) {

        return "💰";
    }

    if (
        normalizado.includes(
            "beancan"
        )
    ) {

        return "💣";
    }

    if (
        normalizado.includes(
            "grenade"
        )
    ) {

        return "💣";
    }

    if (
        normalizado.includes(
            "propane"
        )
    ) {

        return "🛢️";
    }

    if (
        normalizado.includes(
            "pickaxe"
        ) ||
        normalizado.includes(
            "pico"
        ) ||
        normalizado.includes(
            "icepick"
        ) ||
        normalizado.includes(
            "piolet"
        )
    ) {

        return "⛏️";
    }

    if (
        normalizado.includes(
            "hatchet"
        ) ||
        normalizado.includes(
            "hacha"
        )
    ) {

        return "🪓";
    }

    if (
        normalizado.includes(
            "chainsaw"
        ) ||
        normalizado.includes(
            "motosierra"
        )
    ) {

        return "🪚";
    }

    if (
        normalizado.includes(
            "jackhammer"
        )
    ) {

        return "🔨";
    }

    if (
        normalizado.includes(
            "hammer"
        ) ||
        normalizado.includes(
            "martillo"
        )
    ) {

        return "🔨";
    }

    if (
        normalizado.includes(
            "sword"
        ) ||
        normalizado.includes(
            "espada"
        )
    ) {

        return "⚔️";
    }

    if (
        normalizado.includes(
            "spear"
        ) ||
        normalizado.includes(
            "lanza"
        )
    ) {

        return "🔱";
    }

    if (
        normalizado.includes(
            "machete"
        )
    ) {

        return "🔪";
    }

    return "📦";
}

// =====================================================
// CREAR TEXTO DE AMOUNT
// =====================================================

function crearTextoAmount(
    raid
) {

    const componentes =
        obtenerComponentesRaid(
            raid
        );

    // =================================================
    // SI TENEMOS COMPONENTES
    // =================================================

    if (
        componentes.length > 0
    ) {

        const lineas = [];

        for (
            const componente
            of componentes
        ) {

            const nombre =
                String(
                    componente.nombre ||
                    ""
                )
                    .replace(
                        /\s+/g,
                        " "
                    )
                    .trim();

            const cantidad =
                Number(
                    componente.cantidad ||
                    0
                );

            if (
                !nombre ||
                cantidad <= 0
            ) {
                continue;
            }

            const emoji =
                obtenerEmojiItem(
                    nombre
                );

            lineas.push(
                `${emoji} **${nombre}:** ×${formatearNumero(cantidad)}`
            );
        }

        if (
            lineas.length > 0
        ) {

            return lineas.join(
                "\n"
            );
        }
    }

    // =================================================
    // FALLBACK
    // =================================================

    if (
        raid.cantidadTexto
    ) {

        return `📦 **${raid.cantidadTexto}**`;
    }

    if (
        raid.cantidad
    ) {

        return `📦 **×${formatearNumero(
            raid.cantidad
        )}**`;
    }

    return "Sin cantidad.";
}

// =====================================================
// TEXTO RAID
// =====================================================

function crearTextoRaids(
    raids
) {

    if (
        !Array.isArray(
            raids
        ) ||
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
                        posiciones[indice] ||
                        `${indice + 1}️⃣`
                    } **${
                        raid.herramienta ||
                        "Método desconocido"
                    }**\n`;

                // =================================================
                // AMOUNT
                // =================================================

                bloque +=
                    `> 📦 **Cantidad a usar:**\n`;

                const amount =
                    crearTextoAmount(
                        raid
                    );

                const amountConFormato =
                    amount
                        .split("\n")
                        .map(
                            linea =>
                                `> ${linea}`
                        )
                        .join("\n");

                bloque +=
                    amountConFormato;

                // =================================================
                // TIEMPO
                // =================================================

                if (
                    raid.tiempo
                ) {

                    bloque +=
                        `\n> ⏱️ **Tiempo:** ${raid.tiempo}`;
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
//
// 3 primeras recomendadas de RustHelp
// +
// 7 adicionales ordenadas por Raw Material Cost.
//
// IMPORTANTE:
// El Raw Material Cost NO se muestra.
//
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
            "💰 Economía",

        value:
            "Primero las 3 opciones recomendadas de RustHelp y después las 7 alternativas ordenadas por menor costo."
    });

    return embed;
}

// =====================================================
// CANTIDAD
// =====================================================
//
// 3 primeras recomendadas de RustHelp
// +
// 7 adicionales ordenadas por cantidad.
//
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
            "📦 Cantidad",

        value:
            "Primero las 3 opciones recomendadas de RustHelp y después las 7 alternativas que requieren menor cantidad."
    });

    return embed;
}

// =====================================================
// MELEE
// =====================================================
//
// NO muestra las 3 recomendadas.
//
// Muestra directamente las 7 opciones melee
// más rápidas según Time to Raid.
//
// =====================================================

function crearEmbedMelee(
    resultado
) {

    const embed =
        crearEmbedBase(
            resultado,
            "⚔️ Raid Calculator",
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

    // El servicio ya entrega las 7 más rápidas.
    const melee =
        resultado.melee.slice(
            0,
            7
        );

    embed.setDescription(
        crearTextoRaids(
            melee
        )
    );

    embed.addFields({
        name:
            "⚔️ Melee",

        value:
            "7 opciones ordenadas de menor a mayor tiempo de raideo."
    });

    return embed;
}

// =====================================================
// MUNICIÓN
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
                        "raid_melee"
                    )
                    .setLabel(
                        "Melee"
                    )
                    .setEmoji(
                        "⚔️"
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

            // =================================================
            // EMBED INICIAL
            // =================================================
            //
            // Por defecto mostramos Economía.
            //
            // =================================================

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

            // =================================================
            // ECONOMÍA
            // =================================================

            case "raid_economia":

                nuevoEmbed =
                    crearEmbedEconomia(
                        resultado
                    );

                break;

            // =================================================
            // CANTIDAD
            // =================================================

            case "raid_cantidad":

                nuevoEmbed =
                    crearEmbedCantidad(
                        resultado
                    );

                break;

            // =================================================
            // MELEE
            // =================================================

            case "raid_melee":

                nuevoEmbed =
                    crearEmbedMelee(
                        resultado
                    );

                break;

            // =================================================
            // MUNICIÓN
            // =================================================

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