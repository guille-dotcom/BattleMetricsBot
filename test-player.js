require("dotenv").config();

const { searchPlayer } = require("./services/battlemetrics");

(async () => {

    const players = await searchPlayer(
        34885585,
        "clo"
    );

    console.log(JSON.stringify(players, null, 2));

})();