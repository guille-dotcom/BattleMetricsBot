const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder
} = require("discord.js");

const RustDropsMonitor =
    require("../models/RustDropsMonitor");

const KickDropsMonitor =
    require("../models/KickDropsMonitor");

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

            const activar =
                estado === "activar";

            const guildId =
                interaction.guild.id;

            // ====================================================
            // TWITCH
            // ====================================================

            const monitorTwitch =
                await RustDropsMonitor.findOne({
                    guildId
                });

            // ====================================================
            // KICK
            // ====================================================

            const monitorKick =
                await KickDropsMonitor.findOne({
                    guildId
                });

            // ====================================================
            // COMPROBAR CONFIGURACIÓN
            // ====================================================

            if (
                !monitorTwitch &&
                !monitorKick
            ) {

                return interaction.reply({
                    content:
                        "❌ Este servidor todavía no tiene configurado el sistema de Drops de Twitch ni de Kick."
                });

            }

            // ====================================================
            // ACTUALIZAR TWITCH
            // ====================================================

            if (
                monitorTwitch
            ) {

                monitorTwitch.notificacionesStreamer =
                    activar;

                await monitorTwitch.save();

            }

            // ====================================================
            // ACTUALIZAR KICK
            // ====================================================

            if (
                monitorKick
            ) {

                monitorKick.notificacionesStreamer =
                    activar;

                await monitorKick.save();

            }

            // ====================================================
            // PLATAFORMAS CONFIGURADAS
            // ====================================================

            const plataformas = [];

            if (
                monitorTwitch
            ) {

                plataformas.push(
                    "🟣 **Twitch**"
                );

            }

            if (
                monitorKick
            ) {

                plataformas.push(
                    "🟢 **Kick**"
                );

            }

            // ====================================================
            // EMBED
            // ====================================================

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
                    .addFields(
                        {
                            name:
                                "📡 Plataformas",

                            value:
                                plataformas.join(
                                    "\n"
                                )
                        },

                        {
                            name:
                                "⚙️ Funcionamiento",

                            value:
                                activar
                                    ? "El bot seguirá revisando los streamers y enviará avisos cuando detecte que vuelven a estar **ONLINE EN RUST**."
                                    : "El bot **seguirá revisando los streamers y guardando sus estados**, pero no enviará nuevos avisos mientras estén pausadas."
                        }
                    )
                    .setFooter({
                        text:
                            "RustLogix • Drops"
                    })
                    .setTimestamp();

            // ====================================================
            // RESPUESTA PÚBLICA
            // ====================================================

            await interaction.reply({
                embeds: [
                    embed
                ]
            });

            console.log(
                `${activar ? "🔔" : "🔕"} Notificaciones de Streamer Drops ${activar ? "activadas" : "pausadas"} en ${interaction.guild.name} (${guildId}). ` +
                `Twitch: ${monitorTwitch ? "OK" : "no configurado"} | ` +
                `Kick: ${monitorKick ? "OK" : "no configurado"}`
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
                        "❌ Ocurrió un error al cambiar las notificaciones de Drops."
                }).catch(() => {});

            } else {

                await interaction.reply({
                    content:
                        "❌ Ocurrió un error al cambiar las notificaciones de Drops."
                }).catch(() => {});

            }

        }

    }

};