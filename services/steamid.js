const axios = require("axios");

// =====================================================
// STEAMID.UK
// =====================================================

async function getSteamIDData(input) {

    const apiKey =
        process.env.STEAMID_API_KEY;

    const myId =
        process.env.STEAMID_MYID;

    // ==========================================
    // VARIABLES DE ENTORNO
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
    // VALIDAR STEAMID64
    // ==========================================

    if (
        !input ||
        !/^\d{17}$/.test(
            String(input).trim()
        )
    ) {

        throw new Error(
            "El SteamID introducido no es válido."
        );
    }

    const steamId =
        String(input).trim();

    // ==========================================
    // CONSULTAR STEAMID.UK
    // ==========================================

    try {

        console.log(
            `[SteamID.uk] Consultando ${steamId}`
        );

        const response =
            await axios.get(
                "https://steamidapi.uk/v2/steamid.php",
                {
                    params: {

                        myid:
                            myId,

                        apikey:
                            apiKey,

                        input:
                            steamId
                    },

                    timeout:
                        15000
                }
            );

        // ==========================================
        // MOSTRAR RESPUESTA
        // ==========================================

        console.log(
            "=============================================="
        );

        console.log(
            "RESPUESTA DE STEAMID.UK"
        );

        console.log(
            "=============================================="
        );

        console.log(
            JSON.stringify(
                response.data,
                null,
                2
            )
        );

        console.log(
            "=============================================="
        );

        // ==========================================
        // VALIDAR RESPUESTA
        // ==========================================

        if (
            !response.data
        ) {

            throw new Error(
                "SteamID.uk devolvió una respuesta vacía."
            );
        }

        if (
            !response.data.auth
        ) {

            throw new Error(
                "SteamID.uk devolvió una respuesta inválida."
            );
        }

        if (
            response.data.auth.auth !== "ok"
        ) {

            throw new Error(
                "SteamID.uk rechazó la solicitud."
            );
        }

        // ==========================================
        // DEVOLVER DATOS
        // ==========================================

        return response.data;

    } catch (error) {

        console.error(
            "❌ Error en SteamID.uk API:",
            error.response?.data ||
            error.message
        );

        throw error;
    }
}

// =====================================================
// EXPORTACIÓN
// =====================================================

module.exports = {
    getSteamIDData
};