require("dotenv").config();

const axios = require("axios");

async function getSteamProfile(steamId){

    try{

        // ----------------------------
        // Perfil Steam
        // ----------------------------

        const profileResponse =
        await axios.get(
            "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/",
            {
                params:{
                    key: process.env.STEAM_API_KEY,
                    steamids: steamId
                }
            }
        );


        const player =
        profileResponse.data.response.players[0];


        if(!player){
            return null;
        }


        // ----------------------------
        // Horas de Rust
        // ----------------------------

        let rustHours = null;

        try{

            const gamesResponse =
            await axios.get(
                "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/",
                {
                    params:{
                        key: process.env.STEAM_API_KEY,
                        steamid: steamId,
                        include_appinfo: true
                    }
                }
            );


            const games =
            gamesResponse.data.response.games || [];


            const rust =
            games.find(
                game => game.appid === 252490
            );


            if(rust){

                rustHours =
                (
                    rust.playtime_forever / 60
                ).toFixed(2);

            }

        }catch{

            // Perfil privado
            rustHours = null;

        }


        return {

            name:
            player.personaname,

            avatar:
            player.avatarfull,

            profile:
            player.profileurl,

            rustHours

        };


    }catch(error){

        console.log(
            "ERROR STEAM:",
            error.message
        );

        return null;

    }

}


module.exports = {

    getSteamProfile

};