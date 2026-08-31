const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const { consultarRaid } = require("../services/rusthelp");

// =====================================================
// CACHE
// =====================================================

const raidCache = new Map();
const CACHE_TIME = 5 * 60 * 1000;

// =====================================================
// LISTA COMPLETA DE OBJETOS DE RUST (JERGA DE JUGADORES)
// =====================================================

const OBJETOS_RUST = [
    // 🚪 PUERTAS
    { name: "Puerta simple de madera", value: "Wood Door" },
    { name: "Puerta doble de madera", value: "Wood Double Door" },
    { name: "Puerta simple de chapa / metal", value: "Sheet Metal Door" },
    { name: "Puerta doble de chapa / metal", value: "Sheet Metal Double Door" },
    { name: "Puerta de garaje (Garage Door)", value: "Garage Door" },
    { name: "Puerta simple blindada / HQ", value: "Armored Door" },
    { name: "Puerta doble blindada / HQ", value: "Armored Double Door" },
    
    // 🪜 TRAMPILLAS
    { name: "Trampilla simple de metal / chapa", value: "Ladder Hatch" },
    { name: "Trampilla triangular de metal / chapa", value: "Triangle Ladder Hatch" },
    { name: "Trampilla simple blindada / HQ", value: "Armored Ladder Hatch" },
    { name: "Trampilla triangular blindada / HQ", value: "Armored Triangle Ladder Hatch" },

    // 🧱 PAREDES (BUILDING BLOCKS)
    { name: "Pared de paja (Twig)", value: "Twig Wall" },
    { name: "Pared de madera", value: "Wood Wall" },
    { name: "Pared de piedra", value: "Stone Wall" },
    { name: "Pared de metal / chapa", value: "Metal Wall" },
    { name: "Pared blindada / HQ", value: "Armored Wall" },
    { name: "Pared con ventana de piedra", value: "Stone Window Wall" },
    { name: "Pared con puerta de piedra (Doorway)", value: "Stone Doorway" },
    { name: "Medio muro de piedra", value: "Stone Half Wall" },

    // 🏗️ CIMIENTOS Y SUELOS
    { name: "Cimiento de piedra", value: "Stone Foundation" },
    { name: "Cimiento de metal", value: "Metal Foundation" },
    { name: "Cimiento blindado / HQ", value: "Armored Foundation" },
    { name: "Cimiento triangular de piedra", value: "Stone Triangle Foundation" },
    { name: "Suelo de piedra", value: "Stone Floor" },
    { name: "Suelo de metal", value: "Metal Floor" },
    { name: "Suelo blindado / HQ", value: "Armored Floor" },
    { name: "Suelo triangular de piedra", value: "Stone Triangle Floor" },
    { name: "Techo (Roof)", value: "Roof" },

    // 🪟 VENTANAS, REJAS Y TRONERAS
    { name: "Reja de ventana de metal", value: "Metal Window Bars" },
    { name: "Tronera horizontal de metal", value: "Metal Horizontal Embrasure" },
    { name: "Tronera vertical de metal", value: "Metal Vertical Embrasure" },
    { name: "Reja de suelo (Floor Grill)", value: "Floor Grill" },
    { name: "Ventana de cristal reforzado", value: "Reinforced Glass Window" },
    { name: "Tienda / Mostrador (Shop Front)", value: "Metal Shop Front" },
    { name: "Pared de celda de prisión", value: "Prison Cell Wall" },
    { name: "Puerta de celda de prisión", value: "Prison Cell Gate" },

    // 🏰 MUROS Y PORTONES EXTERNOS
    { name: "Muro alto de madera (High External)", value: "High External Wooden Wall" },
    { name: "Muro alto de piedra", value: "High External Stone Wall" },
    { name: "Portón alto de madera", value: "High External Wooden Gate" },
    { name: "Portón alto de piedra", value: "High External Stone Gate" },

    // 📦 ALMACENAMIENTO Y DEPLOYABLES
    { name: "Armario de herramientas (TC)", value: "Tool Cupboard" },
    { name: "Caja pequeña de madera", value: "Small Wood Box" },
    { name: "Caja grande de madera", value: "Large Wood Box" },
    { name: "Ataúd (Coffin)", value: "Coffin" },
    { name: "Armario (Locker)", value: "Locker" },
    { name: "Nevera (Fridge)", value: "Fridge" },
    { name: "Máquina expendedora (Vending)", value: "Vending Machine" },
    { name: "Horno pequeño (Furnace)", value: "Furnace" },
    { name: "Horno grande (Large Furnace)", value: "Large Furnace" },
    { name: "Refinería de aceite", value: "Small Oil Refinery" },

    // ⚡ ELECTRICIDAD Y ENERGÍA
    { name: "Molino de viento (Wind Turbine)", value: "Wind Turbine" },
    { name: "Panel solar", value: "Solar Panel" },
    { name: "Batería grande", value: "Large Rechargeable Battery" },
    { name: "Batería mediana", value: "Medium Rechargeable Battery" },

    // 🛠️ MESAS DE TRABAJO Y UTILIDADES
    { name: "Mesa de trabajo nivel 1 (WB1)", value: "Workbench Level 1" },
    { name: "Mesa de trabajo nivel 2 (WB2)", value: "Workbench Level 2" },
    { name: "Mesa de trabajo nivel 3 (WB3)", value: "Workbench Level 3" },
    { name: "Mesa de investigación", value: "Research Table" },
    { name: "Banco de reparación", value: "Repair Bench" },

    // ⚔️ DEFENSAS Y BARRICADAS
    { name: "Torreta automática (Auto Turret)", value: "Auto Turret" },
    { name: "Torreta lanzallamas", value: "Flame Turret" },
    { name: "Trampa de escopeta", value: "Shotgun Trap" },
    { name: "SAM / Antiaéreo/ SAM-SITE", value: "SAM Site" },
    { name: "Barricada de madera", value: "Wooden Barricade" },
    { name: "Barricada de metal", value: "Metal Barricade" },
    { name: "Barricada de pinchos", value: "Wooden Spike Barricade" },
    { name: "Barricada de pinchos con espino", value: "Spike Trap" },
    { name: "Pachuru (Tugboat)", value: "Tugboat" }
];

