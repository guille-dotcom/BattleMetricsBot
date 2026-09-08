const ServerConfig =
    require("../models/ServerConfig");

const comandoPlanilla =
    require("../commands/planilla");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const INTERVALO_PLANILLA =
    60 * 60 * 1000;

// =====================================================
// REVISIÓN DE UN SERVIDOR
// =====================================================

async function revisarServidorAutomatico(
    client,
    config
) {

    const guildId =
        config.guildId;

    const channelId =
        config.planillaChannelId;

    if (!channelId) {

        return;

    }

    const guild =
        client.guilds.cache.get(
            guildId
        );

    if (!guild) {

        console.log(

            `[PLANILLA AUTO] Guild no encontrada: ${guildId}`

        );

        return;

    }

    const canal =
        guild.channels.cache.get(
            channelId
        );

    if (!canal) {

        console.log(

            `[PLANILLA AUTO] Canal no encontrado: ${channelId}`

        );

        return;

    }

    if (
        !canal.isTextBased()
    ) {

        console.log(

            `[PLANILLA AUTO] El canal no es de texto: ${channelId}`

        );

        return;

    }

    // =================================================
    // PERMISOS
    // =================================================

    const permisos =
        canal.permissionsFor(
            guild.members.me
        );

    if (
        !permisos ||
        !permisos.has("ViewChannel") ||
        !permisos.has("SendMessages")
    ) {

        console.log(

            `[PLANILLA AUTO] No tengo permisos en #${canal.name} | Guild: ${guild.name}`

        );

        return;

    }

    console.log(
        "----------------------------------------------"
    );

    console.log(

        `[PLANILLA AUTO] Revisando: ${guild.name}`

    );

    try {

        // =================================================
        // REVISAR PLANILLA
        // =================================================

        const resultado =
            await comandoPlanilla.revisarPlanilla(
                guildId
            );

        // =================================================
        // PLANILLA VACÍA
        // =================================================

        if (
            resultado.sinDatos
        ) {

            await canal.send(
                "❌ **Planilla automática:** la planilla está vacía."
            );

            return;

        }

        // =================================================
        // SIN JUGADORES VÁLIDOS
        // =================================================

        if (
            resultado.sinJugadores
        ) {

            await canal.send(
                "❌ **Planilla automática:** no encontré jugadores válidos en la planilla."
            );

            return;

        }

        // =================================================
        // NADIE EN SERVIDOR
        // =================================================

        if (
            !resultado.encontrados.length
        ) {

            const embed =
                comandoPlanilla.crearEmbedSinJugadores(
                    resultado
                );

            embed.setFooter({

                text:
                    "📋 Revisión automática cada 1 hora"

            });

            await canal.send({

                embeds: [
                    embed
                ]

            });

            console.log(
                "[PLANILLA AUTO] Nadie encontrado."
            );

            return;

        }

        // =================================================
        // JUGADORES ENCONTRADOS
        // =================================================

        const embeds =
            comandoPlanilla.crearEmbedsJugadores(

                resultado.encontrados,

                resultado.serverId

            );

        for (
            const embed
            of embeds
        ) {

            embed.setFooter({

                text:
                    "📋 Revisión automática cada 1 hora"

            });

            await canal.send({

                embeds: [
                    embed
                ]

            });

        }

        console.log(

            `[PLANILLA AUTO] 🟢 ${resultado.encontrados.length} jugador(es) encontrado(s).`

        );

    } catch (error) {

        console.error(

            `[PLANILLA AUTO] Error en ${guild.name}:`,

            error

        );

        try {

            await canal.send(

                "❌ **Error en la revisión automática de la planilla.**\n" +

                `\`${error.message || "Error desconocido"}\``

            );

        } catch (sendError) {

            console.error(

                "[PLANILLA AUTO] No pude enviar el error al canal:",

                sendError.message

            );

        }

    }

    console.log(
        "----------------------------------------------"
    );
}

// =====================================================
// REVISAR TODOS LOS SERVIDORES
// =====================================================

async function revisarPlanillasAutomaticas(
    client
) {

    try {

        const configs =
            await ServerConfig.find({

                planillaChannelId: {
                    $ne: null
                }

            });

        console.log(

            `[PLANILLA AUTO] Servidores configurados: ${configs.length}`

        );

        for (
            const config
            of configs
        ) {

            await revisarServidorAutomatico(

                client,

                config

            );

        }

    } catch (error) {

        console.error(

            "[PLANILLA AUTO] Error buscando configuraciones:",

            error

        );

    }
}

// =====================================================
// INICIAR SISTEMA AUTOMÁTICO
// =====================================================

function iniciarPlanillaAutomatica(
    client
) {

    console.log(
        "📋 Iniciando sistema automático de planilla..."
    );

    let revisando =
        false;

    // =================================================
    // PRIMERA REVISIÓN
    // =================================================

    setTimeout(
        async () => {

            if (revisando) {
                return;
            }

            revisando =
                true;

            try {

                console.log(
                    "📋 Ejecutando primera revisión automática de planillas..."
                );

                await revisarPlanillasAutomaticas(
                    client
                );

            } catch (error) {

                console.error(

                    "[PLANILLA AUTO] Error primera revisión:",

                    error

                );

            } finally {

                revisando =
                    false;

            }

        },

        10000
    );

    // =================================================
    // CADA 1 HORA
    // =================================================

    setInterval(

        async () => {

            if (revisando) {

                console.log(

                    "[PLANILLA AUTO] La revisión anterior todavía está ejecutándose."

                );

                return;

            }

            revisando =
                true;

            try {

                console.log(
                    "⏰ Ejecutando revisión automática de planillas..."
                );

                await revisarPlanillasAutomaticas(
                    client
                );

            } catch (error) {

                console.error(

                    "[PLANILLA AUTO] Error revisión automática:",

                    error

                );

            } finally {

                revisando =
                    false;

            }

        },

        INTERVALO_PLANILLA

    );

    console.log(
        "📋 Sistema automático de planilla iniciado. Intervalo: 1 hora."
    );
}

module.exports = {
    iniciarPlanillaAutomatica,
    revisarPlanillasAutomaticas
};