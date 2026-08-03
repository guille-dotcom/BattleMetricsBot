require("dotenv").config();
const axios = require("axios");

// Función para calcular la fecha mediante el SteamID64 si el perfil es privado
function calcularFechaPorSteamID(steamId64) {
    const BASE_STEAM_ID = 76561197960265728n;
    try {
        const idBigInt = BigInt(steamId64);
        const accountId = Number(idBigInt - BASE_STEAM_ID);
        if (accountId <= 0) return "Desconocido";

        // Coeficiente histórico de creación de cuentas de Steam (desde Septiembre de 2003)
        const timestampEstimado = 1063324800 + (accountId / 73.5);
        const fecha = new Date(timestampEstimado * 1000);

        return fecha.toLocaleDateString("es-ES", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    } catch (e) {
        return "Desconocido";
    }
}

async function getSteamProfile(steamId){
    try {
        // ----------------------------
        // 1. Perfil de Steam (Resumen, País y Fecha de Creación)
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

        // Procesar la fecha de creación: Si la API la da (público) se usa, si no, se calcula por SteamID64
        let creationDateText = "Desconocido";
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
            // Perfil privado o juegos ocultos
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
            creationDate: creationDateText // <--- Fecha obtenida de API o calculada por SteamID
        };

    } catch(error) {
        console.log("ERROR STEAM:", error.message);
        return null;
    }
}

module.exports = {
    getSteamProfile
};