require("dotenv").config();
const axios = require("axios");

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

        // Obtener fecha de creación
        let creationDateText = "No disponible";
        if (player.timecreated) {
            const fecha = new Date(player.timecreated * 1000);
            creationDateText = fecha.toLocaleDateString("es-ES", {
                day: "2-digit",
                month: "short",
                year: "numeric"
            });
        } else {
            // Consultamos la API interna JSON de SteamID.io para perfiles privados
            try {
                const steamIdIoResponse = await axios.post(
                    "https://steamid.io/ajax/lookup",
                    new URLSearchParams({ input: steamId }),
                    {
                        headers: {
                            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                            "X-Requested-With": "XMLHttpRequest",
                            "User-Agent": "Mozilla/5.0"
                        }
                    }
                );

                if (steamIdIoResponse.data && steamIdIoResponse.data.success) {
                    const profileCreated = steamIdIoResponse.data.profile?.created;
                    if (profileCreated) {
                        // SteamID.io suele devolver un timestamp o un texto formateado según el endpoint
                        const fecha = typeof profileCreated === "number" 
                            ? new Date(profileCreated * 1000) 
                            : new Date(profileCreated);

                        if (!isNaN(fecha.getTime())) {
                            creationDateText = fecha.toLocaleDateString("es-ES", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric"
                            });
                        } else {
                            creationDateText = String(profileCreated).trim();
                        }
                    }
                }
                
                if (creationDateText === "No disponible") {
                    creationDateText = "No disponible (Privado)";
                }
            } catch (e) {
                console.log("No se pudo obtener la fecha desde la API de SteamID.io:", e.message);
                creationDateText = "No disponible (Privado)";
            }
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