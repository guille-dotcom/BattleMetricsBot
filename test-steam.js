require("dotenv").config();

const axios = require("axios");


async function test(){

    const steamId =
    "76561198027180359";


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


    console.log(
        response.data.response.players[0]
    );

}


test();