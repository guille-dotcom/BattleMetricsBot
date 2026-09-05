const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const axios = require("axios");
const cheerio = require("cheerio");
const { spawn } = require("child_process");
const puppeteer = require("puppeteer-core");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const STEAM_BASE = "https://steamcommunity.com";
const STEAM_SEARCH_URL = `${STEAM_BASE}/search/users/`;

const RESULTADOS_POR_PAGINA = 10;
const MAX_PAGINAS = 10;

const CHROME_PATH =
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const CHROME_PROFILE = "C:\\BattleMetricsBotProfile";
const CHROME_PORT = 9222;

// =====================================================
// ESPERAR
// =====================================================

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =====================================================
// NORMALIZAR URL DE STEAM
// =====================================================

function normalizarSteamURL(url) {
  if (!url) return null;

  url = String(url).trim();

  if (url.startsWith("//")) {
    url = "https:" + url;
  }

  if (url.startsWith("/")) {
    url = STEAM_BASE + url;
  }

  if (!url.startsWith("http")) {
    return null;
  }

  try {
    const parsed = new URL(url);

    if (
      !parsed.hostname.includes("steamcommunity.com") &&
      !parsed.hostname.includes("steamcommunity.com")
    ) {
      return null;
    }

    parsed.search = "";
    parsed.hash = "";

    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

// =====================================================
// EXTRAER STEAMID64
// =====================================================

function extraerSteamID64(url) {
  if (!url) return null;

  const match = url.match(
    /steamcommunity\.com\/profiles\/(\d{17})(?:\/|$)/i
  );

  return match ? match[1] : null;
}

// =====================================================
// EXTRAER PERFILES DESDE HTML
// =====================================================

function extraerPerfiles(html) {
  const perfiles = [];
  const vistos = new Set();

  if (!html) return perfiles;

  const $ = cheerio.load(html);

  // ---------------------------------------------------
  // MÉTODO PRINCIPAL
  // ---------------------------------------------------

  $(".search_row").each((_, elemento) => {
    const contenedor = $(elemento);

    let nombre = contenedor
      .find(".searchPersonaName")
      .first()
      .text()
      .trim();

    let href = contenedor
      .find("a")
      .filter((_, a) => {
        const link = $(a).attr("href") || "";

        return (
          link.includes("/id/") ||
          link.includes("/profiles/")
        );
      })
      .first()
      .attr("href");

    if (!href) {
      href = contenedor.find("a").first().attr("href");
    }

    const url = normalizarSteamURL(href);

    if (!nombre || !url) return;

    const clave = `${nombre}|||${url}`;

    if (vistos.has(clave)) return;

    vistos.add(clave);

    perfiles.push({
      nombre,
      url,
      steamID64: extraerSteamID64(url),
    });
  });

  // ---------------------------------------------------
  // MÉTODO ALTERNATIVO
  // ---------------------------------------------------

  if (perfiles.length === 0) {
    $("a").each((_, elemento) => {
      const link = $(elemento);
      const href = link.attr("href") || "";

      if (
        !href.includes("steamcommunity.com/id/") &&
        !href.includes("steamcommunity.com/profiles/")
      ) {
        return;
      }

      const url = normalizarSteamURL(href);

      if (!url) return;

      const nombre = link.text().trim();

      if (!nombre) return;

      const clave = `${nombre}|||${url}`;

      if (vistos.has(clave)) return;

      vistos.add(clave);

      perfiles.push({
        nombre,
        url,
        steamID64: extraerSteamID64(url),
      });
    });
  }

  return perfiles;
}

// =====================================================
// FILTRAR ÚNICAMENTE NOMBRE EXACTO
// =====================================================

function filtrarNombreExacto(perfiles, nombreBuscado) {
  return perfiles.filter((perfil) => {
    return perfil.nombre === nombreBuscado;
  });
}

// =====================================================
// AXIOS
// =====================================================

async function buscarSteamHTTP(nombreBuscado) {
  const todosLosPerfiles = [];

  try {
    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
      const url =
        `${STEAM_SEARCH_URL}?text=${encodeURIComponent(nombreBuscado)}` +
        `&filter=users&page=${pagina}`;

      console.log(
        `[STEAM] Buscando página ${pagina}: ${url}`
      );

      try {
        const respuesta = await axios.get(url, {
          timeout: 15000,

          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
              "AppleWebKit/537.36 (KHTML, like Gecko) " +
              "Chrome/131.0.0.0 Safari/537.36",

            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9," +
              "image/avif,image/webp,image/apng,*/*;q=0.8",

            "Accept-Language":
              "es-ES,es;q=0.9,en;q=0.8",

            Referer: STEAM_BASE + "/",
          },

          validateStatus: () => true,
        });

        console.log(
          `[STEAM] Página ${pagina}: HTTP ${respuesta.status}`
        );

        if (respuesta.status === 429) {
          console.log(
            "[STEAM] Steam está limitando las peticiones HTTP."
          );

          break;
        }

        if (respuesta.status !== 200) {
          console.log(
            `[STEAM] Steam devolvió HTTP ${respuesta.status}.`
          );

          break;
        }

        const perfiles = extraerPerfiles(respuesta.data);

        console.log(
          `[STEAM] Perfiles encontrados en página ${pagina}: ${perfiles.length}`
        );

        if (perfiles.length === 0) {
          console.log(
            `[STEAM] Página ${pagina} sin resultados.`
          );

          break;
        }

        todosLosPerfiles.push(...perfiles);

        if (perfiles.length < 10) {
          break;
        }

        await esperar(800);
      } catch (error) {
        console.log(
          `[STEAM] Error HTTP página ${pagina}: ${error.message}`
        );

        break;
      }
    }
  } catch (error) {
    console.log(
      `[STEAM] Error general HTTP: ${error.message}`
    );
  }

  return filtrarNombreExacto(
    todosLosPerfiles,
    nombreBuscado
  );
}

