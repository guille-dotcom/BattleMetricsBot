const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

puppeteer.use(StealthPlugin());

async function getBattleMetricsHours(playerId) {

    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-blink-features=AutomationControlled"
        ]
    });

    try {

        const page = await browser.newPage();

        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36"
        );

        // Entramos primero al perfil
        await page.goto(
            `https://www.battlemetrics.com/players/${playerId}`,
            {
                waitUntil: "networkidle2",
                timeout: 60000
            }
        );

        // Esperamos unos segundos por si Cloudflare hace la comprobación
        await new Promise(r => setTimeout(r, 8000));

        // Hacemos el mismo fetch que hace la extensión
        const data = await page.evaluate(async (playerId) => {

            const res = await fetch(
                `https://api.battlemetrics.com/players/${playerId}?include=server,identifier`,
                {
                    credentials: "include"
                }
            );

            return {
                status: res.status,
                body: await res.text()
            };

        }, playerId);

        console.log("STATUS:", data.status);
        console.log(data.body);

        await browser.close();

        return null;

    } catch (err) {

        await browser.close();
        throw err;

    }

}

module.exports = {
    getBattleMetricsHours
};