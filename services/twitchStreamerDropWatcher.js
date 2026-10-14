// ============================================================
// RUSTLOGIX - TWITCH STREAMER DROP WATCHER
// ============================================================
// Usa los streamers y enlaces extraídos desde Facepunch.
//
// - Consulta Twitch Helix para detectar directos.
// - Publica avisos en los canales configurados en MongoDB.
// - Evita repetir avisos mientras el streamer sigue en directo.
// - Permite volver a notificar cuando el streamer inicia otro directo.
// - Conserva el estado en RustDropsMonitor.
// ============================================================

const axios = require("axios");
const RustDropsMonitor = require("../models/RustDropsMonitor");

const TWITCH_API = "https://api.twitch.tv/helix";
const TWITCH_OAUTH_URL = "https://id.twitch.tv/oauth2/token";

const INTERVALO_REVISION = 5 * 60 * 1000;
const TIMEOUT_HTTP = 15000;
const MAX_STREAMERS_POR_CONSULTA = 100;

let cliente = null;
let obtenerDrops = null;
let temporizador = null;
let ejecutando = false;
let tokenTwitch = null;
let tokenExpiraEn = 0;
let vigilanciaIniciada = false;

function limpiarTexto(valor) {
    return String(valor ?? "").trim();
}

function obtenerLoginTwitch(valor) {
    const texto = limpiarTexto(valor);

    if (!texto) return null;

    let login = texto;

    try {
        if (/^https?:\/\//i.test(texto)) {
            const url = new URL(texto);

            if (!/(^|\.)twitch\.tv$/i.test(url.hostname)) {
                return null;
            }

            login = url.pathname.split("/").filter(Boolean)[0] || "";
        }
    } catch {
        return null;
    }

    login = login.replace(/^@/, "").trim().toLowerCase();

    if (!/^[a-z0-9_]{1,25}$/.test(login)) {
        return null;
    }

    return login;
}

function esObjeto(valor) {
    return valor !== null &&
        typeof valor === "object" &&
        !Array.isArray(valor);
}

// Extrae streamers directamente de las recompensas que devuelve
// obtenerDropsOficiales() en twitchDropsService.js.
function extraerStreamers(datosDrops) {
    const streamers = new Map();

    const recompensas = [
        ...(Array.isArray(datosDrops?.streamers)
            ? datosDrops.streamers
            : []),
        ...(Array.isArray(datosDrops?.generales)
            ? datosDrops.generales
            : [])
    ];

    for (const recompensa of recompensas) {
        if (!esObjeto(recompensa)) continue;

        const login = obtenerLoginTwitch(
            recompensa.streamerUrl || recompensa.streamer
        );

        if (!login) continue;

        const anterior = streamers.get(login);

        streamers.set(login, {
            login,
            nombre: limpiarTexto(recompensa.streamer) || login,
            url: `https://www.twitch.tv/${login}`,
            campana: limpiarTexto(datosDrops.campana),
            recompensa: limpiarTexto(recompensa.nombre),
            tiempo: limpiarTexto(recompensa.tiempo),
            imagen: recompensa.imagen || null,
            // Si el streamer tiene varias recompensas, las acumulamos.
            recompensas: [
                ...(anterior?.recompensas || []),
                ...(recompensa.nombre ? [recompensa.nombre] : [])
            ]
        });
    }

    return [...streamers.values()].map(streamer => ({
        ...streamer,
        recompensas: [...new Set(streamer.recompensas)]
    }));
}

async function obtenerTokenTwitch() {
    const clientId = process.env.TWITCH_CLIENT_ID;
    const clientSecret = process.env.TWITCH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error(
            "Faltan TWITCH_CLIENT_ID o TWITCH_CLIENT_SECRET en las variables de entorno."
        );
    }

    if (
        tokenTwitch &&
        Date.now() < tokenExpiraEn - 60000
    ) {
        return tokenTwitch;
    }

    const respuesta = await axios.post(
        TWITCH_OAUTH_URL,
        null,
        {
            params: {
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: "client_credentials"
            },
            timeout: TIMEOUT_HTTP
        }
    );

    if (!respuesta.data?.access_token) {
        throw new Error("Twitch no devolvió un token válido.");
    }

    tokenTwitch = respuesta.data.access_token;
    tokenExpiraEn = Date.now() +
        Number(respuesta.data.expires_in || 3600) * 1000;

    return tokenTwitch;
}

