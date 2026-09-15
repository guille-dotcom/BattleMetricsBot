const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const axios = require("axios");

const {
    getSteamIDData
} = require("../services/steamid.js");

// =====================================================
// OBTENER NOMBRES HISTÓRICOS DESDE STEAMID.UK
// =====================================================

function decodeHtml(texto) {
    return String(texto || "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&apos;/gi, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/&#x2F;/gi, "/")
        .replace(/&#(\d+);/g, (_, n) =>
            String.fromCharCode(Number(n))
        )
        .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
            String.fromCharCode(parseInt(n, 16))
        );
}

function limpiarNombreSteam(nombre) {
    return decodeHtml(
        String(nombre || "")
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
    )
        .replace(/\s+/g, " ")
        .trim();
}

function esTextoBasuraNombre(texto) {
    if (!texto) return true;

    const nombre = texto.trim();

    if (nombre.length < 1 || nombre.length > 100) {
        return true;
    }

    if (/^\d+$/.test(nombre)) {
        return true;
    }

    const basura = [
        /^previous names?$/i,
        /^previous name$/i,
        /^name history$/i,
        /^aliases?$/i,
        /^history$/i,
        /^steamid$/i,
        /^steam3$/i,
        /^steam64$/i,
        /^profile$/i,
        /^friends?$/i,
        /^avatars?$/i,
        /^vac$/i,
        /^trade/i,
        /^community/i,
        /^game bans?$/i,
        /^rusthackreport$/i,
        /^watch list$/i,
        /^open profile$/i,
        /^view profile$/i,
        /^show more$/i,
        /^load more$/i
    ];

    if (basura.some(regex => regex.test(nombre))) {
        return true;
    }

    if (/^(https?:\/\/|www\.)/i.test(nombre)) {
        return true;
    }

    if (/^STEAM_[0-5]:/i.test(nombre)) {
        return true;
    }

    if (/^\[U:1:\d+\]$/i.test(nombre)) {
        return true;
    }

    return false;
}

function agregarNombre(lista, nombre) {
    const limpio = limpiarNombreSteam(nombre);

    if (esTextoBasuraNombre(limpio)) {
        return;
    }

    if (
        !lista.some(
            n => n.toLowerCase() === limpio.toLowerCase()
        )
    ) {
        lista.push(limpio);
    }
}

async function getSteamIDNameHistory(steamId64) {
    try {
        const url =
            `https://steamid.uk/profile/${steamId64}`;

        const response =
            await axios.get(
                url,
                {
                    timeout: 20000,

                    headers: {
                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",

                        "Accept":
                            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

                        "Accept-Language":
                            "en-US,en;q=0.9",

                        "Cache-Control":
                            "no-cache",

                        "Pragma":
                            "no-cache"
                    }
                }
            );

        const html =
            String(response.data || "");

        const names = [];

        if (!html) {
            return [];
        }

        // =================================================
        // BUSCAR BLOQUE DEL HISTORIAL
        // =================================================

        const markers = [
            "Previous Names",
            "Previous Name",
            "Name History",
            "Name history",
            "Aliases"
        ];

        let historyStart = -1;

        for (const marker of markers) {
            const index =
                html.toLowerCase().indexOf(
                    marker.toLowerCase()
                );

            if (index !== -1) {
                historyStart = index;
                break;
            }
        }

        let historySection = "";

        if (historyStart !== -1) {
            historySection =
                html.substring(
                    historyStart,
                    historyStart + 30000
                );
        }

        // =================================================
        // EXTRAER ELEMENTOS HTML
        // =================================================

        if (historySection) {
            const elementRegex =
                /<(?:td|th|li|span|div|a|p)[^>]*>([\s\S]*?)<\/(?:td|th|li|span|div|a|p)>/gi;

            let match;

            while (
                (match =
                    elementRegex.exec(
                        historySection
                    )) !== null
            ) {
                const contenido =
                    match[1];

                if (contenido.length > 500) {
                    continue;
                }

                agregarNombre(
                    names,
                    contenido
                );
            }
        }

        // =================================================
        // FALLBACK TEXTO PLANO
        // =================================================

        if (
            names.length === 0 &&
            historySection
        ) {
            const texto =
                decodeHtml(
                    historySection
                        .replace(
                            /<script[\s\S]*?<\/script>/gi,
                            "\n"
                        )
                        .replace(
                            /<style[\s\S]*?<\/style>/gi,
                            "\n"
                        )
                        .replace(
                            /<br\s*\/?>/gi,
                            "\n"
                        )
                        .replace(
                            /<\/(?:div|li|td|th|p|tr)>/gi,
                            "\n"
                        )
                        .replace(
                            /<[^>]+>/g,
                            " "
                        )
                );

            const lines =
                texto
                    .split(/\n+/)
                    .map(
                        line => line.trim()
                    )
                    .filter(Boolean);

            for (const line of lines) {
                if (line.length <= 100) {
                    agregarNombre(
                        names,
                        line
                    );
                }
            }
        }

        // =================================================
        // LIMPIEZA FINAL
        // =================================================

        const resultado =
            names.filter(
                nombre =>
                    !/^(current name|current username|steam profile|steam community)$/i
                        .test(nombre)
            );

        console.log(
            `📜 SteamID.uk: ${resultado.length} nombre(s) históricos encontrados para ${steamId64}`
        );

        return resultado;

    } catch (error) {
        console.error(
            "⚠️ No se pudo obtener el historial de nombres desde SteamID.uk:",
            error.response?.status ||
            error.message
        );

        return [];
    }
}


