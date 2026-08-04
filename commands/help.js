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
                "Antes de usar los comandos, debes configurar tu entorno:\n\n" +
                "👉 **/configurar-servidor** — Establece el servidor de Rust activo.\n" +
                "👉 **/setupsheet** — Configura la planilla de Google Sheets para este servidor.\n\n" +
                "💡 **Para administradores (Planilla de Google Sheets):**\n" +
                "1. Crea un Google Sheet nuevo.\n" +
                "2. Dale permisos de **Editor** al correo:\n" +
                "`bot-rustlogix@solid-groove-447515-t7.iam.gserviceaccount.com`\n" +
                "3. Usa `/setupsheet` y pega el enlace de tu planilla."
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

        // 4. Registro y Consultas
        const registroYConsultas = new EmbedBuilder()
            .setTitle("📋 Registro y Consultas")
            .setDescription(
                "📝 **/registrar** — Registra un jugador en la planilla configurada.\n" +
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
                registroYConsultas,
                informacion
            ]
        });
    }
};