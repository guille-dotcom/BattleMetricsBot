const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const {
    obtenerBattleMetricsId,
    registrarTracker
} = require("../services/trackerService");

const {
    getBattleMetricsPlayerStatus
} = require("../services/battlemetricsSearch");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("tracker")
        .setDescription("Rastrea un jugador de BattleMetrics durante 24 horas")
        .addStringOption(option =>
            option
                .setName("jugador")
                .setDescription("ID o link de BattleMetrics")
                .setRequired(true)
        ),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const jugador = interaction.options.getString("jugador");
            const battlemetricsId = obtenerBattleMetricsId(jugador);

            if (!battlemetricsId) {
                return await interaction.editReply(
                    "❌ ID o link de BattleMetrics inválido."
                );
            }

            const status = await getBattleMetricsPlayerStatus(battlemetricsId);
            const nombre = status?.name || "Desconocido";
            const esOnline =
                status &&
                (status.online === true || status.online === "true");

            await registrarTracker({
                battlemetricsId,
                nombre,
                canalId: interaction.channel.id,
                guildId: interaction.guild.id,
                registradoPor: interaction.user.tag,
                estadoForzado: esOnline ? "online" : "offline",
                inicioSesionForzado: esOnline ? new Date() : null,
                servidorForzado: esOnline ? status.server : null,
                serverIdForzado: esOnline ? status.serverId : null
            });

            const serverToShow = status?.server || "Desconocido";

            // =====================================================
            // EMBED: TRACKER CREADO
            // =====================================================

            const embedConfirmacion = new EmbedBuilder()
                .setAuthor({
                    name: "RustLogix • BattleMetrics Tracker"
                })
                .setTitle("🎯 TRACKER ACTIVADO")
                .setDescription(
                    `El seguimiento de **${nombre}** ha sido activado correctamente durante **24 horas**.`
                )
                .setColor(esOnline ? 0x57F287 : 0xED4245)
                .addFields(
                    {
                        name: "👤 Jugador",
                        value: `**${nombre}**`,
                        inline: false
                    },
                    {
                        name: "📡 Estado",
                        value: esOnline
                            ? "🟢 **ONLINE**"
                            : "🔴 **OFFLINE**",
                        inline: true
                    },
                    {
                        name: "⏱️ Duración",
                        value: "`24 horas`",
                        inline: true
                    },
                    {
                        name: "🎮 Servidor",
                        value: `\`${serverToShow}\``,
                        inline: false
                    },
                    {
                        name: "🆔 BattleMetrics",
                        value: `\`${battlemetricsId}\``,
                        inline: true
                    },
                    {
                        name: "👮 Registrado por",
                        value: interaction.user.tag,
                        inline: true
                    }
                )
                .setFooter({
                    text: "RustLogix • Tracker activo"
                })
                .setTimestamp();

            const botonPerfil = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel("Ver perfil BattleMetrics")
                    .setStyle(ButtonStyle.Link)
                    .setURL(
                        `https://www.battlemetrics.com/players/${battlemetricsId}`
                    )
                    .setEmoji("🔗")
            );

            await interaction.editReply({
                embeds: [embedConfirmacion],
                components: [botonPerfil]
            });

            // =====================================================
            // EMBED: ESTADO ACTUAL
            // =====================================================

            if (esOnline) {
                const embedOnline = new EmbedBuilder()
                    .setAuthor({
                        name: "RustLogix • BattleMetrics Tracker"
                    })
                    .setTitle("🟢 JUGADOR ONLINE")
                    .setDescription(
                        `**${status.name || nombre}** está actualmente conectado a un servidor.`
                    )
                    .setColor(0x57F287)
                    .addFields(
                        {
                            name: "👤 Jugador",
                            value: `**${status.name || nombre}**`,
                            inline: false
                        },
                        {
                            name: "🎮 Servidor actual",
                            value: `\`${serverToShow}\``,
                            inline: false
                        },
                        {
                            name: "⏱️ Tiempo jugando",
                            value: `\`${status.jugando || "0m"}\``,
                            inline: true
                        },
                        {
                            name: "📡 Estado",
                            value: "🟢 **ONLINE**",
                            inline: true
                        }
                    )
                    .setFooter({
                        text: "RustLogix • Tracker activo"
                    })
                    .setTimestamp();

                await interaction.channel.send({
                    embeds: [embedOnline],
                    components: [botonPerfil]
                });

            } else {
                const embedOffline = new EmbedBuilder()
                    .setAuthor({
                        name: "RustLogix • BattleMetrics Tracker"
                    })
                    .setTitle("🔴 JUGADOR OFFLINE")
                    .setDescription(
                        `**${nombre}** no está conectado actualmente.\n\nEl tracker continuará vigilando su actividad durante las próximas **24 horas**.`
                    )
                    .setColor(0xED4245)
                    .addFields(
                        {
                            name: "👤 Jugador",
                            value: `**${nombre}**`,
                            inline: false
                        },
                        {
                            name: "📡 Estado",
                            value: "🔴 **OFFLINE**",
                            inline: true
                        },
                        {
                            name: "👁️ Tracker",
                            value: "🟢 **Activo**",
                            inline: true
                        },
                        {
                            name: "⏳ Próximo evento",
                            value: "Esperando conexión...",
                            inline: false
                        }
                    )
                    .setFooter({
                        text: "RustLogix • Esperando conexión"
                    })
                    .setTimestamp();

                await interaction.channel.send({
                    embeds: [embedOffline],
                    components: [botonPerfil]
                });
            }

        } catch (error) {
            console.error("ERROR TRACKER:", error);

            if (interaction.deferred || interaction.replied) {
                await interaction.editReply("❌ Error creando tracker.");
            } else {
                await interaction.reply({
                    content: "❌ Error creando tracker.",
                    ephemeral: true
                });
            }
        }
    }
};