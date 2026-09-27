const axios = require("axios");
const { EmbedBuilder } = require("discord.js");

const TwitchAccount = require("../models/TwitchAccount");

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;

const INVENTORY_HASHES = [
    "e7197a7e03be13e423118005966d097a2f44045b3642bfdb70820e01c8129fd6",
    "d86775d0ef16a63a33ad52e80eaff963b2d5b72fada7c991504a57496e1d8e4b"
];

const GQL_URL = "https://gql.twitch.tv/gql";

function validarConfiguracion() {
    if (!TWITCH_CLIENT_ID) {
        throw new Error("Falta la variable TWITCH_CLIENT_ID.");
    }
}

function obtenerHeaders(accessToken) {
    validarConfiguracion();

    if (!accessToken) {
        throw new Error("No se recibió el access token de Twitch.");
    }

    return {
        "Client-ID": TWITCH_CLIENT_ID,
        "Authorization": `OAuth ${accessToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
    };
}

async function consultarInventory(accessToken, hash) {
    const body = [
        {
            operationName: "Inventory",
            variables: {
                fetchRewardCampaigns: true
            },
            extensions: {
                persistedQuery: {
                    version: 1,
                    sha256Hash: hash
                }
            }
        }
    ];

    const respuesta = await axios.post(
        GQL_URL,
        body,
        {
            headers: obtenerHeaders(accessToken),
            timeout: 20000,
            validateStatus: () => true
        }
    );

    if (respuesta.status < 200 || respuesta.status >= 300) {
        throw new Error(
            `Twitch GraphQL respondió HTTP ${respuesta.status}: ` +
            JSON.stringify(respuesta.data)
        );
    }

    const item = Array.isArray(respuesta.data)
        ? respuesta.data[0]
        : respuesta.data;

    if (item?.errors?.length) {
        throw new Error(
            `Twitch GraphQL devolvió errores: ${JSON.stringify(item.errors)}`
        );
    }

    return item?.data?.currentUser?.inventory || null;
}

async function obtenerInventory(accessToken) {
    let ultimoError = null;

    for (const hash of INVENTORY_HASHES) {
        try {
            const inventory = await consultarInventory(
                accessToken,
                hash
            );

            if (inventory) {
                console.log(
                    `🎁 Twitch Inventory obtenido correctamente ` +
                    `(hash ${hash.slice(0, 8)}...)`
                );

                return inventory;
            }
        } catch (error) {
            ultimoError = error;

            console.log(
                `⚠️ Falló Twitch Inventory con hash ${hash.slice(0, 8)}...`
            );

            console.log(
                error.response?.data ||
                error.message
            );
        }
    }

    throw (
        ultimoError ||
        new Error("Twitch no devolvió el inventario.")
    );
}

function obtenerCampañasEnCurso(inventory) {
    return Array.isArray(inventory?.dropCampaignsInProgress)
        ? inventory.dropCampaignsInProgress
        : [];
}

function convertirDrop(drop) {
    const actual = Number(
        drop?.self?.currentMinutesWatched || 0
    );

    const requerido = Number(
        drop?.requiredMinutesWatched || 0
    );

    const porcentaje = requerido > 0
        ? Math.min(
            100,
            Math.floor((actual / requerido) * 100)
        )
        : 0;

    const recompensas = Array.isArray(drop?.benefitEdges)
        ? drop.benefitEdges
            .map(edge => edge?.benefit)
            .filter(Boolean)
            .map(benefit => ({
                id: benefit.id || null,
                nombre: benefit.name || "Recompensa",
                imagen: benefit.imageAssetURL || null
            }))
        : [];

    return {
        id: drop?.id || null,
        nombre: drop?.name || "Drop",
        actual,
        requerido,
        porcentaje,
        reclamado: Boolean(drop?.self?.isClaimed),
        dropInstanceID: drop?.self?.dropInstanceID || null,
        precondicionesCumplidas: Boolean(
            drop?.self?.hasPreconditionsMet
        ),
        inicio: drop?.startAt || null,
        fin: drop?.endAt || null,
        recompensas
    };
}

function convertirCampaña(campaña) {
    const drops = Array.isArray(campaña?.timeBasedDrops)
        ? campaña.timeBasedDrops.map(convertirDrop)
        : [];

    return {
        id: campaña?.id || null,
        nombre: campaña?.name || "Campaña de Drops",
        juego: campaña?.game?.name || "Desconocido",
        juegoId: campaña?.game?.id || null,
        imagenJuego: campaña?.game?.boxArtURL || null,
        imagen: campaña?.imageURL || null,
        detailsURL: campaña?.detailsURL || null,
        accountLinkURL: campaña?.accountLinkURL || null,
        inicio: campaña?.startAt || null,
        fin: campaña?.endAt || null,
        estado: campaña?.status || "ACTIVE",
        drops
    };
}

function filtrarCampañasRust(campañas) {
    return campañas.filter(campaña => {
        const juego = String(
            campaña?.game?.name || ""
        ).toLowerCase();

        return juego === "rust";
    });
}

async function obtenerCuentaTwitch(discordUserId) {
    if (!discordUserId) {
        throw new Error("Falta el Discord User ID.");
    }

    const cuenta = await TwitchAccount.findOne({
        discordUserId
    });

    return cuenta;
}

async function obtenerRustDrops(discordUserId) {
    const cuenta = await obtenerCuentaTwitch(
        discordUserId
    );

    if (!cuenta) {
        return {
            vinculada: false,
            tokenValido: false,
            cuenta: null,
            campañas: [],
            inventory: null
        };
    }

    let inventory;

    try {
        inventory = await obtenerInventory(
            cuenta.accessToken
        );
    } catch (error) {
        console.error(
            "❌ Error obteniendo Twitch Inventory:",
            error.response?.data ||
            error.message
        );

        return {
            vinculada: true,
            tokenValido: false,
            cuenta:
                cuenta.twitchDisplayName ||
                cuenta.twitchLogin,
            twitchLogin: cuenta.twitchLogin,
            twitchUserId: cuenta.twitchUserId,
            campañas: [],
            inventory: null,
            error: error.message
        };
    }

    const campañasEnCurso =
        obtenerCampañasEnCurso(inventory);

    const campañasRust =
        filtrarCampañasRust(campañasEnCurso)
            .map(convertirCampaña);

    return {
        vinculada: true,
        tokenValido: true,
        cuenta:
            cuenta.twitchDisplayName ||
            cuenta.twitchLogin,
        twitchLogin: cuenta.twitchLogin,
        twitchUserId: cuenta.twitchUserId,
        campañas: campañasRust,
        inventory
    };
}

function formatearMinutos(minutos) {
    const total = Number(minutos) || 0;

    const horas = Math.floor(total / 60);
    const mins = total % 60;

    if (horas > 0 && mins > 0) {
        return `${horas} h ${mins} min`;
    }

    if (horas > 0) {
        return `${horas} h`;
    }

    return `${mins} min`;
}

function formatearFecha(fecha) {
    if (!fecha) {
        return "Desconocida";
    }

    const timestamp = Math.floor(
        new Date(fecha).getTime() / 1000
    );

    if (!Number.isFinite(timestamp)) {
        return "Desconocida";
    }

    return `<t:${timestamp}:f>`;
}

function crearBarraProgreso(porcentaje) {
    const valor = Math.max(
        0,
        Math.min(100, Number(porcentaje) || 0)
    );

    const totalBloques = 10;

    const llenos = Math.round(
        (valor / 100) * totalBloques
    );

    const vacios = totalBloques - llenos;

    return (
        "🟩".repeat(llenos) +
        "⬜".repeat(vacios)
    );
}

function formatearDrop(drop) {
    const recompensa =
        drop.recompensas?.[0]?.nombre ||
        drop.nombre ||
        "Recompensa";

    const porcentaje = drop.porcentaje;

    const estado = drop.reclamado
        ? "🟢"
        : porcentaje >= 100
            ? "🟡"
            : "⚪";

    return (
        `${estado} **${recompensa}** — ` +
        `${formatearMinutos(drop.requerido)}`
    );
}

function obtenerDropActivo(campaña) {
    if (!campaña?.drops?.length) {
        return null;
    }

    const pendientes = campaña.drops
        .filter(drop => !drop.reclamado)
        .sort((a, b) => {
            return a.requerido - b.requerido;
        });

    if (!pendientes.length) {
        return null;
    }

    return pendientes.find(
        drop => drop.actual < drop.requerido
    ) || pendientes[pendientes.length - 1];
}

function crearEmbedRustDrops(resultado) {
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

    if (!resultado.tokenValido) {
        return new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle("🎁 Rust Drops")
            .setDescription(
                `Cuenta Twitch: **${resultado.cuenta}**\n\n` +
                "⚠️ No pude consultar el inventario de Drops de Twitch.\n\n" +
                "La sesión OAuth puede haber expirado o Twitch puede " +
                "haber cambiado su consulta interna de Drops."
            )
            .setFooter({
                text: "RustLogix • Twitch Drops"
            })
            .setTimestamp();
    }

    if (!resultado.campañas.length) {
        return new EmbedBuilder()
            .setColor(0x9146ff)
            .setTitle("🎁 Rust Drops")
            .setDescription(
                `Cuenta Twitch: **${resultado.cuenta}**\n\n` +
                "No tienes campañas de Drops de **Rust** con progreso actualmente."
            )
            .setFooter({
                text: "RustLogix • Twitch Drops"
            })
            .setTimestamp();
    }

    const embed = new EmbedBuilder()
        .setColor(0x9146ff)
        .setTitle("🎁 Rust Drops")
        .setDescription(
            `Cuenta Twitch: **${resultado.cuenta}**`
        )
        .setFooter({
            text: "RustLogix • Twitch Drops"
        })
        .setTimestamp();

    for (const campaña of resultado.campañas) {
        const activo = obtenerDropActivo(campaña);

        let texto =
            `📅 Finaliza: ${formatearFecha(campaña.fin)}\n`;

        if (activo) {
            texto +=
                `\n🎯 **Progreso actual**\n` +
                `${crearBarraProgreso(activo.porcentaje)} ` +
                `**${activo.porcentaje}%**\n` +
                `⏱️ ${formatearMinutos(activo.actual)} / ` +
                `${formatearMinutos(activo.requerido)}\n` +
                `🎁 ${activo.recompensas?.[0]?.nombre || activo.nombre}`;

            if (activo.actual < activo.requerido) {
                const faltan =
                    activo.requerido - activo.actual;

                texto +=
                    `\n⌛ Faltan aproximadamente **${formatearMinutos(faltan)}**`;
            }
        }

        if (campaña.detailsURL) {
            texto +=
                `\n\n🔗 [Ver campaña en Twitch](${campaña.detailsURL})`;
        }

        embed.addFields({
            name: `🎮 ${campaña.nombre}`,
            value: texto,
            inline: false
        });

        const dropsTexto = campaña.drops
            .map(formatearDrop)
            .join("\n");

        if (dropsTexto) {
            embed.addFields({
                name: "🎁 Recompensas",
                value: dropsTexto.slice(0, 1024),
                inline: false
            });
        }

        if (
            activo?.recompensas?.[0]?.imagen
        ) {
            embed.setThumbnail(
                activo.recompensas[0].imagen
            );
        } else if (campaña.imagen) {
            embed.setThumbnail(
                campaña.imagen
            );
        }
    }

    return embed;
}

async function obtenerRustDropsEmbed(discordUserId) {
    const resultado =
        await obtenerRustDrops(discordUserId);

    return crearEmbedRustDrops(resultado);
}

module.exports = {
    obtenerInventory,
    obtenerCampañasEnCurso,
    obtenerRustDrops,
    crearEmbedRustDrops,
    obtenerRustDropsEmbed,
    convertirDrop,
    convertirCampaña,
    filtrarCampañasRust,
    formatearMinutos,
    formatearFecha,
    crearBarraProgreso
};