// =====================================================
// UTILIDADES
// =====================================================

function limpiarTexto(texto) {
    return String(texto || "")
        .replace(/\s+/g, " ")
        .trim();
}

function limitarTexto(texto, max = 1024) {
    const limpio = String(texto || "").trim();

    if (limpio.length <= max) {
        return limpio;
    }

    return limpio.slice(0, max - 3) + "...";
}

function convertirASegundosVista(tiempo) {
    const texto = String(tiempo || "").toLowerCase().replace(/,/g, ".");
    if (!texto) return 0;
    let total = 0;
    const horas = texto.match(/(\d+(?:\.\d+)?)\s*h/);
    const minutos = texto.match(/(\d+(?:\.\d+)?)\s*m/);
    const segundos = texto.match(/(\d+(?:\.\d+)?)\s*s/);
    if (horas) total += parseFloat(horas[1]) * 3600;
    if (minutos) total += parseFloat(minutos[1]) * 60;
    if (segundos) total += parseFloat(segundos[1]);
    return total;
}

// =====================================================
// FORMATEAR STARTING ITEMS
// =====================================================

function formatearStartingItems(items) {
    if (!Array.isArray(items) || items.length === 0) {
        return "No hay datos disponibles.";
    }

    const lineas = items.map((item, index) => {
        const nombre = limpiarTexto(item.herramienta);
        const tiempo = limpiarTexto(item.tiempo);
        const cantidad = limpiarTexto(item.cantidad);

        let linea = `**${index + 1}.** ${nombre}`;

        if (cantidad && cantidad !== "x0" && cantidad !== "0") {
            const cantidadLimpia = cantidad.split(" ")[0].replace(/^x/i, "");
            linea += ` \`×${cantidadLimpia}\``;
        }

        if (tiempo) {
            linea += ` ⏱️ \`${tiempo}\``;
        }

        return linea;
    });

    return limitarTexto(lineas.join("\n"));
}

