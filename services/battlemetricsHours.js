// battleMetricsHours.js

const axios = require("axios");

const BM_API = "https://api.battlemetrics.com";
const BM_TOKEN = process.env.BATTLEMETRICS_TOKEN;

const MAX_PAGINAS = 100;
const CONCURRENCIA_SERVIDORES = 5;
const MAX_REINTENTOS_BM = 2;
const REQUEST_TIMEOUT = 30000;

const HEADERS = {
  Authorization: `Bearer ${BM_TOKEN}`,
  Accept: "application/json",
};

// ============================================================
// AXIOS / BATTLEMETRICS
// ============================================================

const bm = axios.create({
  baseURL: BM_API,
  timeout: REQUEST_TIMEOUT,
  headers: HEADERS,
});

// ============================================================
// UTILIDADES
// ============================================================

function numeroValido(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function convertirSegundosAHoras(segundos) {
  if (!numeroValido(segundos) || segundos <= 0) return 0;
  return segundos / 3600;
}

function formatearHoras(horas) {
  if (!numeroValido(horas) || horas <= 0) return "0h";

  const horasEnteras = Math.floor(horas);
  const minutos = Math.floor((horas - horasEnteras) * 60);

  if (minutos === 0) {
    return `${horasEnteras}h`;
  }

  return `${horasEnteras}h ${minutos}m`;
}

function formatearDuracion(segundos) {
  if (!numeroValido(segundos) || segundos <= 0) {
    return "0m";
  }

  const horas = Math.floor(segundos / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);

  if (horas > 0) {
    return `${horas}h ${minutos}m`;
  }

  return `${minutos}m`;
}

function obtenerTimestampActualChile() {
  return new Date();
}

function obtenerInicioSemanaChile() {
  const ahora = new Date();

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const partes = formatter.formatToParts(ahora);

  const year = Number(partes.find((p) => p.type === "year")?.value);
  const month = Number(partes.find((p) => p.type === "month")?.value);
  const day = Number(partes.find((p) => p.type === "day")?.value);

  const fecha = new Date(Date.UTC(year, month - 1, day));

  const dia = fecha.getUTCDay();

  const diferencia = dia === 0 ? 6 : dia - 1;

  fecha.setUTCDate(fecha.getUTCDate() - diferencia);

  return fecha;
}

function obtenerInicioMesChile() {
  const ahora = new Date();

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
  });

  const partes = formatter.formatToParts(ahora);

  const year = Number(partes.find((p) => p.type === "year")?.value);
  const month = Number(partes.find((p) => p.type === "month")?.value);

  return new Date(Date.UTC(year, month - 1, 1));
}

// ============================================================
// PETICIONES BM
// ============================================================

async function solicitarBM(endpoint, config = {}, intento = 0) {
  try {
    const response = await bm.get(endpoint, config);
    return response;
  } catch (error) {
    const status = error.response?.status;

    // No insistimos en errores permanentes.
    if (
      status === 400 ||
      status === 401 ||
      status === 403 ||
      status === 404 ||
      status === 405
    ) {
      throw error;
    }

    if (intento >= MAX_REINTENTOS_BM) {
      throw error;
    }

    const espera = 1000 * (intento + 1);

    console.log(
      `⚠️ BM | Error ${status || "sin status"} en ${endpoint}. Reintentando en ${espera}ms...`
    );

    await new Promise((resolve) => setTimeout(resolve, espera));

    return solicitarBM(endpoint, config, intento + 1);
  }
}

// ============================================================
// EXTRAER IDs DE SERVIDORES
// ============================================================

function agregarServidorAlMap(recurso, servidoresMap) {
  if (!recurso || !recurso.id) return;

  const id = String(recurso.id);

  const anterior = servidoresMap.get(id);

  if (!anterior) {
    servidoresMap.set(id, {
      ...recurso,
      id,
    });

    return;
  }

  servidoresMap.set(id, {
    ...anterior,
    ...recurso,
    attributes: {
      ...(anterior.attributes || {}),
      ...(recurso.attributes || {}),
    },
    relationships: {
      ...(anterior.relationships || {}),
      ...(recurso.relationships || {}),
    },
  });
}

