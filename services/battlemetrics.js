// 3. Obtener el ranking/leaderboard de tiempo de juego de los jugadores en el servidor actual
async function getServerLeaderboard(serverId) {
    try {
        const token = process.env.BATTLEMETRICS_TOKEN;
        const response = await axios.get(
            `https://api.battlemetrics.com/servers/${serverId}`,
            {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                params: { include: "player,serverPlayer" }
            }
        );

        const included = response.data.included || [];
        const playersMap = new Map();
        const timePlayedMap = new Map();

        // Mapeamos los datos de "serverPlayer" que es donde BattleMetrics guarda la relación exacta de tiempo en el servidor
        for (const item of included) {
            if (item.type === "serverPlayer") {
                const playerId = item.relationships?.player?.data?.id;
                const timePlayed = item.attributes?.timePlayed || 0; // Tiempo en segundos en este servidor
                if (playerId) {
                    timePlayedMap.set(playerId, timePlayed);
                }
            }
        }

        for (const item of included) {
            if (item.type === "player") {
                const playerId = item.id;
                // Intentamos obtener el tiempo del serverPlayer, del meta, o 0 por defecto
                const timePlayedSeconds = timePlayedMap.get(playerId) || item.meta?.timePlayed || 0;

                playersMap.set(playerId, {
                    id: playerId,
                    name: item.attributes?.name || "Desconocido",
                    timePlayedSeconds: timePlayedSeconds
                });
            }
        }

        const ranking = Array.from(playersMap.values())
            .sort((a, b) => b.timePlayedSeconds - a.timePlayedSeconds);

        return ranking;

    } catch (error) {
        console.error("Error obteniendo ranking del servidor:", error.response?.data || error.message);
        return [];
    }
}