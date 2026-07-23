const axios = require("axios");

(async () => {

    const playerId = "1153330200"; // tu BattleMetrics ID

    const res = await axios.get(
        `https://api.battlemetrics.com/players/${playerId}?include=server,identifier`
    );

    console.log(JSON.stringify(res.data, null, 2));

})();