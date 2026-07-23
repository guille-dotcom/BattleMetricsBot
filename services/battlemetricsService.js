const { chromium } = require("playwright");


async function getBattleMetricsId(steamId) {

    const browser = await chromium.connectOverCDP(
        "http://127.0.0.1:9222"
    );


    const context = browser.contexts()[0];

    const page = await context.newPage();


    try {


        await page.goto(
            `https://www.battlemetrics.com/players?filter[search]=${steamId}`,
            {
                waitUntil:"domcontentloaded",
                timeout:60000
            }
        );


        await page.waitForTimeout(8000);



        const url = page.url();



        let match =
            url.match(
                /players\/(\d+)/
            );



        if(match){

            return match[1];

        }



        const links =
            await page.locator(
                'a[href*="/players/"]'
            )
            .evaluateAll(
                els =>
                els.map(
                    e=>e.href
                )
            );



        for(const link of links){


            const id =
                link.match(
                    /players\/(\d+)/
                );


            if(id){

                return id[1];

            }

        }



        return null;



    } finally {


        await page.close();


    }

}



module.exports = {
    getBattleMetricsId
};