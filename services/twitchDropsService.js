// services/twitchDropsService.js

const axios = require("axios");

const {
    EmbedBuilder
} = require("discord.js");

const TwitchAccount =
    require("../models/TwitchAccount");

const RustDropsMonitor =
    require("../models/RustDropsMonitor");

// ============================================================
// CONFIGURACIÓN
// ============================================================

const TWITCH_CLIENT_ID =
    process.env.TWITCH_CLIENT_ID;

const TWITCH_CLIENT_SECRET =
    process.env.TWITCH_CLIENT_SECRET;

const FACEPUNCH_DROPS_URL =
    "https://twitch.facepunch.com/?handler=Twitch";

const INTERVALO_DROPS =
    60 * 1000;

const INTERVALO_TOKEN_INVALIDO =
    10 * 60 * 1000;

let twitchAppToken = null;
let twitchAppTokenExpiresAt = 0;

let dropsRevisando = false;
let dropsAutomaticosIniciados = false;

const tokensInvalidos =
    new Map();

// Evita repetir cada 60 segundos el mismo aviso
// sobre el problema de organización de Twitch.
const entitlementsOrganizacionAvisados =
    new Set();

// ============================================================
// CONFIGURACIÓN
// ============================================================

function validarConfiguracion() {
    if (!TWITCH_CLIENT_ID) {
        throw new Error(
            "Falta la variable TWITCH_CLIENT_ID."
        );
    }
}

// ============================================================
// HEADERS TWITCH
// ============================================================

function getHeaders(accessToken) {
    validarConfiguracion();

    if (!accessToken) {
        throw new Error(
            "No se recibió un access token de Twitch."
        );
    }

    return {
        "Client-ID":
            TWITCH_CLIENT_ID,

        "Authorization":
            `Bearer ${accessToken}`,

        "Content-Type":
            "application/json"
    };
}

// ============================================================
// OBTENER CLAVE DE CUENTA
// ============================================================

function obtenerClaveCuenta(cuenta) {
    if (!cuenta) {
        return "";
    }

    return String(
        cuenta.discordUserId ||
        cuenta.twitchUserId ||
        cuenta.twitchLogin ||
        ""
    );
}

// ============================================================
// MARCAR TOKEN COMO INVÁLIDO
// ============================================================

function marcarTokenInvalido(cuenta) {
    if (!cuenta) {
        return;
    }

    const key =
        obtenerClaveCuenta(cuenta);

    if (!key) {
        return;
    }

    tokensInvalidos.set(
        key,
        Date.now()
    );
}

// ============================================================
// COMPROBAR SI EL TOKEN ESTÁ EN COOLDOWN
// ============================================================

function tokenEstaEnCooldown(cuenta) {
    if (!cuenta) {
        return false;
    }

    if (
        obtenerRefreshToken(cuenta)
    ) {
        return false;
    }

    const key =
        obtenerClaveCuenta(cuenta);

    if (!key) {
        return false;
    }

    const ultimaFecha =
        tokensInvalidos.get(key);

    if (!ultimaFecha) {
        return false;
    }

    const transcurrido =
        Date.now() -
        ultimaFecha;

    if (
        transcurrido >=
        INTERVALO_TOKEN_INVALIDO
    ) {
        tokensInvalidos.delete(key);
        return false;
    }

    return true;
}

// ============================================================
// LIMPIAR TOKEN INVÁLIDO DEL CACHE
// ============================================================

function limpiarTokenInvalido(cuenta) {
    if (!cuenta) {
        return;
    }

    const key =
        obtenerClaveCuenta(cuenta);

    if (!key) {
        return;
    }

    tokensInvalidos.delete(key);
}

// ============================================================
// IDENTIFICAR ERROR DE ORGANIZACIÓN TWITCH
// ============================================================

function esErrorOrganizacionEntitlements(
    error
) {
    const status =
        error?.response?.status;

    const data =
        error?.response?.data ||
        {};

    const mensaje =
        String(
            data.message ||
            error?.message ||
            ""
        ).toLowerCase();

    return (
        status === 400 &&
        mensaje.includes(
            "client in the oauth token is not associated with a known organization"
        )
    );
}

// ============================================================
// CREAR ERROR DE ORGANIZACIÓN
// ============================================================

function crearErrorOrganizacionEntitlements(
    error
) {
    const nuevoError =
        new Error(
            "El Client ID de Twitch no está asociado a una organización autorizada para consultar Entitlements de Drops."
        );

    nuevoError.response = {
        status:
            400,

        data:
            error?.response?.data ||
            {
                status:
                    400,

                message:
                    "The client in the OAuth token is not associated with a known organization."
            }
    };

    nuevoError.entitlementsNoDisponibles =
        true;

    nuevoError.motivo =
        "CLIENTE_SIN_ORGANIZACION";

    return nuevoError;
}

// ============================================================
// LIMPIAR AVISO DE ORGANIZACIÓN
// ============================================================

function limpiarAvisoOrganizacion(
    cuenta
) {
    const key =
        obtenerClaveCuenta(cuenta);

    if (key) {
        entitlementsOrganizacionAvisados.delete(
            key
        );
    }
}

// ============================================================
// AVISAR ERROR DE ORGANIZACIÓN
// ============================================================

function avisarErrorOrganizacion(
    cuenta
) {
    const key =
        obtenerClaveCuenta(cuenta);

    if (!key) {
        return;
    }

    if (
        entitlementsOrganizacionAvisados.has(
            key
        )
    ) {
        return;
    }

    entitlementsOrganizacionAvisados.add(
        key
    );

    console.error(
        `🚫 Twitch Entitlements no disponible para ${cuenta?.twitchLogin || cuenta?.twitchUserId || "cuenta Twitch"}.`
    );

    console.error(
        "🚫 Twitch respondió: 400 - The client in the OAuth token is not associated with a known organization."
    );

    console.error(
        "ℹ️ El access token es válido, pero Twitch no permite a este Client ID consultar Entitlements de Drops."
    );

    console.error(
        "ℹ️ Esto NO es un token expirado y NO se intentará renovar el token por este motivo."
    );

    console.error(
        "ℹ️ La asociación/autorización del Client ID debe resolverse en Twitch."
    );
}

// ============================================================
// VALIDAR TOKEN DEL USUARIO
// ============================================================

async function validarToken(accessToken) {
    if (!accessToken) {
        console.error(
            "❌ No existe access token de Twitch."
        );

        return null;
    }

    try {
        const respuesta =
            await axios.get(
                "https://id.twitch.tv/oauth2/validate",
                {
                    headers: {
                        Authorization:
                            `OAuth ${accessToken}`
                    },

                    timeout:
                        10000
                }
            );

        const datos =
            respuesta.data ||
            null;

        if (datos) {
            console.log(
                "🔎 DIAGNÓSTICO TOKEN TWITCH"
            );

            console.log(
                "🔎 Client ID configurado:",
                TWITCH_CLIENT_ID
            );

            console.log(
                "🔎 Client ID del token:",
                datos.client_id ||
                    "NO DEVUELTO"
            );

            console.log(
                "🔎 Usuario del token:",
                datos.login ||
                    "NO DEVUELTO"
            );

            console.log(
                "🔎 User ID del token:",
                datos.user_id ||
                    "NO DEVUELTO"
            );

            console.log(
                "🔎 Scopes del token:",
                Array.isArray(datos.scopes)
                    ? datos.scopes.join(", ") ||
                        "NINGUNO"
                    : "NO DEVUELTO"
            );

            console.log(
                "🔎 Expira en:",
                datos.expires_in ??
                    "NO DEVUELTO"
            );

            if (
                datos.client_id &&
                datos.client_id !==
                    TWITCH_CLIENT_ID
            ) {
                console.error(
                    "❌ ALERTA: El Client ID del token NO coincide con TWITCH_CLIENT_ID."
                );

            } else if (
                datos.client_id &&
                datos.client_id ===
                    TWITCH_CLIENT_ID
            ) {
                console.log(
                    "✅ El Client ID del token coincide con TWITCH_CLIENT_ID."
                );
            }
        }

        return datos;

    } catch (error) {
        const status =
            error.response?.status;

        const data =
            error.response?.data;

        if (
            status ===
            401
        ) {
            console.error(
                "❌ Token Twitch inválido o expirado (401)."
            );

            console.error(
                "❌ Twitch respondió:",
                data ||
                    error.message
            );

        } else {
            console.error(
                "❌ Error validando token Twitch:",
                status,
                data ||
                    error.message
            );
        }

        return null;
    }
}

// ============================================================
// OBTENER REFRESH TOKEN
// ============================================================

function obtenerRefreshToken(cuenta) {
    if (!cuenta) {
        return null;
    }

    return (
        cuenta.refreshToken ||
        cuenta.twitchRefreshToken ||
        cuenta.oauthRefreshToken ||
        null
    );
}

// ============================================================
// GUARDAR REFRESH TOKEN
// ============================================================

function guardarRefreshToken(
    cuenta,
    refreshToken
) {
    if (
        !cuenta ||
        !refreshToken
    ) {
        return;
    }

    if (
        Object.prototype.hasOwnProperty.call(
            cuenta,
            "refreshToken"
        )
    ) {
        cuenta.refreshToken =
            refreshToken;

        return;
    }

    if (
        Object.prototype.hasOwnProperty.call(
            cuenta,
            "twitchRefreshToken"
        )
    ) {
        cuenta.twitchRefreshToken =
            refreshToken;

        return;
    }

    if (
        Object.prototype.hasOwnProperty.call(
            cuenta,
            "oauthRefreshToken"
        )
    ) {
        cuenta.oauthRefreshToken =
            refreshToken;

        return;
    }

    cuenta.refreshToken =
        refreshToken;
}

// ============================================================
// RENOVAR ACCESS TOKEN TWITCH
// ============================================================

async function renovarAccessTokenTwitch(
    cuenta
) {
    if (!cuenta) {
        return {
            ok:
                false,

            motivo:
                "CUENTA_INVALIDA"
        };
    }

    if (
        !TWITCH_CLIENT_ID ||
        !TWITCH_CLIENT_SECRET
    ) {
        console.error(
            "❌ No se puede renovar el token: faltan TWITCH_CLIENT_ID o TWITCH_CLIENT_SECRET."
        );

        return {
            ok:
                false,

            motivo:
                "CONFIGURACION_TWITCH"
        };
    }

    const refreshToken =
        obtenerRefreshToken(cuenta);

    if (!refreshToken) {
        console.warn(
            `⚠️ ${cuenta.twitchLogin || cuenta.twitchUserId || "Cuenta Twitch"} no tiene refresh token guardado. Requiere revinculación.`
        );

        marcarTokenInvalido(
            cuenta
        );

        return {
            ok:
                false,

            motivo:
                "SIN_REFRESH_TOKEN",

            requiereRevincular:
                true
        };
    }

    try {
        console.log(
            `🔄 Intentando renovar token Twitch de ${cuenta.twitchLogin || cuenta.twitchUserId || "cuenta desconocida"}...`
        );

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
                            refreshToken
                    },

                    timeout:
                        15000
                }
            );

        const nuevoAccessToken =
            respuesta.data?.access_token;

        const nuevoRefreshToken =
            respuesta.data?.refresh_token;

        const expiresIn =
            Number(
                respuesta.data?.expires_in ||
                    0
            );

        if (!nuevoAccessToken) {
            console.error(
                "❌ Twitch no devolvió un nuevo access token al intentar renovarlo."
            );

            marcarTokenInvalido(
                cuenta
            );

            return {
                ok:
                    false,

                motivo:
                    "SIN_ACCESS_TOKEN"
            };
        }

        cuenta.accessToken =
            nuevoAccessToken;

        if (nuevoRefreshToken) {
            guardarRefreshToken(
                cuenta,
                nuevoRefreshToken
            );
        }

        if (
            Object.prototype.hasOwnProperty.call(
                cuenta,
                "expiresIn"
            )
        ) {
            cuenta.expiresIn =
                expiresIn;
        }

        if (
            Object.prototype.hasOwnProperty.call(
                cuenta,
                "tokenExpiresAt"
            )
        ) {
            cuenta.tokenExpiresAt =
                expiresIn
                    ? new Date(
                        Date.now() +
                        expiresIn *
                            1000
                    )
                    : null;
        }

        if (
            Object.prototype.hasOwnProperty.call(
                cuenta,
                "accessTokenExpiresAt"
            )
        ) {
            cuenta.accessTokenExpiresAt =
                expiresIn
                    ? new Date(
                        Date.now() +
                        expiresIn *
                            1000
                    )
                    : null;
        }

        await cuenta.save();

        limpiarTokenInvalido(
            cuenta
        );

        console.log(
            `✅ Token Twitch renovado correctamente para ${cuenta.twitchLogin || cuenta.twitchUserId || "cuenta desconocida"}.`
        );

        return {
            ok:
                true,

            accessToken:
                nuevoAccessToken,

            refreshToken:
                nuevoRefreshToken ||
                refreshToken,

            expiresIn
        };

    } catch (error) {
        const status =
            error.response?.status;

        const data =
            error.response?.data;

        console.error(
            `❌ No se pudo renovar el token Twitch de ${cuenta.twitchLogin || cuenta.twitchUserId || "cuenta desconocida"}.`
        );

        console.error(
            "❌ Twitch respondió:",
            status,
            data ||
                error.message
        );

        marcarTokenInvalido(
            cuenta
        );

        return {
            ok:
                false,

            motivo:
                status === 400
                    ? "REFRESH_TOKEN_INVALIDO"
                    : "ERROR_RENOVANDO_TOKEN",

            requiereRevincular:
                status === 400 ||
                status === 401
        };
    }
}

