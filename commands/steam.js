const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const axios = require("axios");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BATTLEMETRICS_API =
    "https://api.battlemetrics.com";

const BATTLEMETRICS_SERVER_ID =
    process.env.BATTLEMETRICS_SERVER_ID || "11378166";

const BATTLEMETRICS_TOKEN =
    process.env.BATTLEMETRICS_TOKEN;

// =====================================================
// UTILIDADES
// =====================================================

function normalizarNombre(nombre) {
    return String(nombre || "")
        .trim()
        .toLowerCase();
}

// =====================================================
// BUSCAR EN BATTLEMETRICS
// =====================================================

async function buscarEnBattleMetrics(nombre) {

    if (!BATTLEMETRICS_TOKEN) {
        throw new Error(
            "Falta BATTLEMETRICS_TOKEN en las variables de entorno."
        );
    }

    console.log(
        "=============================================="
    );

    console.log(
        `[BM] BUSCANDO NOMBRE EXACTO: "${nombre}"`
    );

    console.log(
        `[BM] SERVIDOR: ${BATTLEMETRICS_SERVER_ID}`
    );

    console.log(
        "=============================================="
    );

    const response = await axios.get(
        `${BATTLEMETRICS_API}/servers/${BATTLEMETRICS_SERVER_ID}`,
        {
            params: {
                include: "player,identifier"
            },

            headers: {
                Authorization:
                    `Bearer ${BATTLEMETRICS_TOKEN}`,

                Accept:
                    "application/json"
            },

            timeout: 30000
        }
    );

    const body = response.data;

    const included =
        Array.isArray(body?.included)
            ? body.included
            : [];

    console.log(
        `[BM] Recursos incluidos: ${included.length}`
    );

    const jugadores =
        included.filter(
            recurso =>
                recurso &&
                recurso.type === "player"
        );

    console.log(
        `[BM] Jugadores encontrados: ${jugadores.length}`
    );

    const nombreBuscado =
        normalizarNombre(nombre);

    const coincidencias =
        jugadores.filter(
            jugador => {

                const nombreBM =
                    jugador?.attributes?.name;

                return (
                    normalizarNombre(nombreBM) ===
                    nombreBuscado
                );
            }
        );

    console.log(
        `[BM] Coincidencias exactas: ${coincidencias.length}`
    );

    // =================================================
    // DEVOLVER LOS JUGADORES ENCONTRADOS
    // =================================================

    return coincidencias.map(
        jugador => ({
            battlemetricsId:
                String(jugador.id),

            nombre:
                jugador?.attributes?.name ||
                nombre
        })
    );
}

// =====================================================
// CREAR EMBED
// =====================================================

function crearEmbed(jugador) {

    const nombre =
        jugador.nombre;

    const battlemetricsURL =
        `https://www.battlemetrics.com/players/${jugador.battlemetricsId}`;

    const steamIDSearchURL =
        `https://www.steamid.com/search?q=${encodeURIComponent(nombre)}`;

    const embed =
        new EmbedBuilder()
            .setColor("#5865F2")
            .setTitle(
                `🎮 ${nombre}`
            )
            .addFields(
                {
                    name: "🔎 Name Search",
                    value:
                        `[Abrir búsqueda en SteamID.com](${steamIDSearchURL})`,
                    inline: false
                },

                {
                    name: "👤 BattleMetrics",
                    value:
                        `[${nombre}](${battlemetricsURL})`,
                    inline: false
                }
            )
            .setFooter({
                text:
                    `BattleMetrics ID: ${jugador.battlemetricsId}`
            });

    return embed;
}

// =====================================================
// COMANDO /STEAM
// =====================================================

module.exports = {

    data:
        new SlashCommandBuilder()
            .setName("steam")
            .setDescription(
                "Busca un nombre exacto en BattleMetrics"
            )
            .addStringOption(
                option =>
                    option
                        .setName("nombre")
                        .setDescription(
                            "Nombre exacto del jugador"
                        )
                        .setRequired(true)
            ),

    async execute(interaction) {

        const nombre =
            interaction.options.getString(
                "nombre"
            );

        console.log(
            "🎯 Ejecutando /steam"
        );

        console.log(
            `[STEAM] Entrada recibida: "${nombre}"`
        );

        await interaction.deferReply();

        try {

            // =================================================
            // BUSCAR EN BATTLEMETRICS
            // =================================================

            const jugadores =
                await buscarEnBattleMetrics(
                    nombre
                );

            // =================================================
            // SIN RESULTADOS
            // =================================================

            if (
                !jugadores.length
            ) {

                return interaction.editReply({
                    content:
                        `❌ No encontré ningún jugador con el nombre exacto **${nombre}** en el servidor configurado de BattleMetrics.`
                });
            }

            // =================================================
            // CREAR EMBEDS
            // =================================================

            const embeds =
                jugadores.map(
                    jugador =>
                        crearEmbed(jugador)
                );

            // =================================================
            // DISCORD: MÁXIMO 10 EMBEDS POR MENSAJE
            // =================================================

            const primerGrupo =
                embeds.slice(
                    0,
                    10
                );

            await interaction.editReply({
                content:
                    `🔎 Resultados para **${nombre}** — ${jugadores.length} coincidencia(s)`,

                embeds:
                    primerGrupo
            });

            // =================================================
            // RESULTADOS ADICIONALES
            // =================================================

            for (
                let i = 10;
                i < embeds.length;
                i += 10
            ) {

                await interaction.followUp({
                    embeds:
                        embeds.slice(
                            i,
                            i + 10
                        )
                });
            }

            console.log(
                "✅ /steam terminado"
            );

        } catch (error) {

            console.error(
                "=============================================="
            );

            console.error(
                "❌ ERROR EN /STEAM"
            );

            console.error(
                error.response?.data ||
                error.message ||
                error
            );

            console.error(
                "=============================================="
            );

            let mensaje =
                "❌ Ocurrió un error al consultar BattleMetrics.";

            if (
                error.response?.status === 401 ||
                error.response?.status === 403
            ) {

                mensaje =
                    "❌ BattleMetrics rechazó la solicitud. Revisa `BATTLEMETRICS_TOKEN`.";

            } else if (
                error.response?.status === 429
            ) {

                mensaje =
                    "⏳ BattleMetrics está limitando las solicitudes. Inténtalo nuevamente en unos momentos.";
            }

            try {

                await interaction.editReply({
                    content:
                        mensaje
                });

            } catch (discordError) {

                console.error(
                    "❌ No se pudo enviar el error a Discord:",
                    discordError.message
                );
            }
        }
    }
};