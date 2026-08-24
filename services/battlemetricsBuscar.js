require("dotenv").config();

const axios = require("axios");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BM_API = "https://api.battlemetrics.com";

const TIMEZONE_CHILE = "America/Santiago";


// =====================================================
// HEADERS
// =====================================================

function getHeaders() {

    const token =
        process.env.BATTLEMETRICS_TOKEN;

    return token
        ? {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        }
        : {
            "Content-Type": "application/json"
        };
}


// =====================================================
// FORMATEAR FECHA CHILE
// =====================================================

function formatearFechaChile(fecha) {

    if (!fecha) {
        return "Nunca";
    }

    try {

        const fechaReal =
            fecha instanceof Date
                ? fecha
                : new Date(fecha);

        if (
            isNaN(
                fechaReal.getTime()
            )
        ) {
            return "No disponible";
        }

        return new Intl.DateTimeFormat(
            "es-CL",
            {
                timeZone:
                    TIMEZONE_CHILE,

                day:
                    "2-digit",

                month:
                    "2-digit",

                year:
                    "numeric",

                hour:
                    "2-digit",

                minute:
                    "2-digit",

                hour12:
                    false
            }
        ).format(fechaReal);

    } catch (error) {

        console.error(
            "❌ Error formateando fecha:",
            error.message
        );

        return "No disponible";
    }
}


// =====================================================
// OBTENER SERVER ID DE UNA SESIÓN
// =====================================================

function obtenerServerIdDeSesion(
    sesion
) {

    if (!sesion) {
        return null;
    }

    // -------------------------------------------------
    // FORMA 1
    // relationships.server.data.id
    // -------------------------------------------------

    const relationship =
        sesion.relationships
            ?.server
            ?.data;

    if (
        relationship?.id
    ) {

        return String(
            relationship.id
        );
    }


    // -------------------------------------------------
    // FORMA 2
    // attributes.serverId
    // -------------------------------------------------

    if (
        sesion.attributes?.serverId
    ) {

        return String(
            sesion.attributes.serverId
        );
    }


    return null;
}


// =====================================================
// OBTENER INFORMACIÓN DEL SERVIDOR
// =====================================================

async function obtenerServidor(
    serverId
) {

    try {

        const response =
            await axios.get(
                `${BM_API}/servers/${serverId}`,
                {
                    headers:
                        getHeaders(),

                    timeout:
                        10000
                }
            );

        const servidor =
            response.data?.data;

        if (!servidor) {
            return null;
        }

        return {

            id:
                String(
                    servidor.id
                ),

            name:
                servidor.attributes?.name ||
                `Servidor ${serverId}`,

            game:
                servidor.attributes?.game ||
                null,

            players:
                servidor.attributes?.players ??
                null,

            maxPlayers:
                servidor.attributes?.maxPlayers ??
                null
        };

    } catch (error) {

        console.error(
            `❌ Error obteniendo servidor ${serverId}:`,
            error.response?.data ||
            error.message
        );

        return null;
    }
}


// =====================================================
// NORMALIZAR NOMBRE
// =====================================================

function normalizarNombre(
    nombre
) {

    return String(
        nombre || ""
    )
        .trim()
        .toLowerCase();
}


// =====================================================
// BUSCAR PERFILES GLOBALES POR NOMBRE
// =====================================================
//
// ESTA ES LA PRIMERA PARTE DE LA LÓGICA MANUAL:
//
// 1. Buscamos el nombre en BattleMetrics.
// 2. Obtenemos todos los perfiles encontrados.
// 3. NO decidimos todavía cuál pertenece al servidor.
//
// Después cada perfil será revisado individualmente.
// =====================================================

