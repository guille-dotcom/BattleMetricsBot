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
// NORMALIZAR STREAMER DE KICK
// ============================================================

function normalizarStreamerKick(input) {

    if (!input) {
        return "";
    }

    let valor =
        String(input)
            .trim()
            .replace(/^@/, "");

    // --------------------------------------------------------
    // Si es una URL de Kick
    // --------------------------------------------------------

    if (
        /^https?:\/\/(?:www\.)?kick\.com\//i.test(valor)
    ) {

        try {

            const url =
                new URL(valor);

            valor =
                url.pathname
                    .replace(/^\/+/, "")
                    .split("/")[0]
                    .trim();

        } catch {

            valor =
                valor
                    .replace(
                        /^https?:\/\/(?:www\.)?kick\.com\//i,
                        ""
                    )
                    .split(/[/?#]/)[0]
                    .trim();
        }
    }

    // --------------------------------------------------------
    // Si alguien pone solamente kick.com/nombre
    // --------------------------------------------------------

    else if (
        /^kick\.com\//i.test(valor)
    ) {

        valor =
            valor
                .replace(/^kick\.com\//i, "")
                .split(/[/?#]/)[0]
                .trim();
    }

    // --------------------------------------------------------
    // Limpiar restos
    // --------------------------------------------------------

    valor =
        valor
            .replace(/^\/+/, "")
            .replace(/\/+$/, "")
            .split(/[/?#]/)[0]
            .trim();

    return valor;
}

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
                            "Nombre o enlace del streamer de Kick"
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
                            "Nombre o enlace del streamer de Kick"
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

            const input =
                interaction.options
                    .getString("streamer")
                    .trim();

            // ------------------------------------------------
            // Convertir nombre o URL a username
            // ------------------------------------------------

            const streamerInput =
                normalizarStreamerKick(input);

            if (!streamerInput) {

                return interaction.reply({
                    content:
                        "❌ Debes indicar un nombre o enlace válido de un streamer de Kick.",
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
                    `Comprueba que el nombre o enlace sea correcto: **${streamerInput}**`
                );
            }

            // =================================================
            // COMPROBAR DUPLICADO
            // =================================================

            const usernameNormalizado =
                String(
                    streamer.username || streamerInput
                ).toLowerCase();

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
                        streamer.url ||
                        `https://kick.com/${streamer.username}`
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

            const input =
                interaction.options
                    .getString("streamer")
                    .trim();

            const streamerInput =
                normalizarStreamerKick(input)
                    .toLowerCase();

            if (!streamerInput) {

                return interaction.reply({
                    content:
                        "❌ Debes indicar un nombre o enlace válido de un streamer de Kick.",
                    ephemeral: true
                });
            }

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
            // NECESITAMOS UN STREAMER REAL
            // =================================================

            if (
                !monitor.streamers ||
                monitor.streamers.length === 0
            ) {

                return interaction.editReply(
                    "❌ Primero debes añadir al menos un streamer con `/kick-alerta añadir`."
                );
            }

            // =================================================
            // USAR EL PRIMER STREAMER CONFIGURADO
            // =================================================

            const streamerConfigurado =
                monitor.streamers[0];

            const username =
                streamerConfigurado.kickUsername;

            let streamerPrueba =
                await obtenerStreamerKick(
                    username
                );

            if (!streamerPrueba) {

                return interaction.editReply(
                    `❌ No pude obtener actualmente los datos de **${streamerConfigurado.displayName || username}** desde Kick.`
                );
            }

            // =================================================
            // FORZAR ESTADO DE DIRECTO PARA LA PRUEBA
            //
            // Los datos visuales vienen del streamer real.
            // Solo modificamos lo necesario para simular
            // que acaba de entrar en directo.
            // =================================================

            streamerPrueba = {

                ...streamerPrueba,

                username:
                    streamerPrueba.username ||
                    username,

                displayName:
                    streamerPrueba.displayName ||
                    streamerConfigurado.displayName ||
                    username,

                live:
                    true,

                title:
                    streamerPrueba.title ||
                    "Esta es una alerta de prueba de RustLogix",

                categoryName:
                    streamerPrueba.categoryName ||
                    "Rust",

                startedAt:
                    streamerPrueba.startedAt ||
                    new Date(),

                url:
                    streamerPrueba.url ||
                    `https://kick.com/${username}`
            };

            // =================================================
            // ENVIAR EXACTAMENTE LA MISMA ALERTA
            // QUE SE UTILIZA EN OFFLINE → ONLINE
            // =================================================

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
                `✅ Alerta de prueba enviada correctamente usando **${streamerPrueba.displayName}**.`
            );
        }
    },

    // ========================================================
    // SELECTOR DE ROL
    // ========================================================

    async manejarSelectRol(interaction) {

        if (
            !interaction.isRoleSelectMenu()
        ) {
            return;
        }

        if (
            interaction.customId !==
            "kick_alerta_role"
        ) {
            return;
        }

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

        const roleId =
            interaction.values[0];

        const guildId =
            interaction.guild.id;

        const monitor =
            await KickAlertMonitor.findOne({
                guildId
            });

        if (!monitor) {

            return interaction.reply({
                content:
                    "❌ Primero debes ejecutar `/kick-alerta configurar`.",
                ephemeral: true
            });
        }

        monitor.roleId =
            roleId;

        await monitor.save();

        const role =
            interaction.guild.roles.cache.get(
                roleId
            );

        return interaction.update({

            embeds: [
                new EmbedBuilder()
                    .setColor(0x53FC18)
                    .setTitle(
                        "🔔 Kick Alerts configurado"
                    )
                    .setDescription(
                        `📢 **Canal de alertas:** <#${monitor.channelId}>\n\n` +
                        `👤 **Rol de alertas:** ${role ? `<@&${role.id}>` : `<@&${roleId}>`}\n\n` +
                        "Los avisos se enviarán cuando un streamer pase de **OFFLINE → ONLINE**."
                    )
                    .setFooter({
                        text:
                            "RustLogix • Kick Alerts"
                    })
            ],

            components: []
        });
    },

    // ========================================================
    // AUTOCOMPLETADO
    // ========================================================

    async autocomplete(interaction) {

        return;
    }
};