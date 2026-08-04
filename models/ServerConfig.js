const mongoose = require("mongoose");

const serverConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true }, // ID del Servidor de Discord
    battleMetricsServerId: { type: String, required: true },   // ID del servidor de Rust en BattleMetrics
    sheetId: { type: String, default: null }                   // ID de la planilla de Google Sheets
});

module.exports = mongoose.model("ServerConfig", serverConfigSchema);