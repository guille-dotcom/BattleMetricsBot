const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    RoleSelectMenuBuilder
} = require("discord.js");

const KickAlertMonitor =
    require("../models/KickAlertMonitor");

const {
    obtenerStreamerKick,
    enviarAlerta
} = require("../services/kickAlertService");

// ============================================================
// COMANDO
// ============================================================

module.exports = {

    data: new SlashCommandBuilder()

        .setName("kick-alerta")

        .setDescription(
            "Configura las alertas de directos de Kick"
        )

        // ====================================================
        // CONFIGURAR
        // ====================================================

        .addSubcommand(subcommand =>
            subcommand
                .setName("configurar")
                .setDescription(
                    "Configura el canal actual y el rol para las alertas"
                )
        )

        // ====================================================
        // AÑADIR
        // ====================================================

        .addSubcommand(subcommand =>
            subcommand
                .setName("añadir")
                .setDescription(
                    "Añade un streamer de Kick a las alertas"
                )
                .addStringOption(option =>
                    option
                        .setName("streamer")
                        .setDescription(
                            "Nombre del streamer de Kick"
                        )
                        .setRequired(true)
                )
        )

        // ====================================================
        // ELIMINAR
        // ====================================================

        .addSubcommand(subcommand =>
            subcommand
                .setName("eliminar")
                .setDescription(
                    "Elimina un streamer de las alertas"
                )
                .addStringOption(option =>
                    option
                        .setName("streamer")
                        .setDescription(
                            "Nombre del streamer de Kick"
                        )
                        .setRequired(true)
                )
        )

        // ====================================================
        // PROBAR
        // ====================================================

        .addSubcommand(subcommand =>
            subcommand
                .setName("probar")
                .setDescription(
                    "Envía una alerta de prueba de Kick"
                )
        )

        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        ),

    // ========================================================
    // EXECUTE
    // ========================================================

    async execute(interaction) {

        const subcommand =
            interaction.options.getSubcommand();

        // ====================================================
        // CONFIGURAR
        // ====================================================

        if (
            subcommand === "configurar"
        ) {

            if (
                !interaction.memberPermissions.has(
                    PermissionFlagsBits.ManageGuild
                )
            ) {

                return interaction.reply({
                    content:
                        "❌ Necesitas el permiso **Gestionar servidor** para configurar las alertas de Kick.",
                    ephemeral: true
                });
            }

            const guildId =
                interaction.guild.id;

            let monitor =
                await KickAlertMonitor.findOne({
                    guildId
                });

            if (!monitor) {

                monitor =
                    await KickAlertMonitor.create({
                        guildId,
                        channelId:
                            interaction.channel.id,
                        roleId: null,
                        streamers: []
                    });

            } else {

                monitor.channelId =
                    interaction.channel.id;

                await monitor.save();
            }

            const embed =
                new EmbedBuilder()
                    .setColor(0x53FC18)
                    .setTitle(
                        "🔔 Kick Alerts"
                    )
                    .setDescription(
                        "Selecciona el **rol de Discord** que quieres mencionar cuando un streamer de Kick entre en directo.\n\n" +
                        `📢 **Canal de alertas:** <#${interaction.channel.id}>\n\n` +
                        "El canal utilizado para las alertas será este mismo canal."
                    )
                    .setFooter({
                        text:
                            "RustLogix • Kick Alerts"
                    });

            const menu =
                new RoleSelectMenuBuilder()
                    .setCustomId(
                        "kick_alerta_role"
                    )
                    .setPlaceholder(
                        "Selecciona el rol para las alertas"
                    )
                    .setMinValues(1)
                    .setMaxValues(1);

            const row =
                new ActionRowBuilder()
                    .addComponents(menu);

            return interaction.reply({
                embeds: [embed],
                components: [row],
                ephemeral: true
            });
        }

        // ====================================================
        // AÑADIR STREAMER
        // ====================================================

        if (
            subcommand === "añadir"
        ) {

            const guildId =
                interaction.guild.id;

            const streamerInput =
                interaction.options
                    .getString("streamer")
                    .trim()
                    .replace(/^@/, "");

            if (!streamerInput) {

                return interaction.reply({
                    content:
                        "❌ Debes indicar un nombre de streamer de Kick.",
                    ephemeral: true
                });
            }

            await interaction.deferReply({
                ephemeral: true
            });

            let monitor =
                await KickAlertMonitor.findOne({
                    guildId
                });

            if (!monitor) {

                return interaction.editReply(
                    "❌ Primero debes ejecutar `/kick-alerta configurar`."
                );
            }

            // =================================================
            // COMPROBAR QUE EXISTE EN KICK
            // =================================================

            const streamer =
                await obtenerStreamerKick(
                    streamerInput
                );

            if (!streamer) {

                return interaction.editReply(
                    "❌ No pude encontrar ese streamer en Kick.\n\n" +
                    `Comprueba que el nombre sea correcto: **${streamerInput}**`
                );
            }

            // =================================================
            // COMPROBAR DUPLICADO
            // =================================================

            const usernameNormalizado =
                streamer.username
                    .toLowerCase();

            const existente =
                monitor.streamers.find(
                    item =>
                        String(
                            item.kickUsername
                        ).toLowerCase() ===
                        usernameNormalizado
                );

            if (existente) {

                return interaction.editReply(
                    `⚠️ **${streamer.displayName}** ya está siendo vigilado.`
                );
            }

            // =================================================
            // AÑADIR
            // =================================================

            monitor.streamers.push({

                kickUsername:
                    streamer.username,

                displayName:
                    streamer.displayName,

                isLive:
                    streamer.live,

                lastChecked:
                    new Date(),

                lastLiveAt:
                    streamer.live
                        ? new Date()
                        : null,

                lastOfflineAt:
                    null
            });

            await monitor.save();

            const estado =
                streamer.live
                    ? "🟢 Actualmente está **EN DIRECTO**."
                    : "⚫ Actualmente está **OFFLINE**.";

            const embed =
                new EmbedBuilder()
                    .setColor(0x53FC18)
                    .setTitle(
                        "🔔 Streamer añadido"
                    )
                    .setDescription(
                        `**${streamer.displayName}** ha sido añadido a las alertas de Kick.\n\n` +
                        `${estado}\n\n` +
                        "RustLogix avisará cuando detecte el cambio **OFFLINE → ONLINE**."
                    )
                    .setThumbnail(
                        streamer.avatar || null
                    )
                    .setURL(
                        streamer.url
                    )
                    .setFooter({
                        text:
                            "RustLogix • Kick Alerts"
                    });

            return interaction.editReply({
                embeds: [embed]
            });
        }

        // ====================================================
        // ELIMINAR STREAMER
        // ====================================================

        if (
            subcommand === "eliminar"
        ) {

            const guildId =
                interaction.guild.id;

            const streamerInput =
                interaction.options
                    .getString("streamer")
                    .trim()
                    .replace(/^@/, "")
                    .toLowerCase();

            await interaction.deferReply({
                ephemeral: true
            });

            const monitor =
                await KickAlertMonitor.findOne({
                    guildId
                });

            if (!monitor) {

                return interaction.editReply(
                    "❌ No hay ninguna configuración de alertas de Kick."
                );
            }

            const index =
                monitor.streamers.findIndex(
                    item =>
                        String(
                            item.kickUsername
                        ).toLowerCase() ===
                        streamerInput
                );

            if (index === -1) {

                return interaction.editReply(
                    `❌ **${streamerInput}** no está en la lista de streamers vigilados.`
                );
            }

            const eliminado =
                monitor.streamers[index];

            monitor.streamers.splice(
                index,
                1
            );

            await monitor.save();

            return interaction.editReply(
                `✅ **${eliminado.displayName || eliminado.kickUsername}** ha sido eliminado de las alertas de Kick.`
            );
        }

        // ====================================================
        // PROBAR ALERTA
        // ====================================================

        if (
            subcommand === "probar"
        ) {

            const guildId =
                interaction.guild.id;

            await interaction.deferReply({
                ephemeral: true
            });

            const monitor =
                await KickAlertMonitor.findOne({
                    guildId
                });

            if (!monitor) {

                return interaction.editReply(
                    "❌ Primero debes ejecutar `/kick-alerta configurar`."
                );
            }

            if (!monitor.channelId) {

                return interaction.editReply(
                    "❌ No hay ningún canal configurado para las alertas."
                );
            }

            // =================================================
            // DATOS DE PRUEBA
            // =================================================

            const streamerPrueba = {

                username:
                    "rust",

                displayName:
                    "Kick Alerts",

                live:
                    true,

                avatar:
                    "https://files.kick.com/images/user/1/profile_image/conversion/9c8b5b4f-7e0f-4c7d-8e1d-0b6c7c4f5d6e-fullsize.webp",

                thumbnail:
                    null,

                title:
                    "Esta es una alerta de prueba de RustLogix",

                categoryName:
                    "Rust",

                categoryImage:
                    null,

                viewers:
                    0,

                streamId:
                    null,

                startedAt:
                    new Date(),

                url:
                    "https://kick.com/"
            };

            const enviada =
                await enviarAlerta(
                    interaction.client,
                    monitor,
                    streamerPrueba
                );

            if (!enviada) {

                return interaction.editReply(
                    "❌ No pude enviar la alerta de prueba. Comprueba que el canal configurado siga existiendo y que RustLogix tenga permisos para enviar mensajes y menciones."
                );
            }

            return interaction.editReply(
                "✅ Alerta de prueba enviada correctamente."
            );
        }
    },

    // ========================================================
    // AUTOCOMPLETADO
    // ========================================================

    async autocomplete(interaction) {

        return;
    }
};