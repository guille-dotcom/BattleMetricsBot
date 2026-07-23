require("dotenv").config();

const axios = require("axios");


async function searchBattleMetricsPlayer(playerName, serverId){

    try{

        const token =
        process.env.BATTLEMETRICS_TOKEN;


        console.log(
            "BUSCANDO EN BM:",
            playerName,
            "SERVIDOR:",
            serverId
        );


        const response =
        await axios.get(

            "https://api.battlemetrics.com/players",

            {

                headers:{
                    Authorization:
                    `Bearer ${token}`
                },


                params:{

                    "filter[search]": playerName,

                    "filter[servers]": serverId,

                    include:"server"

                }

            }

        );



        const players =
        response.data.data;



        console.log(
            "RESULTADOS:",
            players.length
        );



        if(players.length === 0){

            return null;

        }



        console.log(
            "ENCONTRADO:",
            players[0].attributes.name,
            "ID:",
            players[0].id
        );


        return players[0];



    }catch(error){


        console.log(
            "ERROR BM:",
            error.response?.data || error.message
        );


        return null;

    }

}



module.exports = {
    searchBattleMetricsPlayer
};