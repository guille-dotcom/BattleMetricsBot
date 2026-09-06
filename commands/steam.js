const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const axios = require("axios");
const ServerConfig = require("../models/ServerConfig");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BATTLEMETRICS_API =
    "https://api.battlemetrics.com";

const STEAMWEBAPI_API =
    "https://www.steamwebapi.com";

const STEAM_API =
    "https://api.steampowered.com";

const BATTLEMETRICS_SERVER_ID =
    "11378166";

const STEAMID64_MIN =
    76561197960265728n;

const STEAMID64_MAX =
    76561202255233023n;

// =====================================================
// VALIDAR STEAMID64
// =====================================================

function esSteamID64(valor) {

    if (valor === null || valor === undefined) {
        return false;
    }

    const texto = String(valor).trim();

    if (!/^\d{17}$/.test(texto)) {
        return false;
    }

    try {

        const numero = BigInt(texto);

        return (
            numero >= STEAMID64_MIN &&
            numero <= STEAMID64_MAX
        );

    } catch {

        return false;
    }
}

// =====================================================
// NORMALIZAR NOMBRE
// =====================================================

function normalizarNombre(nombre) {

    return String(nombre || "")
        .trim()
        .normalize("NFKC")
        .toLowerCase();

}

// =====================================================
// HEADERS BATTLEMETRICS
// =====================================================

function getBattleMetricsHeaders() {

    const token =
        process.env.BATTLEMETRICS_TOKEN;

    const headers = {
        Accept:
            "application/vnd.api+json"
    };

    if (token) {

        headers.Authorization =
            `Bearer ${token}`;
    }

    return headers;
}

// =====================================================
// BUSCAR PLAYER EN BATTLEMETRICS
// =====================================================

async function buscarJugadorBattleMetrics(nombre) {

    console.log(
        `[STEAM] Buscando "${nombre}" en BattleMetrics...`
    );

    try {

        const url =
            `${BATTLEMETRICS_API}/servers/${BATTLEMETRICS_SERVER_ID}`;

        const response =
            await axios.get(url, {

                params: {
                    include: "player,identifier"
                },

                headers:
                    getBattleMetricsHeaders(),

                timeout: 30000
            });

        const data =
            response.data;

        const resources =
            Array.isArray(data?.included)
                ? data.included
                : [];

        console.log(
            `[BATTLEMETRICS] Recursos recibidos: ${resources.length}`
        );

        const players =
            resources.filter(
                resource =>
                    resource.type === "player"
            );

        console.log(
            `[BATTLEMETRICS] Players encontrados: ${players.length}`
        );

        const buscado =
            normalizarNombre(nombre);

        const coincidencias =
            players.filter(player => {

                const playerName =
                    player?.attributes?.name;

                return (
                    normalizarNombre(playerName) ===
                    buscado
                );
            });

        console.log(
            `[BATTLEMETRICS] Coincidencias exactas: ${coincidencias.length}`
        );

        if (!coincidencias.length) {

            return null;
        }

        const player =
            coincidencias[0];

        console.log(
            `[BATTLEMETRICS] MATCH: ${player.id} | ${player.attributes?.name}`
        );

        return {

            id: String(player.id),

            name:
                player.attributes?.name ||
                nombre
        };

    } catch (error) {

        console.error(
            "[BATTLEMETRICS] Error:",
            error.response?.status ||
            error.message
        );

        return null;
    }
}

// =====================================================
// OBTENER IDENTIFICADORES DEL PLAYER
// =====================================================

async function obtenerIdentificadoresBattleMetrics(playerId) {

    console.log(
        `[BATTLEMETRICS] Obteniendo identifiers de ${playerId}...`
    );

    try {

        const url =
            `${BATTLEMETRICS_API}/players/${playerId}`;

        const response =
            await axios.get(url, {

                params: {
                    include: "identifier"
                },

                headers:
                    getBattleMetricsHeaders(),

                timeout: 30000
            });

        const resources =
            Array.isArray(response.data?.included)
                ? response.data.included
                : [];

        console.log(
            `[BATTLEMETRICS] Identifiers recibidos: ${resources.length}`
        );

        return resources;

    } catch (error) {

        console.error(
            "[BATTLEMETRICS] Error obteniendo identifiers:",
            error.response?.status ||
            error.message
        );

        return [];
    }
}

// =====================================================
// INTENTAR SACAR STEAMID64 DESDE BATTLEMETRICS
// =====================================================

