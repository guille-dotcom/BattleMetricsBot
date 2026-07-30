const mongoose = require("mongoose");

const trackerSchema = new mongoose.Schema({
    battlemetricsId: { type: String, required: true },
    nombre: { type: String, required: true },
    canalId: { type: String, required: true },
    guildId: { type: String, required: true },
    registradoPor: { type: String, required: true },
    ultimoEstado: { type: String, default: "desconocido" },
    inicioSesion: { type: Date, default: null },
    ultimoServidor: { type: String, default: null },
    ultimoServerId: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true }
});

module.exports = mongoose.model("Tracker", trackerSchema);