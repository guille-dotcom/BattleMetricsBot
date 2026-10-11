const mongoose = require("mongoose");

const KickAlertMonitorSchema = new mongoose.Schema(
    {
        // =====================================================
        // SERVIDOR DE DISCORD
        // =====================================================

        guildId: {
            type: String,
            required: true,
            index: true
        },

        // =====================================================
        // CONFIGURACIÓN DE ALERTAS
        // =====================================================

        channelId: {
            type: String,
            default: null
        },

        roleId: {
            type: String,
            default: null
        },

        // =====================================================
        // STREAMERS VIGILADOS
        // =====================================================

        streamers: [
            {
                kickUsername: {
                    type: String,
                    required: true
                },

                displayName: {
                    type: String,
                    default: null
                },

                isLive: {
                    type: Boolean,
                    default: false
                },

                lastChecked: {
                    type: Date,
                    default: null
                },

                lastLiveAt: {
                    type: Date,
                    default: null
                },

                lastOfflineAt: {
                    type: Date,
                    default: null
                }
            }
        ]
    },
    {
        timestamps: true
    }
);

// =====================================================
// UN SOLO DOCUMENTO DE CONFIGURACIÓN POR SERVIDOR
// =====================================================

KickAlertMonitorSchema.index(
    { guildId: 1 },
    { unique: true }
);

module.exports =
    mongoose.models.KickAlertMonitor ||
    mongoose.model(
        "KickAlertMonitor",
        KickAlertMonitorSchema
    );