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