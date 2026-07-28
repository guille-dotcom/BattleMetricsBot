require("dotenv").config();
const axios = require("axios");

async function getBattleMetricsHours(playerId) {
    try {
        console.log("CONSULTANDO DATOS DEL JUGADOR...");

        const token = process.env.BATTLEMETRICS_TOKEN;

        const response = await axios.get(
            `https://api.battlemetrics.com/players/${playerId}?include=server`,
            {
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const player = response.data.data;
        const included = response.data.included || [];

        const nombreJugador = player.attributes.name || "Desconocido";

        let segundosTotales = 0;
        let listaServidores = [];
        const servidoresContados = new Set();
        let ultimoWipeServidor = "Desconocido";

        for (const item of included) {
            if (item.type === "server") {
                const servidorId = item.id;
                if (servidoresContados.has(servidorId)) continue;
                servidoresContados.add(servidorId);

                const tiempo = item.meta?.timePlayed || 0;
                segundosTotales += tiempo;

                const lastSeen = item.meta?.lastSeen || item.attributes?.updatedAt || "";
                
                // Inspeccionamos los detalles del servidor
                const details = item.attributes?.details || {};
                
                // Buscamos en todas las posibles variantes que usa BattleMetrics para el wipe
                const rawWipe = details.rust_lastWipe || details.rustLastWipe || details.lastWipe || details.wipe || null;

                listaServidores.push({
                    id: servidorId,
                    nombre: item.attributes.name,
                    segundos: tiempo,
                    horas: (tiempo / 3600).toFixed(2),
                    lastSeen: lastSeen,
                    rustWipe: rawWipe
                });
            }
        }

        // Ordenamos los servidores por la fecha más reciente
        listaServidores.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));

        let estadoServidorActual = "🔴 Offline / Desconectado de Rust";

        if (listaServidores.length > 0 && listaServidores[0].nombre) {
            const servidorPrincipal = listaServidores[0];
            estadoServidorActual = servidorPrincipal.nombre;
            
            console.log("DETALLES DEL SERVIDOR ACTUAL:", servidorPrincipal.nombre);
            console.log("WIPE ENCONTRADO (RAW):", servidorPrincipal.rustWipe);

            if (servidorPrincipal.rustWipe) {
                const fechaWipe = new Date(servidorPrincipal.rustWipe);
                if (!isNaN(fechaWipe.getTime())) {
                    ultimoWipeServidor = fechaWipe.toLocaleDateString("es-ES", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                    });
                }
            }
        }

        const horasTotales = (segundosTotales / 3600).toFixed(2);

        return {
            nombre: nombreJugador,
            totalHoras: horasTotales,
            primerServidor: estadoServidorActual,
            ultimoWipe: ultimoWipeServidor,
            servidores: {
                rust: {
                    horas: horasTotales,
                    datos: {
                        servidoresEncontrados: listaServidores.length,
                        lista: listaServidores
                    }
                }
            }
        };

    } catch (error) {
        console.log("ERROR API:", error.response?.data || error.message);

        return {
            nombre: "Desconocido",
            totalHoras: "0.00",
            primerServidor: "🔴 Offline / Desconectado de Rust",
            ultimoWipe: "Desconocido",
            servidores: {
                rust: {
                    horas: "0.00",
                    datos: {
                        servidoresEncontrados: 0,
                        lista: []
                    }
                }
            }
        };
    }
}

module.exports = {
    getBattleMetricsHours
};