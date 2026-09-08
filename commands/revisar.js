const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const axios = require("axios");
const ServerConfig = require("../models/ServerConfig");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BM_API = "https://api.battlemetrics.com";

const MIN_JUGADORES_CLAN = 6;
const REQUEST_TIMEOUT = 15000;
const SESSION_CONCURRENCY = 5;

// =====================================================
// HEADERS BATTLEMETRICS
// =====================================================

function getHeaders() {
    const token = process.env.BATTLEMETRICS_TOKEN;

    if (!token) {
        throw new Error(
            "BATTLEMETRICS_TOKEN no está configurado en .env"
        );
    }

    return {
        Accept: "application/vnd.api+json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
    };
}

// =====================================================
// NORMALIZAR NOMBRE
// =====================================================

function normalizarNombre(nombre) {
    return String(nombre || "")
        .trim()
        .replace(/\s+/g, " ");
}

// =====================================================
// NORMALIZAR TAG
// =====================================================

function normalizarTag(tag) {
    if (!tag) {
        return null;
    }

    return String(tag)
        .trim()
        .replace(/\s+/g, " ");
}

// =====================================================
// LIMPIAR TAG
// =====================================================

function limpiarTag(tag) {
    if (!tag) {
        return null;
    }

    let resultado = normalizarTag(tag);

    resultado = resultado
        .replace(/^[|:;,._\-]+/u, "")
        .replace(/[|:;,._\-]+$/u, "")
        .trim();

    return resultado || null;
}

// =====================================================
// DELIMITADORES DE TAGS
// =====================================================

const DELIMITADORES_TAG = [
    ["『", "』"],
    ["【", "】"],
    ["《", "》"],
    ["〈", "〉"],
    ["「", "」"],
    ["[", "]"],
    ["(", ")"],
    ["{", "}"],
    ["<", ">"]
];

// =====================================================
// EXTRAER TAGS ENCERRADOS
// =====================================================

function extraerTagsEncerrados(texto) {
    const encontrados = [];

    for (const [inicio, fin] of DELIMITADORES_TAG) {
        let posicion = 0;

        while (posicion < texto.length) {
            const inicioIndex = texto.indexOf(
                inicio,
                posicion
            );

            if (inicioIndex === -1) {
                break;
            }

            const finIndex = texto.indexOf(
                fin,
                inicioIndex + inicio.length
            );

            if (finIndex === -1) {
                break;
            }

            const contenido = texto
                .slice(
                    inicioIndex + inicio.length,
                    finIndex
                )
                .trim();

            if (
                contenido &&
                contenido.length <= 30
            ) {
                encontrados.push(
                    `${inicio}${contenido}${fin}`
                );
            }

            posicion =
                finIndex + fin.length;
        }
    }

    return encontrados;
}

// =====================================================
// VALIDAR CONTENIDO DE TAG
// =====================================================

function contenidoEsPosibleTag(contenido) {
    if (!contenido) {
        return false;
    }

    const texto = contenido.trim();

    if (!texto) {
        return false;
    }

    if (texto.length > 25) {
        return false;
    }

    // Una sola letra/número
    if (
        texto.length === 1 &&
        /[\p{L}\p{N}]/u.test(texto)
    ) {
        return true;
    }

    // Letras
    const letras = texto.replace(
        /[^\p{L}]/gu,
        ""
    );

    // TAGS MAYÚSCULOS
    if (
        letras.length >= 2 &&
        letras.length <= 10 &&
        letras === letras.toUpperCase()
    ) {
        return true;
    }

    // Tags con símbolos
    if (
        /[.™®©_\-]/u.test(texto) &&
        texto.length >= 2
    ) {
        return true;
    }

    // Formatos tipo WW / 7K / ABC
    if (
        /^[\p{L}\p{N}™®©._\-]+$/u.test(
            texto
        ) &&
        texto.length <= 12
    ) {
        if (
            /^[A-ZÁÉÍÓÚÜÑ0-9]+$/u.test(
                texto
            )
        ) {
            return true;
        }
    }

    return false;
}

