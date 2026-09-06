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

const BATTLEMETRICS_BASE =
    "https://www.battlemetrics.com";

const STEAMID_BASE =
    "https://www.steamid.com";

const STEAMWEBAPI_API =
    "https://www.steamwebapi.com";

const BATTLEMETRICS_SERVER_ID =
    "11378166";

const STEAMID64_MIN =
    76561197960265728n;

const STEAMID64_MAX =
    76561202255233023n;

// =====================================================
// USER AGENT
// =====================================================

const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/140.0.0.0 Safari/537.36";

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
            "application/vnd.api+json",

        "User-Agent":
            USER_AGENT
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
// OBTENER ENLACE NAME SEARCH
// =====================================================
// BattleMetrics muestra en el perfil un enlace:
//
// https://www.steamid.com/search?q=NOMBRE
//
// No necesitamos abrir el HTML de BattleMetrics.
// Esto evita el 403 de Cloudflare.
// =====================================================

async function obtenerEnlaceNameSearch(
    playerId,
    nombre
) {

    const searchURL =
        `${STEAMID_BASE}/search?q=${encodeURIComponent(nombre)}`;

    console.log(
        `[STEAMID.COM] Name Search generado desde BattleMetrics: ${searchURL}`
    );

    return searchURL;
}

// =====================================================
// EXTRAER STEAMID64 DE HTML DE STEAMID.COM
// =====================================================

function extraerSteamID64DeHTML(
    html
) {

    if (
        !html
    ) {

        return [];
    }

    const encontrados =
        [];

    // -------------------------------------------------
    // Buscar números de 17 dígitos
    // -------------------------------------------------

    const regex =
        /\b7656119\d{10}\b/g;

    const matches =
        html.match(
            regex
        ) || [];

    for (
        const valor
        of matches
    ) {

        if (
            esSteamID64(valor)
        ) {

            encontrados.push(
                String(valor)
            );
        }
    }

    // -------------------------------------------------
    // Buscar posibles atributos explícitos
    // -------------------------------------------------

    const regexExplicito =
        /(?:steamid64|steamid|steam_id|steam64|steamId64|steamID64)[^0-9]{0,100}(7656119\d{10})/gi;

    let matchExplicito;

    while (
        (matchExplicito =
            regexExplicito.exec(html)) !== null
    ) {

        const valor =
            matchExplicito[1];

        if (
            esSteamID64(valor)
        ) {

            encontrados.push(
                String(valor)
            );
        }
    }

    // -------------------------------------------------
    // DEDUPLICAR
    // -------------------------------------------------

    const unicos =
        [
            ...new Set(
                encontrados
            )
        ];

    console.log(
        `[STEAMID.COM] SteamID64 encontrados en HTML: ${encontrados.length}`
    );

    console.log(
        `[STEAMID.COM] SteamID64 únicos: ${unicos.length}`
    );

    for (
        const steamID64
        of unicos
    ) {

        console.log(
            `[STEAMID.COM] RESULTADO: ${steamID64}`
        );
    }

    return unicos;
}

// =====================================================
// BUSCAR EN STEAMID.COM
// =====================================================

async function buscarEnSteamIDCom(
    searchURL
) {

    if (
        !searchURL
    ) {

        return [];
    }

    console.log(
        "========================================"
    );

    console.log(
        `[STEAMID.COM] Name Search: ${searchURL}`
    );

    console.log(
        "========================================"
    );

    try {

        const response =
            await axios.get(
                searchURL,
                {

                    headers: {

                        "User-Agent":
                            USER_AGENT,

                        Accept:
                            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

                        "Accept-Language":
                            "es-ES,es;q=0.9,en;q=0.8",

                        Referer:
                            "https://www.battlemetrics.com/"
                    },

                    timeout:
                        30000,

                    maxRedirects:
                        5
                }
            );

        console.log(
            `[STEAMID.COM] HTTP: ${response.status}`
        );

        const html =
            String(
                response.data || ""
            );

        console.log(
            `[STEAMID.COM] HTML recibido: ${html.length} caracteres`
        );

        // -------------------------------------------------
        // Detectar Cloudflare
        // -------------------------------------------------

        if (
            /just a moment/i.test(html) ||
            /cf-chl-/i.test(html) ||
            /cloudflare/i.test(html)
        ) {

            console.error(
                "[STEAMID.COM] ❌ SteamID.com devolvió una página de protección/Cloudflare."
            );

            return [];
        }

        const steamIDs =
            extraerSteamID64DeHTML(
                html
            );

        return steamIDs;

    } catch (error) {

        console.error(
            "[STEAMID.COM] Error:",
            error.response?.status ||
            error.message
        );

        if (
            error.response?.status === 403
        ) {

            console.error(
                "[STEAMID.COM] ❌ SteamID.com respondió 403."
            );

            console.error(
                "[STEAMID.COM] No se intenta saltar Cloudflare."
            );
        }

        return [];
    }
}

