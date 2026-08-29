const {
    SlashCommandBuilder,
    ChannelType,
    PermissionFlagsBits
} = require("discord.js");

const ServerConfig = require("../models/ServerConfig");

module.exports = {

    data:
        new SlashCommandBuilder()

            .setName("configurar-tienda")

            .setDescription(
                "Configura el canal donde se publicará automáticamente la tienda semanal de Rust"
            )

            .addChannelOption(option =>
                option
                    .setName("canal")
                    .setDescription(
                        "Canal donde se publicará la tienda de Rust"
                    )
                    .addChannelTypes(
                        ChannelType.GuildText,
                        ChannelType.GuildAnnouncement
                    )
                    .setRequired(true)
            )

            .setDefaultMemberPermissions(
                PermissionFlagsBits.ManageGuild
            ),

    async execute(interaction) {

        await interaction.deferReply({
            ephemeral: true
        });

        try {

            const canal =
                interaction.options.getChannel(
                    "canal"
                );

            if (!canal) {

                return await interaction.editReply(
                    "❌ No se encontró el canal seleccionado."
                );

            }

            let config =
                await ServerConfig.findOne({
                    guildId:
                        interaction.guild.id
                });

            // ==========================================
            // SI NO EXISTE CONFIGURACIÓN
            // ==========================================

            if (!config) {

                return await interaction.editReply(
                    "❌ Este servidor todavía no tiene configurado un servidor de BattleMetrics.\n\n" +
                    "Primero utiliza **/configurar-servidor**."
                );

            }

            // ==========================================
            // GUARDAR CANAL
            // ==========================================

            config.rustStoreChannelId =
                canal.id;

            config.rustStoreEnabled =
                true;

            // No borramos la última semana publicada.
            // Esto evita duplicados si solamente
            // se cambia el canal.

            await config.save();

            // ==========================================
            // RESPUESTA
            // ==========================================

            return await interaction.editReply({

                content:
                    `✅ **Tienda de Rust configurada correctamente.**\n\n` +
                    `📢 Canal: ${canal}\n` +
                    `🛒 Publicación automática: **ACTIVADA**\n\n` +
                    `La tienda se comprobará automáticamente cada jueves.`

            });

        } catch (error) {

            console.error(
                "❌ ERROR CONFIGURANDO TIENDA:",
                error
            );

            return await interaction.editReply(
                "❌ Ocurrió un error al configurar la tienda de Rust."
            );

        }

    }

};