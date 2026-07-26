const { SlashCommandBuilder } = require("discord.js");
const { getSteamProfile } = require("../services/steam.js"); 
const { searchBattleMetricsPlayer, getBattleMetricsPlayerStatus } = require("../services/battlemetrics.js"); 
const fs = require("fs");
const path = require("path");

module.exports = { 
    // Cambiamos a la estructura que lee tu bot para comandos "/"
    data: new SlashCommandBuilder()
        .setName("horas")
        .setDescription("Ejecuta el flujo estricto del diagrama para obtener las horas de BattleMetrics")
        .addStringOption(option => 
            option.setName("steamid")
                .setDescription("El SteamID del jugador (Ej: 76561198818187993)")
                .setRequired(true)
        ),
    async execute(interaction) { 
        // En comandos "/" se usa interaction.options en lugar de args
        const steamId = interaction.options.getString("steamid"); 

        // El bot primero le avisa a Discord que está procesando
        await interaction.deferReply();

        // LEER EL SERVIDOR CONFIGURADO POR TU COMANDO /CONFIGURAR-SERVIDOR
        let serverId = null;
        try {
            const configPath = path.join(__dirname, "../data/config.json");
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
                serverId = config.serverId; 
            }
        } catch (error) {
            console.log("Error leyendo data/config.json:", error.message);
        }

        if (!serverId) {
            serverId = "433255";
        }

        try { 
            // 1. Obtener Nombre Steam (Ej: GONE) usando tu servicio 
            const perfilSteam = await getSteamProfile(steamId); 
            if (!perfilSteam || !perfilSteam.name) {
                return await interaction.editReply("❌ ID no encontrado en Steam."); 
            }

            // 2. Buscar jugador online POR NOMBRE en el servidor configurado dinámicamente
            const jugadorBM = await searchBattleMetricsPlayer(perfilSteam.name, serverId); 
            if (!jugadorBM) {
                return await interaction.editReply(`❌ El jugador **${perfilSteam.name}** no está en el servidor.`); 
            }

            // 3. Obtener BM Player ID y consultar horas finales 
            const datosFinales = await getBattleMetricsPlayerStatus(jugadorBM.id); 
            if (!datosFinales) {
                return await interaction.editReply("❌ Error al obtener datos de BattleMetrics."); 
            }

            // Resultado final en Discord
            const respuesta = [ 
                `🔍 **Resultado para:** ${perfilSteam.name}`, 
                `🆔 **BattleMetrics ID:** \`${datosFinales.id}\``, 
                `⏱️ **Tiempo jugando esta sesión:** ${datosFinales.jugando}`, 
                `📊 **Horas Rust (Steam):** ${perfilSteam.rustHours ? `${perfilSteam.rustHours}h` : "Perfil Privado"}` 
            ].join("\n"); 

            return await interaction.editReply(respuesta); 

        } catch (error) { 
            console.error(error); 
            return await interaction.editReply("❌ Error al procesar el comando."); 
        } 
    } 
};
