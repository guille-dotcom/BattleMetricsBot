const { SlashCommandBuilder } = require('discord.js');
const Vigilado = require('../models/Vigilado');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vigilados')
    .setDescription('Gestiona la lista de perfiles vigilados')
    .addSubcommand(subcommand =>
      subcommand
        .setName('eliminar')
        .setDescription('Elimina un perfil de la lista de vigilancia')
        .addStringOption(option =>
          option.setName('id_bm')
            .setDescription('El ID de BattleMetrics del perfil a eliminar')
            .setRequired(true))),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'eliminar') {
      const battlemetricsId = interaction.options.getString('id_bm');
      const guildId = interaction.guild.id;

      try {
        const resultado = await Vigilado.findOneAndDelete({ guildId, battlemetricsId });

        if (!resultado) {
          return interaction.reply({ 
            content: `❌ No se encontró ningún perfil con el ID **${battlemetricsId}** en este servidor.`, 
            ephemeral: true 
          });
        }

        await interaction.reply({ 
          content: `🗑️ El perfil **${resultado.alias}** (ID: ${battlemetricsId}) fue eliminado de la lista de vigilancia.`, 
          ephemeral: true 
        });

      } catch (error) {
        console.error(error);
        await interaction.reply({ content: '❌ Ocurrió un error al intentar eliminar el perfil.', ephemeral: true });
      }
    }
  },
};