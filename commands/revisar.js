const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const ServerConfig = require('../models/ServerConfig');
const Vigilado = require('../models/Vigilado');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('revisar')
    .setDescription('Revisa si hay algún perfil vigilado conectado en el servidor actual'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guild.id;

    try {
      // 1. Obtener el BattleMetrics Server ID configurado para este Discord
      const configServer = await ServerConfig.findOne({ guildId });
      const bmServerId = configServer?.battleMetricsServerId || configServer?.battlemetricsServerId || configServer?.serverId;

      if (!configServer || !bmServerId) {
        return interaction.editReply({ 
          content: '❌ No hay ningún servidor de Rust configurado. Usa `/configurar-servidor` primero.' 
        });
      }

      // 2. Obtener la lista de perfiles vigilados en este Discord
      const vigilados = await Vigilado.find({ guildId });
      if (vigilados.length === 0) {
        return interaction.editReply({ 
          content: '⚠️ No tienes ningún perfil guardado para vigilar. Usa `/vigilar` para añadir algunos.' 
        });
      }

      // 3. Consultar la API pública de BattleMetrics
      const url = `https://api.battlemetrics.com/servers/${bmServerId}?include=player`;
      
      // Si tienes un token en tus variables de entorno (.env), puedes descomentar la línea de headers de abajo:
      const options = {
        headers: {
          // 'Authorization': `Bearer ${process.env.BATTLEMETRICS_API_KEY}` 
        }
      };

      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error en BattleMetrics [${response.status} ${response.statusText}]:`, errorText);
        throw new Error(`BattleMetrics respondió con estado ${response.status}`);
      }

      const data = await response.json();

      // Extraer los IDs de los jugadores online
      const jugadoresOnlineIds = new Set();
      if (data.included) {
        data.included.forEach(item => {
          if (item.type === 'player') {
            jugadoresOnlineIds.add(item.id);
          }
        });
      }

      // 4. Cruzar los datos
      const encontradosOnline = [];
      const offline = [];

      for (const v of vigilados) {
        if (jugadoresOnlineIds.has(v.battlemetricsId)) {
          encontradosOnline.push(v.alias);
        } else {
          offline.push(v.alias);
        }
      }

      // 5. Crear el Embed con los resultados
      const embed = new EmbedBuilder()
        .setColor(encontradosOnline.length > 0 ? 0xE74C3C : 0x2ECC71)
        .setTitle('🔍 Resultado de la Revisión')
        .setDescription(`Servidor ID: \`${bmServerId}\``)
        .setTimestamp();

      if (encontradosOnline.length > 0) {
        embed.addFields({ 
          name: '🚨 ¡Detectados Online!', 
          value: encontradosOnline.map(alias => `• **${alias}**`).join('\n'),
          inline: false 
        });
      } else {
        embed.addFields({ 
          name: '🟢 Estado', 
          value: 'Ningún perfil vigilado se encuentra online en este momento.',
          inline: false 
        });
      }

      if (offline.length > 0 && encontradosOnline.length > 0) {
        embed.addFields({ 
          name: '💤 Offline / Fuera', 
          value: offline.map(alias => `• ${alias}`).join('\n'),
          inline: false 
        });
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error("Detalle del error en /revisar:", error);
      await interaction.editReply({ 
        content: '❌ Ocurrió un error al consultar la API de BattleMetrics o la base de datos.' 
      });
    }
  },
};