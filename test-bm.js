require("dotenv").config();
const axios = require("axios");

async function test() {
    try {
        const res = await axios.get(
            "https://api.battlemetrics.com/activity",
            {
                headers: {
                    Authorization: `Bearer ${process.env.BATTLEMETRICS_TOKEN}`
                },
                params: {
                    "page[size]": 1
                }
            }
        );

        console.log("✅ Token válido");
        console.log("Status:", res.status);
        console.log("Datos recibidos:", res.data);

    } catch (err) {
        console.log("❌ Error");

        if (err.response) {
            console.log("Status:", err.response.status);
            console.log(err.response.data);
        } else {
            console.log(err.message);
        }
    }
}

test();