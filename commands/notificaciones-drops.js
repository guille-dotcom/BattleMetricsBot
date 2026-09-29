const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder
} = require("discord.js");

const RustDropsMonitor =
    require("../models/RustDropsMonitor");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("notificaciones-drops")
        .setDescription(
            "Activa o desactiva las notificaciones de Streamer Drops ONLINE EN RUST."
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        )
        .addStringOption(option =>
            option
                .setName("estado")
                .setDescription(
                    "Activar o desactivar las notificaciones."
                )
                .setRequired(true)
                .addChoices(
                    {
                        name: "🔔 Activar",
                        value: "activar"
                    },
                    {
                        name: "🔕 Desactivar",
                        value: "desactivar"
                    }
                )
        ),

    async execute(interaction) {
        try {
            const estado =
                interaction.options.getString(
                    "estado"
                );

            const monitor =
                await RustDropsMonitor.findOne({
                    guildId:
                        interaction.guild.id
                });

            if (!monitor) {
                return interaction.reply({
                    content:
                        "❌ Este servidor todavía no tiene configurado el sistema de Twitch Drops. Configúralo primero.",
                    ephemeral: true
                });
            }

            const activar =
                estado === "activar";

            monitor.notificacionesStreamer =
                activar;

            await monitor.save();

            const embed =
                new EmbedBuilder()
                    .setColor(
                        activar
                            ? 0x57f287
                            : 0xed4245
                    )
                    .setTitle(
                        activar
                            ? "🔔 Notificaciones activadas"
                            : "🔕 Notificaciones pausadas"
                    )
                    .setDescription(
                        activar
                            ? "Las notificaciones de **Streamer Drops ONLINE EN RUST** están activadas."
                            : "Las notificaciones de **Streamer Drops ONLINE EN RUST** están pausadas."
                    )
                    .addFields({
                        name:
                            "📡 El sistema de Drops",
                        value:
                            activar
                                ? "El bot seguirá revisando los streamers y enviará avisos cuando detecte que vuelven a estar ONLINE EN RUST."
                                : "El bot **seguirá revisando los streamers y guardando sus estados**, pero no enviará nuevos avisos mientras estén pausadas."
                    })
                    .setFooter({
                        text:
                            "RustLogix • Twitch Drops"
                    })
                    .setTimestamp();

            await interaction.reply({
                embeds: [
                    embed
                ],
                ephemeral: true
            });

            console.log(
                `${activar ? "🔔" : "🔕"} Notificaciones de Streamer Drops ${activar ? "activadas" : "pausadas"} en ${interaction.guild.name} (${interaction.guild.id}).`
            );

        } catch (error) {
            console.error(
                "❌ Error en /notificaciones-drops:",
                error
            );

            if (
                interaction.replied ||
                interaction.deferred
            ) {
                await interaction.followUp({
                    content:
                        "❌ Ocurrió un error al cambiar las notificaciones de Drops.",
                    ephemeral: true
                }).catch(() => {});
            } else {
                await interaction.reply({
                    content:
                        "❌ Ocurrió un error al cambiar las notificaciones de Drops.",
                    ephemeral: true
                }).catch(() => {});
            }
        }
    }
};