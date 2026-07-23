require("dotenv").config();
const axios = require("axios");

(async () => {
    try {
        const res = await axios.get(
            "https://api.battlemetrics.com/me",
            {
                headers: {
                    Authorization: `Bearer ${process.env.BATTLEMETRICS_TOKEN}`
                }
            }
        );

        console.log(res.status);
        console.log(JSON.stringify(res.data, null, 2));

    } catch (e) {
        console.log("STATUS:", e.response?.status);
        console.log(e.response?.data || e.message);
    }
})();