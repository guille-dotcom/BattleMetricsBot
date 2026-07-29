const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { getBattleMetricsHours } = require("../services/battlemetricsHours");

const file = path.join(__dirname, "..", "data", "users.json");
const configPath = path.join(__dirname, "..", "data", "config.json");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("ranking")
        .setDescription("Ranking de los jugadores con más horas desde el último wipe"),

    async execute(interaction) {
        await interaction.deferReply();

        if (!fs.existsSync(file)) {
            return await interaction.editReply({ 
                content: "❌ No hay datos de usuarios registrados para el ranking." 
            });
        }

        let serverIdConfigurado = null;
        try {
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
                if (config.battlemetricsServer) {
                    serverIdConfigurado = config.battlemetricsServer;
                }
            }
        } catch (error) {
            console.log("Error leyendo config.json:", error.message);
        }

        if (!serverIdConfigurado) {
            return await interaction.editReply({ 
                content: "❌ No hay ningún servidor de BattleMetrics configurado." 
            });
        }

        const users = JSON.parse(fs.readFileSync(file, "utf-8"));
        
        // Creamos un array de promesas para consultar a todos los usuarios en paralelo (súper rápido)
        const promesasRanking = Object.keys(users).map(async (id) => {
            const u = users[id];
            try {
                const h = await getBattleMetricsHours(u.battlemetricsId, serverIdConfigurado);
                const horasWipeNum = Number(h.horasDesdeWipe || 0);
                const nombreJugador = u.discord || h.nombre || "Desconocido";
                return { discord: nombreJugador, hours: horasWipeNum };
            } catch (err) {
                console.log(`Error obteniendo datos para ID ${u.battlemetricsId}:`, err.message);
                return null;
            }
        });

        // Esperamos a que todas las peticiones terminen al mismo tiempo
        const resultados = await Promise.all(promesasRanking);
        
        // Filtramos nulos
        const ranking = resultados.filter(item => item !== null);

        // Ordenar de mayor a menor cantidad de horas
        ranking.sort((a, b) => b.hours - a.hours);

        let text = "";
        if (ranking.length === 0) {
            text = "No hay datos disponibles para el ranking.";
        } else {
            // Mostramos el top 15
            ranking.slice(0, 15).forEach((u, i) => {
                text += `**${i + 1}.** ${u.discord} — **${u.hours.toFixed(2)}h**\n`;
            });
        }

        const embed = new EmbedBuilder()
            .setTitle("🏆 Top 15 — Horas desde el Último Wipe")
            .setDescription(text)
            .setColor("#57F287")
            .setTimestamp()
            .setFooter({ text: "RustLogix" });

        return await interaction.editReply({ embeds: [embed] });
    }
};