// =====================================================
// VALIDAR POSIBLE TAG
// =====================================================

function esPosibleTag(tag) {
    tag = normalizarTag(tag);

    if (!tag) {
        return false;
    }

    if (tag.length > 30) {
        return false;
    }

    // TAG ENCERRADO
    for (const [inicio, fin] of DELIMITADORES_TAG) {
        if (
            tag.startsWith(inicio) &&
            tag.endsWith(fin)
        ) {
            const contenido = tag
                .slice(
                    inicio.length,
                    tag.length - fin.length
                )
                .trim();

            return contenidoEsPosibleTag(
                contenido
            );
        }
    }

    // UNA LETRA MAYÚSCULA
    if (
        tag.length === 1 &&
        /^[A-ZÁÉÍÓÚÜÑ]$/u.test(tag)
    ) {
        return true;
    }

    // TAG CON SÍMBOLOS
    if (
        /[.™®©_\-]/u.test(tag) &&
        tag.length >= 2
    ) {
        return true;
    }

    // TAG DE MAYÚSCULAS
    const letras = tag.replace(
        /[^\p{L}]/gu,
        ""
    );

    if (
        letras.length >= 2 &&
        letras.length <= 10 &&
        letras === letras.toUpperCase()
    ) {
        return true;
    }

    return false;
}

// =====================================================
// EXTRAER POSIBLES TAGS
// =====================================================

function extraerPosiblesTags(nombre) {
    const texto = normalizarNombre(nombre);

    if (!texto) {
        return [];
    }

    const candidatos = [];

    // =================================================
    // TAGS UNICODE ENCERRADOS
    // =================================================

    const tagsEncerrados =
        extraerTagsEncerrados(texto);

    for (const tag of tagsEncerrados) {
        if (esPosibleTag(tag)) {
            candidatos.push(tag);
        }
    }

    // =================================================
    // [TAG]
    // =================================================

    const corchetes =
        texto.match(/\[[^\]]{1,30}\]/gu);

    if (corchetes) {
        for (const encontrado of corchetes) {
            const contenido =
                encontrado.slice(1, -1).trim();

            if (
                contenidoEsPosibleTag(
                    contenido
                )
            ) {
                candidatos.push(
                    `[${contenido}]`
                );
            }
        }
    }

    // =================================================
    // (TAG)
    // =================================================

    const parentesis =
        texto.match(/\([^)]{1,30}\)/gu);

    if (parentesis) {
        for (const encontrado of parentesis) {
            const contenido =
                encontrado.slice(1, -1).trim();

            if (
                contenidoEsPosibleTag(
                    contenido
                )
            ) {
                candidatos.push(
                    `(${contenido})`
                );
            }
        }
    }

    // =================================================
    // SEPARADORES
    // =================================================

    const bloques =
        texto.split(/\s*[|:;•·]\s*/u);

    if (bloques.length > 1) {
        for (const bloque of bloques) {
            const palabras =
                bloque.trim().split(/\s+/);

            if (!palabras.length) {
                continue;
            }

            const primero =
                limpiarTag(
                    palabras[0]
                );

            const ultimo =
                limpiarTag(
                    palabras[palabras.length - 1]
                );

            if (
                primero &&
                esPosibleTag(primero)
            ) {
                candidatos.push(primero);
            }

            if (
                ultimo &&
                esPosibleTag(ultimo)
            ) {
                candidatos.push(ultimo);
            }
        }
    }

    // =================================================
    // SEPARAR POR ESPACIOS
    // =================================================

    const partes =
        texto.split(/\s+/);

    for (const parteOriginal of partes) {
        const parte =
            limpiarTag(
                parteOriginal
            );

        if (!parte) {
            continue;
        }

        if (esPosibleTag(parte)) {
            candidatos.push(parte);
        }
    }

    // =================================================
    // ELIMINAR DUPLICADOS
    // =================================================

    const vistos = new Set();
    const resultado = [];

    for (const candidato of candidatos) {
        const tag =
            normalizarTag(candidato);

        if (!tag) {
            continue;
        }

        const clave =
            tag.toLowerCase();

        if (!vistos.has(clave)) {
            vistos.add(clave);
            resultado.push(tag);
        }
    }

    return resultado;
}

