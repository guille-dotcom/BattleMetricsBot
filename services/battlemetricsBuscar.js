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
// OBTENER SERVER ID DEL PERFIL
// =====================================================
//
// BattleMetrics puede devolver:
//
// relationships.servers.data
//
// El primer elemento representa el servidor que aparece
// primero en:
//
// "Servers seen on X server(s)"
//
// Ese es el dato que utilizamos para determinar la
// actividad/servidor más reciente visible en el perfil.
//
// =====================================================

function obtenerPrimerServerIdDelPerfil(
    jugador
) {

    if (!jugador) {
        return null;
    }

    const servidores =
        jugador.relationships
            ?.servers
            ?.data;

    if (
        !Array.isArray(servidores) ||
        servidores.length === 0
    ) {
        return null;
    }

    const primerServidor =
        servidores[0];

    if (
        !primerServidor?.id
    ) {
        return null;
    }

    return String(
        primerServidor.id
    );
}


// =====================================================
// OBTENER SERVIDORES DEL PERFIL
// =====================================================
//
// Devuelve los servidores en el mismo orden entregado
// por BattleMetrics.
//
// IMPORTANTE:
//
// NO ordenamos manualmente.
//
// La posición 0 es la que utilizamos como actividad
// principal/más reciente del perfil.
// =====================================================

function obtenerServidoresDelPerfil(
    jugador
) {

    if (!jugador) {
        return [];
    }

    const servidores =
        jugador.relationships
            ?.servers
            ?.data;

    if (
        !Array.isArray(
            servidores
        )
    ) {
        return [];
    }

    return servidores
        .filter(
            servidor =>
                servidor &&
                servidor.id
        )
        .map(
            servidor => ({
                id:
                    String(
                        servidor.id
                    ),

                type:
                    servidor.type ||
                    "server",

                meta:
                    servidor.meta ||
                    {}
            })
        );
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
// IMPORTANTE:
//
// Aquí usamos:
//
// include=server
//
// para que BattleMetrics devuelva la información de los
// servidores relacionados al perfil.
//
// La relación esperada es:
//
// relationships.servers.data
//
// Esto permite utilizar el primer servidor del perfil
// sin depender del historial de sesiones.
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
                                        100,

                                    include:
                                        "server"

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
                // SOLO COINCIDENCIA EXACTA
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


        // -------------------------------------------------
        // MOSTRAR SERVIDOR PRINCIPAL DE CADA PERFIL
        // -------------------------------------------------

        for (
            const perfil
            of resultados
        ) {

            const servidores =
                obtenerServidoresDelPerfil(
                    perfil
                );

            const primerServidor =
                servidores[0];

            console.log(
                `👤 Perfil ${perfil.id} → ${servidores.length} servidor(es) relacionados`
            );

            console.log(
                `   🥇 Primer servidor → ${
                    primerServidor?.id ||
                    "DESCONOCIDO"
                }`
            );
        }


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
// LAS SESIONES YA NO DECIDEN QUÉ PERFIL ES.
//
// Se utilizan únicamente como información adicional.
//
// Si BattleMetrics devuelve 0 sesiones:
//
// → NO descartamos el perfil.
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
    servidorConfigurado,
    servidorActividad
) {

    const atributos =
        jugador.attributes ||
        {};


    const playerId =
        String(
            jugador.id
        );


    // -------------------------------------------------
    // ORDENAR SESIONES
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


    // -------------------------------------------------
    // DATOS DE LA ÚLTIMA SESIÓN
    // -------------------------------------------------
    //
    // Puede no existir.
    //
    // NO es obligatorio para que el perfil sea válido.
    // -------------------------------------------------

    let ultimaSesionServerId =
        null;

    let inicio =
        null;

    let fin =
        null;

    let segundosUltimaSesion =
        0;


    if (
        ultimaSesion
    ) {

        const ultimaAtributos =
            ultimaSesion.attributes ||
            {};


        ultimaSesionServerId =
            obtenerServerIdDeSesion(
                ultimaSesion
            );


        inicio =
            ultimaAtributos.start
                ? new Date(
                    ultimaAtributos.start
                )
                : null;


        fin =
            ultimaAtributos.stop
                ? new Date(
                    ultimaAtributos.stop
                )
                : null;


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
    }


    // -------------------------------------------------
    // ONLINE
    // -------------------------------------------------

    const online =
        Boolean(
            inicio &&
            !fin
        );


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
        servidorActividad?.name ||
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


    // -------------------------------------------------
    // SERVIDORES DEL PERFIL
    // -------------------------------------------------

    const servidoresPerfil =
        obtenerServidoresDelPerfil(
            jugador
        );


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
            ultimaSesionServerId ||
            String(
                servidorActividad?.id ||
                serverId
            ),

        ultimaSesionServerName:
            nombreServidorUltimaSesion,

        // -------------------------------------------------
        // NUEVO:
        // servidor que BattleMetrics muestra primero
        // en "Servers seen on"
        // -------------------------------------------------

        servidorActividadId:
            servidorActividad?.id ||
            null,

        servidorActividadNombre:
            servidorActividad?.name ||
            "Desconocido",

        servidoresPerfil:

            servidoresPerfil.map(
                servidor =>
                    servidor.id
            ),

        cantidadServidoresPerfil:
            servidoresPerfil.length,

        perfilUrl:
            `https://www.battlemetrics.com/players/${playerId}`,

        historialConfirmado:
            true,

        origen:
            "global+servers-profile"
    };
}