function extraerServidoresDeRespuesta(data, servidoresMap) {
  if (!data) return 0;

  let encontrados = 0;

  const procesar = (recurso) => {
    if (!recurso) return;

    if (
      recurso.type === "server" &&
      recurso.id
    ) {
      const antes = servidoresMap.has(String(recurso.id));

      agregarServidorAlMap(recurso, servidoresMap);

      if (!antes) {
        encontrados++;
      }
    }
  };

  if (Array.isArray(data.data)) {
    for (const recurso of data.data) {
      procesar(recurso);
    }
  } else if (data.data) {
    procesar(data.data);
  }

  if (Array.isArray(data.included)) {
    for (const recurso of data.included) {
      procesar(recurso);
    }
  }

  return encontrados;
}

// ============================================================
// BUSCAR JUGADOR EN SERVIDOR
// ============================================================

async function searchBattleMetricsPlayer(playerName, serverId) {
  console.log(
    `🔎 BM | Buscando "${playerName}" en servidor ${serverId}`
  );

  try {
    const response = await solicitarBM(`/servers/${serverId}`, {
      params: {
        include: "player",
      },
    });

    const included = response.data?.included || [];

    const jugadores = included.filter(
      (item) => item.type === "player"
    );

    console.log(
      `🔎 BM | Recursos de jugadores recibidos: ${jugadores.length}`
    );

    const nombreBuscado = String(playerName)
      .trim()
      .toLowerCase();

    const coincidencias = jugadores.filter((jugador) => {
      const nombre = jugador.attributes?.name;

      if (!nombre) return false;

      return (
        String(nombre).trim().toLowerCase() === nombreBuscado
      );
    });

    console.log(
      `🔎 BM | Coincidencias encontradas: ${coincidencias.length}`
    );

    if (!coincidencias.length) {
      return null;
    }

    return coincidencias[0];
  } catch (error) {
    console.error(
      `❌ BM | Error buscando jugador:`,
      error.response?.status,
      error.response?.data || error.message
    );

    return null;
  }
}

// ============================================================
// INFORMACIÓN DEL SERVIDOR
// ============================================================

async function obtenerInfoServidor(serverId, cache = new Map()) {
  const id = String(serverId);

  if (cache.has(id)) {
    return cache.get(id);
  }

  try {
    let response;

    try {
      response = await solicitarBM(`/servers/${id}`, {
        params: {
          include: "game",
        },
      });
    } catch {
      response = await solicitarBM(`/servers/${id}`);
    }

    const server = response.data?.data;

    if (!server) {
      return null;
    }

    const attributes = server.attributes || {};

    const nombre =
      attributes.name ||
      `Servidor ${id}`;

    const game =
      attributes.game ||
      attributes.gameName ||
      attributes.gameSlug ||
      "";

    const ip =
      attributes.ip ||
      attributes.address ||
      null;

    const port =
      attributes.port ||
      null;

    const meta = attributes.meta || {};

    const resultado = {
      id,
      name: nombre,
      game,
      ip,
      port,
      status: attributes.status,
      players: attributes.players,
      maxPlayers:
        attributes.maxPlayers ||
        attributes.max_players ||
        null,
      timePlayed:
        meta.timePlayed ??
        meta.timeplayed ??
        null,
      attributes,
      raw: server,
    };

    cache.set(id, resultado);

    return resultado;
  } catch (error) {
    console.log(
      `⚠️ BM | No se pudo obtener información del servidor ${id}: ${error.response?.status || error.message}`
    );

    return null;
  }
}

// ============================================================
// COMPROBAR SI JUGADOR ESTÁ ACTUALMENTE EN SERVIDOR
// ============================================================

async function comprobarJugadorEnServidor(playerId, serverId) {
  try {
    const response = await solicitarBM(`/servers/${serverId}`, {
      params: {
        include: "player",
      },
    });

    const included = response.data?.included || [];

    return included.some(
      (item) =>
        item.type === "player" &&
        String(item.id) === String(playerId)
    );
  } catch {
    return false;
  }
}

// ============================================================
// TODAS LAS SESIONES DEL JUGADOR
// ============================================================

async function obtenerTodasLasSesiones(playerId) {
  const sesiones = [];

  let url =
    `/players/${playerId}/relationships/sessions` +
    `?page[size]=100`;

  let pagina = 1;

  while (url && pagina <= MAX_PAGINAS) {
    try {
      const response = await solicitarBM(url);

      const data = response.data;

      const registros = Array.isArray(data?.data)
        ? data.data
        : [];

      sesiones.push(...registros);

      console.log(
        `📊 BM | Sesiones página ${pagina}: ${registros.length} | Total: ${sesiones.length}`
      );

      url = data?.links?.next || null;

      pagina++;
    } catch (error) {
      console.error(
        `❌ BM | Error obteniendo sesiones página ${pagina}:`,
        error.response?.status,
        error.response?.data || error.message
      );

      break;
    }
  }

  console.log(
    `📊 BM | TOTAL sesiones obtenidas: ${sesiones.length}`
  );

  return sesiones;
}