// ============================================================
// OBTENER TOKEN VÁLIDO
// ============================================================

async function obtenerTokenValidoCuenta(
    cuenta,
    permitirRefresh = true
) {
    if (!cuenta) {
        return {
            valido:
                false,

            requiereRevincular:
                true,

            motivo:
                "CUENTA_INVALIDA"
        };
    }

    const refreshToken =
        obtenerRefreshToken(cuenta);

    if (!cuenta.accessToken) {
        console.warn(
            `⚠️ ${cuenta.twitchLogin || cuenta.twitchUserId || "Cuenta Twitch"} no tiene accessToken.`
        );

        if (
            permitirRefresh &&
            refreshToken
        ) {
            console.log(
                `🔄 ${cuenta.twitchLogin || cuenta.twitchUserId} tiene refresh token. Se intentará obtener un nuevo access token.`
            );

            const renovacion =
                await renovarAccessTokenTwitch(
                    cuenta
                );

            if (
                renovacion.ok
            ) {
                const nuevoTokenInfo =
                    await validarToken(
                        cuenta.accessToken
                    );

                if (
                    nuevoTokenInfo
                ) {
                    limpiarTokenInvalido(
                        cuenta
                    );

                    return {
                        valido:
                            true,

                        accessToken:
                            cuenta.accessToken,

                        tokenInfo:
                            nuevoTokenInfo,

                        renovado:
                            true
                    };
                }
            }
        }

        return {
            valido:
                false,

            requiereRevincular:
                !refreshToken,

            motivo:
                refreshToken
                    ? "SIN_ACCESS_TOKEN"
                    : "SIN_TOKENS"
        };
    }

    const tokenInfo =
        await validarToken(
            cuenta.accessToken
        );

    if (tokenInfo) {
        limpiarTokenInvalido(
            cuenta
        );

        return {
            valido:
                true,

            accessToken:
                cuenta.accessToken,

            tokenInfo,

            renovado:
                false
        };
    }

    if (!permitirRefresh) {
        marcarTokenInvalido(
            cuenta
        );

        return {
            valido:
                false,

            requiereRevincular:
                !refreshToken,

            motivo:
                "TOKEN_INVALIDO"
        };
    }

    if (!refreshToken) {
        marcarTokenInvalido(
            cuenta
        );

        return {
            valido:
                false,

            requiereRevincular:
                true,

            motivo:
                "TOKEN_INVALIDO_SIN_REFRESH"
        };
    }

    console.log(
        `🔄 El access token de ${cuenta.twitchLogin || cuenta.twitchUserId || "cuenta Twitch"} no es válido. Se intentará renovar automáticamente AHORA.`
    );

    const renovacion =
        await renovarAccessTokenTwitch(
            cuenta
        );

    if (!renovacion.ok) {
        marcarTokenInvalido(
            cuenta
        );

        return {
            valido:
                false,

            requiereRevincular:
                !!renovacion.requiereRevincular,

            motivo:
                renovacion.motivo
        };
    }

    const nuevoTokenInfo =
        await validarToken(
            cuenta.accessToken
        );

    if (!nuevoTokenInfo) {
        console.error(
            "❌ Twitch entregó un nuevo token pero tampoco pudo validarse."
        );

        marcarTokenInvalido(
            cuenta
        );

        return {
            valido:
                false,

            requiereRevincular:
                false,

            motivo:
                "NUEVO_TOKEN_NO_VALIDO"
        };
    }

    limpiarTokenInvalido(
        cuenta
    );

    console.log(
        `✅ Nuevo access token validado correctamente para ${cuenta.twitchLogin || cuenta.twitchUserId || "cuenta Twitch"}.`
    );

    return {
        valido:
            true,

        accessToken:
            cuenta.accessToken,

        tokenInfo:
            nuevoTokenInfo,

        renovado:
            true
    };
}

// ============================================================
// OBTENER JUEGO RUST
// ============================================================

async function obtenerJuegoRust(
    accessToken
) {
    try {
        const respuesta =
            await axios.get(
                "https://api.twitch.tv/helix/games",
                {
                    params: {
                        name:
                            "Rust"
                    },

                    headers:
                        getHeaders(
                            accessToken
                        ),

                    timeout:
                        15000
                }
            );

        const juegos =
            respuesta.data?.data ||
            [];

        if (!juegos.length) {
            console.log(
                "⚠️ Twitch no devolvió el juego Rust."
            );

            return null;
        }

        const rust =
            juegos.find(
                juego =>
                    String(
                        juego.name
                    ).toLowerCase() ===
                    "rust"
            );

        if (rust) {
            console.log(
                `🎮 Rust encontrado en Twitch: ${rust.name} (${rust.id})`
            );
        }

        return (
            rust ||
            juegos[0]
        );

    } catch (error) {
        console.error(
            "❌ Error obteniendo Rust desde Twitch:",
            error.response?.status,
            error.response?.data ||
                error.message
        );

        throw error;
    }
}

// ============================================================
// ENTITLEMENTS TWITCH
// ============================================================

async function obtenerEntitlementsDrops(
    accessToken,
    gameId = null,
    fulfillmentStatus = null
) {
    const todos = [];
    let cursor = null;

    try {
        do {
            const params = {
                first:
                    1000
            };

            if (gameId) {
                params.game_id =
                    gameId;
            }

            if (fulfillmentStatus) {
                params.fulfillment_status =
                    fulfillmentStatus;
            }

            if (cursor) {
                params.after =
                    cursor;
            }

            console.log(
                "🎁 Consultando Twitch Entitlements...",
                {
                    game_id:
                        gameId ||
                        "todos",

                    fulfillment_status:
                        fulfillmentStatus ||
                        "todos",

                    tiene_cursor:
                        !!cursor
                }
            );

            const respuesta =
                await axios.get(
                    "https://api.twitch.tv/helix/entitlements/drops",
                    {
                        params,

                        headers:
                            getHeaders(
                                accessToken
                            ),

                        timeout:
                            15000
                    }
                );

            const datos =
                respuesta.data?.data ||
                [];

            todos.push(
                ...datos
            );

            cursor =
                respuesta.data?.pagination?.cursor ||
                null;

        } while (cursor);

        console.log(
            `✅ Twitch devolvió ${todos.length} entitlements.`
        );

        return todos;

    } catch (error) {
        if (
            esErrorOrganizacionEntitlements(
                error
            )
        ) {
            console.error(
                "🚫 Twitch rechazó la consulta de Entitlements porque el Client ID no está asociado a una organización conocida."
            );

            throw crearErrorOrganizacionEntitlements(
                error
            );
        }

        console.error(
            "❌ Error obteniendo entitlements Twitch Drops:",
            error.response?.status,
            error.response?.data ||
                error.message
        );

        throw error;
    }
}

// ============================================================
// TOKEN DE APLICACIÓN TWITCH
// ============================================================

async function obtenerTwitchAppToken() {
    if (
        twitchAppToken &&
        Date.now() <
            twitchAppTokenExpiresAt
    ) {
        return twitchAppToken;
    }

    if (
        !TWITCH_CLIENT_ID ||
        !TWITCH_CLIENT_SECRET
    ) {
        console.warn(
            "⚠️ No están configurados TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET."
        );

        return null;
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
                            "client_credentials"
                    },

                    timeout:
                        15000
                }
            );

        twitchAppToken =
            respuesta.data?.access_token ||
            null;

        const expiresIn =
            Number(
                respuesta.data?.expires_in ||
                    0
            );

        twitchAppTokenExpiresAt =
            Date.now() +
            Math.max(
                60,
                expiresIn - 300
            ) *
                1000;

        if (twitchAppToken) {
            console.log(
                "✅ Token de aplicación Twitch obtenido."
            );
        }

        return twitchAppToken;

    } catch (error) {
        console.error(
            "❌ Error obteniendo token de aplicación Twitch:",
            error.response?.status,
            error.response?.data ||
                error.message
        );

        twitchAppToken =
            null;

        twitchAppTokenExpiresAt =
            0;

        return null;
    }
}

// ============================================================
// COMPROBAR STREAMERS ONLINE
// SOLO RUST
// ============================================================

async function obtenerStreamersOnline(
    logins = []
) {
    const nombres = [
        ...new Set(
            logins
                .map(
                    nombre =>
                        String(
                            nombre ||
                                ""
                        )
                            .trim()
                            .toLowerCase()
                )
                .filter(Boolean)
        )
    ];

    if (!nombres.length) {
        return new Set();
    }

    const appToken =
        await obtenerTwitchAppToken();

    if (!appToken) {
        console.warn(
            "⚠️ No se pudo obtener token de aplicación. Los streamers aparecerán offline."
        );

        return new Set();
    }

    const rustGame =
        await obtenerJuegoRust(
            appToken
        );

    if (
        !rustGame ||
        !rustGame.id
    ) {
        console.warn(
            "⚠️ No se pudo obtener el ID de Rust desde Twitch. Los streamers aparecerán offline."
        );

        return new Set();
    }

    const rustGameId =
        String(
            rustGame.id
        );

    console.log(
        `🎮 Comprobando streams únicamente en Rust (${rustGame.name} / ${rustGameId}).`
    );

    const online =
        new Set();

    try {
        for (
            let i = 0;
            i < nombres.length;
            i += 100
        ) {
            const lote =
                nombres.slice(
                    i,
                    i + 100
                );

            const params =
                new URLSearchParams();

            for (
                const login
                of lote
            ) {
                params.append(
                    "user_login",
                    login
                );
            }

            const respuesta =
                await axios.get(
                    "https://api.twitch.tv/helix/streams",
                    {
                        params,

                        headers:
                            getHeaders(
                                appToken
                            ),

                        timeout:
                            15000
                    }
                );

            const streams =
                respuesta.data?.data ||
                [];

            for (
                const stream
                of streams
            ) {
                if (
                    !stream.user_login
                ) {
                    continue;
                }

                const gameId =
                    String(
                        stream.game_id ||
                            ""
                    );

                const gameName =
                    String(
                        stream.game_name ||
                            ""
                    )
                        .trim()
                        .toLowerCase();

                const estaEnRust =
                    gameId ===
                        rustGameId ||
                    gameName ===
                        "rust";

                if (
                    stream.type ===
                        "live" &&
                    estaEnRust
                ) {
                    online.add(
                        String(
                            stream.user_login
                        ).toLowerCase()
                    );

                    console.log(
                        `🟢 ${stream.user_name || stream.user_login} está ONLINE en Rust.`
                    );

                } else {
                    console.log(
                        `⚫ ${stream.user_name || stream.user_login} está LIVE pero NO está en Rust (${stream.game_name || "sin categoría"}).`
                    );
                }
            }
        }

        console.log(
            `🟢 Twitch: ${online.size} streamer(s) transmitiendo Rust de ${nombres.length} participantes.`
        );

        return online;

    } catch (error) {
        console.error(
            "❌ Error comprobando streamers online en Rust:",
            error.response?.status,
            error.response?.data ||
                error.message
        );

        return new Set();
    }
}

// ============================================================
// DECODIFICAR HTML
// ============================================================

