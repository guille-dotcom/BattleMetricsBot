const axios = require("axios");

const API_KEY = process.env.STEAM_API_KEY;

async function resolveSteam(url) {
    try {
        const profileMatch = url.match(/profiles\/(\d+)/);

        if (profileMatch) return profileMatch[1];

        const vanityMatch = url.match(/id\/([^/]+)/);

        if (vanityMatch) {
            const res = await axios.get(
                "https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/",
                {
                    params: {
                        key: API_KEY,
                        vanityurl: vanityMatch[1]
                    }
                }
            );

            if (res.data.response.success === 1)
                return res.data.response.steamid;
        }

        return null;

    } catch (err) {
        console.error(err.message);
        return null;
    }
}

async function getRustHours(steamId) {
    try {

        console.log("SteamID:", steamId);
        console.log("API KEY:", API_KEY);

        const res = await axios.get(
            "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/",
            {
                params: {
                    key: API_KEY,
                    steamid: steamId,
                    include_appinfo: true,
                    include_played_free_games: true
                }
            }
        );

        console.log(JSON.stringify(res.data, null, 2));

        const games = res.data.response.games || [];

        console.log("Juegos encontrados:", games.length);

        const rust = games.find(g => g.appid === 252490);

        console.log("Rust:", rust);

        if (!rust) return null;

        return {
            hours: Math.floor(rust.playtime_forever / 60)
        };

    } catch (err) {
        console.error(err.response?.data || err.message);
        return null;
    }
}

async function getSteamProfile(steamId) {

    const [playerRes, levelRes] = await Promise.all([

        axios.get(
            "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/",
            {
                params: {
                    key: API_KEY,
                    steamids: steamId
                }
            }
        ),

        axios.get(
            "https://api.steampowered.com/IPlayerService/GetSteamLevel/v1/",
            {
                params: {
                    key: API_KEY,
                    steamid: steamId
                }
            }
        )

    ]);

    const player = playerRes.data.response.players[0];

    if (!player) return null;

    let estado = "⚫ Desconectado";

    if (player.personastate === 1)
        estado = "🟢 En línea";

    if (player.gameextrainfo)
        estado = `🎮 Jugando a ${player.gameextrainfo}`;

    return {
        name: player.personaname,
        avatar: player.avatarfull,
        profile: player.profileurl,
        country: player.loccountrycode || "Desconocido",
        state: estado,
        level: levelRes.data.response.player_level
    };
}

module.exports = {
    resolveSteam,
    getRustHours,
    getSteamProfile
};