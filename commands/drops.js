
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

        // PUBLICAR CADA DROP EN UN MENSAJE INDEPENDIENTE
        if (subcomando === "rust") {
            await interaction.deferReply();

            try {
                const datos = await obtenerDropsOficiales();
                const embeds = crearEmbedsDrops(datos);

                if (!Array.isArray(embeds) || embeds.length === 0) {
                    return interaction.editReply({
                        content:
                            "ℹ️ No se encontraron Twitch Drops para mostrar.\n" +
                            "Fuente oficial: https://twitch.facepunch.com/",
                        embeds: []
                    });
                }

                console.log(
                    `🟣 /drops rust: publicando ${embeds.length} mensajes independientes`,
                    embeds.map(embed => embed.data.title)
                );

                // La primera recompensa utiliza la respuesta diferida.
                await interaction.editReply({
                    content: "",
                    embeds: [embeds[0]],
                    allowedMentions: { parse: [] }
                });

                // Cada recompensa adicional se envía en su propio mensaje.
                for (let i = 1; i < embeds.length; i++) {
                    await interaction.followUp({
                        content: "",
                        embeds: [embeds[i]],
                        allowedMentions: { parse: [] }
                    });
                }

                console.log(
                    `✅ /drops rust: publicados ${embeds.length} mensajes independientes`
                );

            } catch (error) {
                console.error("Error en /drops rust:", error);

                const mensaje =
                    "❌ No se pudieron leer o publicar los Twitch Drops oficiales. " +
                    "Inténtalo más tarde: https://twitch.facepunch.com/";

                if (interaction.replied || interaction.deferred) {
                    return interaction.followUp({
                        content: mensaje,
                        ephemeral: true
                    }).catch(() => null);
                }

                return interaction.reply({
                    content: mensaje,
                    ephemeral: true
                });
            }

            return;
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
            await interaction.deferReply({ ephemeral: true });

            try {
                const canal = interaction.options.getChannel("canal");

                if (!canal || !canal.isTextBased() || !canal.guild) {
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
                        messageId: null,
                        messageIds: [],
                        campaignSignature: null,
                        campaignName: null,
                        active: true
                    });
                } else if (monitor.channelId !== canal.id) {
                    // Los mensajes del canal anterior no se reutilizan.
                    monitor.channelId = canal.id;
                    monitor.messageId = null;
                    monitor.messageIds = [];
                    monitor.campaignSignature = null;
                    monitor.campaignName = null;
                    monitor.active = true;
                } else {
                    monitor.active = true;

                    if (!Array.isArray(monitor.messageIds)) {
                        monitor.messageIds = [];
                    }
                }

                await monitor.save();

                return interaction.editReply(
                    "✅ **Canal de Twitch Drops configurado.**\n\n" +
                    `📢 Canal: ${canal}\n` +
                    "🧩 Cada recompensa tendrá su propio mensaje.\n" +
                    "🔄 Revisión automática: cada 5 minutos.\n" +
                    "🟣 Fuente oficial: https://twitch.facepunch.com/\n\n" +
                    "RustLogix actualizará los mensajes existentes cuando cambien las recompensas."
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
            await interaction.deferReply({ ephemeral: true });

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
                    "RustLogix dejará de actualizar los Twitch Drops automáticamente.\n" +
                    "Los mensajes que ya estaban publicados no se eliminan.\n\n" +
                    "Puedes seguir usando `/drops rust` para consultar las recompensas oficiales."
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