// =====================================================
// COMPROBAR CHROME
// =====================================================

async function chromeDisponible() {
  try {
    const respuesta = await axios.get(
      `http://localhost:${CHROME_PORT}/json/version`,
      {
        timeout: 3000,
        validateStatus: () => true,
      }
    );

    return respuesta.status === 200;
  } catch {
    return false;
  }
}

// =====================================================
// INICIAR CHROME
// =====================================================

async function iniciarChrome() {
  console.log(
    "[STEAM] Chrome no está disponible en el puerto 9222."
  );

  console.log("[STEAM] Intentando iniciar Chrome...");

  try {
    spawn(
      CHROME_PATH,
      [
        `--remote-debugging-port=${CHROME_PORT}`,
        `--user-data-dir=${CHROME_PROFILE}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-popup-blocking",
      ],
      {
        detached: true,
        stdio: "ignore",
        windowsHide: false,
      }
    ).unref();

    for (let i = 0; i < 15; i++) {
      await esperar(1000);

      if (await chromeDisponible()) {
        console.log(
          "[STEAM] Chrome iniciado correctamente."
        );

        return true;
      }
    }

    console.log(
      "[STEAM] No se pudo abrir el puerto 9222."
    );

    return false;
  } catch (error) {
    console.log(
      `[STEAM] Error iniciando Chrome: ${error.message}`
    );

    return false;
  }
}

// =====================================================
// OBTENER CHROME
// =====================================================

async function conectarChrome() {
  let disponible = await chromeDisponible();

  if (!disponible) {
    disponible = await iniciarChrome();
  }

  if (!disponible) {
    throw new Error(
      "Chrome no está disponible en el puerto 9222."
    );
  }

  console.log(
    "[STEAM] Conectando a Chrome..."
  );

  const browser = await puppeteer.connect({
    browserURL: `http://localhost:${CHROME_PORT}`,
    defaultViewport: null,
  });

  return browser;
}

// =====================================================
// BUSCAR STEAM MEDIANTE CHROME
// =====================================================

async function buscarSteamChrome(nombreBuscado) {
  let browser = null;

  try {
    browser = await conectarChrome();

    let paginas = await browser.pages();

    let pagina = paginas.find((p) =>
      p.url().includes("steamcommunity.com")
    );

    if (!pagina) {
      console.log(
        "[STEAM] No existe pestaña de Steam. Creando..."
      );

      pagina = await browser.newPage();
    }

    const resultados = [];

    for (
      let paginaNumero = 1;
      paginaNumero <= MAX_PAGINAS;
      paginaNumero++
    ) {
      const url =
        `${STEAM_SEARCH_URL}?text=${encodeURIComponent(nombreBuscado)}` +
        `&filter=users&page=${paginaNumero}`;

      console.log(
        `[STEAM] Chrome buscando página ${paginaNumero}: ${url}`
      );

      try {
        await pagina.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
      } catch (error) {
        console.log(
          `[STEAM] Error cargando página ${paginaNumero}: ${error.message}`
        );

        continue;
      }

      await esperar(1500);

      const html = await pagina.content();

      const perfiles = extraerPerfiles(html);

      console.log(
        `[STEAM] Chrome encontró ${perfiles.length} perfiles en página ${paginaNumero}.`
      );

      if (perfiles.length === 0) {
        console.log(
          `[STEAM] Chrome no encontró más perfiles.`
        );

        break;
      }

      resultados.push(...perfiles);

      if (perfiles.length < 10) {
        break;
      }

      await esperar(1000);
    }

    const exactos = filtrarNombreExacto(
      resultados,
      nombreBuscado
    );

    return exactos;
  } catch (error) {
    console.log(
      `[STEAM] Error usando Chrome: ${error.message}`
    );

    return [];
  } finally {
    if (browser) {
      try {
        await browser.disconnect();
      } catch {}
    }
  }
}

// =====================================================
// ELIMINAR DUPLICADOS
// =====================================================

function eliminarDuplicados(perfiles) {
  const vistos = new Set();
  const resultado = [];

  for (const perfil of perfiles) {
    const clave =
      perfil.url ||
      `${perfil.nombre}|${perfil.steamID64 || ""}`;

    if (vistos.has(clave)) continue;

    vistos.add(clave);
    resultado.push(perfil);
  }

  return resultado;
}

// =====================================================
// BUSCAR TODOS LOS PERFILES
// =====================================================

async function buscarPerfilesExactos(nombreBuscado) {
  console.log("");
  console.log(
    "[STEAM] ========================================"
  );
  console.log(
    `[STEAM] BUSCANDO NOMBRE EXACTO: "${nombreBuscado}"`
  );
  console.log(
    "[STEAM] ========================================"
  );
  console.log("");

  // ---------------------------------------------------
  // PRIMERO HTTP
  // ---------------------------------------------------

  let resultados = await buscarSteamHTTP(
    nombreBuscado
  );

  resultados = eliminarDuplicados(resultados);

  console.log("");
  console.log(
    `[STEAM] Coincidencias exactas HTTP: ${resultados.length}`
  );

  // ---------------------------------------------------
  // SI HTTP NO ENCUENTRA NADA, CHROME
  // ---------------------------------------------------

  if (resultados.length === 0) {
    console.log("");
    console.log(
      "[STEAM] HTTP no devolvió coincidencias."
    );

    console.log(
      "[STEAM] Intentando búsqueda mediante Chrome..."
    );

    const resultadosChrome =
      await buscarSteamChrome(nombreBuscado);

    resultados.push(...resultadosChrome);

    resultados = eliminarDuplicados(resultados);
  }

  // ---------------------------------------------------
  // FILTRO FINAL
  // ---------------------------------------------------

  resultados = resultados.filter(
    (perfil) => perfil.nombre === nombreBuscado
  );

  console.log("");
  console.log(
    "[STEAM] ========================================"
  );
  console.log(
    `[STEAM] RESULTADO FINAL: ${resultados.length} perfiles exactos`
  );
  console.log(
    "[STEAM] ========================================"
  );
  console.log("");

  return resultados;
}

// =====================================================
// EMBED
// =====================================================

function crearEmbed(perfiles, nombre, paginaActual) {
  const totalPaginas = Math.max(
    1,
    Math.ceil(perfiles.length / RESULTADOS_POR_PAGINA)
  );

  const inicio =
    (paginaActual - 1) * RESULTADOS_POR_PAGINA;

  const paginaPerfiles = perfiles.slice(
    inicio,
    inicio + RESULTADOS_POR_PAGINA
  );

  const embed = new EmbedBuilder()
    .setTitle(`🔎 Steam: "${nombre}"`)
    .setDescription(
      `Coincidencias **exactas** encontradas: **${perfiles.length}**`
    )
    .setColor(0x1b2838)
    .setFooter({
      text: `Página ${paginaActual}/${totalPaginas}`,
    });

  if (paginaPerfiles.length === 0) {
    embed.addFields({
      name: "Sin resultados",
      value: "No hay perfiles para mostrar.",
    });

    return embed;
  }

  for (let i = 0; i < paginaPerfiles.length; i++) {
    const perfil = paginaPerfiles[i];

    const numero =
      inicio + i + 1;

    let valor =
      `[Abrir perfil](${perfil.url})`;

    if (perfil.steamID64) {
      valor += `\nSteamID64: \`${perfil.steamID64}\``;
    } else {
      valor +=
        "\nSteamID64: No disponible";
    }

    embed.addFields({
      name: `${numero}. ${perfil.nombre}`,
      value: valor,
      inline: false,
    });
  }

  return embed;
}

// =====================================================
// BOTONES
// =====================================================

function crearBotones(paginaActual, totalPaginas) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("steam_anterior")
      .setLabel("◀ Anterior")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(paginaActual <= 1),

    new ButtonBuilder()
      .setCustomId("steam_siguiente")
      .setLabel("Siguiente ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(paginaActual >= totalPaginas)
  );
}

