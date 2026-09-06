const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const axios = require("axios");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BATTLEMETRICS_API =
    "https://api.battlemetrics.com";

const STEAMWEBAPI_API =
    "https://www.steamwebapi.com";

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

    if (
        valor === null ||
        valor === undefined
    ) {
        return false;
    }

    const texto =
        String(valor).trim();

    if (
        !/^\d{17}$/.test(texto)
    ) {
        return false;
    }

    try {

        const numero =
            BigInt(texto);

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
// BUSCAR JUGADOR EN BATTLEMETRICS
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
                    include:
                        "player,identifier"
                },

                headers:
                    getBattleMetricsHeaders(),

                timeout:
                    30000
            });

        const resources =
            Array.isArray(
                response.data?.included
            )
                ? response.data.included
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
                    normalizarNombre(
                        playerName
                    ) === buscado
                );
            });

        console.log(
            `[BATTLEMETRICS] Coincidencias exactas: ${coincidencias.length}`
        );

        if (
            !coincidencias.length
        ) {

            return null;
        }

        const player =
            coincidencias[0];

        console.log(
            `[BATTLEMETRICS] MATCH: ${player.id} | ${player.attributes?.name}`
        );

        return {

            id:
                String(player.id),

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

        if (
            error.response?.data
        ) {

            console.error(
                "[BATTLEMETRICS] Respuesta:",
                JSON.stringify(
                    error.response.data
                )
            );
        }

        return null;
    }
}

// =====================================================
// OBTENER IDENTIFICADORES DE BATTLEMETRICS
// =====================================================

