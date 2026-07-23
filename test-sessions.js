require("dotenv").config();
const axios = require("axios");

(async () => {
    try {
        const res = await axios.get(
            "https://api.battlemetrics.com/players/1153330200/relationships/sessions?include=server&page[size]=100",
            {
                headers: {
                    Authorization: `Bearer ${process.env.BATTLEMETRICS_TOKEN}`,
                    Accept: "application/json"
                }
            }
        );

        console.log(res.status);
        console.log(JSON.stringify(res.data, null, 2));

    } catch (e) {
        console.log("STATUS:", e.response?.status);
        console.log(JSON.stringify(e.response?.data, null, 2));
    }
})();