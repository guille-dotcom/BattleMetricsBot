require("dotenv").config();
const axios = require("axios");

const TOKEN = process.env.BATTLEMETRICS_TOKEN;
const SERVER_ID = "41243073";

const endpoints = [
    `/servers/${SERVER_ID}/relationships/players`,
    `/servers/${SERVER_ID}/relationships/sessions`,
    `/players?filter[servers]=${SERVER_ID}&page[size]=100`,
];

async function testEndpoint(endpoint) {
    console.log("\n==========================================");
    console.log("TEST:", endpoint);
    console.log("==========================================");

    try {
        const response = await axios.get(
            `https://api.battlemetrics.com${endpoint}`,
            {
                headers: {
                    Authorization: `Bearer ${TOKEN}`,
                    Accept: "application/json",
                },
                timeout: 30000,
            }
        );

        console.log("HTTP:", response.status);

        const data = response.data;

        if (Array.isArray(data?.data)) {
            console.log("DATA:", data.data.length);

            for (const player of data.data.slice(0, 10)) {
                console.log(
                    JSON.stringify(player, null, 2)
                );
            }
        } else {
            console.log(
                JSON.stringify(data, null, 2)
            );
        }

    } catch (error) {
        console.log(
            "HTTP:",
            error.response?.status || "SIN RESPUESTA"
        );

        if (error.response?.data) {
            console.log(
                JSON.stringify(
                    error.response.data,
                    null,
                    2
                )
            );
        } else {
            console.log(error.message);
        }
    }
}

async function main() {
    if (!TOKEN) {
        console.error(
            "❌ BATTLEMETRICS_TOKEN no está configurado"
        );
        process.exit(1);
    }

    console.log("Token: CARGADO");
    console.log("Servidor:", SERVER_ID);

    for (const endpoint of endpoints) {
        await testEndpoint(endpoint);
    }
}

main();