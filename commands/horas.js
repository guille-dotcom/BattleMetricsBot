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

        try { 
            const steamId = interaction.options.getString("steamid").trim(); 
            let serverId = "433255"; 
            
            try {
                const dbConfig = await ServerConfig.findOne({ guildId: interaction.guild.id });
                if (dbConfig && dbConfig.battleMetricsServerId) {
                    serverId = dbConfig.battleMetricsServerId;
                }
            } catch (error) {
                console.log("Error consultando MongoDB para la configuración del servidor:", error.message);
            }

            const perfilSteam = await getSteamProfile(steamId); 
            if (!perfilSteam || !perfilSteam.name) {
                return await interaction.editReply("❌ ID no encontrado en Steam."); 
            }

            const horasSteamNum = parseFloat(perfilSteam.rustHours) || 0;
            const horasSteamTexto = horasSteamNum > 0 ? `\`${horasSteamNum}h\`` : "`🔒 Privado`";

            const paisTexto = perfilSteam.loccountrycode ? `:flag_${perfilSteam.loccountrycode.toLowerCase()}: (${perfilSteam.loccountrycode})` : "Desconocido";
            
            // --- CÁLCULO DE DÍAS DE CREACIÓN DE CUENTA ---
            let creacionSteamTexto = "No disponible";
            if (perfilSteam.creationDate) {
                const fechaCreacion = new Date(perfilSteam.creationDate);
                if (!isNaN(fechaCreacion.getTime())) {
                    const ahora = new Date();
                    const diferenciaTiempo = ahora - fechaCreacion;
                    const diasTotales = Math.floor(diferenciaTiempo / (1000 * 60 * 60 * 24));
                    const anos = Math.floor(diasTotales / 365);
                    const diasRestantes = diasTotales % 365;

                    if (anos > 0) {
                        creacionSteamTexto = `${diasTotales} días (${anos} años y ${diasRestantes}d)`;
                    } else {
                        creacionSteamTexto = `${diasTotales} días`;
                    }
                } else {
                    creacionSteamTexto = perfilSteam.creationDate;
                }
            }
            // ---------------------------------------------
            
            let vacTexto = "✅ Sin Baneos";
            if (perfilSteam.vacBanned && perfilSteam.gameBansCount > 0) {
                vacTexto = "⚠️ VAC & Game";
            } else if (perfilSteam.vacBanned) {
                vacTexto = "⚠️ Baneo VAC";
            } else if (perfilSteam.gameBansCount > 0) {
                vacTexto = `${perfilSteam.gameBansCount} Game Ban`;
            }

            const jugadorBM = await searchBattleMetricsPlayer(perfilSteam.name, serverId); 

            if (!jugadorBM) {
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

            const datosFinales = await getBattleMetricsPlayerStatus(jugadorBM.id); 
            if (!datosFinales) {
                return await interaction.editReply("❌ Error al obtener datos detallados de BattleMetrics."); 
            }

            const horasBMNum = parseFloat(datosFinales.horasTotalesBM) || 0;
            let diferenciaTexto = "N/A";

            if (horasSteamNum > 0) {
                const diff = Math.abs(horasSteamNum - horasBMNum);
                diferenciaTexto = `\`${diff.toFixed(0)}h\``;
            } else {
                diferenciaTexto = "`N/A`";
            }

            const historialTexto = datosFinales.historialNombres && datosFinales.historialNombres.length > 0 
                ? datosFinales.historialNombres.slice(0, 3).join(", ") 
                : "No disponible";

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
            console.error("Error en comando /horas:", error); 
            
            if (interaction.deferred || interaction.replied) {
                return await interaction.editReply({ content: "❌ Error interno al procesar el comando." });
            } else {
                return await interaction.reply({ content: "❌ Error interno al procesar el comando.", ephemeral: true });
            }
        } 
    } 
};