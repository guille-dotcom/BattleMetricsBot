require("dotenv").config();
const axios = require("axios");

// Función matemática avanzada para estimar la fecha de creación en perfiles privados
function calcularFechaPorSteamID(steamId64) {
    const BASE_STEAM_ID = 76561197960265728n; // SteamID64 base (12 sep 2003)
    try {
        const idBigInt = BigInt(steamId64);
        const accountId = Number(idBigInt - BASE_STEAM_ID);
        if (accountId <= 0) return "12 sep 2003";

        // Parámetros de ajuste temporal basados en la tasa de creación de cuentas de Steam
        const timestampInicioSteam = 1063324800; // 12 sep 2003 en timestamp Unix
        
        // Coeficiente dinámico ajustado para que la regresión lineal coincida con herramientas de SteamID
        let timestampEstimado;
        if (accountId > 600000000n) { // Cuentas más recientes (ej. 2019 en adelante)
            timestampEstimado = timestampInicioSteam + (accountId / 3.15);
        } else {
            timestampEstimado = timestampInicioSteam + (accountId / 3.42);
        }

        const fecha = new Date(timestampEstimado * 1000);
        if (isNaN(fecha.getTime())) return "No disponible";

        return fecha.toLocaleDateString("es-ES", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    } catch (e) {
        return "No disponible";
    }
}

async function getSteamProfile(steamId){
    try {
        // ----------------------------
        // 1. Perfil de Steam (Resumen y País)
        // ----------------------------
        const profileResponse = await axios.get(
            "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/",
            {
                params: {
                    key: process.env.STEAM_API_KEY,
                    steamids: steamId
                }
            }
        );

        const player = profileResponse.data.response.players[0];
        if(!player){
            return null;
        }

        // Obtener fecha de creación (Oficial o por cálculo matemático si es privado)
        let creationDateText = "No disponible";
        if (player.timecreated) {
            const fecha = new Date(player.timecreated * 1000);
            creationDateText = fecha.toLocaleDateString("es-ES", {
                day: "2-digit",
                month: "short",
                year: "numeric"
            });
        } else {
            // Aplicamos el cálculo matemático si el perfil es privado
            creationDateText = calcularFechaPorSteamID(steamId);
        }

        // ----------------------------
        // 2. Baneos de Steam (VAC / Game Bans)
        // ----------------------------
        let vacBanned = false;
        let gameBansCount = 0;
        try {
            const bansResponse = await axios.get(
                "https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/",
                {
                    params: {
                        key: process.env.STEAM_API_KEY,
                        steamids: steamId
                    }
                }
            );
            const banData = bansResponse.data.players[0];
            if (banData) {
                vacBanned = banData.VACBanned || false;
                gameBansCount = banData.NumberOfGameBans || 0;
            }
        } catch (e) {
            console.log("No se pudieron obtener los baneos:", e.message);
        }

        // ----------------------------
        // 3. Horas de Rust
        // ----------------------------
        let rustHours = null;
        try {
            const gamesResponse = await axios.get(
                "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/",
                {
                    params: {
                        key: process.env.STEAM_API_KEY,
                        steamid: steamId,
                        include_appinfo: true
                    }
                }
            );

            const games = gamesResponse.data.response.games || [];
            const rust = games.find(game => game.appid === 252490);

            if(rust){
                rustHours = (rust.playtime_forever / 60).toFixed(2);
            }
        } catch {
            rustHours = null;
        }

        return {
            name: player.personaname,
            avatar: player.avatarfull,
            profile: player.profileurl,
            loccountrycode: player.loccountrycode || null,
            vacBanned: vacBanned,
            gameBansCount: gameBansCount,
            rustHours,
            creationDate: creationDateText
        };

    } catch(error) {
        console.log("ERROR STEAM:", error.message);
        return null;
    }
}

module.exports = {
    getSteamProfile
};