const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getSteamProfile } = require("../services/steam.js"); 
const { searchBattleMetricsPlayer, getBattleMetricsPlayerStatus } = require("../services/battlemetrics.js"); 
const ServerConfig = require("../models/ServerConfig");

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
        await interaction.deferReply();
        console.log("➡️ Comando /horas iniciado...");

        try { 
            const steamId = interaction.options.getString("steamid").trim(); 
            let serverId = "433255"; 
            
            try {
                const dbConfig = await ServerConfig.findOne({ guildId: interaction.guild.id });
                if (dbConfig && dbConfig.battleMetricsServerId) {
                    serverId = dbConfig.battleMetricsServerId;
                }
            } catch (error) {
                console.log("⚠️ Error consultando MongoDB:", error.message);
            }

            console.log("🔍 Consultando perfil de Steam para ID:", steamId);
            const perfilSteam = await getSteamProfile(steamId); 
            if (!perfilSteam || !perfilSteam.name) {
                console.log("❌ Perfil de Steam no encontrado o inválido.");
                return await interaction.editReply("❌ ID no encontrado en Steam."); 
            }
            console.log("✅ Perfil de Steam obtenido:", perfilSteam.name);

            const horasSteamNum = parseFloat(perfilSteam.rustHours) || 0;
            const horasSteamTexto = horasSteamNum > 0 ? `\`${horasSteamNum}h\`` : "`🔒 Privado`";
            const paisTexto = perfilSteam.loccountrycode ? `:flag_${perfilSteam.loccountrycode.toLowerCase()}: (${perfilSteam.loccountrycode})` : "Desconocido";
            const creacionSteamTexto = perfilSteam.creationDate || "No disponible";
            
            let vacTexto = "✅ Sin Baneos";
            if (perfilSteam.vacBanned && perfilSteam.gameBansCount > 0) {
                vacTexto = "⚠️ VAC & Game";
            } else if (perfilSteam.vacBanned) {
                vacTexto = "⚠️ Baneo VAC";
            } else if (perfilSteam.gameBansCount > 0) {
                vacTexto = `${perfilSteam.gameBansCount} Game Ban`;
            }

            console.log("🔍 Buscando jugador en BattleMetrics...");
            const jugadorBM = await searchBattleMetricsPlayer(perfilSteam.name, serverId); 

            if (!jugadorBM) {
                console.log("⚠️ Jugador no encontrado online en BattleMetrics, enviando embed offline...");
                const embedOffline = new EmbedBuilder()
                    .setTitle(`🔍 Resultado para: ${perfilSteam.name}`)
                    .setColor("#FF0000")
                    .setDescription(`⚠️ El jugador **no está online** actualmente en el servidor.`)
                    .addFields(
                        { name: "🆔 Steam ID", value: `[${steamId}](https://steamcommunity.com/profiles/${steamId})`, inline: true },
                        { name: "📊 Horas Steam", value: horasSteamTexto, inline: true },
                        { name: "🖥️ Estado", value: "`🔴 Desconectado`", inline: true },
                        { name: "🌍 País", value: paisTexto, inline: true },
                        { name: "🛡️ Baneos", value: `\`${vacTexto}\``, inline: true },
                        { name: "📅 Antigüedad", value: `\`${creacionSteamTexto}\``, inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: "RustLogix" });

                if (perfilSteam.avatar || perfilSteam.avatarfull) {
                    embedOffline.setThumbnail(perfilSteam.avatarfull || perfilSteam.avatar);
                }

                return await interaction.editReply({ embeds: [embedOffline] });
            }

            console.log("🔍 Obteniendo estado detallado de BattleMetrics para ID:", jugadorBM.id);
            const datosFinales = await getBattleMetricsPlayerStatus(jugadorBM.id); 
            if (!datosFinales) {
                console.log("❌ Error al obtener datos detallados de BM.");
                return await interaction.editReply("❌ Error al obtener datos detallados de BattleMetrics."); 
            }

            console.log("✅ Todo OK, enviando respuesta final...");
            // ... (el resto de tu código del embed online)

            const horasBMNum = parseFloat(datosFinales.horasTotalesBM) || 0;
            let diferenciaTexto = horasSteamNum > 0 ? `\`${Math.abs(horasSteamNum - horasBMNum).toFixed(0)}h\`` : "`N/A`";
            const historialTexto = datosFinales.historialNombres && datosFinales.historialNombres.length > 0 ? datosFinales.historialNombres.slice(0, 3).join(", ") : "No disponible";

            const embedOnline = new EmbedBuilder()
                .setTitle(`🔍 Resultado para: ${perfilSteam.name}`)
                .setColor("#57F287")
                .addFields(
                    { name: "🎮 Servidor", value: datosFinales.server || "Desconocido", inline: false },
                    { name: "🆔 BattleMetrics", value: `[${datosFinales.id}](https://www.battlemetrics.com/players/${datosFinales.id})`, inline: true },
                    { name: "🆔 Steam ID", value: `[${steamId}](https://steamcommunity.com/profiles/${steamId})`, inline: true },
                    { name: "⏱️ Sesión Actual", value: `\`${datosFinales.jugando}\``, inline: true },
                    { name: "🌍 País", value: paisTexto, inline: true },
                    { name: "📈 Horas (BM)", value: `\`${datosFinales.horasTotalesBM}h\``, inline: true },
                    { name: "📊 Horas (Steam)", value: horasSteamTexto, inline: true },
                    { name: "⚖️ Diferencia", value: diferenciaTexto, inline: true },
                    { name: "🛡️ Estado Baneos", value: `\`${vacTexto}\``, inline: true },
                    { name: "📅 Antigüedad", value: `\`${creacionSteamTexto}\``, inline: true },
                    { name: "📝 Historial de Nombres", value: historialTexto, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: "RustLogix" });

            if (perfilSteam.avatar || perfilSteam.avatarfull) {
                embedOnline.setThumbnail(perfilSteam.avatarfull || perfilSteam.avatar);
            }

            return await interaction.editReply({ embeds: [embedOnline] }); 

        } catch (error) { 
            console.error("❌ Error crítico atrapado en comando /horas:", error); 
            return await interaction.editReply({ content: "❌ Error interno al procesar el comando." }).catch(() => {});
        } 
    } 
};