require("dotenv").config();

const axios = require("axios");


// ----------------------------
// Buscar jugador BattleMetrics
// ----------------------------
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





// ----------------------------
// Obtener estado del jugador
// ----------------------------
async function getBattleMetricsPlayerStatus(playerId){

    try{


        const token =
        process.env.BATTLEMETRICS_TOKEN;



        const response =
        await axios.get(

            `https://api.battlemetrics.com/players/${playerId}`,

            {

                headers:{
                    Authorization:
                    `Bearer ${token}`
                },


                params:{
                    include:"server"
                }

            }

        );



        const player =
        response.data.data;



        if(!player){

            console.log(
                "BM no devolvió jugador:",
                playerId
            );

            return null;

        }



        const attributes =
        player.attributes;



        // BattleMetrics real online status
        const online =
        attributes.online === true;



        let server = null;



        // Solo buscamos servidor si realmente está online
        if(
            online &&
            response.data.included
        ){

            const serverData =
            response.data.included.find(
                item =>
                item.type === "server"
            );


            if(serverData){

                server =
                serverData.attributes.name;

            }

        }



        console.log(
            "ESTADO BM:",
            attributes.name,
            online ? "ONLINE" : "OFFLINE"
        );



        return {

            id:
            player.id,


            name:
            attributes.name,


            online,


            server

        };



    }catch(error){


        console.log(
            "ERROR STATUS BM:",
            error.response?.data || error.message
        );


        return null;

    }

}





module.exports = {

    searchBattleMetricsPlayer,

    getBattleMetricsPlayerStatus

};