async function obtenerIdentificadoresBattleMetrics(
    playerId
) {

    console.log(
        `[BATTLEMETRICS] Obteniendo identifiers de ${playerId}...`
    );

    try {

        const url =
            `${BATTLEMETRICS_API}/players/${playerId}`;

        const response =
            await axios.get(url, {

                params: {
                    include:
                        "identifier"
                },

                headers:
                    getBattleMetricsHeaders(),

                timeout:
                    30000
            });

        const resources =
            Array.isArray(
                response.data?.included
            )
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

function extraerSteamID64DeBattleMetrics(
    identifiers
) {

    for (
        const identifier
        of identifiers
    ) {

        const attributes =
            identifier?.attributes ||
            {};

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

        for (
            const valor
            of posibles
        ) {

            if (
                esSteamID64(valor)
            ) {

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
// OBTENER ARRAY DE PERFILES DE STEAMWEBAPI
// =====================================================

function obtenerArrayPerfilesSteamWebAPI(
    respuesta
) {

    if (
        Array.isArray(respuesta)
    ) {

        return respuesta;
    }

    if (
        Array.isArray(
            respuesta?.data
        )
    ) {

        return respuesta.data;
    }

    if (
        Array.isArray(
            respuesta?.results
        )
    ) {

        return respuesta.results;
    }

    if (
        Array.isArray(
            respuesta?.profiles
        )
    ) {

        return respuesta.profiles;
    }

    if (
        Array.isArray(
            respuesta?.response
        )
    ) {

        return respuesta.response;
    }

    if (
        Array.isArray(
            respuesta?.response?.players
        )
    ) {

        return respuesta.response.players;
    }

    return [];
}

// =====================================================
// EXTRAER STEAMID64
// =====================================================

function extraerSteamID64Perfil(
    perfil
) {

    const posibles = [

        perfil?.steamid,

        perfil?.steamId,

        perfil?.steamID,

        perfil?.steamid64,

        perfil?.steamId64,

        perfil?.steamID64,

        perfil?.steam_id,

        perfil?.steam_id64
    ];

    for (
        const valor
        of posibles
    ) {

        if (
            esSteamID64(valor)
        ) {

            return String(valor);
        }
    }

    return null;
}

// =====================================================
// CONVERTIR PERFIL STEAMWEBAPI
// =====================================================

function convertirPerfilSteamWebAPI(
    objeto
) {

    if (
        !objeto ||
        typeof objeto !== "object"
    ) {

        return null;
    }

    const steamid =
        extraerSteamID64Perfil(
            objeto
        );

    if (!steamid) {

        return null;
    }

    return {

        steamid,

        personaname:
            objeto.personaname ||
            null,

        accountname:
            objeto.accountname ||
            null,

        displayname:
            objeto.displayname ||
            null,

        profiletype:
            objeto.profiletype ||
            null,

        realname:
            objeto.realname ||
            null,

        loccountrycode:
            objeto.loccountrycode ||
            null,

        description:
            objeto.description ||
            null,

        fame:
            objeto.fame ??
            null,

        vac:
            objeto.vac ??
            null,

        islimited:
            objeto.islimited ??
            null,

        level:
            objeto.level ??
            null,

        worth:
            objeto.worth ??
            null,

        worthsteam:
            objeto.worthsteam ??
            null,

        size:
            objeto.size ??
            null,

        peritem:
            objeto.peritem ??
            null,

        totalplaytime:
            objeto.totalplaytime ??
            null,

        playtimerecent:
            objeto.playtimerecent ??
            null,

        timecreated:
            objeto.timecreated ??
            null,

        updatedat:
            objeto.updatedat ??
            null,

        inventoryupdatedat:
            objeto.inventoryupdatedat ??
            null,

        avatar:
            objeto.avatar ||
            null,

        avatarmedium:
            objeto.avatarmedium ||
            null,

        avatarfull:
            objeto.avatarfull ||
            null,

        profileurl:
            objeto.profileurl ||
            null,

        profilesteamurl:
            objeto.profilesteamurl ||
            null,

        onlinestate:
            objeto.onlinestate ??
            null,

        ingameinfo:
            objeto.ingameinfo ??
            null
    };
}

// =====================================================
// RESOLVER DIRECTO POR NOMBRE
// =====================================================

async function resolverSteamWebAPIDirecto(
    nombre,
    apiKey
) {

    console.log(
        `[STEAMWEBAPI] Intentando resolver directamente "${nombre}"...`
    );

    try {

        const response =
            await axios.get(

                `${STEAMWEBAPI_API}/steam/api/profile`,

                {

                    params: {

                        id:
                            nombre,

                        key:
                            apiKey,

                        no_cache:
                            1,

                        production:
                            1,

                        format:
                            "json"
                    },

                    headers: {

                        "X-Api-Key":
                            apiKey,

                        Accept:
                            "application/json"
                    },

                    timeout:
                        30000
                }
            );

        console.log(
            `[STEAMWEBAPI] Resolver directo HTTP: ${response.status}`
        );

        console.log(
            "[STEAMWEBAPI] Respuesta resolver directo:",
            JSON.stringify(
                response.data,
                null,
                2
            )
        );

        const perfiles =
            obtenerArrayPerfilesSteamWebAPI(
                response.data
            );

        if (
            perfiles.length
        ) {

            for (
                const objeto
                of perfiles
            ) {

                const perfil =
                    convertirPerfilSteamWebAPI(
                        objeto
                    );

                if (
                    perfil
                ) {

                    console.log(
                        `[STEAMWEBAPI] ✅ Resolver directo encontró SteamID64: ${perfil.steamid}`
                    );

                    return perfil;
                }
            }
        }

        const perfilDirecto =
            convertirPerfilSteamWebAPI(
                response.data
            );

        if (
            perfilDirecto
        ) {

            console.log(
                `[STEAMWEBAPI] ✅ Resolver directo encontró SteamID64: ${perfilDirecto.steamid}`
            );

            return perfilDirecto;
        }

        console.log(
            "[STEAMWEBAPI] Resolver directo no devolvió un perfil válido."
        );

        return null;

    } catch (error) {

        console.error(
            "[STEAMWEBAPI] Resolver directo:",
            error.response?.status ||
            error.message
        );

        if (
            error.response?.data
        ) {

            console.error(
                "[STEAMWEBAPI] Respuesta resolver directo:",
                JSON.stringify(
                    error.response.data,
                    null,
                    2
                )
            );
        }

        return null;
    }
}

// =====================================================
// BUSCAR EN EXPLORE
// =====================================================

async function buscarSteamWebAPIExplore(
    nombre,
    apiKey
) {

    console.log(
        `[STEAMWEBAPI] Buscando "${nombre}" mediante Explore...`
    );

    try {

        const response =
            await axios.get(

                `${STEAMWEBAPI_API}/explore/api/profile`,

                {

                    params: {

                        key:
                            apiKey,

                        search:
                            nombre,

                        limit:
                            100,

                        page:
                            1,

                        order_by:
                            "personanameASC",

                        production:
                            1,

                        format:
                            "json"
                    },

                    headers: {

                        "X-Api-Key":
                            apiKey,

                        Accept:
                            "application/json"
                    },

                    timeout:
                        30000
                }
            );

        console.log(
            `[STEAMWEBAPI] Explore HTTP: ${response.status}`
        );

        console.log(
            "[STEAMWEBAPI] Tipo de respuesta:",
            Array.isArray(
                response.data
            )
                ? "ARRAY"
                : typeof response.data
        );

        const perfilesAPI =
            obtenerArrayPerfilesSteamWebAPI(
                response.data
            );

        console.log(
            `[STEAMWEBAPI] Perfiles recibidos: ${perfilesAPI.length}`
        );

        if (
            perfilesAPI.length === 0
        ) {

            console.log(
                "[STEAMWEBAPI] ⚠️ Explore devolvió 0 perfiles."
            );

            console.log(
                "[STEAMWEBAPI] Respuesta:",
                JSON.stringify(
                    response.data,
                    null,
                    2
                )
            );

            return null;
        }

        const perfiles =
            [];

        for (
            const objeto
            of perfilesAPI
        ) {

            const perfil =
                convertirPerfilSteamWebAPI(
                    objeto
                );

            if (
                perfil
            ) {

                perfiles.push(
                    perfil
                );
            }
        }

        console.log(
            `[STEAMWEBAPI] Perfiles válidos: ${perfiles.length}`
        );

        const buscado =
            normalizarNombre(nombre);

        const coincidencias =
            perfiles.filter(
                perfil => {

                    const nombres = [

                        perfil.personaname,

                        perfil.accountname,

                        perfil.displayname

                    ];

                    return nombres.some(
                        nombrePerfil =>

                            normalizarNombre(
                                nombrePerfil
                            ) === buscado
                    );
                }
            );

        console.log(
            `[STEAMWEBAPI] Coincidencias exactas: ${coincidencias.length}`
        );

        if (
            !coincidencias.length
        ) {

            console.log(
                "[STEAMWEBAPI] ❌ Explore no encontró coincidencia exacta."
            );

            for (
                const perfil
                of perfiles.slice(0, 20)
            ) {

                console.log(
                    ` - ${perfil.personaname || "N/A"} | ${perfil.accountname || "N/A"} | ${perfil.displayname || "N/A"} | ${perfil.steamid}`
                );
            }

            return null;
        }

        const perfil =
            coincidencias[0];

        console.log(
            `[STEAMWEBAPI] ✅ MATCH Explore: ${perfil.steamid}`
        );

        return perfil;

    } catch (error) {

        console.error(
            "[STEAMWEBAPI] Explore:",
            error.response?.status ||
            error.message
        );

        if (
            error.response?.data
        ) {

            console.error(
                "[STEAMWEBAPI] Respuesta Explore:",
                JSON.stringify(
                    error.response.data,
                    null,
                    2
                )
            );
        }

        return null;
    }
}

// =====================================================
// BUSCAR PERFIL COMPLETO EN STEAMWEBAPI
// =====================================================

async function buscarSteamWebAPI(
    nombre
) {

    const apiKey =
        process.env.STEAMWEBAPI_KEY;

    if (!apiKey) {

        console.error(
            "[STEAMWEBAPI] ❌ Falta STEAMWEBAPI_KEY."
        );

        return null;
    }

    console.log(
        "========================================"
    );

    console.log(
        `[STEAMWEBAPI] Resolviendo "${nombre}"`
    );

    console.log(
        "========================================"
    );

    // =================================================
    // MÉTODO 1
    // RESOLVER DIRECTAMENTE POR NOMBRE
    // =================================================

    const perfilDirecto =
        await resolverSteamWebAPIDirecto(
            nombre,
            apiKey
        );

    if (
        perfilDirecto
    ) {

        return perfilDirecto;
    }

    // =================================================
    // MÉTODO 2
    // EXPLORE
    // =================================================

    console.log(
        "[STEAMWEBAPI] Resolver directo no encontró el perfil."
    );

    console.log(
        "[STEAMWEBAPI] Intentando búsqueda Explore..."
    );

    const perfilExplore =
        await buscarSteamWebAPIExplore(
            nombre,
            apiKey
        );

    if (
        perfilExplore
    ) {

        return perfilExplore;
    }

    console.log(
        "[STEAMWEBAPI] ❌ No se pudo resolver el perfil."
    );

    return null;
}

// =====================================================
// FORMATEAR VALOR
// =====================================================

function mostrarValor(
    valor,
    defecto = "N/A"
) {

    if (
        valor === null ||
        valor === undefined ||
        valor === ""
    ) {

        return defecto;
    }

    return String(valor);
}

// =====================================================
// FORMATEAR FECHA
// =====================================================

function formatearFechaUnix(
    timestamp
) {

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
// ESTADO VAC
// =====================================================

function obtenerEstadoVAC(
    valor
) {

    if (
        valor === null ||
        valor === undefined
    ) {

        return "N/A";
    }

    if (
        valor === true ||
        valor === 1 ||
        valor === "1"
    ) {

        return "🔴 Sí";
    }

    return "🟢 No";
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

            .addStringOption(
                option =>

                    option

                        .setName("nombre")

                        .setDescription(
                            "Nombre exacto del jugador"
                        )

                        .setRequired(true)
            ),

    async execute(
        interaction
    ) {

        const nombre =
            interaction.options.getString(
                "nombre"
            );

        console.log(
            "========================================"
        );

        console.log(
            "[STEAM] Ejecutando /steam"
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

                    .setColor(
                        0xff0000
                    )

                    .setTitle(
                        "❌ Jugador no encontrado"
                    )

                    .setDescription(
                        `No encontré a **${nombre}** en el servidor configurado de BattleMetrics.`
                    );

            return interaction.editReply({

                embeds: [
                    embed
                ]

            });
        }

        // =================================================
        // 2. IDENTIFIERS BATTLEMETRICS
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

        let steamProfile =
            null;

        // =================================================
        // 4. STEAMWEBAPI
        // =================================================

        if (
            !steamID64
        ) {

            console.log(
                "[STEAM] BattleMetrics no proporcionó SteamID64."
            );

            steamProfile =
                await buscarSteamWebAPI(
                    jugador.name
                );

            if (
                steamProfile?.steamid
            ) {

                steamID64 =
                    steamProfile.steamid;
            }
        }

        // =================================================
        // 5. NO ENCONTRADO
        // =================================================

        if (
            !steamID64
        ) {

            const embed =
                new EmbedBuilder()

                    .setColor(
                        0xff9900
                    )

                    .setTitle(
                        "⚠️ SteamID64 no encontrado"
                    )

                    .setDescription(
                        `Encontré a **${jugador.name}** en BattleMetrics, pero no pude resolver su SteamID64 mediante SteamWebAPI.`
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

                embeds: [
                    embed
                ]

            });
        }

        console.log(
            `[STEAM] SteamID64 final: ${steamID64}`
        );

        // =================================================
        // 6. DATOS STEAM
        // =================================================

        const nombreSteam =

            steamProfile?.personaname ||

            steamProfile?.displayname ||

            steamProfile?.accountname ||

            jugador.name;

        const avatar =

            steamProfile?.avatarfull ||

            steamProfile?.avatarmedium ||

            steamProfile?.avatar ||

            null;

        const profileURL =

            steamProfile?.profileurl ||

            steamProfile?.profilesteamurl ||

            `https://steamcommunity.com/profiles/${steamID64}`;

        // =================================================
        // 7. EMBED
        // =================================================

        const embed =
            new EmbedBuilder()

                .setColor(
                    0x1b2838
                )

                .setTitle(
                    `🎮 ${nombreSteam}`
                )

                .setURL(
                    profileURL
                );

        if (
            avatar
        ) {

            embed.setThumbnail(
                avatar
            );
        }

        embed.addFields(

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
                    "👤 Nombre Steam",

                value:
                    mostrarValor(
                        steamProfile?.personaname ||
                        steamProfile?.displayname ||
                        steamProfile?.accountname
                    ),

                inline:
                    true
            },

            {

                name:
                    "🏷️ Account Name",

                value:
                    mostrarValor(
                        steamProfile?.accountname
                    ),

                inline:
                    true
            },

            {

                name:
                    "⭐ Nivel",

                value:
                    mostrarValor(
                        steamProfile?.level
                    ),

                inline:
                    true
            },

            {

                name:
                    "💰 Worth",

                value:
                    mostrarValor(
                        steamProfile?.worth
                    ),

                inline:
                    true
            },

            {

                name:
                    "🛡️ VAC",

                value:
                    obtenerEstadoVAC(
                        steamProfile?.vac
                    ),

                inline:
                    true
            },

            {

                name:
                    "📅 Cuenta creada",

                value:
                    formatearFechaUnix(
                        steamProfile?.timecreated
                    ),

                inline:
                    true
            },

            {

                name:
                    "🌎 País",

                value:
                    mostrarValor(
                        steamProfile?.loccountrycode
                    ),

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
        );

        embed.setFooter({

            text:
                "RustLogix • BattleMetrics + SteamWebAPI"

        });

        // =================================================
        // 8. BOTONES
        // =================================================

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

        // =================================================
        // 9. RESPONDER
        // =================================================

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