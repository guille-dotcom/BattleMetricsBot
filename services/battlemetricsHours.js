require("dotenv").config();

const axios = require("axios");


async function getBattleMetricsHours(playerId) {

    try {

        console.log("CONSULTANDO DATOS DEL JUGADOR...");


        const token = process.env.BATTLEMETRICS_TOKEN;


        const response = await axios.get(

            `https://api.battlemetrics.com/players/${playerId}?include=server`,

            {
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            }

        );


        const player = response.data.data;

        const servidores = response.data.included || [];


        console.log(
            "JUGADOR:",
            player.attributes.name
        );


        console.log(
            "SERVIDORES ENCONTRADOS:",
            servidores.length
        );


        let segundosTotales = 0;

        let listaServidores = [];


        for (const servidor of servidores) {


            if (servidor.type !== "server")
                continue;


            const tiempo =
                servidor.meta?.timePlayed || 0;


            segundosTotales += tiempo;


            listaServidores.push({

                nombre:
                    servidor.attributes.name,

                segundos:
                    tiempo,

                horas:
                    (tiempo / 3600).toFixed(2)

            });


        }


        const horasTotales =
            (segundosTotales / 3600).toFixed(2);


        console.log(
            "SEGUNDOS TOTALES:",
            segundosTotales
        );


        console.log(
            "HORAS TOTALES:",
            horasTotales
        );


        return {


            totalHoras: horasTotales,


            servidores: {

                rust: {

                    horas: horasTotales,

                    datos: {

                        servidoresEncontrados:
                            servidores.length,

                        lista:
                            listaServidores

                    }

                }

            }


        };


    } catch(error) {


        console.log(
            "ERROR API:",
            error.response?.data || error.message
        );


        return {

            totalHoras:"0.00",

            servidores:{
                rust:{
                    horas:"0.00",
                    datos:{}
                }
            }

        };

    }

}


module.exports = {
    getBattleMetricsHours
};