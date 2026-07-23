const { chromium } = require("playwright");

(async () => {
    const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");

    const context = browser.contexts()[0];
    const resultados = new Map();

    function escuchar(page) {
        page.on("response", async (response) => {
            const url = response.url();

            // Mostrar las URLs relacionadas
            if (
                url.includes("_api") ||
                url.includes("time-played-history")
            ) {
                console.log("URL:", url);
            }

            // API correcta de BattleMetrics
            if (
                url.includes("/_api/players/") &&
                url.includes("/time-played-history/")
            ) {
                try {
                    const json = await response.json();

                    const match = url.match(/time-played-history\/(\d+)/);
                    if (!match) return;

                    const serverId = match[1];

                    let segundos = 0;

                    if (json.data) {
                        for (const punto of json.data) {
                            segundos += punto.attributes.value;
                        }
                    }

                    resultados.set(serverId, segundos);

                    console.clear();

                    console.log("=========== HORAS POR SERVIDOR ===========\n");

                    let total = 0;

                    for (const [id, seg] of resultados) {
                        total += seg;

                        console.log(
                            `Servidor ${id}: ${(seg / 3600).toFixed(2)} horas`
                        );
                    }

                    console.log("\n==========================================");
                    console.log(`TOTAL: ${(total / 3600).toFixed(2)} horas`);
                    console.log("==========================================");

                } catch (err) {
                    console.log("Error leyendo:", url);
                }
            }
        });
    }

    // Escuchar todas las pestañas abiertas
    context.pages().forEach(escuchar);

    // Escuchar nuevas pestañas
    context.on("page", escuchar);

    const page = await context.newPage();

    console.log("Abriendo BattleMetrics...");

    await page.goto(
        "https://www.battlemetrics.com/players/1153330200",
        {
            waitUntil: "domcontentloaded",
            timeout: 60000,
        }
    );

    console.log("Página abierta.");
    console.log("Pulsa F5 o cambia entre servidores.");
    console.log("Esperando peticiones durante 2 minutos...\n");

    await page.waitForTimeout(120000);

    console.log("\n=========== RESUMEN FINAL ===========");

    let total = 0;

    for (const [id, seg] of resultados) {
        total += seg;
        console.log(`Servidor ${id}: ${(seg / 3600).toFixed(2)} horas`);
    }

    console.log("-------------------------------------");
    console.log(`TOTAL: ${(total / 3600).toFixed(2)} horas`);
    console.log("=====================================");

    await browser.close();
})();