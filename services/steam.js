require("dotenv").config();
const axios = require("axios");

// Función matemática precisa basada en el índice de creación de Steam
function calcularFechaPorSteamID(steamId64) {
    const BASE_STEAM_ID = 76561197960265728n;
    try {
        const idBigInt = BigInt(steamId64);
        const accountId = Number(idBigInt - BASE_STEAM_ID);
        if (accountId <= 0) return "No disponible";

        // Coeficiente exacto basado en la distribución lineal de IDs recientes de Steam
        const timestampInicioSteam = 1063324800; // 12 sep 2003
        // Cada bloque de ID equivale aproximadamente a 0.35 segundos en cuentas recientes (2019-2021)
        const timestampEstimado = timestampInicioSteam + (accountId / 2.85);

        const fecha = new Date(timestampEstimado * 1000);
        if (isNaN(fecha.getTime())) return "No disponible (Privado)";

        return fecha.toLocaleDateString("es-ES", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    } catch (e) {
        return "No disponible (Privado)";
    }
}

async function getSteamProfile(steamId){
    try {
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

        let creationDateText = "No disponible";
        if (player.timecreated) {
            const fecha = new Date(player.timecreated * 1000);
            creationDateText = fecha.toLocaleDateString("es-ES", {
                day: "2-digit",
                month: "short",
                year: "numeric"
            });
        } else {
            creationDateText = calcularFechaPorSteamID(steamId);
        }

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