// =====================================================
// FORMATEAR RAIDING COST (Con filtro y ordenado por tiempo)
// =====================================================

function formatearRaidingCost(items, categoriaFiltro = "all") {
    if (!Array.isArray(items) || items.length === 0) {
        return "No hay datos disponibles.";
    }

    // Filtrar por categoría ('melee' o 'all')
    const itemsFiltrados = items.filter(item => {
        if (categoriaFiltro === "melee") {
            return item.categoria === "melee";
        }
        // Para "all" (botón Raideo), excluimos los de melee para dejar explosivos y balas arriba
        return item.categoria !== "melee";
    });

    if (itemsFiltrados.length === 0) {
        return "No hay elementos de esta categoría disponibles.";
    }

    // Ordenar estrictamente de menor a mayor tiempo
    const itemsOrdenados = [...itemsFiltrados].sort((a, b) => {
        return convertirASegundosVista(a.tiempo) - convertirASegundosVista(b.tiempo);
    });

    const lineas = itemsOrdenados.map((item, index) => {
        const nombre = limpiarTexto(item.herramienta);
        const tiempo = limpiarTexto(item.tiempo);
        const cantidad = limpiarTexto(item.cantidad);

        let linea = `**${index + 1}.** ${nombre}`;

        if (cantidad) {
            const cantidadLimpia = cantidad.replace(/^x/i, "");
            linea += ` \`×${cantidadLimpia}\``;
        }

        if (tiempo) {
            linea += ` ⏱️ \`${tiempo}\``;
        }

        return linea;
    });

    return limitarTexto(lineas.join("\n"));
}

// =====================================================
// FORMATEAR DÓNDE ENCONTRAR
// =====================================================

function crearTextoAmount(items) {
    if (!Array.isArray(items) || items.length === 0) {
        return "No hay datos disponibles.";
    }

    const lineas = items.map((item, index) => {
        const nombre = limpiarTexto(item.herramienta);
        const tiempo = limpiarTexto(item.tiempo);

        let linea = `**${index + 1}.** ${nombre}`;

        if (tiempo) {
            linea += ` — ${tiempo}`;
        }

        return linea;
    });

    return limitarTexto(lineas.join("\n"));
}

// =====================================================
// CREAR EMBED BASE
// =====================================================

function crearEmbed(resultado) {
    return new EmbedBuilder()
        .setTitle(`💥 Raid Calculator: ${resultado.nombre}`)
        .setURL(resultado.url)
        .setColor("#E67E22")
        .setFooter({
            text: "Fuente: RustHelp"
        })
        .setTimestamp();
}

// =====================================================
// CREAR BOTONES (3 Botones exactos)
// =====================================================

function crearBotones(cacheKey) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`raid_raideo_${cacheKey}`)
            .setLabel("Raideo")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🔨"),

        new ButtonBuilder()
            .setCustomId(`raid_melee_${cacheKey}`)
            .setLabel("Melee")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("⚔️"),

        new ButtonBuilder()
            .setCustomId(`raid_donde_${cacheKey}`)
            .setLabel("Dónde encontrar")
            .setStyle(ButtonStyle.Success)
            .setEmoji("🔍")
    );
}

// =====================================================
// AGREGAR INFORMACIÓN DE RAID
// =====================================================

