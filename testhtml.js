const fs = require("fs");

const cookies =
"sid=s%3Ax8ud_5fzvjtntps_viMj7Ogi.t3fUqm7wv6Pa%2BAgMS1yOZyFJam%2BZLl8oT1Vd5yQGLuw; " +
"_csrf=AUv_E9izGMGfdlc5CJyc2y5Q; " +
"priority=s%3A3.2xeqxWSYi3rF7SSnqDdk7yYF0tv8yHZlk5LeUpFhuvc; " +
"game_user_id=5f16272b-da9d-4402-b325-3d55eddb1e79";

(async () => {

    try {

        console.log("CONECTANDO A BATTLEMETRICS...");

        const response = await fetch(
            "https://www.battlemetrics.com/players/1105071544",
            {
                headers: {
                    "cookie": cookies,
                    "user-agent": "Mozilla/5.0",
                    "accept": "text/html"
                }
            }
        );

        console.log("STATUS:", response.status);

        const html = await response.text();

        console.log("HTML:", html.length, "caracteres");

        fs.writeFileSync(
            "battlemetrics.html",
            html,
            "utf8"
        );

        console.log("ARCHIVO battlemetrics.html CREADO");

    } catch (err) {

        console.log(err);

    }

})();