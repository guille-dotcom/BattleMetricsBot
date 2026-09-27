const mongoose = require("mongoose");

async function connectDB() {
    console.log("🟡 Iniciando conexión a MongoDB Atlas...");

    if (!process.env.MONGODB_URI) {
        console.error("🔴 ERROR: La variable MONGODB_URI no existe en las variables de entorno.");
        process.exit(1);
    }

    console.log("🟡 MONGODB_URI encontrada correctamente.");

    try {
        console.log("🟡 Intentando conectar a MongoDB...");

        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 20000,
            connectTimeoutMS: 20000,
            socketTimeoutMS: 20000,
        });

        console.log("🟢 Conectado exitosamente a MongoDB Atlas");
        console.log(`🟢 Estado de MongoDB: ${mongoose.connection.readyState}`);

    } catch (error) {
        console.error("🔴 ERROR AL CONECTAR A MONGODB ATLAS");
        console.error("🔴 Mensaje:", error.message);
        console.error("🔴 Nombre:", error.name);
        console.error("🔴 Código:", error.code || "sin código");

        if (error.reason) {
            console.error("🔴 Razón:", error.reason);
        }

        console.error("🔴 MongoDB no pudo establecer la conexión dentro del tiempo permitido.");

        process.exit(1);
    }
}

module.exports = connectDB;