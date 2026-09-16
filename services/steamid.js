const axios = require("axios");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const STEAMID_API_URL = "https://steamid.uk/api";

const REQUEST_TIMEOUT = 30000;

// =====================================================
// UTILIDADES
// =====================================================

function validarSteamID64(steamId) {
    return /^\d{17}$/.test(String(steamId || "").trim());
}

// =====================================================
// CONVERSIÓN STEAMID
// =====================================================

function convertirSteamIDs(steamId64) {

    const id = BigInt(steamId64);

    // Steam3 Account ID
    const accountId = id - 76561197960265728n;

    // Steam2
    const steam2Universe = 0;
    const steam2AuthServer = accountId % 2n;
    const steam2AccountNumber = accountId / 2n;

    const steam2 =
        `STEAM_${steam2Universe}:` +
        `${steam2AuthServer}:` +
        `${steam2AccountNumber}`;

    // Steam3
    const steam3 =
        `[U:1:${accountId}]`;

    return {
        steam2,
        steam3,
        accountId: accountId.toString()
    };
}

// =====================================================
// CSGO FRIEND ID
// =====================================================

function convertirCSGOFriendID(steamId64) {

    try {

        const id = BigInt(steamId64);

        const accountId =
            id - 76561197960265728n;

        const value =
            accountId.toString();

        if (!value) {
            return "No disponible";
        }

        /*
         * SteamID.uk muestra el CSGO Friend ID
         * en formato de grupos alfanuméricos.
         *
         * El valor puede venir directamente desde
         * la API. Esta función solamente actúa como
         * fallback si la API no lo devuelve.
         */

        return "No disponible";

    } catch {

        return "No disponible";
    }
}

// =====================================================
// OBTENER DATOS STEAMID.UK
// =====================================================

async function getSteamIDData(steamId64) {

    if (!validarSteamID64(steamId64)) {

        throw new Error(
            "SteamID64 inválido."
        );
    }

    const apiKey =
        process.env.STEAMID_API_KEY ||
        process.env.STEAMIDUK_API_KEY ||
        process.env.STEAMID_KEY;

    if (!apiKey) {

        throw new Error(
            "No existe STEAMID_API_KEY en las variables de entorno."
        );
    }

    console.log(
        `[SteamID.uk] Consultando ${steamId64}`
    );

    try {

        const response =
            await axios.get(
                STEAMID_API_URL,
                {
                    params: {
                        key: apiKey,
                        steamid: steamId64
                    },

                    timeout:
                        REQUEST_TIMEOUT,

                    headers: {
                        "User-Agent":
                            "RustLogix/1.0"
                    }
                }
            );

        const data =
            response?.data;

        if (!data) {

            throw new Error(
                "SteamID.uk devolvió una respuesta vacía."
            );
        }

        console.log(
            "[SteamID.uk] Respuesta recibida correctamente."
        );

        return normalizarRespuesta(
            data,
            steamId64
        );

    } catch (error) {

        const status =
            error?.response?.status;

        const responseData =
            error?.response?.data;

        console.error(
            "[SteamID.uk] Error:",
            status
                ? `HTTP ${status}`
                : error.message
        );

        if (responseData) {

            console.error(
                "[SteamID.uk] Respuesta:",
                JSON.stringify(
                    responseData,
                    null,
                    2
                )
            );
        }

        throw error;
    }
}

// =====================================================
// NORMALIZAR RESPUESTA
// =====================================================

