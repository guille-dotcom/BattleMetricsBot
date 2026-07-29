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
            console.log("Console log - Error leyendo data/config.json:", error.message);
        }

        try {
            const response = await axios.get(`https://api.battlemetrics.com/servers/${serverId}`, {
                headers: {
                    "Authorization": `Bearer ${process.env.BATTLEMETRICS_TOKEN}`,
                    "User-Agent": "RustLogix-DiscordBot"
                }
            });

            const serverData = response.data.data;
            const attributes = serverData.attributes || {};

            const name = attributes.name || "Servidor Desconocido";
            const status = attributes.status; 
            const players = attributes.players || 0;
            const maxPlayers = attributes.maxPlayers || 0;
            
            const address = attributes.hostname || attributes.ip || "N/A";
            const port = attributes.port || 28015;
            const rank = attributes.rank || "N/A";
            
            const details = attributes.details || {};
            
            // 🔎 Depuración en consola de Render para ver las claves reales del servidor
            console.log("=== KEYS EN DETAILS ===", Object.keys(details));
            console.log("=== VALOR RUST WIPE ===", details.rust_last_wipe, details.rust_lastWipe, details.wipe, details.lastWipe);

            let rawMap = details.map;
            let mapName = "Ver Mapa en BattleMetrics";
            if (rawMap && typeof rawMap === "string" && !rawMap.includes("discord") && !rawMap.includes("http") && rawMap.length < 30) {
                mapName = rawMap;
            }

            const bmServerUrl = `https://www.battlemetrics.com/servers/rust/${serverId}`;
            const connectText = `client.connect ${address}:${port}`;

            let wipeTime = "Desconocido";
            const rawWipe = details.rust_last_wipe || details.rust_lastWipe || details.wipe || details.lastWipe || details.rust_wipeTime || details.server_wipe;
            
            if (rawWipe) {
                const timestamp = typeof rawWipe === "number" && rawWipe < 10000000000 ? rawWipe * 1000 : rawWipe;
                const fechaWipe = new Date(timestamp);
                
                if (!isNaN(fechaWipe.getTime())) {
                    wipeTime = fechaWipe.toLocaleDateString("es-ES", {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                }
            }

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
                    { name: "🗺️ Mapa", value: `[${mapName}](${bmServerUrl})`, inline: true },
                    { name: "🛠️ Último Wipe", value: `\`${wipeTime}\``, inline: true },
                    { name: "🌐 Conexión", value: `\`${connectText}\``, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: "RustLogix" });

            return await interaction.editReply({ 
                embeds: [embed] 
            });

        } catch (error) {
            console.error("Error al consultar el servidor en BattleMetrics:", error.message);
            return await interaction.editReply("❌ No se pudo obtener el estado del servidor en este momento. Inténtalo más tarde.");
        }
    }
};