// =====================================================
// DESACTIVAR BOTONES
// =====================================================

function desactivarBotones(row) {
  if (!row) return row;

  for (const componente of row.components) {
    componente.setDisabled(true);
  }

  return row;
}

// =====================================================
// COMANDO /STEAM
// =====================================================

module.exports = {
  data: new SlashCommandBuilder()
    .setName("steam")
    .setDescription(
      "Busca perfiles de Steam por nombre exacto"
    )
    .addStringOption((option) =>
      option
        .setName("nombre")
        .setDescription(
          "Nombre exacto que quieres buscar en Steam"
        )
        .setRequired(true)
    ),

  async execute(interaction) {
    console.log("");
    console.log("🎯 Ejecutando /steam");

    const nombre =
      interaction.options
        .getString("nombre")
        .trim();

    console.log(
      `[STEAM] Entrada recibida: "${nombre}"`
    );

    if (!nombre) {
      await interaction.reply({
        content:
          "❌ Debes escribir un nombre para buscar.",
        ephemeral: true,
      });

      console.log(
        "✅ /steam terminado"
      );

      return;
    }

    await interaction.deferReply();

    try {
      const perfiles =
        await buscarPerfilesExactos(nombre);

      if (perfiles.length === 0) {
        console.log(
          `[STEAM] No hay coincidencias exactas para "${nombre}".`
        );

        await interaction.editReply({
          content:
            `❌ No se encontraron perfiles de Steam cuyo nombre sea exactamente **${nombre}**.`,
          embeds: [],
          components: [],
        });

        console.log(
          "✅ /steam terminado"
        );

        return;
      }

      let paginaActual = 1;

      const totalPaginas = Math.max(
        1,
        Math.ceil(
          perfiles.length /
            RESULTADOS_POR_PAGINA
        )
      );

      const embed = crearEmbed(
        perfiles,
        nombre,
        paginaActual
      );

      const row = crearBotones(
        paginaActual,
        totalPaginas
      );

      const mensaje =
        await interaction.editReply({
          embeds: [embed],
          components: [row],
        });

      const collector =
        mensaje.createMessageComponentCollector({
          time: 120000,
        });

      collector.on(
        "collect",
        async (buttonInteraction) => {
          if (
            buttonInteraction.user.id !==
            interaction.user.id
          ) {
            await buttonInteraction.reply({
              content:
                "❌ Solo la persona que ejecutó el comando puede usar estos botones.",
              ephemeral: true,
            });

            return;
          }

          if (
            buttonInteraction.customId ===
            "steam_anterior"
          ) {
            if (paginaActual > 1) {
              paginaActual--;
            }
          }

          if (
            buttonInteraction.customId ===
            "steam_siguiente"
          ) {
            if (
              paginaActual <
              totalPaginas
            ) {
              paginaActual++;
            }
          }

          const nuevoEmbed =
            crearEmbed(
              perfiles,
              nombre,
              paginaActual
            );

          const nuevosBotones =
            crearBotones(
              paginaActual,
              totalPaginas
            );

          await buttonInteraction.update({
            embeds: [nuevoEmbed],
            components: [nuevosBotones],
          });
        }
      );

      collector.on(
        "end",
        async () => {
          try {
            const botonesFinales =
              crearBotones(
                paginaActual,
                totalPaginas
              );

            desactivarBotones(
              botonesFinales
            );

            await interaction.editReply({
              components: [botonesFinales],
            });
          } catch {}
        }
      );

      console.log(
        `✅ /steam terminado`
      );
    } catch (error) {
      console.error(
        "[STEAM] ERROR:",
        error
      );

      try {
        await interaction.editReply({
          content:
            "❌ Ocurrió un error al buscar perfiles de Steam.",
          embeds: [],
          components: [],
        });
      } catch {}

      console.log(
        "✅ /steam terminado"
      );
    }
  },
};