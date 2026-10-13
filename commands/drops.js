const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType
} = require("discord.js");

const RustDropsMonitor = require("../models/RustDropsMonitor");

const {
    obtenerDropsOficiales,
    crearEmbedsDrops
} = require("../services/twitchDropsService");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("drops")
        .setDescription("Consulta y configura los Twitch Drops oficiales de Rust")

        .addSubcommand(subcommand =>
            subcommand
                .setName("rust")
                .setDescription("Muestra los Twitch Drops oficiales de Facepunch")
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName("configurar")
                .setDescription("Configura el canal de anuncios automáticos")
                .addChannelOption(option =>
                    option
                        .setName("canal")
                        .setDescription("Canal donde se publicarán y actualizarán los Drops")
                        .addChannelTypes(
                            ChannelType.GuildText,
                            ChannelType.GuildAnnouncement
                        )
                        .setRequired(true)
                )
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName("quitar-canal")
                .setDescription("Desactiva los anuncios automáticos de Twitch Drops")
        ),

    async execute(interaction) {
        const subcomando = interaction.options.getSubcommand();

        if (!interaction.guild) {
            return interaction.reply({
                content: "❌ Este comando debe usarse dentro de un servidor de Discord.",
                ephemeral: true
            });
        }

        // CONSULTAR LOS DROPS OFICIALES
        if (subcomando === "rust") {
            await interaction.deferReply();

            try {
                const datos = await obtenerDropsOficiales();
                const embeds = crearEmbedsDrops(datos);

                if (!Array.isArray(embeds) || embeds.length === 0) {
                    return interaction.editReply({
                        content:
                            "ℹ️ No se encontraron Twitch Drops para mostrar.\n" +
                            "Consulta la fuente oficial: https://twitch.facepunch.com/",
                        embeds: []
                    });
                }

                console.log(
                    `🟣 /drops rust: enviando ${embeds.length} embeds`,
                    embeds.map(embed => embed.data.title)
                );

                return interaction.editReply({
                    content: "",
                    embeds: embeds.slice(0, 10),
                    allowedMentions: {
                        parse: []
                    }
                });
            } catch (error) {
                console.error("Error en /drops rust:", error);

                return interaction.editReply({
                    content:
                        "❌ No se pudieron leer los Twitch Drops oficiales. " +
                        "No se mostrarán datos inventados. Inténtalo más tarde: " +
                        "https://twitch.facepunch.com/",
                    embeds: []
                });
            }
        }

        // COMPROBAR PERMISOS
        if (
            !interaction.memberPermissions?.has(
                PermissionFlagsBits.ManageGuild
            )
        ) {
            return interaction.reply({
                content:
                    "❌ Necesitas el permiso **Gestionar servidor** para cambiar esta configuración.",
                ephemeral: true
            });
        }

        // CONFIGURAR CANAL AUTOMÁTICO
        if (subcomando === "configurar") {
            await interaction.deferReply({
                ephemeral: true
            });

            try {
                const canal = interaction.options.getChannel("canal");

                if (
                    !canal ||
                    !canal.isTextBased() ||
                    !canal.guild
                ) {
                    return interaction.editReply(
                        "❌ Selecciona un canal de texto válido de este servidor."
                    );
                }

                let monitor = await RustDropsMonitor.findOne({
                    guildId: interaction.guild.id
                });

                if (!monitor) {
                    monitor = new RustDropsMonitor({
                        guildId: interaction.guild.id,
                        channelId: canal.id,
                        active: true
                    });
                } else if (monitor.channelId !== canal.id) {
                    monitor.channelId = canal.id;
                    monitor.messageId = null;
                    monitor.campaignSignature = null;
                    monitor.campaignName = null;
                    monitor.active = true;
                } else {
                    monitor.active = true;
                }

                await monitor.save();

                return interaction.editReply(
                    `✅ **Canal de Twitch Drops configurado.**\n\n` +
                    `📢 Canal: ${canal}\n` +
                    `🔄 Revisión automática: cada 5 minutos.\n` +
                    `🟣 Fuente: https://twitch.facepunch.com/\n\n` +
                    `El bot publicará el anuncio oficial y actualizará ese mismo mensaje cuando detecte cambios.`
                );
            } catch (error) {
                console.error("Error en /drops configurar:", error);

                return interaction.editReply(
                    "❌ No se pudo guardar la configuración del canal."
                );
            }
        }

        // DESACTIVAR ANUNCIOS AUTOMÁTICOS
        if (subcomando === "quitar-canal") {
            await interaction.deferReply({
                ephemeral: true
            });

            try {
                const resultado = await RustDropsMonitor.deleteOne({
                    guildId: interaction.guild.id
                });

                if (resultado.deletedCount === 0) {
                    return interaction.editReply(
                        "ℹ️ Este servidor no tiene un canal automático de Twitch Drops configurado."
                    );
                }

                return interaction.editReply(
                    "🔕 **Publicaciones automáticas desactivadas.**\n\n" +
                    "RustLogix dejará de publicar y actualizar los Twitch Drops en este servidor.\n" +
                    "El mensaje que ya estaba publicado no se elimina.\n\n" +
                    "Puedes seguir usando `/drops rust` para consultar la página oficial."
                );
            } catch (error) {
                console.error("Error en /drops quitar-canal:", error);

                return interaction.editReply(
                    "❌ No se pudo quitar la configuración del canal."
                );
            }
        }
    }
};