const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    ChannelType
} = require("discord.js");

const Birthday =
    require("../models/Birthday");

const BirthdayConfig =
    require("../models/BirthdayConfig");

// ============================================================
// CONFIGURACIÓN
// ============================================================

const MESES = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre"
];

// ============================================================
// VALIDAR FECHA
// ============================================================

function fechaValida(
    dia,
    mes,
    anio = 2000
) {

    const fecha =
        new Date(
            anio,
            mes - 1,
            dia
        );

    return (
        fecha.getFullYear() === anio &&
        fecha.getMonth() === mes - 1 &&
        fecha.getDate() === dia
    );
}

// ============================================================
// CALCULAR PRÓXIMO CUMPLEAÑOS
// ============================================================

function calcularProximoCumpleanos(
    dia,
    mes
) {

    const ahora =
        new Date();

    const hoy =
        new Date(
            ahora.getFullYear(),
            ahora.getMonth(),
            ahora.getDate()
        );

    let proximo =
        new Date(
            hoy.getFullYear(),
            mes - 1,
            dia
        );

    if (proximo < hoy) {

        proximo =
            new Date(
                hoy.getFullYear() + 1,
                mes - 1,
                dia
            );

    }

    const diferencia =
        proximo.getTime() -
        hoy.getTime();

    const dias =
        Math.round(
            diferencia /
            (1000 * 60 * 60 * 24)
        );

    return {
        fecha: proximo,
        dias
    };
}

// ============================================================
// FORMATEAR TIEMPO
// ============================================================

function textoDias(
    dias
) {

    if (dias === 0) {
        return "🎂 **¡Hoy!**";
    }

    if (dias === 1) {
        return "🎈 mañana";
    }

    return `en ${dias} días`;
}

// ============================================================
// COMANDO
// ============================================================

