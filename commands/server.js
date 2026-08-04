const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const ServerConfig = require("../models/ServerConfig");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("server")
        .setDescription("Muestra el estado actual, jugadores en línea y detalles del servidor de Rust"),

    async execute(interaction) {
        await interaction.deferReply();

        let serverId = "433255"; // Valor por defecto si no hay ninguno configurado
        
        try {
            // Buscamos la configuración de este servidor en MongoDB
            const dbConfig = await ServerConfig.findOne({ guildId: interaction.guild.id });
            if (dbConfig && dbConfig.battleMetricsServerId) {
                serverId = dbConfig.battleMetricsServerId;
            }
        } catch (error) {
            console.log("Console log - Error consultando MongoDB para el comando server:", error.message);
        }

        try {
            const response = await axios.get(`https://api.battlemetrics.com/servers/${serverId}`, {
                headers: {
                    "Authorization": `Bearer ${process.env.BATTLEMETRICS_TOKEN}`,
                    "User-Agent": "RustLogix-DiscordBot"
                },
                timeout: 10000 // Timeout de seguridad de 10 segundos para evitar bloqueos
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
            
            let rawMap = details.map;
            let mapName = "Ver Mapa en BattleMetrics";
            if (rawMap && typeof rawMap === "string" && !rawMap.includes("discord") && !rawMap.includes("http") && rawMap.length < 30) {
                mapName = rawMap;
            }

            const bmServerUrl = `https://www.battlemetrics.com/servers/rust/${serverId}`;
            const connectText = `client.connect ${address}:${port}`;

            let wipeTime = "No disponible";
            let fechaWipeFinal = null;

            // 1. Buscar en el array de wipes de la API
            if (Array.isArray(details.rust_wipes) && details.rust_wipes.length > 0) {
                fechaWipeFinal = new Date(details.rust_wipes[details.rust_wipes.length - 1]);
            }

            // 2. Buscar en propiedades alternativas de la API de Rust
            if (!fechaWipeFinal || isNaN(fechaWipeFinal.getTime()) || fechaWipeFinal.getFullYear() < 2024) {
                const rawWipe = details.rust_last_wipe_ent || details.rust_last_wipe;
                if (rawWipe) {
                    if (typeof rawWipe === "string") {
                        fechaWipeFinal = new Date(rawWipe);
                    } else if (typeof rawWipe === "number") {
                        fechaWipeFinal = new Date(rawWipe < 10000000000 ? rawWipe * 1000 : rawWipe);
                    }
                }
            }

            // 3. Si la API da una fecha válida, la formateamos
            if (fechaWipeFinal && !isNaN(fechaWipeFinal.getTime()) && fechaWipeFinal.getFullYear() >= 2024) {
                wipeTime = fechaWipeFinal.toLocaleDateString("es-ES", {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } else {
                wipeTime = "Consultar en Web";
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
            if (interaction.deferred || interaction.replied) {
                return await interaction.editReply("❌ No se pudo obtener el estado del servidor en este momento. Inténtalo más tarde.");
            }
        }
    }
};