const fetch = require("node-fetch");

async function getBattleMetricsHours(playerId, cookies){

    const url =
    `https://www.battlemetrics.com/_api/players/${playerId}`;

    const response = await fetch(url,{
        headers:{
            "accept":"application/json",
            "accept-version":"^0.1.0",
            "cookie":cookies,
            "user-agent":
            "Mozilla/5.0"
        }
    });


    if(!response.ok){

        throw new Error(
            "BattleMetrics respondió "+response.status
        );

    }


    const json = await response.json();


    console.log(
        "RESPUESTA BM:",
        json
    );


    return json;

}


module.exports={
    getBattleMetricsHours
};