module.exports = {

    data:
        new SlashCommandBuilder()

            .setName("cumpleanos")

            .setDescription(
                "Sistema de cumpleaños de RustLogix"
            )

            // =================================================
            // REGISTRAR
            // =================================================

            .addSubcommand(
                subcommand =>

                    subcommand

                        .setName("registrar")

                        .setDescription(
                            "Registra o actualiza un cumpleaños"
                        )

                        // IMPORTANTE:
                        // Las opciones obligatorias deben ir
                        // antes de las opcionales en Discord.

                        .addIntegerOption(
                            option =>

                                option

                                    .setName("dia")

                                    .setDescription(
                                        "Día del cumpleaños"
                                    )

                                    .setRequired(true)

                                    .setMinValue(1)

                                    .setMaxValue(31)
                        )

                        .addIntegerOption(
                            option =>

                                option

                                    .setName("mes")

                                    .setDescription(
                                        "Mes del cumpleaños"
                                    )

                                    .setRequired(true)

                                    .setMinValue(1)

                                    .setMaxValue(12)
                        )

                        .addUserOption(
                            option =>

                                option

                                    .setName("usuario")

                                    .setDescription(
                                        "Usuario cuyo cumpleaños quieres registrar"
                                    )

                                    .setRequired(false)
                        )

                        .addIntegerOption(
                            option =>

                                option

                                    .setName("año")

                                    .setDescription(
                                        "Año de nacimiento (opcional)"
                                    )

                                    .setRequired(false)

                                    .setMinValue(1900)

                                    .setMaxValue(
                                        new Date()
                                            .getFullYear()
                                    )
                        )
            )

            // =================================================
            // ELIMINAR
            // =================================================

            .addSubcommand(
                subcommand =>

                    subcommand

                        .setName("eliminar")

                        .setDescription(
                            "Elimina un cumpleaños registrado"
                        )

                        .addUserOption(
                            option =>

                                option

                                    .setName("usuario")

                                    .setDescription(
                                        "Usuario cuyo cumpleaños quieres eliminar"
                                    )

                                    .setRequired(false)
                        )
            )

            // =================================================
            // LISTA
            // =================================================

            .addSubcommand(
                subcommand =>

                    subcommand

                        .setName("lista")

                        .setDescription(
                            "Muestra los próximos cumpleaños"
                        )
            )

            // =================================================
            // HOY
            // =================================================

            .addSubcommand(
                subcommand =>

                    subcommand

                        .setName("hoy")

                        .setDescription(
                            "Muestra quién cumple años hoy"
                        )
            )

            // =================================================
            // CONFIGURAR
            // =================================================

            .addSubcommand(
                subcommand =>

                    subcommand

                        .setName("configurar")

                        .setDescription(
                            "Configura el canal de cumpleaños"
                        )

                        .addChannelOption(
                            option =>

                                option

                                    .setName("canal")

                                    .setDescription(
                                        "Canal donde se enviarán las felicitaciones"
                                    )

                                    .addChannelTypes(
                                        ChannelType.GuildText
                                    )

                                    .setRequired(true)
                        )
            ),

    // =========================================================
    // EXECUTE
    // =========================================================

    async execute(
        interaction
    ) {

        if (!interaction.guild) {

            return interaction.reply({
                content:
                    "❌ Este comando solo puede utilizarse dentro de un servidor.",
                ephemeral:
                    true
            });

        }

        const subcommand =
            interaction.options.getSubcommand();

        // =====================================================
        // REGISTRAR
        // =====================================================

        if (
            subcommand ===
            "registrar"
        ) {

            const dia =
                interaction.options.getInteger(
                    "dia"
                );

            const mes =
                interaction.options.getInteger(
                    "mes"
                );

            const anio =
                interaction.options.getInteger(
                    "año"
                );

            // Si no se especifica usuario,
            // se registra el propio usuario.
            const usuario =
                interaction.options.getUser(
                    "usuario"
                ) ||
                interaction.user;

            // ================================================
            // VALIDAR FECHA
            // ================================================

            const anioValidacion =
                anio ||
                2000;

            if (
                !fechaValida(
                    dia,
                    mes,
                    anioValidacion
                )
            ) {

                return interaction.reply({
                    content:
                        "❌ La fecha indicada no es válida.",
                    ephemeral:
                        true
                });

            }

            // ================================================
            // VALIDAR AÑO DE NACIMIENTO
            // ================================================

            if (anio) {

                const fechaNacimiento =
                    new Date(
                        anio,
                        mes - 1,
                        dia
                    );

                const hoy =
                    new Date();

                if (
                    fechaNacimiento >
                    hoy
                ) {

                    return interaction.reply({
                        content:
                            "❌ La fecha de nacimiento no puede estar en el futuro.",
                        ephemeral:
                            true
                    });

                }

            }

            // ================================================
            // COMPROBAR QUE EL USUARIO PERTENECE AL SERVIDOR
            // ================================================

            try {

                const miembro =
                    await interaction.guild.members.fetch(
                        usuario.id
                    );

                if (!miembro) {

                    return interaction.reply({
                        content:
                            "❌ Ese usuario no pertenece a este servidor.",
                        ephemeral:
                            true
                    });

                }

            } catch (error) {

                return interaction.reply({
                    content:
                        "❌ Ese usuario no pertenece a este servidor.",
                    ephemeral:
                        true
                });

            }

            // ================================================
            // GUARDAR
            // ================================================

            try {

                const existente =
                    await Birthday.findOne({

                        guildId:
                            interaction.guild.id,

                        userId:
                            usuario.id

                    });

                if (existente) {

                    existente.dia =
                        dia;

                    existente.mes =
                        mes;

                    existente.anio =
                        anio ||
                        null;

                    // Si se modifica el cumpleaños,
                    // permitimos que vuelva a felicitarse
                    // este año si corresponde.
                    existente.ultimoAnioFelicitado =
                        null;

                    await existente.save();

                } else {

                    await Birthday.create({

                        guildId:
                            interaction.guild.id,

                        userId:
                            usuario.id,

                        dia,

                        mes,

                        anio:
                            anio ||
                            null,

                        ultimoAnioFelicitado:
                            null

                    });

                }

                // ============================================
                // EMBED DE CONFIRMACIÓN
                // ============================================

                const esPropio =
                    usuario.id ===
                    interaction.user.id;

                const embed =
                    new EmbedBuilder()

                        .setColor(
                            0xFF69B4
                        )

                        .setTitle(
                            "🎂 Cumpleaños registrado"
                        )

                        .setDescription(
                            esPropio
                                ? `El cumpleaños de <@${usuario.id}> se ha guardado correctamente.`
                                : `El cumpleaños de <@${usuario.id}> se ha guardado correctamente.`
                        )

                        .addFields(

                            {
                                name:
                                    "📅 Fecha",

                                value:
                                    `${dia} de ${MESES[mes - 1]}`,

                                inline:
                                    true
                            },

                            {
                                name:
                                    "🎈 Año",

                                value:
                                    anio
                                        ? String(anio)
                                        : "No indicado",

                                inline:
                                    true
                            }

                        )

                        .setFooter({
                            text:
                                "RustLogix • Cumpleaños"
                        })

                        .setTimestamp();

                return interaction.reply({
                    embeds: [
                        embed
                    ],

                    ephemeral:
                        true
                });

            } catch (error) {

                console.error(
                    "❌ Error registrando cumpleaños:",
                    error
                );

                return interaction.reply({
                    content:
                        "❌ Ocurrió un error guardando el cumpleaños.",
                    ephemeral:
                        true
                });

            }

        }

        // =====================================================
        // ELIMINAR
        // =====================================================

        if (
            subcommand ===
            "eliminar"
        ) {

            const usuario =
                interaction.options.getUser(
                    "usuario"
                ) ||
                interaction.user;

            try {

                const eliminado =
                    await Birthday.findOneAndDelete({

                        guildId:
                            interaction.guild.id,

                        userId:
                            usuario.id

                    });

                if (!eliminado) {

                    return interaction.reply({
                        content:
                            `❌ <@${usuario.id}> no tiene ningún cumpleaños registrado.`,
                        ephemeral:
                            true
                    });

                }

                return interaction.reply({
                    content:
                        `🗑️ El cumpleaños de <@${usuario.id}> ha sido eliminado correctamente.`,
                    ephemeral:
                        true
                });

            } catch (error) {

                console.error(
                    "❌ Error eliminando cumpleaños:",
                    error
                );

                return interaction.reply({
                    content:
                        "❌ Ocurrió un error eliminando el cumpleaños.",
                    ephemeral:
                        true
                });

            }

        }

        // =====================================================
        // CONFIGURAR CANAL
        // =====================================================

        if (
            subcommand ===
            "configurar"
        ) {

            if (
                !interaction.member.permissions.has(
                    PermissionFlagsBits.ManageGuild
                )
            ) {

                return interaction.reply({
                    content:
                        "❌ Necesitas el permiso **Gestionar servidor** para configurar los cumpleaños.",
                    ephemeral:
                        true
                });

            }

            const canal =
                interaction.options.getChannel(
                    "canal"
                );

            try {

                await BirthdayConfig.findOneAndUpdate(

                    {
                        guildId:
                            interaction.guild.id
                    },

                    {
                        guildId:
                            interaction.guild.id,

                        channelId:
                            canal.id
                    },

                    {
                        upsert:
                            true,

                        new:
                            true,

                        setDefaultsOnInsert:
                            true
                    }

                );

                const embed =
                    new EmbedBuilder()

                        .setColor(
                            0x57F287
                        )

                        .setTitle(
                            "🎂 Cumpleaños configurados"
                        )

                        .setDescription(
                            `Las felicitaciones automáticas se enviarán en ${canal}.`
                        )

                        .setFooter({
                            text:
                                "RustLogix • Cumpleaños"
                        })

                        .setTimestamp();

                return interaction.reply({
                    embeds: [
                        embed
                    ],

                    ephemeral:
                        true
                });

            } catch (error) {

                console.error(
                    "❌ Error configurando cumpleaños:",
                    error
                );

                return interaction.reply({
                    content:
                        "❌ Ocurrió un error configurando el canal.",
                    ephemeral:
                        true
                });

            }

        }

        // =====================================================
        // HOY
        // =====================================================

        if (
            subcommand ===
            "hoy"
        ) {

            try {

                const ahora =
                    new Date();

                const dia =
                    ahora.getDate();

                const mes =
                    ahora.getMonth() + 1;

                const cumpleaños =
                    await Birthday.find({

                        guildId:
                            interaction.guild.id,

                        dia,

                        mes

                    });

                if (
                    cumpleaños.length ===
                    0
                ) {

                    return interaction.reply({
                        content:
                            "🎂 Hoy no hay ningún cumpleaños registrado."
                    });

                }

                const personas =
                    cumpleaños

                        .map(
                            cumple =>
                                `🎈 <@${cumple.userId}>`
                        )

                        .join(
                            "\n"
                        );

                const embed =
                    new EmbedBuilder()

                        .setColor(
                            0xFF69B4
                        )

                        .setTitle(
                            "🎂 Cumpleaños de hoy"
                        )

                        .setDescription(
                            personas
                        )

                        .setFooter({
                            text:
                                "RustLogix • Cumpleaños"
                        })

                        .setTimestamp();

                return interaction.reply({
                    embeds: [
                        embed
                    ]
                });

            } catch (error) {

                console.error(
                    "❌ Error consultando cumpleaños de hoy:",
                    error
                );

                return interaction.reply({
                    content:
                        "❌ Ocurrió un error consultando los cumpleaños.",
                    ephemeral:
                        true
                });

            }

        }

        // =====================================================
        // LISTA
        // =====================================================

        if (
            subcommand ===
            "lista"
        ) {

            try {

                const cumpleaños =
                    await Birthday.find({

                        guildId:
                            interaction.guild.id

                    });

                if (
                    cumpleaños.length ===
                    0
                ) {

                    return interaction.reply({
                        content:
                            "🎂 Todavía no hay cumpleaños registrados en este servidor."
                    });

                }

                const lista =
                    cumpleaños

                        .map(
                            cumple => {

                                const proximo =
                                    calcularProximoCumpleanos(
                                        cumple.dia,
                                        cumple.mes
                                    );

                                return {

                                    ...cumple.toObject(),

                                    dias:
                                        proximo.dias,

                                    fecha:
                                        proximo.fecha

                                };

                            }
                        )

                        .sort(
                            (a, b) =>
                                a.dias -
                                b.dias
                        );

                // Discord limita la descripción del embed.
                // Mostramos los próximos 25.
                const proximos =
                    lista.slice(
                        0,
                        25
                    );

                const texto =
                    proximos

                        .map(
                            cumple => {

                                return (
                                    `🎈 <@${cumple.userId}>\n` +
                                    `📅 ${cumple.dia} de ${MESES[cumple.mes - 1]} — ` +
                                    `${textoDias(cumple.dias)}`
                                );

                            }
                        )

                        .join(
                            "\n\n"
                        );

                const embed =
                    new EmbedBuilder()

                        .setColor(
                            0xFF69B4
                        )

                        .setTitle(
                            "🎂 Próximos cumpleaños"
                        )

                        .setDescription(
                            texto
                        )

                        .setFooter({

                            text:
                                `RustLogix • ${cumpleaños.length} cumpleaños registrados`

                        })

                        .setTimestamp();

                return interaction.reply({
                    embeds: [
                        embed
                    ]
                });

            } catch (error) {

                console.error(
                    "❌ Error mostrando cumpleaños:",
                    error
                );

                return interaction.reply({
                    content:
                        "❌ Ocurrió un error consultando los cumpleaños.",
                    ephemeral:
                        true
                });

            }

        }

    }

};