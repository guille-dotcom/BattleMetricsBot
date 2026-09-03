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
    },

    // ==========================================
    // CONFIGURACIÓN TIENDA RUST
    // ==========================================

    rustStoreChannelId: {
        type: String,
        default: null
    },

    rustStoreEnabled: {
        type: Boolean,
        default: false
    },

    // Fecha/identificador de la última publicación
    rustStoreLastPublishedWeek: {
        type: String,
        default: null
    },

    // Firma de la última tienda publicada
    rustStoreLastSignature: {
        type: String,
        default: null
    }

});

module.exports = mongoose.model(
    "ServerConfig",
    serverConfigSchema
);