function extraerSteamID64DeBattleMetrics(identifiers) {

    for (const identifier of identifiers) {

        const attributes =
            identifier?.attributes || {};

        const posibles = [

            attributes.value,

            attributes.identifier,

            attributes.name,

            attributes.steamID,

            attributes.steamId,

            attributes.steamid,

            attributes.steam64,

            attributes.steamid64

        ];

        for (const valor of posibles) {

            if (esSteamID64(valor)) {

                console.log(
                    `[BATTLEMETRICS] SteamID64 encontrado directamente: ${valor}`
                );

                return String(valor);
            }
        }
    }

    console.log(
        "[BATTLEMETRICS] No hay SteamID64 directo."
    );

    return null;
}

// =====================================================
// RECORRER RESPUESTA STEAMWEBAPI
// =====================================================

function recorrerObjetos(objeto, resultado = []) {

    if (!objeto) {
        return resultado;
    }

    if (Array.isArray(objeto)) {

        for (const item of objeto) {

            recorrerObjetos(
                item,
                resultado
            );
        }

        return resultado;
    }

    if (
        typeof objeto !== "object"
    ) {

        return resultado;
    }

    resultado.push(objeto);

    for (const valor of Object.values(objeto)) {

        if (
            valor &&
            typeof valor === "object"
        ) {

            recorrerObjetos(
                valor,
                resultado
            );
        }
    }

    return resultado;
}

// =====================================================
// EXTRAER STEAMID64 DE UN PERFIL STEAMWEBAPI
// =====================================================

function extraerSteamID64PerfilSteamWebAPI(perfil) {

    const posibles = [

        perfil.steamid,

        perfil.steamId,

        perfil.steamID,

        perfil.steamid64,

        perfil.steamId64,

        perfil.steamID64,

        perfil.steam_id,

        perfil.steam_id64,

        perfil.id,

        perfil.accountid

    ];

    for (const valor of posibles) {

        if (esSteamID64(valor)) {

            return String(valor);
        }
    }

    return null;
}

// =====================================================
// OBTENER NOMBRE DE UN PERFIL STEAMWEBAPI
// =====================================================

function obtenerNombrePerfilSteamWebAPI(perfil) {

    const posibles = [

        perfil.personaname,

        perfil.personaName,

        perfil.persona_name,

        perfil.accountname,

        perfil.accountName,

        perfil.displayname,

        perfil.displayName,

        perfil.name,

        perfil.username,

        perfil.userName

    ];

    for (const valor of posibles) {

        if (
            valor !== null &&
            valor !== undefined &&
            String(valor).trim()
        ) {

            return String(valor).trim();
        }
    }

    return null;
}

// =====================================================
// BUSCAR STEAMID64 POR NOMBRE
// STEAMWEBAPI /explore/api/profile
// =====================================================

async function buscarSteamWebAPI(nombre) {

    const apiKey =
        process.env.STEAMWEBAPI_KEY;

    if (!apiKey) {

        console.error(
            "[STEAMWEBAPI] ❌ Falta STEAMWEBAPI_KEY en las variables de entorno."
        );

        return null;
    }

    console.log(
        `[STEAMWEBAPI] Buscando perfil por nombre: "${nombre}"`
    );

    try {

        const response =
            await axios.get(
                `${STEAMWEBAPI_API}/explore/api/profile`,
                {

                    params: {

                        search:
                            nombre,

                        limit:
                            100,

                        page:
                            1,

                        order_by:
                            "personanameASC"
                    },

                    headers: {

                        "X-Api-Key":
                            apiKey,

                        Accept:
                            "application/json"
                    },

                    timeout: 30000
                }
            );

        console.log(
            `[STEAMWEBAPI] HTTP: ${response.status}`
        );

        const data =
            response.data;

        // =================================================
        // LA API DOCUMENTA UN ARRAY DE PERFILES,
        // PERO DEJAMOS EL PARSER ROBUSTO POR SI CAMBIA
        // LA ESTRUCTURA.
        // =================================================

        const objetos =
            recorrerObjetos(data);

        const perfiles = [];

        const vistos =
            new Set();

        for (const objeto of objetos) {

            const steamid =
                extraerSteamID64PerfilSteamWebAPI(
                    objeto
                );

            if (!steamid) {
                continue;
            }

            const nombrePerfil =
                obtenerNombrePerfilSteamWebAPI(
                    objeto
                );

            if (!nombrePerfil) {
                continue;
            }

            const key =
                `${steamid}|${normalizarNombre(nombrePerfil)}`;

            if (vistos.has(key)) {
                continue;
            }

            vistos.add(key);

            perfiles.push({

                steamid,

                name:
                    nombrePerfil,

                avatar:
                    objeto.avatarfull ||
                    objeto.avatarFull ||
                    objeto.avatar ||
                    objeto.avatarfullurl ||
                    null,

                avatarMedium:
                    objeto.avatarmedium ||
                    objeto.avatarMedium ||
                    null,

                avatarSmall:
                    objeto.avatarsmall ||
                    objeto.avatarSmall ||
                    null,

                profileurl:
                    objeto.profileurl ||
                    objeto.profileUrl ||
                    objeto.profile_url ||
                    null,

                raw:
                    objeto
            });
        }

        console.log(
            `[STEAMWEBAPI] Perfiles candidatos: ${perfiles.length}`
        );

        // =================================================
        // COINCIDENCIA EXACTA
        // =================================================

        const buscado =
            normalizarNombre(nombre);

        const coincidencias =
            perfiles.filter(perfil => {

                return (
                    normalizarNombre(
                        perfil.name
                    ) === buscado
                );
            });

        console.log(
            `[STEAMWEBAPI] Coincidencias exactas: ${coincidencias.length}`
        );

        if (!coincidencias.length) {

            console.log(
                "[STEAMWEBAPI] ❌ No se encontró una coincidencia exacta."
            );

            if (perfiles.length) {

                console.log(
                    "[STEAMWEBAPI] Primeros candidatos:"
                );

                for (
                    const perfil
                    of perfiles.slice(0, 10)
                ) {

                    console.log(
                        ` - ${perfil.name} | ${perfil.steamid}`
                    );
                }
            }

            return null;
        }

        const perfil =
            coincidencias[0];

        console.log(
            `[STEAMWEBAPI] ✅ MATCH: ${perfil.name} | ${perfil.steamid}`
        );

        return perfil;

    } catch (error) {

        console.error(
            "[STEAMWEBAPI] Error:",
            error.response?.status ||
            error.message
        );

        if (error.response?.data) {

            console.error(
                "[STEAMWEBAPI] Respuesta:",
                JSON.stringify(
                    error.response.data
                )
            );
        }

        return null;
    }
}

