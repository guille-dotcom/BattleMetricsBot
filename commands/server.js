const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("server")
        .setDescription("Muestra el estado actual, jugadores en línea y detalles del servidor de Rust"),

    async execute(interaction) {
        await interaction.deferReply();

        // 1. Obtener el ID del servidor desde config.json
        let serverId = "433255"; 
        try {
            const configPath = path.join(__dirname, "../data/config.json");
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
                if (config.battlemetricsServer) {
                    serverId = config.battlemetricsServer; 
                }
            }
        } catch (error) {
            console.log("Error leyendo data/config.json:", error.message);
        }

        try {
            // 2. Consulta a BattleMetrics incluyendo los Headers de autorización y User-Agent
            // Nota: Si ya usas un token en tus otros servicios, asegúrate de colocarlo aquí o usar process.env.BATTLEMETRICS_TOKEN
            const response = await axios.get(`https://api.battlemetrics.com/servers/${serverId}`, {
                headers: {
                    // Si en tu otro servicio (battlemetricsHours.js) usas un token, ponlo aquí (ej: `Bearer tu_token`)
                    // O si la API te pide una clave específica, cámbiala en este header:
                    // "Authorization": `Bearer ${process.env.BATTLEMETRICS_TOKEN}`
                    "User-Agent": "RustLogix-DiscordBot"
                }
            });

            const serverData = response.data.data;

            const name = serverData.attributes.name || "Servidor Desconocido";
            const status = serverData.attributes.status; 
            const players = serverData.attributes.players || 0;
            const maxPlayers = serverData.attributes.maxPlayers || 0;
            const ip = serverData.attributes.ip || "N/A";
            const port = serverData.attributes.port || "N/A";
            const rank = serverData.attributes.rank || "N/A";
            
            const details = serverData.attributes.details || {};
            const map = details.map || "Desconocido";
            const wipeTime = details.rust_last_wipe ? new Date(details.rust_last_wipe).toLocaleString() : "Desconocido";

            const isOnline = status === "online";
            const estadoTexto = isOnline ? "🟢 En Línea" : "🔴 Fuera de Línea";
            const colorEmbed = isOnline ? "#57F287" : "#FF0000";

            const embed = new EmbedBuilder()
                .setTitle(`🎮 Estado del Servidor`)
                .setDescription(`**${name}**`)
                .setColor(colorEmbed)
                .addFields(
                    { name: "🖥️ Estado", value: estadoTexto, inline: true },
                    { name: "👥 Jugadores", value: `\`${players} / ${maxPlayers}\``, inline: true },
                    { name: "🏆 Ranking BM", value: `\`#${rank}\``, inline: true },
                    { name: "🗺️ Mapa", value: `\`${map}\``, inline: true },
                    { name: "🛠️ Último Wipe", value: `\`${wipeTime}\``, inline: true },
                    { name: "🌐 Conexión", value: `\`connect ${ip}:${port}\``, inline: false },
                    { name: "🔗 Enlace BattleMetrics", value: `[Ver en BattleMetrics](https://www.battlemetrics.com/servers/rust/${serverId})`, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: "RustLogix" });

            return await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error("Error al consultar el servidor en BattleMetrics:", error.message);
            return await interaction.editReply("❌ No se pudo obtener el estado del servidor en este momento. Inténtalo más tarde.");
        }
    }
};