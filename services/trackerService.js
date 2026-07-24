const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const BATTLEMETRICS_TOKEN = process.env.BATTLEMETRICS_TOKEN || process.env.TOKEN;
const trackersFile = path.join(__dirname, '..', 'data', 'trackers.json');

// Asegurar que exista la carpeta data y el archivo trackers.json
if (!fs.existsSync(path.dirname(trackersFile))) {
    fs.mkdirSync(path.dirname(trackersFile), { recursive: true });
}
if (!fs.existsSync(trackersFile)) {
    fs.writeFileSync(trackersFile, JSON.stringify({}), 'utf8');
}

/**
 * Consulta la API de BattleMetrics para un perfil específico
 */
async function queryBattleMetrics(battlemetricsId) {
    try {
        const url = `https://battlemetrics.com{battlemetricsId}`;
        const response = await axios.get(url, {
            headers: { 'Authorization': `Bearer ${BATTLEMETRICS_TOKEN}` },
            params: { 'include': 'server,session' }
        });
        return response.data;
    } catch (error) {
        console.error(`[-] Error consultando API para ID ${battlemetricsId}:`, error.message);
        return null;
    }
}

/**
 * Obtiene el estado de sesión más reciente de un jugador (Para el comando manual)
 */
async function getLivePlayerSession(profileLink) {
    try {
        const match = profileLink.match(/players\/(\d+)/);
        if (!match || !match[1]) return null;
        const battlemetricsId = match[1];

        const json = await queryBattleMetrics(battlemetricsId);
        if (!json || !json.data) return null;

        const playerData = json.data;
        const incluidos = json.included || [];
        const nombre = playerData.attributes?.name || "Desconocido";
        const ultimaSesion = incluidos.find(item => item.type === "session");

        let status = '🔴 Offline';
        let playtime = 'Sin registros recientes';
        let serverName = 'Ninguno detectado';
        let isOnline = false;

        if (ultimaSesion) {
            const serverId = ultimaSesion.relationships?.server?.data?.id;
            const serverInfo = incluidos.find(item => item.type === "server" && String(item.id) === String(serverId));
            if (serverInfo?.attributes?.name) serverName = serverInfo.attributes.name;

            if (ultimaSesion.attributes?.stop === null) {
                status = '🟢 Online';
                isOnline = true;
                const start = new Date(ultimaSesion.attributes.start);
                const diffMs = new Date() - start;
                const horas = Math.floor(diffMs / (1000 * 60 * 60));
                const minutos = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                playtime = `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
            } else {
                const stopDate = new Date(ultimaSesion.attributes.stop).toLocaleString('es-ES');
                playtime = `Última vez visto: ${stopDate}`;
            }
        }

        return { id: battlemetricsId, nombre, status, isOnline, playtime, serverName };
    } catch {
        return null;
    }
}

/**
 * MOTOR AUTOMÁTICO: Escanea cada 30 segundos y envía alertas únicamente en cambios de estado
 */
async function revisarTrackers(client) {
    try {
        const trackers = JSON.parse(fs.readFileSync(trackersFile, 'utf8'));
        const playerIds = Object.keys(trackers);
        if (playerIds.length === 0) return;

        for (const id of playerIds) {
            const playerDataLocal = trackers[id];
            const json = await queryBattleMetrics(id);
            if (!json || !json.data) continue;

            const incluidos = json.included || [];
            const ultimaSesion = incluidos.find(item => item.type === "session");
            
            // Determinar estado actual real en la API
            const estaOnlineAhora = ultimaSesion ? (ultimaSesion.attributes?.stop === null) : false;
            const estadoAnterior = playerDataLocal.ultimoEstado; // 'online' o 'offline'

            let serverName = "Servidor Desconocido";
            if (ultimaSesion) {
                const serverId = ultimaSesion.relationships?.server?.data?.id;
                const serverInfo = incluidos.find(item => item.type === "server" && String(item.id) === String(serverId));
                if (serverInfo?.attributes?.name) serverName = serverInfo.attributes.name;
            }

            let huboCambio = false;
            let tipoAlerta = ''; // 'entró' o 'salió'

            if (estaOnlineAhora && estadoAnterior === 'offline') {
                huboCambio = true;
                tipoAlerta = 'entró';
                trackers[id].ultimoEstado = 'online';
            } else if (!estaOnlineAhora && estadoAnterior === 'online') {
                huboCambio = true;
                tipoAlerta = 'salió';
                trackers[id].ultimoEstado = 'offline';
            }

            // Si el estado no ha cambiado, ignoramos y pasamos al siguiente jugador
            if (!huboCambio) continue;

            // Guardar el nuevo estado inmediatamente en el archivo
            fs.writeFileSync(trackersFile, JSON.stringify(trackers, null, 4), 'utf8');

            // Enviar la alerta a los canales de Discord configurados para ese seguimiento
            const nombreJugador = json.data.attributes?.name || "Desconocido";
            const embedColor = tipoAlerta === 'entró' ? 0x2ecc71 : 0xe74c3c;
            const titulo = tipoAlerta === 'entró' ? `🟢 ¡Jugador Conectado! (Online)` : `🔴 ¡Jugador Desconectado! (Offline)`;
            
            const embed = new EmbedBuilder()
                .setTitle(titulo)
                .setColor(embedColor)
                .addFields(
                    { name: "👤 Jugador", value: nombreJugador, inline: true },
                    { name: "🆔 ID", value: `\`${id}\``, inline: true },
                    { name: "🖥️ Servidor", value: serverName, inline: false }
                )
                .setTimestamp();

            // Enviar el aviso al canal guardado en el registro de ese seguimiento
            try {
                const channel = await client.channels.fetch(playerDataLocal.canalId);
                if (channel) {
                    await channel.send({ embeds: [embed] });
                }
            } catch (err) {
                console.error(`[-] No se pudo enviar alerta al canal ${playerDataLocal.canalId}:`, err.message);
            }
        }
    } catch (error) {
        console.error("[-] Error en el bucle revisarTrackers:", error.message);
    }
}

module.exports = { getLivePlayerSession, revisarTrackers, trackersFile };
