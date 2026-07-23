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


        const nombreJugador =
            player.attributes.name || "Desconocido";


        console.log(
            "JUGADOR:",
            nombreJugador
        );


        console.log(
            "SERVIDORES ENCONTRADOS:",
            servidores.length
        );


        let segundosTotales = 0;

        let listaServidores = [];


        // Evita sumar el mismo servidor más de una vez
        const servidoresContados = new Set();


        for (const servidor of servidores) {


            if (servidor.type !== "server")
                continue;


            const servidorId = servidor.id;


            if (servidoresContados.has(servidorId)) {

                console.log(
                    "SERVIDOR DUPLICADO IGNORADO:",
                    servidor.attributes.name
                );

                continue;

            }


            servidoresContados.add(servidorId);


            const tiempo =
                servidor.meta?.timePlayed || 0;


            segundosTotales += tiempo;


            listaServidores.push({

                id:
                    servidorId,

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
            "SERVIDORES ÚNICOS:",
            listaServidores.length
        );


        console.log(
            "SEGUNDOS TOTALES:",
            segundosTotales
        );


        console.log(
            "HORAS TOTALES:",
            horasTotales
        );


        return {

            // Nombre del perfil BattleMetrics
            nombre:
                nombreJugador,


            totalHoras:
                horasTotales,


            servidores: {

                rust: {

                    horas:
                        horasTotales,

                    datos: {

                        servidoresEncontrados:
                            listaServidores.length,

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

            nombre:
                "Desconocido",

            totalHoras:
                "0.00",

            servidores: {

                rust: {

                    horas:
                        "0.00",

                    datos: {

                        servidoresEncontrados:
                            0,

                        lista:
                            []

                    }

                }

            }

        };

    }

}


module.exports = {
    getBattleMetricsHours
};