function decodificarHtml(
    texto = ""
) {
    return String(texto)
        .replace(
            /&amp;/gi,
            "&"
        )
        .replace(
            /&quot;/gi,
            '"'
        )
        .replace(
            /&#39;/gi,
            "'"
        )
        .replace(
            /&apos;/gi,
            "'"
        )
        .replace(
            /&lt;/gi,
            "<"
        )
        .replace(
            /&gt;/gi,
            ">"
        )
        .replace(
            /&#x27;/gi,
            "'"
        )
        .replace(
            /&#x2F;/gi,
            "/"
        )
        .replace(
            /&#160;/gi,
            " "
        )
        .trim();
}

// ============================================================
// LIMPIAR HTML
// ============================================================

function limpiarHtml(
    texto = ""
) {
    return decodificarHtml(
        String(texto)
            .replace(
                /<br\s*\/?>/gi,
                "\n"
            )
            .replace(
                /<script[\s\S]*?<\/script>/gi,
                " "
            )
            .replace(
                /<style[\s\S]*?<\/style>/gi,
                " "
            )
            .replace(
                /<[^>]+>/g,
                " "
            )
            .replace(
                /\s+/g,
                " "
            )
            .trim()
    );
}

// ============================================================
// LIMPIAR NOMBRE STREAMER
// ============================================================

