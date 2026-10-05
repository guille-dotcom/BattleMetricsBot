const axios = require("axios");
const { EmbedBuilder } = require("discord.js");

const KickDropsMonitor =
    require("../models/KickDropsMonitor");

const StreamerRole =
    require("../models/StreamerRoleSchema");

// ============================================================
// CONFIGURACIÓN
// ============================================================

const KICK_CLIENT_ID =
    process.env.KICK_CLIENT_ID;

const KICK_CLIENT_SECRET =
    process.env.KICK_CLIENT_SECRET;

const KICK_API_URL =
    "https://api.kick.com/public/v2";

const KICK_OAUTH_URL =
    "https://id.kick.com/oauth/token";

const KICK_DROPS_URL =
    "https://kick.facepunch.com/?s=WWW.RUST";

const KICK_RUST_URL =
    "https://kick.com/category/rust";

const INTERVALO_KICK =
    60 * 1000;

let kickAppToken = null;
let kickAppTokenExpiresAt = 0;

let kickDropsRevisando = false;
let kickDropsAutomaticosIniciados = false;

let kickRustCategoryId = null;

// ============================================================
// UTILIDADES
// ============================================================

function normalizarTexto(texto) {
    return String(texto || "")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizarLogin(login) {
    return String(login || "")
        .trim()
        .toLowerCase()
        .replace(/^@/, "");
}

function escaparRegExp(texto) {
    return String(texto || "")
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodificarHtml(texto) {
    if (!texto) {
        return "";
    }

    return String(texto)
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&#x2F;/gi, "/")
        .replace(/&#47;/gi, "/")
        .replace(/&nbsp;/gi, " ");
}

function limpiarHtml(texto) {
    if (!texto) {
        return "";
    }

    return decodificarHtml(
        String(texto)
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/p>/gi, "\n")
            .replace(/<\/div>/gi, "\n")
            .replace(/<[^>]+>/g, " ")
    );
}

function limpiarNombreStreamer(nombre) {
    if (!nombre) {
        return null;
    }

    const limpio = limpiarHtml(nombre)
        .replace(/^@/, "")
        .replace(/\s+/g, " ")
        .trim();

    if (!limpio) {
        return null;
    }

    return limpio;
}

function limpiarUrlImagen(url) {
    if (!url) {
        return null;
    }

    let limpio = decodificarHtml(
        String(url).trim()
    );

    limpio = limpio
        .replace(/^["']/, "")
        .replace(/["']$/, "")
        .trim();

    if (!/^https?:\/\//i.test(limpio)) {
        return null;
    }

    return limpio;
}

function esImagenValida(url) {
    return /^https?:\/\//i.test(
        String(url || "")
    );
}

// ============================================================
// TIEMPOS
// ============================================================

function convertirHoras(valor) {
    if (
        valor === null ||
        valor === undefined
    ) {
        return null;
    }

    const texto = String(valor)
        .replace(",", ".")
        .trim();

    if (!texto) {
        return null;
    }

    const horasMatch = texto.match(
        /([\d.]+)\s*(?:hours?|hrs?|h|horas?)/i
    );

    if (horasMatch) {
        const numero =
            Number(horasMatch[1]);

        if (Number.isFinite(numero)) {
            return numero;
        }
    }

    const minutosMatch = texto.match(
        /([\d.]+)\s*(?:minutes?|mins?|minutos?)/i
    );

    if (minutosMatch) {
        const minutos =
            Number(minutosMatch[1]);

        if (Number.isFinite(minutos)) {
            return minutos / 60;
        }
    }

    const numero =
        Number(texto);

    if (Number.isFinite(numero)) {
        return numero;
    }

    return null;
}

function formatearHoras(horas) {
    if (
        horas === null ||
        horas === undefined
    ) {
        return "Tiempo requerido no disponible";
    }

    const numero =
        Number(horas);

    if (!Number.isFinite(numero)) {
        return "Tiempo requerido no disponible";
    }

    const minutosExactos =
        numero * 60;

    if (
        Number.isFinite(minutosExactos) &&
        minutosExactos > 0 &&
        minutosExactos < 60
    ) {
        const minutos =
            Math.round(minutosExactos);

        return minutos === 1
            ? "1 minuto"
            : `${minutos} minutos`;
    }

    if (numero === 1) {
        return "1 hora";
    }

    if (
        Number.isInteger(numero)
    ) {
        return `${numero} horas`;
    }

    const redondeado =
        Number(numero.toFixed(2));

    return `${redondeado} horas`;
}

// ============================================================
// URL STREAMER
// ============================================================

function obtenerUrlStreamerKick(login) {
    const limpio =
        normalizarLogin(login);

    if (!limpio) {
        return null;
    }

    return `https://kick.com/${encodeURIComponent(
        limpio
    )}`;
}

// ============================================================
// TOKEN KICK
// ============================================================

async function obtenerKickAppToken() {
    if (
        kickAppToken &&
        Date.now() <
            kickAppTokenExpiresAt -
                60 * 1000
    ) {
        return kickAppToken;
    }

    if (
        !KICK_CLIENT_ID ||
        !KICK_CLIENT_SECRET
    ) {
        throw new Error(
            "Faltan KICK_CLIENT_ID y/o KICK_CLIENT_SECRET en las variables de entorno."
        );
    }

    try {
        const response =
            await axios.post(
                KICK_OAUTH_URL,
                new URLSearchParams({
                    grant_type:
                        "client_credentials",
                    client_id:
                        KICK_CLIENT_ID,
                    client_secret:
                        KICK_CLIENT_SECRET
                }).toString(),
                {
                    headers: {
                        "Content-Type":
                            "application/x-www-form-urlencoded",
                        Accept:
                            "application/json"
                    },
                    timeout: 30000
                }
            );

        const data =
            response.data || {};

        if (!data.access_token) {
            throw new Error(
                "Kick no devolvió access_token."
            );
        }

        kickAppToken =
            data.access_token;

        kickAppTokenExpiresAt =
            Date.now() +
            Number(
                data.expires_in ||
                3600
            ) *
                1000;

        console.log(
            "[Kick Drops] Access token obtenido correctamente."
        );

        return kickAppToken;
    } catch (error) {
        const status =
            error.response?.status;

        const data =
            error.response?.data;

        console.error(
            "[Kick Drops] Error obteniendo App Access Token:",
            status || "",
            data || error.message
        );

        throw error;
    }
}

// ============================================================
// REQUEST API KICK
// ============================================================

async function kickApiGet(
    url,
    params = {}
) {
    const token =
        await obtenerKickAppToken();

    try {
        const response =
            await axios.get(url, {
                params,
                headers: {
                    Authorization:
                        `Bearer ${token}`,
                    Accept:
                        "application/json"
                },
                timeout: 30000
            });

        return response.data;
    } catch (error) {
        if (
            error.response?.status ===
            401
        ) {
            kickAppToken = null;
            kickAppTokenExpiresAt = 0;
        }

        console.error(
            "[Kick Drops] Error API:",
            error.response?.status ||
                "",
            error.response?.data ||
                error.message
        );

        throw error;
    }
}

// ============================================================
// CATEGORÍA RUST
// ============================================================

async function obtenerCategoriaRustKick() {
    if (kickRustCategoryId) {
        return kickRustCategoryId;
    }

    try {
        console.log(
            "[Kick Drops] Buscando categoría Rust en Kick..."
        );

        const respuesta =
            await kickApiGet(
                `${KICK_API_URL}/categories`,
                {
                    name: "Rust",
                    limit: 25
                }
            );

        const categorias =
            Array.isArray(
                respuesta?.data
            )
                ? respuesta.data
                : [];

        const categoria =
            categorias.find(
                (item) => {
                    const nombre =
                        String(
                            item?.name ||
                                ""
                        )
                            .trim()
                            .toLowerCase();

                    const slug =
                        String(
                            item?.slug ||
                                ""
                        )
                            .trim()
                            .toLowerCase();

                    return (
                        nombre ===
                            "rust" ||
                        slug ===
                            "rust"
                    );
                }
            );

        if (!categoria?.id) {
            console.error(
                "[Kick Drops] Categorías recibidas:",
                categorias.map(
                    (item) => ({
                        id:
                            item?.id,
                        name:
                            item?.name,
                        slug:
                            item?.slug
                    })
                )
            );

            throw new Error(
                "No se encontró la categoría Rust en Kick."
            );
        }

        kickRustCategoryId =
            categoria.id;

        console.log(
            `[Kick Drops] Categoría Rust encontrada: ${kickRustCategoryId}`
        );

        return kickRustCategoryId;
    } catch (error) {
        console.error(
            "[Kick Drops] No se pudo obtener la categoría Rust:",
            error.response?.data ||
                error.message
        );

        return null;
    }
}

// ============================================================
// STREAMS RUST ONLINE
// ============================================================

async function obtenerStreamsRustKick() {
    const categoriaId =
        await obtenerCategoriaRustKick();

    if (!categoriaId) {
        return [];
    }

    try {
        const respuesta =
            await kickApiGet(
                `${KICK_API_URL}/livestreams`,
                {
                    category_id:
                        categoriaId,
                    limit: 100
                }
            );

        const streams =
            Array.isArray(
                respuesta?.data
            )
                ? respuesta.data
                : [];

        return streams.filter(
            (stream) => {
                const categoria =
                    String(
                        stream
                            ?.category
                            ?.name ||
                            stream
                                ?.category
                                ?.slug ||
                            ""
                    )
                        .trim()
                        .toLowerCase();

                return (
                    stream
                        ?.category
                        ?.id ==
                        categoriaId ||
                    categoria ===
                        "rust"
                );
            }
        );
    } catch (error) {
        console.error(
            "[Kick Drops] Error obteniendo streams Rust:",
            error.response?.data ||
                error.message
        );

        return [];
    }
}

// ============================================================
// STREAMERS ONLINE EN RUST
// ============================================================

async function obtenerStreamersKickOnline(
    logins = []
) {
    const streams =
        await obtenerStreamsRustKick();

    const buscados =
        new Set(
            logins
                .map(normalizarLogin)
                .filter(Boolean)
        );

    const resultados = [];

    for (
        const stream of streams
    ) {
        const login =
            normalizarLogin(
                stream
                    ?.broadcaster_user
                    ?.username ||
                    stream
                        ?.channel
                        ?.slug ||
                    ""
            );

        if (!login) {
            continue;
        }

        if (
            buscados.size > 0 &&
            !buscados.has(login)
        ) {
            continue;
        }

        resultados.push({
            login,

            username:
                stream
                    ?.broadcaster_user
                    ?.username ||
                stream
                    ?.channel
                    ?.slug ||
                login,

            userId:
                stream
                    ?.broadcaster_user
                    ?.id ||
                null,

            channelId:
                stream
                    ?.channel
                    ?.slug ||
                null,

            titulo:
                stream?.title ||
                "",

            viewerCount:
                Number(
                    stream
                        ?.viewer_count ||
                        0
                ),

            thumbnail:
                stream?.thumbnail ||
                null,

            profilePicture:
                stream
                    ?.broadcaster_user
                    ?.profile_picture ||
                null,

            startedAt:
                stream?.started_at ||
                null,

            categoria:
                stream
                    ?.category
                    ?.name ||
                "Rust",

            url:
                obtenerUrlStreamerKick(
                    login
                )
        });
    }

    return resultados;
}

// ============================================================
// STREAMERS CONFIGURADOS EN RUSTLOGIX
// ============================================================

async function obtenerStreamersKickConfigurados(
    guildId
) {
    if (!guildId) {
        return [];
    }

    try {
        const registros =
            await StreamerRole.find({
                guildId,
                platform: "kick"
            }).lean();

        return registros
            .map(
                (registro) => ({
                    streamerName:
                        registro.streamerName,

                    login:
                        normalizarLogin(
                            registro.streamerName
                        ),

                    roleId:
                        registro.roleId
                })
            )
            .filter(
                (registro) =>
                    registro.login
            );
    } catch (error) {
        console.error(
            "[Kick Drops] Error leyendo streamers Kick configurados:",
            error.message
        );

        return [];
    }
}

// ============================================================
// RUST DROPS - DESCARGA DE FACEPUNCH
// ============================================================

async function obtenerHtmlKickDrops() {
    try {
        const response =
            await axios.get(
                KICK_DROPS_URL,
                {
                    headers: {
                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36",

                        Accept:
                            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
                    },

                    timeout: 30000
                }
            );

        return response.data || "";
    } catch (error) {
        console.error(
            "[Kick Drops] Error descargando página de Facepunch:",
            error.message
        );

        return "";
    }
}

// ============================================================
// PARSER DE DROPS
// ============================================================

function extraerJsonEmbebido(
    html
) {
    const resultados = [];

    if (!html) {
        return resultados;
    }

    const patrones = [
        /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi,

        /<script[^>]*>([\s\S]*?campaign[\s\S]*?)<\/script>/gi
    ];

    for (
        const patron of patrones
    ) {
        let match;

        while (
            (match =
                patron.exec(html)) !==
            null
        ) {
            const contenido =
                match[1]?.trim();

            if (!contenido) {
                continue;
            }

            try {
                const json =
                    JSON.parse(
                        decodificarHtml(
                            contenido
                        )
                    );

                resultados.push(json);
            } catch {
                // Algunos scripts no son JSON válido.
            }
        }
    }

    return resultados;
}

function buscarObjetosDrop(
    objeto,
    salida = []
) {
    if (
        !objeto ||
        typeof objeto !==
            "object"
    ) {
        return salida;
    }

    if (Array.isArray(objeto)) {
        for (
            const item of objeto
        ) {
            buscarObjetosDrop(
                item,
                salida
            );
        }

        return salida;
    }

    const keys =
        Object.keys(objeto);

    const tieneNombre =
        keys.some((key) =>
            [
                "name",
                "display_name",
                "displayName",
                "title"
            ].includes(key)
        );

    const pareceDrop =
        keys.some((key) =>
            [
                "hours",
                "required_hours",
                "requiredHours",
                "duration",
                "minutes",
                "reward"
            ].includes(key)
        );

    if (
        tieneNombre &&
        pareceDrop
    ) {
        salida.push(objeto);
    }

    for (
        const key of keys
    ) {
        const valor =
            objeto[key];

        if (
            valor &&
            typeof valor ===
                "object"
        ) {
            buscarObjetosDrop(
                valor,
                salida
            );
        }
    }

    return salida;
}

function extraerImagenDeObjeto(
    objeto
) {
    const posibles = [
        objeto?.image,
        objeto?.image_url,
        objeto?.imageUrl,
        objeto?.thumbnail,
        objeto?.thumbnail_url,
        objeto?.thumbnailUrl,
        objeto?.icon,
        objeto?.icon_url,
        objeto?.reward?.image,
        objeto?.reward?.image_url
    ];

    for (
        const valor of posibles
    ) {
        const url =
            limpiarUrlImagen(
                valor
            );

        if (
            esImagenValida(url)
        ) {
            return url;
        }
    }

    return null;
}

function extraerStreamersDeObjeto(
    objeto
) {
    const candidatos = [];

    const posibles = [
        objeto?.streamer,
        objeto?.streamers,
        objeto?.channel,
        objeto?.channels,
        objeto?.creator,
        objeto?.broadcaster,
        objeto?.required_streamer,
        objeto?.requiredStreamer
    ];

    for (
        const valor of posibles
    ) {
        if (Array.isArray(valor)) {
            for (
                const item of valor
            ) {
                if (
                    typeof item ===
                    "string"
                ) {
                    candidatos.push(
                        item
                    );
                } else if (
                    item &&
                    typeof item ===
                        "object"
                ) {
                    candidatos.push(
                        item.slug ||
                        item.username ||
                        item.name ||
                        item.login
                    );
                }
            }
        } else if (
            typeof valor ===
            "string"
        ) {
            candidatos.push(
                valor
            );
        } else if (
            valor &&
            typeof valor ===
                "object"
        ) {
            candidatos.push(
                valor.slug ||
                valor.username ||
                valor.name ||
                valor.login
            );
        }
    }

    return [
        ...new Set(
            candidatos
                .map(
                    limpiarNombreStreamer
                )
                .filter(Boolean)
                .map(
                    normalizarLogin
                )
        )
    ];
}

function extraerHorasDeObjeto(
    objeto
) {
    const posibles = [
        objeto?.hours,
        objeto?.required_hours,
        objeto?.requiredHours,
        objeto?.watch_hours,
        objeto?.watchHours
    ];

    for (
        const valor of posibles
    ) {
        const horas =
            convertirHoras(
                valor
            );

        if (
            horas !== null
        ) {
            return horas;
        }
    }

    const minutos =
        Number(
            objeto?.minutes ??
            objeto?.required_minutes ??
            objeto?.requiredMinutes
        );

    if (
        Number.isFinite(minutos) &&
        minutos > 0
    ) {
        return minutos / 60;
    }

    const duracion =
        String(
            objeto?.duration ||
                ""
        );

    if (duracion) {
        return convertirHoras(
            duracion
        );
    }

    return null;
}

function convertirObjetoEnDrop(
    objeto,
    indice
) {
    const nombre =
        objeto?.name ||
        objeto?.display_name ||
        objeto?.displayName ||
        objeto?.title ||
        objeto?.reward?.name ||
        `Drop de Rust #${indice + 1}`;

    const streamers =
        extraerStreamersDeObjeto(
            objeto
        );

    const horas =
        extraerHorasDeObjeto(
            objeto
        );

    const imagen =
        extraerImagenDeObjeto(
            objeto
        );

    const id =
        String(
            objeto?.id ||
            objeto?.drop_id ||
            objeto?.dropId ||
            objeto?.reward?.id ||
            `${normalizarLogin(
                nombre
            )}-${indice}`
        );

    return {
        id,

        nombre:
            normalizarTexto(
                decodificarHtml(
                    nombre
                )
            ),

        horas,

        streamer:
            streamers.length > 0
                ? streamers[0]
                : null,

        streamers,

        imagen,

        enlace:
            streamers.length > 0
                ? obtenerUrlStreamerKick(
                      streamers[0]
                  )
                : KICK_DROPS_URL,

        streamerEspecifico:
            streamers.length > 0,

        online: false,

        canalesOnline: []
    };
}

function extraerDropsDesdeJson(
    html
) {
    const scripts =
        extraerJsonEmbebido(
            html
        );

    const candidatos = [];

    for (
        const json of scripts
    ) {
        buscarObjetosDrop(
            json,
            candidatos
        );
    }

    const drops = [];

    for (
        let i = 0;
        i < candidatos.length;
        i++
    ) {
        const drop =
            convertirObjetoEnDrop(
                candidatos[i],
                i
            );

        if (!drop.nombre) {
            continue;
        }

        drops.push(drop);
    }

    return drops;
}

function extraerAtributo(
    html,
    atributo
) {
    const patron =
        new RegExp(
            `${escaparRegExp(
                atributo
            )}\\s*=\\s*["']([^"']+)["']`,
            "i"
        );

    const match =
        String(html || "")
            .match(patron);

    return match
        ? decodificarHtml(
              match[1]
          )
        : null;
}

function extraerDropsDesdeHtml(
    html
) {
    const drops = [];

    if (!html) {
        return drops;
    }

    /*
     * Fallback genérico:
     *
     * Busca bloques que contengan nombres de recompensas
     * y datos de tiempo.
     */

    const bloques =
        html.match(
            /<(?:article|section|div|li)[^>]*>[\s\S]{0,8000}?<\/(?:article|section|div|li)>/gi
        ) || [];

    for (
        let i = 0;
        i < bloques.length;
        i++
    ) {
        const bloque =
            bloques[i];

        const texto =
            normalizarTexto(
                limpiarHtml(
                    bloque
                )
            );

        if (!texto) {
            continue;
        }

        const tieneDrop =
            /drop|reward|recompensa/i.test(
                texto
            );

        const tieneTiempo =
            /hours?|horas?|mins?|minutes?|minutos?/i.test(
                texto
            );

        if (
            !tieneDrop ||
            !tieneTiempo
        ) {
            continue;
        }

        const imagen =
            extraerAtributo(
                bloque,
                "src"
            ) ||
            extraerAtributo(
                bloque,
                "data-src"
            );

        let horas =
            convertirHoras(
                texto
            );

        if (horas === null) {
            const minutosMatch =
                texto.match(
                    /(\d+(?:[.,]\d+)?)\s*(?:minutes?|mins?|minutos?)/i
                );

            if (
                minutosMatch
            ) {
                horas =
                    Number(
                        minutosMatch[1]
                            .replace(
                                ",",
                                "."
                            )
                    ) / 60;
            }
        }

        if (
            horas === null &&
            !/drop/i.test(
                texto
            )
        ) {
            continue;
        }

        const streamerMatches =
            texto.match(
                /(?:kick\.com\/|@)([a-zA-Z0-9_.-]{2,50})/g
            ) || [];

        const streamers =
            [
                ...new Set(
                    streamerMatches
                        .map(
                            (valor) =>
                                valor
                                    .replace(
                                        /^.*kick\.com\//i,
                                        ""
                                    )
                                    .replace(
                                        /^@/,
                                        ""
                                    )
                        )
                        .map(
                            normalizarLogin
                        )
                        .filter(
                            Boolean
                        )
                )
            ];

        const nombre =
            texto
                .replace(
                    /(?:\d+(?:[.,]\d+)?)\s*(?:hours?|horas?|minutes?|mins?|minutos?)/gi,
                    ""
                )
                .slice(0, 120)
                .trim();

        if (!nombre) {
            continue;
        }

        drops.push({
            id:
                `${normalizarLogin(
                    nombre
                )}-${i}`,

            nombre,

            horas,

            streamer:
                streamers[0] ||
                null,

            streamers,

            imagen:
                limpiarUrlImagen(
                    imagen
                ),

            enlace:
                streamers[0]
                    ? obtenerUrlStreamerKick(
                          streamers[0]
                      )
                    : KICK_DROPS_URL,

            streamerEspecifico:
                streamers.length > 0,

            online: false,

            canalesOnline: []
        });
    }

    return drops;
}

// ============================================================
// CAMPAÑA
// ============================================================

function extraerCampana(html) {
    const texto =
        normalizarTexto(
            limpiarHtml(html)
        );

    let nombre = null;

    const patronesNombre = [
        /(?:campaign|campaña)\s*[:\-]\s*([^|]{3,120})/i,

        /(?:active campaign|campaña activa)\s*[:\-]\s*([^|]{3,120})/i
    ];

    for (
        const patron of patronesNombre
    ) {
        const match =
            texto.match(patron);

        if (match?.[1]) {
            nombre =
                normalizarTexto(
                    match[1]
                );

            break;
        }
    }

    if (!nombre) {
        const titleMatch =
            String(html || "")
                .match(
                    /<title[^>]*>([\s\S]*?)<\/title>/i
                );

        if (titleMatch?.[1]) {
            nombre =
                normalizarTexto(
                    limpiarHtml(
                        titleMatch[1]
                    )
                );
        }
    }

    return {
        nombre:
            nombre ||
            "Rust Drops en Kick",

        theme: null,

        fechaInicio: null,

        fechaFin: null
    };
}

function crearCampaignKey(
    campana,
    drops
) {
    const contenido =
        JSON.stringify({
            nombre:
                campana?.nombre ||
                "",

            theme:
                campana?.theme ||
                "",

            fechaInicio:
                campana?.fechaInicio ||
                null,

            fechaFin:
                campana?.fechaFin ||
                null,

            drops:
                (drops || []).map(
                    (drop) => ({
                        id: drop.id,

                        nombre:
                            drop.nombre,

                        horas:
                            drop.horas,

                        streamers:
                            drop.streamers
                    })
                )
        });

    let hash = 0;

    for (
        let i = 0;
        i < contenido.length;
        i++
    ) {
        hash =
            (hash << 5) -
            hash +
            contenido.charCodeAt(i);

        hash |= 0;
    }

    return `kick-${Math.abs(
        hash
    )}`;
}

// ============================================================
// OBTENER DROPS KICK
// ============================================================

async function obtenerDropsKick() {
    const html =
        await obtenerHtmlKickDrops();

    if (!html) {
        return {
            campaignKey: null,

            campaignName:
                "Rust Drops en Kick",

            campaignTheme: null,

            fechaInicio: null,

            fechaFin: null,

            drops: []
        };
    }

    let drops =
        extraerDropsDesdeJson(
            html
        );

    if (
        drops.length === 0
    ) {
        drops =
            extraerDropsDesdeHtml(
                html
            );
    }

    /*
     * El parser puede encontrar el mismo Drop
     * más de una vez si Facepunch incluye el
     * objeto en diferentes scripts.
     */

    const vistos =
        new Set();

    drops =
        drops.filter(
            (drop) => {
                const key =
                    [
                        normalizarLogin(
                            drop.nombre
                        ),

                        drop.horas,

                        ...(drop.streamers ||
                            [])
                    ].join("|");

                if (
                    vistos.has(key)
                ) {
                    return false;
                }

                vistos.add(key);

                return true;
            }
        );

    const campana =
        extraerCampana(
            html
        );

    const campaignKey =
        crearCampaignKey(
            campana,
            drops
        );

    return {
        campaignKey,

        campaignName:
            campana.nombre,

        campaignTheme:
            campana.theme,

        fechaInicio:
            campana.fechaInicio,

        fechaFin:
            campana.fechaFin,

        drops
    };
}

// ============================================================
// ESTADO ONLINE DE LOS DROPS
// ============================================================

async function actualizarEstadoDrops(
    datos
) {
    if (
        !datos?.drops?.length
    ) {
        return datos;
    }

    const todosLosStreamers =
        [
            ...new Set(
                datos.drops.flatMap(
                    (drop) =>
                        drop.streamers ||
                        []
                )
            )
        ];

    const streams =
        await obtenerStreamersKickOnline(
            todosLosStreamers
        );

    const onlineMap =
        new Map(
            streams.map(
                (stream) => [
                    normalizarLogin(
                        stream.login
                    ),
                    stream
                ]
            )
        );

    for (
        const drop of datos.drops
    ) {
        const streamers =
            drop.streamers || [];

        const canalesOnline =
            streamers.filter(
                (login) =>
                    onlineMap.has(
                        normalizarLogin(
                            login
                        )
                    )
            );

        drop.canalesOnline =
            canalesOnline;

        drop.online =
            canalesOnline.length >
            0;
    }

    return datos;
}

// ============================================================
// EMBED INDIVIDUAL
// ============================================================

function crearEmbedKickDrop(
    drop,
    datos
) {
    const color =
        drop.streamerEspecifico
            ? 0x53fc18
            : 0x9146ff;

    const embed =
        new EmbedBuilder()
            .setColor(color)

            .setTitle(
                `🎯 ${
                    drop.nombre ||
                    "Drop de Rust"
                }`
            )

            .setURL(
                drop.enlace ||
                    KICK_DROPS_URL
            )

            .setDescription(
                drop.horas !== null &&
                drop.horas !== undefined
                    ? `⏱️ **${formatearHoras(
                          drop.horas
                      )}**`
                    : "⏱️ Tiempo requerido no disponible"
            );

    if (
        drop.streamers?.length
    ) {
        const nombres =
            drop.streamers
                .map(
                    (login) => {
                        const online =
                            drop.canalesOnline?.includes(
                                login
                            );

                        const url =
                            obtenerUrlStreamerKick(
                                login
                            );

                        return online
                            ? `🟢 [${login}](${url})`
                            : `⚫ [${login}](${url})`;
                    }
                )
                .join("\n");

        embed.addFields({
            name:
                drop.streamerEspecifico
                    ? "🎥 Streamer requerido"
                    : "🎥 Streamers",

            value:
                nombres ||
                "No disponible",

            inline: false
        });
    } else {
        embed.addFields({
            name:
                "📺 Dónde conseguirlo",

            value:
                `[Todos los streams de Rust con Drops Enabled](${KICK_RUST_URL})`,

            inline: false
        });
    }

    if (
        esImagenValida(
            drop.imagen
        )
    ) {
        embed.setImage(
            drop.imagen
        );
    }

    const cantidadOnline =
        drop.canalesOnline?.length ||
        0;

    embed.addFields({
        name:
            "📡 Estado",

        value:
            cantidadOnline > 0
                ? `🟢 ${cantidadOnline} streamer(s) online en Rust`
                : "⚫ Ningún streamer específico online",

        inline: false
    });

    embed.setFooter({
        text:
            `RustLogix • Kick Drops${
                datos?.campaignName
                    ? ` • ${datos.campaignName}`
                    : ""
            }`
    });

    return embed;
}

// ============================================================
// EMBEDS
// ============================================================

function crearEmbedsKickDrops(
    datos
) {
    if (
        !datos?.drops?.length
    ) {
        return [];
    }

    return datos.drops.map(
        (drop) =>
            crearEmbedKickDrop(
                drop,
                datos
            )
    );
}

function crearGruposMensajesKickDrops(
    datos
) {
    const embeds =
        crearEmbedsKickDrops(
            datos
        );

    const grupos = [];

    /*
     * Discord permite hasta 10 embeds por mensaje.
     */

    for (
        let i = 0;
        i < embeds.length;
        i += 10
    ) {
        grupos.push(
            embeds.slice(
                i,
                i + 10
            )
        );
    }

    return grupos;
}

// ============================================================
// COMPARACIÓN DE ESTADO
// ============================================================

function estadosOnlineCambiarion(
    anteriores = [],
    nuevos = []
) {
    const anteriorMap =
        new Map(
            anteriores.map(
                (drop) => [
                    drop.id,
                    Boolean(
                        drop.online
                    )
                ]
            )
        );

    const cambios = [];

    for (
        const drop of nuevos
    ) {
        const anterior =
            anteriorMap.get(
                drop.id
            );

        const actual =
            Boolean(
                drop.online
            );

        if (
            anterior !== undefined &&
            anterior !== actual
        ) {
            cambios.push({
                drop,
                anterior,
                actual
            });
        }
    }

    return cambios;
}

// ============================================================
// MENSAJE DE STREAMER ONLINE
// ============================================================

async function enviarAvisoStreamerOnlineKick(
    channel,
    streams
) {
    if (
        !channel ||
        !streams?.length
    ) {
        return;
    }

    const lineas =
        streams.map(
            (stream) => {
                const viewers =
                    Number(
                        stream.viewerCount ||
                            0
                    );

                return (
                    `🟢 **${stream.username}** está **ONLINE EN RUST en Kick** — ${viewers} espectador(es)\n` +
                    `🔗 ${stream.url}`
                );
            }
        );

    await channel.send({
        content:
            `🎥 **Streamer de Rust online en Kick**\n\n${lineas.join(
                "\n\n"
            )}`
    });
}

// ============================================================
// PUBLICAR / ACTUALIZAR DROPS
// ============================================================

async function publicarKickDropsEnCanal(
    channel,
    datos,
    opciones = {}
) {
    if (!channel) {
        throw new Error(
            "Canal de Discord no válido."
        );
    }

    if (
        !datos ||
        !Array.isArray(
            datos.drops
        ) ||
        datos.drops.length === 0
    ) {
        return null;
    }

    const guildId =
        channel.guild?.id;

    if (!guildId) {
        throw new Error(
            "El canal no pertenece a un servidor."
        );
    }

    let monitor =
        await KickDropsMonitor.findOne(
            {
                guildId,
                channelId:
                    channel.id
            }
        );

    const grupos =
        crearGruposMensajesKickDrops(
            datos
        );

    const mensajesExistentes =
        [];

    if (
        monitor?.messageIds?.length
    ) {
        for (
            const messageId of
                monitor.messageIds
        ) {
            try {
                const mensaje =
                    await channel.messages.fetch(
                        messageId
                    );

                if (mensaje) {
                    mensajesExistentes.push(
                        mensaje
                    );
                }
            } catch {
                // El mensaje pudo haber sido eliminado.
            }
        }
    }

    const mismaCampana =
        monitor &&
        monitor.campaignKey ===
            datos.campaignKey;

    if (
        mismaCampana &&
        mensajesExistentes.length ===
            grupos.length
    ) {
        const nuevosIds = [];

        for (
            let i = 0;
            i < grupos.length;
            i++
        ) {
            const mensaje =
                mensajesExistentes[i];

            await mensaje.edit({
                embeds:
                    grupos[i]
            });

            nuevosIds.push(
                mensaje.id
            );
        }

        monitor.messageIds =
            nuevosIds;

        monitor.campaignName =
            datos.campaignName;

        monitor.campaignTheme =
            datos.campaignTheme;

        monitor.fechaInicio =
            datos.fechaInicio;

        monitor.fechaFin =
            datos.fechaFin;

        monitor.drops =
            datos.drops;

        monitor.ultimaRevision =
            new Date();

        monitor.active =
            true;

        await monitor.save();

        return monitor;
    }

    /*
     * Campaña nueva o cantidad de mensajes diferente.
     * Borramos únicamente los mensajes que RustLogix
     * tenía registrados.
     */

    for (
        const mensaje of
            mensajesExistentes
    ) {
        try {
            await mensaje.delete();
        } catch {
            // Ya eliminado.
        }
    }

    const nuevosMensajes =
        [];

    for (
        const embeds of grupos
    ) {
        const mensaje =
            await channel.send({
                embeds
            });

        nuevosMensajes.push(
            mensaje.id
        );
    }

    if (!monitor) {
        monitor =
            new KickDropsMonitor({
                guildId,
                channelId:
                    channel.id
            });
    }

    monitor.messageIds =
        nuevosMensajes;

    monitor.campaignKey =
        datos.campaignKey;

    monitor.campaignName =
        datos.campaignName;

    monitor.campaignTheme =
        datos.campaignTheme;

    monitor.fechaInicio =
        datos.fechaInicio;

    monitor.fechaFin =
        datos.fechaFin;

    monitor.drops =
        datos.drops;

    monitor.ultimaRevision =
        new Date();

    monitor.active =
        true;

    if (
        opciones.creadoPor
    ) {
        monitor.creadoPor =
            opciones.creadoPor;
    }

    if (
        opciones.notificacionesStreamer !==
        undefined
    ) {
        monitor.notificacionesStreamer =
            opciones.notificacionesStreamer;
    }

    await monitor.save();

    return monitor;
}

// ============================================================
// EDITAR MENSAJES EXISTENTES
// ============================================================

async function editarMensajesMonitorKick(
    channel,
    monitor,
    datos
) {
    if (
        !channel ||
        !monitor?.messageIds?.length
    ) {
        return;
    }

    const grupos =
        crearGruposMensajesKickDrops(
            datos
        );

    if (
        monitor.messageIds.length !==
        grupos.length
    ) {
        return;
    }

    for (
        let i = 0;
        i < grupos.length;
        i++
    ) {
        try {
            const mensaje =
                await channel.messages.fetch(
                    monitor.messageIds[i]
                );

            await mensaje.edit({
                embeds:
                    grupos[i]
            });
        } catch (error) {
            console.error(
                "[Kick Drops] Error editando mensaje:",
                error.message
            );
        }
    }
}

// ============================================================
// ELIMINAR MONITOR
// ============================================================

async function eliminarMensajesMonitorKick(
    channel,
    monitor
) {
    if (!monitor) {
        return;
    }

    for (
        const messageId of
            monitor.messageIds || []
    ) {
        try {
            const mensaje =
                await channel.messages.fetch(
                    messageId
                );

            await mensaje.delete();
        } catch {
            // Ya eliminado o no accesible.
        }
    }

    await KickDropsMonitor.deleteOne({
        _id: monitor._id
    });
}

// ============================================================
// REVISIÓN AUTOMÁTICA
// ============================================================

async function revisarKickDropsAutomaticos(
    client
) {
    if (kickDropsRevisando) {
        return;
    }

    kickDropsRevisando = true;

    try {
        const monitores =
            await KickDropsMonitor.find({
                active: true
            });

        if (!monitores.length) {
            return;
        }

        const datosBase =
            await obtenerDropsKick();

        if (
            !datosBase?.drops?.length
        ) {
            console.log(
                "[Kick Drops] No se encontraron Drops activos."
            );

            return;
        }

        const datos =
            await actualizarEstadoDrops(
                datosBase
            );

        for (
            const monitor of monitores
        ) {
            try {
                const guild =
                    await client.guilds.fetch(
                        monitor.guildId
                    );

                if (!guild) {
                    continue;
                }

                const channel =
                    await guild.channels.fetch(
                        monitor.channelId
                    );

                if (!channel) {
                    continue;
                }

                /*
                 * Si es una campaña nueva, republicamos.
                 */

                if (
                    monitor.campaignKey !==
                    datos.campaignKey
                ) {
                    await publicarKickDropsEnCanal(
                        channel,
                        datos
                    );

                    continue;
                }

                /*
                 * Detectamos cambios online/offline
                 * en los drops específicos.
                 */

                const cambios =
                    estadosOnlineCambiarion(
                        monitor.drops ||
                            [],
                        datos.drops ||
                            []
                    );

                const streamersOnline =
                    [];

                for (
                    const cambio of
                        cambios
                ) {
                    if (
                        cambio.actual &&
                        cambio.drop
                            .streamers
                            ?.length
                    ) {
                        const streams =
                            await obtenerStreamersKickOnline(
                                cambio
                                    .drop
                                    .streamers
                            );

                        streamersOnline.push(
                            ...streams
                        );
                    }
                }

                /*
                 * Actualizamos los embeds.
                 */

                await editarMensajesMonitorKick(
                    channel,
                    monitor,
                    datos
                );

                /*
                 * Avisamos solamente en
                 * OFFLINE -> ONLINE.
                 */

                if (
                    monitor.notificacionesStreamer !==
                        false &&
                    streamersOnline.length
                ) {
                    const unicos =
                        [
                            ...new Map(
                                streamersOnline.map(
                                    (
                                        stream
                                    ) => [
                                        normalizarLogin(
                                            stream.login
                                        ),
                                        stream
                                    ]
                                )
                            ).values()
                        ];

                    await enviarAvisoStreamerOnlineKick(
                        channel,
                        unicos
                    );
                }

                monitor.drops =
                    datos.drops;

                monitor.campaignName =
                    datos.campaignName;

                monitor.campaignTheme =
                    datos.campaignTheme;

                monitor.fechaInicio =
                    datos.fechaInicio;

                monitor.fechaFin =
                    datos.fechaFin;

                monitor.ultimaRevision =
                    new Date();

                await monitor.save();
            } catch (error) {
                console.error(
                    `[Kick Drops] Error revisando monitor ${monitor._id}:`,
                    error.message
                );
            }
        }
    } catch (error) {
        console.error(
            "[Kick Drops] Error en revisión automática:",
            error.message
        );
    } finally {
        kickDropsRevisando = false;
    }
}

// ============================================================
// INICIAR AUTOMÁTICO
// ============================================================

function iniciarKickDropsAutomaticos(
    client
) {
    if (
        kickDropsAutomaticosIniciados
    ) {
        return;
    }

    kickDropsAutomaticosIniciados =
        true;

    console.log(
        "[Kick Drops] Monitor automático iniciado."
    );

    setTimeout(() => {
        revisarKickDropsAutomaticos(
            client
        ).catch((error) => {
            console.error(
                "[Kick Drops] Error en primera revisión:",
                error.message
            );
        });
    }, 5000);

    setInterval(() => {
        revisarKickDropsAutomaticos(
            client
        ).catch((error) => {
            console.error(
                "[Kick Drops] Error en revisión automática:",
                error.message
            );
        });
    }, INTERVALO_KICK);
}

// ============================================================
// PUBLICACIÓN MANUAL
// ============================================================

async function publicarRustDropsKick(
    channel,
    opciones = {}
) {
    const datos =
        await obtenerDropsKick();

    if (
        !datos?.drops?.length
    ) {
        return null;
    }

    const datosConEstado =
        await actualizarEstadoDrops(
            datos
        );

    return publicarKickDropsEnCanal(
        channel,
        datosConEstado,
        opciones
    );
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    obtenerKickAppToken,

    obtenerCategoriaRustKick,

    obtenerStreamsRustKick,

    obtenerStreamersKickOnline,

    obtenerStreamersKickConfigurados,

    obtenerDropsKick,

    actualizarEstadoDrops,

    crearEmbedKickDrop,

    crearEmbedsKickDrops,

    crearGruposMensajesKickDrops,

    publicarKickDropsEnCanal,

    publicarRustDropsKick,

    editarMensajesMonitorKick,

    eliminarMensajesMonitorKick,

    revisarKickDropsAutomaticos,

    iniciarKickDropsAutomaticos
};