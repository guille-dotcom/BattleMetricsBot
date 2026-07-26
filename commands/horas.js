const { getSteamProfile } = require("../services/steam.js");
const { searchBattleMetricsPlayer, getBattleMetricsPlayerStatus } = require("../services/battlemetrics.js");

module.exports = {
    name: "horas",
    description: "Ejecuta el flujo estricto del diagrama para obtener las horas de BattleMetrics",
    async execute(message, args) {
        const steamId = args[0]; // Recibe SteamID (Ej: 76561198818187993)
        if (!steamId) return message.reply("❌ Pon un SteamID.");

        const msgProgreso = await message.reply("⏳ Procesando flujo...");

        try {
            // 1. Obtener Nombre Steam (Ej: GONE) usando tu servicio
            const perfilSteam = await getSteamProfile(steamId);
            if (!perfilSteam) return msgProgreso.edit("❌ ID no encontrado en Steam.");

            // 2. Buscar jugador online por nombre en el servidor 433255
            const serverId = "433255";
            const jugadorBM = await searchBattleMetricsPlayer(perfilSteam.name, serverId);
            if (!jugadorBM) return msgProgreso.edit(`❌ El jugador **${perfilSteam.name}** no está en el servidor.`);

            // 3. Obtener BM Player ID y consultar horas finales
            const datosFinales = await getBattleMetricsPlayerStatus(jugadorBM.id);
            if (!datosFinales) return msgProgreso.edit("❌ Error al obtener datos de BattleMetrics.");

            // Resultado final en Discord
            const respuesta = [
                `🔍 **Resultado para:** ${perfilSteam.name}`,
                `🆔 **BattleMetrics ID:** \`${datosFinales.id}\``,
                `⏱️ **Tiempo jugando esta sesión:** ${datosFinales.jugando}`,
                `📊 **Horas Rust (Steam):** ${perfilSteam.rustHours ? `${perfilSteam.rustHours}h` : "Perfil Privado"}`
            ].join("\n");

            return msgProgreso.edit(respuesta);

        } catch (error) {
            console.error(error);
            return msgProgreso.edit("❌ Error al procesar el comando.");
        }
    }
};
