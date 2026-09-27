const mongoose = require("mongoose");

const RustDropStreamerSchema = new mongoose.Schema(
    {
        login: {
            type: String,
            required: true
        },

        displayName: {
            type: String,
            required: true
        },

        online: {
            type: Boolean,
            default: false
        }
    },
    {
        _id: false
    }
);

const RustDropSchema = new mongoose.Schema(
    {
        tipo: {
            type: String,
            enum: ["general", "streamer"],
            required: true
        },

        nombre: {
            type: String,
            required: true
        },

        horas: {
            type: Number,
            default: 1
        },

        imagen: {
            type: String,
            default: null
        },

        canales: {
            type: [RustDropStreamerSchema],
            default: []
        }
    },
    {
        _id: false
    }
);

const RustDropsMonitorSchema = new mongoose.Schema(
    {
        guildId: {
            type: String,
            required: true,
            index: true
        },

        channelId: {
            type: String,
            required: true,
            index: true
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
            type: String,
            default: null
        },

        fechaFin: {
            type: String,
            default: null
        },

        drops: {
            type: [RustDropSchema],
            default: []
        },

        active: {
            type: Boolean,
            default: true
        },

        ultimaRevision: {
            type: Date,
            default: Date.now
        },

        creadoPor: {
            type: String,
            default: null
        }
    },
    {
        timestamps: true
    }
);

RustDropsMonitorSchema.index(
    {
        guildId: 1,
        channelId: 1
    },
    {
        unique: true
    }
);

module.exports =
    mongoose.models.RustDropsMonitor ||
    mongoose.model(
        "RustDropsMonitor",
        RustDropsMonitorSchema
    );