// =====================================================
// OBTENER JUGADORES DEL SERVIDOR
// =====================================================

async function obtenerJugadoresDelServidor(
    serverId
) {
    console.log(
        `🔎 BM | Consultando jugadores del servidor ${serverId}...`
    );

    try {
        const response =
            await axios.get(
                `${BM_API}/servers/${serverId}`,
                {
                    headers:
                        getHeaders(),

                    params: {
                        include: "player"
                    },

                    timeout:
                        REQUEST_TIMEOUT
                }
            );

        console.log(
            `📡 BM | Respuesta servidor: HTTP ${response.status}`
        );

        const data =
            response.data?.data || {};

        const included =
            response.data?.included || [];

        console.log(
            `👥 BM | Elementos incluidos: ${included.length}`
        );

        const playersIncluded =
            included.filter(
                item =>
                    item &&
                    item.type === "player"
            );

        console.log(
            `👥 BM | Players incluidos: ${playersIncluded.length}`
        );

        // =================================================
        // BUSCAR RELACIÓN DE PLAYERS
        // =================================================

        const relationships =
            data.relationships || {};

        let playerRelationship = null;

        for (
            const [
                key,
                relationship
            ]
            of Object.entries(
                relationships
            )
        ) {
            const relationData =
                relationship?.data;

            if (
                !Array.isArray(
                    relationData
                )
            ) {
                continue;
            }

            const contienePlayers =
                relationData.some(
                    item =>
                        item?.type ===
                        "player"
                );

            if (
                contienePlayers
            ) {
                playerRelationship =
                    relationData;

                console.log(
                    `🔗 BM | Relación encontrada: ${key}`
                );

                break;
            }
        }

        // =================================================
        // RELACIÓN ACTUAL
        // =================================================

        if (
            Array.isArray(
                playerRelationship
            ) &&
            playerRelationship.length > 0
        ) {
            const idsActuales =
                new Set(
                    playerRelationship.map(
                        player =>
                            String(
                                player.id
                            )
                    )
                );

            const jugadoresActuales =
                playersIncluded.filter(
                    player =>
                        idsActuales.has(
                            String(
                                player.id
                            )
                        )
                );

            console.log(
                `🟢 BM | Jugadores actuales según relación: ${jugadoresActuales.length}`
            );

            return {
                jugadores:
                    jugadoresActuales
                        .map(
                            player => ({
                                id:
                                    player.id,

                                name:
                                    normalizarNombre(
                                        player
                                            .attributes
                                            ?.name
                                    ),

                                timePlayedSeconds:
                                    Number(
                                        player
                                            .meta
                                            ?.timePlayed
                                    ) || 0
                            })
                        )
                        .filter(
                            player =>
                                player.id &&
                                player.name
                        ),

                relacionActual:
                    true
            };
        }

        // =================================================
        // FALLBACK
        // =================================================

        console.log(
            "⚠️ BM | No se encontró relación directa de jugadores actuales."
        );

        return {
            jugadores:
                playersIncluded
                    .map(
                        player => ({
                            id:
                                player.id,

                            name:
                                normalizarNombre(
                                    player
                                        .attributes
                                        ?.name
                                ),

                            timePlayedSeconds:
                                Number(
                                    player
                                        .meta
                                        ?.timePlayed
                                ) || 0
                        })
                    )
                    .filter(
                        player =>
                            player.id &&
                            player.name
                    ),

            relacionActual:
                false
        };
    } catch (error) {
        console.error(
            "❌ BM | Error obteniendo jugadores:"
        );

        console.error(
            error.response?.status ||
            error.message
        );

        console.error(
            error.response?.data ||
            ""
        );

        throw error;
    }
}

// =====================================================
// DETECTAR POSIBLES CLANES
// =====================================================

