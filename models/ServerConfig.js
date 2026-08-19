const mongoose = require("mongoose");

const serverConfigSchema = new mongoose.Schema({

    guildId: {
        type: String,
        required: true,
        unique: true
    },

    battleMetricsServerId: {
        type: String,
        required: true
    },

    sheetId: {
        type: String,
        default: null
    },

    // ==========================================
    // CONFIGURACIÓN STEAMID.UK
    // ==========================================

    steamIdApiKey: {
        type: String,
        default: null
    },

    steamIdMyId: {
        type: String,
        default: null
    }

});

module.exports = mongoose.model("ServerConfig", serverConfigSchema);