// =====================================================
// BUSCAR JUGADOR HISTÓRICO
// =====================================================
//
// LÓGICA DEFINITIVA DE /BUSCAR:
//
// 1. Buscar todos los perfiles globalmente.
//
// 2. Para cada perfil mirar:
//
//    relationships.servers.data
//
// 3. Tomar:
//
//    servers.data[0]
//
// 4. Comparar ese servidor con el servidor configurado.
//
// 5. Si coincide → perfil correcto.
//
// 6. Si no coincide → siguiente perfil.
//
// 7. Las sesiones NO son necesarias para determinar
//    el perfil.
//
// 8. Las sesiones solamente se utilizan para obtener
//    estadísticas adicionales cuando están disponibles.
//
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
        // BUSCAR PERFILES
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
        // CACHE SERVIDORES
        // =================================================

        const servidoresCache =
            new Map();


        servidoresCache.set(
            serverIdString,
            servidor
        );


        // =================================================
        // PASO 2
        // REVISAR PERFIL POR PERFIL
        // =================================================

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


            let jugador =
                detalle ||
                perfilBusqueda;


            // =================================================
            // IMPORTANTE
            // =================================================
            //
            // Si el GET individual no trae relationships.servers
            // pero el resultado de /players sí los trae,
            // conservamos los datos del resultado original.
            //
            // =================================================

            if (
                !jugador.relationships?.servers?.data?.length &&
                perfilBusqueda.relationships?.servers?.data?.length
            ) {

                jugador = {

                    ...jugador,

                    relationships: {

                        ...(jugador.relationships || {}),

                        servers:
                            perfilBusqueda.relationships.servers

                    }
                };
            }


            // =================================================
            // SERVIDORES DEL PERFIL
            // =================================================

            const servidoresPerfil =
                obtenerServidoresDelPerfil(
                    jugador
                );


            console.log(
                `🌐 Perfil ${playerId} → ${servidoresPerfil.length} servidor(es) visibles`
            );


            if (
                servidoresPerfil.length === 0
            ) {

                console.log(
                    `⚠️ Perfil ${playerId} → BattleMetrics no entregó servidores relacionados`
                );

                // -------------------------------------------------
                // IMPORTANTE:
                // No usamos sesiones para rescatar automáticamente
                // este perfil porque la lógica principal debe ser
                // "Servers seen on".
                // -------------------------------------------------

                continue;
            }


            // =================================================
            // PRIMER SERVIDOR
            // =================================================

            const primerServidor =
                servidoresPerfil[0];


            const primerServerId =
                String(
                    primerServidor.id
                );


            console.log(
                `🥇 Primer servidor del perfil → ${primerServerId}`
            );

            console.log(
                `🎯 Servidor buscado → ${serverIdString}`
            );


            // =================================================
            // COMPARACIÓN EXACTA
            // =================================================

            if (
                primerServerId !==
                serverIdString
            ) {

                console.log(
                    `❌ Perfil ${playerId} DESCARTADO → su primer servidor NO es el servidor configurado`
                );


                // -------------------------------------------------
                // Obtener nombre del primer servidor
                // -------------------------------------------------

                let servidorPrimerPerfil =
                    servidoresCache.get(
                        primerServerId
                    );


                if (
                    !servidorPrimerPerfil
                ) {

                    servidorPrimerPerfil =
                        await obtenerServidor(
                            primerServerId
                        );


                    servidoresCache.set(
                        primerServerId,
                        servidorPrimerPerfil
                    );
                }


                console.log(
                    `   🏠 Primer servidor real → ${
                        servidorPrimerPerfil?.name ||
                        `Servidor ${primerServerId}`
                    }`
                );


                continue;
            }


            // =================================================
            // ¡PERFIL CORRECTO!
            // =================================================

            console.log(
                `✅ PERFIL ${playerId} → SU PRIMER SERVIDOR ES EL CONFIGURADO`
            );


            console.log(
                `   🥇 Servidor principal → ${primerServerId}`
            );


            // =================================================
            // OBTENER SESIONES
            // =================================================
            //
            // Ahora las sesiones son OPCIONALES.
            //
            // Si devuelven 0:
            //
            // → NO descartamos el perfil.
            //
            // =================================================

            console.log(
                `📥 Perfil ${playerId} → cargando historial de sesiones opcional...`
            );


            const sesiones =
                await obtenerSesionesJugador(
                    playerId
                );


            if (
                sesiones.length === 0
            ) {

                console.log(
                    `⚠️ Perfil ${playerId} → no tiene sesiones accesibles, pero el perfil YA COINCIDE por Servers seen`
                );
            }


            // =================================================
            // SERVIDOR PRINCIPAL
            // =================================================

            let servidorActividad =
                servidoresCache.get(
                    primerServerId
                );


            if (
                !servidorActividad
            ) {

                servidorActividad =
                    await obtenerServidor(
                        primerServerId
                    );


                servidoresCache.set(
                    primerServerId,
                    servidorActividad
                );
            }


            // =================================================
            // CONSTRUIR RESULTADO
            // =================================================

            const resultado =
                await construirResultadoJugador(
                    jugador,
                    sesiones,
                    serverIdString,
                    servidor,
                    servidorActividad
                );


            if (
                !resultado
            ) {

                console.log(
                    `⚠️ Perfil ${playerId} coincidió, pero no se pudo construir el resultado`
                );

                continue;
            }


            // =================================================
            // FORZAR EL SERVIDOR DE ACTIVIDAD
            // =================================================
            //
            // Este dato viene del primer servidor del perfil,
            // no de sessions.
            // =================================================

            resultado.ultimaSesionServerId =
                primerServerId;

            resultado.ultimaSesionServerName =
                servidorActividad?.name ||
                `Servidor ${primerServerId}`;


            resultado.servidorActividadId =
                primerServerId;


            resultado.servidorActividadNombre =
                servidorActividad?.name ||
                `Servidor ${primerServerId}`;


            resultado.origen =
                "global+servers-profile";


            // =================================================
            // LOG FINAL
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
                `   Servidor principal: ${resultado.ultimaSesionServerName}`
            );

            console.log(
                `   Servidor ID: ${resultado.ultimaSesionServerId}`
            );

            console.log(
                `   Sesiones accesibles: ${resultado.sesiones}`
            );

            console.log(
                `   Tiempo: ${resultado.tiempoJugado}`
            );

            console.log(
                `   Perfil: ${resultado.perfilUrl}`
            );

            console.log(
                "================================================="
            );


            // =================================================
            // DEVOLVER PERFIL
            // =================================================

            return {

                ...resultado,

                candidatos:
                    []
            };
        }


        // =================================================
        // NINGÚN PERFIL COINCIDE
        // =================================================

        console.log(
            "================================================="
        );

        console.log(
            `❌ NINGÚN PERFIL PARA "${nombreBuscado}" TIENE COMO PRIMER SERVIDOR ${serverIdString}`
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

    obtenerUltimaSesion,

    obtenerPrimerServerIdDelPerfil,

    obtenerServidoresDelPerfil

};