// =====================================================
// OBTENER PERFIL POR STEAMID64 DESDE STEAMWEBAPI
// =====================================================

async function obtenerPerfilSteamWebAPI(
    steamID64
) {

    const apiKey =
        process.env.STEAMWEBAPI_KEY;

    if (
        !apiKey
    ) {

        console.error(
            "[STEAMWEBAPI] ❌ Falta STEAMWEBAPI_KEY."
        );

        return null;
    }

    console.log(
        `[STEAMWEBAPI] Obteniendo datos de ${steamID64}...`
    );

    try {

        const response =
            await axios.get(
                `${STEAMWEBAPI_API}/steam/api/profile`,
                {

                    params: {

                        id:
                            steamID64,

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
            `[STEAMWEBAPI] HTTP ${response.status} para ${steamID64}`
        );

        const data =
            response.data;

        // -------------------------------------------------
        // Si devuelve directamente un objeto
        // -------------------------------------------------

        if (
            data &&
            typeof data === "object" &&
            !Array.isArray(data)
        ) {

            const perfil =
                convertirPerfilSteamWebAPI(
                    data
                );

            if (
                perfil
            ) {

                return perfil;
            }

            // -------------------------------------------------
            // Algunos formatos pueden venir dentro
            // de data/profile/response/result
            // -------------------------------------------------

            const posibles = [

                data.data,

                data.profile,

                data.response,

                data.result
            ];

            for (
                const objeto
                of posibles
            ) {

                if (
                    objeto &&
                    typeof objeto === "object" &&
                    !Array.isArray(objeto)
                ) {

                    const perfilInterno =
                        convertirPerfilSteamWebAPI(
                            objeto
                        );

                    if (
                        perfilInterno
                    ) {

                        return perfilInterno;
                    }
                }
            }
        }

        // -------------------------------------------------
        // Si devuelve array
        // -------------------------------------------------

        const perfiles =
            obtenerArrayPerfilesSteamWebAPI(
                data
            );

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

                return perfil;
            }
        }

        console.log(
            `[STEAMWEBAPI] ⚠️ No se pudo convertir ${steamID64}`
        );

        return null;

    } catch (error) {

        console.error(
            `[STEAMWEBAPI] Error ${steamID64}:`,
            error.response?.status ||
            error.message
        );

        if (
            error.response?.data
        ) {

            console.error(
                `[STEAMWEBAPI] Respuesta ${steamID64}:`,
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
// OBTENER ARRAY DE PERFILES STEAMWEBAPI
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
// EXTRAER STEAMID64 DE PERFIL
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

    if (
        !steamid
    ) {

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
// MOSTRAR VALOR
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

    if (
        !timestamp
    ) {

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
// CREAR EMBED DE PERFIL
// =====================================================

function crearEmbedPerfil(
    jugador,
    perfil,
    steamID64,
    totalResultados
) {

    const nombreSteam =
        perfil?.personaname ||
        perfil?.displayname ||
        perfil?.accountname ||
        jugador.name;

    const avatar =
        perfil?.avatarfull ||
        perfil?.avatarmedium ||
        perfil?.avatar ||
        null;

    const profileURL =
        perfil?.profileurl ||
        perfil?.profilesteamurl ||
        `https://steamcommunity.com/profiles/${steamID64}`;

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
                    perfil?.personaname ||
                    perfil?.displayname ||
                    perfil?.accountname
                ),

            inline:
                true
        },

        {
            name:
                "🏷️ Account Name",

            value:
                mostrarValor(
                    perfil?.accountname
                ),

            inline:
                true
        },

        {
            name:
                "⭐ Nivel",

            value:
                mostrarValor(
                    perfil?.level
                ),

            inline:
                true
        },

        {
            name:
                "💰 Worth",

            value:
                mostrarValor(
                    perfil?.worth
                ),

            inline:
                true
        },

        {
            name:
                "🛡️ VAC",

            value:
                obtenerEstadoVAC(
                    perfil?.vac
                ),

            inline:
                true
        },

        {
            name:
                "📅 Cuenta creada",

            value:
                formatearFechaUnix(
                    perfil?.timecreated
                ),

            inline:
                true
        },

        {
            name:
                "🌎 País",

            value:
                mostrarValor(
                    perfil?.loccountrycode
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

    if (
        totalResultados > 1
    ) {

        embed.setFooter({

            text:
                `RustLogix • ${totalResultados} cuentas Steam encontradas • SteamID.com`
        });

    } else {

        embed.setFooter({

            text:
                "RustLogix • SteamID.com + SteamWebAPI"
        });
    }

    return {

        embed,

        profileURL
    };
}

// =====================================================
// COMANDO
// =====================================================

module.exports = {

    data:

        new SlashCommandBuilder()

            .setName(
                "steam"
            )

            .setDescription(
                "Busca un jugador de Rust en BattleMetrics y obtiene sus perfiles de Steam"
            )

            .addStringOption(
                option =>
                    option
                        .setName(
                            "nombre"
                        )
                        .setDescription(
                            "Nombre exacto del jugador"
                        )
                        .setRequired(
                            true
                        )
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
        // 1. BUSCAR EN BATTLEMETRICS
        // =================================================

        const jugador =
            await buscarJugadorBattleMetrics(
                nombre
            );

        if (
            !jugador
        ) {

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
        // 2. GENERAR LINK NAME SEARCH
        // =================================================

        const searchURL =
            await obtenerEnlaceNameSearch(
                jugador.id,
                jugador.name
            );

        if (
            !searchURL
        ) {

            const embed =
                new EmbedBuilder()

                    .setColor(
                        0xff9900
                    )

                    .setTitle(
                        "⚠️ Name Search no encontrado"
                    )

                    .setDescription(
                        `Encontré a **${jugador.name}** en BattleMetrics, pero no pude generar el enlace **SteamID.com → Name Search**.`
                    )

                    .addFields({

                        name:
                            "BattleMetrics",

                        value:
                            `[Ver perfil](https://www.battlemetrics.com/players/${jugador.id})`,

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
            `[STEAMID.COM] URL final: ${searchURL}`
        );

        // =================================================
        // 3. BUSCAR EN STEAMID.COM
        // =================================================

        const steamIDs =
            await buscarEnSteamIDCom(
                searchURL
            );

        // =================================================
        // 4. DEDUPLICACIÓN POR STEAMID64
        // =================================================

        const steamIDsUnicos =
            [
                ...new Set(
                    steamIDs.filter(
                        esSteamID64
                    )
                )
            ];

        console.log(
            `[STEAMID.COM] Resultados totales: ${steamIDs.length}`
        );

        console.log(
            `[STEAMID.COM] Cuentas únicas después de deduplicar: ${steamIDsUnicos.length}`
        );

        if (
            steamIDsUnicos.length === 0
        ) {

            const embed =
                new EmbedBuilder()

                    .setColor(
                        0xff9900
                    )

                    .setTitle(
                        "⚠️ No se encontró SteamID64"
                    )

                    .setDescription(
                        `BattleMetrics encontró a **${jugador.name}**, pero **SteamID.com no devolvió ningún SteamID64**.`
                    )

                    .addFields(

                        {

                            name:
                                "🔎 Name Search",

                            value:
                                `[Abrir búsqueda en SteamID.com](${searchURL})`,

                            inline:
                                false
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

            return interaction.editReply({

                embeds: [
                    embed
                ]
            });
        }

        // =================================================
        // 5. OBTENER DATOS DE CADA STEAMID64
        // =================================================

        const perfiles =
            [];

        for (
            const steamID64
            of steamIDsUnicos
        ) {

            const perfil =
                await obtenerPerfilSteamWebAPI(
                    steamID64
                );

            perfiles.push({

                steamid:
                    steamID64,

                perfil
            });
        }

        console.log(
            `[STEAM] Perfiles procesados: ${perfiles.length}`
        );

        // =================================================
        // 6. CREAR EMBEDS
        // =================================================

        const embeds =
            [];

        const botones =
            [];

        for (
            const resultado
            of perfiles
        ) {

            const resultadoEmbed =
                crearEmbedPerfil(

                    jugador,

                    resultado.perfil,

                    resultado.steamid,

                    perfiles.length
                );

            embeds.push(
                resultadoEmbed.embed
            );

            botones.push({

                steamID64:
                    resultado.steamid,

                profileURL:
                    resultadoEmbed.profileURL
            });
        }

        // =================================================
        // DISCORD LIMITA A 10 EMBEDS POR MENSAJE
        // =================================================

        const embedsEnviar =
            embeds.slice(
                0,
                10
            );

        // =================================================
        // 7. BOTONES
        // =================================================

        const components =
            [];

        if (
            botones.length === 1
        ) {

            const perfil =
                botones[0];

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
                                perfil.profileURL
                            ),

                        new ButtonBuilder()

                            .setLabel(
                                "SteamID.com"
                            )

                            .setStyle(
                                ButtonStyle.Link
                            )

                            .setURL(
                                searchURL
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

            components.push(
                row
            );

        } else {

            const row =
                new ActionRowBuilder()

                    .addComponents(

                        new ButtonBuilder()

                            .setLabel(
                                "SteamID.com Name Search"
                            )

                            .setStyle(
                                ButtonStyle.Link
                            )

                            .setURL(
                                searchURL
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

            components.push(
                row
            );
        }

        // =================================================
        // 8. RESPONDER
        // =================================================

        console.log(
            "========================================"
        );

        console.log(
            `[STEAM] Resultado final: ${embedsEnviar.length} perfil(es)`
        );

        console.log(
            "========================================"
        );

        return interaction.editReply({

            embeds:
                embedsEnviar,

            components
        });
    }
};