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
// LIMPIAR POSIBLE TAG
// =====================================================

function limpiarTag(tag) {
    if (!tag) {
        return null;
    }

    return String(tag)
        .trim()
        .replace(/^[|:;,._\-]+/u, "")
        .replace(/[|:;,._\-]+$/u, "")
        .trim();
}

// =====================================================
// VALIDAR POSIBLE TAG
// =====================================================
//
// Esta función intenta evitar palabras normales como
// "Player", "The", "Hello", etc.
//
// Acepta:
// F.O.L™
// H.
// FOL
// ABC
// H
// [FOL]
// (FOL)
// =====================================================

function esPosibleTag(tag) {
    tag = limpiarTag(tag);

    if (!tag) {
        return false;
    }

    if (tag.length > 30) {
        return false;
    }

    // Tag de una letra mayúscula.
// Ej: H
    if (
        tag.length === 1 &&
        /^[A-ZÁÉÍÓÚÜÑ]$/u.test(tag)
    ) {
        return true;
    }

    // Tags con símbolos típicos
    // Ej: F.O.L™
    if (
        /[.™®©_\-]/u.test(tag) &&
        tag.length >= 2
    ) {
        return true;
    }

    // Tags de letras mayúsculas
    // Ej: FOL / ABC / TEAM
    const letras = tag.replace(
        /[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g,
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
// EXTRAER POSIBLES TAGS DE UN NOMBRE
// =====================================================
//
// No nos quedamos solamente con la primera palabra.
//
// Ejemplos:
//
// F.O.L™ | Daren
// F.O.L™ Daren
// [F.O.L™] Daren
// (F.O.L™) Daren
// H. Tvaroh
// Daren | F.O.L™
// Daren [F.O.L™]
// =====================================================

function extraerPosiblesTags(nombre) {
    const texto = normalizarNombre(nombre);

    if (!texto) {
        return [];
    }

    const candidatos = [];

    // =================================================
    // [TAG]
    // =================================================

    const corchetes = texto.match(
        /\[([^\]]{1,30})\]/gu
    );

    if (corchetes) {
        for (const encontrado of corchetes) {
            const tag = limpiarTag(
                encontrado
                    .replace(/^\[/, "")
                    .replace(/\]$/, "")
            );

            if (esPosibleTag(tag)) {
                candidatos.push(tag);
            }
        }
    }

    // =================================================
    // (TAG)
    // =================================================

    const parentesis = texto.match(
        /\(([^)]{1,30})\)/gu
    );

    if (parentesis) {
        for (const encontrado of parentesis) {
            const tag = limpiarTag(
                encontrado
                    .replace(/^\(/, "")
                    .replace(/\)$/, "")
            );

            if (esPosibleTag(tag)) {
                candidatos.push(tag);
            }
        }
    }

    // =================================================
    // SEPARAR POR ESPACIOS
    // =================================================

    const partes = texto.split(/\s+/);

    for (let i = 0; i < partes.length; i++) {
        let parte = partes[i];

        parte = parte
            .replace(/^[|:;,]+/u, "")
            .replace(/[|:;,]+$/u, "");

        if (!parte) {
            continue;
        }

        // Quitar corchetes/paréntesis alrededor
        parte = parte
            .replace(/^\[/, "")
            .replace(/\]$/, "")
            .replace(/^\(/, "")
            .replace(/\)$/, "");

        if (esPosibleTag(parte)) {
            candidatos.push(parte);
        }
    }

    // =================================================
    // SEPARADORES COMUNES
    // =================================================

    const porSeparadores = texto.split(
        /\s*[|:;•·]\s*/u
    );

    if (porSeparadores.length > 1) {
        for (const bloque of porSeparadores) {
            const palabras = bloque.trim().split(/\s+/);

            if (palabras.length > 0) {
                const primero = limpiarTag(
                    palabras[0]
                );

                if (esPosibleTag(primero)) {
                    candidatos.push(primero);
                }

                const ultimo = limpiarTag(
                    palabras[palabras.length - 1]
                );

                if (esPosibleTag(ultimo)) {
                    candidatos.push(ultimo);
                }
            }
        }
    }

    // =================================================
    // DEVOLVER SIN DUPLICADOS
    // =================================================

    const vistos = new Set();
    const resultado = [];

    for (const candidato of candidatos) {
        const clave = candidato
            .toLowerCase()
            .trim();

        if (!vistos.has(clave)) {
            vistos.add(clave);
            resultado.push(candidato);
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
        const response = await axios.get(
            `${BM_API}/servers/${serverId}`,
            {
                headers: getHeaders(),
                params: {
                    include: "player"
                },
                timeout: REQUEST_TIMEOUT
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
            const [key, relationship]
            of Object.entries(relationships)
        ) {
            const relationData =
                relationship?.data;

            if (!Array.isArray(relationData)) {
                continue;
            }

            const contienePlayers =
                relationData.some(
                    item =>
                        item?.type === "player"
                );

            if (contienePlayers) {
                playerRelationship =
                    relationData;

                console.log(
                    `🔗 BM | Relación encontrada: ${key}`
                );

                break;
            }
        }

        // =================================================
        // SI EXISTE RELACIÓN ACTUAL
        // =================================================

        if (
            Array.isArray(playerRelationship) &&
            playerRelationship.length > 0
        ) {
            const idsActuales =
                new Set(
                    playerRelationship.map(
                        player =>
                            String(player.id)
                    )
                );

            const jugadoresActuales =
                playersIncluded.filter(
                    player =>
                        idsActuales.has(
                            String(player.id)
                        )
                );

            console.log(
                `🟢 BM | Jugadores actuales según relación: ${jugadoresActuales.length}`
            );

            return {
                jugadores:
                    jugadoresActuales
                        .map(player => ({
                            id: player.id,
                            name: normalizarNombre(
                                player.attributes?.name
                            ),
                            timePlayedSeconds:
                                Number(
                                    player.meta?.timePlayed
                                ) || 0
                        }))
                        .filter(
                            player =>
                                player.id &&
                                player.name
                        ),
                relacionActual: true
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
                    .map(player => ({
                        id: player.id,
                        name: normalizarNombre(
                            player.attributes?.name
                        ),
                        timePlayedSeconds:
                            Number(
                                player.meta?.timePlayed
                            ) || 0
                    }))
                    .filter(
                        player =>
                            player.id &&
                            player.name
                    ),
            relacionActual: false
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
// CREAR MAPA DE POSIBLES CLANES
// =====================================================
//
// En lugar de asumir que el tag está al principio,
// buscamos tags repetidos.
//
// Ejemplo:
//
// F.O.L™ | A
// F.O.L™ | B
// F.O.L™ | C
//
// genera:
//
// F.O.L™ -> 3
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
                        jugadores: new Map()
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
// OBTENER SESIONES DE UN JUGADOR
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
                    sesion.attributes?.stop;

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
// COMPROBAR ONLINE DE POSIBLES CLANES
// =====================================================
//
// IMPORTANTE:
//
// Primero buscamos grupos de 6+.
//
// Después comprobamos SOLO esos jugadores.
//
// Así no hacemos 582 consultas.
// =====================================================

async function comprobarClanesOnline(
    posiblesClanes,
    serverId
) {
    const candidatos = posiblesClanes
        .filter(
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
    // COMPROBAR TODOS LOS JUGADORES DE LOS CANDIDATOS
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
                            resultado.jugador.id
                        )
                )
        );

    // =================================================
    // RECONSTRUIR LOS CLANES
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
// CREAR CAMPOS DEL CLAN
// =====================================================

function crearCamposClan(
    clan
) {
    const campos = [];

    const lineas =
        clan.jugadores.map(
            jugador =>
                `• [${jugador.name}](https://www.battlemetrics.com/players/${jugador.id})`
        );

    let bloqueActual = "";

    let primerBloque = true;

    for (
        const linea of lineas
    ) {
        const separador =
            bloqueActual
                ? "\n"
                : "";

        const siguiente =
            bloqueActual +
            separador +
            linea;

        if (
            siguiente.length >
            900
        ) {
            if (
                bloqueActual
            ) {
                campos.push({
                    name:
                        primerBloque
                            ? `🏴 Clan en el servidor: ${clan.tag}`
                            : `🏴 ${clan.tag} | Jugadores`,
                    value:
                        primerBloque
                            ? `**${clan.jugadores.length} jugadores detectados**\n\n${bloqueActual}`
                            : bloqueActual,
                    inline: false
                });

                primerBloque =
                    false;

                bloqueActual =
                    linea;
            } else {
                campos.push({
                    name:
                        primerBloque
                            ? `🏴 Clan en el servidor: ${clan.tag}`
                            : `🏴 ${clan.tag} | Jugadores`,
                    value:
                        primerBloque
                            ? `**${clan.jugadores.length} jugadores detectados**\n\n${linea.substring(0, 900)}`
                            : linea.substring(
                                0,
                                900
                            ),
                    inline: false
                });

                primerBloque =
                    false;

                bloqueActual =
                    "";
            }
        } else {
            bloqueActual =
                siguiente;
        }
    }

    if (
        bloqueActual
    ) {
        campos.push({
            name:
                primerBloque
                    ? `🏴 Clan en el servidor: ${clan.tag}`
                    : `🏴 ${clan.tag} | Jugadores`,
            value:
                primerBloque
                    ? `**${clan.jugadores.length} jugadores detectados**\n\n${bloqueActual}`
                    : bloqueActual,
            inline: false
        });
    }

    return campos;
}

// =====================================================
// COMANDO
// =====================================================

module.exports = {
    data:
        new SlashCommandBuilder()
            .setName("revisar")
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

        let jugadores =
            resultado.jugadores;

        // =================================================
        // SI NO HAY JUGADORES
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

        for (
            const clan of posiblesClanes
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
            // ---------------------------------------------
            // BattleMetrics ya nos entregó los jugadores
            // actuales.
            // ---------------------------------------------

            clanes =
                posiblesClanes.filter(
                    clan =>
                        clan.jugadores.length >=
                        MIN_JUGADORES_CLAN
                );
        } else {
            // ---------------------------------------------
            // No hubo relación directa.
            //
            // Comprobamos sesiones activas.
            // ---------------------------------------------

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
        // CONTAR JUGADORES ONLINE
        // =================================================

        const jugadoresClanOnline =
            clanes.reduce(
                (total, clan) =>
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
            const clan of clanes
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
        // EMBED
        // =================================================

        const embed =
            new EmbedBuilder()
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

        // =================================================
        // AGREGAR TODOS LOS CLANES
        // =================================================

        let totalFields = 0;

        for (
            const clan of clanes
        ) {
            const campos =
                crearCamposClan(
                    clan
                );

            for (
                const campo of campos
            ) {
                if (
                    totalFields >= 25
                ) {
                    console.warn(
                        "⚠️ Discord | Se alcanzó el máximo de 25 fields."
                    );

                    break;
                }

                embed.addFields(
                    campo
                );

                totalFields++;
            }

            if (
                totalFields >= 25
            ) {
                break;
            }
        }

        // =================================================
        // ENVIAR
        // =================================================

        return await interaction.editReply({
            embeds: [embed]
        });
    }
};