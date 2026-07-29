const {
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlags
} = require("discord.js");

const {
    getBattleMetricsHours
} = require("../services/battlemetricsHours");

// Función auxiliar para convertir horas decimales a formato "Xh Ym"
function formatHoursToHoursMinutes(decimalHours) {
    const totalMinutes = Math.round(parseFloat(decimalHours) * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours === 0 && minutes === 0) return "0m";
    if (hours === 0) return `${minutes}m`;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("horasbm")
        .setDescription(
            "Muestra las horas usando un perfil de BattleMetrics"
        )
        .addStringOption(option =>
            option
                .setName("link")
                .setDescription(
                    "Link del perfil BattleMetrics"
                )
                .setRequired(true)
        ),

    async execute(interaction) {
        try {
            console.log("===== INICIO /horasbm =====");

            await interaction.deferReply();

            const link = interaction.options.getString("link");
            console.log("LINK:", link);

            const match = link.match(/players\/(\d+)/);
            if (!match) {
                return await interaction.editReply(
                    "❌ Link inválido.\n\nEjemplo:\nhttps://www.battlemetrics.com/players/1010507609"
                );
            }

            const battlemetricsId = match[1];
            console.log("ID BM:", battlemetricsId);

            await interaction.editReply(
                "⏱️ Calculando horas..."
            );

            const data = await getBattleMetricsHours(battlemetricsId);
            console.log("DATOS RECIBIDOS:", data);

            const totalHoras = Number(data.totalHoras || 0);
            const nombreJugador = data.nombre || "Desconocido";
            const primerServidor = data.primerServidor || "Desconocido";
            const ultimoWipe = data.ultimoWipe || "Desconocido";
            const horasDesdeWipeDecimal = data.horasDesdeWipe || "0.00";

            // Aplicamos la conversión a formato "Xh Ym"
            const horasDesdeWipeFormateadas = formatHoursToHoursMinutes(horasDesdeWipeDecimal);

            let servidoresEncontrados = 0;
            try {
                servidoresEncontrados = data.servidores.rust.datos.servidoresEncontrados || 0;
            } catch {
                servidoresEncontrados = 0;
            }

            const embed = new EmbedBuilder()
                .setTitle("🎮 Perfil BattleMetrics")
                .setColor("#57F287")
                .addFields(
                    {
                        name: "👤 Jugador",
                        value: `[${nombreJugador}](https://www.battlemetrics.com/players/${battlemetricsId})`,
                        inline: false
                    },
                    {
                        name: "🌐 Servidor Actual",
                        value: `${primerServidor}`,
                        inline: false
                    },
                    {
                        name: "🛠️ Último Wipe",
                        value: `\`${ultimoWipe}\``,
                        inline: false
                    },
                    {
                        name: "⏱️ Horas battlemetrics",
                        value: `**> ${totalHoras.toFixed(2)}h**`,
                        inline: false
                    },
                    {
                        name: "⏱️ Horas desde el Wipe",
                        value: `\`${horasDesdeWipeFormateadas}\``,
                        inline: true
                    },
                    {
                        name: "🖥️ Servidores Jugados",
                        value: `\`${servidoresEncontrados}\``,
                        inline: true
                    }
                )
                .setTimestamp()
                .setFooter({
                    text: "RustLogix"
                });

            console.log("ENVIANDO EMBED...");

            await interaction.editReply({
                content: null,
                embeds: [embed]
            });

            console.log("✅ RESPUESTA ENVIADA");

        } catch (error) {
            console.error("ERROR EN /horasbm");
            console.error(error);

            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(
                        "❌ Ocurrió un error ejecutando el comando."
                    );
                } else {
                    await interaction.reply({
                        content: "❌ Ocurrió un error ejecutando el comando.",
                        flags: MessageFlags.Ephemeral
                    });
                }
            } catch (err) {
                console.error("ERROR RESPONDIENDO A DISCORD");
                console.error(err);
            }
        }
    }
};