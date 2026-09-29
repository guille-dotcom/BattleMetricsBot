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


// ============================================================
// OBTENER EMOJI SEGÚN EL COLOR DEL ROL
// ============================================================

function obtenerEmojiColorRol(role) {
    if (!role || !role.color) {
        return "⚪";
    }

    const hex = role.hexColor.replace("#", "");

    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    // Colores base aproximados para los emojis
    const colores = [
        {
            emoji: "🔴",
            r: 255,
            g: 0,
            b: 0
        },
        {
            emoji: "🟠",
            r: 255,
            g: 165,
            b: 0
        },
        {
            emoji: "🟡",
            r: 255,
            g: 255,
            b: 0
        },
        {
            emoji: "🟢",
            r: 0,
            g: 255,
            b: 0
        },
        {
            emoji: "🔵",
            r: 0,
            g: 120,
            b: 255
        },
        {
            emoji: "🟣",
            r: 160,
            g: 0,
            b: 255
        },
        {
            emoji: "🟤",
            r: 140,
            g: 80,
            b: 40
        },
        {
            emoji: "⚫",
            r: 0,
            g: 0,
            b: 0
        },
        {
            emoji: "⚪",
            r: 255,
            g: 255,
            b: 255
        }
    ];

    let mejorEmoji = "⚪";
    let menorDistancia = Infinity;

    for (const color of colores) {
        const distancia =
            Math.pow(r - color.r, 2) +
            Math.pow(g - color.g, 2) +
            Math.pow(b - color.b, 2);

        if (distancia < menorDistancia) {
            menorDistancia = distancia;
            mejorEmoji = color.emoji;
        }
    }

    return mejorEmoji;
}


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
                    guildId: interaction.guild.id
                }).sort({
                    streamerName: 1
                });

            if (!configuraciones.length) {
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

            for (const configuracion of configuraciones) {
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

                configuracionesValidas.push({
                    configuracion,
                    role
                });
            }

            if (!configuracionesValidas.length) {
                return interaction.reply({
                    content:
                        "❌ Ninguno de los roles configurados existe actualmente o puede ser utilizado.",
                    ephemeral: true
                });
            }

            // =================================================
            // DISCORD PERMITE MÁXIMO 25 BOTONES POR MENSAJE
            // =================================================

            const grupos = [];

            for (
                let i = 0;
                i < configuracionesValidas.length;
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

            // =================================================
            // CREAR PANELES
            // =================================================

            for (const grupo of grupos) {
                numeroPanel++;

                const filas = [];

                // Máximo 5 botones por fila
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

                    for (const item of botones) {
                        const configuracion =
                            item.configuracion;

                        const role =
                            item.role;

                        let label =
                            configuracion.streamerName;

                        // Discord permite hasta 80 caracteres
                        if (label.length > 80) {
                            label =
                                label.substring(
                                    0,
                                    77
                                ) + "...";
                        }

                        // Obtener color correspondiente al rol
                        const emoji =
                            obtenerEmojiColorRol(
                                role
                            );

                        const boton =
                            new ButtonBuilder()
                                .setCustomId(
                                    `streamer_role_${configuracion._id}`
                                )
                                .setLabel(label)
                                .setEmoji(emoji)
                                .setStyle(
                                    ButtonStyle.Secondary
                                );

                        fila.addComponents(
                            boton
                        );
                    }

                    filas.push(fila);
                }

                // =================================================
                // EMBED
                // =================================================

                const embed =
                    new EmbedBuilder()
                        .setColor(0x9146FF)
                        .setTitle(
                            "🎥 Roles de Streamers"
                        )
                        .setDescription(
                            "Reacciona al rol del streamer que deseas"
                        )
                        .setFooter({
                            text:
                                "RustLogix • Roles de Streamers"
                        })
                        .setTimestamp();

                if (grupos.length > 1) {
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