function normalizarRespuesta(
    data,
    steamId64
) {

    const steamIDs =
        convertirSteamIDs(
            steamId64
        );

    /*
     * SteamID.uk ha utilizado distintas estructuras
     * en sus respuestas. Buscamos Steamid_data sin
     * rompernos si vienen otras secciones.
     */

    const steamidData =
        data?.steamid_data ||
        data?.Steamid_data ||
        data?.SteamID_data ||
        data?.steamId_data ||
        {};

    const profileData =
        data?.profile ||
        data?.profile_data ||
        data?.player ||
        data?.player_data ||
        {};

    const bans =
        data?.bans ||
        data?.ban_data ||
        {};

    const friends =
        data?.friends ||
        data?.friend_data ||
        {};

    // -------------------------------------------------
    // CSGO FRIEND ID
    // -------------------------------------------------

    const csgoFriendId =
        steamidData?.csgo_friend_id ||
        steamidData?.csgoFriendId ||
        steamidData?.csgo_friendid ||
        data?.csgo_friend_id ||
        data?.csgoFriendId ||
        null;

    // -------------------------------------------------
    // BANES
    // -------------------------------------------------

    const vacBanned =
        obtenerBooleano(
            bans?.vac_banned,
            bans?.vacBanned,
            steamidData?.vac_banned,
            steamidData?.vacBanned,
            data?.vac_banned,
            data?.vacBanned
        );

    const gameBans =
        obtenerNumero(
            bans?.game_bans,
            bans?.gameBans,
            steamidData?.game_bans,
            steamidData?.gameBans,
            data?.game_bans,
            data?.gameBans
        );

    const tradeBan =
        obtenerBooleano(
            bans?.trade_banned,
            bans?.tradeBan,
            steamidData?.trade_banned,
            steamidData?.tradeBan,
            data?.trade_banned,
            data?.tradeBan
        );

    const communityBan =
        obtenerBooleano(
            bans?.community_banned,
            bans?.communityBan,
            steamidData?.community_banned,
            steamidData?.communityBan,
            data?.community_banned,
            data?.communityBan
        );

    const steamIdBan =
        obtenerBooleano(
            bans?.steamid_banned,
            bans?.steamIdBan,
            steamidData?.steamid_banned,
            steamidData?.steamIdBan,
            data?.steamid_banned,
            data?.steamIdBan
        );

    const rustHackReport =
        obtenerBooleano(
            bans?.rusthackreport,
            bans?.rustHackReport,
            steamidData?.rusthackreport,
            steamidData?.rustHackReport,
            data?.rusthackreport,
            data?.rustHackReport
        );

    // -------------------------------------------------
    // AMIGOS
    // -------------------------------------------------

    const friendsCount =
        obtenerNumero(
            friends?.count,
            friends?.total,
            friends?.friend_count,
            friends?.friendCount,
            steamidData?.friend_count,
            steamidData?.friend_history_count,
            data?.friend_count,
            data?.friendCount
        );

    const friendsVac =
        obtenerNumero(
            friends?.vac_banned,
            friends?.vacBanned,
            friends?.friends_with_vac,
            friends?.friendsWithVAC,
            data?.friends_with_vac,
            data?.friendsWithVAC
        );

    const friendsGameBan =
        obtenerNumero(
            friends?.game_banned,
            friends?.gameBanned,
            friends?.friends_with_game_ban,
            friends?.friendsWithGameBan,
            data?.friends_with_game_ban,
            data?.friendsWithGameBan
        );

    const friendsTradeBan =
        obtenerNumero(
            friends?.trade_banned,
            friends?.tradeBanned,
            friends?.friends_with_trade_ban,
            friends?.friendsWithTradeBan,
            data?.friends_with_trade_ban,
            data?.friendsWithTradeBan
        );

    const friendsCommunityBan =
        obtenerNumero(
            friends?.community_banned,
            friends?.communityBanned,
            friends?.friends_with_community_ban,
            friends?.friendsWithCommunityBan,
            data?.friends_with_community_ban,
            data?.friendsWithCommunityBan
        );

    // -------------------------------------------------
    // NOMBRE
    // -------------------------------------------------

    const name =
        profileData?.name ||
        profileData?.personaname ||
        data?.name ||
        data?.personaname ||
        steamidData?.name ||
        null;

    // -------------------------------------------------
    // RESULTADO
    // -------------------------------------------------

    return {

        steamId64,

        steam2:
            steamidData?.steam2 ||
            steamidData?.steamid ||
            steamIDs.steam2,

        steam3:
            steamidData?.steam3 ||
            steamidData?.steamid3 ||
            steamIDs.steam3,

        csgoFriendId:
            csgoFriendId ||
            convertirCSGOFriendID(
                steamId64
            ),

        name,

        vacBanned,

        gameBans,

        tradeBan,

        communityBan,

        steamIdBan,

        rustHackReport,

        friendsCount,

        friendsVac,

        friendsGameBan,

        friendsTradeBan,

        friendsCommunityBan,

        raw:
            data
    };
}

// =====================================================
// BOOLEAN
// =====================================================

function obtenerBooleano(...values) {

    for (const value of values) {

        if (
            value === true ||
            value === false
        ) {
            return value;
        }

        if (
            value === 1 ||
            value === "1" ||
            value === "true" ||
            value === "yes" ||
            value === "yes"
        ) {
            return true;
        }

        if (
            value === 0 ||
            value === "0" ||
            value === "false" ||
            value === "no"
        ) {
            return false;
        }
    }

    return false;
}

// =====================================================
// NUMBER
// =====================================================

function obtenerNumero(...values) {

    for (const value of values) {

        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {
            continue;
        }

        const numero =
            Number(value);

        if (
            Number.isFinite(numero)
        ) {
            return numero;
        }
    }

    return 0;
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
    getSteamIDData,
    convertirSteamIDs,
    convertirCSGOFriendID
};