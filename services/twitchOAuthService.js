const axios = require("axios");

const TwitchAccount = require("../models/TwitchAccount");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const TWITCH_CLIENT_ID =
    process.env.TWITCH_CLIENT_ID;

const TWITCH_CLIENT_SECRET =
    process.env.TWITCH_CLIENT_SECRET;

const TWITCH_REDIRECT_URI =
    process.env.TWITCH_REDIRECT_URI;

// =====================================================
// VALIDAR CONFIGURACIÓN
// =====================================================

function validarConfiguracionTwitch() {
    if (!TWITCH_CLIENT_ID) {
        throw new Error(
            "Falta la variable TWITCH_CLIENT_ID."
        );
    }

    if (!TWITCH_CLIENT_SECRET) {
        throw new Error(
            "Falta la variable TWITCH_CLIENT_SECRET."
        );
    }

    if (!TWITCH_REDIRECT_URI) {
        throw new Error(
            "Falta la variable TWITCH_REDIRECT_URI."
        );
    }
}

// =====================================================
// GENERAR URL DE AUTORIZACIÓN
// =====================================================

function generarUrlAutorizacion(discordUserId) {
    validarConfiguracionTwitch();

    if (!discordUserId) {
        throw new Error(
            "No se recibió el Discord User ID."
        );
    }

    const state = Buffer.from(
        JSON.stringify({
            discordUserId,
            timestamp: Date.now()
        })
    ).toString("base64url");

    const params = new URLSearchParams({
        client_id: TWITCH_CLIENT_ID,
        redirect_uri: TWITCH_REDIRECT_URI,
        response_type: "code",
        scope: "user:read:email",
        state
    });

    return (
        "https://id.twitch.tv/oauth2/authorize?" +
        params.toString()
    );
}

// =====================================================
// LEER STATE DE OAUTH
// =====================================================

function leerState(state) {
    if (!state) {
        throw new Error(
            "No se recibió el parámetro state de Twitch."
        );
    }

    try {
        const datos = JSON.parse(
            Buffer.from(
                state,
                "base64url"
            ).toString("utf8")
        );

        if (
            !datos.discordUserId ||
            !datos.timestamp
        ) {
            throw new Error(
                "El state de Twitch está incompleto."
            );
        }

        // El enlace solo es válido durante 10 minutos
        const diezMinutos =
            10 * 60 * 1000;

        if (
            Date.now() -
                Number(datos.timestamp) >
            diezMinutos
        ) {
            throw new Error(
                "El enlace de vinculación de Twitch ha expirado. Ejecuta nuevamente /drops vincular."
            );
        }

        return datos;
    } catch (error) {
        if (
            error.message &&
            error.message.includes(
                "ha expirado"
            )
        ) {
            throw error;
        }

        throw new Error(
            "El state recibido desde Twitch no es válido."
        );
    }
}

// =====================================================
// INTERCAMBIAR CODE POR TOKENS
// =====================================================

async function obtenerTokensDesdeCodigo(
    code
) {
    validarConfiguracionTwitch();

    if (!code) {
        throw new Error(
            "Twitch no proporcionó el código de autorización."
        );
    }

    try {
        const respuesta =
            await axios.post(
                "https://id.twitch.tv/oauth2/token",
                null,
                {
                    params: {
                        client_id:
                            TWITCH_CLIENT_ID,
                        client_secret:
                            TWITCH_CLIENT_SECRET,
                        code,
                        grant_type:
                            "authorization_code",
                        redirect_uri:
                            TWITCH_REDIRECT_URI
                    },
                    timeout: 15000
                }
            );

        if (
            !respuesta.data ||
            !respuesta.data.access_token
        ) {
            throw new Error(
                "Twitch no devolvió un access token válido."
            );
        }

        return respuesta.data;
    } catch (error) {
        console.error(
            "❌ Error obteniendo tokens de Twitch:"
        );

        if (error.response) {
            console.error(
                "Twitch respondió:",
                error.response.status,
                error.response.data
            );
        } else {
            console.error(
                error.message
            );
        }

        throw new Error(
            "No se pudo completar la autorización con Twitch."
        );
    }
}

// =====================================================
// OBTENER USUARIO DE TWITCH
// =====================================================

async function obtenerUsuarioTwitch(
    accessToken
) {
    validarConfiguracionTwitch();

    if (!accessToken) {
        throw new Error(
            "No se recibió el access token de Twitch."
        );
    }

    try {
        const respuesta =
            await axios.get(
                "https://api.twitch.tv/helix/users",
                {
                    headers: {
                        "Client-ID":
                            TWITCH_CLIENT_ID,
                        Authorization:
                            `Bearer ${accessToken}`
                    },
                    timeout: 15000
                }
            );

        if (
            !respuesta.data ||
            !Array.isArray(
                respuesta.data.data
            ) ||
            !respuesta.data.data.length
        ) {
            throw new Error(
                "Twitch no devolvió información del usuario."
            );
        }

        return respuesta.data.data[0];
    } catch (error) {
        console.error(
            "❌ Error obteniendo usuario de Twitch:"
        );

        if (error.response) {
            console.error(
                "Twitch respondió:",
                error.response.status,
                error.response.data
            );
        } else {
            console.error(
                error.message
            );
        }

        throw new Error(
            "No se pudo obtener la información de tu cuenta de Twitch."
        );
    }
}

// =====================================================
// GUARDAR / ACTUALIZAR CUENTA
// =====================================================

