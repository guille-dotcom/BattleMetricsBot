require("dotenv").config();

const {
    Client,
    GatewayIntentBits
} = require("discord.js");

const mongoose =
    require("mongoose");

// ============================================================
// CONFIGURACIÓN
// ============================================================

const MONGODB_URI =
    process.env.MONGODB_URI;

const DISCORD_TOKEN =
    process.env.TOKEN;

// ============================================================
// VALIDAR CONFIGURACIÓN
// ============================================================

if (!MONGODB_URI) {

    console.error(
        "❌ No se encontró MONGODB_URI."
    );

    process.exit(1);
}

if (!DISCORD_TOKEN) {

    console.error(
        "❌ No se encontró TOKEN."
    );

    process.exit(1);
}

// ============================================================
// CLIENTE DISCORD
// ============================================================

const client =
    new Client({
        intents: [
            GatewayIntentBits.Guilds
        ]
    });

// ============================================================
// CREAR URI DIRECTA DE MONGODB
// ============================================================

function crearUriDirecta() {

    const match =
        MONGODB_URI.match(
            /^mongodb\+srv:\/\/([^:]+):([^@]+)@([^/]+)(\/.*)?$/
        );

    if (!match) {

        throw new Error(
            "❌ La MONGODB_URI no tiene el formato esperado."
        );

    }

    const usuario =
        match[1];

    const password =
        match[2];

    const hosts = [

        "ac-r1n45b4-shard-00-00.efcsxfj.mongodb.net:27017",

        "ac-r1n45b4-shard-00-01.efcsxfj.mongodb.net:27017",

        "ac-r1n45b4-shard-00-02.efcsxfj.mongodb.net:27017"

    ];

    return (
        `mongodb://${usuario}:${password}@` +
        `${hosts.join(",")}` +
        `/?tls=true&authSource=admin&directConnection=false`
    );

}

// ============================================================
// MIGRACIÓN
// ============================================================