// ============================================================
// DESCUBRIR SERVIDORES MEDIANTE SESIONES
// ============================================================

function agregarServidoresDeSesiones(sesiones, servidoresMap) {
  let agregados = 0;

  for (const sesion of sesiones) {
    if (!sesion) continue;

    // La sesión puede traer relationship server.
    const serverRelationship =
      sesion.relationships?.server;

    const serverData =
      serverRelationship?.data;

    if (
      serverData?.type === "server" &&
      serverData?.id
    ) {
      const id = String(serverData.id);

      if (!servidoresMap.has(id)) {
        servidoresMap.set(id, {
          type: "server",
          id,
        });

        agregados++;
      }
    }

    // También puede venir el servidor directamente incluido.
    if (Array.isArray(sesion.included)) {
      for (const recurso of sesion.included) {
        if (
          recurso?.type === "server" &&
          recurso?.id
        ) {
          const id = String(recurso.id);

          if (!servidoresMap.has(id)) {
            servidoresMap.set(id, recurso);
            agregados++;
          }
        }
      }
    }
  }

  return agregados;
}

// ============================================================
// DESCUBRIMIENTO 1:
// PERFIL DEL JUGADOR + INCLUDE SERVER
// ============================================================

async function descubrirServidoresDesdePerfil(
  playerId,
  servidoresMap
) {
  console.log(
    `🔎 BM | Descubriendo servidores desde el perfil ${playerId}`
  );

  try {
    const response = await solicitarBM(
      `/players/${playerId}`,
      {
        params: {
          include: "server",
        },
      }
    );

    const encontrados =
      extraerServidoresDeRespuesta(
        response.data,
        servidoresMap
      );

    console.log(
      `🖥️ BM | Servidores encontrados desde perfil: ${encontrados}`
    );

    return encontrados;
  } catch (error) {
    console.error(
      `⚠️ BM | Error descubriendo servidores desde perfil:`,
      error.response?.status,
      error.response?.data || error.message
    );

    return 0;
  }
}

// ============================================================
// DESCUBRIMIENTO 2:
// RELATIONSHIP SERVERS
// ============================================================

async function obtenerTodosLosServidoresJugador(
  playerId,
  servidoresMap
) {
  console.log(
    `\n🔎 BM | OBTENIENDO TODOS LOS SERVIDORES DEL JUGADOR ${playerId}`
  );

  let totalAgregados = 0;

  // ----------------------------------------------------------
  // MÉTODO 1
  // /players/{id}/relationships/servers
  // ----------------------------------------------------------

  let url =
    `/players/${playerId}/relationships/servers` +
    `?page[size]=100`;

  let pagina = 1;

  try {
    while (url && pagina <= MAX_PAGINAS) {
      console.log(
        `📡 BM | Consultando servidores página ${pagina}`
      );

      const response = await solicitarBM(url);

      const encontrados =
        extraerServidoresDeRespuesta(
          response.data,
          servidoresMap
        );

      totalAgregados += encontrados;

      console.log(
        `🖥️ BM | Página ${pagina}: ${encontrados} servidores nuevos | Total: ${servidoresMap.size}`
      );

      url = response.data?.links?.next || null;

      pagina++;
    }
  } catch (error) {
    console.log(
      `⚠️ BM | Error obteniendo relationships/servers página ${pagina}: ${error.response?.status || error.message}`
    );
  }

  // ----------------------------------------------------------
  // MÉTODO 2
  // /players/{id}/servers
  //
  // Algunas respuestas/API antiguas de BM pueden exponer
  // los servidores directamente en esta ruta.
  // ----------------------------------------------------------

  if (pagina === 1 || servidoresMap.size === 0) {
    console.log(
      `🔄 BM | Probando endpoint alternativo /players/${playerId}/servers`
    );

    url =
      `/players/${playerId}/servers` +
      `?page[size]=100`;

    pagina = 1;

    try {
      while (url && pagina <= MAX_PAGINAS) {
        console.log(
          `📡 BM | Endpoint alternativo - página ${pagina}`
        );

        const response = await solicitarBM(url);

        const encontrados =
          extraerServidoresDeRespuesta(
            response.data,
            servidoresMap
          );

        totalAgregados += encontrados;

        console.log(
          `🖥️ BM | Endpoint alternativo: ${encontrados} nuevos | Total: ${servidoresMap.size}`
        );

        url = response.data?.links?.next || null;

        pagina++;
      }
    } catch (error) {
      console.log(
        `⚠️ BM | Endpoint alternativo /players/${playerId}/servers no disponible: ${error.response?.status || error.message}`
      );
    }
  }

  console.log(
    `🖥️ BM | Servidores obtenidos mediante relaciones: ${servidoresMap.size}`
  );

  return totalAgregados;
}

