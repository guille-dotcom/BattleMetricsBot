const mongoose = require("mongoose");

// ============================================================
// RUSTLOGIX - MONITOR DE KICK DROPS
// ============================================================

const KickDropsMonitorSchema = new mongoose.Schema(
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

        messageIds: {
            type: [String],
            default: []
        },

        campaignKey: {
            type: String,
            default: null
        },

        campaignName: {
            type: String,
            default: null
        },

        campaignTheme: {
            type: String,
            default: null
        },

        fechaInicio: {
            type: Date,
            default: null
        },

        fechaFin: {
            type: Date,
            default: null
        },

        drops: {
            type: [
                {
                    id: {
                        type: String,
                        required: true
                    },

                    nombre: {
                        type: String,
                        default: "Drop de Rust"
                    },

                    horas: {
                        type: Number,
                        default: null
                    },

                    streamer: {
                        type: String,
                        default: null
                    },

                    streamers: {
                        type: [String],
                        default: []
                    },

                    imagen: {
                        type: String,
                        default: null
                    },

                    enlace: {
                        type: String,
                        default: "https://kick.facepunch.com/"
                    },

                    streamerEspecifico: {
                        type: Boolean,
                        default: false
                    },

                    online: {
                        type: Boolean,
                        default: false
                    },

                    canalesOnline: {
                        type: [String],
                        default: []
                    }
                }
            ],
            default: []
        },

        ultimaRevision: {
            type: Date,
            default: null
        },

        active: {
            type: Boolean,
            default: true
        },

        creadoPor: {
            type: String,
            default: null
        },

        notificacionesStreamer: {
            type: Boolean,
            default: true
        }
    },
    {
        timestamps: true
    }
);

// Un monitor por servidor/canal de Discord.
KickDropsMonitorSchema.index(
    {
        guildId: 1,
        channelId: 1
    },
    {
        unique: true
    }
);

module.exports =
    mongoose.models.KickDropsMonitor ||
    mongoose.model("KickDropsMonitor", KickDropsMonitorSchema);