function limpiarNombreStreamer(
    nombre = ""
) {
    let resultado =
        decodificarHtml(
            String(nombre)
        );

    resultado =
        resultado.replace(
            /^.*?tag["']?\s*>\s*/i,
            ""
        );

    resultado =
        resultado.replace(
            /^.*?["']?\s*>\s*/i,
            ""
        );

    resultado =
        resultado.replace(
            /["'].*$/g,
            ""
        );

    return resultado
        .replace(
            /[\r\n\t]+/g,
            " "
        )
        .replace(
            /\s+/g,
            " "
        )
        .trim();
}

// ============================================================
// NORMALIZAR LOGIN
// ============================================================

function normalizarLogin(
    nombre = ""
) {
    return String(nombre)
        .trim()
        .replace(
            /^@/,
            ""
        )
        .toLowerCase();
}

// ============================================================
// ESCAPAR REGEX
// ============================================================

function escapeRegExp(
    texto
) {
    return String(texto).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );
}

// ============================================================
// LIMPIAR URL IMAGEN
// ============================================================

function limpiarUrlImagen(
    url = ""
) {
    let resultado =
        decodificarHtml(
            String(url)
        ).trim();

    if (!resultado) {
        return null;
    }

    resultado =
        resultado
            .replace(
                /^url\(\s*/i,
                ""
            )
            .replace(
                /\s*\)$/i,
                ""
            )
            .replace(
                /^["']|["']$/g,
                ""
            )
            .trim();

    if (
        resultado.startsWith("//")
    ) {
        resultado =
            `https:${resultado}`;
    }

    if (
        resultado.startsWith("/")
    ) {
        resultado =
            `https://twitch.facepunch.com${resultado}`;
    }

    if (
        !/^https?:\/\//i.test(
            resultado
        )
    ) {
        return null;
    }

    return resultado;
}

// ============================================================
// VALIDAR IMAGEN
// ============================================================

function esImagenValida(
    url = ""
) {
    const valor =
        String(url)
            .toLowerCase();

    if (!valor) {
        return false;
    }

    const bloqueadas = [
        "logo",
        "favicon",
        "avatar",
        "profile_image",
        "profileimage",
        "channel_image",
        "channelimage",
        "user_image",
        "userimage",
        "banner",
        "offline",
        "twitch.tv",
        "static-cdn.jtvnw.net",
        "twitch-facepunch"
    ];

    if (
        bloqueadas.some(
            termino =>
                valor.includes(
                    termino
                )
        )
    ) {
        return false;
    }

    return (
        /\.(png|jpg|jpeg|webp|gif)(\?|$)/i.test(
            valor
        ) ||
        valor.includes(
            "/image/"
        ) ||
        valor.includes(
            "steamstatic"
        ) ||
        valor.includes(
            "fastly"
        ) ||
        valor.includes(
            "cloudflare"
        )
    );
}

// ============================================================
// EXTRAER IMAGEN CERCANA
// ============================================================

function extraerImagenCercana(
    bloque,
    index,
    nombreDrop,
    soloImagenDeItem = false
) {
    if (
        !bloque ||
        typeof bloque !==
            "string" ||
        typeof index !==
            "number"
    ) {
        return null;
    }

    const inicio =
        Math.max(
            0,
            index - 2500
        );

    const fin =
        Math.min(
            bloque.length,
            index + 3500
        );

    const zona =
        bloque.slice(
            inicio,
            fin
        );

    const candidatas = [];

    function agregarCandidata(
        rawUrl,
        posicion,
        tipo = "unknown"
    ) {
        const url =
            limpiarUrlImagen(
                rawUrl
            );

        if (
            !url ||
            !esImagenValida(
                url
            )
        ) {
            return;
        }

        const lower =
            url.toLowerCase();

        const esStreamer =
            lower.includes(
                "twitch.tv"
            ) ||
            lower.includes(
                "static-cdn.jtvnw.net"
            ) ||
            lower.includes(
                "profile_image"
            ) ||
            lower.includes(
                "profileimage"
            ) ||
            lower.includes(
                "avatar"
            ) ||
            lower.includes(
                "channel_image"
            ) ||
            lower.includes(
                "channelimage"
            ) ||
            lower.includes(
                "user_image"
            ) ||
            lower.includes(
                "userimage"
            ) ||
            lower.includes(
                "logo"
            ) ||
            lower.includes(
                "banner"
            ) ||
            lower.includes(
                "offline"
            );

        if (esStreamer) {
            return;
        }

        const esEconomy =
            lower.includes(
                "/economy/image/"
            ) ||
            lower.includes(
                "economy/image"
            );

        const esSteam =
            lower.includes(
                "steamstatic"
            ) ||
            lower.includes(
                "community.fastly"
            ) ||
            lower.includes(
                "community.cloudflare"
            ) ||
            lower.includes(
                "steamusercontent"
            );

        const esFacepunch =
            lower.includes(
                "files.facepunch.com"
            );

        const distancia =
            Math.abs(
                (
                    inicio +
                    posicion
                ) -
                index
            );

        candidatas.push({
            url,
            distancia,
            esEconomy,
            esSteam,
            esFacepunch,
            tipo
        });
    }

    const regexImg =
        /<img\b[^>]*?(?:src|data-src|data-original|data-image|data-lazy-src)\s*=\s*["']([^"']+)["'][^>]*>/gi;

    let match;

    while (
        (
            match =
                regexImg.exec(
                    zona
                )
        ) !== null
    ) {
        agregarCandidata(
            match[1],
            match.index,
            "img"
        );
    }

    const regexSrcset =
        /\b(?:srcset|data-srcset)\s*=\s*["']([^"']+)["']/gi;

    while (
        (
            match =
                regexSrcset.exec(
                    zona
                )
        ) !== null
    ) {
        const valores =
            match[1]
                .split(",")
                .map(
                    valor =>
                        valor.trim()
                )
                .filter(Boolean);

        for (
            const valor
            of valores
        ) {
            const partes =
                valor.split(
                    /\s+/
                );

            agregarCandidata(
                partes[0],
                match.index,
                "srcset"
            );
        }
    }

    const regexBackground =
        /background-image\s*:\s*url\(\s*["']?([^"')]+)["']?\s*\)/gi;

    while (
        (
            match =
                regexBackground.exec(
                    zona
                )
        ) !== null
    ) {
        agregarCandidata(
            match[1],
            match.index,
            "background"
        );
    }

    const regexUrl =
        /https?:\/\/[^"'()<>\s]+/gi;

    while (
        (
            match =
                regexUrl.exec(
                    zona
                )
        ) !== null
    ) {
        agregarCandidata(
            match[0],
            match.index,
            "url"
        );
    }

    if (
        !candidatas.length
    ) {
        console.log(
            `⚠️ No se encontró imagen válida para ${nombreDrop}.`
        );

        return null;
    }

    const unicas =
        new Map();

    for (
        const candidata
        of candidatas
    ) {
        const existente =
            unicas.get(
                candidata.url
            );

        if (
            !existente ||
            candidata.distancia <
                existente.distancia
        ) {
            unicas.set(
                candidata.url,
                candidata
            );
        }
    }

    const lista =
        [
            ...unicas.values()
        ];

    if (
        soloImagenDeItem
    ) {
        const imagenesDeItem =
            lista.filter(
                candidata =>
                    candidata.esEconomy ||
                    candidata.esSteam ||
                    candidata.esFacepunch
            );

        if (
            !imagenesDeItem.length
        ) {
            console.log(
                `⚠️ No se encontró imagen de ITEM para Streamer Drop "${nombreDrop}". No se utilizará el avatar del streamer.`
            );

            return null;
        }

        imagenesDeItem.sort(
            (a, b) => {
                if (
                    a.esEconomy !==
                    b.esEconomy
                ) {
                    return a.esEconomy
                        ? -1
                        : 1;
                }

                if (
                    a.esSteam !==
                    b.esSteam
                ) {
                    return a.esSteam
                        ? -1
                        : 1;
                }

                if (
                    a.esFacepunch !==
                    b.esFacepunch
                ) {
                    return a.esFacepunch
                        ? -1
                        : 1;
                }

                return (
                    a.distancia -
                    b.distancia
                );
            }
        );

        const preferida =
            imagenesDeItem[0]?.url ||
            null;

        if (preferida) {
            console.log(
                `🖼️ Imagen de ITEM encontrada para ${nombreDrop}: ${preferida}`
            );
        }

        return preferida;
    }

    lista.sort(
        (a, b) => {
            if (
                a.esEconomy !==
                b.esEconomy
            ) {
                return a.esEconomy
                    ? -1
                    : 1;
            }

            if (
                a.esSteam !==
                b.esSteam
            ) {
                return a.esSteam
                    ? -1
                    : 1;
            }

            if (
                a.esFacepunch !==
                b.esFacepunch
            ) {
                return a.esFacepunch
                    ? -1
                    : 1;
            }

            return (
                a.distancia -
                b.distancia
            );
        }
    );

    const preferida =
        lista[0]?.url ||
        null;

    if (preferida) {
        console.log(
            `🖼️ Imagen encontrada para ${nombreDrop}: ${preferida}`
        );
    }

    return preferida;
}

// ============================================================
// EXTRAER STREAMER DROPS
// ============================================================

function extraerStreamerDrops(
    html
) {
    const resultados = [];

    const inicioMatch =
        html.match(
            /Streamer Drops/i
        );

    if (!inicioMatch) {
        return [];
    }

    const inicio =
        inicioMatch.index;

    const finMatch =
        html.match(
            /Drops Metrics/i
        );

    const fin =
        finMatch
            ? finMatch.index
            : html.length;

    const bloque =
        html.slice(
            inicio,
            fin
        );

    const elementos = [];

    const regexTwitch =
        /<a\b[^>]*href=["']https?:\/\/(?:www\.)?twitch\.tv\/([^"'?#/]+)[^>]*>([\s\S]*?)<\/a>/gi;

    let match;

    while (
        (
            match =
                regexTwitch.exec(
                    bloque
                )
        ) !== null
    ) {
        const login =
            normalizarLogin(
                match[1]
            );

        if (!login) {
            continue;
        }

        let displayName =
            limpiarHtml(
                match[2]
            );

        displayName =
            limpiarNombreStreamer(
                displayName
            );

        const nombresConocidos = {
            geega: "GEEGA",
            ledoo: "LEDOO",
            blooprint: "Blooprint",
            hjune: "hJune",
            hutnik: "Hutnik",
            disguisedtoast: "DisguisedToast",
            peterpark: "peterpark",
            fuslie: "fuslie",
            sven: "Sven",
            abe: "Abe",
            esfandtv: "EsfandTV",
            xchocobars: "xChocoBars",
            ironmouse: "ironmouse",
            willneff: "willneff",
            foolish: "Foolish",
            tinakitten: "TinaKitten",
            cyr: "CYR",
            mrwobblestwitch: "mrwobblestwitch",
            aceu: "aceu",
            zchum: "ZChum",
            fancyorb: "FancyOrb",
            itsryanhiga: "itsRyanHiga",
            welyn: "Welyn"
        };

        if (
            nombresConocidos[login]
        ) {
            displayName =
                nombresConocidos[
                    login
                ];
        }

        elementos.push({
            tipo:
                "streamer",

            login,

            displayName,

            index:
                match.index
        });
    }

    const nombresRecompensas = [
        "Rocket Launcher",
        "Assault Rifle",
        "Semi-automatic Rifle",
        "Double Barrel Shotgun",
        "Boonie Hat",
        "Small Backpack",
        "Furnace",
        "Wooden Door",
        "Large Wood Box",
        "Salvaged Sword",
        "Garage Door",
        "Locker",
        "Metal Facemask",
        "Metal Chestplate",
        "Vagabond Jacket",
        "Tactical Gloves"
    ];

    for (
        const nombre
        of nombresRecompensas
    ) {
        const regex =
            new RegExp(
                escapeRegExp(
                    nombre
                ),
                "i"
            );

        const resultado =
            regex.exec(
                bloque
            );

        if (!resultado) {
            continue;
        }

        const imagen =
            extraerImagenCercana(
                bloque,
                resultado.index,
                nombre,
                true
            );

        elementos.push({
            tipo:
                "drop",

            nombre,

            index:
                resultado.index,

            imagen
        });
    }

    elementos.sort(
        (a, b) =>
            a.index -
            b.index
    );

    let streamersPendientes =
        [];

    for (
        const elemento
        of elementos
    ) {
        if (
            elemento.tipo ===
            "streamer"
        ) {
            if (
                !streamersPendientes.some(
                    streamer =>
                        streamer.login ===
                        elemento.login
                )
            ) {
                streamersPendientes.push(
                    elemento
                );
            }

            continue;
        }

        if (
            elemento.tipo !==
            "drop"
        ) {
            continue;
        }

        const canales =
            streamersPendientes
                .slice(-2)
                .map(
                    streamer => ({
                        login:
                            streamer.login,

                        displayName:
                            streamer.displayName,

                        online:
                            false
                    })
                );

        const textoPosterior =
            limpiarHtml(
                bloque.slice(
                    elemento.index,
                    Math.min(
                        bloque.length,
                        elemento.index +
                            300
                    )
                )
            );

        const horasMatch =
            textoPosterior.match(
                /\b(\d+)\s+Hours?\b/i
            );

        const horas =
            horasMatch
                ? Number(
                    horasMatch[1]
                )
                : 1;

        if (
            canales.length
        ) {
            resultados.push({
                nombre:
                    elemento.nombre,

                horas,

                canales,

                imagen:
                    elemento.imagen ||
                    null
            });
        }

        streamersPendientes =
            [];
    }

    return resultados;
}

// ============================================================
// EXTRAER GENERAL DROPS
// ============================================================

function extraerGeneralDrops(
    html,
    textoPagina
) {
    const generalDrops = [];

    const generalNombres = [
        "Large Wood Box",
        "Auto Turret",
        "Small Box",
        "Pants",
        "Work Boots",
        "Hoodie"
    ];

    for (
        const nombre
        of generalNombres
    ) {
        const regex =
            new RegExp(
                `${escapeRegExp(nombre)}\\s+(\\d+)\\s+Hours?`,
                "i"
            );

        const match =
            regex.exec(
                textoPagina
            );

        if (!match) {
            continue;
        }

        const htmlRegex =
            new RegExp(
                escapeRegExp(nombre),
                "i"
            );

        const htmlMatch =
            htmlRegex.exec(
                html
            );

        let imagen =
            null;

        if (htmlMatch) {
            imagen =
                extraerImagenCercana(
                    html,
                    htmlMatch.index,
                    nombre,
                    false
                );
        }

        generalDrops.push({
            nombre,

            horas:
                Number(
                    match[1]
                ),

            imagen
        });
    }

    return generalDrops;
}

// ============================================================
// FECHAS DE CAMPAÑA
// ============================================================

function convertirFechaCampanaAISO(
    texto
) {
    if (!texto) {
        return null;
    }

    try {
        const limpio =
            String(texto)
                .trim()
                .replace(
                    /\s+at\s+/i,
                    " "
                );

        const fecha =
            new Date(
                limpio
            );

        if (
            Number.isNaN(
                fecha.getTime()
            )
        ) {
            return null;
        }

        const fechaGMT3 =
            new Date(
                fecha.getTime() -
                (
                    3 *
                    60 *
                    60 *
                    1000
                )
            );

        return (
            fechaGMT3
                .toISOString()
                .slice(
                    0,
                    16
                ) +
            "-03:00"
        );

    } catch (error) {
        return null;
    }
}

// ============================================================
// FORMATEAR FECHA
// ============================================================

function formatearFechaCampana(
    texto
) {
    if (!texto) {
        return null;
    }

    try {
        const fecha =
            new Date(
                texto
            );

        if (
            Number.isNaN(
                fecha.getTime()
            )
        ) {
            return texto;
        }

        const fechaGMT3 =
            new Date(
                fecha.getTime() -
                (
                    3 *
                    60 *
                    60 *
                    1000
                )
            );

        const meses = [
            "enero",
            "febrero",
            "marzo",
            "abril",
            "mayo",
            "junio",
            "julio",
            "agosto",
            "septiembre",
            "octubre",
            "noviembre",
            "diciembre"
        ];

        const dia =
            String(
                fechaGMT3.getUTCDate()
            ).padStart(
                2,
                "0"
            );

        const mes =
            meses[
                fechaGMT3.getUTCMonth()
            ];

        const anio =
            fechaGMT3.getUTCFullYear();

        const horas =
            String(
                fechaGMT3.getUTCHours()
            ).padStart(
                2,
                "0"
            );

        const minutos =
            String(
                fechaGMT3.getUTCMinutes()
            ).padStart(
                2,
                "0"
            );

        return (
            `${dia} de ${mes} de ${anio} a las ${horas}:${minutos} GMT-3`
        );

    } catch (error) {
        return String(
            texto
        );
    }
}

// ============================================================
// ESTADO LIVE NOW
// ============================================================

function campanaEstaActiva(
    fechaInicio,
    fechaFin
) {
    try {
        if (
            !fechaInicio ||
            !fechaFin
        ) {
            return false;
        }

        const inicio =
            new Date(
                fechaInicio
            ).getTime();

        const fin =
            new Date(
                fechaFin
            ).getTime();

        const ahora =
            Date.now();

        if (
            Number.isNaN(inicio) ||
            Number.isNaN(fin)
        ) {
            return false;
        }

        return (
            ahora >= inicio &&
            ahora <= fin
        );

    } catch (error) {
        return false;
    }
}

// ============================================================
// CREAR ENCABEZADO CAMPAÑA
// ============================================================

function crearEncabezadoCampana(
    datos
) {
    const activa =
        campanaEstaActiva(
            datos.fechaInicio,
            datos.fechaFin
        );

    let texto =
        "";

    if (activa) {
        texto +=
            "🔴 **LIVE NOW**\n";
    }

    texto +=
        `🎁 **${datos.campaignName || "Twitch Drops"}**`;

    if (
        datos.campaignTheme
    ) {
        texto +=
            `\n🏝️ **${datos.campaignTheme}**`;
    }

    const inicio =
        formatearFechaCampana(
            datos.fechaInicio
        );

    const fin =
        formatearFechaCampana(
            datos.fechaFin
        );

    if (
        inicio &&
        fin
    ) {
        texto +=
            `\n📅 **${inicio} → ${fin}**`;

    } else if (
        fin
    ) {
        texto +=
            `\n📅 **Termina: ${fin}**`;
    }

    return texto;
}

// ============================================================
// OBTENER DROPS FACEPUNCH
// ============================================================

async function obtenerDropsFacepunch() {
    try {
        console.log(
            "🌐 Consultando Drops actuales de Facepunch..."
        );

        const respuesta =
            await axios.get(
                FACEPUNCH_DROPS_URL,
                {
                    timeout:
                        20000,

                    headers: {
                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36",

                        Accept:
                            "text/html,application/xhtml+xml"
                    }
                }
            );

        const html =
            String(
                respuesta.data ||
                    ""
            );

        if (!html) {
            throw new Error(
                "Facepunch devolvió una respuesta vacía."
            );
        }

        const textoPagina =
            limpiarHtml(
                html
            );

        let campaignName =
            "Twitch Drops";

        const campaignMatch =
            textoPagina.match(
                /(Twitch Drops Round \d+ Hosted by [\s\S]*?)(?=\s+Rust Isles|\s+General Drops)/i
            );

        if (campaignMatch) {
            campaignName =
                campaignMatch[1]
                    .replace(
                        /\s+/g,
                        " "
                    )
                    .trim();
        }

        let campaignTheme =
            null;

        const themeMatch =
            textoPagina.match(
                /\b(Rust Isles)\b/i
            );

        if (themeMatch) {
            campaignTheme =
                themeMatch[1];
        }

        let fechaInicio =
            null;

        let fechaFin =
            null;

        const fechaMatch =
            textoPagina.match(
                /([A-Z][a-z]+\s+\d{1,2},\s+\d{4}\s+at\s+\d{1,2}:\d{2}\s+[AP]M\s+UTC)\s*(?:-|–|—|→)\s*([A-Z][a-z]+\s+\d{1,2},\s+\d{4}\s+at\s+\d{1,2}:\d{2}\s+[AP]M\s+UTC)/i
            );

        if (fechaMatch) {
            fechaInicio =
                convertirFechaCampanaAISO(
                    fechaMatch[1]
                );

            fechaFin =
                convertirFechaCampanaAISO(
                    fechaMatch[2]
                );

            console.log(
                `📅 Campaña GMT-3: ${formatearFechaCampana(fechaInicio)} → ${formatearFechaCampana(fechaFin)}`
            );
        }

        const generalDrops =
            extraerGeneralDrops(
                html,
                textoPagina
            );

        const streamerDrops =
            extraerStreamerDrops(
                html
            );

        const logins = [];

        for (
            const drop
            of streamerDrops
        ) {
            for (
                const canal
                of drop.canales ||
                []
            ) {
                logins.push(
                    canal.login
                );
            }
        }

        const online =
            await obtenerStreamersOnline(
                logins
            );

        for (
            const drop
            of streamerDrops
        ) {
            for (
                const canal
                of drop.canales ||
                []
            ) {
                canal.online =
                    online.has(
                        normalizarLogin(
                            canal.login
                        )
                    );
            }

            drop.online =
                (
                    drop.canales ||
                    []
                ).some(
                    canal =>
                        canal.online
                );
        }

        console.log(
            `🎁 Facepunch: ${generalDrops.length} drops generales, ${streamerDrops.length} streamer drops.`
        );

        console.log(
            `🟢 Streamer Drops con al menos un canal online en Rust: ${
                streamerDrops.filter(
                    drop =>
                        drop.online
                ).length
            }`
        );

        const dropsConImagen =
            [
                ...generalDrops,
                ...streamerDrops
            ].filter(
                drop =>
                    !!drop.imagen
            ).length;

        console.log(
            `🖼️ Drops con imagen detectada: ${dropsConImagen}/${generalDrops.length + streamerDrops.length}`
        );

        return {
            campaignName,

            campaignTheme,

            fechaInicio,

            fechaFin,

            generalDrops,

            streamerDrops,

            onlineCount:
                online.size,

            totalStreamers:
                new Set(
                    logins.map(
                        login =>
                            normalizarLogin(
                                login
                            )
                    )
                ).size,

            actualizado:
                new Date()
        };

    } catch (error) {
        console.error(
            "❌ Error obteniendo Drops desde Facepunch:",
            error.response?.status,
            error.response?.data ||
                error.message
        );

        return {
            campaignName:
                "Twitch Drops",

            campaignTheme:
                null,

            fechaInicio:
                null,

            fechaFin:
                null,

            generalDrops:
                [],

            streamerDrops:
                [],

            onlineCount:
                0,

            totalStreamers:
                0,

            actualizado:
                new Date(),

            error:
                true
        };
    }
}

// ============================================================
// FORMATEAR HORAS
// ============================================================

function formatearHoras(
    horas
) {
    const numero =
        Number(
            horas
        );

    if (
        !Number.isFinite(
            numero
        )
    ) {
        return "?";
    }

    if (
        numero ===
        1
    ) {
        return "1 hora";
    }

    return `${numero} horas`;
}

// ============================================================
// FORMATEAR CANALES
// ============================================================

function formatearCanales(
    canales = []
) {
    return canales
        .map(
            canal => {
                const estado =
                    canal.online
                        ? "🟢"
                        : "⚫";

                return (
                    `${estado} [${canal.displayName}](https://www.twitch.tv/${canal.login})`
                );
            }
        )
        .join(
            " • "
        );
}

// ============================================================
// EMBED INDIVIDUAL
// ============================================================

function crearEmbedIndividual(
    drop,
    datos
) {
    const esStreamer =
        drop.tipo ===
        "streamer";

    const embed =
        new EmbedBuilder()
            .setColor(
                esStreamer
                    ? 0x9146ff
                    : 0x3498db
            )
            .setTitle(
                esStreamer
                    ? `🎯 ${drop.nombre}`
                    : `📦 ${drop.nombre}`
            )
            .setDescription(
                `⏱️ **${formatearHoras(drop.horas)}**`
            );

    if (
        esStreamer &&
        Array.isArray(
            drop.canales
        ) &&
        drop.canales.length
    ) {
        embed.addFields({
            name:
                "🎥 Streamer(s)",

            value:
                formatearCanales(
                    drop.canales
                ),

            inline:
                false
        });
    }

    if (
        drop.imagen
    ) {
        embed.setImage(
            drop.imagen
        );
    }

    embed.setFooter({
        text:
            datos.campaignName
                ? `RustLogix • ${datos.campaignName}`
                : "RustLogix • Rust Twitch Drops"
    });

    embed.setTimestamp(
        datos.actualizado ||
            new Date()
    );

    return embed;
}

// ============================================================
// CREAR EMBEDS
// ============================================================

function crearEmbedsDrops(
    datos
) {
    const drops = [];

    for (
        const drop
        of datos.generalDrops ||
        []
    ) {
        drops.push({
            tipo:
                "general",

            nombre:
                drop.nombre,

            horas:
                drop.horas,

            imagen:
                drop.imagen ||
                null,

            canales:
                []
        });
    }

    for (
        const drop
        of datos.streamerDrops ||
        []
    ) {
        drops.push({
            tipo:
                "streamer",

            nombre:
                drop.nombre,

            horas:
                drop.horas,

            imagen:
                drop.imagen ||
                null,

            canales:
                (
                    drop.canales ||
                    []
                ).map(
                    canal => ({
                        login:
                            canal.login,

                        displayName:
                            canal.displayName,

                        online:
                            !!canal.online
                    })
                )
        });
    }

    return drops.map(
        drop =>
            crearEmbedIndividual(
                drop,
                datos
            )
    );
}

// ============================================================
// CREAR GRUPOS
// ============================================================

function crearGruposMensajesDrops(
    datos
) {
    const grupos = [];

    const generalEmbeds = [];
    const streamerEmbeds = [];

    for (
        const drop
        of datos.generalDrops ||
        []
    ) {
        generalEmbeds.push(
            crearEmbedIndividual(
                {
                    tipo:
                        "general",

                    nombre:
                        drop.nombre,

                    horas:
                        drop.horas,

                    imagen:
                        drop.imagen ||
                        null,

                    canales:
                        []
                },
                datos
            )
        );
    }

    for (
        const drop
        of datos.streamerDrops ||
        []
    ) {
        streamerEmbeds.push(
            crearEmbedIndividual(
                {
                    tipo:
                        "streamer",

                    nombre:
                        drop.nombre,

                    horas:
                        drop.horas,

                    imagen:
                        drop.imagen ||
                        null,

                    canales:
                        (
                            drop.canales ||
                            []
                        ).map(
                            canal => ({
                                login:
                                    canal.login,

                                displayName:
                                    canal.displayName,

                                online:
                                    !!canal.online
                            })
                        )
                },
                datos
            )
        );
    }

    if (
        generalEmbeds.length
    ) {
        grupos.push({
            content:
                crearEncabezadoCampana(
                    datos
                ) +
                "\n\n" +
                "📦 **DROPS GENERALES**\n" +
                "Recompensas disponibles en la campaña general de Rust.",

            embeds:
                generalEmbeds.slice(
                    0,
                    10
                )
        });
    }

    for (
        let i = 0;
        i < streamerEmbeds.length;
        i += 10
    ) {
        const grupo =
            streamerEmbeds.slice(
                i,
                i + 10
            );

        grupos.push({
            content:
                i === 0
                    ? "🎯 **DROPS DE STREAMERS ESPECÍFICOS**\n" +
                      "Recompensas exclusivas vinculadas a los streamers indicados."
                    : "🎯 **DROPS DE STREAMERS ESPECÍFICOS — CONTINUACIÓN**",

            embeds:
                grupo
        });
    }

    return grupos;
}

// ============================================================
// EMBED ANTIGUO
// ============================================================

function crearEmbedFacepunchDrops(
    datos
) {
    const embed =
        new EmbedBuilder()
            .setColor(
                0x9146ff
            )
            .setTitle(
                "🎁 Rust Twitch Drops"
            );

    let descripcion =
        crearEncabezadoCampana(
            datos
        );

    embed.setDescription(
        descripcion
    );

    embed.addFields({
        name:
            "📡 Estado de los canales",

        value:
            `🟢 ${datos.onlineCount} streamer(s) online en Rust de ${datos.totalStreamers}.`,

        inline:
            false
    });

    embed.addFields({
        name:
            "ℹ️ Cómo conseguirlos",

        value:
            "Los Drops generales cuentan viendo streams de Rust con Drops Enabled. Los Streamer Drops requieren ver el streamer indicado.",

        inline:
            false
    });

    embed.addFields({
        name:
            "⚠️ Importante",

        value:
            "Twitch solo cuenta un canal activo a la vez. Ver varios canales simultáneamente no acelera el progreso.",

        inline:
            false
    });

    embed.addFields({
        name:
            "⏱️ Progreso",

        value:
            "El progreso individual no se puede consultar desde la API utilizada por RustLogix. Puedes verlo directamente en tu Twitch Drops Inventory.",

        inline:
            false
    });

    embed.setFooter({
        text:
            "RustLogix • Facepunch + Twitch"
    });

    embed.setTimestamp(
        datos.actualizado
    );

    return embed;
}

// ============================================================
// OBTENER RUST DROPS
// ============================================================

async function obtenerRustDrops(
    discordUserId
) {
    if (!discordUserId) {
        throw new Error(
            "Falta el Discord User ID."
        );
    }

    const cuenta =
        await TwitchAccount.findOne({
            discordUserId
        });

    if (!cuenta) {
        return {
            vinculada:
                false,

            tokenValido:
                false,

            cuenta:
                null,

            juego:
                null,

            drops:
                [],

            claimed:
                [],

            fulfilled:
                [],

            facepunch:
                null
        };
    }

    const tokenInfo =
        await obtenerTokenValidoCuenta(
            cuenta,
            true
        );

    if (!tokenInfo.valido) {
        marcarTokenInvalido(
            cuenta
        );

        return {
            vinculada:
                true,

            tokenValido:
                false,

            requiereRevincular:
                !!tokenInfo.requiereRevincular,

            motivoToken:
                tokenInfo.motivo,

            cuenta:
                cuenta.twitchDisplayName ||
                cuenta.twitchLogin,

            twitchLogin:
                cuenta.twitchLogin,

            twitchUserId:
                cuenta.twitchUserId,

            drops:
                [],

            claimed:
                [],

            fulfilled:
                [],

            facepunch:
                null
        };
    }

    limpiarTokenInvalido(
        cuenta
    );

    const facepunch =
        await obtenerDropsFacepunch();

    return {
        vinculada:
            true,

        tokenValido:
            true,

        tokenRenovado:
            !!tokenInfo.renovado,

        cuenta:
            cuenta.twitchDisplayName ||
            cuenta.twitchLogin,

        twitchLogin:
            cuenta.twitchLogin,

        twitchUserId:
            cuenta.twitchUserId,

        juego: {
            id:
                "263490",

            name:
                "Rust"
        },

        drops:
            [],

        claimed:
            [],

        fulfilled:
            [],

        total:
            0,

        facepunch
    };
}

// ============================================================
// EMBED PRINCIPAL
// ============================================================

function crearEmbedRustDrops(
    resultado
) {
    if (
        !resultado.vinculada
    ) {
        return new EmbedBuilder()
            .setColor(
                0xed4245
            )
            .setTitle(
                "🎁 Rust Drops"
            )
            .setDescription(
                "No tienes una cuenta de Twitch vinculada.\n\nUsa **/drops vincular** para conectar tu cuenta."
            )
            .setFooter({
                text:
                    "RustLogix • Twitch Drops"
            });
    }

    if (
        !resultado.tokenValido
    ) {
        const mensaje =
            resultado.requiereRevincular
                ? "⚠️ El token de Twitch ha caducado y no se pudo renovar automáticamente."
                : "⚠️ El token de Twitch ha caducado o ya no es válido.";

        return new EmbedBuilder()
            .setColor(
                0xfee75c
            )
            .setTitle(
                "🎁 Rust Drops"
            )
            .setDescription(
                `Cuenta vinculada: **${resultado.cuenta}**\n\n${mensaje}\n\nVuelve a vincular tu cuenta con **/drops vincular** para obtener un nuevo token.`
            )
            .setFooter({
                text:
                    "RustLogix • Twitch Drops"
            })
            .setTimestamp();
    }

    if (
        !resultado.facepunch ||
        resultado.facepunch.error
    ) {
        return new EmbedBuilder()
            .setColor(
                0xed4245
            )
            .setTitle(
                "🎁 Rust Drops"
            )
            .setDescription(
                `Cuenta Twitch: **${resultado.cuenta}**\n\n❌ No se pudieron obtener los Drops actuales desde Facepunch.\n\nInténtalo nuevamente en unos segundos.`
            )
            .setFooter({
                text:
                    "RustLogix • Twitch Drops"
            })
            .setTimestamp();
    }

    return crearEmbedFacepunchDrops(
        resultado.facepunch
    );
}

// ============================================================
// FUNCIÓN ANTERIOR
// ============================================================

async function obtenerRustDropsEmbed(
    discordUserId
) {
    const resultado =
        await obtenerRustDrops(
            discordUserId
        );

    return crearEmbedRustDrops(
        resultado
    );
}

// ============================================================
// SEPARAR ENTITLEMENTS
// ============================================================

function separarEntitlements(
    entitlements = []
) {
    const claimed = [];
    const fulfilled = [];

    for (
        const entitlement
        of entitlements
    ) {
        const estado =
            String(
                entitlement.fulfillment_status ||
                    ""
            ).toUpperCase();

        if (
            estado ===
            "CLAIMED"
        ) {
            claimed.push(
                entitlement
            );
        }

        if (
            estado ===
            "FULFILLED"
        ) {
            fulfilled.push(
                entitlement
            );
        }
    }

    return {
        claimed,
        fulfilled
    };
}

// ============================================================
// ORDENAR ENTITLEMENTS
// ============================================================

function ordenarPorFecha(
    entitlements = []
) {
    return [
        ...entitlements
    ].sort(
        (a, b) => {
            const fechaA =
                new Date(
                    a.timestamp ||
                        0
                ).getTime();

            const fechaB =
                new Date(
                    b.timestamp ||
                        0
                ).getTime();

            return (
                fechaB -
                fechaA
            );
        }
    );
}

// ============================================================
// OBTENER ENTITLEMENTS RUST
// ============================================================

async function obtenerRustEntitlements(
    accessToken
) {
    const rust =
        await obtenerJuegoRust(
            accessToken
        );

    if (!rust) {
        return {
            juego:
                null,

            entitlements:
                []
        };
    }

    const entitlements =
        await obtenerEntitlementsDrops(
            accessToken,
            rust.id
        );

    return {
        juego:
            rust,

        entitlements
    };
}

// ============================================================
// CREAR CLAVE DE CAMPAÑA
// ============================================================

function crearCampaignKey(
    datos
) {
    const drops = [
        ...(datos.generalDrops ||
            []),

        ...(datos.streamerDrops ||
            [])
    ];

    const texto =
        JSON.stringify(
            drops.map(
                drop => ({
                    tipo:
                        drop.tipo ||
                        (
                            drop.canales?.length
                                ? "streamer"
                                : "general"
                        ),

                    nombre:
                        drop.nombre,

                    horas:
                        drop.horas,

                    canales:
                        (
                            drop.canales ||
                            []
                        )
                            .map(
                                canal =>
                                    String(
                                        canal.login ||
                                            ""
                                    )
                                        .toLowerCase()
                            )
                            .sort()
                })
            )
        );

    return [
        datos.campaignName ||
            "",

        datos.campaignTheme ||
            "",

        datos.fechaInicio ||
            "",

        datos.fechaFin ||
            "",

        texto
    ].join(
        "|"
    );
}

// ============================================================
// CONVERTIR DATOS A GUARDADO
// ============================================================

function convertirDatosAGuardado(
    datos
) {
    const drops = [];

    for (
        const drop
        of datos.generalDrops ||
        []
    ) {
        drops.push({
            tipo:
                "general",

            nombre:
                drop.nombre,

            horas:
                drop.horas,

            imagen:
                drop.imagen ||
                null,

            canales:
                []
        });
    }

    for (
        const drop
        of datos.streamerDrops ||
        []
    ) {
        drops.push({
            tipo:
                "streamer",

            nombre:
                drop.nombre,

            horas:
                drop.horas,

            imagen:
                drop.imagen ||
                null,

            canales:
                (
                    drop.canales ||
                    []
                )
                    .map(
                        canal => ({
                            login:
                                canal.login,

                            displayName:
                                canal.displayName,

                            online:
                                !!canal.online
                        })
                    )
        });
    }

    return drops;
}

// ============================================================
// FECHA DE REVISIÓN
// ============================================================

function obtenerFechaRevision(
    monitor
) {
    return (
        monitor.lastCheckedAt ||
        monitor.ultimaRevision ||
        new Date()
    );
}

function establecerFechaRevision(
    monitor,
    fecha = new Date()
) {
    monitor.ultimaRevision =
        fecha;
}

// ============================================================
// CREADOR
// ============================================================

function obtenerCreador(
    monitor
) {
    return (
        monitor.createdBy ||
        monitor.creadoPor ||
        null
    );
}

function establecerCreador(
    monitor,
    userId
) {
    if (!userId) {
        return;
    }

    monitor.creadoPor =
        userId;
}

// ============================================================
// DATOS DESDE MONITOR
// ============================================================

function datosDesdeMonitor(
    monitor
) {
    const drops =
        Array.isArray(
            monitor.drops
        )
            ? monitor.drops
            : [];

    const streamerDrops =
        drops.filter(
            drop =>
                drop.tipo ===
                "streamer"
        );

    const generalDrops =
        drops.filter(
            drop =>
                drop.tipo ===
                "general"
        );

    const streamersUnicos =
        new Set();

    const streamersOnline =
        new Set();

    for (
        const drop
        of streamerDrops
    ) {
        for (
            const canal
            of drop.canales ||
            []
        ) {
            const login =
                normalizarLogin(
                    canal.login
                );

            if (!login) {
                continue;
            }

            streamersUnicos.add(
                login
            );

            if (
                canal.online
            ) {
                streamersOnline.add(
                    login
                );
            }
        }
    }

    return {
        campaignName:
            monitor.campaignName ||
            "Twitch Drops",

        campaignTheme:
            monitor.campaignTheme ||
            null,

        fechaInicio:
            monitor.fechaInicio ||
            null,

        fechaFin:
            monitor.fechaFin ||
            null,

        actualizado:
            obtenerFechaRevision(
                monitor
            ),

        generalDrops:
            generalDrops.map(
                drop =>
                    drop.toObject
                        ? drop.toObject()
                        : drop
            ),

        streamerDrops:
            streamerDrops.map(
                drop =>
                    drop.toObject
                        ? drop.toObject()
                        : drop
            ),

        onlineCount:
            streamersOnline.size,

        totalStreamers:
            streamersUnicos.size
    };
}

// ============================================================
// EDITAR MENSAJES
// ============================================================

async function editarMensajesMonitor(
    channel,
    monitor
) {
    if (
        !channel ||
        !monitor
    ) {
        return false;
    }

    const datos =
        datosDesdeMonitor(
            monitor
        );

    const grupos =
        crearGruposMensajesDrops(
            datos
        );

    if (!grupos.length) {
        console.warn(
            `⚠️ El monitor ${monitor._id} no tiene mensajes para actualizar.`
        );

        return false;
    }

    const messageIds =
        Array.isArray(
            monitor.messageIds
        )
            ? monitor.messageIds
            : [];

    let todosCorrectos =
        true;

    if (
        messageIds.length !==
        grupos.length
    ) {
        console.log(
            `⚠️ El monitor ${monitor._id} necesita reconstrucción: ${messageIds.length} mensaje(s) guardados / ${grupos.length} necesarios.`
        );

        return false;
    }

    for (
        let i = 0;
        i < messageIds.length;
        i++
    ) {
        const messageId =
            messageIds[i];

        try {
            const mensaje =
                await channel.messages.fetch(
                    messageId
                );

            const grupo =
                grupos[i];

            await mensaje.edit({
                content:
                    grupo.content ||
                    "",

                embeds:
                    grupo.embeds
            });

        } catch (error) {
            todosCorrectos =
                false;

            console.log(
                `⚠️ No se pudo editar mensaje Drops ${messageId}: ${error.message}`
            );
        }
    }

    return todosCorrectos;
}

// ============================================================
// BORRAR MENSAJES
// ============================================================

async function eliminarMensajesMonitor(
    channel,
    monitor
) {
    if (
        !channel ||
        !monitor
    ) {
        return;
    }

    for (
        const messageId
        of monitor.messageIds ||
        []
    ) {
        try {
            const mensaje =
                await channel.messages.fetch(
                    messageId
                );

            await mensaje.delete();

            console.log(
                `🗑️ Mensaje Drops eliminado: ${messageId}`
            );

        } catch (error) {
            console.log(
                `ℹ️ Mensaje Drops ${messageId} ya no estaba disponible.`
            );
        }
    }
}

// ============================================================
// PUBLICAR / ACTUALIZAR MONITOR
// ============================================================

async function publicarDropsEnCanal(
    channel,
    datos,
    monitorExistente = null,
    creadoPor = null
) {
    if (
        !channel ||
        typeof channel.send !==
            "function"
    ) {
        throw new Error(
            "El canal de Discord no es válido."
        );
    }

    const grupos =
        crearGruposMensajesDrops(
            datos
        );

    if (!grupos.length) {
        throw new Error(
            "Facepunch no devolvió Drops para publicar."
        );
    }

    const campaignKey =
        crearCampaignKey(
            datos
        );

    const cantidadMensajesNueva =
        grupos.length;

    let monitor =
        monitorExistente;

    if (
        monitor
    ) {
        const cantidadAnterior =
            monitor.messageIds?.length ||
            0;

        const mismaCampana =
            monitor.campaignKey ===
            campaignKey;

        if (
            mismaCampana &&
            cantidadAnterior ===
            cantidadMensajesNueva
        ) {
            const mensajes = [];
            let todosEncontrados =
                true;

            for (
                const messageId
                of monitor.messageIds
            ) {
                try {
                    const mensaje =
                        await channel.messages.fetch(
                            messageId
                        );

                    mensajes.push(
                        mensaje
                    );

                } catch (error) {
                    todosEncontrados =
                        false;

                    console.log(
                        `⚠️ No se pudo recuperar mensaje Drops ${messageId}: ${error.message}`
                    );
                }
            }

            if (
                todosEncontrados &&
                mensajes.length ===
                    monitor.messageIds.length
            ) {
                for (
                    let i = 0;
                    i < mensajes.length;
                    i++
                ) {
                    const grupo =
                        grupos[i];

                    await mensajes[i].edit({
                        content:
                            grupo.content ||
                            "",

                        embeds:
                            grupo.embeds
                    });
                }

                monitor.campaignName =
                    datos.campaignName;

                monitor.campaignTheme =
                    datos.campaignTheme;

                monitor.fechaInicio =
                    datos.fechaInicio;

                monitor.fechaFin =
                    datos.fechaFin;

                monitor.drops =
                    convertirDatosAGuardado(
                        datos
                    );

                establecerFechaRevision(
                    monitor
                );

                monitor.active =
                    true;

                establecerCreador(
                    monitor,
                    creadoPor ||
                        obtenerCreador(
                            monitor
                        )
                );

                await monitor.save();

                console.log(
                    `🔄 Drops actualizados en ${channel.id} sin duplicar mensajes.`
                );

                return monitor;
            }
        }

        console.log(
            `♻️ Reconstruyendo mensajes Twitch Drops en ${channel.id}.`
        );

        await eliminarMensajesMonitor(
            channel,
            monitor
        );

        // IMPORTANTE:
        // Al cambiar de campaña, se reemplaza por completo
        // el contenido anterior para evitar arrastrar
        // streamers de la campaña anterior.
        monitor.messageIds = [];
        monitor.drops = [];
        monitor.campaignKey =
            null;
    }

    const messageIds = [];

    for (
        let i = 0;
        i < grupos.length;
        i++
    ) {
        const grupo =
            grupos[i];

        const mensaje =
            await channel.send({
                content:
                    grupo.content ||
                    "",

                embeds:
                    grupo.embeds
            });

        messageIds.push(
            mensaje.id
        );

        console.log(
            `🎁 Mensaje Drops publicado: ${mensaje.id} (${grupo.embeds.length} embeds)`
        );
    }

    if (!monitor) {
        monitor =
            new RustDropsMonitor();

        monitor.guildId =
            channel.guild.id;

        monitor.channelId =
            channel.id;
    }

    monitor.guildId =
        channel.guild.id;

    monitor.channelId =
        channel.id;

    monitor.messageIds =
        messageIds;

    monitor.campaignKey =
        campaignKey;

    monitor.campaignName =
        datos.campaignName;

    monitor.campaignTheme =
        datos.campaignTheme;

    monitor.fechaInicio =
        datos.fechaInicio;

    monitor.fechaFin =
        datos.fechaFin;

    monitor.drops =
        convertirDatosAGuardado(
            datos
        );

    establecerFechaRevision(
        monitor
    );

    monitor.active =
        true;

    establecerCreador(
        monitor,
        creadoPor ||
            obtenerCreador(
                monitor
            )
    );

    await monitor.save();

    console.log(
        `💾 Monitor Twitch Drops guardado para ${channel.guild.name} / #${channel.name}`
    );

    console.log(
        `💾 ${messageIds.length} mensaje(s) guardado(s) en MongoDB.`
    );

    return monitor;
}

// ============================================================
// PUBLICAR DESDE DISCORD
// ============================================================

async function publicarRustDrops(
    interaction
) {
    const resultado =
        await obtenerRustDrops(
            interaction.user.id
        );

    if (
        !resultado.vinculada
    ) {
        return {
            ok:
                false,

            motivo:
                "NO_VINCULADA"
        };
    }

    if (
        !resultado.tokenValido
    ) {
        return {
            ok:
                false,

            motivo:
                resultado.requiereRevincular
                    ? "TOKEN_REQUIERE_REVINCULAR"
                    : "TOKEN_INVALIDO"
        };
    }

    if (
        !resultado.facepunch ||
        resultado.facepunch.error
    ) {
        return {
            ok:
                false,

            motivo:
                "FACEPUNCH_ERROR"
        };
    }

    if (
        !interaction.channel
    ) {
        return {
            ok:
                false,

            motivo:
                "CANAL_INVALIDO"
        };
    }

    if (
        !interaction.guildId
    ) {
        return {
            ok:
                false,

            motivo:
                "SOLO_SERVIDOR"
        };
    }

    const channel =
        interaction.channel;

    let monitor =
        await RustDropsMonitor.findOne({
            guildId:
                interaction.guildId,

            channelId:
                channel.id,

            active:
                true
        });

    monitor =
        await publicarDropsEnCanal(
            channel,
            resultado.facepunch,
            monitor,
            interaction.user.id
        );

    return {
        ok:
            true,

        monitor,

        cantidadDrops:
            monitor.drops.length,

        cantidadMensajes:
            monitor.messageIds.length
    };
}

// ============================================================
// IDENTIFICADOR ENTITLEMENT
// ============================================================

function obtenerClaveEntitlement(
    entitlement
) {
    if (!entitlement) {
        return null;
    }

    if (
        entitlement.id
    ) {
        return String(
            entitlement.id
        );
    }

    return [
        entitlement.benefit_id ||
            "",

        entitlement.timestamp ||
            ""
    ].join(
        "|"
    );
}

// ============================================================
// ESTADO GUARDADO
// ============================================================

function obtenerDropsEstado(
    cuenta
) {
    if (
        !cuenta ||
        !cuenta.dropsEstado
    ) {
        return {};
    }

    if (
        typeof cuenta.dropsEstado !==
            "object" ||
        Array.isArray(
            cuenta.dropsEstado
        )
    ) {
        return {};
    }

    return {
        ...cuenta.dropsEstado
    };
}

// ============================================================
// ENVIAR DM DROP COMPLETADO
// ============================================================

async function enviarDMDeDropCompletado(
    client,
    cuenta,
    entitlement
) {
    if (
        !client ||
        !cuenta ||
        !entitlement
    ) {
        return false;
    }

    if (
        cuenta.notificacionesActivas ===
        false
    ) {
        console.log(
            `🔕 Notificaciones desactivadas para ${cuenta.twitchLogin || cuenta.twitchUserId}.`
        );

        return false;
    }

    if (!cuenta.discordUserId) {
        console.warn(
            "⚠️ La cuenta Twitch no tiene discordUserId."
        );

        return false;
    }

    try {
        const usuario =
            await client.users.fetch(
                cuenta.discordUserId
            );

        if (!usuario) {
            console.warn(
                `⚠️ No se pudo obtener usuario Discord ${cuenta.discordUserId}.`
            );

            return false;
        }

        const embed =
            new EmbedBuilder()
                .setColor(
                    0x9146ff
                )
                .setTitle(
                    "🎁 ¡Drop de Rust completado!"
                )
                .setDescription(
                    "Tu Drop de Twitch ha llegado al **100%** y Twitch lo ha marcado como **FULFILLED**."
                )
                .addFields({
                    name:
                        "🎮 Juego",

                    value:
                        "Rust",

                    inline:
                        true
                })
                .addFields({
                    name:
                        "📺 Cuenta Twitch",

                    value:
                        cuenta.twitchDisplayName ||
                        cuenta.twitchLogin ||
                        "Cuenta vinculada",

                    inline:
                        true
                });

        if (
            entitlement.benefit_id
        ) {
            embed.addFields({
                name:
                    "🆔 Benefit ID",

                value:
                    String(
                        entitlement.benefit_id
                    ),

                inline:
                    false
            });
        }

        if (
            entitlement.timestamp
        ) {
            const fecha =
                new Date(
                    entitlement.timestamp
                );

            if (
                !Number.isNaN(
                    fecha.getTime()
                )
            ) {
                embed.addFields({
                    name:
                        "⏰ Completado",

                    value:
                        `<t:${Math.floor(fecha.getTime() / 1000)}:F>`,

                    inline:
                        false
                });
            }
        }

        embed.setFooter({
            text:
                "RustLogix • Twitch Drops"
        });

        embed.setTimestamp();

        await usuario.send({
            embeds: [
                embed
            ]
        });

        console.log(
            `📩 DM enviado a ${cuenta.discordUserId} por Drop completado.`
        );

        return true;

    } catch (error) {
        console.error(
            `❌ No se pudo enviar DM de Drop a ${cuenta.discordUserId}:`,
            error.code ||
                error.message
        );

        if (
            error.code ===
            50007
        ) {
            console.warn(
                `⚠️ El usuario ${cuenta.discordUserId} tiene los DMs cerrados.`
            );
        }

        return false;
    }
}

// ============================================================
// PROCESAR ENTITLEMENTS
// ============================================================

async function procesarEntitlementsCuenta(
    client,
    cuenta,
    entitlements,
    tokenRenovado = false
) {
    const estados =
        obtenerDropsEstado(
            cuenta
        );

    let notificados =
        0;

    let cambios =
        false;

    for (
        const entitlement
        of entitlements
    ) {
        const clave =
            obtenerClaveEntitlement(
                entitlement
            );

        if (!clave) {
            continue;
        }

        const estadoActual =
            String(
                entitlement.fulfillment_status ||
                    ""
            ).toUpperCase();

        if (!estadoActual) {
            continue;
        }

        const estadoAnterior =
            estados[clave];

        if (!estadoAnterior) {
            estados[clave] = {
                status:
                    estadoActual,

                benefitId:
                    entitlement.benefit_id ||
                    null,

                timestamp:
                    entitlement.timestamp ||
                    null,

                notified:
                    false,

                updatedAt:
                    new Date().toISOString()
            };

            cambios =
                true;

            console.log(
                `📝 Nuevo entitlement registrado para ${cuenta.twitchLogin || cuenta.twitchUserId}: ${estadoActual}`
            );

            continue;
        }

        const estadoAnteriorTexto =
            typeof estadoAnterior ===
                "string"
                ? estadoAnterior
                : String(
                    estadoAnterior.status ||
                        ""
                ).toUpperCase();

        const yaNotificado =
            typeof estadoAnterior ===
                "object" &&
            estadoAnterior.notified ===
                true;

        if (
            estadoAnteriorTexto !==
                "FULFILLED" &&
            estadoActual ===
                "FULFILLED" &&
            !yaNotificado
        ) {
            console.log(
                `💯 Drop completado detectado para ${cuenta.twitchLogin || cuenta.twitchUserId}.`
            );

            const enviado =
                await enviarDMDeDropCompletado(
                    client,
                    cuenta,
                    entitlement
                );

            estados[clave] = {
                ...(typeof estadoAnterior ===
                    "object"
                    ? estadoAnterior
                    : {}),

                status:
                    "FULFILLED",

                benefitId:
                    entitlement.benefit_id ||
                    null,

                timestamp:
                    entitlement.timestamp ||
                    null,

                notified:
                    enviado,

                ...(enviado
                    ? {
                        notifiedAt:
                            new Date().toISOString()
                    }
                    : {}),

                updatedAt:
                    new Date().toISOString()
            };

            cambios =
                true;

            if (enviado) {
                notificados++;
            }

            continue;
        }

        if (
            estadoAnteriorTexto !==
            estadoActual
        ) {
            estados[clave] = {
                ...(typeof estadoAnterior ===
                    "object"
                    ? estadoAnterior
                    : {}),

                status:
                    estadoActual,

                benefitId:
                    entitlement.benefit_id ||
                    null,

                timestamp:
                    entitlement.timestamp ||
                    null,

                updatedAt:
                    new Date().toISOString()
            };

            cambios =
                true;

            console.log(
                `🔄 Estado Drop ${cuenta.twitchLogin || cuenta.twitchUserId}: ${estadoAnteriorTexto || "DESCONOCIDO"} → ${estadoActual}`
            );
        }
    }

    cuenta.dropsEstado =
        estados;

    cuenta.ultimaRevisionDrops =
        new Date();

    await cuenta.save();

    return {
        revisado:
            true,

        notificados,

        cambios,

        tokenRenovado
    };
}

// ============================================================
// REVISAR DROPS DE UNA CUENTA
// ============================================================

async function revisarEntitlementsCuenta(
    client,
    cuenta
) {
    if (
        !client ||
        !cuenta
    ) {
        return {
            revisado:
                false,

            notificados:
                0
        };
    }

    if (
        cuenta.notificacionesActivas ===
        false
    ) {
        return {
            revisado:
                false,

            notificados:
                0
        };
    }

    if (
        tokenEstaEnCooldown(
            cuenta
        )
    ) {
        console.log(
            `⏳ Token inválido de ${cuenta.twitchLogin || cuenta.twitchUserId} en cooldown. Se volverá a comprobar más adelante.`
        );

        return {
            revisado:
                false,

            notificados:
                0,

            tokenInvalido:
                true,

            enCooldown:
                true
        };
    }

    const tokenInfo =
        await obtenerTokenValidoCuenta(
            cuenta,
            true
        );

    if (!tokenInfo.valido) {
        marcarTokenInvalido(
            cuenta
        );

        console.warn(
            `⚠️ No se pudieron revisar los Drops de ${cuenta.twitchLogin || cuenta.twitchUserId}: ${tokenInfo.motivo || "token inválido"}.`
        );

        return {
            revisado:
                false,

            notificados:
                0,

            tokenInvalido:
                true,

            requiereRevincular:
                !!tokenInfo.requiereRevincular,

            motivo:
                tokenInfo.motivo
        };
    }

    limpiarTokenInvalido(
        cuenta
    );

    let tokenUsado =
        cuenta.accessToken;

    let tokenRenovado =
        !!tokenInfo.renovado;

    try {
        const resultado =
            await obtenerRustEntitlements(
                tokenUsado
            );

        if (
            resultado &&
            resultado.juego
        ) {
            limpiarAvisoOrganizacion(
                cuenta
            );

            const entitlements =
                Array.isArray(
                    resultado.entitlements
                )
                    ? resultado.entitlements
                    : [];

            return await procesarEntitlementsCuenta(
                client,
                cuenta,
                entitlements,
                tokenRenovado
            );
        }

        return {
            revisado:
                false,

            notificados:
                0
        };

    } catch (error) {
        const status =
            error.response?.status;

        if (
            esErrorOrganizacionEntitlements(
                error
            ) ||
            error.entitlementsNoDisponibles
        ) {
            avisarErrorOrganizacion(
                cuenta
            );

            return {
                revisado:
                    false,

                notificados:
                    0,

                entitlementsNoDisponibles:
                    true,

                motivo:
                    "CLIENTE_SIN_ORGANIZACION"
            };
        }

        if (
            status ===
            401
        ) {
            console.warn(
                `⚠️ Twitch rechazó el access token de ${cuenta.twitchLogin || cuenta.twitchUserId}.`
            );

            const renovacion =
                await renovarAccessTokenTwitch(
                    cuenta
                );

            if (
                !renovacion.ok
            ) {
                marcarTokenInvalido(
                    cuenta
                );

                console.warn(
                    `⚠️ No se pudo renovar el token de ${cuenta.twitchLogin || cuenta.twitchUserId}.`
                );

                return {
                    revisado:
                        false,

                    notificados:
                        0,

                    tokenInvalido:
                        true,

                    requiereRevincular:
                        !!renovacion.requiereRevincular,

                    motivo:
                        renovacion.motivo
                };
            }

            try {
                console.log(
                    `🔁 Reintentando consulta de entitlements con el nuevo token de ${cuenta.twitchLogin || cuenta.twitchUserId}...`
                );

                const retry =
                    await obtenerRustEntitlements(
                        cuenta.accessToken
                    );

                if (
                    retry &&
                    retry.juego
                ) {
                    limpiarTokenInvalido(
                        cuenta
                    );

                    limpiarAvisoOrganizacion(
                        cuenta
                    );

                    const entitlements =
                        Array.isArray(
                            retry.entitlements
                        )
                            ? retry.entitlements
                            : [];

                    console.log(
                        `✅ Entitlements recuperados después de renovar el token de ${cuenta.twitchLogin || cuenta.twitchUserId}.`
                    );

                    return await procesarEntitlementsCuenta(
                        client,
                        cuenta,
                        entitlements,
                        true
                    );
                }

                return {
                    revisado:
                        false,

                    notificados:
                        0,

                    tokenRenovado:
                        true
                };

            } catch (retryError) {
                const retryStatus =
                    retryError.response?.status;

                if (
                    esErrorOrganizacionEntitlements(
                        retryError
                    ) ||
                    retryError.entitlementsNoDisponibles
                ) {
                    avisarErrorOrganizacion(
                        cuenta
                    );

                    return {
                        revisado:
                            false,

                        notificados:
                            0,

                        tokenRenovado:
                            true,

                        entitlementsNoDisponibles:
                            true,

                        motivo:
                            "CLIENTE_SIN_ORGANIZACION"
                    };
                }

                console.error(
                    "❌ El nuevo token tampoco permitió obtener entitlements:",
                    retryStatus ||
                        retryError.message
                );

                marcarTokenInvalido(
                    cuenta
                );

                return {
                    revisado:
                        false,

                    notificados:
                        0,

                    tokenInvalido:
                        true,

                    requiereRevincular:
                        retryStatus ===
                        400 ||
                        retryStatus ===
                        401
                };
            }
        }

        throw error;
    }
}

// ============================================================
// REVISAR TODAS LAS CUENTAS
// ============================================================

async function revisarEntitlementsAutomaticos(
    client
) {
    if (!client) {
        return;
    }

    try {
        const cuentas =
            await TwitchAccount.find({
                notificacionesActivas:
                    true
            });

        if (
            !cuentas.length
        ) {
            console.log(
                "🎁 No hay cuentas Twitch con notificaciones activas."
            );

            return;
        }

        console.log(
            `🎁 Revisando Drops de ${cuentas.length} cuenta(s) Twitch...`
        );

        let totalNotificados =
            0;

        for (
            const cuenta
            of cuentas
        ) {
            try {
                const resultado =
                    await revisarEntitlementsCuenta(
                        client,
                        cuenta
                    );

                totalNotificados +=
                    resultado.notificados ||
                    0;

            } catch (error) {
                const status =
                    error.response?.status;

                if (
                    esErrorOrganizacionEntitlements(
                        error
                    ) ||
                    error.entitlementsNoDisponibles
                ) {
                    avisarErrorOrganizacion(
                        cuenta
                    );

                    continue;
                }

                if (
                    status ===
                    401
                ) {
                    console.warn(
                        `⚠️ Token Twitch inválido de ${cuenta.twitchLogin || cuenta.twitchUserId}.`
                    );

                    const renovacion =
                        await renovarAccessTokenTwitch(
                            cuenta
                        );

                    if (
                        renovacion.ok
                    ) {
                        limpiarTokenInvalido(
                            cuenta
                        );

                        console.log(
                            `✅ Token de ${cuenta.twitchLogin || cuenta.twitchUserId} renovado durante la revisión automática.`
                        );

                    } else {
                        marcarTokenInvalido(
                            cuenta
                        );

                        console.warn(
                            `⚠️ ${cuenta.twitchLogin || cuenta.twitchUserId} requiere revinculación.`
                        );
                    }

                } else {
                    console.error(
                        `❌ Error revisando entitlements de ${cuenta.twitchLogin || cuenta.twitchUserId}:`,
                        status ||
                            error.message
                    );
                }
            }
        }

        if (
            totalNotificados >
            0
        ) {
            console.log(
                `📩 ${totalNotificados} notificación(es) de Drop enviada(s) por DM.`
            );
        } else {
            console.log(
                "📩 No hay nuevos Drops completados para notificar."
            );
        }

    } catch (error) {
        console.error(
            "❌ Error general revisando entitlements Twitch:",
            error
        );
    }
}
// ============================================================
// ENVIAR AVISO STREAMER ONLINE EN RUST
// ============================================================

async function enviarAvisoStreamerOnlineRust(
    channel,
    streamers
) {
    if (
        !channel ||
        typeof channel.send !==
            "function" ||
        !Array.isArray(streamers) ||
        !streamers.length
    ) {
        return false;
    }

    const unicos =
        new Map();

    for (
        const streamer
        of streamers
    ) {
        const login =
            normalizarLogin(
                streamer.login
            );

        if (!login) {
            continue;
        }

        if (
            !unicos.has(
                login
            )
        ) {
            unicos.set(
                login,
                {
                    login,

                    displayName:
                        streamer.displayName ||
                        streamer.login ||
                        login
                }
            );
        }
    }

    if (
        !unicos.size
    ) {
        return false;
    }

    const lista =
        [
            ...unicos.values()
        ];

    const lineas =
        lista.map(
            streamer =>
                `🟢 **[${streamer.displayName}](https://www.twitch.tv/${streamer.login})** está **ONLINE EN RUST**.`
        );

    try {
        await channel.send({
            content:
                "🎥 **Streamer Drops disponibles ahora mismo**\n\n" +
                lineas.join(
                    "\n"
                ) +
                "\n\n🎁 Puedes conseguir sus Drops de Twitch mientras estén transmitiendo Rust."
        });

        console.log(
            `📩 Aviso de streamer(s) ONLINE EN RUST enviado en ${channel.id}: ${lista.map(streamer => streamer.login).join(", ")}`
        );

        return true;

    } catch (error) {
        console.error(
            `❌ No se pudo enviar el aviso de streamer(s) ONLINE EN RUST en ${channel.id}:`,
            error.message
        );

        return false;
    }
}

// ============================================================
// REVISAR MONITORES AUTOMÁTICOS
// ============================================================

async function revisarDropsAutomaticos(
    client
) {
    if (
        dropsRevisando
    ) {
        console.log(
            "⏳ Revisión Twitch Drops anterior todavía ejecutándose..."
        );

        return;
    }

    dropsRevisando =
        true;

    try {
        // ========================================================
        // PRIMERO: DMS DE DROPS COMPLETADOS
        // ========================================================

        try {
            await revisarEntitlementsAutomaticos(
                client
            );

        } catch (error) {
            console.error(
                "❌ Error revisando notificaciones de Drops:",
                error
            );
        }

        // ========================================================
        // SEGUNDO: ACTUALIZAR EMBEDS
        // ========================================================

        const monitores =
            await RustDropsMonitor.find({
                active:
                    true
            });

        if (
            !monitores.length
        ) {
            console.log(
                "🎁 No hay monitores Twitch Drops activos."
            );

            return;
        }

        console.log(
            `🔎 Revisando ${monitores.length} monitor(es) de Twitch Drops...`
        );

        const datos =
            await obtenerDropsFacepunch();

        if (
            !datos ||
            datos.error
        ) {
            console.log(
                "⚠️ No se pudo actualizar Twitch Drops esta ronda."
            );

            return;
        }

        const campaignKey =
            crearCampaignKey(
                datos
            );

        for (
            const monitor
            of monitores
        ) {
            try {
                let guild;

                try {
                    guild =
                        await client.guilds.fetch(
                            monitor.guildId
                        );

                } catch (error) {
                    console.log(
                        `⚠️ No se pudo obtener guild ${monitor.guildId}: ${error.message}`
                    );

                    continue;
                }

                if (!guild) {
                    continue;
                }

                let channel;

                try {
                    channel =
                        await guild.channels.fetch(
                            monitor.channelId
                        );

                } catch (error) {
                    console.log(
                        `⚠️ No se pudo obtener canal ${monitor.channelId}: ${error.message}`
                    );

                    continue;
                }

                if (
                    !channel ||
                    typeof channel.send !==
                        "function"
                ) {
                    console.log(
                        `⚠️ Canal de Drops no disponible: ${monitor.channelId}`
                    );

                    continue;
                }

                // ==================================================
                // CAMPAÑA CAMBIÓ
                // ==================================================

                if (
                    monitor.campaignKey !==
                    campaignKey
                ) {
                    console.log(
                        `🆕 Nueva campaña de Twitch Drops detectada para ${guild.name}.`
                    );

                    await publicarDropsEnCanal(
                        channel,
                        datos,
                        monitor,
                        obtenerCreador(
                            monitor
                        )
                    );

                    continue;
                }

                // ==================================================
                // ACTUALIZAR SOLO ESTADOS
                // ==================================================

                const estadosActuales =
                    new Map();

                for (
                    const drop
                    of datos.streamerDrops ||
                    []
                ) {
                    for (
                        const canal
                        of drop.canales ||
                        []
                    ) {
                        const login =
                            normalizarLogin(
                                canal.login
                            );

                        if (!login) {
                            continue;
                        }

                        estadosActuales.set(
                            login,
                            {
                                online:
                                    !!canal.online,

                                displayName:
                                    canal.displayName ||
                                    canal.login ||
                                    login
                            }
                        );
                    }
                }

                let huboCambios =
                    false;

                const streamersVolvieronARust =
                    new Map();

                const monitorDrops =
                    Array.isArray(
                        monitor.drops
                    )
                        ? monitor.drops
                        : [];

                for (
                    const drop
                    of monitorDrops
                ) {
                    if (
                        drop.tipo !==
                        "streamer"
                    ) {
                        continue;
                    }

                    for (
                        const canal
                        of drop.canales ||
                        []
                    ) {
                        const login =
                            normalizarLogin(
                                canal.login
                            );

                        if (!login) {
                            continue;
                        }

                        const estadoActual =
                            estadosActuales.get(
                                login
                            );

                        const nuevoEstado =
                            estadoActual
                                ? !!estadoActual.online
                                : false;

                        const estadoAnterior =
                            !!canal.online;

                        if (
                            estadoAnterior !==
                            nuevoEstado
                        ) {
                            console.log(
                                `📡 ${canal.displayName}: ${estadoAnterior ? "ONLINE EN RUST" : "OFFLINE"} → ${nuevoEstado ? "ONLINE EN RUST" : "OFFLINE / NO RUST"}`
                            );

                            // Guardamos SIEMPRE el estado real.
                            //
                            // Esto es importante porque si pasa:
                            //
                            // ONLINE EN RUST
                            //       ↓
                            // OFFLINE / OTRO JUEGO
                            //
                            // no modificamos Discord, pero sí guardamos
                            // false para poder detectar después:
                            //
                            // OFFLINE
                            //       ↓
                            // ONLINE EN RUST
                            canal.online =
                                nuevoEstado;

                            // ==================================================
                            // OFFLINE / NO RUST → ONLINE EN RUST
                            // ==================================================

                            if (
                                !estadoAnterior &&
                                nuevoEstado
                            ) {
                                huboCambios =
                                    true;

                                if (
                                    !streamersVolvieronARust.has(
                                        login
                                    )
                                ) {
                                    streamersVolvieronARust.set(
                                        login,
                                        {
                                            login,

                                            displayName:
                                                estadoActual.displayName ||
                                                canal.displayName ||
                                                canal.login ||
                                                login
                                        }
                                    );
                                }

                                console.log(
                                    `🟢 ${canal.displayName} volvió a ONLINE EN RUST. Se actualizará el mismo embed y se enviará un aviso nuevo.`
                                );
                            }

                            // ==================================================
                            // ONLINE EN RUST → OFFLINE / NO RUST
                            // ==================================================

                            if (
                                estadoAnterior &&
                                !nuevoEstado
                            ) {
                                console.log(
                                    `⚫ ${canal.displayName} dejó de estar ONLINE EN RUST. Se guarda el estado, pero NO se modifica el embed ni se envía aviso.`
                                );
                            }
                        }
                    }
                }

                establecerFechaRevision(
                    monitor
                );

                // ==================================================
                // SOLO SI VOLVIÓ A RUST:
                //
                // 1. Editamos el embed existente.
                // 2. Enviamos un mensaje NUEVO avisando.
                // ==================================================

                if (
                    huboCambios
                ) {
                    console.log(
                        `🔄 Actualizando estados Twitch Drops en ${guild.name}.`
                    );

                    const actualizado =
                        await editarMensajesMonitor(
                            channel,
                            monitor
                        );

                    if (
                        !actualizado
                    ) {
                        console.log(
                            `⚠️ Algunos mensajes del monitor ${monitor._id} no pudieron actualizarse.`
                        );
                    }

                    if (
                        streamersVolvieronARust.size
                    ) {
                        await enviarAvisoStreamerOnlineRust(
                            channel,
                            [
                                ...streamersVolvieronARust.values()
                            ]
                        );
                    }
                }

                // ==================================================
                // GUARDAR ESTADO
                //
                // Esto se hace también cuando pasó a OFFLINE/NO RUST.
                // ==================================================

                await monitor.save();

            } catch (error) {
                console.error(
                    `❌ Error revisando monitor Drops ${monitor.guildId}/${monitor.channelId}:`,
                    error.message
                );
            }
        }

    } catch (error) {
        console.error(
            "❌ Error general revisando Twitch Drops:",
            error
        );

    } finally {
        dropsRevisando =
            false;
    }
}

// ============================================================
// INICIAR SISTEMA AUTOMÁTICO
// ============================================================

function iniciarDropsAutomaticos(
    client
) {
    if (
        dropsAutomaticosIniciados
    ) {
        console.log(
            "⚠️ Sistema automático Twitch Drops ya estaba iniciado."
        );

        return;
    }

    if (!client) {
        console.error(
            "❌ No se puede iniciar Twitch Drops automático: falta el cliente Discord."
        );

        return;
    }

    dropsAutomaticosIniciados =
        true;

    console.log(
        "🎁 Sistema automático Twitch Drops iniciado cada 60 segundos."
    );

    setTimeout(
        async () => {
            try {
                await revisarDropsAutomaticos(
                    client
                );

            } catch (error) {
                console.error(
                    "❌ Error primera revisión Twitch Drops:",
                    error
                );
            }
        },
        5000
    );

    setInterval(
        async () => {
            try {
                await revisarDropsAutomaticos(
                    client
                );

            } catch (error) {
                console.error(
                    "❌ Error revisión automática Twitch Drops:",
                    error
                );
            }
        },
        INTERVALO_DROPS
    );
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    validarToken,

    renovarAccessTokenTwitch,

    obtenerTokenValidoCuenta,

    obtenerJuegoRust,

    obtenerEntitlementsDrops,

    obtenerRustEntitlements,

    separarEntitlements,

    ordenarPorFecha,

    obtenerRustDrops,

    crearEmbedRustDrops,

    obtenerRustDropsEmbed,

    obtenerDropsFacepunch,

    obtenerStreamersOnline,

    crearEmbedsDrops,

    publicarRustDrops,

    revisarDropsAutomaticos,

    revisarEntitlementsAutomaticos,

    iniciarDropsAutomaticos

};