async function migrarCumpleanos() {

    try {

        // ====================================================
        // CONEXIÓN
        // ====================================================

        console.log(
            "🔄 Preparando conexión directa a MongoDB Atlas..."
        );

        const uriDirecta =
            crearUriDirecta();

        console.log(
            "🟢 URI directa preparada."
        );

        console.log(
            "🔄 Conectando a MongoDB Atlas..."
        );

        await mongoose.connect(
            uriDirecta,
            {
                serverSelectionTimeoutMS:
                    20000,

                connectTimeoutMS:
                    20000,

                socketTimeoutMS:
                    20000
            }
        );

        console.log(
            "🟢 Conectado exitosamente a MongoDB Atlas."
        );

        // ====================================================
        // BASE DE DATOS
        // ====================================================

        const db =
            mongoose.connection.db;

        const collection =
            db.collection(
                "birthdays"
            );

        // ====================================================
        // MOSTRAR ÍNDICES ACTUALES
        // ====================================================

        console.log("");
        console.log(
            "🔎 Revisando índices de birthdays..."
        );

        const indices =
            await collection.indexes();

        for (
            const indice of indices
        ) {

            console.log(
                `   📌 ${indice.name}`
            );

        }

        // ====================================================
        // ELIMINAR ÍNDICE ANTIGUO
        // ====================================================

        const indiceAntiguo =
            indices.find(
                indice =>
                    indice.name ===
                    "guildId_1_userId_1"
            );

        if (
            indiceAntiguo
        ) {

            console.log("");
            console.log(
                "🗑️ Eliminando índice antiguo guildId_1_userId_1..."
            );

            await collection.dropIndex(
                "guildId_1_userId_1"
            );

            console.log(
                "✅ Índice antiguo eliminado."
            );

        } else {

            console.log(
                "✅ El índice antiguo guildId_1_userId_1 ya no existe."
            );

        }

        // ====================================================
        // ASEGURAR ÍNDICE NUEVO
        // ====================================================

        console.log("");
        console.log(
            "🔎 Comprobando índice guildId + nombre..."
        );

        const indicesActualizados =
            await collection.indexes();

        const indiceNuevo =
            indicesActualizados.find(
                indice =>
                    indice.name ===
                    "guildId_1_nombre_1"
            );

        if (
            !indiceNuevo
        ) {

            console.log(
                "🛠️ Creando índice guildId_1_nombre_1..."
            );

            await collection.createIndex(

                {
                    guildId: 1,
                    nombre: 1
                },

                {
                    unique: true
                }

            );

            console.log(
                "✅ Índice nuevo creado."
            );

        } else {

            console.log(
                "✅ Índice guildId_1_nombre_1 ya existe."
            );

        }

        // ====================================================
        // BUSCAR REGISTROS ANTIGUOS
        // ====================================================

        console.log("");
        console.log(
            "🔎 Buscando cumpleaños que todavía usan userId..."
        );

        const cumpleaños =
            await collection.find({
                userId: {
                    $exists: true
                }
            }).toArray();

        console.log(
            `🎂 Registros antiguos encontrados: ${cumpleaños.length}`
        );

        if (
            cumpleaños.length === 0
        ) {

            console.log("");
            console.log(
                "✅ No quedan cumpleaños antiguos por migrar."
            );

        } else {

            let migrados = 0;

            let errores = 0;

            let duplicados = 0;

            // =================================================
            // MIGRAR
            // =================================================

            for (
                const cumple of cumpleaños
            ) {

                try {

                    const userId =
                        cumple.userId;

                    console.log("");
                    console.log(
                        `🔄 Migrando usuario ${userId}...`
                    );

                    // =============================================
                    // BUSCAR USUARIO EN DISCORD
                    // =============================================

                    let usuario = null;

                    try {

                        usuario =
                            await client.users.fetch(
                                userId
                            );

                    } catch (error) {

                        console.log(
                            `⚠️ No se pudo encontrar en Discord al usuario ${userId}.`
                        );

                        errores++;

                        continue;

                    }

                    if (
                        !usuario
                    ) {

                        console.log(
                            `⚠️ No se obtuvo información del usuario ${userId}.`
                        );

                        errores++;

                        continue;

                    }

                    // =============================================
                    // OBTENER NOMBRE
                    // =============================================

                    const nombre =
                        usuario.globalName ||
                        usuario.username;

                    if (
                        !nombre
                    ) {

                        console.log(
                            `⚠️ No se pudo obtener un nombre para ${userId}.`
                        );

                        errores++;

                        continue;

                    }

                    console.log(
                        `👤 Nombre encontrado: ${nombre}`
                    );

                    // =============================================
                    // COMPROBAR DUPLICADO
                    // =============================================

                    const existente =
                        await collection.findOne({

                            guildId:
                                cumple.guildId,

                            nombre:
                                nombre

                        });

                    if (
                        existente &&
                        String(
                            existente._id
                        ) !==
                        String(
                            cumple._id
                        )
                    ) {

                        console.log(
                            `⚠️ Ya existe "${nombre}" en el servidor ${cumple.guildId}.`
                        );

                        console.log(
                            "⏭️ Se conserva el registro existente y se omite este antiguo."
                        );

                        duplicados++;

                        continue;

                    }

                    // =============================================
                    // MIGRAR
                    // =============================================

                    await collection.updateOne(

                        {
                            _id:
                                cumple._id
                        },

                        {
                            $set: {

                                nombre:
                                    nombre

                            },

                            $unset: {

                                userId: ""

                            }

                        }

                    );

                    migrados++;

                    console.log(
                        `✅ Migrado correctamente: ${userId} → ${nombre}`
                    );

                } catch (error) {

                    errores++;

                    console.error(
                        `❌ Error migrando ${cumple._id}:`,
                        error
                    );

                }

            }

            // =================================================
            // RESULTADO
            // =================================================

            console.log("");
            console.log(
                "========================================"
            );

            console.log(
                "🎂 MIGRACIÓN TERMINADA"
            );

            console.log(
                "========================================"
            );

            console.log(
                `📋 Antiguos encontrados: ${cumpleaños.length}`
            );

            console.log(
                `✅ Migrados correctamente: ${migrados}`
            );

            console.log(
                `⚠️ Con errores: ${errores}`
            );

            console.log(
                `⚠️ Duplicados omitidos: ${duplicados}`
            );

            console.log(
                "========================================"
            );

        }

        // ====================================================
        // COMPROBACIÓN FINAL
        // ====================================================

        console.log("");
        console.log(
            "🔎 Comprobación final..."
        );

        const restantes =
            await collection.countDocuments({
                userId: {
                    $exists: true
                }
            });

        const total =
            await collection.countDocuments();

        console.log(
            `🎂 Total de cumpleaños en la colección: ${total}`
        );

        console.log(
            `🔍 Registros que todavía tienen userId: ${restantes}`
        );

        if (
            restantes === 0
        ) {

            console.log(
                "✅ Todos los cumpleaños están usando el nuevo sistema por nombre."
            );

        } else {

            console.log(
                "⚠️ Todavía quedan registros antiguos con userId."
            );

        }

        // ====================================================
        // MOSTRAR CUMPLEAÑOS ACTUALES
        // ====================================================

        console.log("");
        console.log(
            "🎂 Cumpleaños registrados actualmente:"
        );

        const actuales =
            await collection.find({})
                .sort({
                    mes: 1,
                    dia: 1
                })
                .toArray();

        for (
            const cumple of actuales
        ) {

            console.log(
                `   🎈 ${cumple.nombre || "SIN NOMBRE"} → ${cumple.dia}/${cumple.mes}${cumple.anio ? `/${cumple.anio}` : ""}`
            );

        }

    } catch (error) {

        console.error("");
        console.error(
            "❌ Error durante la migración:"
        );

        console.error(
            error
        );

    } finally {

        // ====================================================
        // DESCONECTAR MONGODB
        // ====================================================

        try {

            await mongoose.disconnect();

            console.log(
                "🔌 MongoDB desconectado."
            );

        } catch (error) {

            console.error(
                "⚠️ Error desconectando MongoDB:",
                error
            );

        }

    }

}

// ============================================================
// DISCORD READY
// ============================================================

client.once(
    "ready",
    async () => {

        console.log("");

        console.log(
            "========================================"
        );

        console.log(
            `🤖 Discord conectado como ${client.user.tag}`
        );

        console.log(
            "========================================"
        );

        await migrarCumpleanos();

        console.log(
            "👋 Cerrando conexión de Discord..."
        );

        client.destroy();

        process.exit(0);

    }
);

// ============================================================
// LOGIN
// ============================================================

console.log(
    "🔐 Iniciando sesión de Discord..."
);

client.login(
    DISCORD_TOKEN
);