const {
    SlashCommandBuilder,
    EmbedBuilder,
    ChannelType,
    PermissionFlagsBits
} = require("discord.js");

const ServerConfig = require("../models/ServerConfig");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("setcanalplanilla")
        .setDescription(
            "Configura el canal donde se enviará la revisión automática de la planilla"
        )
        .addChannelOption(option =>
            option
                .setName("canal")
                .setDescription(
                    "Canal donde se enviará la revisión cada hora"
                )
                .addChannelTypes(
                    ChannelType.GuildText,
                    ChannelType.GuildAnnouncement
                )
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        ),

    async execute(interaction) {

        await interaction.deferReply({
            ephemeral: true
        });

        const guildId =
            interaction.guild.id;

        const canal =
            interaction.options.getChannel("canal");

        try {

            // =================================================
            // VERIFICAR CONFIGURACIÓN
            // =================================================

            const config =
                await ServerConfig.findOne({
                    guildId
                });

            if (!config) {

                return interaction.editReply(
                    "❌ Este servidor todavía no tiene configurado BattleMetrics.\n\n" +
                    "Primero configura el servidor con tu comando habitual de configuración."
                );

            }

            // =================================================
            // VERIFICAR PERMISOS DEL BOT
            // =================================================

            const permisos =
                canal.permissionsFor(
                    interaction.guild.members.me
                );

            if (!permisos) {

                return interaction.editReply(
                    "❌ No pude comprobar los permisos del bot en ese canal."
                );

            }

            if (
                !permisos.has(
                    PermissionFlagsBits.ViewChannel
                )
            ) {

                return interaction.editReply(
                    "❌ No tengo permiso para ver ese canal."
                );

            }

            if (
                !permisos.has(
                    PermissionFlagsBits.SendMessages
                )
            ) {

                return interaction.editReply(
                    "❌ No tengo permiso para enviar mensajes en ese canal."
                );

            }

            // =================================================
            // GUARDAR CANAL
            // =================================================

            config.planillaChannelId =
                canal.id;

            await config.save();

            // =================================================
            // RESPUESTA
            // =================================================

            const embed =
                new EmbedBuilder()
                    .setTitle(
                        "📋 Canal de planilla configurado"
                    )
                    .setDescription(
                        `Las revisiones automáticas de la planilla se enviarán en ${canal}.`
                    )
                    .addFields(
                        {
                            name: "⏰ Frecuencia",
                            value: "Cada **1 hora**",
                            inline: true
                        },
                        {
                            name: "📊 Planilla",
                            value: config.sheetId
                                ? "Configurada"
                                : "No configurada",
                            inline: true
                        }
                    )
                    .setColor(0x57F287)
                    .setTimestamp();

            await interaction.editReply({
                embeds: [embed]
            });

            console.log(
                `[PLANILLA] Canal automático configurado: ${canal.id} | Guild: ${guildId}`
            );

        } catch (error) {

            console.error(
                "[PLANILLA] Error configurando canal:",
                error
            );

            await interaction.editReply(
                "❌ Ocurrió un error guardando el canal de la planilla."
            );
        }
    }
};