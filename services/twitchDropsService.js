// services/twitchDropsService.js

const axios = require("axios");
const { EmbedBuilder } = require("discord.js");

const TwitchAccount = require("../models/TwitchAccount");

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;

/**
 * ============================================================
 * CONFIGURACIÓN
 * ============================================================
 */

function validarConfiguracion() {
    if (!TWITCH_CLIENT_ID) {
        throw new Error("Falta la variable TWITCH_CLIENT_ID.");
    }
}

/**
 * Headers para Twitch Helix.
 */
function getHeaders(accessToken) {
    validarConfiguracion();

    if (!accessToken) {
        throw new Error("No se recibió un access token de Twitch.");
    }

    return {
        "Client-ID": TWITCH_CLIENT_ID,
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
    };
}

/**
 * ============================================================
 * VALIDAR TOKEN
 * ============================================================
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
            error.response?.status,
            error.response?.data || error.message
        );

        return null;
    }
}

/**
 * ============================================================
 * OBTENER JUEGO RUST
 * ============================================================
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

        const juegos = respuesta.data?.data || [];

        if (!juegos.length) {
            console.log("⚠️ Twitch no devolvió el juego Rust.");
            return null;
        }

        const rust = juegos.find(
            juego =>
                String(juego.name).toLowerCase() === "rust"
        );

        return rust || juegos[0];

    } catch (error) {
        console.error(
            "❌ Error obteniendo Rust desde Twitch:",
            error.response?.status,
            error.response?.data || error.message
        );

        return null;
    }
}

/**
 * ============================================================
 * OBTENER ENTITLEMENTS DE DROPS
 * ============================================================
 *
 * Twitch no ofrece una API Helix pública para listar campañas
 * activas de Drops.
 *
 * Lo que sí ofrece oficialmente es:
 *
 * GET /helix/entitlements/drops
 *
 * Este endpoint permite consultar los Drops/entitlements
 * concedidos a un usuario y filtrarlos por game_id.
 *
 * ============================================================
 */

async function obtenerEntitlementsDrops(
    accessToken,
    gameId = null,
    fulfillmentStatus = null
) {
    const todos = [];
    let cursor = null;

    try {
        do {
            const params = {
                first: 1000
            };

            if (gameId) {
                params.game_id = gameId;
            }

            if (fulfillmentStatus) {
                params.fulfillment_status =
                    fulfillmentStatus;
            }

            if (cursor) {
                params.after = cursor;
            }

            const respuesta = await axios.get(
                "https://api.twitch.tv/helix/entitlements/drops",
                {
                    params,
                    headers: getHeaders(accessToken),
                    timeout: 15000
                }
            );

            const datos =
                respuesta.data?.data || [];

            todos.push(...datos);

            cursor =
                respuesta.data?.pagination?.cursor ||
                null;

        } while (cursor);

        return todos;

    } catch (error) {
        console.error(
            "❌ Error obteniendo entitlements Twitch Drops:",
            error.response?.status,
            error.response?.data || error.message
        );

        return [];
    }
}

/**
 * ============================================================
 * OBTENER DROPS DE RUST
 * ============================================================
 */

async function obtenerRustEntitlements(accessToken) {
    const rust = await obtenerJuegoRust(accessToken);

    if (!rust) {
        return {
            juego: null,
            entitlements: []
        };
    }

    const entitlements =
        await obtenerEntitlementsDrops(
            accessToken,
            rust.id
        );

    return {
        juego: rust,
        entitlements
    };
}

/**
 * ============================================================
 * SEPARAR ESTADOS
 * ============================================================
 */

function separarEntitlements(entitlements = []) {
    const claimed = [];
    const fulfilled = [];

    for (const entitlement of entitlements) {
        if (
            entitlement.fulfillment_status ===
            "CLAIMED"
        ) {
            claimed.push(entitlement);
        }

        if (
            entitlement.fulfillment_status ===
            "FULFILLED"
        ) {
            fulfilled.push(entitlement);
        }
    }

    return {
        claimed,
        fulfilled
    };
}

