const mongoose = require("mongoose");

async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("🟢 Conectado exitosamente a MongoDB Atlas");
    } catch (error) {
        console.error("🔴 Error al conectar a MongoDB:", error);
        process.exit(1);
    }
}

module.exports = connectDB;