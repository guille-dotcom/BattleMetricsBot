const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const ServerConfig = require('../models/ServerConfig');
const Vigilado = require('../models/Vigilado');

const BM_API = "https://api.battlemetrics.com";

function getHeaders() {
    const token = process.env.BATTLEMETRICS_TOKEN;
    return token
        ? {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        }
        : {
            "Content-Type": "application/json"
        };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('revisar')
    .setDescription('Revisa si hay algún perfil vigilado conectado en el servidor actual'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guild.id;

    try {
      // 1. Obtener el BattleMetrics Server ID configurado
      const configServer = await ServerConfig.findOne({ guildId });
      const bmServerId = configServer?.battleMetricsServerId || configServer?.battlemetricsServerId || configServer?.serverId;

      if (!configServer || !bmServerId) {
        return interaction.editReply({ 
          content: '❌ No hay ningún servidor de Rust configurado. Usa `/configurar-servidor` primero.' 
        });
      }

      // 2. Obtener la lista de perfiles vigilados
      const vigilados = await Vigilado.find({ guildId });
      if (vigilados.length === 0) {
        return interaction.editReply({ 
          content: '⚠️ No tienes ningún perfil guardado para vigilar. Usa `/vigilar` para añadir algunos.' 
        });
      }

      // 3. Consultar los jugadores online usando Axios con el token correcto
      const response = await axios.get(`${BM_API}/players`, {
        headers: getHeaders(),
        params: {
          "filter[server]": bmServerId,
          "filter[online]": "true"
        },
        timeout: 10000
      });

      // Extraer los IDs de los jugadores online
      const idsOnlineEnServidor = new Set();
      const playersData = response.data?.data || [];
      for (const player of playersData) {
        idsOnlineEnServidor.add(player.id.toString());
      }

      // 4. Cruzar con los perfiles vigilados
      const encontradosOnline = [];
      const offline = [];

      for (const v of vigilados) {
        if (idsOnlineEnServidor.has(v.battlemetricsId.toString())) {
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
          value: 'Ningún perfil vigilado se encuentra online en este servidor.',
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
      console.error("Detalle del error en /revisar:", error.response?.data || error.message);
      await interaction.editReply({ 
        content: '❌ Ocurrió un error al procesar la revisión de perfiles en BattleMetrics.' 
      });
    }
  },
};