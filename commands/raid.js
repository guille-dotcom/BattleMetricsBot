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
// LISTA MASIVA Y DEFINITIVA DE TODOS LOS ÍTEMS RAIDEABLES DE RUST
// =====================================================

const OBJETOS_RUST = [
    // 🚪 PUERTAS Y ESCOTILLAS
    { name: "Puerta de Madera (Wood Door)", value: "Wood Door" },
    { name: "Puerta de Chapa / Metal (Sheet Metal Door)", value: "Sheet Metal Door" },
    { name: "Puerta de Garaje (Garage Door)", value: "Garage Door" },
    { name: "Puerta Blindada (Armored Door)", value: "Armored Door" },
    { name: "Puerta Doble de Madera (Wood Double Door)", value: "Wood Double Door" },
    { name: "Puerta Doble de Metal (Sheet Metal Double Door)", value: "Sheet Metal Double Door" },
    { name: "Puerta Doble Blindada (Armored Double Door)", value: "Armored Double Door" },
    { name: "Trampilla de Madera (Wood Ladder Hatch)", value: "Wood Ladder Hatch" },
    { name: "Trampilla de Hierro (Ladder Hatch)", value: "Ladder Hatch" },
    { name: "Trampilla Blindada (Armored Ladder Hatch)", value: "Armored Ladder Hatch" },
    { name: "Trampilla Triangular Blindada (Armored Triangle Ladder Hatch)", value: "Armored Triangle Ladder Hatch" },

    // 🧱 PAREDES Y ESTRUCTURAS (BUILDING BLOCKS)
    { name: "Pared de Ramita / Twig (Twig Wall)", value: "Twig Wall" },
    { name: "Pared de Madera (Wood Wall)", value: "Wood Wall" },
    { name: "Pared de Piedra (Stone Wall)", value: "Stone Wall" },
    { name: "Pared de Metal (Metal Wall)", value: "Metal Wall" },
    { name: "Pared Blindada / HQ (Armored Wall)", value: "Armored Wall" },
    { name: "Pared con Ventana de Piedra (Stone Window Wall)", value: "Stone Window Wall" },
    { name: "Pared con Puerta de Piedra (Stone Doorway)", value: "Stone Doorway" },
    { name: "Medio Muro de Piedra (Stone Half Wall)", value: "Stone Half Wall" },

    // 🏗️ CIMIENTOS Y SUELOS
    { name: "Cimiento de Madera (Wood Foundation)", value: "Wood Foundation" },
    { name: "Cimiento de Piedra (Stone Foundation)", value: "Stone Foundation" },
    { name: "Cimiento de Metal (Metal Foundation)", value: "Metal Foundation" },
    { name: "Cimiento Blindado (Armored Foundation)", value: "Armored Foundation" },
    { name: "Suelo de Madera (Wood Floor)", value: "Wood Floor" },
    { name: "Suelo de Piedra (Stone Floor)", value: "Stone Floor" },
    { name: "Suelo de Metal (Metal Floor)", value: "Metal Floor" },
    { name: "Suelo Blindado (Armored Floor)", value: "Armored Floor" },
    { name: "Techo / Roof", value: "Roof" },
    // 🚧 BARRICADAS Y TRAMPAS
    { name: "Barricada de madera (Wooden Barricade)", value: "Wooden Barricade" },
    { name: "Barricada de metal (Metal Barricade)", value: "Metal Barricade" },
    { name: "Barricada de pinchos (Wooden Spike Barricade)", value: "Wooden Spike Barricade" },
    { name: "Barricada de pinchos con espino (Spike Trap)", value: "Spike Trap" },

    // 🪟 VENTANAS, REJAS Y TRONERAS
    { name: "Reja de Ventana de Madera (Wooden Window Bars)", value: "Wooden Window Bars" },
    { name: "Reja de Ventana de Metal (Metal Window Bars)", value: "Metal Window Bars" },
    { name: "Tronera Horizontal de Metal (Metal Horizontal Embrasure)", value: "Metal Horizontal Embrasure" },
    { name: "Tronera Vertical de Metal (Metal Vertical Embrasure)", value: "Metal Vertical Embrasure" },
    { name: "Reja de Suelo (Floor Grill)", value: "Floor Grill" },
    { name: "Ventana de Cristal Reforzado (Reinforced Glass Window)", value: "Reinforced Glass Window" },
    { name: "Tienda / Mostrador de Metal (Metal Shop Front)", value: "Metal Shop Front" },
    { name: "Pared de Celda de Prisión (Prison Cell Wall)", value: "Prison Cell Wall" },
    { name: "Puerta de Celda de Prisión (Prison Cell Gate)", value: "Prison Cell Gate" },

    // 🏰 MUROS Y PORTONES EXTERNOS
    { name: "Muro Alto de Madera (High External Wooden Wall)", value: "High External Wooden Wall" },
    { name: "Muro Alto de Piedra (High External Stone Wall)", value: "High External Stone Wall" },
    { name: "Portón Alto de Madera (High External Wooden Gate)", value: "High External Wooden Gate" },
    { name: "Portón Alto de Piedra (High External Stone Gate)", value: "High External Stone Gate" },

    // 📦 ALMACENAMIENTO Y DEPLOYABLES
    { name: "Armario de Herramientas / TC (Tool Cupboard)", value: "Tool Cupboard" },
    { name: "Caja Pequeña de Madera (Small Wood Box)", value: "Small Wood Box" },
    { name: "Caja Grande de Madera (Large Wood Box)", value: "Large Wood Box" },
    { name: "Ataúd (Coffin)", value: "Coffin" },
    { name: "Armario / Locker", value: "Locker" },
    { name: "Nevera (Fridge)", value: "Fridge" },
    { name: "Máquina Expendedora (Vending Machine)", value: "Vending Machine" },
    { name: "Horno Pequeño (Furnace)", value: "Furnace" },
    { name: "Horno Grande (Large Furnace)", value: "Large Furnace" },
    { name: "Refinería de Aceite (Small Oil Refinery)", value: "Small Oil Refinery" },

    // ⚡ ELECTRICIDAD Y ENERGÍA
    { name: "Molino de Viento (Wind Turbine)", value: "Wind Turbine" },
    { name: "Panel Solar (Solar Panel)", value: "Solar Panel" },
    { name: "Batería Grande (Large Rechargeable Battery)", value: "Large Rechargeable Battery" },
    { name: "Batería Mediana (Medium Rechargeable Battery)", value: "Medium Rechargeable Battery" },

    // 🛠️ MESAS DE TRABAJO Y UTILIDADES
    { name: "Mesa de Trabajo Nivel 1 (Workbench Level 1)", value: "Workbench Level 1" },
    { name: "Mesa de Trabajo Nivel 2 (Workbench Level 2)", value: "Workbench Level 2" },
    { name: "Mesa de Trabajo Nivel 3 (Workbench Level 3)", value: "Workbench Level 3" },
    { name: "Mesa de Investigación (Research Table)", value: "Research Table" },
    { name: "Banco de Reparación (Repair Bench)", value: "Repair Bench" },
    { name: "Mesa de Mezclas (Mixing Table)", value: "Mixing Table" },

    // ⚔️ DEFENSAS, TRAMPAS Y BARRICADAS
    { name: "Torreta Automática (Auto Turret)", value: "Auto Turret" },
    { name: "Torreta Lanzallamas (Flame Turret)", value: "Flame Turret" },
    { name: "Trampa de Escopeta (Shotgun Trap)", value: "Shotgun Trap" },
    { name: "Sitio SAM / Antiaéreo (SAM Site)", value: "SAM Site" },
    { name: "Barricada de Madera con Púas (Barbed Wooden Barricade)", value: "Barbed Wooden Barricade" },
    { name: "Barricada de Metal (Metal Barricade)", value: "Metal Barricade" },
    { name: "Barco Remolcador (Tugboat)", value: "Tugboat" }
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