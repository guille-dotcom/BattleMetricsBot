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

            console.log(
                "BM no devolvió jugador:",
                playerId
            );

            return null;

        }



        // DEBUG TEMPORAL
        console.log(
            "RESPUESTA COMPLETA BM:"
        );

        console.log(
            JSON.stringify(
                response.data,
                null,
                4
            )
        );





        let servidor = null;



        let online = false;



        // Revisar included servers

        if(
            response.data.included &&
            Array.isArray(response.data.included)
        ){


            const serverData =
            response.data.included.find(

                item =>
                item.type === "server"

            );



            if(serverData){


                servidor =
                serverData.attributes.name;


                online = true;


            }


        }





        // Revisar otros campos posibles

        if(
            player.attributes.online === true
        ){

            online = true;

        }



        if(
            player.attributes.status === "online"
        ){

            online = true;

        }




        console.log(
            "SERVIDOR DETECTADO:",
            servidor
        );



        console.log(
            "ONLINE DETECTADO:",
            online
        );



        console.log(
            "ESTADO BM:",
            player.attributes.name,
            online ? "ONLINE" : "OFFLINE"
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