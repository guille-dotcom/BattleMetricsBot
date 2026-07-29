const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { getSteamProfile } = require("../services/steam.js"); 
const { searchBattleMetricsPlayer, getBattleMetricsPlayerStatus } = require("../services/battlemetrics.js"); 
const fs = require("fs");
const path = require("path");

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
        .setName("horas")
        .setDescription("Obtiene las horas de BattleMetrics buscando al usuario de Steam en el servidor")
        .addStringOption(option => 
            option.setName("steamid")
                .setDescription("El SteamID del jugador (Ej: 76561198818187993)")
                .setRequired(true)
        ),
 
    async execute(interaction) { 
        const steamId = interaction.options.getString("steamid").trim(); 
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
            console.log("Error leyendo data/config.json:", error.message);
        }

        try { 
            const perfilSteam = await getSteamProfile(steamId); 
            if (!perfilSteam || !perfilSteam.name) {
                return await interaction.editReply("❌ ID no encontrado en Steam."); 
            }

            const horasSteamNum = parseFloat(perfilSteam.rustHours) || 0;
            const horasSteamTexto = horasSteamNum > 0 ? `${horasSteamNum}h` : "🔒 Privado";

            const paisTexto = perfilSteam.loccountrycode ? `:flag_${perfilSteam.loccountrycode.toLowerCase()}: (${perfilSteam.loccountrycode})` : "Desconocido";
            
            let vacTexto = "✅ Sin Baneos";
            if (perfilSteam.vacBanned && perfilSteam.gameBansCount > 0) {
                vacTexto = "⚠️ VAC & Game";
            } else if (perfilSteam.vacBanned) {
                vacTexto = "⚠️ Baneo VAC";
            } else if (perfilSteam.gameBansCount > 0) {
                vacTexto = `⚠️ ${perfilSteam.gameBansCount} Game Ban`;
            }

            const jugadorBM = await searchBattleMetricsPlayer(perfilSteam.name, serverId); 

            if (!jugadorBM) {
                const embedOffline = new EmbedBuilder()
                    .setTitle(`🔍 Resultado para: ${perfilSteam.name}`)
                    .setColor("#FF0000")
                    .setDescription(`⚠️ El jugador **no está online** actualmente en el servidor.`)
                    .addFields(
                        { name: "🆔 Steam ID", value: `||[${steamId}](https://steamcommunity.com/profiles/${steamId})||`, inline: true },
                        { name: "📊 Horas Steam", value: horasSteamTexto, inline: true },
                        { name: "🖥️ Estado", value: "🔴 Desconectado", inline: true },
                        { name: "🌍 País", value: paisTexto, inline: true },
                        { name: "🛡️ Baneos", value: vacTexto, inline: true },
                        { name: "\u200b", value: "\u200b", inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: "RustLogix" });

                if (perfilSteam.avatar || perfilSteam.avatarfull) {
                    embedOffline.setThumbnail(perfilSteam.avatarfull || perfilSteam.avatar);
                }

                return await interaction.editReply({ embeds: [embedOffline] });
            }

            const datosFinales = await getBattleMetricsPlayerStatus(jugadorBM.id); 
            if (!datosFinales) {
                return await interaction.editReply("❌ Error al obtener datos detallados de BattleMetrics."); 
            }

            const horasBMNum = parseFloat(datosFinales.horasTotalesBM) || 0;
            let diferenciaTexto = "N/A";

            if (horasSteamNum > 0) {
                const diff = Math.abs(horasSteamNum - horasBMNum);
                diferenciaTexto = `${diff.toFixed(0)}h`;
            }

            const historialTexto = datosFinales.historialNombres && datosFinales.historialNombres.length > 0 
                ? datosFinales.historialNombres.slice(0, 3).join(", ") 
                : "No disponible";

            const ultimoWipe = datosFinales.ultimoWipe || "Desconocido";
            const horasDesdeWipeDecimal = datosFinales.horasDesdeWipe || "0.00";
            
            // Aplicamos la conversión a formato "Xh Ym"
            const horasDesdeWipeFormateadas = formatHoursToHoursMinutes(horasDesdeWipeDecimal);

            // Diseño optimizado y simétrico en 3 columnas
            const embedOnline = new EmbedBuilder()
                .setTitle(`🔍 Resultado para: ${perfilSteam.name}`)
                .setColor("#57F287")
                .addFields(
                    { name: "🎮 Servidor", value: `||${datosFinales.server || "Desconocido"}||`, inline: false },
                    { name: "🆔 BattleMetrics", value: `||[${datosFinales.id}](https://www.battlemetrics.com/players/${datosFinales.id})||`, inline: true },
                    { name: "🆔 Steam ID", value: `||[${steamId}](https://steamcommunity.com/profiles/${steamId})||`, inline: true },
                    { name: "⏱️ Sesión Actual", value: `${datosFinales.jugando}`, inline: true },
                    { name: "🛠️ Último Wipe", value: `\`${ultimoWipe}\``, inline: true },
                    { name: "⏱️ Desde el Wipe", value: `\`${horasDesdeWipeFormateadas}\``, inline: true },
                    { name: "🌍 País", value: paisTexto, inline: true },
                    { name: "📈 Horas (BM)", value: `${datosFinales.horasTotalesBM}h`, inline: true },
                    { name: "📊 Horas (Steam)", value: horasSteamTexto, inline: true },
                    { name: "⚖️ Diferencia", value: diferenciaTexto, inline: true },
                    { name: "🛡️ Estado Baneos", value: vacTexto, inline: true },
                    { name: "\u200b", value: "\u200b", inline: true },
                    { name: "\u200b", value: "\u200b", inline: true },
                    { name: "📝 Historial de Nombres", value: historialTexto, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: "RustLogix" });

            if (perfilSteam.avatar || perfilSteam.avatarfull) {
                embedOnline.setThumbnail(perfilSteam.avatarfull || perfilSteam.avatar);
            }

            return await interaction.editReply({ embeds: [embedOnline] }); 

        } catch (error) { 
            console.error("Error en comando /horas:", error); 
            
            if (interaction.deferred || interaction.replied) {
                return await interaction.editReply("❌ Error interno al procesar el comando.");
            } else {
                return await interaction.reply({
                    content: "❌ Error interno al procesar el comando.",
                    flags: MessageFlags.Ephemeral
                });
            }
        } 
    } 
};