async function buscarPerfilesPorNombre(
    nombre
) {

    try {

        const nombreBuscado =
            String(
                nombre || ""
            ).trim();

        if (
            !nombreBuscado
        ) {

            return [];
        }

        const nombreNormalizado =
            normalizarNombre(
                nombreBuscado
            );

        console.log(
            `🌎 BM → buscando perfiles globales para "${nombreBuscado}"`
        );


        const resultados =
            [];

        let nextUrl =
            `${BM_API}/players`;

        let pagina =
            1;

        const limitePaginas =
            10;


        while (
            nextUrl &&
            pagina <= limitePaginas
        ) {

            console.log(
                `📄 BM /players → página ${pagina}`
            );


            const response =
                await axios.get(
                    nextUrl,
                    {
                        headers:
                            getHeaders(),

                        params:
                            pagina === 1
                                ? {

                                    "filter[search]":
                                        nombreBuscado,

                                    "page[size]":
                                        100

                                }
                                : undefined,

                        timeout:
                            15000
                    }
                );


            const jugadores =
                response.data?.data ||
                [];


            console.log(
                `📊 BM /players → ${jugadores.length} perfiles recibidos`
            );


            for (
                const jugador
                of jugadores
            ) {

                if (
                    jugador?.type !==
                    "player"
                ) {

                    continue;
                }


                const nombreBM =
                    normalizarNombre(
                        jugador.attributes?.name
                    );


                // -------------------------------------------------
                // IMPORTANTE:
                // Solo coincidencia EXACTA
                // -------------------------------------------------

                if (
                    nombreBM !==
                    nombreNormalizado
                ) {

                    continue;
                }


                const existe =
                    resultados.some(
                        resultado =>
                            String(
                                resultado.id
                            ) ===
                            String(
                                jugador.id
                            )
                    );


                if (
                    !existe
                ) {

                    resultados.push(
                        jugador
                    );
                }
            }


            nextUrl =
                response.data?.links?.next ||
                null;


            pagina++;
        }


        console.log(
            `🔎 BM → ${resultados.length} perfil(es) exactos encontrados para "${nombreBuscado}"`
        );


        return resultados;

    } catch (error) {

        console.error(
            "❌ Error buscando perfiles globales:",
            error.response?.data ||
            error.message
        );

        return [];
    }
}


// =====================================================
// OBTENER DETALLE DEL JUGADOR
// =====================================================

async function obtenerJugador(
    playerId
) {

    try {

        const response =
            await axios.get(
                `${BM_API}/players/${playerId}`,
                {
                    headers:
                        getHeaders(),

                    timeout:
                        10000
                }
            );


        return (
            response.data?.data ||
            null
        );

    } catch (error) {

        console.error(
            `⚠️ Error obteniendo jugador ${playerId}:`,
            error.response?.data ||
            error.message
        );

        return null;
    }
}


// =====================================================
// OBTENER SESIONES DEL JUGADOR
// =====================================================
//
// Esta es la parte CLAVE.
//
// Para cada perfil encontrado globalmente:
//
// Perfil #1
//      ↓
// /players/ID/relationships/sessions
//      ↓
// Revisamos todas sus sesiones
//
// Luego hacemos lo mismo con el Perfil #2, etc.
//
// NO usamos el servidor para buscar jugadores.
// =====================================================

async function obtenerSesionesJugador(
    playerId
) {

    try {

        const sesiones =
            [];

        let nextUrl =
            `${BM_API}/players/${playerId}/relationships/sessions?page[size]=100`;

        let pagina =
            1;

        const limitePaginas =
            50;


        while (
            nextUrl &&
            pagina <= limitePaginas
        ) {

            console.log(
                `📡 BM ${playerId} → obteniendo sesiones página ${pagina}`
            );


            const response =
                await axios.get(
                    nextUrl,
                    {
                        headers:
                            getHeaders(),

                        timeout:
                            15000
                    }
                );


            const data =
                response.data?.data ||
                [];


            console.log(
                `📊 BM ${playerId} → página ${pagina}: ${data.length} sesiones`
            );


            if (
                data.length === 0
            ) {

                break;
            }


            sesiones.push(
                ...data
            );


            nextUrl =
                response.data?.links?.next ||
                null;


            pagina++;
        }


        console.log(
            `📊 BM ${playerId} → ${sesiones.length} sesiones totales`
        );


        return sesiones;

    } catch (error) {

        console.error(
            `❌ Error obteniendo sesiones del jugador ${playerId}:`,
            error.response?.data ||
            error.message
        );

        return [];
    }
}


// =====================================================
// OBTENER ÚLTIMA SESIÓN
// =====================================================

function obtenerUltimaSesion(
    sesiones
) {

    if (
        !Array.isArray(
            sesiones
        ) ||
        sesiones.length === 0
    ) {

        return null;
    }


    const sesionesValidas =
        sesiones.filter(
            sesion => {

                const start =
                    sesion.attributes?.start;


                if (!start) {
                    return false;
                }


                const fecha =
                    new Date(
                        start
                    );


                return !isNaN(
                    fecha.getTime()
                );
            }
        );


    if (
        sesionesValidas.length === 0
    ) {

        return null;
    }


    sesionesValidas.sort(
        (a, b) => {

            const fechaA =
                new Date(
                    a.attributes.start
                ).getTime();

            const fechaB =
                new Date(
                    b.attributes.start
                ).getTime();


            return (
                fechaB -
                fechaA
            );
        }
    );


    return sesionesValidas[0];
}


