const mongoose = require("mongoose");

const StreamerRoleSchema = new mongoose.Schema(
    {
        guildId: {
            type: String,
            required: true,
            index: true
        },

        streamerName: {
            type: String,
            required: true,
            trim: true
        },

        roleId: {
            type: String,
            required: true
        }
    },
    {
        timestamps: true
    }
);

// Un streamer solo puede tener una asociación por servidor.
StreamerRoleSchema.index(
    {
        guildId: 1,
        streamerName: 1
    },
    {
        unique: true
    }
);

module.exports =
    mongoose.models.StreamerRole ||
    mongoose.model(
        "StreamerRole",
        StreamerRoleSchema
    );