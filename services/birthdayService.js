const {
    EmbedBuilder
} = require("discord.js");

const Birthday =
    require("../models/Birthday");

const BirthdayConfig =
    require("../models/BirthdayConfig");

// ============================================================
// CONFIGURACIÓN
// ============================================================

// Revisamos cada 30 minutos.
// No significa que mande mensajes cada 30 minutos.
// ultimoAnioFelicitado evita duplicados.
const INTERVALO_REVISION =
    30 * 60 * 1000;

let revisionEnCurso =
    false;

// ============================================================
// OBTENER FECHA
// ============================================================

function obtenerFechaActual() {

    const ahora =
        new Date();

    return {
        dia:
            ahora.getDate(),

        mes:
            ahora.getMonth() + 1,

        anio:
            ahora.getFullYear()
    };
}

// ============================================================
// CREAR EMBED
// ============================================================

function crearEmbedCumpleanos(
    cumple,
    usuario,
    anioActual
) {

    let descripcion =
        `🥳 ¡Hoy es el cumpleaños de <@${cumple.userId}>!\n\n`;

    if (cumple.anio) {

        const edad =
            anioActual -
            cumple.anio;

        descripcion +=
            `🎈 ¡Cumple **${edad} años**!\n\n`;

    }

    descripcion +=
        `🎉 ¡Todo **RustLogix** te desea un muy feliz cumpleaños!\n\n` +
        `🎁 ¡Que tengas un gran día!`;

    const embed =
        new EmbedBuilder()

            .setColor(
                0xFF69B4
            )

            .setTitle(
                "🎂 ¡Feliz cumpleaños!"
            )

            .setDescription(
                descripcion
            )

            .setFooter({
                text:
                    "RustLogix • Cumpleaños"
            })

            .setTimestamp();

    if (
        usuario &&
        usuario.displayAvatarURL
    ) {

        embed.setThumbnail(
            usuario.displayAvatarURL({
                size: 256
            })
        );

    }

    return embed;
}

// ============================================================
// REVISAR CUMPLEAÑOS
// ============================================================

async function revisarCumpleanos(
    client
) {

    if (revisionEnCurso) {
        return;
    }

    revisionEnCurso =
        true;

    try {

        const {
            dia,
            mes,
            anio
        } =
            obtenerFechaActual();

        console.log(
            `🎂 Revisando cumpleaños: ${dia}/${mes}/${anio}`
        );

        const cumpleaños =
            await Birthday.find({
                dia,
                mes,
                ultimoAnioFelicitado: {
                    $ne: anio
                }
            });

        if (
            cumpleaños.length === 0
        ) {

            console.log(
                "🎂 No hay cumpleaños pendientes hoy."
            );

            return;
        }

        console.log(
            `🎂 Cumpleaños pendientes: ${cumpleaños.length}`
        );

        for (
            const cumple of cumpleaños
        ) {

            try {

                // =============================================
                // OBTENER CONFIGURACIÓN
                // =============================================

                const config =
                    await BirthdayConfig.findOne({
                        guildId:
                            cumple.guildId
                    });

                if (
                    !config ||
                    !config.channelId
                ) {

                    console.log(
                        `⚠️ Servidor ${cumple.guildId} sin canal de cumpleaños configurado.`
                    );

                    continue;
                }

                // =============================================
                // OBTENER SERVIDOR
                // =============================================

                let guild =
                    client.guilds.cache.get(
                        cumple.guildId
                    );

                if (!guild) {

                    try {

                        guild =
                            await client.guilds.fetch(
                                cumple.guildId
                            );

                    } catch (error) {

                        console.log(
                            `⚠️ No se encontró servidor ${cumple.guildId}.`
                        );

                        continue;
                    }

                }

                // =============================================
                // OBTENER CANAL
                // =============================================

                let canal =
                    guild.channels.cache.get(
                        config.channelId
                    );

                if (!canal) {

                    try {

                        canal =
                            await guild.channels.fetch(
                                config.channelId
                            );

                    } catch (error) {

                        console.log(
                            `⚠️ No se encontró canal ${config.channelId}.`
                        );

                        continue;
                    }

                }

                if (
                    !canal ||
                    !canal.isTextBased()
                ) {

                    console.log(
                        `⚠️ Canal de cumpleaños inválido en ${guild.name}.`
                    );

                    continue;
                }

                // =============================================
                // OBTENER USUARIO
                // =============================================

                let usuario =
                    null;

                try {

                    usuario =
                        await client.users.fetch(
                            cumple.userId
                        );

                } catch (error) {

                    console.log(
                        `⚠️ No se pudo obtener usuario ${cumple.userId}.`
                    );

                }

                // =============================================
                // CREAR EMBED
                // =============================================

                const embed =
                    crearEmbedCumpleanos(
                        cumple,
                        usuario,
                        anio
                    );

                // =============================================
                // ENVIAR FELICITACIÓN
                // =============================================

                await canal.send({
                    content:
                        `🎉 <@${cumple.userId}> 🎉`,

                    embeds: [
                        embed
                    ],

                    allowedMentions: {
                        users: [
                            cumple.userId
                        ]
                    }
                });

                // =============================================
                // MARCAR COMO FELICITADO
                // =============================================

                cumple.ultimoAnioFelicitado =
                    anio;

                await cumple.save();

                console.log(
                    `🎂 Felicitación enviada a ${cumple.userId} en ${guild.name}.`
                );

            } catch (error) {

                console.error(
                    `❌ Error procesando cumpleaños ${cumple.userId}:`,
                    error
                );

            }

        }

    } catch (error) {

        console.error(
            "❌ Error revisando cumpleaños:",
            error
        );

    } finally {

        revisionEnCurso =
            false;

    }

}

// ============================================================
// INICIAR SISTEMA AUTOMÁTICO
// ============================================================

function iniciarCumpleanosAutomaticos(
    client
) {

    console.log(
        "🎂 Sistema automático de cumpleaños iniciado."
    );

    // Primera revisión al iniciar.
    revisarCumpleanos(
        client
    ).catch(
        error => {

            console.error(
                "❌ Error en revisión inicial de cumpleaños:",
                error
            );

        }
    );

    // Revisiones posteriores.
    setInterval(
        () => {

            revisarCumpleanos(
                client
            ).catch(
                error => {

                    console.error(
                        "❌ Error automático de cumpleaños:",
                        error
                    );

                }
            );

        },
        INTERVALO_REVISION
    );

}

module.exports = {
    iniciarCumpleanosAutomaticos,
    revisarCumpleanos
};