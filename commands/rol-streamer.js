const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const StreamerRole =
    require("../models/StreamerRoleSchema");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("rol-streamer")
        .setDescription(
            "Asocia un streamer a un rol existente de Discord."
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        )
        .addStringOption(option =>
            option
                .setName("streamer")
                .setDescription(
                    "Nombre del streamer."
                )
                .setRequired(true)
        )
        .addRoleOption(option =>
            option
                .setName("rol")
                .setDescription(
                    "Rol de Discord que se asignará."
                )
                .setRequired(true)
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
                        "❌ Necesitas el permiso **Gestionar servidor** para utilizar este comando.",
                    ephemeral: true
                });
            }

            const streamerName =
                interaction.options
                    .getString("streamer")
                    .trim();

            const role =
                interaction.options.getRole("rol");

            if (!streamerName) {
                return interaction.reply({
                    content:
                        "❌ Debes indicar el nombre del streamer.",
                    ephemeral: true
                });
            }

            if (!role) {
                return interaction.reply({
                    content:
                        "❌ Debes seleccionar un rol.",
                    ephemeral: true
                });
            }

            // =====================================================
            // COMPROBAR ROL
            // =====================================================

            if (role.id === interaction.guild.id) {
                return interaction.reply({
                    content:
                        "❌ No puedes utilizar el rol @everyone.",
                    ephemeral: true
                });
            }

            if (role.managed) {
                return interaction.reply({
                    content:
                        "❌ Ese rol está administrado por una integración y Discord no permite que el bot lo asigne.",
                    ephemeral: true
                });
            }

            // =====================================================
            // COMPROBAR JERARQUÍA DEL BOT
            // =====================================================

            const botMember =
                interaction.guild.members.me ||
                await interaction.guild.members.fetchMe();

            if (!botMember) {
                return interaction.reply({
                    content:
                        "❌ No pude obtener la información del bot dentro del servidor.",
                    ephemeral: true
                });
            }

            if (
                role.position >=
                botMember.roles.highest.position
            ) {
                return interaction.reply({
                    content:
                        "❌ No puedo administrar ese rol porque está por encima o al mismo nivel que mi rol más alto.\n\n" +
                        "Sube el rol de **RustLogix** por encima del rol que quieres utilizar.",
                    ephemeral: true
                });
            }

            // =====================================================
            // GUARDAR / ACTUALIZAR
            // =====================================================

            const streamerNormalizado =
                streamerName.toLowerCase();

            const configuracion =
                await StreamerRole.findOneAndUpdate(
                    {
                        guildId:
                            interaction.guild.id,
                        streamerName:
                            streamerNormalizado
                    },
                    {
                        guildId:
                            interaction.guild.id,
                        streamerName:
                            streamerName,
                        roleId:
                            role.id
                    },
                    {
                        upsert: true,
                        new: true,
                        setDefaultsOnInsert: true
                    }
                );

            console.log(
                `🎥 Rol de streamer configurado: ${streamerName} -> ${role.name} (${role.id}) en ${interaction.guild.name}`
            );

            return interaction.reply({
                content:
                    `✅ **Streamer configurado correctamente.**\n\n` +
                    `🎥 Streamer: **${streamerName}**\n` +
                    `🎭 Rol: <@&${role.id}>\n\n` +
                    `Ahora puedes utilizar **/panel-streamers** para publicar los botones.`,
                ephemeral: true
            });
        } catch (error) {
            console.error(
                "❌ Error en /rol-streamer:",
                error
            );

            if (
                interaction.replied ||
                interaction.deferred
            ) {
                return interaction.editReply({
                    content:
                        "❌ Ocurrió un error guardando la configuración del streamer."
                });
            }

            return interaction.reply({
                content:
                    "❌ Ocurrió un error guardando la configuración del streamer.",
                ephemeral: true
            });
        }
    },

    // =========================================================
    // BOTÓN DE STREAMER
    // =========================================================

    async manejarBoton(interaction) {
        if (!interaction.guild) {
            return interaction.reply({
                content:
                    "❌ Este botón solo funciona dentro de un servidor.",
                ephemeral: true
            });
        }

        const prefix =
            "streamer_role_";

        if (
            !interaction.customId.startsWith(
                prefix
            )
        ) {
            return false;
        }

        const configuracionId =
            interaction.customId.slice(
                prefix.length
            );

        try {
            const configuracion =
                await StreamerRole.findOne({
                    _id: configuracionId,
                    guildId:
                        interaction.guild.id
                });

            if (!configuracion) {
                return interaction.reply({
                    content:
                        "❌ Esta configuración de streamer ya no existe.",
                    ephemeral: true
                });
            }

            // =================================================
            // BUSCAR ROL
            // =================================================

            let role =
                interaction.guild.roles.cache.get(
                    configuracion.roleId
                );

            if (!role) {
                role =
                    await interaction.guild.roles
                        .fetch(
                            configuracion.roleId
                        )
                        .catch(() => null);
            }

            if (!role) {
                return interaction.reply({
                    content:
                        `❌ El rol asociado a **${configuracion.streamerName}** ya no existe en este servidor.`,
                    ephemeral: true
                });
            }

            if (role.managed) {
                return interaction.reply({
                    content:
                        "❌ Ese rol está administrado por una integración y no puede ser asignado por RustLogix.",
                    ephemeral: true
                });
            }

            // =================================================
            // COMPROBAR BOT
            // =================================================

            const botMember =
                interaction.guild.members.me ||
                await interaction.guild.members.fetchMe();

            if (!botMember) {
                return interaction.reply({
                    content:
                        "❌ No pude obtener la información de RustLogix en este servidor.",
                    ephemeral: true
                });
            }

            if (
                role.position >=
                botMember.roles.highest.position
            ) {
                return interaction.reply({
                    content:
                        "❌ RustLogix no puede administrar este rol porque está demasiado alto en la jerarquía de Discord.",
                    ephemeral: true
                });
            }

            // =================================================
            // COMPROBAR PERMISO
            // =================================================

            if (
                !botMember.permissions.has(
                    PermissionFlagsBits.ManageRoles
                )
            ) {
                return interaction.reply({
                    content:
                        "❌ RustLogix no tiene el permiso **Gestionar roles**.",
                    ephemeral: true
                });
            }

            // =================================================
            // OBTENER MIEMBRO
            // =================================================

            const member =
                interaction.member;

            if (!member) {
                return interaction.reply({
                    content:
                        "❌ No pude obtener tu información dentro del servidor.",
                    ephemeral: true
                });
            }

            // =================================================
            // TOGGLE DEL ROL
            // =================================================

            const tieneRol =
                member.roles.cache.has(
                    role.id
                );

            if (tieneRol) {
                await member.roles.remove(
                    role,
                    `Rol de streamer: ${configuracion.streamerName}`
                );

                console.log(
                    `➖ Rol streamer quitado: ${role.name} -> ${interaction.user.tag}`
                );

                return interaction.reply({
                    content:
                        `❌ Se te quitó el rol <@&${role.id}>.`,
                    ephemeral: true
                });
            }

            await member.roles.add(
                role,
                `Rol de streamer: ${configuracion.streamerName}`
            );

            console.log(
                `➕ Rol streamer añadido: ${role.name} -> ${interaction.user.tag}`
            );

            return interaction.reply({
                content:
                    `✅ Se te añadió el rol <@&${role.id}>.`,
                ephemeral: true
            });
        } catch (error) {
            console.error(
                "❌ Error manejando botón de streamer:",
                error
            );

            try {
                if (
                    !interaction.replied &&
                    !interaction.deferred
                ) {
                    return interaction.reply({
                        content:
                            "❌ No pude cambiar tu rol. Comprueba que RustLogix tenga **Gestionar roles** y que su rol esté por encima del rol del streamer.",
                        ephemeral: true
                    });
                }
            } catch (replyError) {
                console.error(
                    "❌ Error respondiendo botón streamer:",
                    replyError.message
                );
            }

            return true;
        }
    }
};