function detectarPosiblesClanes(
    jugadores
) {
    const grupos = new Map();

    for (const jugador of jugadores) {
        const tags =
            extraerPosiblesTags(
                jugador.name
            );

        if (!tags.length) {
            continue;
        }

        for (const tag of tags) {
            const clave =
                tag.toLowerCase().trim();

            if (!grupos.has(clave)) {
                grupos.set(
                    clave,
                    {
                        tag,

                        jugadores:
                            new Map()
                    }
                );
            }

            grupos
                .get(clave)
                .jugadores.set(
                    String(jugador.id),
                    jugador
                );
        }
    }

    return Array.from(
        grupos.values()
    )
        .map(clan => ({
            tag: clan.tag,

            jugadores:
                Array.from(
                    clan.jugadores.values()
                )
        }))
        .sort(
            (a, b) =>
                b.jugadores.length -
                a.jugadores.length
        );
}

// =====================================================
// COMPROBAR SI JUGADOR ESTÁ ONLINE
// =====================================================

async function jugadorEstaOnlineEnServidor(
    playerId,
    serverId
) {
    try {
        let url =
            `${BM_API}/players/${playerId}/relationships/sessions`;

        let pagina = 0;

        while (
            url &&
            pagina < 5
        ) {
            pagina++;

            const response =
                await axios.get(
                    url,
                    {
                        headers:
                            getHeaders(),

                        params:
                            pagina === 1
                                ? {
                                    "page[size]": 100
                                }
                                : undefined,

                        timeout:
                            REQUEST_TIMEOUT
                    }
                );

            const sesiones =
                response.data?.data ||
                [];

            for (
                const sesion
                of sesiones
            ) {
                const stop =
                    sesion.attributes
                        ?.stop;

                const sessionServerId =
                    sesion.relationships
                        ?.server
                        ?.data
                        ?.id ||
                    sesion.attributes
                        ?.serverId;

                const activa =
                    stop === null ||
                    stop === undefined;

                if (
                    activa &&
                    String(
                        sessionServerId
                    ) === String(
                        serverId
                    )
                ) {
                    return true;
                }
            }

            url =
                response.data?.links
                    ?.next || null;
        }

        return false;
    } catch (error) {
        console.error(
            `⚠️ BM | Error comprobando jugador ${playerId}:`,
            error.response?.status ||
            error.message
        );

        return false;
    }
}

// =====================================================
// CONCURRENCIA
// =====================================================

async function ejecutarConLimite(
    elementos,
    limite,
    funcion
) {
    const resultados =
        new Array(
            elementos.length
        );

    let indice = 0;

    async function trabajador() {
        while (true) {
            const posicion =
                indice++;

            if (
                posicion >=
                elementos.length
            ) {
                return;
            }

            try {
                resultados[posicion] =
                    await funcion(
                        elementos[posicion]
                    );
            } catch (error) {
                console.error(
                    "⚠️ Error trabajador:",
                    error.message
                );

                resultados[posicion] =
                    null;
            }
        }
    }

    const trabajadores = [];

    const cantidad =
        Math.min(
            limite,
            elementos.length
        );

    for (
        let i = 0;
        i < cantidad;
        i++
    ) {
        trabajadores.push(
            trabajador()
        );
    }

    await Promise.all(
        trabajadores
    );

    return resultados;
}

// =====================================================
// COMPROBAR CLANES ONLINE
// =====================================================

