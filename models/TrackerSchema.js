const mongoose = require("mongoose");

const trackerSchema = new mongoose.Schema({
    battlemetricsId: { type: String, required: true },
    nombre: { type: String, required: true },
    canalId: { type: String, required: true },
    guildId: { type: String, required: true },
    registradoPor: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true }
});

module.exports = mongoose.model("Tracker", trackerSchema);