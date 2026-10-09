require("dotenv").config();

const {
    diagnosticarBattleMetrics
} = require("./services/battlemetricsHours.js");

const PLAYER_ID = "1109278103";

async function main() {
    if (!process.env.BATTLEMETRICS_TOKEN) {
        console.error("❌ Falta BATTLEMETRICS_TOKEN en el .env");
        process.exitCode = 1;
        return;
    }

    try {
        await diagnosticarBattleMetrics(PLAYER_ID);
    } catch (error) {
        console.error("❌ Error en el diagnóstico:", error.message);
        process.exitCode = 1;
    }
}

main();