const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Vigilado = require('../models/Vigilado'); // Ajusta la ruta según tu estructura

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vigilar')
    .setDescription('Agrega un perfil de BattleMetrics a la lista de vigilancia')
    .addStringOption(option =>
      option.setName('id_bm')
        .setDescription('El ID numérico del perfil en BattleMetrics')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('alias')
        .setDescription('Un apodo para identificarlo (ej: StreamerX o Sospechoso)')
        .setRequired(true)),

  async execute(interaction) {
    const battlemetricsId = interaction.options.getString('id_bm');
    const alias = interaction.options.getString('alias');
    const guildId = interaction.guild.id;

    try {
      // Evitar duplicados en el mismo servidor
      const existe = await Vigilado.findOne({ guildId, battlemetricsId });
      if (existe) {
        return interaction.reply({ 
          content: `⚠️ El ID **${battlemetricsId}** ya está registrado bajo el alias **${existe.alias}**.`
        });
      }

      // Guardar en MongoDB
      await Vigilado.create({
        guildId,
        battlemetricsId,
        alias
      });

      await interaction.reply({ 
        content: `✅ ¡Perfil guardado con éxito!\n👤 **Alias:** ${alias}\n🔗 **ID BattleMetrics:** ${battlemetricsId}`
      });

    } catch (error) {
      console.error(error);
      await interaction.reply({ 
        content: '❌ Hubo un error al guardar el perfil en la base de datos.'
      });
    }
  },
};