// =====================================================
// CALCULAR TIEMPO DE SESIONES
// =====================================================

function calcularTiempoSesiones(
    sesiones
) {

    let segundos =
        0;


    const ahora =
        new Date();


    for (
        const sesion
        of sesiones || []
    ) {

        const atributos =
            sesion.attributes ||
            {};


        if (
            !atributos.start
        ) {

            continue;
        }


        const inicio =
            new Date(
                atributos.start
            );


        if (
            isNaN(
                inicio.getTime()
            )
        ) {

            continue;
        }


        let fin;


        if (
            atributos.stop
        ) {

            fin =
                new Date(
                    atributos.stop
                );

        } else {

            fin =
                ahora;
        }


        if (
            isNaN(
                fin.getTime()
            )
        ) {

            continue;
        }


        segundos +=
            Math.max(
                0,
                Math.floor(
                    (
                        fin -
                        inicio
                    ) / 1000
                )
            );
    }


    return segundos;
}


// =====================================================
// FORMATEAR TIEMPO
// =====================================================

function formatearTiempo(
    segundos
) {

    segundos =
        Number(
            segundos
        ) || 0;


    const horas =
        Math.floor(
            segundos / 3600
        );


    const minutos =
        Math.floor(
            (
                segundos % 3600
            ) / 60
        );


    if (
        horas > 0
    ) {

        return `${horas}h ${minutos}m`;
    }


    return `${minutos}m`;
}


// =====================================================
// OBTENER NOMBRE DEL SERVIDOR DE UNA SESIÓN
// =====================================================
//
// Algunas respuestas de BM pueden traer el servidor
// incluido dentro de la sesión.
// =====================================================

async function obtenerServidorDeSesion(
    sesion,
    servidoresCache
) {

    const serverId =
        obtenerServerIdDeSesion(
            sesion
        );


    if (
        !serverId
    ) {

        return null;
    }


    if (
        servidoresCache &&
        servidoresCache.has(serverId)
    ) {

        return servidoresCache.get(
            serverId
        );
    }


    const servidor =
        await obtenerServidor(
            serverId
        );


    if (
        servidoresCache
    ) {

        servidoresCache.set(
            serverId,
            servidor
        );
    }


    return servidor;
}


// =====================================================
// CONSTRUIR RESULTADO
// =====================================================

