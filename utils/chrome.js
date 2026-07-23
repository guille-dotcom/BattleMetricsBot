const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");

const CHROME =
"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const PROFILE =
"C:\\BattleMetricsBotProfile";

function puertoAbierto() {

    return new Promise(resolve => {

        http.get(
            "http://127.0.0.1:9222/json/version",
            res => {

                res.resume();
                resolve(true);

            }

        ).on("error", () => {

            resolve(false);

        });

    });

}

async function iniciarChrome() {

    console.log("================================");
    console.log("INICIANDO CHROME");
    console.log("================================");

    console.log("CHROME:");
    console.log(CHROME);

    console.log("PROFILE:");
    console.log(PROFILE);

    console.log("EXISTE CHROME:", fs.existsSync(CHROME));
    console.log("EXISTE PROFILE:", fs.existsSync(PROFILE));

    if (await puertoAbierto()) {

        console.log("PUERTO 9222 YA ABIERTO");
        return;

    }

    console.log("ABRIENDO CHROME...");

    const chrome = spawn(

        CHROME,

        [

            `--user-data-dir=${PROFILE}`,
            "--remote-debugging-port=9222",
            "--no-first-run",
            "--no-default-browser-check"

        ],

        {

            detached: false,
            shell: false

        }

    );

    chrome.on("spawn", () => {

        console.log("CHROME INICIADO");

    });

    chrome.on("error", err => {

        console.log("ERROR AL EJECUTAR CHROME");
        console.error(err);

    });

    chrome.on("exit", (code, signal) => {

        console.log("CHROME CERRADO");
        console.log("CODE:", code);
        console.log("SIGNAL:", signal);

    });

    chrome.stdout.on("data", data => {

        console.log("STDOUT:");
        console.log(data.toString());

    });

    chrome.stderr.on("data", data => {

        console.log("STDERR:");
        console.log(data.toString());

    });

    for (let i = 0; i < 30; i++) {

        if (await puertoAbierto()) {

            console.log("PUERTO 9222 LISTO");
            return;

        }

        console.log("ESPERANDO PUERTO...", i + 1);

        await new Promise(r => setTimeout(r, 1000));

    }

    throw new Error("Chrome nunca abrió el puerto 9222.");

}

module.exports = {
    iniciarChrome
};