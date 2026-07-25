require("dotenv").config();

const axios = require("axios");



// ----------------------------
// Buscar jugador BattleMetrics
// ----------------------------
async function searchBattleMetricsPlayer(playerName, serverId){

    try{

        const token =
        process.env.BATTLEMETRICS_TOKEN;


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



        if(players.length === 0){

            return null;

        }



        return players[0];



    }catch(error){

        console.log(
            "ERROR BUSCANDO BM:",
            error.response?.data || error.message
        );


        return null;

    }

}





// ----------------------------
// Obtener estado jugador
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

            return null;

        }



        let servidor = null;

        let online = false;



        /*
        BattleMetrics guarda el servidor actual
        en relationships.server
        */


        const serverRelation =
        player.relationships?.server?.data;



        if(serverRelation){


            online = true;



            const serverData =
            response.data.included?.find(

                item =>

                item.type === "server" &&

                item.id === serverRelation.id

            );



            if(serverData){

                servidor =
                serverData.attributes.name;

            }


        }




        console.log(
            "JUGADOR:",
            player.attributes.name
        );


        console.log(
            "ONLINE:",
            online
        );


        console.log(
            "SERVIDOR ACTUAL:",
            servidor
        );




        return {


            id:
            player.id,


            name:
            player.attributes.name,


            online,


            server:
            servidor



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