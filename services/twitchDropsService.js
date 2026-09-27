// services/twitchDropsService.js

const axios = require("axios");

const TwitchAccount = require("../models/TwitchAccount");

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;

function validarConfiguracion() {
    if (!TWITCH_CLIENT_ID) {
        throw new Error("Falta la variable TWITCH_CLIENT_ID.");
    }
}

/**
 * Obtiene los headers para una cuenta Twitch concreta.
 */
function getHeaders(accessToken) {
    validarConfiguracion();

    return {
        "Client-ID": TWITCH_CLIENT_ID,
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
    };
}

/**
 * Comprueba que el token de Twitch siga siendo válido.
 */
async function validarToken(accessToken) {
    try {
        const respuesta = await axios.get(
            "https://id.twitch.tv/oauth2/validate",
            {
                headers: {
                    Authorization: `OAuth ${accessToken}`
                },
                timeout: 10000
            }
        );

        return respuesta.data || null;
    } catch (error) {
        console.error(
            "❌ Error validando token Twitch:",
            error.response?.data || error.message
        );

        return null;
    }
}

/**
 * Obtiene información de Rust desde Twitch.
 */
async function obtenerJuegoRust(accessToken) {
    try {
        const respuesta = await axios.get(
            "https://api.twitch.tv/helix/games",
            {
                params: {
                    name: "Rust"
                },
                headers: getHeaders(accessToken),
                timeout: 15000
            }
        );

        if (
            !respuesta.data ||
            !Array.isArray(respuesta.data.data) ||
            !respuesta.data.data.length
        ) {
            return null;
        }

        return respuesta.data.data[0];
    } catch (error) {
        console.error(
            "❌ Error obteniendo juego Rust desde Twitch:",
            error.response?.data || error.message
        );

        return null;
    }
}

/**
 * Obtiene las campañas de Drops activas.
 *
 * IMPORTANTE:
 * Twitch Helix no permite consultar las campañas de Drops
 * de cualquier usuario sin las condiciones/permisos correspondientes.
 *
 * Esta función intenta obtenerlas usando el token de la cuenta vinculada.
 */
async function obtenerCampanasDrops(accessToken) {
    try {
        const respuesta = await axios.get(
            "https://api.twitch.tv/helix/drops/campaigns",
            {
                params: {
                    status: "ACTIVE"
                },
                headers: getHeaders(accessToken),
                timeout: 15000
            }
        );

        return respuesta.data?.data || [];
    } catch (error) {
        console.error(
            "❌ Error obteniendo campañas Twitch Drops:",
            error.response?.status,
            error.response?.data || error.message
        );

        return [];
    }
}

/**
 * Filtra exclusivamente campañas relacionadas con Rust.
 */
