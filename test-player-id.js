require("dotenv").config();
const axios = require("axios");
const fs = require("fs");

(async () => {
    try {
        const res = await axios.get(
            "https://api.battlemetrics.com/players/1153330200?include=server,identifier",
            {
                headers: {
                    Authorization: `Bearer ${process.env.BATTLEMETRICS_TOKEN}`,
                    Accept: "application/json"
                }
            }
        );

        fs.writeFileSync(
            "response.json",
            JSON.stringify(res.data, null, 2)
        );

        console.log("✅ response.json creado");

    } catch (e) {
        console.log(e.response?.status);
        console.log(JSON.stringify(e.response?.data, null, 2));
    }
})();