// =====================================================
// COMANDO /STEAMID
// =====================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName("steamid")
        .setDescription(
            "Obtiene información detallada de un SteamID"
        )
        .addStringOption(option =>
            option
                .setName("steamid")
                .setDescription(
                    "SteamID64 del jugador"
                )
                .setRequired(true)
        ),

    async execute(interaction) {

        await interaction.deferReply();

        // =================================================
        // OBTENER STEAMID
        // =================================================

        const steamId =
            interaction.options
                .getString("steamid")
                .trim();

        // =================================================
        // VALIDAR STEAMID64
        // =================================================

        if (!/^\d{17}$/.test(steamId)) {
            return await interaction.editReply(
                "❌ Debes introducir un SteamID64 válido de 17 números."
            );
        }

        // =================================================
        // CONSULTAR STEAMID.UK API
        // =================================================

        let data;

        try {

            data =
                await getSteamIDData(
                    steamId
                );

        } catch (error) {

            console.error(
                "❌ Error ejecutando /steamid:",
                error.response?.data ||
                error.message
            );

            if (
                error.message?.includes(
                    "STEAMID_API_KEY"
                )
            ) {
                return await interaction.editReply(
                    "❌ El bot no tiene configurada la API Key de SteamID.uk en Render."
                );
            }

            if (
                error.message?.includes(
                    "STEAMID_MYID"
                )
            ) {
                return await interaction.editReply(
                    "❌ El bot no tiene configurado STEAMID_MYID en Render."
                );
            }

            return await interaction.editReply(
                "❌ No se pudo obtener la información desde SteamID.uk."
            );
        }

        // =================================================
        // EXTRAER DATOS
        // =================================================

        const profile =
            data.profile || {};

        const bans =
            data.profile_bans || {};

        const steamData =
            data.steamid_data || {};

        const watch =
            data.custom_watch_list || {};

        // =================================================
        // OBTENER NOMBRES HISTÓRICOS
        // =================================================

        const historicalNames =
            await getSteamIDNameHistory(
                steamId
            );

        console.log(
            "📜 NOMBRES HISTÓRICOS ENCONTRADOS:",
            historicalNames
        );

        // =================================================
        // BANEOS
        // =================================================

        const vac =
            bans.vac === "1"
                ? "⚠️ Sí"
                : "✅ No";

        const trade =
            bans.tradeban === "1"
                ? "⚠️ Sí"
                : "✅ No";

        const community =
            bans.communityban === "1"
                ? "⚠️ Sí"
                : "✅ No";

        const gameBans =
            bans.amount_game_bans || "0";

        const steamIdBan =
            bans.steamid_ban === "1"
                ? "⚠️ Sí"
                : "✅ No";

        // =================================================
        // RUST HACK REPORT
        // =================================================

        const rustHack =
            bans.rusthackreport === "1"
                ? "⚠️ Reportado"
                : "✅ No";

        // =================================================
        // WATCH LIST
        // =================================================

        const watchList =
            watch.watch_result === "1"
                ? `👁️ Sí — ${
                    watch.category ||
                    "Lista personalizada"
                }`
                : "❌ No";

        // =================================================
        // PERFIL
        // =================================================

        const steamId64 =
            profile.steamid64 ||
            steamId;

        const steam2 =
            profile.steamid ||
            "No disponible";

        const steam3 =
            profile.steam3 ||
            "No disponible";

        const csgoFriend =
            profile.csgofriend ||
            "No disponible";

        // =================================================
        // ENLACES
        // =================================================

        const steamIdUkUrl =
            profile.steamidurl ||
            `https://steamid.uk/profile/${steamId64}`;

        const steamProfileUrl =
            `https://steamcommunity.com/profiles/${steamId64}`;

        // =================================================
        // ESTADÍSTICAS DE AMIGOS
        // =================================================

        const friendCount =
            steamData.friend_count ||
            "0";

        const vacFriends =
            steamData.vac_banned_friends ||
            "0";

        const gameBannedFriends =
            steamData.game_banned_friends ||
            "0";

        const tradeBannedFriends =
            steamData.trade_banned_friends ||
            "0";

        const communityBannedFriends =
            steamData.community_banned_friends ||
            "0";

        // =================================================
        // HISTORIAL DE NOMBRES
        // =================================================

        const nameHistoryTotal =
            steamData.name_history_count ||
            "0";

        const nameHistoryYears =
            Array.isArray(
                data.name_history_count_year
            )
                ? [
                    ...data.name_history_count_year
                ]
                : [];

        nameHistoryYears.sort(
            (a, b) =>
                Number(b.year) -
                Number(a.year)
        );

        let nameHistoryTexto =
            `📊 Total: \`${nameHistoryTotal}\``;

        // =================================================
        // MOSTRAR NOMBRES INDIVIDUALES
        // =================================================

        if (
            historicalNames.length > 0
        ) {

            const namesText =
                historicalNames
                    .map(
                        (name, index) =>
                            `\`${index + 1}.\` ${name}`
                    )
                    .join("\n");

            nameHistoryTexto +=
                `\n\n${namesText}`;
        }

        // =================================================
        // DESGLOSE POR AÑO
        // =================================================

        if (
            nameHistoryYears.length > 0
        ) {

            const yearsText =
                nameHistoryYears
                    .map(
                        item =>
                            `\`${item.year}\` → \`${item.count}\` nombre(s)`
                    )
                    .join("\n");

            nameHistoryTexto +=
                `\n\n📅 Por año:\n${yearsText}`;
        }

        // =================================================
        // SI NO SE PUDIERON OBTENER LOS NOMBRES
        // =================================================

        if (
            historicalNames.length === 0
        ) {

            nameHistoryTexto +=
                "\n\n⚠️ No se pudieron obtener los nombres individuales desde la página de SteamID.uk.";
        }

        // =================================================
        // LIMITAR CAMPO DE DISCORD
        // =================================================

        if (
            nameHistoryTexto.length > 1024
        ) {

            nameHistoryTexto =
                nameHistoryTexto.substring(
                    0,
                    1000
                ) +
                "\n...";
        }

        // =================================================
        // HISTORIAL DE AMIGOS
        // =================================================

        const friendHistory =
            steamData.friend_history_count ||
            "0";

        // =================================================
        // PRIVACIDAD DE AMIGOS
        // =================================================

        const friendCountNumber =
            parseInt(
                friendCount,
                10
            ) || 0;

        const friendHistoryNumber =
            parseInt(
                friendHistory,
                10
            ) || 0;

        let friendHistoryTexto;

        if (
            friendCountNumber === 0 &&
            friendHistoryNumber === 0
        ) {

            friendHistoryTexto =
                "🔒 Steam Friends - Private";

        } else {

            friendHistoryTexto =
                `\`${friendHistoryNumber}\``;
        }

        // =================================================
        // EMBED
        // =================================================

        const embed =
            new EmbedBuilder()
                .setTitle(
                    "🔎 Información SteamID"
                )
                .setColor(
                    "#57F287"
                )
                .addFields(

                    {
                        name:
                            "🆔 SteamID64",

                        value:
                            `\`${steamId64}\``,

                        inline:
                            false
                    },

                    {
                        name:
                            "Steam2",

                        value:
                            `\`${steam2}\``,

                        inline:
                            true
                    },

                    {
                        name:
                            "Steam3",

                        value:
                            `\`${steam3}\``,

                        inline:
                            true
                    },

                    {
                        name:
                            "CSGO Friend ID",

                        value:
                            `\`${csgoFriend}\``,

                        inline:
                            true
                    },

                    {
                        name:
                            "🔗 Perfil SteamID.uk",

                        value:
                            `[Abrir perfil](${steamIdUkUrl})`,

                        inline:
                            true
                    },

                    {
                        name:
                            "🎮 Perfil de Steam",

                        value:
                            `[Abrir perfil](${steamProfileUrl})`,

                        inline:
                            true
                    },

                    {
                        name:
                            "🛡️ VAC",

                        value:
                            vac,

                        inline:
                            true
                    },

                    {
                        name:
                            "🔨 Game Bans",

                        value:
                            `\`${gameBans}\``,

                        inline:
                            true
                    },

                    {
                        name:
                            "🚫 Trade Ban",

                        value:
                            trade,

                        inline:
                            true
                    },

                    {
                        name:
                            "🏛️ Community Ban",

                        value:
                            community,

                        inline:
                            true
                    },

                    {
                        name:
                            "🆔 SteamID Ban",

                        value:
                            steamIdBan,

                        inline:
                            true
                    },

                    {
                        name:
                            "🦀 RustHackReport",

                        value:
                            rustHack,

                        inline:
                            true
                    },

                    {
                        name:
                            "👥 Amigos",

                        value:
                            `\`${friendCount}\``,

                        inline:
                            true
                    },

                    {
                        name:
                            "👤 Amigos con VAC",

                        value:
                            `\`${vacFriends}\``,

                        inline:
                            true
                    },

                    {
                        name:
                            "⚠️ Amigos con Game Ban",

                        value:
                            `\`${gameBannedFriends}\``,

                        inline:
                            true
                    },

                    {
                        name:
                            "🚫 Amigos con Trade Ban",

                        value:
                            `\`${tradeBannedFriends}\``,

                        inline:
                            true
                    },

                    {
                        name:
                            "🏛️ Amigos con Community Ban",

                        value:
                            `\`${communityBannedFriends}\``,

                        inline:
                            true
                    },

                    {
                        name:
                            "📜 Historial de nombres",

                        value:
                            nameHistoryTexto,

                        inline:
                            false
                    },

                    {
                        name:
                            "📚 Historial de amigos",

                        value:
                            friendHistoryTexto,

                        inline:
                            true
                    },

                    {
                        name:
                            "👁️ Watch List",

                        value:
                            watchList,

                        inline:
                            false
                    }
                )
                .setTimestamp()
                .setFooter({
                    text:
                        "RustLogix • SteamID.uk"
                });

        // =====================================================
        // RUSTHACKREPORT URL
        // =====================================================

        if (
            bans.rusthackreport === "1" &&
            bans.rusthackreport_url
        ) {

            embed.addFields({

                name:
                    "🦀 RustHackReport",

                value:
                    `[Ver reporte](${bans.rusthackreport_url})`,

                inline:
                    false

            });
        }

        // =====================================================
        // RESPONDER
        // =====================================================

        return await interaction.editReply({

            embeds: [
                embed
            ]

        });

    }

};