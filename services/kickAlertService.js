const axios = require("axios");

const KickAlertMonitor =
    require("../models/KickAlertMonitor");

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

// ============================================================
// CONFIGURACIÓN
// ============================================================

const INTERVALO = 60 * 1000;

// API pública de Kick
const KICK_API = "https://kick.com/api/v2";

// Evita que dos revisiones se ejecuten simultáneamente
let revisando = false;

// ============================================================
// OBTENER DATOS DEL STREAMER
// ============================================================

async function obtenerStreamerKick(username) {

    try {

        const nombre = String(username || "")
            .trim()
            .replace(/^@/, "");

        if (!nombre) {
            return null;
        }

        const response = await axios.get(
            `${KICK_API}/channels/${encodeURIComponent(nombre)}`,
            {
                timeout: 15000,
                headers: {
                    Accept: "application/json",
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155.0.0.0 Safari/537.36"
                }
            }
        );

        const data = response.data;

        if (!data) {
            return null;
        }

        const livestream =
            data.livestream ||
            data.livestreams?.[0] ||
            null;

        const live =
            !!livestream;

        const usernameReal =
            data.user?.username ||
            data.username ||
            nombre;

        const displayName =
            data.user?.username ||
            data.user?.name ||
            data.name ||
            usernameReal;

        let avatar =
            data.user?.profile_pic ||
            data.user?.profile_picture ||
            data.profile_pic ||
            data.profile_picture ||
            null;

        let thumbnail =
            livestream?.thumbnail?.url ||
            livestream?.thumbnail ||
            livestream?.thumbnail_url ||
            null;

        let titulo =
            livestream?.session_title ||
            livestream?.title ||
            data.livestream?.session_title ||
            "Directo en Kick";

        let categoria =
            livestream?.categories?.[0] ||
            livestream?.category ||
            null;

        let categoriaNombre = null;
        let categoriaImagen = null;

        if (categoria) {

            if (typeof categoria === "string") {

                categoriaNombre = categoria;

            } else {

                categoriaNombre =
                    categoria.name ||
                    categoria.category_name ||
                    null;

                categoriaImagen =
                    categoria.thumbnail ||
                    categoria.thumbnail_url ||
                    categoria.image ||
                    categoria.cover ||
                    null;
            }
        }

        if (
            !categoriaNombre &&
            livestream?.category_name
        ) {
            categoriaNombre =
                livestream.category_name;
        }

        if (
            !categoriaImagen &&
            livestream?.category?.thumbnail
        ) {
            categoriaImagen =
                livestream.category.thumbnail;
        }

        const viewers =
            Number(
                livestream?.viewer_count ??
                livestream?.viewers ??
                0
            );

        const streamId =
            livestream?.id ||
            livestream?.slug ||
            null;

        const startedAt =
            livestream?.start_time ||
            livestream?.started_at ||
            null;

        const channelUrl =
            data.user?.username ||
            usernameReal;

        return {

            username: usernameReal,

            displayName,

            live,

            avatar,

            thumbnail,

            title: titulo,

            categoryName:
                categoriaNombre,

            categoryImage:
                categoriaImagen,

            viewers,

            streamId,

            startedAt,

            url:
                `https://kick.com/${encodeURIComponent(channelUrl)}`
        };

    } catch (error) {

        if (
            error.response?.status === 404
        ) {

            return {
                username,
                displayName: username,
                live: false,
                avatar: null,
                thumbnail: null,
                title: null,
                categoryName: null,
                categoryImage: null,
                viewers: 0,
                streamId: null,
                startedAt: null,
                url:
                    `https://kick.com/${encodeURIComponent(username)}`
            };
        }

        console.error(
            `[KickAlert] Error consultando ${username}:`,
            error.response?.status ||
            error.message
        );

        return null;
    }
}

// ============================================================
// CREAR EMBED DE ALERTA
// ============================================================

function crearEmbedKickLive(streamer) {

    const embed =
        new EmbedBuilder()
            .setColor(0x53FC18)
            .setTitle("🔔 RustLogix")
            .setDescription(
                "## 🟢 INICIO DIRECTO\n\n" +
                `**[${streamer.displayName}](${streamer.url})** está en directo en Kick.`
            )
            .addFields(
                {
                    name: "🎬 Título",
                    value:
                        streamer.title ||
                        "Directo en Kick",
                    inline: false
                }
            )
            .setFooter({
                text: "RustLogix • Kick Alerts"
            })
            .setTimestamp();

    if (streamer.avatar) {

        embed.setThumbnail(
            streamer.avatar
        );
    }

    if (streamer.thumbnail) {

        embed.setImage(
            streamer.thumbnail
        );
    }

    if (streamer.categoryName) {

        embed.addFields({
            name: "🎮 Categoría",
            value:
                streamer.categoryName,
            inline: true
        });
    }

    if (streamer.viewers > 0) {

        embed.addFields({
            name: "👀 Espectadores",
            value:
                String(streamer.viewers),
            inline: true
        });
    }

    return embed;
}