async function comprobarClanesOnline(
    posiblesClanes,
    serverId
) {
    const candidatos =
        posiblesClanes.filter(
            clan =>
                clan.jugadores.length >=
                MIN_JUGADORES_CLAN
        );

    console.log(
        `🏴 BM | Posibles clanes de ${MIN_JUGADORES_CLAN}+: ${candidatos.length}`
    );

    if (
        candidatos.length === 0
    ) {
        return [];
    }

    // =================================================
    // MOSTRAR CANDIDATOS
    // =================================================

    for (const clan of candidatos) {
        console.log(
            `🏴 CANDIDATO ONLINE ${clan.tag} | ${clan.jugadores.length} jugadores`
        );
    }

    // =================================================
    // UNIFICAR JUGADORES
    // =================================================

    const todosLosJugadores =
        new Map();

    for (
        const clan of candidatos
    ) {
        for (
            const jugador
            of clan.jugadores
        ) {
            todosLosJugadores.set(
                String(jugador.id),
                jugador
            );
        }
    }

    const jugadoresUnicos =
        Array.from(
            todosLosJugadores.values()
        );

    console.log(
        `🔎 BM | Jugadores candidatos para comprobar online: ${jugadoresUnicos.length}`
    );

    // =================================================
    // COMPROBAR SESIONES
    // =================================================

    const resultados =
        await ejecutarConLimite(
            jugadoresUnicos,
            SESSION_CONCURRENCY,
            async jugador => {
                const online =
                    await jugadorEstaOnlineEnServidor(
                        jugador.id,
                        serverId
                    );

                console.log(
                    `${online ? "🟢" : "⚪"} ${jugador.name} | BM ${jugador.id}`
                );

                return {
                    jugador,
                    online
                };
            }
        );

    // =================================================
    // IDS ONLINE
    // =================================================

    const onlineIds =
        new Set(
            resultados
                .filter(
                    resultado =>
                        resultado?.online
                )
                .map(
                    resultado =>
                        String(
                            resultado
                                .jugador
                                .id
                        )
                )
        );

    // =================================================
    // RECONSTRUIR CLANES
    // =================================================

    const clanesOnline = [];

    for (
        const clan of candidatos
    ) {
        const jugadoresOnline =
            clan.jugadores.filter(
                jugador =>
                    onlineIds.has(
                        String(
                            jugador.id
                        )
                    )
            );

        if (
            jugadoresOnline.length >=
            MIN_JUGADORES_CLAN
        ) {
            clanesOnline.push({
                tag: clan.tag,

                jugadores:
                    jugadoresOnline
            });
        }
    }

    return clanesOnline.sort(
        (a, b) =>
            b.jugadores.length -
            a.jugadores.length
    );
}

// =====================================================
// CREAR EMBEDS DE CLAN
// =====================================================

function crearEmbedsClan(
    clan,
    serverId
) {
    const embeds = [];

    const lineas =
        clan.jugadores.map(
            jugador =>
                `• [${jugador.name}](https://www.battlemetrics.com/players/${jugador.id})`
        );

    let bloque = "";
    let numeroParte = 1;

    function crearEmbed(
        contenido,
        parte
    ) {
        return new EmbedBuilder()
            .setColor(
                "#ED4245"
            )
            .setTitle(
                `🏴 Clan: ${clan.tag}`
            )
            .setDescription(
                `**${clan.jugadores.length} jugadores detectados**\n\n` +
                `🎮 BattleMetrics: \`${serverId}\`` +
                (
                    parte > 1
                        ? `\n📄 Parte ${parte}`
                        : ""
                )
            )
            .addFields({
                name:
                    parte === 1
                        ? "👥 Jugadores"
                        : "👥 Jugadores — continuación",

                value:
                    contenido,

                inline:
                    false
            })
            .setTimestamp()
            .setFooter({
                text:
                    "RustLogix"
            });
    }

    for (
        const linea
        of lineas
    ) {
        const siguiente =
            bloque
                ? `${bloque}\n${linea}`
                : linea;

        if (
            siguiente.length > 950
        ) {
            if (bloque) {
                embeds.push(
                    crearEmbed(
                        bloque,
                        numeroParte
                    )
                );

                numeroParte++;
            }

            bloque = linea;
        } else {
            bloque = siguiente;
        }
    }

    if (bloque) {
        embeds.push(
            crearEmbed(
                bloque,
                numeroParte
            )
        );
    }

    return embeds;
}

// =====================================================
// EMBED RESUMEN
// =====================================================

