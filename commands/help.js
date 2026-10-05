const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Muestra la lista de comandos del RustLogix"),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            // ============================================================
            // 1. CONFIGURACIÓN
            // ============================================================

            const configuracion = new EmbedBuilder()
                .setTitle("⚙️ Configuración")
                .setDescription(
                    "🛠️ **/configurar-servidor** — Configura el servidor de Rust que utilizará RustLogix."
                )
                .setColor(0x3498DB);

            // ============================================================
            // 2. SERVIDOR Y ESTADÍSTICAS
            // ============================================================

            const servidor = new EmbedBuilder()
                .setTitle("🖥️ Servidor y Estadísticas")
                .setDescription(
                    "⏱️ **/horas** — Consulta las horas de un jugador por Steam ID.\n" +
                    "📊 **/horasbm** — Consulta las horas de un jugador mediante su perfil de BattleMetrics.\n" +
                    "🖥️ **/server** — Muestra información del servidor configurado."
                )
                .setColor(0xFEE75C);

            // ============================================================
            // 3. TIENDA DE RUST
            // ============================================================

            const tienda = new EmbedBuilder()
                .setTitle("🛒 Tienda de Rust")
                .setDescription(
                    "🛍️ **/tienda** — Consulta los artículos disponibles actualmente en la tienda de Rust.\n" +
                    "⚙️ **/configurar-tienda** — Configura el canal de Discord para el funcionamiento de la tienda de Rust."
                )
                .setColor(0xE67E22);

            // ============================================================
            // 4. SISTEMA TRACKER
            // ============================================================

            const tracker = new EmbedBuilder()
                .setTitle("🎯 Sistema Tracker")
                .setDescription(
                    "🎮 **/tracker** — Inicia el seguimiento de un jugador durante 24 horas.\n" +
                    "📋 **/trackers-activos** — Muestra los jugadores que están siendo rastreados actualmente.\n" +
                    "🗑️ **/tracker-limpiar** — Elimina los trackers activos."
                )
                .setColor(0x57F287);

            // ============================================================
            // 5. INTERACCIÓN
            // ============================================================

            const interaccion = new EmbedBuilder()
                .setTitle("🎉 Interacción")
                .setDescription(
                    "📊 **/encuesta** — Crea una encuesta para los miembros del servidor.\n" +
                    "🎁 **/giveaway** — Crea y gestiona sorteos en el servidor."
                )
                .setColor(0x9B59B6);

            // ============================================================
            // 6. UTILIDADES
            // ============================================================

            const utilidades = new EmbedBuilder()
                .setTitle("📡 Utilidades")
                .setDescription(
                    "🏓 **/ping** — Comprueba la latencia y el estado del bot."
                )
                .setColor(0x95A5A6)
                .setFooter({
                    text: "RustLogix • Ayuda de comandos"
                })
                .setTimestamp();

            // ============================================================
            // RESPUESTA
            // ============================================================

            await interaction.editReply({
                embeds: [
                    configuracion,
                    servidor,
                    tienda,
                    tracker,
                    interaccion,
                    utilidades
                ]
            });

        } catch (error) {
            console.error("Error en el comando help:", error);

            await interaction.editReply({
                content: "❌ Ocurrió un error al intentar mostrar la ayuda de comandos."
            });
        }
    }
};