async function consultarStreams(logins) {
    if (!logins.length) return [];

    const token = await obtenerTokenTwitch();
    const clientId = process.env.TWITCH_CLIENT_ID;
    const resultados = [];

    for (
        let inicio = 0;
        inicio < logins.length;
        inicio += MAX_STREAMERS_POR_CONSULTA
    ) {
        const grupo = logins.slice(
            inicio,
            inicio + MAX_STREAMERS_POR_CONSULTA
        );

        const respuesta = await axios.get(
            `${TWITCH_API}/streams`,
            {
                params: {
                    user_login: grupo
                },
                headers: {
                    "Client-ID": clientId,
                    Authorization: `Bearer ${token}`
                },
                timeout: TIMEOUT_HTTP
            }
        );

        resultados.push(...(respuesta.data?.data || []));
    }

    return resultados;
}

async function obtenerMonitores() {
    return RustDropsMonitor.find({
        active: true,
        channelId: {
            $exists: true,
            $ne: ""
        }
    }).lean();
}

function crearEmbedStreamer(stream, streamer) {
    const { EmbedBuilder } = require("discord.js");

    const embed = new EmbedBuilder()
        .setColor(0x9146ff)
        .setTitle("🔴 ¡Streamer de Rust Drops en directo!")
        .setURL(streamer.url)
        .setDescription(
            `**${stream.user_name || streamer.nombre}** está transmitiendo en Twitch.\n\n` +
            `**Directo:** ${stream.title || "Sin título"}\n` +
            `**Categoría:** ${stream.game_name || "Sin categoría"}`
        )
        .addFields(
            {
                name: "🎮 Canal de Twitch",
                value: `[Ver directo](${streamer.url})`,
                inline: true
            },
            {
                name: "👥 Espectadores",
                value: String(stream.viewer_count ?? 0),
                inline: true
            }
        )
        .setFooter({
            text: "RustLogix • Twitch Drops oficiales de Rust"
        })
        .setTimestamp(new Date());

    if (streamer.campana) {
        embed.addFields({
            name: "🎁 Campaña",
            value: streamer.campana.slice(0, 1024),
            inline: false
        });
    }

    if (streamer.recompensas.length) {
        embed.addFields({
            name: "📦 Recompensas asociadas",
            value: streamer.recompensas
                .slice(0, 10)
                .map(nombre => `• ${nombre}`)
                .join("\n")
                .slice(0, 1024),
            inline: false
        });
    }

    if (stream.thumbnail_url) {
        embed.setImage(
            stream.thumbnail_url
                .replace("{width}", "640")
                .replace("{height}", "360")
        );
    }

    return embed;
}

