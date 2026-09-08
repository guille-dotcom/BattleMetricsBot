const {
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlags
} = require("discord.js");

const axios = require("axios");
const ServerConfig = require("../models/ServerConfig");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BM_API = "https://api.battlemetrics.com";
const MIN_JUGADORES_CLAN = 6;
const REQUEST_TIMEOUT = 15000;

// =====================================================
// HEADERS BATTLEMETRICS
// =====================================================

function getHeaders() {
    const token = process.env.BATTLEMETRICS_TOKEN;

    return token
        ? {
            Accept: "application/vnd.api+json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        }
        : {
            Accept: "application/vnd.api+json",
            "Content-Type": "application/json"
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
// OBTENER TAG DEL JUGADOR
// =====================================================
//
// Soporta:
//
// [F.O.L™] Daren
// (F.O.L™) Daren
// F.O.L™ | Daren
// F.O.L™ Daren
// F.O.L Daren
// ABC Daren
// H Daren
//
// =====================================================

function obtenerTag(nombre) {
    const nombreNormalizado = normalizarNombre(nombre);

    if (!nombreNormalizado) {
        return null;
    }

    // =================================================
    // [TAG] Nombre
    // =================================================

    const corchetes = nombreNormalizado.match(
        /^\[([^\]]{1,30})\]\s+/u
    );

    if (corchetes) {
        return corchetes[1].trim();
    }

    // =================================================
    // (TAG) Nombre
    // =================================================

    const parentesis = nombreNormalizado.match(
        /^\(([^)]{1,30})\)\s+/u
    );

    if (parentesis) {
        return parentesis[1].trim();
    }

    // =================================================
    // TAG | Nombre
    // TAG - Nombre
    // TAG Nombre
    // =================================================

    const partes = nombreNormalizado.split(/\s+/);

    if (partes.length >= 2) {
        let posibleTag = partes[0].trim();

        // ---------------------------------------------
        // Si el nombre comienza con:
        //
        // F.O.L™ | Daren
        // F.O.L™ - Daren
        //
        // limpiamos separadores finales.
        // ---------------------------------------------

        posibleTag = posibleTag
            .replace(/[|:;,]+$/u, "")
            .trim();

        if (!posibleTag) {
            return null;
        }

        // ---------------------------------------------
        // TAG con símbolos típicos
        //
        // F.O.L™
        // FOL™
        // ABC_
        // FOL-TEAM
        // ---------------------------------------------

        const tieneFormatoClan =
            /[.™®©_-]/u.test(posibleTag);

        if (
            tieneFormatoClan &&
            posibleTag.length >= 2 &&
            posibleTag.length <= 30
        ) {
            return posibleTag;
        }

        // ---------------------------------------------
        // TAG completamente en mayúsculas
        //
        // FOL Daren
        // ABC Player
        // ---------------------------------------------

        const letras = posibleTag.replace(
            /[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g,
            ""
        );

        if (
            letras.length >= 2 &&
            letras.length <= 10 &&
            letras === letras.toUpperCase()
        ) {
            return posibleTag;
        }

        // ---------------------------------------------
        // TAG DE UNA SOLA LETRA
        //
        // H Daren
        //
        // Esto permite detectar clanes cuyo tag
        // sea simplemente "H".
        // ---------------------------------------------

        if (
            posibleTag.length === 1 &&
            /^[A-ZÁÉÍÓÚÜÑ]$/u.test(posibleTag)
        ) {
            return posibleTag;
        }
    }

    return null;
}

// =====================================================
// OBTENER JUGADORES DEL SERVIDOR
// =====================================================
//
// GET /servers/{serverId}?include=player
//
// Intentamos utilizar la relación "players" del servidor
// para saber cuáles están actualmente asociados al server.
//
// Si BattleMetrics no entrega esa relación, devolvemos
// todos los players incluidos y posteriormente usamos
// sesiones activas como comprobación.
// =====================================================

async function obtenerJugadoresDelServidor(serverId) {
    console.log(
        `🔎 BM | Consultando jugadores del servidor ${serverId}...`
    );

    const token = process.env.BATTLEMETRICS_TOKEN;

    if (!token) {
        throw new Error(
            "BATTLEMETRICS_TOKEN no está configurado en .env"
        );
    }

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

        const data = response.data?.data || {};
        const included = response.data?.included || [];

        console.log(
            `👥 BM | Elementos incluidos: ${included.length}`
        );

        // =================================================
        // BUSCAR RELACIÓN DE JUGADORES ACTUALES
        // =================================================

        const relationships = data.relationships || {};

        let playerRelationship = null;

        // BattleMetrics normalmente puede entregar players,
        // pero buscamos dinámicamente para ser más tolerantes
        // con la estructura de la respuesta.

        for (const [key, relationship] of Object.entries(
            relationships
        )) {
            const relationData = relationship?.data;

            if (!Array.isArray(relationData)) {
                continue;
            }

            const contienePlayers = relationData.some(
                item => item?.type === "player"
            );

            if (contienePlayers) {
                playerRelationship = relationData;
                console.log(
                    `🔗 BM | Relación de jugadores encontrada: ${key}`
                );
                break;
            }
        }

        const playersIncluded = included.filter(
            item =>
                item &&
                item.type === "player"
        );

        console.log(
            `👥 BM | Players incluidos: ${playersIncluded.length}`
        );

        // =================================================
        // SI TENEMOS RELACIÓN DE PLAYERS
        // =================================================

        if (
            Array.isArray(playerRelationship) &&
            playerRelationship.length > 0
        ) {
            const currentPlayerIds = new Set(
                playerRelationship
                    .map(player => String(player.id))
                    .filter(Boolean)
            );

            const currentPlayers =
                playersIncluded.filter(player =>
                    currentPlayerIds.has(
                        String(player.id)
                    )
                );

            console.log(
                `🟢 BM | Jugadores actualmente relacionados con el servidor: ${currentPlayers.length}`
            );

            return {
                jugadores: currentPlayers
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
        //
        // Si no existe la relación, devolvemos los players
        // incluidos y después comprobamos sesiones activas
        // solamente en posibles clanes.
        // =================================================

        console.warn(
            "⚠️ BM | No se encontró relación directa de jugadores actuales."
        );

        console.warn(
            "⚠️ BM | Se utilizará comprobación de sesiones activas como fallback."
        );

        return {
            jugadores: playersIncluded
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
            "❌ BM | Error obteniendo jugadores del servidor:"
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
// OBTENER TAGS DE TODOS LOS JUGADORES
// =====================================================

function agruparJugadoresPorTag(jugadores) {
    const grupos = new Map();

    for (const jugador of jugadores) {
        const tag = obtenerTag(jugador.name);

        if (!tag) {
            continue;
        }

        const clave = tag
            .toLowerCase()
            .trim();

        if (!grupos.has(clave)) {
            grupos.set(clave, {
                tag,
                jugadores: []
            });
        }

        grupos
            .get(clave)
            .jugadores
            .push(jugador);
    }

    return Array.from(grupos.values());
}

// =====================================================
// COMPROBAR SI UN JUGADOR ESTÁ ACTUALMENTE EN EL SERVER
// =====================================================

async function jugadorEstaOnlineEnServidor(
    playerId,
    serverId
) {
    try {
        const response = await axios.get(
            `${BM_API}/players/${playerId}/relationships/sessions`,
            {
                headers: getHeaders(),
                params: {
                    "page[size]": 100
                },
                timeout: REQUEST_TIMEOUT
            }
        );

        const sesiones =
            response.data?.data || [];

        for (const sesion of sesiones) {
            const stop =
                sesion.attributes?.stop;

            const serverIdSesion =
                sesion.relationships?.server?.data?.id ||
                sesion.attributes?.serverId;

            const estaActiva =
                stop === null ||
                stop === undefined;

            if (
                estaActiva &&
                String(serverIdSesion) === String(serverId)
            ) {
                return true;
            }
        }

        return false;

    } catch (error) {
        console.error(
            `⚠️ BM | Error comprobando sesión del jugador ${playerId}:`,
            error.response?.status ||
            error.message
        );

        return false;
    }
}

// =====================================================
// CONTROLAR CONCURRENCIA
// =====================================================
//
// Evita lanzar cientos de consultas a BattleMetrics
// simultáneamente.
// =====================================================

async function ejecutarConLimite(
    elementos,
    limite,
    funcion
) {
    const resultados = new Array(
        elementos.length
    );

    let indice = 0;

    async function trabajador() {
        while (true) {
            const actual = indice++;

            if (actual >= elementos.length) {
                return;
            }

            try {
                resultados[actual] =
                    await funcion(
                        elementos[actual],
                        actual
                    );
            } catch (error) {
                console.error(
                    "⚠️ Error en trabajador:",
                    error.message
                );

                resultados[actual] = null;
            }
        }
    }

    const trabajadores = [];

    const cantidadTrabajadores = Math.min(
        limite,
        elementos.length
    );

    for (
        let i = 0;
        i < cantidadTrabajadores;
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
// FILTRAR SOLO JUGADORES ONLINE
// =====================================================

async function filtrarJugadoresOnline(
    jugadores,
    serverId
) {
    // =================================================
    // PRIMERO AGRUPAMOS POR TAG
    // =================================================

    const grupos =
        agruparJugadoresPorTag(
            jugadores
        );

    // =================================================
    // SOLO COMPROBAMOS GRUPOS QUE PUEDEN LLEGAR A 6
    // =================================================

    const candidatos = grupos
        .filter(
            clan =>
                clan.jugadores.length >=
                MIN_JUGADORES_CLAN
        )
        .flatMap(
            clan =>
                clan.jugadores
        );

    console.log(
        `🔎 BM | Jugadores candidatos para comprobar online: ${candidatos.length}`
    );

    if (candidatos.length === 0) {
        return [];
    }

    // =================================================
    // COMPROBAR SESIONES CON 5 CONEXIONES SIMULTÁNEAS
    // =================================================

    const resultados =
        await ejecutarConLimite(
            candidatos,
            5,
            async jugador => {
                const online =
                    await jugadorEstaOnlineEnServidor(
                        jugador.id,
                        serverId
                    );

                console.log(
                    `${online ? "🟢" : "⚪"} ${jugador.name} | BM ${jugador.id}`
                );

                return online
                    ? jugador
                    : null;
            }
        );

    return resultados.filter(Boolean);
}

// =====================================================
// DETECTAR CLANES
// =====================================================

function detectarClanes(jugadores) {
    const grupos =
        agruparJugadoresPorTag(
            jugadores
        );

    return grupos
        .filter(
            clan =>
                clan.jugadores.length >=
                MIN_JUGADORES_CLAN
        )
        .sort(
            (a, b) =>
                b.jugadores.length -
                a.jugadores.length
        );
}

// =====================================================
// CREAR CAMPOS DEL CLAN
// =====================================================
//
// Discord limita cada field a 1024 caracteres.
//
// Por eso dividimos los jugadores en varios fields
// cuando el clan tiene muchos integrantes.
// =====================================================

function crearCamposClan(clan) {
    const campos = [];

    const lineas = clan.jugadores.map(
        jugador =>
            `• [${jugador.name}](https://www.battlemetrics.com/players/${jugador.id})`
    );

    let bloqueActual = "";
    let primerBloque = true;

    for (const linea of lineas) {
        const separador =
            bloqueActual.length > 0
                ? "\n"
                : "";

        const nuevoBloque =
            bloqueActual +
            separador +
            linea;

        if (nuevoBloque.length > 900) {
            if (bloqueActual.length > 0) {
                campos.push({
                    name: primerBloque
                        ? `🏴 Clan en el servidor: ${clan.tag}`
                        : `🏴 ${clan.tag} | Jugadores`,
                    value: primerBloque
                        ? `**${clan.jugadores.length} jugadores detectados**\n\n${bloqueActual}`
                        : bloqueActual,
                    inline: false
                });

                primerBloque = false;
                bloqueActual = linea;
            } else {
                // Nombre individual extremadamente largo.
                campos.push({
                    name: primerBloque
                        ? `🏴 Clan en el servidor: ${clan.tag}`
                        : `🏴 ${clan.tag} | Jugadores`,
                    value: primerBloque
                        ? `**${clan.jugadores.length} jugadores detectados**\n\n${linea.substring(0, 900)}`
                        : linea.substring(0, 900),
                    inline: false
                });

                primerBloque = false;
                bloqueActual = "";
            }
        } else {
            bloqueActual = nuevoBloque;
        }
    }

    if (bloqueActual.length > 0) {
        campos.push({
            name: primerBloque
                ? `🏴 Clan en el servidor: ${clan.tag}`
                : `🏴 ${clan.tag} | Jugadores`,
            value: primerBloque
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
    data: new SlashCommandBuilder()
        .setName("revisar")
        .setDescription(
            "Revisa el servidor y detecta todos los clanes con 6 o más jugadores"
        ),

    async execute(interaction) {
        console.log(
            "🎯 Ejecutando /revisar"
        );

        // =================================================
        // DEFER
        // =================================================

        await interaction.deferReply();

        // =================================================
        // OBTENER CONFIGURACIÓN
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
        // CONSULTAR JUGADORES
        // =================================================

        let resultadoServidor;

        try {
            resultadoServidor =
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
            resultadoServidor.jugadores;

        const relacionActual =
            resultadoServidor.relacionActual;

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
        // SI BATTLEMETRICS NO NOS DIO LA RELACIÓN DIRECTA
        // =================================================
        //
        // Comprobamos sesiones activas únicamente para
        // jugadores pertenecientes a posibles clanes.
        // =================================================

        if (!relacionActual) {
            console.log(
                "🔄 BM | Comprobando jugadores mediante sesiones activas..."
            );

            jugadores =
                await filtrarJugadoresOnline(
                    jugadores,
                    serverId
                );

            console.log(
                `🟢 BM | Jugadores online confirmados: ${jugadores.length}`
            );
        }

        // =================================================
        // DETECTAR CLANES
        // =================================================

        const clanes =
            detectarClanes(
                jugadores
            );

        console.log(
            `🏴 BM | Clanes encontrados: ${clanes.length}`
        );

        for (
            const clan of clanes
        ) {
            console.log(
                `🏴 ${clan.tag} | ${clan.jugadores.length} jugadores`
            );

            for (
                const jugador of clan.jugadores
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
                        `No se detectaron clanes con **${MIN_JUGADORES_CLAN} o más jugadores online**.\n\n` +
                        `👥 Jugadores online consultados: **${jugadores.length}**\n` +
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
        // CREAR EMBED PRINCIPAL
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
                    `Se detectaron **${clanes.length} clan(es)** con **${MIN_JUGADORES_CLAN}+ jugadores online**.\n\n` +
                    `👥 Jugadores online consultados: **${jugadores.length}**\n` +
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

        let totalCampos = 0;

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
                    totalCampos >= 25
                ) {
                    console.warn(
                        "⚠️ Discord | Se alcanzó el límite de 25 fields."
                    );

                    break;
                }

                embed.addFields(
                    campo
                );

                totalCampos++;
            }

            if (
                totalCampos >= 25
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