function crearEmbedResumen(
    clanes,
    jugadores,
    serverId
) {
    return new EmbedBuilder()
        .setTitle(
            "🏴 Clanes detectados en el servidor"
        )
        .setColor(
            "#ED4245"
        )
        .setDescription(
            `Se detectaron **${clanes.length} clan(es)** con **${MIN_JUGADORES_CLAN}+ jugadores**.\n\n` +
            `👥 Jugadores analizados: **${jugadores.length}**\n` +
            `🏴 Clanes detectados: **${clanes.length}**\n` +
            `🎮 Servidor BattleMetrics: \`${serverId}\``
        )
        .setTimestamp()
        .setFooter({
            text:
                "RustLogix"
        });
}

// =====================================================
// ENVIAR EMBEDS
// =====================================================

async function enviarEmbeds(
    interaction,
    embeds
) {
    const grupos = [];

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

    if (
        grupos.length === 0
    ) {
        return;
    }

    // Primer grupo
    await interaction.editReply({
        embeds:
            grupos[0],

        allowedMentions: {
            parse: []
        }
    });

    // Grupos siguientes
    for (
        let i = 1;
        i < grupos.length;
        i++
    ) {
        await interaction.followUp({
            embeds:
                grupos[i],

            allowedMentions: {
                parse: []
            }
        });
    }
}

// =====================================================
// COMANDO
// =====================================================

