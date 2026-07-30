const {
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlags
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

            // 1. Registramos en la base de datos
            const tracker = await registrarTracker({
                battlemetricsId,
                nombre,
                canalId: interaction.channel.id,
                guildId: interaction.guild.id,
                registradoPor: interaction.user.tag
            });

            // Actualizamos su estado a online/offline directamente en la BD para que el bucle sepa que ya no está en "desconocido"
            if (status && status.online) {
                tracker.ultimoEstado = "online";
                tracker.inicioSesion = new Date();
                tracker.ultimoServidor = status.server;
                tracker.ultimoServerId = status.serverId;
            } else {
                tracker.ultimoEstado = "offline";
            }
            await tracker.save();

            // 2. Creamos el embed de confirmación del comando
            const embedConfirmacion = new EmbedBuilder()
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
                embeds: [embedConfirmacion]
            });

            // 3. ENVIAR EL EMBED DE ESTADO AL INSTANTE AL CANAL
            const serverToShow = status.server || "Desconocido";
            if (status && status.online) {
                await interaction.channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("🎯 RustLogix")
                            .setDescription(
`🟢 **JUGADOR ONLINE**

👤 **${status.name}**

🆔 [Perfil BattleMetrics](https://www.battlemetrics.com/players/${battlemetricsId})

🎮 **Servidor**
||${serverToShow}||

⏱ **Jugando**
${status.jugando || "0m"}

📡 Estado actualizado`
                            )
                            .setColor(0x00ff00)
                            .setTimestamp()
                    ]
                });
            } else {
                await interaction.channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("🎯 RustLogix")
                            .setDescription(
`🔴 **JUGADOR OFFLINE**

👤 **${nombre}**

🆔 [Perfil BattleMetrics](https://www.battlemetrics.com/players/${battlemetricsId})

⏳ Esperando conexión...

📡 Tracker activo`
                            )
                            .setColor(0xff0000)
                            .setTimestamp()
                    ]
                });
            }

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