const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getBattleMetricsHours } = require("../services/battlemetricsHours.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("horasbm")
        .setDescription("Muestra las horas y estadísticas de BattleMetrics mediante el link del perfil")
        .addStringOption(option =>
            option.setName("link")
                .setDescription("Link del perfil de BattleMetrics")
                .setRequired(true)
        ),

    async execute(interaction) {
        const linkInput = interaction.options.getString("link").trim();
        await interaction.deferReply();

        const match = linkInput.match(/\/players\/(\d+)/);
        if (!match || !match[1]) {
            return await interaction.editReply("❌ El enlace proporcionado no es válido. Asegúrate de que sea un enlace de perfil de BattleMetrics.");
        }

        const playerId = match[1];

        try {
            // Llamada al servicio protegido
            const datos = await getBattleMetricsHours(playerId);
            if (!datos) {
                return await interaction.editReply("❌ No se pudieron encontrar datos para ese jugador en BattleMetrics.");
            }

            // Texto dinámico: si está jugando muestra "Servidor Actual", si está offline muestra "Último Servidor"
            const tituloServidor = datos.online ? "🌐 Servidor Actual" : "🌐 Último Servidor Jugado";
            const servidoresEncontrados = datos.servidores?.rust?.datos?.servidoresEncontrados || "N/A";
            
            // Formateamos la sesión actual para que mantenga el estilo de cajita
            const sesionTexto = datos.online ? `${datos.jugando}` : "Offline";

            const embed = new EmbedBuilder()
                .setTitle("🎮 Perfil BattleMetrics")
                .setColor(datos.online ? "#57F287" : "#ED4245")
                .addFields(
                    { name: "👤 Jugador", value: `[${datos.nombre}](https://www.battlemetrics.com/players/${datos.id})`, inline: false },
                    { name: tituloServidor, value: datos.servidor || "Desconocido", inline: false },
                    { name: "⏱️ Sesión Actual", value: `\`${sesionTexto}\``, inline: true },
                    { name: "📈 Horas battlemetrics", value: `\`${datos.totalHoras || 0}h\``, inline: true },
                    { name: "🖥️ Servidores Jugados", value: `\`${servidoresEncontrados}\``, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: "RustLogix" });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error("Error en comando /horasbm:", error);
            
            // Garantizamos una respuesta pase lo que pase para evitar el bloqueo en Discord
            if (interaction.deferred || interaction.replied) {
                return await interaction.editReply({
                    content: "❌ Ocurrió un error al intentar conectar con BattleMetrics. Inténtalo de nuevo más tarde."
                });
            }
        }
    }
};