module.exports = {

    data:
        new SlashCommandBuilder()
            .setName(
                "revisar"
            )
            .setDescription(
                "Revisa el servidor y detecta todos los clanes con 6 o más jugadores"
            ),

    async execute(
        interaction
    ) {
        console.log(
            "🎯 Ejecutando /revisar"
        );

        // =================================================
        // DEFER
        // =================================================

        await interaction.deferReply();

        // =================================================
        // CONFIGURACIÓN
        // =================================================

        let config;

        try {
            config =
                await ServerConfig.findOne({
                    guildId:
                        interaction.guild.id
                });
        } catch (error) {
            console.error(
                "❌ MongoDB | Error obteniendo configuración:",
                error.message
            );

            return await interaction.editReply({
                content:
                    "❌ No se pudo consultar la configuración del servidor."
            });
        }

        if (
            !config ||
            !config.battleMetricsServerId
        ) {
            return await interaction.editReply({
                content:
                    "❌ No hay un servidor de BattleMetrics configurado.\n\n" +
                    "Usa `/configurar-servidor` primero."
            });
        }

        const serverId =
            String(
                config.battleMetricsServerId
            ).trim();

        console.log(
            `🎮 BM | Servidor configurado: ${serverId}`
        );

        // =================================================
        // OBTENER JUGADORES
        // =================================================

        let resultado;

        try {
            resultado =
                await obtenerJugadoresDelServidor(
                    serverId
                );
        } catch (error) {
            console.error(
                "❌ /revisar | Error BattleMetrics:",
                error.message
            );

            const detalle =
                error.response?.data
                    ?.errors?.[0]
                    ?.detail ||

                error.response?.data
                    ?.errors?.[0]
                    ?.title ||

                error.message ||

                "Error desconocido";

            return await interaction.editReply({
                content:
                    "❌ BattleMetrics no pudo devolver los jugadores del servidor.\n\n" +
                    `Servidor: \`${serverId}\`\n` +
                    `Error: \`${detalle}\``
            });
        }

        const jugadores =
            resultado.jugadores;

        // =================================================
        // SIN JUGADORES
        // =================================================

        if (
            jugadores.length === 0
        ) {
            const embed =
                new EmbedBuilder()
                    .setTitle(
                        "🔎 Revisión del servidor"
                    )
                    .setColor(
                        "#5865F2"
                    )
                    .setDescription(
                        "No se encontraron jugadores en el servidor configurado.\n\n" +
                        `🎮 Servidor BattleMetrics: \`${serverId}\``
                    )
                    .setTimestamp()
                    .setFooter({
                        text:
                            "RustLogix"
                    });

            return await interaction.editReply({
                embeds: [embed]
            });
        }

        // =================================================
        // DETECTAR POSIBLES CLANES
        // =================================================

        console.log(
            "🔎 BM | Analizando tags de todos los jugadores..."
        );

        const posiblesClanes =
            detectarPosiblesClanes(
                jugadores
            );

        console.log(
            `🏴 BM | Grupos posibles encontrados: ${posiblesClanes.length}`
        );

        // =================================================
        // MOSTRAR GRUPOS 2+
        // =================================================

        const gruposImportantes =
            posiblesClanes.filter(
                clan =>
                    clan.jugadores.length >= 2
            );

        console.log(
            `🔎 BM | Grupos con 2+ jugadores: ${gruposImportantes.length}`
        );

        for (
            const clan
            of gruposImportantes
        ) {
            console.log(
                `🏴 GRUPO ${clan.tag} | ${clan.jugadores.length} jugadores`
            );
        }

        // =================================================
        // MOSTRAR CANDIDATOS 6+
        // =================================================

        for (
            const clan
            of posiblesClanes
        ) {
            if (
                clan.jugadores.length >=
                MIN_JUGADORES_CLAN
            ) {
                console.log(
                    `🏴 POSIBLE ${clan.tag} | ${clan.jugadores.length} jugadores`
                );
            }
        }

        // =================================================
        // DETERMINAR CLANES ONLINE
        // =================================================

        let clanes;

        if (
            resultado.relacionActual
        ) {
            console.log(
                "🟢 BM | Usando relación actual del servidor."
            );

            clanes =
                posiblesClanes.filter(
                    clan =>
                        clan.jugadores.length >=
                        MIN_JUGADORES_CLAN
                );
        } else {
            console.log(
                "🔄 BM | No hay relación directa. Comprobando sesiones activas..."
            );

            clanes =
                await comprobarClanesOnline(
                    posiblesClanes,
                    serverId
                );
        }

        // =================================================
        // CONTAR JUGADORES
        // =================================================

        const jugadoresClanOnline =
            clanes.reduce(
                (
                    total,
                    clan
                ) =>
                    total +
                    clan.jugadores.length,
                0
            );

        console.log(
            `🟢 BM | Jugadores pertenecientes a clanes detectados: ${jugadoresClanOnline}`
        );

        console.log(
            `🏴 BM | Clanes encontrados: ${clanes.length}`
        );

        // =================================================
        // LOG DE CLANES
        // =================================================

        for (
            const clan
            of clanes
        ) {
            console.log(
                `🏴 ${clan.tag} | ${clan.jugadores.length} jugadores`
            );

            for (
                const jugador
                of clan.jugadores
            ) {
                console.log(
                    `   └─ ${jugador.name} | BM ${jugador.id}`
                );
            }
        }

        // =================================================
        // SIN CLANES
        // =================================================

        if (
            clanes.length === 0
        ) {
            const embed =
                new EmbedBuilder()
                    .setTitle(
                        "🔎 Revisión del servidor"
                    )
                    .setColor(
                        "#57F287"
                    )
                    .setDescription(
                        `No se detectaron clanes con **${MIN_JUGADORES_CLAN} o más jugadores**.\n\n` +
                        `👥 Jugadores analizados: **${jugadores.length}**\n` +
                        `🎮 Servidor BattleMetrics: \`${serverId}\``
                    )
                    .setTimestamp()
                    .setFooter({
                        text:
                            "RustLogix"
                    });

            return await interaction.editReply({
                embeds: [embed]
            });
        }

        // =================================================
        // CREAR EMBEDS
        // =================================================

        const embeds = [];

        embeds.push(
            crearEmbedResumen(
                clanes,
                jugadores,
                serverId
            )
        );

        for (
            const clan
            of clanes
        ) {
            const embedsClan =
                crearEmbedsClan(
                    clan,
                    serverId
                );

            embeds.push(
                ...embedsClan
            );
        }

        console.log(
            `📦 Discord | Embeds generados: ${embeds.length}`
        );

        // =================================================
        // ENVIAR
        // =================================================

        await enviarEmbeds(
            interaction,
            embeds
        );

        console.log(
            "✅ /revisar terminado"
        );
    }
};