async function construirResultadoJugador(
    jugador,
    sesiones,
    serverId,
    servidorConfigurado
) {

    const atributos =
        jugador.attributes ||
        {};


    const playerId =
        String(
            jugador.id
        );


    // -------------------------------------------------
    // ORDENAR SESIONES DE MÁS NUEVA A MÁS ANTIGUA
    // -------------------------------------------------

    const sesionesOrdenadas =
        [...sesiones].sort(
            (a, b) => {

                const fechaA =
                    new Date(
                        a.attributes?.start ||
                        0
                    ).getTime();


                const fechaB =
                    new Date(
                        b.attributes?.start ||
                        0
                    ).getTime();


                return (
                    fechaB -
                    fechaA
                );
            }
        );


    const ultimaSesion =
        obtenerUltimaSesion(
            sesionesOrdenadas
        );


    if (
        !ultimaSesion
    ) {

        return null;
    }


    const ultimaAtributos =
        ultimaSesion.attributes ||
        {};


    const ultimaSesionServerId =
        obtenerServerIdDeSesion(
            ultimaSesion
        );


    const inicio =
        ultimaAtributos.start
            ? new Date(
                ultimaAtributos.start
            )
            : null;


    const fin =
        ultimaAtributos.stop
            ? new Date(
                ultimaAtributos.stop
            )
            : null;


    const online =
        Boolean(
            inicio &&
            !fin
        );


    // -------------------------------------------------
    // TIEMPO DE LA ÚLTIMA SESIÓN
    // -------------------------------------------------

    let segundosUltimaSesion =
        0;


    if (
        inicio &&
        !isNaN(
            inicio.getTime()
        )
    ) {

        const finReal =
            fin &&
            !isNaN(
                fin.getTime()
            )
                ? fin
                : new Date();


        segundosUltimaSesion =
            Math.max(
                0,
                Math.floor(
                    (
                        finReal -
                        inicio
                    ) / 1000
                )
            );
    }


    // -------------------------------------------------
    // PRIMERA Y ÚLTIMA CONEXIÓN
    // -------------------------------------------------

    let primeraConexion =
        null;


    let ultimaConexion =
        null;


    for (
        const sesion
        of sesiones
    ) {

        const inicioSesion =
            sesion.attributes?.start
                ? new Date(
                    sesion.attributes.start
                )
                : null;


        const stopSesion =
            sesion.attributes?.stop
                ? new Date(
                    sesion.attributes.stop
                )
                : null;


        if (
            inicioSesion &&
            !isNaN(
                inicioSesion.getTime()
            )
        ) {

            if (
                !primeraConexion ||
                inicioSesion <
                primeraConexion
            ) {

                primeraConexion =
                    inicioSesion;
            }
        }


        if (
            stopSesion &&
            !isNaN(
                stopSesion.getTime()
            )
        ) {

            if (
                !ultimaConexion ||
                stopSesion >
                ultimaConexion
            ) {

                ultimaConexion =
                    stopSesion;
            }
        }
    }


    if (
        !ultimaConexion &&
        inicio
    ) {

        ultimaConexion =
            inicio;
    }


    // -------------------------------------------------
    // TIEMPO TOTAL
    // -------------------------------------------------

    const segundos =
        calcularTiempoSesiones(
            sesiones
        );


    // -------------------------------------------------
    // SERVIDOR DE LA ÚLTIMA SESIÓN
    // -------------------------------------------------

    let nombreServidorUltimaSesion =
        "Desconocido";


    if (
        ultimaSesionServerId
    ) {

        if (
            String(
                ultimaSesionServerId
            ) ===
            String(
                serverId
            )
        ) {

            nombreServidorUltimaSesion =
                servidorConfigurado?.name ||
                `Servidor ${serverId}`;

        } else {

            const servidorUltima =
                await obtenerServidor(
                    ultimaSesionServerId
                );


            nombreServidorUltimaSesion =
                servidorUltima?.name ||
                `Servidor ${ultimaSesionServerId}`;
        }
    }


    return {

        id:
            playerId,

        name:
            atributos.name ||
            "Desconocido",

        serverId:
            String(
                serverId
            ),

        serverName:
            servidorConfigurado?.name ||
            `Servidor ${serverId}`,

        online,

        sesiones:
            sesiones.length,

        timePlayedSeconds:
            segundos,

        tiempoJugado:
            formatearTiempo(
                segundos
            ),

        ultimaSesionSegundos:
            segundosUltimaSesion,

        tiempoUltimaSesion:
            formatearTiempo(
                segundosUltimaSesion
            ),

        primeraConexion:
            formatearFechaChile(
                primeraConexion
            ),

        ultimaConexion:
            formatearFechaChile(
                ultimaConexion
            ),

        ultimaConexionDate:
            ultimaConexion,

        ultimaSesionInicio:
            formatearFechaChile(
                inicio
            ),

        ultimaSesionFin:
            formatearFechaChile(
                fin
            ),

        ultimaSesionServerId:
            ultimaSesionServerId,

        ultimaSesionServerName:
            nombreServidorUltimaSesion,

        perfilUrl:
            `https://www.battlemetrics.com/players/${playerId}`,

        historialConfirmado:
            true,

        origen:
            "global+ultima-sesion"
    };
}


// =====================================================
// BUSCAR JUGADOR HISTÓRICO
// =====================================================
//
// LÓGICA EXACTA DE /BUSCAR:
//
// 1. Buscar nombre globalmente.
// 2. Obtener todos los perfiles.
// 3. Entrar al Perfil #1.
// 4. Obtener sus sesiones.
// 5. Ordenar sesiones por fecha.
// 6. Mirar SOLO la última sesión.
// 7. Comparar servidor de esa última sesión
//    con el servidor configurado.
// 8. Si coincide → ESTE ES EL PERFIL.
// 9. Si no coincide → siguiente perfil.
// 10. Repetir.
// 11. Si ninguno coincide → null.
//
// NO buscamos jugadores directamente dentro del servidor.
//
// NO usamos "servidores relacionados" para decidir.
//
// NO basta con que el perfil haya jugado alguna vez
// en el servidor.
//
// TIENE QUE COINCIDIR LA ÚLTIMA SESIÓN.
// =====================================================

