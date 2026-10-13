
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
        messageId: {
            type: String,
            default: null
        },
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
        active: {
            type: Boolean,
            default: true
        },
        lastCheckedAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

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