// ============================================================
// DESCUBRIMIENTO 3:
// TIME-PLAYED-HISTORY GLOBAL
//
// Se utiliza como fuente adicional de servidores.
// No dependemos exclusivamente de sessions.
// ============================================================

async function descubrirServidoresDesdeTimePlayedHistory(
  playerId,
  servidoresMap
) {
  console.log(
    `\n🕒 BM | Buscando servidores mediante time-played-history`
  );

  let totalNuevos = 0;

  const endpoints = [
    `/players/${playerId}/time-played-history?page[size]=100`,
    `/players/${playerId}/relationships/time-played-history?page[size]=100`,
  ];

  for (const endpointInicial of endpoints) {
    let url = endpointInicial;
    let pagina = 1;

    try {
      while (url && pagina <= MAX_PAGINAS) {
        const response = await solicitarBM(url);

        const data = response.data;

        const antes = servidoresMap.size;

        extraerServidoresDeRespuesta(
          data,
          servidoresMap
        );

        // Buscar explícitamente referencias a servidor
        // en atributos y relationships.
        const registros = Array.isArray(data?.data)
          ? data.data
          : [];

        for (const registro of registros) {
          const relServer =
            registro.relationships?.server?.data;

          if (
            relServer?.type === "server" &&
            relServer.id
          ) {
            agregarServidorAlMap(
              relServer,
              servidoresMap
            );
          }

          const attrServerId =
            registro.attributes?.serverId ||
            registro.attributes?.server_id;

          if (attrServerId) {
            agregarServidorAlMap(
              {
                type: "server",
                id: String(attrServerId),
              },
              servidoresMap
            );
          }
        }

        const nuevos =
          servidoresMap.size - antes;

        totalNuevos += nuevos;

        console.log(
          `🕒 BM | History página ${pagina}: ${nuevos} servidores nuevos | Total: ${servidoresMap.size}`
        );

        url = data?.links?.next || null;

        pagina++;
      }

      // Si el endpoint funcionó, no hace falta intentar
      // innecesariamente el segundo.
      if (servidoresMap.size > 0) {
        break;
      }
    } catch (error) {
      console.log(
        `⚠️ BM | History endpoint no disponible (${error.response?.status || error.message})`
      );
    }
  }

  console.log(
    `🕒 BM | Nuevos servidores descubiertos por history: ${totalNuevos}`
  );

  return totalNuevos;
}

// ============================================================
// AGREGAR SERVIDOR
// ============================================================

function agregarServidorServidorMapSeguro(
  servidor,
  servidoresMap
) {
  if (!servidor?.id) return;

  agregarServidorAlMap(
    servidor,
    servidoresMap
  );
}

// ============================================================
// HORAS DIRECTAS PLAYER / SERVER
// ============================================================

async function obtenerHorasJugadorServidor(
  playerId,
  serverId
) {
  const idJugador = String(playerId);
  const idServidor = String(serverId);

  // ----------------------------------------------------------
  // MÉTODO 1
  // /players/{player}/servers/{server}
  // ----------------------------------------------------------

  try {
    const response = await solicitarBM(
      `/players/${idJugador}/servers/${idServidor}`
    );

    const data = response.data?.data;

    if (data) {
      const meta =
        data.meta || {};

      const attributes =
        data.attributes || {};

      const segundos =
        meta.timePlayed ??
        meta.timeplayed ??
        meta.seconds ??
        meta.totalTime ??
        meta.totalSeconds ??
        attributes.timePlayed ??
        attributes.timeplayed ??
        attributes.seconds ??
        attributes.totalTime ??
        attributes.totalSeconds;

      if (numeroValido(segundos)) {
        return segundos;
      }
    }
  } catch (error) {
    if (error.response?.status !== 404) {
      console.log(
        `⚠️ BM | Error horas ${idJugador}/${idServidor}: ${error.response?.status || error.message}`
      );
    }
  }

  // ----------------------------------------------------------
  // MÉTODO 2
  // time-played-history específico
  // ----------------------------------------------------------

  try {
    const response = await solicitarBM(
      `/players/${idJugador}/time-played-history/${idServidor}`
    );

    const data = response.data?.data;

    const registros = Array.isArray(data)
      ? data
      : data
        ? [data]
        : [];

    let totalSegundos = 0;

    for (const registro of registros) {
      const meta =
        registro?.meta || {};

      const attributes =
        registro?.attributes || {};

      const segundos =
        meta.timePlayed ??
        meta.timeplayed ??
        meta.seconds ??
        meta.totalTime ??
        meta.totalSeconds ??
        attributes.timePlayed ??
        attributes.timeplayed ??
        attributes.seconds ??
        attributes.totalTime ??
        attributes.totalSeconds;

      if (numeroValido(segundos)) {
        totalSegundos += segundos;
      }
    }

    if (totalSegundos > 0) {
      return totalSegundos;
    }
  } catch {
    // No hacemos ruido: puede no existir para ese servidor.
  }

  return 0;
}

