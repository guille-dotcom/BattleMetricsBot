const axios = require('axios');
const cheerio = require('cheerio');
const { EmbedBuilder } = require('discord.js');
const RustDropsMonitor = require('../models/RustDropsMonitor');

class RustDropsService {
  constructor(client) {
    this.client = client;
    this.facepunchUrl = 'https://twitch.facepunch.com/';
    this.twitchClientId = process.env.TWITCH_CLIENT_ID;
    this.twitchClientSecret = process.env.TWITCH_CLIENT_SECRET;
  }

  /**
   * Obtiene un token de acceso de la API de Twitch (Client Credentials Grant)
   */
  async getTwitchAccessToken() {
    try {
      const response = await axios.post(
        `https://id.twitch.tv/oauth2/token?client_id=${this.twitchClientId}&client_secret=${this.twitchClientSecret}&grant_type=client_credentials`
      );
      return response.data.access_token;
    } catch (error) {
      console.error('[RustDropsService] Error obteniendo token de Twitch:', error.message);
      return null;
    }
  }

  /**
   * Verifica en la API de Twitch qué streamers están en directo jugando Rust
   */
  async checkTwitchStreamersStatus(monitor) {
    if (!this.twitchClientId || !this.twitchClientSecret) {
      console.warn('[RustDropsService] Faltan las credenciales de Twitch (TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET)');
      return;
    }

    const accessToken = await this.getTwitchAccessToken();
    if (!accessToken) return;

    // Recopilar todos los logins únicos de los drops de streamers
    const allLogins = [];
    monitor.drops.forEach(drop => {
      if (drop.tipo === 'streamer' && drop.canales) {
        drop.canales.forEach(c => {
          if (!allLogins.includes(c.login)) allLogins.includes(c.login) || allLogins.push(c.login);
        });
      }
    });

    if (allLogins.length === 0) return;

    // La API de Twitch permite consultar hasta 100 usuarios por petición usando ?user_login=
    // Si tienes muchos, puedes dividirlos en bloques de 100. Aquí consultamos los primeros 100.
    const chunkLogins = allLogins.slice(0, 100);
    const queryParams = chunkLogins.map(login => `user_login=${login}`).join('&');

    try {
      const response = await axios.get(`https://api.twitch.tv/helix/streams?${queryParams}`, {
        headers: {
          'Client-ID': this.twitchClientId,
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const activeStreams = response.data.data; // Streams que están en vivo ahora mismo

      // Actualizar el estado booleano dentro del documento del monitor
      let changed = false;
      monitor.drops.forEach(drop => {
        if (drop.tipo === 'streamer' && drop.canales) {
          drop.canales.forEach(canal => {
            // Buscar si este canal está en la lista de streams activos y si su game_id es Rust (26349)
            const streamInfo = activeStreams.find(s => s.user_login.toLowerCase() === canal.login.toLowerCase());
            const isOnlineRust = streamInfo && streamInfo.game_id === '26349';

            if (canal.online !== isOnlineRust) {
              canal.online = isOnlineRust;
              changed = true;
            }
          });
        }
      });

      if (changed) {
        monitor.ultimaRevision = new Date();
        await monitor.save();
        await this.updateDiscordMessages(monitor);
      }
    } catch (error) {
      console.error('[RustDropsService] Error consultando streams de Twitch:', error.message);
    }
  }

  /**
   * Extrae los drops de Facepunch analizando su HTML real
   */
  async scrapeFacepunch() {
    try {
      const { data } = await axios.get(this.facepunchUrl, {
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
        }
      });
      const $ = cheerio.load(data);

      const campaignName = $('.current-campaign h1, .campaign-title, header h1').first().text().trim() || 'Rust Twitch Drops';
      const drops = [];

      // 1. Extraer Drops Generales
      $('.section-header.generic, .section:has(.generic)').next('.drops-container').find('.drop-box, a.drop-box').each((_, el) => {
        const nombre = $(el).find('.drop-box-header, .title, h3').text().trim() || 'Drop General';
        const imagen = $(el).find('img').attr('src');
        const watchTimeText = $(el).find('.watch-time, .time, .drop-lock').text().trim();
        const horas = this.parseHours(watchTimeText);

        if (nombre) {
          drops.push({
            tipo: 'general',
            nombre,
            horas,
            imagen: this.formatImageUrl(imagen),
            canales: []
          });
        }
      });

      // 2. Extraer Drops de Streamers
      $('.streamer-drops .drop-box, .streamer-drop').each((_, el) => {
        const nombre = $(el).find('.drop-box-header, .title, h3').text().trim() || 'Drop de Streamer';
        const imagen = $(el).find('img').attr('src');
        const watchTimeText = $(el).find('.watch-time, .time').text().trim();
        const horas = this.parseHours(watchTimeText);

        const canales = [];
        $(el).find('a[href*="twitch.tv"]').each((_, aEl) => {
          const href = $(aEl).attr('href') || '';
          const displayName = $(aEl).text().trim();
          
          const match = href.match(/twitch\.tv\/([a-zA-Z0-9_]+)/);
          if (match && match[1]) {
            const login = match[1].toLowerCase();
            canales.push({
              login,
              displayName: displayName || login,
              online: false
            });
          }
        });

        if (nombre) {
          drops.push({
            tipo: 'streamer',
            nombre,
            horas,
            imagen: this.formatImageUrl(imagen),
            canales
          });
        }
      });

      return {
        campaignKey: `rust-drops-${Date.now()}`,
        campaignName,
        fechaInicio: new Date().toISOString().split('T')[0],
        fechaFin: null,
        drops
      };

    } catch (error) {
      console.error('[RustDropsService] Error haciendo scrape de Facepunch:', error.message);
      return null;
    }
  }

  /**
   * Genera los Embeds para Discord basados en el documento de MongoDB
   */
  buildEmbeds(monitorDoc) {
    const embeds = [];

    // Embed principal de la campaña
    const mainEmbed = new EmbedBuilder()
      .setTitle(`🎁 Rust Twitch Drops - ${monitorDoc.campaignName || 'Campaña Activa'}`)
      .setURL(this.facepunchUrl)
      .setColor(0xce422b)
      .addFields(
        { name: '📅 Vigencia', value: `${monitorDoc.fechaInicio || 'N/A'} al ${monitorDoc.fechaFin || 'N/A'}`, inline: false }
      )
      .setTimestamp();
    
    embeds.push(mainEmbed);

    // Embeds por cada Drop registrado
    for (const drop of monitorDoc.drops) {
      const dropEmbed = new EmbedBuilder()
        .setTitle(`${drop.tipo === 'general' ? '🌐 [General]' : '👤 [Streamer]'} ${drop.nombre}`)
        .setColor(drop.tipo === 'general' ? 0x2b82ce : 0x57f287)
        .addFields({ name: '⏳ Tiempo requerido', value: `${drop.horas} hora(s)`, inline: true });

      if (drop.imagen) {
        dropEmbed.setImage(drop.imagen);
      }

      if (drop.tipo === 'streamer' && drop.canales && drop.canales.length > 0) {
        const channelsStatus = drop.canales.map(c => 
          `${c.online ? '🟢' : '🔴'} [${c.displayName}](https://twitch.tv/${c.login})`
        ).join('\n');

        dropEmbed.addFields({ name: '📺 Canales vinculados', value: channelsStatus.substring(0, 1024), inline: false });
      }

      embeds.push(dropEmbed);
    }

    return embeds;
  }

  /**
   * Actualiza los mensajes existentes en el canal de Discord con los nuevos embeds
   */
  async updateDiscordMessages(monitor) {
    try {
      const channel = await this.client.channels.fetch(monitor.channelId);
      if (!channel) return;

      const embeds = this.buildEmbeds(monitor);

      // Si tienes un solo mensaje principal con toda la info o varios, aquí actualizamos el principal por ahora
      if (monitor.messageIds && monitor.messageIds.length > 0) {
        const msg = await channel.messages.fetch(monitor.messageIds[0]);
        await msg.edit({ embeds: [embeds[0]] }); // O puedes pasar todos los embeds según cómo los organices
      }
    } catch (err) {
      console.error('[RustDropsService] Error al actualizar mensajes en Discord:', err.message);
    }
  }

  /**
   * Sincroniza los drops con la BD y publica o actualiza en el canal de Discord
   */
  async syncAndPublish(guildId, channelId) {
    const scrapedData = await this.scrapeFacepunch();
    if (!scrapedData) throw new Error('No se pudieron obtener los datos de Facepunch.');

    let monitor = await RustDropsMonitor.findOne({ guildId, channelId });

    if (!monitor) {
      monitor = new RustDropsMonitor({
        guildId,
        channelId,
        campaignKey: scrapedData.campaignKey,
        campaignName: scrapedData.campaignName,
        fechaInicio: scrapedData.fechaInicio,
        fechaFin: scrapedData.fechaFin,
        drops: scrapedData.drops
      });
    } else {
      monitor.campaignKey = scrapedData.campaignKey;
      monitor.campaignName = scrapedData.campaignName;
      monitor.fechaInicio = scrapedData.fechaInicio;
      monitor.fechaFin = scrapedData.fechaFin;
      monitor.drops = scrapedData.drops;
      monitor.ultimaRevision = new Date();
    }

    await monitor.save();

    // Comprobar estado en Twitch inmediatamente al sincronizar
    await this.checkTwitchStreamersStatus(monitor);

    const embeds = this.buildEmbeds(monitor);
    const channel = await this.client.channels.fetch(channelId);

    if (monitor.messageIds && monitor.messageIds.length > 0) {
      try {
        const msg = await channel.messages.fetch(monitor.messageIds[0]);
        await msg.edit({ embeds: [embeds[0]] });
      } catch (err) {
        const newMsg = await channel.send({ embeds: [embeds[0]] });
        monitor.messageIds = [newMsg.id];
        await monitor.save();
      }
    } else {
      const newMsg = await channel.send({ embeds: [embeds[0]] });
      monitor.messageIds = [newMsg.id];
      await monitor.save();
    }

    return monitor;
  }

  /**
   * Convierte texto como "2 hours" en un número entero
   */
  parseHours(text) {
    const match = text.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 1;
  }

  /**
   * Asegura que la URL de la imagen sea absoluta
   */
  formatImageUrl(imageUrl) {
    if (!imageUrl) return null;
    return imageUrl.startsWith('http') ? imageUrl : `https://twitch.facepunch.com${imageUrl}`;
  }
}

module.exports = RustDropsService;