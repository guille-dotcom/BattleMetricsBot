require("dotenv").config();

const axios = require("axios");


async function getSteamProfile(steamId){

    try{

        const response =
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
        response.data.response.players[0];


        if(!player){
            return null;
        }


        return {

            name:
            player.personaname,

            avatar:
            player.avatarfull,

            profile:
            player.profileurl

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