// ============================================================
// HORAS DESDE SESIONES
// ============================================================

function obtenerDuracionSesion(sesion) {
  if (!sesion) return 0;

  const attributes =
    sesion.attributes || {};

  const meta =
    sesion.meta || {};

  const posiblesSegundos = [
    attributes.duration,
    attributes.durationSeconds,
    attributes.duration_seconds,
    attributes.seconds,
    attributes.timePlayed,
    attributes.timeplayed,
    meta.duration,
    meta.durationSeconds,
    meta.duration_seconds,
    meta.seconds,
    meta.timePlayed,
    meta.timeplayed,
  ];

  for (const valor of posiblesSegundos) {
    if (numeroValido(valor) && valor > 0) {
      return valor;
    }
  }

  // Si existen start/end, calculamos.
  const inicio =
    attributes.start ||
    attributes.startedAt ||
    attributes.startTime ||
    attributes.start_time;

  const fin =
    attributes.stop ||
    attributes.end ||
    attributes.endedAt ||
    attributes.endTime ||
    attributes.end_time;

  if (inicio && fin) {
    const a = new Date(inicio).getTime();
    const b = new Date(fin).getTime();

    if (
      Number.isFinite(a) &&
      Number.isFinite(b) &&
      b > a
    ) {
      return Math.floor((b - a) / 1000);
    }
  }

  return 0;
}

function obtenerServidorSesion(sesion) {
  const relationship =
    sesion?.relationships?.server?.data;

  if (
    relationship?.type === "server" &&
    relationship.id
  ) {
    return String(relationship.id);
  }

  const attributes =
    sesion?.attributes || {};

  const id =
    attributes.serverId ||
    attributes.server_id;

  if (id) {
    return String(id);
  }

  return null;
}

function crearMapaHorasSesiones(sesiones) {
  const mapa = new Map();

  for (const sesion of sesiones) {
    const serverId =
      obtenerServidorSesion(sesion);

    if (!serverId) continue;

    const segundos =
      obtenerDuracionSesion(sesion);

    if (!segundos) continue;

    mapa.set(
      serverId,
      (mapa.get(serverId) || 0) + segundos
    );
  }

  return mapa;
}

// ============================================================
// ESTADÍSTICAS DE SESIONES
// ============================================================

function calcularEstadisticasSesiones(
  sesiones,
  playerId,
  servidorConfiguradoId
) {
  const inicioSemana =
    obtenerInicioSemanaChile();

  const inicioMes =
    obtenerInicioMesChile();

  let segundosSemana = 0;
  let segundosMes = 0;

  let ultimaConexion = null;
  let ultimoServidor = null;

  let segundosServidorConfigurado = 0;

  for (const sesion of sesiones) {
    const serverId =
      obtenerServidorSesion(sesion);

    const segundos =
      obtenerDuracionSesion(sesion);

    if (!serverId || !segundos) continue;

    if (
      String(serverId) ===
      String(servidorConfiguradoId)
    ) {
      segundosServidorConfigurado += segundos;
    }

    const attributes =
      sesion.attributes || {};

    const inicioRaw =
      attributes.start ||
      attributes.startedAt ||
      attributes.startTime ||
      attributes.start_time;

    if (inicioRaw) {
      const inicio =
        new Date(inicioRaw);

      if (!Number.isNaN(inicio.getTime())) {
        if (inicio >= inicioSemana) {
          segundosSemana += segundos;
        }

        if (inicio >= inicioMes) {
          segundosMes += segundos;
        }

        if (
          !ultimaConexion ||
          inicio > ultimaConexion
        ) {
          ultimaConexion = inicio;
          ultimoServidor = serverId;
        }
      }
    }
  }

  return {
    segundosSemana,
    segundosMes,
    segundosServidorConfigurado,
    ultimaConexion,
    ultimoServidor,
  };
}

