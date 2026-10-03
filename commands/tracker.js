const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const {
    resolverJugadorTracker,
    registrarTracker
} = require("../services/trackerService");

const {
    getBattleMetricsPlayerStatus
} = require("../services/battlemetricsSearch");

module.exports = {

    data: new SlashCommandBuilder()

        .setName("tracker")

        .setDescription(
            "Vigila a un jugador durante 24 horas"
        )

        .addStringOption(option =>
            option
                .setName("jugador")
                .setDescription(
                    "ID/link de BattleMetrics o Steam ID"
                )
                .setRequired(true)
        ),

    async execute(interaction) {

        console.log("🎯 Ejecutando /tracker");

        await interaction.deferReply();

        try {

            const jugador =
                interaction.options
                    .getString("jugador")
                    .trim();

            // =====================================================
            // RESOLVER JUGADOR
            // =====================================================

            const resultado =
                await resolverJugadorTracker(
                    jugador,
                    interaction.guild.id
                );

            if (
                !resultado ||
                !resultado.battlemetricsId
            ) {

                return await interaction.editReply(
                    resultado?.error ||
                    "❌ No se pudo encontrar el jugador."
                );
            }

            const battlemetricsId =
                String(
                    resultado.battlemetricsId
                );

            // =====================================================
            // OBTENER ESTADO ACTUAL
            // =====================================================

            const status =
                await getBattleMetricsPlayerStatus(
                    battlemetricsId
                );

            if (!status) {

                return await interaction.editReply(
                    "❌ No se pudieron obtener los datos del jugador desde BattleMetrics."
                );
            }

            const nombre =
                status.name ||
                resultado.nombreBattleMetrics ||
                resultado.nombreSteam ||
                "Desconocido";

            const esOnline =
                Boolean(
                    status.online
                );

            // =====================================================
            // DATOS DEL SERVIDOR
            // =====================================================

            const servidor =
                status.server ||
                "Desconocido";

            const serverId =
                status.serverId ||
                null;

            // =====================================================
            // REGISTRAR TRACKER
            // =====================================================

            const tracker =
                await registrarTracker({

                    battlemetricsId,

                    nombre,

                    canalId:
                        interaction.channel.id,

                    guildId:
                        interaction.guild.id,

                    registradoPor:
                        interaction.user.tag,

                    ultimoEstado:
                        esOnline
                            ? "online"
                            : "offline",

                    inicioSesion:
                        esOnline
                            ? new Date()
                            : null,

                    ultimoServidor:
                        servidor,

                    ultimoServerId:
                        serverId
                });

            // =====================================================
            // EMBED DE CONFIRMACIÓN
            // =====================================================

            const embed =
                new EmbedBuilder()

                    .setTitle(
                        "🎯 Tracker activado"
                    )

                    .setColor(
                        esOnline
                            ? "#57F287"
                            : "#5865F2"
                    )

                    .setDescription(
                        `Se ha comenzado a vigilar a **${nombre}** durante **24 horas**.`
                    )

                    .addFields(

                        {
                            name: "👤 Jugador",
                            value:
                                `\`${nombre}\``,
                            inline: true
                        },

                        {
                            name: "🆔 BattleMetrics",
                            value:
                                `[${battlemetricsId}](https://www.battlemetrics.com/players/${battlemetricsId})`,
                            inline: true
                        },

                        {
                            name: "🎮 Estado actual",
                            value:
                                esOnline
                                    ? "🟢 Online"
                                    : "🔴 Offline",
                            inline: true
                        },

                        {
                            name: "🖥️ Servidor",
                            value:
                                `\`${servidor}\``,
                            inline: true
                        },

                        {
                            name: "⏱️ Duración",
                            value:
                                "`24 horas`",
                            inline: true
                        },

                        {
                            name: "📡 Canal",
                            value:
                                `<#${interaction.channel.id}>`,
                            inline: true
                        }

                    )

                    .setTimestamp()

                    .setFooter({
                        text:
                            "RustLogix • BattleMetrics Tracker"
                    });

            // =====================================================
            // BOTÓN
            // =====================================================

            const row =
                new ActionRowBuilder()
                    .addComponents(

                        new ButtonBuilder()
                            .setLabel(
                                "Ver BattleMetrics"
                            )
                            .setStyle(
                                ButtonStyle.Link
                            )
                            .setURL(
                                `https://www.battlemetrics.com/players/${battlemetricsId}`
                            )
                    );

            // =====================================================
            // RESPUESTA
            // =====================================================

            await interaction.editReply({

                embeds: [
                    embed
                ],

                components: [
                    row
                ]

            });

            // =====================================================
            // LOG
            // =====================================================

            console.log(
                `✅ /tracker terminado | ${nombre} | BM ${battlemetricsId} | ${esOnline ? "ONLINE" : "OFFLINE"}`
            );

        } catch (error) {

            console.error(
                "ERROR TRACKER:",
                error
            );

            if (
                interaction.deferred ||
                interaction.replied
            ) {

                await interaction.editReply(
                    "❌ Ocurrió un error al configurar el tracker."
                ).catch(
                    () => {}
                );

            } else {

                await interaction.reply(
                    "❌ Ocurrió un error al configurar el tracker."
                ).catch(
                    () => {}
                );
            }
        }
    }
};