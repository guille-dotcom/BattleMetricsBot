const axios = require("axios");

(async () => {
    try {
        const url = "https://steamid.uk/profile/76561198121061125";

        const response = await axios.get(url, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/139.0.0.0 Safari/537.36"
            },
            timeout: 15000
        });

        console.log("STATUS:", response.status);
        console.log(response.data);

    } catch (error) {
        console.error(
            "ERROR:",
            error.response?.status,
            error.response?.data || error.message
        );
    }
})();