// ============================================================
// CONCURRENCIA
// ============================================================

async function ejecutarConcurrencia(
  elementos,
  limite,
  funcion
) {
  const resultados = [];

  let indice = 0;

  async function worker() {
    while (true) {
      const actual = indice++;

      if (actual >= elementos.length) {
        return;
      }

      try {
        const resultado =
          await funcion(elementos[actual], actual);

        resultados[actual] = resultado;
      } catch (error) {
        resultados[actual] = null;
      }
    }
  }

  const workers = [];

  const cantidad =
    Math.min(
      limite,
      elementos.length
    );

  for (let i = 0; i < cantidad; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  return resultados;
}

// ============================================================
// OBTENER TODOS LOS SERVIDORES RUST Y SUS HORAS
// ============================================================

async function obtenerTopServidoresRust(
  playerId,
  todasLasSesiones,
  servidoresMap
) {
  console.log(
    `\n🔎 BM | SERVIDORES TOTALES CANDIDATOS: ${servidoresMap.size}`
  );

  // Las sesiones también pueden descubrir servidores
  // que no estaban en el perfil.
  const antesSesiones =
    servidoresMap.size;

  const agregadosSesiones =
    agregarServidoresDeSesiones(
      todasLasSesiones,
      servidoresMap
    );

  console.log(
    `📊 BM | Servidores descubiertos mediante sesiones: ${agregadosSesiones} | Total ahora: ${servidoresMap.size}`
  );

  const cacheServidores =
    new Map();

  // ----------------------------------------------------------
  // OBTENER INFORMACIÓN DE TODOS LOS SERVIDORES
  // ----------------------------------------------------------

  const idsServidores =
    Array.from(servidoresMap.keys());

  console.log(
    `🖥️ BM | Consultando información de ${idsServidores.length} servidores...`
  );

  const servidoresInfo =
    await ejecutarConcurrencia(
      idsServidores,
      CONCURRENCIA_SERVIDORES,
      async (serverId) => {
        return obtenerInfoServidor(
          serverId,
          cacheServidores
        );
      }
    );

  const servidoresRust = [];

  for (const servidor of servidoresInfo) {
    if (!servidor) continue;

    const textoGame =
      String(
        servidor.game ||
        servidor.attributes?.game ||
        ""
      ).toLowerCase();

    const textoNombre =
      String(
        servidor.name || ""
      ).toLowerCase();

    const esRust =
      textoGame.includes("rust") ||
      textoNombre.includes("rust") ||
      servidor.attributes?.game === "rust";

    if (esRust) {
      servidoresRust.push(servidor);
    }
  }

  console.log(
    `🎮 BM | SERVIDORES RUST ENCONTRADOS: ${servidoresRust.length}`
  );

  // ----------------------------------------------------------
  // MAPA DE HORAS OBTENIDAS DESDE SESIONES
  // ----------------------------------------------------------

  const mapaHorasSesiones =
    crearMapaHorasSesiones(
      todasLasSesiones
    );

  // ----------------------------------------------------------
  // MUY IMPORTANTE:
  //
  // AQUÍ NO HACEMOS slice(0,10).
  //
  // Se consultan TODOS los servidores Rust descubiertos.
  // ----------------------------------------------------------

  console.log(
    `🏆 BM | CONSULTANDO HORAS INDIVIDUALES EN TODOS LOS ${servidoresRust.length} SERVIDORES RUST...`
  );

  const resultados =
    await ejecutarConcurrencia(
      servidoresRust,
      CONCURRENCIA_SERVIDORES,
      async (servidor) => {
        const segundosDirectos =
          await obtenerHorasJugadorServidor(
            playerId,
            servidor.id
          );

        const segundosSesiones =
          mapaHorasSesiones.get(
            String(servidor.id)
          ) || 0;

        // Nos quedamos con la fuente que tenga
        // mayor cantidad de horas.
        const segundos =
          Math.max(
            segundosDirectos,
            segundosSesiones
          );

        if (segundos <= 0) {
          return null;
        }

        return {
          serverId: servidor.id,
          serverName: servidor.name,
          game: servidor.game,
          seconds: segundos,
          hours: convertirSegundosAHoras(
            segundos
          ),
          directSeconds: segundosDirectos,
          sessionSeconds: segundosSesiones,
        };
      }
    );

  const resultadosValidos =
    resultados.filter(
      (resultado) =>
        resultado &&
        resultado.seconds > 0
    );

  // ----------------------------------------------------------
  // ORDENAR TODO EL UNIVERSO ANTES DEL TOP 10
  // ----------------------------------------------------------

  resultadosValidos.sort(
    (a, b) =>
      b.seconds - a.seconds
  );

  const totalHoras =
    resultadosValidos.reduce(
      (total, item) =>
        total + item.hours,
      0
    );

  // ----------------------------------------------------------
  // TOP 10 SOLO AQUÍ
  // ----------------------------------------------------------

  const top10 =
    resultadosValidos.slice(0, 10);

  console.log(
    `\n🏆 BM | ================= TOP 10 REAL =================`
  );

  top10.forEach(
    (item, index) => {
      console.log(
        `${index + 1}. ${item.serverName} (${item.serverId}) -> ${formatearHoras(item.hours)}`
      );
    }
  );

  console.log(
    `🏆 BM | =================================================`
  );

  console.log(
    `🖥️ BM | TODOS los servidores Rust encontrados: ${servidoresRust.length}`
  );

  console.log(
    `📊 BM | Servidores Rust con horas recuperables: ${resultadosValidos.length}`
  );

  console.log(
    `🧮 BM | Total horas recuperadas: ${formatearHoras(totalHoras)}`
  );

  return {
    top10,
    todos: resultadosValidos,
    totalHoras,
    servidoresRustEncontrados:
      servidoresRust.length,
    servidoresConHoras:
      resultadosValidos.length,
  };
}

// ============================================================
// HISTORIAL DE NOMBRES
// ============================================================

async function obtenerHistorialNombres(playerId) {
  try {
    const response = await solicitarBM(
      `/players/${playerId}`,
      {
        params: {
          include: "names",
        },
      }
    );

    const included =
      response.data?.included || [];

    const nombres =
      included.filter(
        (item) =>
          item.type === "name" ||
          item.type === "playerName"
      );

    return nombres;
  } catch {
    console.log(
      `⚠️ BM | Historial de nombres no disponible`
    );

    return [];
  }
}

// ============================================================
// ESTADO COMPLETO DEL JUGADOR
// ============================================================

async function getBattleMetricsPlayerStatus(
  playerId,
  servidorConfiguradoId
) {
  console.log(
    `\n🔎 BM | Analizando jugador ${playerId}`
  );

  console.log(
    `🎯 BM | Servidor configurado: ${servidorConfiguradoId}`
  );

  const servidoresMap =
    new Map();

  // ----------------------------------------------------------
  // 1. PERFIL + SERVIDORES
  // ----------------------------------------------------------

  await descubrirServidoresDesdePerfil(
    playerId,
    servidoresMap
  );

  // ----------------------------------------------------------
  // 2. RELATIONSHIP SERVERS
  // ----------------------------------------------------------

  await obtenerTodosLosServidoresJugador(
    playerId,
    servidoresMap
  );

  // ----------------------------------------------------------
  // 3. TIME PLAYED HISTORY
  // ----------------------------------------------------------

  await descubrirServidoresDesdeTimePlayedHistory(
    playerId,
    servidoresMap
  );

  // ----------------------------------------------------------
  // 4. COMPROBAR SERVIDOR CONFIGURADO
  // ----------------------------------------------------------

  console.log(
    `\n🔎 BM | Comprobando presencia actual: jugador ${playerId} -> servidor ${servidorConfiguradoId}`
  );

  const estaOnline =
    await comprobarJugadorEnServidor(
      playerId,
      servidorConfiguradoId
    );

  if (estaOnline) {
    console.log(
      `🟢 BM | Jugador ${playerId} ESTÁ ONLINE en servidor ${servidorConfiguradoId}`
    );

    // Aunque no aparezca en las otras fuentes,
    // el servidor configurado debe formar parte
    // del universo que revisamos.
    if (
      !servidoresMap.has(
        String(servidorConfiguradoId)
      )
    ) {
      servidoresMap.set(
        String(servidorConfiguradoId),
        {
          type: "server",
          id: String(servidorConfiguradoId),
        }
      );
    }
  } else {
    console.log(
      `🔴 BM | Jugador ${playerId} NO está online en servidor ${servidorConfiguradoId}`
    );
  }

  // ----------------------------------------------------------
  // 5. SESIONES
  // ----------------------------------------------------------

  const todasLasSesiones =
    await obtenerTodasLasSesiones(
      playerId
    );

  console.log(
    `📊 BM | Sesiones totales: ${todasLasSesiones.length}`
  );

  // Las sesiones son otra fuente de servidores.
  agregarServidoresDeSesiones(
    todasLasSesiones,
    servidoresMap
  );

  console.log(
    `🖥️ BM | UNIVERSO FINAL DE SERVIDORES A REVISAR: ${servidoresMap.size}`
  );

  // ----------------------------------------------------------
  // 6. ESTADÍSTICAS
  // ----------------------------------------------------------

  const estadisticas =
    calcularEstadisticasSesiones(
      todasLasSesiones,
      playerId,
      servidorConfiguradoId
    );

  // ----------------------------------------------------------
  // 7. HORAS DEL SERVIDOR CONFIGURADO
  // ----------------------------------------------------------

  const horasDirectasServidor =
    await obtenerHorasJugadorServidor(
      playerId,
      servidorConfiguradoId
    );

  const horasSesionesServidor =
    estadisticas.segundosServidorConfigurado;

  const segundosServidorConfigurado =
    Math.max(
      horasDirectasServidor,
      horasSesionesServidor
    );

  const horasServidorConfigurado =
    convertirSegundosAHoras(
      segundosServidorConfigurado
    );

  // ----------------------------------------------------------
  // 8. TOP GLOBAL
  //
  // AQUÍ SE REVISA TODO EL UNIVERSO ANTES DE CORTAR A 10.
  // ----------------------------------------------------------

  const resultadoServidores =
    await obtenerTopServidoresRust(
      playerId,
      todasLasSesiones,
      servidoresMap
    );

  // ----------------------------------------------------------
  // 9. HISTORIAL DE NOMBRES
  // ----------------------------------------------------------

  const historialNombres =
    await obtenerHistorialNombres(
      playerId
    );

  // ----------------------------------------------------------
  // 10. RESULTADO
  // ----------------------------------------------------------

  return {
    playerId: String(playerId),

    serverId: String(
      servidorConfiguradoId
    ),

    online: estaOnline,

    horasServidor:
      horasServidorConfigurado,

    horasServidorFormateadas:
      formatearHoras(
        horasServidorConfigurado
      ),

    semana:
      convertirSegundosAHoras(
        estadisticas.segundosSemana
      ),

    semanaFormateada:
      formatearHoras(
        convertirSegundosAHoras(
          estadisticas.segundosSemana
        )
      ),

    mes:
      convertirSegundosAHoras(
        estadisticas.segundosMes
      ),

    mesFormateado:
      formatearHoras(
        convertirSegundosAHoras(
          estadisticas.segundosMes
        )
      ),

    ultimaConexion:
      estadisticas.ultimaConexion,

    ultimoServidor:
      estadisticas.ultimoServidor,

    topServidores:
      resultadoServidores.top10,

    todosLosServidores:
      resultadoServidores.todos,

    totalHorasBattleMetrics:
      resultadoServidores.totalHoras,

    totalHorasBattleMetricsFormateadas:
      formatearHoras(
        resultadoServidores.totalHoras
      ),

    servidoresEncontrados:
      resultadoServidores.servidoresRustEncontrados,

    servidoresConHoras:
      resultadoServidores.servidoresConHoras,

    historialNombres,
  };
}

// ============================================================
// FUNCIÓN COMPATIBLE CON /HORAS
// ============================================================

async function getBattleMetricsHours(
  playerId,
  servidorConfiguradoId
) {
  return getBattleMetricsPlayerStatus(
    playerId,
    servidorConfiguradoId
  );
}

// ============================================================
// LEADERBOARD
// ============================================================

async function getServerLeaderboard(
  playerId,
  servidorConfiguradoId
) {
  const resultado =
    await getBattleMetricsPlayerStatus(
      playerId,
      servidorConfiguradoId
    );

  return resultado.topServidores || [];
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  searchBattleMetricsPlayer,
  getBattleMetricsPlayerStatus,
  getBattleMetricsHours,
  getServerLeaderboard,
  obtenerHorasJugadorServidor,
  obtenerTodasLasSesiones,
  obtenerTodosLosServidoresJugador,
  obtenerTopServidoresRust,
};