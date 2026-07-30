// Revisar trackers desde MongoDB
async function revisarTrackers(client, specificTrackerId = null) {
    try {
        const query = specificTrackerId ? { _id: specificTrackerId } : {};
        const trackers = await Tracker.find(query);

        for(const tracker of trackers) {
            if(!specificTrackerId && new Date() > new Date(tracker.expiresAt)) {
                await Tracker.deleteOne({ _id: tracker._id });
                console.log("🗑 Tracker expirado:", tracker.battlemetricsId);
                continue;
            }

            const status = await getBattleMetricsPlayerStatus(tracker.battlemetricsId);
            console.log("📊 Estado obtenido de BattleMetrics para tracker:", status);
            if(!status) continue;

            let canal;
            try {
                canal = await client.channels.fetch(tracker.canalId);
            } catch (e) {
                continue;
            }
            if(!canal) continue;

            // ============================
            // 1. PRIMERA REVISIÓN
            // ============================
            if(tracker.ultimoEstado === "desconocido"){
                if(status.online){
                    tracker.ultimoEstado = "online";
                    tracker.inicioSesion = new Date();
                    tracker.ultimoServidor = status.server;
                    tracker.ultimoServerId = status.serverId;

                    await canal.send({
                        embeds: [crearEmbedOnline(status, tracker, status.server)]
                    });
                } else {
                    tracker.ultimoEstado = "offline";
                    await canal.send({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle("🎯 RustLogix")
                                .setDescription(
`🔴 **JUGADOR OFFLINE**

👤 **${status.name}**

🆔 [Perfil BattleMetrics](https://www.battlemetrics.com/players/${tracker.battlemetricsId})

⏳ Esperando conexión...

📡 Tracker activo`
                                )
                                .setColor(0xff0000)
                                .setTimestamp()
                        ]
                    });
                }
                await tracker.save();
                continue;
            }

            // ============================
            // 2. CAMBIO OFFLINE -> ONLINE
            // ============================
            if(status.online && tracker.ultimoEstado === "offline"){
                tracker.ultimoEstado = "online";
                tracker.inicioSesion = new Date();
                tracker.ultimoServidor = status.server;
                tracker.ultimoServerId = status.serverId;

                await canal.send({
                    content: `🔔 **${status.name} volvió a entrar al servidor**`,
                    embeds: [crearEmbedOnline(status, tracker, status.server)]
                });

                await tracker.save();
                continue;
            }

            // ============================
            // 3. SIGUE ONLINE (O CAMBIÓ DE SERVIDOR)
            // ============================
            if(status.online && tracker.ultimoEstado === "online"){
                if (
                    status.serverId && 
                    tracker.ultimoServerId && 
                    status.serverId !== tracker.ultimoServerId
                ) {
                    const viejoServer = tracker.ultimoServidor;
                    tracker.ultimoServidor = status.server;
                    tracker.ultimoServerId = status.serverId;
                    tracker.inicioSesion = new Date();

                    await canal.send({
                        content: `🔀 **${status.name} cambió de servidor** (De: \`${viejoServer}\` a \`${status.server}\`)`,
                        embeds: [crearEmbedOnline(status, tracker, status.server)]
                    });
                } else if (status.server && status.server !== "Desconocido") {
                    tracker.ultimoServidor = status.server;
                    tracker.ultimoServerId = status.serverId;
                }
            }

            // ============================
            // 4. CAMBIO ONLINE -> OFFLINE
            // ============================
            if(!status.online && tracker.ultimoEstado === "online"){
                const tiempoJugado = status.jugando !== "0m" ? status.jugando : formatoTiempo(tracker.inicioSesion);
                const servidorDondeEstaba = tracker.ultimoServidor || status.server;

                tracker.ultimoEstado = "offline";

                await canal.send({
                    content: `🔔 **${status.name} salió del servidor**`,
                    embeds: [crearEmbedOffline(status, tracker, tiempoJugado, servidorDondeEstaba)]
                });

                tracker.inicioSesion = null;
                tracker.ultimoServerId = null;
            }

            await tracker.save();
        }
    } catch (error) {
        console.error("ERROR EN REVISAR TRACKERS:", error);
    }
}