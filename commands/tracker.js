const {
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlags
} = require("discord.js");

const {
    obtenerBattleMetricsId,
    registrarTracker,
    revisarTrackers
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

            const tracker = await registrarTracker({
                battlemetricsId,
                nombre,
                canalId: interaction.channel.id,
                guildId: interaction.guild.id,
                registradoPor: interaction.user.tag
            });

            const embed = new EmbedBuilder()
                .setTitle("🎯 Tracker creado")
                .setColor("#57F287")
                .addFields(
                    {
                        name: "👤 Jugador",
                        value: `\`${nombre}\``,
                        inline: false
                    },
                    {
                        name: "🆔 BattleMetrics",
                        value: `\`${battlemetricsId}\``,
                        inline: true
                    },
                    {
                        name: "⏱ Duración",
                        value: "24 horas",
                        inline: true
                    },
                    {
                        name: "👤 Registrado por",
                        value: interaction.user.tag,
                        inline: false
                    }
                )
                .setTimestamp()
                .setFooter({
                    text: "RustLogix"
                });

            await interaction.editReply({
                embeds: [embed]
            });

            // 🚀 Forzamos la revisión inmediata pasando el ID específico del tracker recién creado
            await revisarTrackers(interaction.client, tracker._id);

        } catch (error) {
            console.error("ERROR TRACKER:", error);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply("❌ Error creando tracker.");
            } else {
                await interaction.reply({
                    content: "❌ Error creando tracker.",
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    }
};