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


console.log(
    "PLAYER RESPONSE OK"
);


const players =
    response.data.data;

        if(!players || players.length === 0){

            return null;

        }



        console.log(
            "JUGADOR ENCONTRADO:",
            players[0].attributes.name,
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


let sessionResponse = null;


try {

    sessionResponse = await axios.get(
        `https://api.battlemetrics.com/players/${playerId}/relationships/sessions`,
        {
            headers:{
                Authorization:`Bearer ${token}`
            }
        }
    );


    console.log(
    "SESION ACTIVA BM:",
    sessionResponse.data.data?.some(
        s => s.attributes.stop === null
    ) ? "ONLINE" : "OFFLINE"
);


} catch(error){

    console.log(
        "ERROR SESIONES BM:",
        error.response?.data || error.message
    );

}




if(!player){

    console.log(
        "NO EXISTE PLAYER:",
        playerId
    );

    return null;

}




 console.log(
    "PLAYER:",
    player.attributes.name
);




        let servidor = null;

        let online = false;

// ----------------------------
// Detectar online por sesiones BM
// ----------------------------

let sesiones =
    sessionResponse?.data?.data || [];


const sesionActiva =
    sesiones.find(
        s => s.attributes.stop === null
    );


if(sesionActiva){

    online = true;


    const serverId =
    sesionActiva.relationships?.server?.data?.id;


    if(serverId){

        try{

            const serverResponse = await axios.get(
                `https://api.battlemetrics.com/servers/${serverId}`,
                {
                    headers:{
                        Authorization:`Bearer ${token}`
                    }
                }
            );


            servidor =
            serverResponse.data.data.attributes.name;


        }catch(error){

            servidor =
            `Servidor ID ${serverId}`;

        }

    }

}



        // ----------------------------
        // Método 1:
        // relationships.server
        // ----------------------------

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





        // ----------------------------
        // Método 2:
        // attributes.online
        // ----------------------------

        if(
            player.attributes?.online === true
        ){

            online = true;

        }





        // ----------------------------
        // Método 3:
        // attributes.server
        // ----------------------------

        if(
            player.attributes?.server
        ){

            online = true;


            servidor =
            player.attributes.server.name ||
            player.attributes.server;

        }





        // ----------------------------
        // Método 4:
        // Buscar servidor en included
        // solo si parece online
        // ----------------------------

        if(
            online &&
            !servidor &&
            Array.isArray(response.data.included)
        ){


            const server =
            response.data.included.find(

                item =>
                item.type === "server"

            );



            if(server){

                servidor =
                server.attributes.name;

            }


        }






        console.log(
            "JUGADOR:",
            player.attributes.name
        );


        console.log(
            "ONLINE DETECTADO:",
            online
        );


        console.log(
            "SERVIDOR DETECTADO:",
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