const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Muestra la lista de comandos del RustLogix"),

    async execute(interaction) {
        // 1. Configuración Inicial
        const configuracion = new EmbedBuilder()
            .setTitle("⚙️ Configuración Inicial")
            .setDescription(
                "Antes de usar los comandos del servidor, debes configurar el servidor de Rust predeterminado.\n\n" +
                "👉 **/configurar-servidor** — Establece el servidor activo."
            )
            .setColor(0x3498DB);

        // 2. Comandos del Servidor
        const servidor = new EmbedBuilder()
            .setTitle("🖥️ Comandos del Servidor")
            .setDescription(
                "*Requieren haber ejecutado `/configurar-servidor` previamente.*\n\n" +
                "⏱️ **/horas** — Muestra las horas de un usuario en el servidor.\n" +
                "🏆 **/ranking** — Muestra el top de jugadores del servidor."
            )
            .setColor(0xFEE75C);

        // 3. Sistema Tracker
        const tracker = new EmbedBuilder()
            .setTitle("🎯 Sistema Tracker (24h)")
            .setDescription(
                "🎮 **/tracker** — Inicia el seguimiento de un jugador.\n" +
                "📋 **/trackers-activos** — Lista los jugadores bajo vigilancia.\n" +
                "🗑️ **/tracker-limpiar** — Elimina trackers activos."
            )
            .setColor(0x57F287);

        // 4. Consultas Externas
        const battlemetrics = new EmbedBuilder()
            .setTitle("🔎 Consultas BattleMetrics")
            .setDescription(
                "🔎 **/horasbm** — Consulta estadísticas globales mediante un enlace de perfil."
            )
            .setColor(0x9B59B6);

        // 5. Utilidades / Información
        const informacion = new EmbedBuilder()
            .setTitle("📡 Utilidades")
            .setDescription(
                "📡 **/ping** — Comprueba el estado de latencia del bot."
            )
            .setColor(0x95A5A6)
            .setFooter({
                text: "RustLogix • Ayuda de comandos"
            })
            .setTimestamp();

        // Enviar todos los embeds juntos en la respuesta
        await interaction.reply({
            embeds: [
                configuracion,
                servidor,
                tracker,
                battlemetrics,
                informacion
            ]
        });
    }
};