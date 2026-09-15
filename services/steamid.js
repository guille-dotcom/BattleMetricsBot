const axios = require("axios");

// =====================================================
// STEAMID.UK
// API GLOBAL PARA TODOS LOS SERVIDORES DE DISCORD
// =====================================================

async function getSteamIDData(input) {

    const apiKey = process.env.STEAMID_API_KEY;
    const myId = process.env.STEAMID_MYID;

    // ==========================================
    // COMPROBAR VARIABLES DE ENTORNO
    // ==========================================

    if (!apiKey) {
        throw new Error(
            "Falta la variable de entorno STEAMID_API_KEY."
        );
    }

    if (!myId) {
        throw new Error(
            "Falta la variable de entorno STEAMID_MYID."
        );
    }

    // ==========================================
    // VALIDAR INPUT
    // ==========================================

    if (!input || !/^\d{17}$/.test(input)) {
        throw new Error(
            "El SteamID introducido no es válido."
        );
    }

    // ==========================================
    // CONSULTAR API STEAMID.UK
    // ==========================================

    try {

        const response = await axios.get(
            "https://steamidapi.uk/v2/steamid.php",
            {
                params: {
                    myid: myId,
                    apikey: apiKey,
                    input: input
                },

                timeout: 15000
            }
        );

        console.log("==============================================");
        console.log("RESPUESTA DE STEAMID.UK");
        console.log("==============================================");
        console.log(JSON.stringify(response.data, null, 2));
        console.log("==============================================");

        // ==========================================
        // COMPROBAR RESPUESTA
        // ==========================================

        if (!response.data) {
            throw new Error(
                "SteamID.uk devolvió una respuesta vacía."
            );
        }

        if (!response.data.auth) {
            throw new Error(
                "SteamID.uk devolvió una respuesta inválida."
            );
        }

        if (response.data.auth.auth !== "ok") {
            throw new Error(
                "SteamID.uk rechazó la solicitud."
            );
        }

        // ==========================================
        // PRUEBA PLUGIN.PHP
        // ==========================================
        //
        // NO afecta al resultado principal.
        // Solo consulta el endpoint utilizado
        // por el plugin público de SteamID.uk.
        //
        // El plugin utiliza:
        //
        // api        = API Key
        // player     = SteamID64
        // serverport = puerto del servidor
        //
        // ==========================================

        console.log("");
        console.log("==============================================");
        console.log("PRUEBA STEAMID.UK PLUGIN.PHP");
        console.log("==============================================");

        try {

            const pluginResponse = await axios.get(
                "https://steamidapi.uk/plugin.php",
                {
                    params: {
                        api: apiKey,
                        player: input,
                        serverport: "28015"
                    },

                    timeout: 15000,

                    headers: {
                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
                        "Accept":
                            "application/json, text/plain, */*"
                    }
                }
            );

            console.log("STATUS PLUGIN:", pluginResponse.status);

            console.log("----------------------------------------------");
            console.log("RESPUESTA COMPLETA PLUGIN.PHP");
            console.log("----------------------------------------------");

            console.log(
                typeof pluginResponse.data === "string"
                    ? pluginResponse.data
                    : JSON.stringify(
                        pluginResponse.data,
                        null,
                        2
                    )
            );

            console.log("----------------------------------------------");
            console.log("FIN PLUGIN.PHP");
            console.log("==============================================");

        } catch (pluginError) {

            console.error(
                "❌ ERROR PLUGIN.PHP:"
            );

            console.error(
                pluginError.response?.status ||
                pluginError.message
            );

            console.error(
                pluginError.response?.data || ""
            );

            console.log("==============================================");
        }

        // ==========================================
        // DEVOLVER API PRINCIPAL
        // ==========================================

        return response.data;

    } catch (error) {

        console.error(
            "❌ Error en SteamID.uk API:",
            error.response?.data || error.message
        );

        throw error;
    }
}

module.exports = {
    getSteamIDData
};