async function revisarCanal(monitor, streams, streamersPorLogin) {
    const canal = await cliente.channels
        .fetch(monitor.channelId)
        .catch(() => null);

    if (!canal || !canal.isTextBased() || !canal.messages) {
        console.warn(
            `[TWITCH DROPS] Canal no disponible: ${monitor.channelId}`
        );
        return;
    }

    const estados = esObjeto(monitor.streamerStates)
        ? { ...monitor.streamerStates }
        : {};

    const directosActuales = new Set(
        streams
            .map(stream => obtenerLoginTwitch(stream.user_login))
            .filter(Boolean)
    );

    let cambios = false;

    // Detectar streamers que han dejado de transmitir.
    for (const [login, estado] of Object.entries(estados)) {
        if (
            estado?.live === true &&
            !directosActuales.has(login)
        ) {
            estados[login] = {
                ...estado,
                live: false,
                lastOfflineAt: new Date().toISOString()
            };

            cambios = true;
        }
    }

    // Notificar únicamente los nuevos directos.
    for (const stream of streams) {
        const login = obtenerLoginTwitch(stream.user_login);

        if (!login) continue;

        const streamer = streamersPorLogin.get(login);

        if (!streamer) continue;

        const estadoAnterior = estados[login];

        // Ya se avisó de este mismo directo.
        if (
            estadoAnterior?.live === true &&
            String(estadoAnterior.streamId) === String(stream.id)
        ) {
            continue;
        }

        const embed = crearEmbedStreamer(stream, streamer);

        await canal.send({
            embeds: [embed],
            allowedMentions: {
                parse: []
            }
        });

        estados[login] = {
            live: true,
            streamId: String(stream.id),
            title: limpiarTexto(stream.title),
            startedAt: stream.started_at || null,
            notifiedAt: new Date().toISOString()
        };

        cambios = true;

        console.log(
            `[TWITCH DROPS] Aviso publicado para ${login} en ${monitor.guildId}.`
        );
    }

    await RustDropsMonitor.updateOne(
        { _id: monitor._id },
        {
            $set: {
                streamerStates: estados,
                lastCheckedAt: new Date()
            }
        }
    );
}

async function revisarStreamers() {
    if (ejecutando || !cliente || !obtenerDrops) return;

    ejecutando = true;

    try {
        const datosDrops = await obtenerDrops();

        if (!datosDrops) {
            console.warn(
                "[TWITCH DROPS] Facepunch no devolvió datos."
            );
            return;
        }

        const streamers = extraerStreamers(datosDrops);

        if (!streamers.length) {
            console.log(
                "[TWITCH DROPS] No se encontraron enlaces de Twitch asociados a las recompensas extraídas."
            );
            return;
        }

        const streams = await consultarStreams(
            streamers.map(streamer => streamer.login)
        );

        const streamersPorLogin = new Map(
            streamers.map(streamer => [streamer.login, streamer])
        );

        const monitores = await obtenerMonitores();

        for (const monitor of monitores) {
            try {
                await revisarCanal(
                    monitor,
                    streams,
                    streamersPorLogin
                );
            } catch (error) {
                console.error(
                    `[TWITCH DROPS] Error en ${monitor.guildId}:`,
                    error.message
                );
            }
        }

        console.log(
            `[TWITCH DROPS] Revisión terminada. ` +
            `Streamers detectados: ${streamers.length}; ` +
            `en directo: ${streams.length}; ` +
            `servidores: ${monitores.length}.`
        );
    } catch (error) {
        console.error(
            "[TWITCH DROPS] Error consultando Twitch:",
            error.response?.data || error.message
        );
    } finally {
        ejecutando = false;
    }
}

function iniciarVigilanciaStreamers(client, obtenerDropsOficiales) {
    if (!client || typeof obtenerDropsOficiales !== "function") {
        console.error(
            "[TWITCH DROPS] No se pudo iniciar la vigilancia: configuración incompleta."
        );
        return;
    }

    if (vigilanciaIniciada) return;

    cliente = client;
    obtenerDrops = obtenerDropsOficiales;
    vigilanciaIniciada = true;

    console.log(
        "[TWITCH DROPS] Vigilancia de streamers iniciada."
    );

    revisarStreamers().catch(console.error);

    temporizador = setInterval(() => {
        revisarStreamers().catch(console.error);
    }, INTERVALO_REVISION);

    if (typeof temporizador.unref === "function") {
        temporizador.unref();
    }
}

function detenerVigilanciaStreamers() {
    if (temporizador) {
        clearInterval(temporizador);
        temporizador = null;
    }

    vigilanciaIniciada = false;
    ejecutando = false;
    cliente = null;
    obtenerDrops = null;

    console.log(
        "[TWITCH DROPS] Vigilancia de streamers detenida."
    );
}

module.exports = {
    iniciarVigilanciaStreamers,
    detenerVigilanciaStreamers,
    revisarStreamers,
    extraerStreamers
};