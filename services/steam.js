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
            // Si el perfil es privado, consultamos directamente SteamID.io
            try {
                const steamIdIoResponse = await axios.get(`https://steamid.io/lookup/${steamId}`, {
                    headers: { "User-Agent": "Mozilla/5.0" }
                });
                
                const match = steamIdIoResponse.data.match(/profile created<\/dt><dd[^>]*>([^<]+)<\/dd>/i);
                if (match && match[1]) {
                    creationDateText = match[1].trim();
                } else {
                    creationDateText = "No disponible (Privado)";
                }
            } catch (e) {
                console.log("No se pudo obtener la fecha desde SteamID.io:", e.message);
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