function filtrarCampanasRust(campanas = []) {
    return campanas.filter(campana => {
        const texto = [
            campana.game_name,
            campana.title,
            campana.short_description,
            campana.details_url
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        return texto.includes("rust");
    });
}

/**
 * Convierte una campaña de Twitch a un formato sencillo para RustLogix.
 */
function convertirCampanaRust(campana) {
    return {
        id: campana.id || null,

        juegoId: campana.game_id || null,

        juego: campana.game_name || "Rust",

        titulo: campana.title || "Rust Drops",

        descripcion:
            campana.short_description ||
            campana.description ||
            "Campaña de Twitch Drops para Rust.",

        inicio: campana.start_at
            ? new Date(campana.start_at)
            : null,

        fin: campana.end_at
            ? new Date(campana.end_at)
            : null,

        imagen: campana.image_url || null,

        url: campana.details_url || null,

        organizador:
            campana.owner_name ||
            campana.broadcaster_name ||
            null
    };
}

/**
 * Obtiene exclusivamente los Rust Drops activos
 * utilizando la cuenta Twitch vinculada al usuario de Discord.
 */
async function obtenerRustDrops(discordUserId) {
    if (!discordUserId) {
        throw new Error("Falta el Discord User ID.");
    }

    const cuenta = await TwitchAccount.findOne({
        discordUserId
    });

    if (!cuenta) {
        return {
            vinculada: false,
            cuenta: null,
            drops: []
        };
    }

    const tokenInfo = await validarToken(cuenta.accessToken);

    if (!tokenInfo) {
        return {
            vinculada: true,
            cuenta: cuenta.twitchDisplayName || cuenta.twitchLogin,
            tokenValido: false,
            drops: []
        };
    }

    const campanas = await obtenerCampanasDrops(
        cuenta.accessToken
    );

    const rustDrops = filtrarCampanasRust(campanas)
        .map(convertirCampanaRust);

    return {
        vinculada: true,
        cuenta:
            cuenta.twitchDisplayName ||
            cuenta.twitchLogin,

        twitchUserId: cuenta.twitchUserId,

        tokenValido: true,

        drops: rustDrops
    };
}

/**
 * Genera un embed de Discord con los Rust Drops activos.
 */
function crearEmbedRustDrops(resultado) {
    const {
        EmbedBuilder
    } = require("discord.js");

    if (!resultado.vinculada) {
        return new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("🎁 Rust Drops")
            .setDescription(
                "No tienes una cuenta de Twitch vinculada.\n\n" +
                "Usa **/drops vincular** para conectar tu cuenta."
            )
            .setFooter({
                text: "RustLogix • Twitch Drops"
            });
    }

    if (resultado.tokenValido === false) {
        return new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle("🎁 Rust Drops")
            .setDescription(
                "Tu cuenta de Twitch está vinculada, pero la sesión necesita renovarse.\n\n" +
                "Prueba nuevamente con **/drops estado**."
            )
            .setFooter({
                text: "RustLogix • Twitch Drops"
            });
    }

    if (!resultado.drops.length) {
        return new EmbedBuilder()
            .setColor(0x9146ff)
            .setTitle("🎁 Rust Drops")
            .setDescription(
                `Cuenta vinculada: **${resultado.cuenta}**\n\n` +
                "Actualmente no se encontraron campañas de Rust Drops activas."
            )
            .setFooter({
                text: "RustLogix • Twitch Drops"
            })
            .setTimestamp();
    }

    const embed = new EmbedBuilder()
        .setColor(0x9146ff)
        .setTitle("🎁 Rust Drops Activos")
        .setDescription(
            `Cuenta Twitch: **${resultado.cuenta}**\n\n` +
            `Se encontraron **${resultado.drops.length}** campaña(s) activa(s) de Rust.`
        )
        .setFooter({
            text: "RustLogix • Twitch Drops"
        })
        .setTimestamp();

    for (const drop of resultado.drops.slice(0, 10)) {
        let valor =
            `${drop.descripcion}\n\n`;

        if (drop.inicio) {
            valor +=
                `🟢 Inicio: <t:${Math.floor(drop.inicio.getTime() / 1000)}:f>\n`;
        }

        if (drop.fin) {
            valor +=
                `🔴 Fin: <t:${Math.floor(drop.fin.getTime() / 1000)}:f>\n`;
        }

        if (drop.url) {
            valor +=
                `🔗 [Ver campaña en Twitch](${drop.url})`;
        }

        embed.addFields({
            name: `🎮 ${drop.titulo}`,
            value: valor,
            inline: false
        });
    }

    if (resultado.drops.length > 10) {
        embed.addFields({
            name: "ℹ️ Más campañas",
            value:
                `Hay ${resultado.drops.length - 10} campaña(s) adicional(es).`,
            inline: false
        });
    }

    return embed;
}

/**
 * Función cómoda para usar desde /drops.
 */
async function obtenerRustDropsEmbed(discordUserId) {
    const resultado = await obtenerRustDrops(discordUserId);

    return crearEmbedRustDrops(resultado);
}

module.exports = {
    validarToken,
    obtenerJuegoRust,
    obtenerCampanasDrops,
    filtrarCampanasRust,
    convertirCampanaRust,
    obtenerRustDrops,
    crearEmbedRustDrops,
    obtenerRustDropsEmbed
};