/**
 * ============================================================
 * ORDENAR POR FECHA
 * ============================================================
 */

function ordenarPorFecha(entitlements = []) {
    return [...entitlements].sort(
        (a, b) => {
            const fechaA =
                new Date(a.timestamp || 0).getTime();

            const fechaB =
                new Date(b.timestamp || 0).getTime();

            return fechaB - fechaA;
        }
    );
}

/**
 * ============================================================
 * OBTENER INFORMACIÓN COMPLETA DE RUST DROPS
 * ============================================================
 */

async function obtenerRustDrops(discordUserId) {
    if (!discordUserId) {
        throw new Error(
            "Falta el Discord User ID."
        );
    }

    const cuenta =
        await TwitchAccount.findOne({
            discordUserId
        });

    /**
     * No hay cuenta vinculada.
     */
    if (!cuenta) {
        return {
            vinculada: false,
            tokenValido: false,
            cuenta: null,
            juego: null,
            drops: [],
            claimed: [],
            fulfilled: []
        };
    }

    /**
     * Validar token.
     */
    const tokenInfo =
        await validarToken(
            cuenta.accessToken
        );

    if (!tokenInfo) {
        return {
            vinculada: true,
            tokenValido: false,
            cuenta:
                cuenta.twitchDisplayName ||
                cuenta.twitchLogin,
            juego: null,
            drops: [],
            claimed: [],
            fulfilled: []
        };
    }

    /**
     * Obtener Rust + entitlements.
     */
    const resultado =
        await obtenerRustEntitlements(
            cuenta.accessToken
        );

    const separados =
        separarEntitlements(
            resultado.entitlements
        );

    const dropsOrdenados =
        ordenarPorFecha(
            resultado.entitlements
        );

    return {
        vinculada: true,

        tokenValido: true,

        cuenta:
            cuenta.twitchDisplayName ||
            cuenta.twitchLogin,

        twitchLogin:
            cuenta.twitchLogin,

        twitchUserId:
            cuenta.twitchUserId,

        juego: resultado.juego,

        drops: dropsOrdenados,

        claimed:
            ordenarPorFecha(
                separados.claimed
            ),

        fulfilled:
            ordenarPorFecha(
                separados.fulfilled
            ),

        total:
            resultado.entitlements.length
    };
}

/**
 * ============================================================
 * FORMATEAR FECHA
 * ============================================================
 */

function formatearFecha(fecha) {
    if (!fecha) {
        return "Desconocida";
    }

    const timestamp =
        Math.floor(
            new Date(fecha).getTime() / 1000
        );

    if (!Number.isFinite(timestamp)) {
        return "Desconocida";
    }

    return `<t:${timestamp}:f>`;
}

/**
 * ============================================================
 * CREAR EMBED
 * ============================================================
 */

