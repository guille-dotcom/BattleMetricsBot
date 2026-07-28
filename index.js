client.once("ready", async () => { 
    console.log(`✅ Bot conectado como ${client.user.tag}`); 

    try {
        const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
        
        // 1. LIMPIAR COMANDOS LOCALES DE UN SERVIDOR ESPECÍFICO (Reemplaza con tu ID de servidor si lo sabes, o bórralo si ya no lo usas)
        // const GUILD_ID = "TU_ID_DE_SERVIDOR_AQUÍ";
        // await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: [] });

        // 2. SINCRONIZACIÓN GLOBAL LIMPIA (Esto sobrescribe cualquier duplicado global)
        console.log('🔄 Sincronizando comandos globalmente...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commandsArray },
        );

        console.log('✨ ¡Comandos sincronizados sin duplicados!');
    } catch (error) {
        console.error('❌ Error al registrar comandos:', error);
    }

    try { 
        await client.user.setPresence({ 
            status: "online", 
            activities: [
                {
                    name: "chivando siempre 👀",
                    type: 0
                }
            ]
        }); 
        console.log("🟢 Estado ONLINE establecido"); 
    } catch(error) { 
        console.log("⚠️ Error presencia:", error.message); 
    } 

    // ====================== //
    // TRACKER AUTOMÁTICO     //
    // ====================== //
    console.log("🔎 Tracker iniciado cada 30 segundos"); 
    let trackerRevisando = false; 

    try { 
        await revisarTrackers(client); 
    } catch(error) { 
        console.log("❌ Error revisión inicial tracker:", error.message); 
    } 

    setInterval(async () => { 
        if (trackerRevisando) { 
            console.log("⏳ Tracker anterior todavía ejecutándose..."); 
            return; 
        } 

        trackerRevisando = true; 

        try { 
            await revisarTrackers(client); 
        } catch(error) { 
            console.log("❌ Error tracker automático:", error.message); 
        } finally { 
            trackerRevisando = false; 
        } 
    }, 30 * 1000); 
});