// =====================================================
// OBTENER PERFIL STEAM
// =====================================================

async function obtenerDatosSteam(steamID64) {

    const apiKey =
        process.env.STEAM_API_KEY;

    if (!apiKey) {

        console.error(
            "[STEAM] ❌ Falta STEAM_API_KEY."
        );

        return null;
    }

    console.log(
        `[STEAM] Obteniendo perfil ${steamID64}...`
    );

    try {

        const response =
            await axios.get(
                `${STEAM_API}/ISteamUser/GetPlayerSummaries/v2/`,
                {

                    params: {

                        key:
                            apiKey,

                        steamids:
                            steamID64
                    },

                    timeout: 30000
                }
            );

        const players =
            response.data?.response?.players;

        if (
            !Array.isArray(players) ||
            !players.length
        ) {

            console.log(
                "[STEAM] ❌ Steam no devolvió el perfil."
            );

            return null;
        }

        return players[0];

    } catch (error) {

        console.error(
            "[STEAM] Error obteniendo perfil:",
            error.response?.status ||
            error.message
        );

        return null;
    }
}

// =====================================================
// ESTADO STEAM
// =====================================================

function obtenerEstadoSteam(player) {

    if (!player) {
        return "Desconocido";
    }

    switch (
        Number(player.personastate)
    ) {

        case 0:
            return "⚫ Offline";

        case 1:
            return "🟢 Online";

        case 2:
            return "🔴 Busy";

        case 3:
            return "🟡 Away";

        case 4:
            return "🟠 Snooze";

        case 5:
            return "🟣 Looking to trade";

        case 6:
            return "🔵 Looking to play";

        default:
            return "⚫ Offline";
    }
}

// =====================================================
// FECHA
// =====================================================

function formatearFechaUnix(timestamp) {

    if (!timestamp) {
        return "Desconocida";
    }

    const fecha =
        new Date(
            Number(timestamp) * 1000
        );

    if (
        Number.isNaN(
            fecha.getTime()
        )
    ) {

        return "Desconocida";
    }

    return `<t:${Math.floor(
        Number(timestamp)
    )}:D>`;
}

// =====================================================
// COMANDO
// =====================================================

