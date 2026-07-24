const axios = require('axios');
const BATTLEMETRICS_TOKEN = process.env.BATTLEMETRICS_TOKEN || process.env.TOKEN;

/**
 * Obtiene el estado de sesión más reciente de un jugador en BattleMetrics
 * @param {string} profileLink - Enlace completo al perfil del jugador
 * @returns {Promise<object|null>} Datos procesados de la sesión o null si falla
 */
async function getLivePlayerSession(profileLink) {
    try {
        // 1. Extraer ID del enlace de forma estricta
        const match = profileLink.match(/players\/(\d+)/);
        if (!match || !match[1]) return null;
        const battlemetricsId = match[1];

        // 2. Realizar petición limpia a la API Oficial
        const url = `https://battlemetrics.com{battlemetricsId}`;
        const response = await axios.get(url, {
            headers: { 'Authorization': `Bearer ${BATTLEMETRICS_TOKEN}` },
            params: { 'include': 'server,session' }
        });

        const playerData = response.data?.data;
        const incluidos = response.data?.included || [];
        if (!playerData) return null;

        const nombre = playerData.attributes?.name || "Desconocido";

        // 3. Obtener la sesión más reciente (Primera en la lista de actividad de la web)
        const ultimaSesion = incluidos.find(item => item.type === "session");
        
        let status = '🔴 Offline';
        let playtime = 'Sin registros recientes';
        let serverName = 'Ninguno detectado';
        let isOnline = false;

        if (ultimaSesion) {
            // Buscar nombre del servidor asociado
            const serverId = ultimaSesion.relationships?.server?.data?.id;
            const serverInfo = incluidos.find(item => item.type === "server" && String(item.id) === String(serverId));
            if (serverInfo?.attributes?.name) {
                serverName = serverInfo.attributes.name;
            }

            // Validar si está jugando ahora mismo (stop es null)
            if (ultimaSesion.attributes?.stop === null) {
                status = '🟢 Online';
                isOnline = true;
                
                const start = new Date(ultimaSesion.attributes.start);
                const diffMs = new Date() - start;
                const horas = Math.floor(diffMs / (1000 * 60 * 60));
                const minutos = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                playtime = `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
            } else {
                // Si está desconectado, calcular última fecha visto
                const stopDate = new Date(ultimaSesion.attributes.stop).toLocaleString('es-ES');
                playtime = `Última vez visto: ${stopDate}`;
            }
        }

        return {
            id: battlemetricsId,
            nombre,
            status,
            isOnline,
            playtime,
            serverName
        };

    } catch (error) {
        console.error("[-] Error crítico en trackerService:", error.message);
        return null;
    }
}

module.exports = { getLivePlayerSession };
