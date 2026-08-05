require("dotenv").config();
const axios = require("axios");

async function getSteamProfile(steamId){
    try {
        // 1. Perfil de Steam (Resumen y País)
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

        // Obtener la fecha de creación en formato de marca de tiempo numérica (timestamp en segundos)
        let timeCreatedSeconds = player.timecreated || null;

        if (!timeCreatedSeconds) {
            try {
                const steamDbRes = await axios.get(`https://steamdb.info/api/calculator/?player=${steamId}`, {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                    },
                    timeout: 5000
                });
                
                if (steamDbRes.data && steamDbRes.data.success && steamDbRes.data.data) {
                    const profileData = steamDbRes.data.data;
                    if (profileData.timecreated) {
                        timeCreatedSeconds = profileData.timecreated;
                    }
                }
            } catch (err) {
                console.log("No se pudo obtener la fecha desde SteamDB:", err.message);
            }
        }

        // Calcular los días y años de antigüedad
        let creationDateText = "No disponible";
        if (timeCreatedSeconds) {
            const fechaCreacion = new Date(timeCreatedSeconds * 1000);
            const ahora = new Date();
            const diferenciaTiempo = ahora - fechaCreacion;
            const diasTotales = Math.floor(diferenciaTiempo / (1000 * 60 * 60 * 24));
            const anos = Math.floor(diasTotales / 365);
            const diasRestantes = diasTotales % 365;

            if (anos > 0) {
                creationDateText = `${diasTotales} días (${anos} años y ${diasRestantes}d)`;
            } else {
                creationDateText = `${diasTotales} días`;
            }
        }

        // 2. Baneos de Steam (VAC / Game Bans)
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

        // 3. Horas de Rust
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