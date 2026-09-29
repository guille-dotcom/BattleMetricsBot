const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const StreamerRole =
    require("../models/StreamerRoleSchema");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("panel-streamers")
        .setDescription(
            "Publica el panel para elegir roles de streamers."
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        ),

    async execute(interaction) {
        try {
            if (!interaction.guild) {
                return interaction.reply({
                    content:
                        "❌ Este comando solo puede utilizarse dentro de un servidor.",
                    ephemeral: true
                });
            }

            if (
                !interaction.member.permissions.has(
                    PermissionFlagsBits.ManageGuild
                )
            ) {
                return interaction.reply({
                    content:
                        "❌ Necesitas el permiso **Gestionar servidor** para publicar este panel.",
                    ephemeral: true
                });
            }

            const configuraciones =
                await StreamerRole.find({
                    guildId:
                        interaction.guild.id
                }).sort({
                    streamerName: 1
                });

            if (
                !configuraciones.length
            ) {
                return interaction.reply({
                    content:
                        "❌ No hay streamers configurados todavía.\n\nUtiliza primero:\n`/rol-streamer streamer:<nombre> rol:<rol>`",
                    ephemeral: true
                });
            }

            // =================================================
            // COMPROBAR ROLES
            // =================================================

            const configuracionesValidas = [];

            for (
                const configuracion
                of configuraciones
            ) {
                const role =
                    interaction.guild.roles.cache.get(
                        configuracion.roleId
                    );

                if (!role) {
                    console.log(
                        `⚠️ El rol ${configuracion.roleId} de ${configuracion.streamerName} ya no existe.`
                    );
                    continue;
                }

                if (role.managed) {
                    console.log(
                        `⚠️ El rol ${role.name} de ${configuracion.streamerName} está administrado por una integración.`
                    );
                    continue;
                }

                configuracionesValidas.push(
                    configuracion
                );
            }

            if (
                !configuracionesValidas.length
            ) {
                return interaction.reply({
                    content:
                        "❌ Ninguno de los roles configurados existe actualmente o puede ser utilizado.",
                    ephemeral: true
                });
            }

            // =================================================
            // CREAR PANELES
            // Discord permite máximo 25 botones
            // por mensaje.
            // =================================================

            const grupos = [];

            for (
                let i = 0;
                i <
                configuracionesValidas.length;
                i += 25
            ) {
                grupos.push(
                    configuracionesValidas.slice(
                        i,
                        i + 25
                    )
                );
            }

            await interaction.deferReply({
                ephemeral: true
            });

            let numeroPanel = 0;

            for (
                const grupo
                of grupos
            ) {
                numeroPanel++;

                const filas = [];

                for (
                    let i = 0;
                    i < grupo.length;
                    i += 5
                ) {
                    const fila =
                        new ActionRowBuilder();

                    const botones =
                        grupo.slice(
                            i,
                            i + 5
                        );

                    for (
                        const configuracion
                        of botones
                    ) {
                        let label =
                            configuracion.streamerName;

                        // Discord permite hasta 80 caracteres
                        if (
                            label.length >
                            80
                        ) {
                            label =
                                label.substring(
                                    0,
                                    77
                                ) + "...";
                        }

                        fila.addComponents(
                            new ButtonBuilder()
                                .setCustomId(
                                    `streamer_role_${configuracion._id}`
                                )
                                .setLabel(
                                    label
                                )
                                .setEmoji("🎥")
                                .setStyle(
                                    ButtonStyle.Secondary
                                )
                        );
                    }

                    filas.push(
                        fila
                    );
                }

                const embed =
                    new EmbedBuilder()
                        .setColor(
                            0x9146FF
                        )
                        .setTitle(
                            "🎥 Roles de Streamers"
                        )
                        .setDescription(
                            "Selecciona los streamers que quieres seguir.\n\n" +
                            "🟢 Pulsa un botón para **obtener su rol**.\n" +
                            "🔴 Pulsa nuevamente el mismo botón para **quitarte el rol**.\n\n" +
                            "Puedes elegir todos los streamers que quieras."
                        )
                        .setFooter({
                            text:
                                "RustLogix • Roles de Streamers"
                        })
                        .setTimestamp();

                if (
                    grupos.length > 1
                ) {
                    embed.setTitle(
                        `🎥 Roles de Streamers • ${numeroPanel}/${grupos.length}`
                    );
                }

                await interaction.channel.send({
                    embeds: [
                        embed
                    ],
                    components:
                        filas
                });
            }

            console.log(
                `🎥 Panel de roles de streamers publicado en #${interaction.channel.name} (${configuracionesValidas.length} streamers)`
            );

            return interaction.editReply({
                content:
                    `✅ Panel de streamers publicado correctamente.\n\n` +
                    `🎥 Streamers configurados: **${configuracionesValidas.length}**\n` +
                    `📋 Paneles publicados: **${grupos.length}**`
            });
        } catch (error) {
            console.error(
                "❌ Error en /panel-streamers:",
                error
            );

            try {
                if (
                    interaction.deferred ||
                    interaction.replied
                ) {
                    return interaction.editReply({
                        content:
                            "❌ Ocurrió un error publicando el panel de streamers."
                    });
                }

                return interaction.reply({
                    content:
                        "❌ Ocurrió un error publicando el panel de streamers.",
                    ephemeral: true
                });
            } catch (replyError) {
                console.error(
                    "❌ Error respondiendo /panel-streamers:",
                    replyError.message
                );
            }
        }
    }
};