async function guardarCuentaTwitch({
    discordUserId,
    tokenData,
    twitchUser
}) {
    if (!discordUserId) {
        throw new Error(
            "Falta el Discord User ID."
        );
    }

    if (!tokenData) {
        throw new Error(
            "Faltan los datos OAuth de Twitch."
        );
    }

    if (!twitchUser) {
        throw new Error(
            "Faltan los datos del usuario Twitch."
        );
    }

    if (
        !tokenData.access_token ||
        !tokenData.refresh_token
    ) {
        throw new Error(
            "Twitch no devolvió los tokens necesarios."
        );
    }

    const expiresIn =
        Number(
            tokenData.expires_in
        ) || 0;

    const expiresAt =
        new Date(
            Date.now() +
                expiresIn * 1000
        );

    const cuenta =
        await TwitchAccount.findOneAndUpdate(
            {
                discordUserId
            },
            {
                $set: {
                    twitchUserId:
                        twitchUser.id,
                    twitchLogin:
                        twitchUser.login,
                    twitchDisplayName:
                        twitchUser.display_name ||
                        twitchUser.login,

                    accessToken:
                        tokenData.access_token,

                    refreshToken:
                        tokenData.refresh_token,

                    expiresAt,

                    updatedAt:
                        new Date()
                },
                $setOnInsert: {
                    createdAt:
                        new Date()
                }
            },
            {
                new: true,
                upsert: true,
                setDefaultsOnInsert:
                    true
            }
        );

    return cuenta;
}

// =====================================================
// RENOVAR ACCESS TOKEN
// =====================================================

async function renovarAccessToken(
    cuenta
) {
    validarConfiguracionTwitch();

    if (!cuenta) {
        throw new Error(
            "No se encontró la cuenta de Twitch."
        );
    }

    if (!cuenta.refreshToken) {
        throw new Error(
            "La cuenta de Twitch no tiene refresh token."
        );
    }

    try {
        const respuesta =
            await axios.post(
                "https://id.twitch.tv/oauth2/token",
                null,
                {
                    params: {
                        client_id:
                            TWITCH_CLIENT_ID,
                        client_secret:
                            TWITCH_CLIENT_SECRET,
                        grant_type:
                            "refresh_token",
                        refresh_token:
                            cuenta.refreshToken
                    },
                    timeout: 15000
                }
            );

        const datos =
            respuesta.data;

        if (
            !datos ||
            !datos.access_token
        ) {
            throw new Error(
                "Twitch no devolvió un nuevo access token."
            );
        }

        const expiresIn =
            Number(
                datos.expires_in
            ) || 0;

        cuenta.accessToken =
            datos.access_token;

        // Twitch puede devolver un nuevo
        // refresh token. Si no lo devuelve,
        // conservamos el anterior.
        if (
            datos.refresh_token
        ) {
            cuenta.refreshToken =
                datos.refresh_token;
        }

        cuenta.expiresAt =
            new Date(
                Date.now() +
                    expiresIn * 1000
            );

        cuenta.updatedAt =
            new Date();

        await cuenta.save();

        console.log(
            `🔄 Token Twitch renovado para ${cuenta.twitchLogin}`
        );

        return cuenta;
    } catch (error) {
        console.error(
            `❌ Error renovando token Twitch para ${cuenta.twitchLogin || cuenta.discordUserId}:`
        );

        if (error.response) {
            console.error(
                "Twitch respondió:",
                error.response.status,
                error.response.data
            );
        } else {
            console.error(
                error.message
            );
        }

        throw new Error(
            "No se pudo renovar la sesión de Twitch. Es posible que sea necesario volver a vincular la cuenta."
        );
    }
}

// =====================================================
// OBTENER CUENTA CON TOKEN VÁLIDO
// =====================================================

async function obtenerCuentaConToken(
    discordUserId
) {
    const cuenta =
        await TwitchAccount.findOne({
            discordUserId
        });

    if (!cuenta) {
        return null;
    }

    // Renovamos con margen de 5 minutos
    const margen =
        5 * 60 * 1000;

    const ahora =
        Date.now();

    const expiracion =
        cuenta.expiresAt
            ? new Date(
                  cuenta.expiresAt
              ).getTime()
            : 0;

    if (
        expiracion <=
        ahora + margen
    ) {
        return await renovarAccessToken(
            cuenta
        );
    }

    return cuenta;
}

// =====================================================
// DESVINCULAR TWITCH
// =====================================================

async function desvincularTwitch(
    discordUserId
) {
    if (!discordUserId) {
        return false;
    }

    const cuenta =
        await TwitchAccount.findOne({
            discordUserId
        });

    if (!cuenta) {
        return false;
    }

    // Intentamos revocar el token en Twitch
    // antes de eliminarlo de MongoDB.
    if (cuenta.accessToken) {
        try {
            await axios.post(
                "https://id.twitch.tv/oauth2/revoke",
                null,
                {
                    params: {
                        client_id:
                            TWITCH_CLIENT_ID,
                        token:
                            cuenta.accessToken
                    },
                    timeout: 10000
                }
            );

            console.log(
                `🔓 Token Twitch revocado para ${cuenta.twitchLogin}`
            );
        } catch (error) {
            console.log(
                "⚠️ No se pudo revocar el token Twitch:",
                error.response?.data ||
                    error.message
            );
        }
    }

    await TwitchAccount.deleteOne({
        discordUserId
    });

    console.log(
        `🗑️ Cuenta Twitch desvinculada de Discord: ${discordUserId}`
    );

    return true;
}

// =====================================================
// EXPORTAR
// =====================================================

module.exports = {
    generarUrlAutorizacion,
    leerState,
    obtenerTokensDesdeCodigo,
    obtenerUsuarioTwitch,
    guardarCuentaTwitch,
    renovarAccessToken,
    obtenerCuentaConToken,
    desvincularTwitch
};