// ============================================================
// CREAR BOTÓN DEL CANAL
// ============================================================

function crearBotonKick(streamer) {

    if (!streamer?.url) {
        return null;
    }

    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setLabel("Ver canal en Kick")
                .setEmoji("🔴")
                .setStyle(ButtonStyle.Link)
                .setURL(streamer.url)
        );
}

// ============================================================
// ENVIAR ALERTA
// ============================================================

async function enviarAlerta(
    client,
    monitor,
    streamer
) {

    try {

        if (!monitor.channelId) {

            console.warn(
                `[KickAlert] No hay canal configurado para ${monitor.guildId}`
            );

            return false;
        }

        const guild =
            client.guilds.cache.get(
                monitor.guildId
            );

        if (!guild) {
            return false;
        }

        const channel =
            await guild.channels.fetch(
                monitor.channelId
            ).catch(() => null);

        if (
            !channel ||
            !channel.isTextBased()
        ) {

            console.warn(
                `[KickAlert] Canal no encontrado: ${monitor.channelId}`
            );

            return false;
        }

        let contenido =
            "🔔 **ESTAMOS EN STREAM**";

        if (monitor.roleId) {

            const role =
                guild.roles.cache.get(
                    monitor.roleId
                );

            if (role) {

                contenido =
                    `<@&${monitor.roleId}> ${contenido}`;
            }
        }

        const embed =
            crearEmbedKickLive(
                streamer
            );

        const botonKick =
            crearBotonKick(
                streamer
            );

        const mensaje = {
            content: contenido,
            embeds: [embed],
            allowedMentions: {
                roles:
                    monitor.roleId
                        ? [monitor.roleId]
                        : []
            }
        };

        if (botonKick) {

            mensaje.components = [
                botonKick
            ];
        }

        await channel.send(
            mensaje
        );

        console.log(
            `[KickAlert] 🔴 ${streamer.displayName} está ONLINE en ${guild.name}`
        );

        return true;

    } catch (error) {

        console.error(
            "[KickAlert] Error enviando alerta:",
            error
        );

        return false;
    }
}

// ============================================================
// REVISAR UN MONITOR
// ============================================================

async function revisarMonitor(
    client,
    monitor
) {

    if (
        !monitor.streamers ||
        monitor.streamers.length === 0
    ) {
        return;
    }

    let cambios = false;

    for (
        const streamer of monitor.streamers
    ) {

        const datos =
            await obtenerStreamerKick(
                streamer.kickUsername
            );

        if (!datos) {
            continue;
        }

        const estabaOnline =
            streamer.isLive === true;

        const estaOnline =
            datos.live === true;

        // ====================================================
        // OFFLINE -> ONLINE
        // ====================================================

        if (
            !estabaOnline &&
            estaOnline
        ) {

            console.log(
                `[KickAlert] 🟢 OFFLINE → ONLINE: ${datos.displayName}`
            );

            await enviarAlerta(
                client,
                monitor,
                datos
            );

            streamer.lastLiveAt =
                new Date();

            cambios = true;
        }

        // ====================================================
        // ONLINE -> OFFLINE
        // ====================================================

        if (
            estabaOnline &&
            !estaOnline
        ) {

            console.log(
                `[KickAlert] ⚫ ONLINE → OFFLINE: ${streamer.kickUsername}`
            );

            streamer.lastOfflineAt =
                new Date();

            cambios = true;
        }

        // ====================================================
        // ACTUALIZAR ESTADO
        // ====================================================

        streamer.isLive =
            estaOnline;

        streamer.lastChecked =
            new Date();

        if (datos.displayName) {

            streamer.displayName =
                datos.displayName;
        }

        cambios = true;
    }

    if (cambios) {

        await monitor.save();
    }
}

// ============================================================
// REVISAR TODOS LOS SERVIDORES
// ============================================================

async function revisarKickAlertas(
    client
) {

    if (revisando) {
        return;
    }

    revisando = true;

    try {

        const monitores =
            await KickAlertMonitor.find({
                streamers: {
                    $exists: true,
                    $ne: []
                }
            });

        if (!monitores.length) {
            return;
        }

        for (
            const monitor of monitores
        ) {

            await revisarMonitor(
                client,
                monitor
            );
        }

    } catch (error) {

        console.error(
            "[KickAlert] Error revisando alertas:",
            error
        );

    } finally {

        revisando = false;
    }
}

// ============================================================
// INICIAR SISTEMA AUTOMÁTICO
// ============================================================

function iniciarKickAlertasAutomaticas(
    client
) {

    console.log(
        "🔔 Sistema de alertas Kick iniciado."
    );

    // Primera revisión después de que Discord esté listo
    setTimeout(
        () => {
            revisarKickAlertas(
                client
            );
        },
        10000
    );

    // Revisión cada 60 segundos
    setInterval(
        () => {

            revisarKickAlertas(
                client
            );

        },
        INTERVALO
    );
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    iniciarKickAlertasAutomaticas,

    revisarKickAlertas,

    obtenerStreamerKick,

    enviarAlerta,

    crearEmbedKickLive
};