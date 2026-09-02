const mongoose = require('mongoose');

const vigiladoSchema = new mongoose.Schema({
  guildId: { type: String, required: true },          // Para saber a qué servidor de Discord pertenece
  battlemetricsId: { type: String, required: true },   // El ID numérico del perfil en BattleMetrics
  alias: { type: String, required: true },           // El apodo (Streamer / SS) que le pusiste
});

module.exports = mongoose.model('Vigilado', vigiladoSchema);