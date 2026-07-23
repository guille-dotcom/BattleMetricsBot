require("dotenv").config();

const {
    searchBattleMetricsPlayer
} = require("./services/battlemetricsSearch");


async function test(){


    const nombre =
    "Platanit0";


    const servidor =
    "1451019";


    const data =
    await searchBattleMetricsPlayer(
        nombre,
        servidor
    );


    console.log(
        "RESULTADO FINAL:"
    );

    console.log(data);


}


test();