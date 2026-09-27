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
                        "Publica los Rust Drops activos en este canal"
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
        // RUST
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

                const cuenta =
                    await TwitchAccount.findOne({
                        discordUserId:
                            interaction.user.id
                    });

                if (!cuenta) {

                    const embed =
                        new EmbedBuilder()
                            .setColor(
                                0xed4245
                            )
                            .setTitle(
                                "🎁 Rust Drops"
                            )
                            .setDescription(
                                "No tienes una cuenta de Twitch vinculada.\n\n" +
                                "Usa **/drops vincular** para conectar tu cuenta."
                            )
                            .setFooter({
                                text:
                                    "RustLogix • Twitch Drops"
                            });

                    return interaction.editReply({
                        embeds:
                            [embed]
                    });

                }

                console.log(
                    `🎁 Publicando Rust Drops para ${cuenta.twitchLogin} en #${interaction.channel?.name || interaction.channelId}...`
                );

                const resultado =
                    await publicarRustDrops(
                        interaction
                    );

                if (
                    !resultado.ok
                ) {

                    let mensaje =
                        "❌ No se pudieron publicar los Rust Drops.";

                    if (
                        resultado.motivo ===
                        "TOKEN_INVALIDO"
                    ) {

                        mensaje =
                            "⚠️ La sesión de Twitch no pudo validarse.\n\nUsa **/drops estado** o vuelve a vincular tu cuenta.";

                    }

                    if (
                        resultado.motivo ===
                        "FACEPUNCH_ERROR"
                    ) {

                        mensaje =
                            "❌ Facepunch no devolvió los Rust Drops actuales.\n\nInténtalo nuevamente en unos segundos.";

                    }

                    if (
                        resultado.motivo ===
                        "CANAL_INVALIDO"
                    ) {

                        mensaje =
                            "❌ No se pudo utilizar este canal para publicar los Drops.";

                    }

                    return interaction.editReply({
                        content:
                            mensaje
                    });

                }

                return interaction.editReply({
                    content:
                        `✅ **Rust Drops publicados correctamente.**\n\n` +
                        `🎁 **${resultado.cantidadDrops} Drops**\n` +
                        `💬 **${resultado.cantidadMensajes} mensajes**\n\n` +
                        `📡 RustLogix actualizará automáticamente los estados de los streamers cada 60 segundos.`
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
                                "RustLogix • Twitch Drops"
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