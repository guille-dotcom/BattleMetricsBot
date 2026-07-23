const axios = require("axios");

(async () => {
    try {
        const { data } = await axios.get(
            "https://www.battlemetrics.com/players/1105071544",
            {
                headers: {
                    "User-Agent": "Mozilla/5.0"
                }
            }
        );

        console.log(data.substring(0, 500));
    } catch (err) {
        console.log(err.response?.status || err.message);
    }
})();