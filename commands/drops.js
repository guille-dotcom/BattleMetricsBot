const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require("discord.js");

const TwitchAccount =
    require("../models/TwitchAccount");

const {
    generarUrlAutorizacion,
    desvincularTwitch,
    obtenerCuentaConToken
} = require("../services/twitchOAuthService");

const {
    publicarRustDrops
} = require("../services/twitchDropsService");

const {
    publicarRustDropsKick
} = require("../services/kickDropsService");

module.exports = {

    data: new SlashCommandBuilder()

        .setName("drops")

        .setDescription(
            "Gestiona tu cuenta de Twitch y los Drops"
        )

        .addSubcommand(
            subcommand =>
                subcommand
                    .setName("vincular")
                    .setDescription(
                        "Vincula tu cuenta de Twitch"
                    )
        )

        .addSubcommand(
            subcommand =>
                subcommand
                    .setName("estado")
                    .setDescription(
                        "Muestra tu cuenta de Twitch vinculada"
                    )
        )

        .addSubcommand(
            subcommand =>
                subcommand
                    .setName("rust")
                    .setDescription(
                        "Publica los Rust Drops activos de Twitch y Kick"
                    )
        )

        .addSubcommand(
            subcommand =>
                subcommand
                    .setName("desvincular")
                    .setDescription(
                        "Desvincula tu cuenta de Twitch"
                    )
        ),

    async execute(
        interaction
    ) {

        const subcommand =
            interaction.options.getSubcommand();

        // ========================================================
        // VINCULAR
        // ========================================================

        if (
            subcommand ===
            "vincular"
        ) {

            try {

                const cuenta =
                    await TwitchAccount.findOne({
                        discordUserId:
                            interaction.user.id
                    });

                if (cuenta) {

                    const embed =
                        new EmbedBuilder()
                            .setColor(
                                0x9146ff
                            )
                            .setTitle(
                                "🟣 Twitch ya vinculado"
                            )
                            .setDescription(
                                `Tu cuenta de Twitch ya está vinculada.\n\n` +
                                `**Cuenta:** ${cuenta.twitchDisplayName || cuenta.twitchLogin}\n` +
                                `**Usuario:** \`${cuenta.twitchLogin}\`\n\n` +
                                `Si quieres cambiar de cuenta, primero usa **/drops desvincular**.`
                            )
                            .setFooter({
                                text:
                                    "RustLogix • Twitch Drops"
                            });

                    return interaction.reply({
                        embeds:
                            [embed],

                        ephemeral:
                            true
                    });

                }

                const url =
                    generarUrlAutorizacion(
                        interaction.user.id
                    );

                const boton =
                    new ButtonBuilder()
                        .setLabel(
                            "Vincular Twitch"
                        )
                        .setEmoji(
                            "🔗"
                        )
                        .setStyle(
                            ButtonStyle.Link
                        )
                        .setURL(
                            url
                        );

                const row =
                    new ActionRowBuilder()
                        .addComponents(
                            boton
                        );

                const embed =
                    new EmbedBuilder()
                        .setColor(
                            0x9146ff
                        )
                        .setTitle(
                            "🟣 Vincular Twitch"
                        )
                        .setDescription(
                            "Pulsa el botón de abajo para vincular tu cuenta de Twitch con RustLogix.\n\n" +
                            "Se abrirá Twitch para que autorices la conexión."
                        )
                        .addFields({
                            name:
                                "🔐 Seguridad",

                            value:
                                "RustLogix solo utilizará la autorización de Twitch necesaria para identificar tu cuenta y gestionar los Drops."
                        })
                        .setFooter({
                            text:
                                "RustLogix • Twitch Drops"
                        });

                return interaction.reply({
                    embeds:
                        [embed],

                    components:
                        [row],

                    ephemeral:
                        true
                });

            } catch (error) {

                console.error(
                    "❌ Error en /drops vincular:",
                    error
                );

                if (
                    interaction.replied ||
                    interaction.deferred
                ) {

                    return interaction.followUp({
                        content:
                            "❌ No se pudo generar el enlace de Twitch.",

                        ephemeral:
                            true
                    });

                }

                return interaction.reply({
                    content:
                        "❌ No se pudo generar el enlace de Twitch.",

                    ephemeral:
                        true
                });

            }

        }

        // ========================================================
        // ESTADO
        // ========================================================

        if (
            subcommand ===
            "estado"
        ) {

            try {

                const cuenta =
                    await TwitchAccount.findOne({
                        discordUserId:
                            interaction.user.id
                    });

                if (!cuenta) {

                    const embed =
                        new EmbedBuilder()
                            .setColor(
                                0x5865f2
                            )
                            .setTitle(
                                "🟣 Twitch no vinculado"
                            )
                            .setDescription(
                                "No tienes ninguna cuenta de Twitch vinculada a RustLogix.\n\n" +
                                "Usa **/drops vincular** para conectar tu cuenta."
                            )
                            .setFooter({
                                text:
                                    "RustLogix • Twitch Drops"
                            });

                    return interaction.reply({
                        embeds:
                            [embed],

                        ephemeral:
                            true
                    });

                }

                let cuentaActual =
                    cuenta;

                try {

                    cuentaActual =
                        await obtenerCuentaConToken(
                            interaction.user.id
                        ) ||
                        cuenta;

                } catch (error) {

                    console.error(
                        "⚠️ No se pudo renovar automáticamente el token Twitch:",
                        error.message
                    );

                }

                const expira =
                    cuentaActual.expiresAt
                        ? new Date(
                            cuentaActual.expiresAt
                        )
                        : null;

                let estadoToken =
                    "🟢 Activo";

                if (
                    expira &&
                    expira.getTime() <
                        Date.now()
                ) {

                    estadoToken =
                        "🟡 Necesita renovación";

                }

                const embed =
                    new EmbedBuilder()
                        .setColor(
                            0x9146ff
                        )
                        .setTitle(
                            "🟣 Estado de Twitch"
                        )
                        .setDescription(
                            "Tu cuenta de Twitch está vinculada correctamente con RustLogix."
                        )
                        .addFields(
                            {
                                name:
                                    "👤 Cuenta",

                                value:
                                    `**${cuentaActual.twitchDisplayName || cuentaActual.twitchLogin}**`,

                                inline:
                                    true
                            },

                            {
                                name:
                                    "🔗 Usuario",

                                value:
                                    `\`${cuentaActual.twitchLogin}\``,

                                inline:
                                    true
                            },

                            {
                                name:
                                    "🔐 Sesión",

                                value:
                                    estadoToken,

                                inline:
                                    true
                            }
                        )
                        .setFooter({
                            text:
                                "RustLogix • Twitch Drops"
                        })
                        .setTimestamp();

                return interaction.reply({
                    embeds:
                        [embed],

                    ephemeral:
                        true
                });

            } catch (error) {

                console.error(
                    "❌ Error en /drops estado:",
                    error
                );

                return interaction.reply({
                    content:
                        "❌ No se pudo consultar el estado de Twitch.",

                    ephemeral:
                        true
                });

            }

        }

        // ========================================================
        // RUST DROPS
        // ========================================================

        if (
            subcommand ===
            "rust"
        ) {

            try {

                await interaction.deferReply({
                    ephemeral:
                        true
                });

                // ====================================================
                // DATOS DE TWITCH
                // ====================================================

                const cuenta =
                    await TwitchAccount.findOne({
                        discordUserId:
                            interaction.user.id
                    });

                let resultadoTwitch =
                    null;

                let errorTwitch =
                    null;

                let twitchSinDrops =
                    false;

                // ====================================================
                // TWITCH
                // ====================================================

                if (cuenta) {

                    console.log(
                        `🎁 Publicando Rust Drops de Twitch para ${cuenta.twitchLogin} en #${interaction.channel?.name || interaction.channelId}...`
                    );

                    try {

                        resultadoTwitch =
                            await publicarRustDrops(
                                interaction
                            );

                    } catch (error) {

                        console.error(
                            "❌ Error publicando Rust Drops de Twitch:",
                            error
                        );

                        errorTwitch =
                            error;

                        // --------------------------------------------
                        // NO HAY DROPS
                        // --------------------------------------------

                        const mensajeError =
                            String(
                                error?.message ||
                                ""
                            ).toLowerCase();

                        if (
                            mensajeError.includes(
                                "no devolvió drops"
                            ) ||
                            mensajeError.includes(
                                "no hay drops"
                            ) ||
                            mensajeError.includes(
                                "0 drops"
                            )
                        ) {

                            twitchSinDrops =
                                true;

                            console.log(
                                "ℹ️ Twitch no tiene Rust Drops activos actualmente."
                            );

                        }

                    }

                } else {

                    console.log(
                        "ℹ️ No hay cuenta Twitch vinculada. Se continuará únicamente con Kick."
                    );

                }

                // ====================================================
                // KICK
                // ====================================================

                let resultadoKick =
                    null;

                let errorKick =
                    null;

                let kickSinDrops =
                    false;

                console.log(
                    `🎁 Publicando Rust Drops de Kick en #${interaction.channel?.name || interaction.channelId}...`
                );

                try {

                    resultadoKick =
                        await publicarRustDropsKick(
                            interaction.channel
                        );

                    if (
                        !resultadoKick ||
                        !resultadoKick.drops ||
                        resultadoKick.drops.length === 0
                    ) {

                        kickSinDrops =
                            true;

                        console.log(
                            "ℹ️ Kick no tiene Rust Drops activos actualmente."
                        );

                    }

                } catch (error) {

                    console.error(
                        "❌ Error publicando Rust Drops de Kick:",
                        error
                    );

                    errorKick =
                        error;

                }

                // ====================================================
                // RESULTADO TWITCH
                // ====================================================

                const twitchOk =
                    Boolean(
                        resultadoTwitch?.ok
                    );

                const twitchCantidad =
                    resultadoTwitch?.cantidadDrops ||
                    0;

                const twitchMensajes =
                    resultadoTwitch?.cantidadMensajes ||
                    0;

                // ====================================================
                // RESULTADO KICK
                // ====================================================

                const kickOk =
                    Boolean(
                        resultadoKick &&
                        resultadoKick.drops &&
                        resultadoKick.drops.length > 0
                    );

                const kickCantidad =
                    resultadoKick?.drops?.length ||
                    0;

                let kickMensajeCantidad =
                    0;

                if (
                    kickCantidad > 0
                ) {

                    kickMensajeCantidad =
                        Math.ceil(
                            kickCantidad /
                            10
                        );

                }

                // ====================================================
                // ERRORES ESPECÍFICOS TWITCH
                // ====================================================

                let mensajeErrorTwitch =
                    null;

                if (
                    resultadoTwitch &&
                    !resultadoTwitch.ok
                ) {

                    if (
                        resultadoTwitch.motivo ===
                        "TOKEN_INVALIDO"
                    ) {

                        mensajeErrorTwitch =
                            "⚠️ La sesión de Twitch no pudo validarse. Usa **/drops estado** o vuelve a vincular tu cuenta.";

                    } else if (
                        resultadoTwitch.motivo ===
                        "FACEPUNCH_ERROR"
                    ) {

                        mensajeErrorTwitch =
                            "❌ Twitch/Facepunch no devolvió los Rust Drops actuales.";

                    } else if (
                        resultadoTwitch.motivo ===
                        "CANAL_INVALIDO"
                    ) {

                        mensajeErrorTwitch =
                            "❌ No se pudo utilizar este canal para publicar los Drops de Twitch.";

                    } else {

                        mensajeErrorTwitch =
                            "❌ No se pudieron publicar los Rust Drops de Twitch.";

                    }

                }

                // ====================================================
                // CASO 1
                // HAY DROPS EN ALGUNA PLATAFORMA
                // ====================================================

                if (
                    twitchOk ||
                    kickOk
                ) {

                    let contenido =
                        "✅ **Rust Drops revisados correctamente.**\n\n";

                    // ------------------------------------------------
                    // TWITCH
                    // ------------------------------------------------

                    if (
                        twitchOk
                    ) {

                        contenido +=
                            `🟣 **Twitch**\n` +
                            `🎁 ${twitchCantidad} Drops\n` +
                            `💬 ${twitchMensajes} mensajes\n\n`;

                    } else if (
                        twitchSinDrops
                    ) {

                        contenido +=
                            `🟣 **Twitch**\n` +
                            `ℹ️ No hay Drops de Rust activos actualmente.\n\n`;

                    } else if (
                        cuenta &&
                        mensajeErrorTwitch
                    ) {

                        contenido +=
                            `🟣 **Twitch**\n` +
                            `${mensajeErrorTwitch}\n\n`;

                    } else if (
                        cuenta
                    ) {

                        contenido +=
                            `🟣 **Twitch**\n` +
                            `⚠️ No se pudieron publicar los Drops de Twitch.\n\n`;

                    } else {

                        contenido +=
                            `🟣 **Twitch**\n` +
                            `ℹ️ No tienes una cuenta vinculada.\n\n`;

                    }

                    // ------------------------------------------------
                    // KICK
                    // ------------------------------------------------

                    if (
                        kickOk
                    ) {

                        contenido +=
                            `🟢 **Kick**\n` +
                            `🎁 ${kickCantidad} Drops\n` +
                            `💬 ${kickMensajeCantidad} mensajes\n\n`;

                    } else if (
                        kickSinDrops
                    ) {

                        contenido +=
                            `🟢 **Kick**\n` +
                            `ℹ️ No hay Drops de Rust activos actualmente.\n\n`;

                    } else {

                        contenido +=
                            `🟢 **Kick**\n` +
                            `⚠️ No se pudieron obtener los Drops de Kick.\n\n`;

                    }

                    contenido +=
                        "📡 RustLogix actualizará automáticamente los estados de los streamers de Rust en Twitch/Kick.";

                    if (
                        errorKick
                    ) {

                        contenido +=
                            "\n\n⚠️ Kick no pudo completar esta revisión.";

                    }

                    return interaction.editReply({
                        content:
                            contenido
                    });

                }

                // ====================================================
                // CASO 2
                // NO HAY DROPS EN NINGUNA PLATAFORMA
                // ====================================================

                if (
                    twitchSinDrops &&
                    (
                        kickSinDrops ||
                        !errorKick
                    )
                ) {

                    const embed =
                        new EmbedBuilder()
                            .setColor(
                                0x5865f2
                            )
                            .setTitle(
                                "🎁 No hay Rust Drops activos"
                            )
                            .setDescription(
                                "Actualmente no hay Drops de Rust activos para publicar."
                            )
                            .addFields(
                                {
                                    name:
                                        "🟣 Twitch",

                                    value:
                                        cuenta
                                            ? "ℹ️ No hay Drops de Rust activos actualmente."
                                            : "ℹ️ No tienes una cuenta de Twitch vinculada."
                                },

                                {
                                    name:
                                        "🟢 Kick",

                                    value:
                                        kickSinDrops
                                            ? "ℹ️ No hay Drops de Rust activos actualmente."
                                            : "⚠️ No se pudieron comprobar los Drops de Kick."
                                }
                            )
                            .setFooter({
                                text:
                                    "RustLogix • Rust Drops"
                            })
                            .setTimestamp();

                    return interaction.editReply({
                        embeds:
                            [embed]
                    });

                }

                // ====================================================
                // CASO 3
                // HUBO ERRORES REALES
                // ====================================================

                const embed =
                    new EmbedBuilder()
                        .setColor(
                            0xed4245
                        )
                        .setTitle(
                            "❌ No se pudieron publicar los Rust Drops"
                        )
                        .setDescription(
                            "RustLogix no pudo obtener los Drops en este momento."
                        )
                        .addFields(
                            {
                                name:
                                    "🟣 Twitch",

                                value:
                                    cuenta
                                        ? (
                                            twitchSinDrops
                                                ? "ℹ️ No hay Drops de Rust activos actualmente."
                                                : (
                                                    mensajeErrorTwitch ||
                                                    "❌ No se pudieron obtener los Drops de Twitch."
                                                )
                                        )
                                        : "ℹ️ No tienes una cuenta de Twitch vinculada."
                            },

                            {
                                name:
                                    "🟢 Kick",

                                value:
                                    kickSinDrops
                                        ? "ℹ️ No hay Drops de Rust activos actualmente."
                                        : (
                                            errorKick
                                                ? "❌ No se pudieron obtener los Drops de Kick."
                                                : "ℹ️ No hay Drops de Rust activos actualmente."
                                        )
                            }
                        )
                        .setFooter({
                            text:
                                "RustLogix • Rust Drops"
                        })
                        .setTimestamp();

                return interaction.editReply({
                    embeds:
                        [embed]
                });

            } catch (error) {

                console.error(
                    "❌ Error en /drops rust:",
                    error
                );

                const embed =
                    new EmbedBuilder()
                        .setColor(
                            0xed4245
                        )
                        .setTitle(
                            "❌ Error publicando Rust Drops"
                        )
                        .setDescription(
                            "No se pudieron publicar los Rust Drops en este momento.\n\n" +
                            "Revisa los logs de RustLogix para ver el error."
                        )
                        .setFooter({
                            text:
                                "RustLogix • Rust Drops"
                        });

                if (
                    interaction.deferred ||
                    interaction.replied
                ) {

                    return interaction.editReply({
                        embeds:
                            [embed]
                    });

                }

                return interaction.reply({
                    embeds:
                        [embed],

                    ephemeral:
                        true
                });

            }

        }

        // ========================================================
        // DESVINCULAR
        // ========================================================

        if (
            subcommand ===
            "desvincular"
        ) {

            try {

                const cuenta =
                    await TwitchAccount.findOne({
                        discordUserId:
                            interaction.user.id
                    });

                if (!cuenta) {

                    return interaction.reply({
                        content:
                            "❌ No tienes ninguna cuenta de Twitch vinculada.",

                        ephemeral:
                            true
                    });

                }

                await desvincularTwitch(
                    interaction.user.id
                );

                const embed =
                    new EmbedBuilder()
                        .setColor(
                            0xed4245
                        )
                        .setTitle(
                            "🔓 Twitch desvinculado"
                        )
                        .setDescription(
                            `La cuenta **${cuenta.twitchDisplayName || cuenta.twitchLogin}** ha sido desvinculada correctamente de RustLogix.`
                        )
                        .setFooter({
                            text:
                                "RustLogix • Twitch Drops"
                        })
                        .setTimestamp();

                return interaction.reply({
                    embeds:
                        [embed],

                    ephemeral:
                        true
                });

            } catch (error) {

                console.error(
                    "❌ Error en /drops desvincular:",
                    error
                );

                return interaction.reply({
                    content:
                        "❌ No se pudo desvincular la cuenta de Twitch.",

                    ephemeral:
                        true
                });

            }

        }

    }

};