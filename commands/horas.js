const { SlashCommandBuilder, MessageFlags } = require("discord.js");
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
        const steamId = interaction.options.getString("steamid"); 
        await interaction.deferReply();

        // 1. LEER EL SERVIDOR CONFIGURADO EN config.json (battlemetricsServer)
        let serverId = "433255"; // Valor fallback
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
            // 2. Obtener Nombre Steam desde el servicio
            const perfilSteam = await getSteamProfile(steamId); 
            if (!perfilSteam || !perfilSteam.name) {
                return await interaction.editReply("❌ ID no encontrado en Steam."); 
            }

            // 3. Buscar jugador online POR NOMBRE directamente en el servidor configurado
            const jugadorBM = await searchBattleMetricsPlayer(perfilSteam.name, serverId); 
            if (!jugadorBM) {
                return await interaction.editReply(`❌ El jugador **${perfilSteam.name}** no está online en el servidor \`${serverId}\`.`); 
            }

            // 4. Obtener datos, tiempo de sesión y suma total usando el BM Player ID
            const datosFinales = await getBattleMetricsPlayerStatus(jugadorBM.id); 
            if (!datosFinales) {
                return await interaction.editReply("❌ Error al obtener datos detallados de BattleMetrics."); 
            }

            // 5. Responder en el canal
            const respuesta = [ 
                `🔍 **Resultado para:** ${perfilSteam.name}`, 
                `🖥️ **Servidor ID:** \`${serverId}\``,
                `🆔 **BattleMetrics ID:** \`${datosFinales.id}\``, 
                `⏱️ **Sesión actual:** ${datosFinales.jugando}`, 
                `📈 **Horas totales (BattleMetrics):** ${datosFinales.horasTotalesBM}h`,
                `📊 **Horas Rust (Steam):** ${perfilSteam.rustHours ? `${perfilSteam.rustHours}h` : "Perfil Privado"}` 
            ].join("\n"); 

            return await interaction.editReply(respuesta); 

        } catch (error) { 
            console.error("Error en comando /horas:", error); 
            
            // Responder manejando la posible expiración o estado de la interacción
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