module.exports = {

    data:
        new SlashCommandBuilder()
            .setName("steam")
            .setDescription(
                "Busca un jugador de Rust en BattleMetrics y obtiene su perfil de Steam"
            )
            .addStringOption(option =>
                option
                    .setName("nombre")
                    .setDescription(
                        "Nombre exacto del jugador"
                    )
                    .setRequired(true)
            ),

    async execute(interaction) {

        const nombre =
            interaction.options.getString(
                "nombre"
            );

        console.log(
            "========================================"
        );

        console.log(
            `[STEAM] Ejecutando /steam`
        );

        console.log(
            `[STEAM] Entrada recibida: "${nombre}"`
        );

        console.log(
            "========================================"
        );

        await interaction.deferReply();

        // =================================================
        // 1. BATTLEMETRICS
        // =================================================

        const jugador =
            await buscarJugadorBattleMetrics(
                nombre
            );

        if (!jugador) {

            const embed =
                new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle(
                        "❌ Jugador no encontrado"
                    )
                    .setDescription(
                        `No encontré a **${nombre}** en el servidor configurado de BattleMetrics.`
                    );

            return interaction.editReply({
                embeds: [embed]
            });
        }

        // =================================================
        // 2. IDENTIFIERS BM
        // =================================================

        const identifiers =
            await obtenerIdentificadoresBattleMetrics(
                jugador.id
            );

        // =================================================
        // 3. INTENTAR STEAMID64 DIRECTO
        // =================================================

        let steamID64 =
            extraerSteamID64DeBattleMetrics(
                identifiers
            );

        let steamWebProfile =
            null;

        // =================================================
        // 4. SI BM NO LO TIENE,
        //    BUSCAR POR NOMBRE EN STEAMWEBAPI
        // =================================================

        if (!steamID64) {

            console.log(
                "[STEAM] BattleMetrics no proporcionó SteamID64."
            );

            steamWebProfile =
                await buscarSteamWebAPI(
                    jugador.name
                );

            if (
                steamWebProfile?.steamid
            ) {

                steamID64 =
                    steamWebProfile.steamid;
            }
        }

        // =================================================
        // 5. NO ENCONTRADO
        // =================================================

        if (!steamID64) {

            const embed =
                new EmbedBuilder()
                    .setColor(0xff9900)
                    .setTitle(
                        "⚠️ SteamID64 no encontrado"
                    )
                    .setDescription(
                        `Encontré a **${jugador.name}** en BattleMetrics, pero no pude resolver su SteamID64 mediante las fuentes disponibles.`
                    )
                    .addFields({

                        name:
                            "BattleMetrics",

                        value:
                            `[${jugador.name}](https://www.battlemetrics.com/players/${jugador.id})`,

                        inline:
                            false
                    });

            return interaction.editReply({
                embeds: [embed]
            });
        }

        console.log(
            `[STEAM] SteamID64 final: ${steamID64}`
        );

        // =================================================
        // 6. OBTENER PERFIL STEAM
        // =================================================

        const steamProfile =
            await obtenerDatosSteam(
                steamID64
            );

        // =================================================
        // 7. DATOS FINALES
        // =================================================

        const nombreSteam =
            steamProfile?.personaname ||
            steamWebProfile?.name ||
            jugador.name;

        const avatar =
            steamProfile?.avatarfull ||
            steamWebProfile?.avatar ||
            "https://avatars.steamstatic.com/";

        const profileURL =
            steamProfile?.profileurl ||
            steamWebProfile?.profileurl ||
            `https://steamcommunity.com/profiles/${steamID64}`;

        const estado =
            obtenerEstadoSteam(
                steamProfile
            );

        const fechaCreacion =
            formatearFechaUnix(
                steamProfile?.timecreated
            );

        // =================================================
        // 8. EMBED
        // =================================================

        const embed =
            new EmbedBuilder()
                .setColor(0x1b2838)
                .setTitle(
                    `🎮 ${nombreSteam}`
                )
                .setURL(
                    profileURL
                )
                .setThumbnail(
                    avatar
                )
                .addFields(

                    {
                        name:
                            "🆔 SteamID64",

                        value:
                            `\`${steamID64}\``,

                        inline:
                            false
                    },

                    {
                        name:
                            "📊 Estado",

                        value:
                            estado,

                        inline:
                            true
                    },

                    {
                        name:
                            "📅 Cuenta creada",

                        value:
                            fechaCreacion,

                        inline:
                            true
                    },

                    {
                        name:
                            "👤 BattleMetrics",

                        value:
                            `[${jugador.name}](https://www.battlemetrics.com/players/${jugador.id})`,

                        inline:
                            false
                    }
                )
                .setFooter({

                    text:
                        "RustLogix • BattleMetrics + SteamWebAPI"

                });

        const row =
            new ActionRowBuilder()
                .addComponents(

                    new ButtonBuilder()
                        .setLabel(
                            "Perfil Steam"
                        )
                        .setStyle(
                            ButtonStyle.Link
                        )
                        .setURL(
                            profileURL
                        ),

                    new ButtonBuilder()
                        .setLabel(
                            "BattleMetrics"
                        )
                        .setStyle(
                            ButtonStyle.Link
                        )
                        .setURL(
                            `https://www.battlemetrics.com/players/${jugador.id}`
                        )
                );

        return interaction.editReply({

            embeds: [
                embed
            ],

            components: [
                row
            ]
        });
    }
};