function crearEmbedRustDrops(resultado) {
    /**
     * Cuenta no vinculada.
     */
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

    /**
     * Token inválido.
     */
    if (!resultado.tokenValido) {
        return new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle("🎁 Rust Drops")
            .setDescription(
                `Cuenta vinculada: **${resultado.cuenta}**\n\n` +
                "⚠️ La sesión de Twitch no pudo validarse.\n\n" +
                "Prueba nuevamente con **/drops estado** o vuelve a vincular la cuenta."
            )
            .setFooter({
                text: "RustLogix • Twitch Drops"
            })
            .setTimestamp();
    }

    /**
     * No se encontró Rust.
     */
    if (!resultado.juego) {
        return new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle("🎁 Rust Drops")
            .setDescription(
                `Cuenta Twitch: **${resultado.cuenta}**\n\n` +
                "No se pudo identificar el juego Rust en Twitch."
            )
            .setFooter({
                text: "RustLogix • Twitch Drops"
            })
            .setTimestamp();
    }

    /**
     * No hay entitlements.
     */
    if (!resultado.drops.length) {
        return new EmbedBuilder()
            .setColor(0x9146ff)
            .setTitle("🎁 Rust Drops")
            .setDescription(
                `Cuenta Twitch: **${resultado.cuenta}**\n\n` +
                "No se encontraron entitlements de Drops de Rust asociados a esta cuenta."
            )
            .addFields({
                name: "ℹ️ Importante",
                value:
                    "Esto consulta los Drops que Twitch ha concedido a tu cuenta. " +
                    "No representa una lista de campañas activas ni el progreso de minutos vistos."
            })
            .setFooter({
                text: "RustLogix • Twitch Drops"
            })
            .setTimestamp();
    }

    /**
     * Último Drop.
     */
    const ultimoDrop =
        resultado.drops[0];

    const embed = new EmbedBuilder()
        .setColor(0x9146ff)
        .setTitle("🎁 Rust Drops")
        .setDescription(
            `Cuenta Twitch: **${resultado.cuenta}**\n\n` +
            `🎮 Juego: **${resultado.juego.name}**`
        )
        .addFields(
            {
                name: "📦 Total de Drops",
                value:
                    `**${resultado.total}**`,
                inline: true
            },
            {
                name: "🟡 Reclamados",
                value:
                    `**${resultado.claimed.length}**`,
                inline: true
            },
            {
                name: "🟢 Completados",
                value:
                    `**${resultado.fulfilled.length}**`,
                inline: true
            }
        );

    /**
     * Último entitlement.
     */
    embed.addFields({
        name: "🎁 Último Drop registrado",
        value:
            `**ID:** \`${ultimoDrop.id}\`\n` +
            `**Benefit:** \`${ultimoDrop.benefit_id}\`\n` +
            `**Estado:** ${
                ultimoDrop.fulfillment_status ===
                "FULFILLED"
                    ? "🟢 FULFILLED"
                    : "🟡 CLAIMED"
            }\n` +
            `**Fecha:** ${formatearFecha(
                ultimoDrop.timestamp
            )}`,
        inline: false
    });

    /**
     * Mostrar algunos Drops recientes.
     */
    const recientes =
        resultado.drops.slice(0, 5);

    if (recientes.length) {
        const textoRecientes =
            recientes
                .map(
                    (drop, index) => {
                        const estado =
                            drop.fulfillment_status ===
                            "FULFILLED"
                                ? "🟢"
                                : "🟡";

                        return (
                            `${index + 1}. ${estado} ` +
                            `\`${drop.benefit_id}\` — ` +
                            `${formatearFecha(
                                drop.timestamp
                            )}`
                        );
                    }
                )
                .join("\n");

        embed.addFields({
            name: "📋 Drops recientes",
            value: textoRecientes,
            inline: false
        });
    }

    embed.addFields({
        name: "⚠️ Sobre el progreso",
        value:
            "Twitch no proporciona mediante este endpoint el contador de minutos vistos de una campaña. " +
            "Por eso RustLogix todavía no puede mostrar algo como `40/60 minutos` usando únicamente la API oficial.",
        inline: false
    });

    embed
        .setFooter({
            text: "RustLogix • Twitch Drops"
        })
        .setTimestamp();

    return embed;
}

/**
 * ============================================================
 * FUNCIÓN PRINCIPAL PARA /drops rust
 * ============================================================
 */

async function obtenerRustDropsEmbed(
    discordUserId
) {
    const resultado =
        await obtenerRustDrops(
            discordUserId
        );

    return crearEmbedRustDrops(
        resultado
    );
}

/**
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {
    validarToken,
    obtenerJuegoRust,
    obtenerEntitlementsDrops,
    obtenerRustEntitlements,
    separarEntitlements,
    ordenarPorFecha,
    obtenerRustDrops,
    crearEmbedRustDrops,
    obtenerRustDropsEmbed
};