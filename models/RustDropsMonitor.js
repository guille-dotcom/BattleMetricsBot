const mongoose = require("mongoose");

const TwitchDropsMonitorSchema = new mongoose.Schema(
    {
        guildId: {
            type: String,
            required: true,
            index: true
        },

        channelId: {
            type: String,
            required: true
        },

        // Compatibilidad con el mensaje único de versiones anteriores.
        messageId: {
            type: String,
            default: null
        },

        // Un ID independiente por cada recompensa publicada.
        messageIds: {
            type: [String],
            default: []
        },

        // Identificación de la campaña oficial.
        campaignKey: {
            type: String,
            default: null
        },

        campaignName: {
            type: String,
            default: null
        },

        campaignSignature: {
            type: String,
            default: null
        },

        // Estado de los streamers asociados a los Drops.
        // Permite detectar directos nuevos y evitar avisos duplicados.
        streamerStates: {
            type: mongoose.Schema.Types.Mixed,
            default: () => ({})
        },

        // Activa o desactiva el monitor de este servidor.
        active: {
            type: Boolean,
            default: true
        },

        // Fecha de la última comprobación.
        lastCheckedAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

// Un monitor por servidor de Discord.
TwitchDropsMonitorSchema.index(
    { guildId: 1 },
    { unique: true }
);

module.exports =
    mongoose.models.RustDropsMonitor ||
    mongoose.model(
        "RustDropsMonitor",
        TwitchDropsMonitorSchema
    );