function agregarInformacionRaid(embed, resultado, tipoVista = "all") {
    if (tipoVista === "all") {
        if (
            Array.isArray(resultado.startingItems) &&
            resultado.startingItems.length > 0
        ) {
            embed.addFields({
                name: "⚡ Starting Items",
                value: formatearStartingItems(resultado.startingItems),
                inline: false
            });
        }
    }

    if (
        Array.isArray(resultado.raidingCost) &&
        resultado.raidingCost.length > 0
    ) {
        const tituloSeccion = tipoVista === "melee" ? "⚔️ Raiding Cost (Melee)" : "🔨 Raiding Cost";
        
        embed.addFields({
            name: tituloSeccion,
            value: formatearRaidingCost(resultado.raidingCost, tipoVista),
            inline: false
        });
    } else {
        embed.addFields({
            name: "🔨 Raideo",
            value: "No hay datos de raideo disponibles.",
            inline: false
        });
    }
}

// =====================================================
// COMANDO
// =====================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName("raid")
        .setDescription("Calcula los costos de raid para cualquier objeto de Rust.")
        .addStringOption(option =>
            option
                .setName("objeto")
                .setDescription("Busca y selecciona cualquier objeto a raidear")
                .setRequired(true)
                .setAutocomplete(true) // 👈 Autocompletado nativo activado
                .setMaxLength(100)
        ),

    // =====================================================
    // FUNCIÓN DE AUTOCOMPLETADO
    // =====================================================
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();

        // Filtra dinámicamente entre todos los elementos de la lista
        const filtered = OBJETOS_RUST.filter(choice => 
            choice.name.toLowerCase().includes(focusedValue) ||
            choice.value.toLowerCase().includes(focusedValue)
        );

        // Discord solo permite un máximo de 25 opciones por respuesta de autocompletado
        await interaction.respond(
            filtered.slice(0, 25).map(choice => ({ name: choice.name, value: choice.value }))
        );
    },

    async execute(interaction) {
        await interaction.deferReply();

        const query = interaction.options.getString("objeto")?.trim();

        if (!query) {
            return interaction.editReply("❌ Debes indicar un objeto.");
        }

        let resultado;

        try {
            resultado = await consultarRaid(query);
        } catch (error) {
            console.error("❌ Error ejecutando /raid:", error);
            return interaction.editReply("❌ Ocurrió un error al consultar RustHelp.");
        }

        if (!resultado) {
            return interaction.editReply(`❌ No se encontró información para **"${query}"**.`);
        }

        const cacheKey = `${interaction.user.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        raidCache.set(cacheKey, resultado);

        setTimeout(() => {
            raidCache.delete(cacheKey);
        }, CACHE_TIME);

        const embed = crearEmbed(resultado);
        agregarInformacionRaid(embed, resultado, "all");

        const row = crearBotones(cacheKey);

        try {
            await interaction.editReply({
                embeds: [embed],
                components: [row]
            });
        } catch (error) {
            console.error("❌ Error enviando respuesta /raid:", error.message);
        }
    },

    async manejarBotonRaid(interaction) {
        const customId = interaction.customId;

        if (!customId.startsWith("raid_")) {
            return;
        }

        const parts = customId.split("_");

        if (parts.length < 3) {
            return;
        }

        await interaction.deferUpdate();

        const tipo = parts[1];
        const cacheKey = parts.slice(2).join("_");
        const resultado = raidCache.get(cacheKey);

        if (!resultado) {
            return interaction.followUp({
                content: "⚠️ Estos botones han expirado. Vuelve a ejecutar `/raid`.",
                ephemeral: true
            });
        }

        const embed = crearEmbed(resultado);

        if (tipo === "raideo") {
            agregarInformacionRaid(embed, resultado, "all");
        } else if (tipo === "melee") {
            agregarInformacionRaid(embed, resultado, "melee");
        } else if (tipo === "donde") {
            embed.addFields({
                name: "🔍 Dónde encontrar",
                value: crearTextoAmount(resultado.dondeEncontrar),
                inline: false
            });
        } else {
            return interaction.followUp({
                content: "⚠️ Esta opción de raid no es válida.",
                ephemeral: true
            });
        }

        try {
            await interaction.editReply({
                embeds: [embed],
                components: [crearBotones(cacheKey)]
            });
        } catch (error) {
            console.error("❌ Error actualizando botón /raid:", error.message);
        }
    }
};