async function buscarJugadorHistorico(
    nombre,
    serverId
) {

    try {

        if (
            !nombre ||
            !String(nombre).trim()
        ) {

            return null;
        }


        if (
            !serverId
        ) {

            return null;
        }


        const serverIdString =
            String(
                serverId
            );


        const nombreBuscado =
            String(
                nombre
            ).trim();


        console.log(
            "================================================="
        );

        console.log(
            `🔎 /BUSCAR → "${nombreBuscado}"`
        );

        console.log(
            `🎯 Servidor configurado → ${serverIdString}`
        );

        console.log(
            "================================================="
        );


        // =================================================
        // OBTENER SERVIDOR CONFIGURADO
        // =================================================

        const servidor =
            await obtenerServidor(
                serverIdString
            );


        if (
            servidor
        ) {

            console.log(
                `🎮 Servidor configurado → ${servidor.name} (${servidor.id})`
            );

        } else {

            console.log(
                `⚠️ No se pudo obtener información del servidor ${serverIdString}`
            );
        }


        // =================================================
        // PASO 1
        // BUSCAR TODOS LOS PERFILES POR NOMBRE
        // =================================================

        const perfiles =
            await buscarPerfilesPorNombre(
                nombreBuscado
            );


        if (
            perfiles.length === 0
        ) {

            console.log(
                `❌ No existen perfiles para "${nombreBuscado}"`
            );

            return null;
        }


        console.log(
            `👥 BattleMetrics devolvió ${perfiles.length} perfil(es) para "${nombreBuscado}"`
        );


        // =================================================
        // CACHE DE SERVIDORES
        // =================================================

        const servidoresCache =
            new Map();


        // Guardamos el servidor configurado
        // para no volver a consultarlo.

        servidoresCache.set(
            serverIdString,
            servidor
        );


        // =================================================
        // PASO 2
        // REVISAR PERFIL POR PERFIL
        // =================================================

        const candidatosConfirmados =
            [];


        for (
            let indice = 0;
            indice < perfiles.length;
            indice++
        ) {

            const perfilBusqueda =
                perfiles[indice];


            const playerId =
                String(
                    perfilBusqueda.id
                );


            const nombrePerfil =
                perfilBusqueda.attributes?.name ||
                nombreBuscado;


            console.log(
                "-------------------------------------------------"
            );

            console.log(
                `👤 PERFIL ${indice + 1}/${perfiles.length}`
            );

            console.log(
                `   Nombre: ${nombrePerfil}`
            );

            console.log(
                `   ID: ${playerId}`
            );

            console.log(
                `   URL: https://www.battlemetrics.com/players/${playerId}`
            );


            // =================================================
            // OBTENER PERFIL COMPLETO
            // =================================================

            const detalle =
                await obtenerJugador(
                    playerId
                );


            const jugador =
                detalle ||
                perfilBusqueda;


            // =================================================
            // OBTENER TODAS SUS SESIONES
            // =================================================

            console.log(
                `📥 Perfil ${playerId} → cargando historial de sesiones...`
            );


            const sesiones =
                await obtenerSesionesJugador(
                    playerId
                );


            if (
                sesiones.length === 0
            ) {

                console.log(
                    `⛔ Perfil ${playerId} → no tiene sesiones accesibles`
                );

                continue;
            }


            // =================================================
            // ORDENAR SESIONES
            // =================================================

            sesiones.sort(
                (a, b) => {

                    return (
                        new Date(
                            b.attributes?.start ||
                            0
                        ) -
                        new Date(
                            a.attributes?.start ||
                            0
                        )
                    );
                }
            );


            // =================================================
            // ÚLTIMA SESIÓN
            // =================================================

            const ultimaSesion =
                obtenerUltimaSesion(
                    sesiones
                );


            if (
                !ultimaSesion
            ) {

                console.log(
                    `⛔ Perfil ${playerId} → no se pudo determinar la última sesión`
                );

                continue;
            }


            const ultimaSesionServerId =
                obtenerServerIdDeSesion(
                    ultimaSesion
                );


            const ultimaSesionInicio =
                ultimaSesion.attributes?.start
                    ? new Date(
                        ultimaSesion.attributes.start
                    )
                    : null;


            const ultimaSesionFin =
                ultimaSesion.attributes?.stop
                    ? new Date(
                        ultimaSesion.attributes.stop
                    )
                    : null;


            console.log(
                `🕐 Última sesión → ${formatearFechaChile(ultimaSesionInicio)}`
            );

            console.log(
                `🎮 Servidor última sesión → ${ultimaSesionServerId || "DESCONOCIDO"}`
            );

            console.log(
                `🎯 Servidor buscado → ${serverIdString}`
            );


            // =================================================
            // COMPARACIÓN EXACTA
            // =================================================

            if (
                !ultimaSesionServerId ||
                String(
                    ultimaSesionServerId
                ) !==
                serverIdString
            ) {

                console.log(
                    `❌ Perfil ${playerId} DESCARTADO → su última sesión NO corresponde al servidor configurado`
                );


                if (
                    ultimaSesionServerId
                ) {

                    let servidorUltimaSesion =
                        servidoresCache.get(
                            String(
                                ultimaSesionServerId
                            )
                        );


                    if (
                        !servidorUltimaSesion
                    ) {

                        servidorUltimaSesion =
                            await obtenerServidor(
                                ultimaSesionServerId
                            );


                        servidoresCache.set(
                            String(
                                ultimaSesionServerId
                            ),
                            servidorUltimaSesion
                        );
                    }


                    console.log(
                        `   Último servidor real → ${
                            servidorUltimaSesion?.name ||
                            `Servidor ${ultimaSesionServerId}`
                        }`
                    );
                }


                // ---------------------------------------------
                // SIGUIENTE PERFIL
                // ---------------------------------------------

                continue;
            }


            // =================================================
            // ¡COINCIDE!
            // =================================================

            console.log(
                `✅ PERFIL ${playerId} → LA ÚLTIMA SESIÓN SÍ CORRESPONDE AL SERVIDOR CONFIGURADO`
            );


            // =================================================
            // CONSTRUIR RESULTADO
            // =================================================

            const resultado =
                await construirResultadoJugador(
                    jugador,
                    sesiones,
                    serverIdString,
                    servidor
                );


            if (
                !resultado
            ) {

                console.log(
                    `⚠️ Perfil ${playerId} coincidió, pero no se pudo construir el resultado`
                );

                continue;
            }


            candidatosConfirmados.push(
                resultado
            );


            // =================================================
            // ESTE ES EL PERFIL
            // =================================================
            //
            // Como estamos reproduciendo la lógica manual,
            // en cuanto encontramos el primer perfil cuya
            // ÚLTIMA sesión corresponde al servidor,
            // terminamos.
            // =================================================

            console.log(
                "================================================="
            );

            console.log(
                `🎯 PERFIL CORRECTO ENCONTRADO`
            );

            console.log(
                `   Nombre: ${resultado.name}`
            );

            console.log(
                `   ID: ${resultado.id}`
            );

            console.log(
                `   Servidor: ${resultado.serverName}`
            );

            console.log(
                `   Última sesión: ${resultado.ultimaSesionInicio}`
            );

            console.log(
                `   Sesiones: ${resultado.sesiones}`
            );

            console.log(
                `   Tiempo: ${resultado.tiempoJugado}`
            );

            console.log(
                "================================================="
            );


            return {

                ...resultado,

                candidatos:
                    candidatosConfirmados.length > 1
                        ? candidatosConfirmados
                        : []
            };
        }


        // =================================================
        // NINGÚN PERFIL COINCIDE
        // =================================================

        console.log(
            "================================================="
        );

        console.log(
            `❌ NINGÚN PERFIL PARA "${nombreBuscado}" TIENE COMO ÚLTIMA SESIÓN EL SERVIDOR ${serverIdString}`
        );

        console.log(
            "================================================="
        );


        return null;


    } catch (error) {

        console.error(
            "❌ Error buscando jugador histórico:",
            error.response?.data ||
            error.message
        );

        return null;
    }
}


// =====================================================
// COMPATIBILIDAD
// =====================================================

async function searchBattleMetricsPlayerHistory(
    nombre,
    serverId
) {

    return buscarJugadorHistorico(
        nombre,
        serverId
    );
}


// =====================================================
// EXPORTS
// =====================================================

module.exports = {

    buscarPerfilesPorNombre,

    obtenerJugador,

    obtenerServidor,

    obtenerSesionesJugador,

    buscarJugadorHistorico,

    searchBattleMetricsPlayerHistory,

    formatearFechaChile,

    calcularTiempoSesiones,

    formatearTiempo,

    obtenerServerIdDeSesion,

    obtenerUltimaSesion

};