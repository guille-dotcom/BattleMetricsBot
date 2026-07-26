const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { getSteamProfile } = require("../services/steam.js"); 
const { searchBattleMetricsPlayer, getBattleMetricsPlayerStatus } = require("../services/battlemetrics.js"); 
const fs = require("fs");
const path = require("path");

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

        // 1. LEER EL SERVIDOR CONFIGURADO EN config.json
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
            // 2. Obtener Perfil, Avatar y Horas de Steam
            const perfilSteam = await getSteamProfile(steamId); 
            if (!perfilSteam || !perfilSteam.name) {
                return await interaction.editReply("❌ ID no encontrado en Steam."); 
            }

            const horasSteamNum = parseFloat(perfilSteam.rustHours) || 0;
            const horasSteamTexto = perfilSteam.rustHours ? `${perfilSteam.rustHours}h` : "Perfil Privado";

            // 3. Buscar jugador online en el servidor configurado
            const jugadorBM = await searchBattleMetricsPlayer(perfilSteam.name, serverId); 

            // Si NO ESTÁ ONLINE en el servidor:
            if (!jugadorBM) {
                const embedOffline = new EmbedBuilder()
                    .setTitle(`🔍 Resultado para: ${perfilSteam.name}`)
                    .setColor("#FF0000") // Rojo indicando offline
                    .setDescription(`⚠️ El jugador **no está online** actualmente en el servidor ||\`${serverId}\`||.`)
                    .addFields(
                        { name: "🆔 Steam ID", value: `\`${steamId}\``, inline: true },
                        { name: "📊 Horas Rust (Steam)", value: horasSteamTexto, inline: true },
                        { name: "🖥️ Estado", value: "🔴 Desconectado", inline: true }
                    )
                    .setTimestamp();

                // Añadir foto de perfil si está disponible
                if (perfilSteam.avatar || perfilSteam.avatarfull) {
                    embedOffline.setThumbnail(perfilSteam.avatarfull || perfilSteam.avatar);
                }

                return await interaction.editReply({ embeds: [embedOffline] });
            }

            // 4. Si SÍ ESTÁ ONLINE: Obtener datos de BattleMetrics
            const datosFinales = await getBattleMetricsPlayerStatus(jugadorBM.id); 
            if (!datosFinales) {
                return await interaction.editReply("❌ Error al obtener datos detallados de BattleMetrics."); 
            }

            // 5. Calcular diferencia de horas
            const horasBMNum = parseFloat(datosFinales.horasTotalesBM) || 0;
            let diferenciaTexto = "N/A (Perfil Privado)";

            if (perfilSteam.rustHours) {
                const diff = Math.abs(horasSteamNum - horasBMNum);
                diferenciaTexto = `${diff.toFixed(0)}h`;
            }

            // 6. Responder en formato Embed cuando está online
            const embedOnline = new EmbedBuilder()
                .setTitle(`🔍 Resultado para: ${perfilSteam.name}`)
                .setColor("#57F287") // Verde indicando online
                .addFields(
                    { name: "🖥️ Servidor ID", value: `||\`${serverId}\`||`, inline: true },
                    { name: "🆔 BattleMetrics ID", value: `[${datosFinales.id}](https://www.battlemetrics.com/players/${datosFinales.id})`, inline: true },
                    { name: "🆔 Steam ID", value: `\`${steamId}\``, inline: true },
                    { name: "⏱️ Sesión actual", value: `${datosFinales.jugando}`, inline: true },
                    { name: "📈 Horas totales (BM)", value: `${datosFinales.horasTotalesBM}h`, inline: true },
                    { name: "📊 Horas Rust (Steam)", value: horasSteamTexto, inline: true },
                    { name: "⚖️ Diferencia de horas", value: diferenciaTexto, inline: true }
                )
                .setTimestamp();

            // Añadir foto de perfil de Steam
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