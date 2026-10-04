const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionFlagsBits
} = require("discord.js");

const MiniGameProfile =
    require("../models/MiniGameProfile");

// ============================================================
// CONFIGURACIÓN
// ============================================================

const MAX_JUGADORES = 10;

const TIEMPO_ESPERA_PARTIDA = 60 * 1000;
const TIEMPO_DUELO = 60 * 1000;

const COOLDOWN_TRAGAPERRAS = 10 * 1000;

const PRECIO_COLOR_PERSONALIZADO = 300;

// ============================================================
// COLORES PERSONALIZADOS
// ============================================================

const COLORES_PERSONALIZADOS = {
    rojo: {
        nombre: "Rojo",
        emoji: "🔴",
        valor: "#FF0000"
    },

    naranja: {
        nombre: "Naranja",
        emoji: "🟠",
        valor: "#FF8C00"
    },

    amarillo: {
        nombre: "Amarillo",
        emoji: "🟡",
        valor: "#FFD700"
    },

    verde: {
        nombre: "Verde",
        emoji: "🟢",
        valor: "#00FF00"
    },

    azul: {
        nombre: "Azul",
        emoji: "🔵",
        valor: "#0080FF"
    },

    morado: {
        nombre: "Morado",
        emoji: "🟣",
        valor: "#8000FF"
    },

    rosa: {
        nombre: "Rosa",
        emoji: "🩷",
        valor: "#FF69B4"
    },

    celeste: {
        nombre: "Celeste",
        emoji: "🩵",
        valor: "#00BFFF"
    },

    blanco: {
        nombre: "Blanco",
        emoji: "⚪",
        valor: "#FFFFFF"
    },

    negro: {
        nombre: "Negro",
        emoji: "⚫",
        valor: "#000000"
    }
};

// ============================================================
// PARTIDAS ACTIVAS
// ============================================================

const partidasDados = new Map();
const partidasDuelo = new Map();
const partidasCaraOCruz = new Map();
const partidasBlackjack = new Map();

// ============================================================
// TRAGAPERRAS
// ============================================================

const cooldownTragaperras = new Map();

// ============================================================
// COLORES PENDIENTES
// ============================================================

const coloresPendientes = new Map();

// ============================================================
// PERFIL
// ============================================================

async function obtenerPerfil(guildId, userId) {
    let perfil = await MiniGameProfile.findOne({
        guildId,
        userId
    });

    if (!perfil) {
        perfil = await MiniGameProfile.create({
            guildId,
            userId,
            puntos: 0,
            victorias: 0,
            derrotas: 0,
            partidas: 0
        });
    }

    return perfil;
}

// ============================================================
// REGISTRAR RESULTADO
// ============================================================

async function registrarResultado(
    guildId,
    userId,
    resultado,
    puntos
) {
    const perfil =
        await obtenerPerfil(
            guildId,
            userId
        );

    perfil.partidas += 1;
    perfil.puntos += puntos;

    if (resultado === "victoria") {
        perfil.victorias += 1;
    }

    if (resultado === "derrota") {
        perfil.derrotas += 1;
    }

    await perfil.save();

    return perfil;
}

// ============================================================
// EMBED PRINCIPAL
// ============================================================

function crearEmbedPrincipal() {
    return new EmbedBuilder()
        .setTitle("🎮 RUSTLOGIX ARCADE")
        .setDescription(
            [
                "¡Bienvenido al arcade de **RustLogix**!",
                "",
                "🎲 **Dados Multijugador**",
                "⚔️ **Duelo 1vs1**",
                "🪙 **Cara o Cruz**",
                "🃏 **21 / Blackjack**",
                "🎰 **Tragaperras**",
                "🏆 **Mis Estadísticas**",
                "🛒 **Tienda**",
                "",
                "🪙 Consigue puntos jugando y úsalos en la tienda."
            ].join("\n")
        )
        .setColor(0x5865F2);
}

// ============================================================
// MENU PRINCIPAL
// ============================================================

function crearMenuPrincipal() {
    return new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId("minijuegos_menu")
                .setPlaceholder(
                    "Selecciona un minijuego..."
                )
                .addOptions([
                    {
                        label: "Dados Multijugador",
                        description:
                            "Juega con hasta 10 jugadores",
                        value: "dados",
                        emoji: "🎲"
                    },
                    {
                        label: "Duelo 1vs1",
                        description:
                            "Enfréntate a otro jugador",
                        value: "duelo",
                        emoji: "⚔️"
                    },
                    {
                        label: "Cara o Cruz",
                        description:
                            "Apuesta por cara o cruz",
                        value: "cara_cruz",
                        emoji: "🪙"
                    },
                    {
                        label: "21 / Blackjack",
                        description:
                            "Intenta acercarte a 21",
                        value: "blackjack",
                        emoji: "🃏"
                    },
                    {
                        label: "Tragaperras",
                        description:
                            "Juega solo y gana puntos",
                        value: "tragaperras",
                        emoji: "🎰"
                    },
                    {
                        label: "Mis Estadísticas",
                        description:
                            "Consulta tus estadísticas",
                        value: "estadisticas",
                        emoji: "🏆"
                    },
                    {
                        label: "Tienda",
                        description:
                            "Compra recompensas con tus puntos",
                        value: "tienda",
                        emoji: "🛒"
                    }
                ])
        );
}

// ============================================================
// BOTÓN VOLVER
// ============================================================

function botonVolver() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(
                    "minijuegos_volver"
                )
                .setLabel("Volver")
                .setEmoji("↩️")
                .setStyle(
                    ButtonStyle.Secondary
                )
        );
}

// ============================================================
// ESTADÍSTICAS
// ============================================================

async function mostrarEstadisticas(
    interaction
) {
    const perfil =
        await obtenerPerfil(
            interaction.guild.id,
            interaction.user.id
        );

    const porcentaje =
        perfil.partidas > 0
            ? (
                (perfil.victorias /
                    perfil.partidas) *
                100
            ).toFixed(1)
            : "0.0";

    const embed =
        new EmbedBuilder()
            .setTitle(
                "🏆 MIS ESTADÍSTICAS"
            )
            .setThumbnail(
                interaction.user.displayAvatarURL()
            )
            .addFields(
                {
                    name: "🪙 Puntos",
                    value:
                        `**${perfil.puntos}**`,
                    inline: true
                },
                {
                    name: "🎮 Partidas",
                    value:
                        `**${perfil.partidas}**`,
                    inline: true
                },
                {
                    name: "🏆 Victorias",
                    value:
                        `**${perfil.victorias}**`,
                    inline: true
                },
                {
                    name: "💀 Derrotas",
                    value:
                        `**${perfil.derrotas}**`,
                    inline: true
                },
                {
                    name: "📊 Winrate",
                    value:
                        `**${porcentaje}%**`,
                    inline: true
                }
            )
            .setColor(0xF1C40F);

    await interaction.update({
        embeds: [embed],
        components: [
            botonVolver()
        ]
    });
}

// ============================================================
// TIENDA
// ============================================================

function crearEmbedTienda(
    perfil
) {
    return new EmbedBuilder()
        .setTitle(
            "🛒 TIENDA RUSTLOGIX"
        )
        .setDescription(
            [
                `🪙 Tus puntos: **${perfil.puntos}**`,
                "",
                "🎨 **Color personalizado**",
                `💰 Precio: **${PRECIO_COLOR_PERSONALIZADO} puntos**`,
                "",
                "Elige un color y después escribe el nombre que quieres para tu rol.",
                "",
                "Ejemplo:",
                "`VIP Naranja`"
            ].join("\n")
        )
        .setColor(0x5865F2);
}

function crearMenuTienda() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(
                    "minijuegos_tienda_color"
                )
                .setLabel(
                    "Comprar color personalizado"
                )
                .setEmoji("🎨")
                .setStyle(
                    ButtonStyle.Primary
                ),

            new ButtonBuilder()
                .setCustomId(
                    "minijuegos_volver"
                )
                .setLabel("Volver")
                .setEmoji("↩️")
                .setStyle(
                    ButtonStyle.Secondary
                )
        );
}

// ============================================================
// SELECTOR DE COLORES
// ============================================================

function crearMenuColores() {
    return new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(
                    "minijuegos_color_seleccionar"
                )
                .setPlaceholder(
                    "Selecciona un color..."
                )
                .addOptions(
                    Object.entries(
                        COLORES_PERSONALIZADOS
                    ).map(
                        ([key, color]) => ({
                            label:
                                color.nombre,
                            description:
                                `Color ${color.nombre.toLowerCase()}`,
                            value: key,
                            emoji:
                                color.emoji
                        })
                    )
                )
        );
}

// ============================================================
// MODAL NOMBRE DEL ROL
// ============================================================

function crearModalNombreRol() {
    const input =
        new TextInputBuilder()
            .setCustomId(
                "minijuegos_nombre_rol"
            )
            .setLabel(
                "¿Qué nombre quieres ponerle al rol?"
            )
            .setPlaceholder(
                "Ejemplo: VIP Naranja"
            )
            .setStyle(
                TextInputStyle.Short
            )
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(100);

    return new ModalBuilder()
        .setCustomId(
            "minijuegos_modal_nombre_color"
        )
        .setTitle(
            "Nombre del rol"
        )
        .addComponents(
            new ActionRowBuilder()
                .addComponents(input)
        );
}

// ============================================================
// TRAGAPERRAS
// ============================================================

const SIMBOLOS_TRAGAPERRAS = [
    "🍒",
    "🍋",
    "🍊",
    "💎",
    "7️⃣"
];

function obtenerSimboloTragaperras() {
    return SIMBOLOS_TRAGAPERRAS[
        Math.floor(
            Math.random() *
            SIMBOLOS_TRAGAPERRAS.length
        )
    ];
}

function calcularPremioTragaperras(
    resultado
) {
    const [
        a,
        b,
        c
    ] = resultado;

    // ========================================================
    // TRES IGUALES
    // ========================================================

    if (
        a === b &&
        b === c
    ) {
        switch (a) {
            case "🍒":
                return 100;

            case "🍋":
                return 150;

            case "🍊":
                return 200;

            case "💎":
                return 400;

            case "7️⃣":
                return 800;
        }
    }

    // ========================================================
    // DOS IGUALES
    // ========================================================

    if (
        a === b ||
        a === c ||
        b === c
    ) {
        return 40;
    }

    return 0;
}

function crearEmbedTragaperras(
    resultado,
    premio,
    puntosActuales
) {
    let mensaje;

    if (premio >= 800) {
        mensaje =
            "🎉 ¡¡¡PREMIO GORDO!!!";
    } else if (premio > 0) {
        mensaje =
            "🎊 ¡Has ganado puntos!";
    } else {
        mensaje =
            "😢 No ha habido premio esta vez.";
    }

    return new EmbedBuilder()
        .setTitle(
            "🎰 TRAGAPERRAS"
        )
        .setDescription(
            [
                "╔══════════════╗",
                `   ${resultado.join("   ")}`,
                "╚══════════════╝",
                "",
                `**${mensaje}**`,
                "",
                premio > 0
                    ? `🪙 Premio: **+${premio} puntos**`
                    : "🪙 Premio: **0 puntos**",
                "",
                `💰 Tus puntos: **${puntosActuales}**`,
                "",
                "⏱️ Puedes volver a jugar en **10 segundos**."
            ].join("\n")
        )
        .setColor(
            premio >= 800
                ? 0xFFD700
                : premio > 0
                    ? 0x57F287
                    : 0xED4245
        );
}

function crearMenuTragaperras() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(
                    "minijuegos_tragaperras_jugar"
                )
                .setLabel("Jugar")
                .setEmoji("🎰")
                .setStyle(
                    ButtonStyle.Success
                ),

            new ButtonBuilder()
                .setCustomId(
                    "minijuegos_volver"
                )
                .setLabel("Volver")
                .setEmoji("↩️")
                .setStyle(
                    ButtonStyle.Secondary
                )
        );
}

async function jugarTragaperras(
    interaction
) {
    const key =
        `${interaction.guild.id}:${interaction.user.id}`;

    const ahora =
        Date.now();

    const ultimoJuego =
        cooldownTragaperras.get(key) ||
        0;

    const restante =
        COOLDOWN_TRAGAPERRAS -
        (ahora - ultimoJuego);

    if (restante > 0) {
        const segundos =
            Math.ceil(
                restante / 1000
            );

        return interaction.reply({
            content:
                `⏱️ Tienes que esperar **${segundos} segundos** para volver a jugar.`,
            ephemeral: true
        });
    }

    cooldownTragaperras.set(
        key,
        ahora
    );

    const resultado = [
        obtenerSimboloTragaperras(),
        obtenerSimboloTragaperras(),
        obtenerSimboloTragaperras()
    ];

    const premio =
        calcularPremioTragaperras(
            resultado
        );

    const perfil =
        await registrarResultado(
            interaction.guild.id,
            interaction.user.id,
            premio > 0
                ? "victoria"
                : "derrota",
            premio
        );

    await interaction.update({
        embeds: [
            crearEmbedTragaperras(
                resultado,
                premio,
                perfil.puntos
            )
        ],
        components: [
            crearMenuTragaperras()
        ]
    });
}

// ============================================================
// DADOS
// ============================================================

function crearEmbedDados(
    partida
) {
    const jugadores =
        partida.jugadores
            .map(
                (id, index) => {
                    const nombre =
                        partida.nombres.get(
                            id
                        ) ||
                        "Jugador";

                    return `${index + 1}. ${nombre}`;
                }
            )
            .join("\n");

    return new EmbedBuilder()
        .setTitle(
            "🎲 DADOS MULTIJUGADOR"
        )
        .setDescription(
            [
                `Jugadores: **${partida.jugadores.length}/${MAX_JUGADORES}**`,
                "",
                jugadores ||
                    "Nadie se ha unido todavía.",
                "",
                "🪙 Participar: **+10 puntos**",
                "🏆 Ganar: **+100 puntos**",
                "🤝 Empate: **+50 puntos**",
                "",
                "La partida comienza al pulsar **Empezar** o cuando termine el tiempo."
            ].join("\n")
        )
        .setColor(0x5865F2);
}

function crearBotonesDados(
    messageId
) {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `minijuegos_dados_unirse_${messageId}`
                )
                .setLabel("Unirse")
                .setEmoji("➕")
                .setStyle(
                    ButtonStyle.Success
                ),

            new ButtonBuilder()
                .setCustomId(
                    `minijuegos_dados_empezar_${messageId}`
                )
                .setLabel("Empezar")
                .setEmoji("🎲")
                .setStyle(
                    ButtonStyle.Primary
                ),

            new ButtonBuilder()
                .setCustomId(
                    `minijuegos_dados_cancelar_${messageId}`
                )
                .setLabel("Cancelar")
                .setEmoji("❌")
                .setStyle(
                    ButtonStyle.Danger
                )
        );
}

async function iniciarDados(
    interaction
) {
    const partida = {
        creador:
            interaction.user.id,

        jugadores: [
            interaction.user.id
        ],

        nombres: new Map([
            [
                interaction.user.id,
                interaction.user.username
            ]
        ]),

        finalizada: false,
        timeout: null
    };

    await interaction.update({
        embeds: [
            crearEmbedDados(partida)
        ],
        components: [
            new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            "minijuegos_dados_unirse"
                        )
                        .setLabel("Unirse")
                        .setEmoji("➕")
                        .setStyle(
                            ButtonStyle.Success
                        ),

                    new ButtonBuilder()
                        .setCustomId(
                            "minijuegos_dados_empezar"
                        )
                        .setLabel("Empezar")
                        .setEmoji("🎲")
                        .setStyle(
                            ButtonStyle.Primary
                        ),

                    new ButtonBuilder()
                        .setCustomId(
                            "minijuegos_dados_cancelar"
                        )
                        .setLabel("Cancelar")
                        .setEmoji("❌")
                        .setStyle(
                            ButtonStyle.Danger
                        )
                )
        ]
    });

    const message =
        await interaction.fetchReply();

    partidasDados.set(
        message.id,
        partida
    );

    partida.timeout =
        setTimeout(
            () =>
                terminarDados(
                    interaction.channel,
                    message.id
                ),
            TIEMPO_ESPERA_PARTIDA
        );

    await message.edit({
        embeds: [
            crearEmbedDados(partida)
        ],
        components: [
            crearBotonesDados(
                message.id
            )
        ]
    });
}

async function terminarDados(
    channel,
    messageId
) {
    const partida =
        partidasDados.get(
            messageId
        );

    if (
        !partida ||
        partida.finalizada
    ) {
        return;
    }

    partida.finalizada = true;

    if (partida.timeout) {
        clearTimeout(
            partida.timeout
        );
    }

    partidasDados.delete(
        messageId
    );

    if (
        partida.jugadores.length < 2
    ) {
        try {
            const message =
                await channel.messages.fetch(
                    messageId
                );

            await message.edit({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(
                            "🎲 DADOS"
                        )
                        .setDescription(
                            "❌ No había suficientes jugadores para comenzar."
                        )
                        .setColor(
                            0xED4245
                        )
                ],
                components: []
            });
        } catch {}

        return;
    }

    const resultados =
        partida.jugadores.map(
            userId => ({
                userId,
                nombre:
                    partida.nombres.get(
                        userId
                    ) ||
                    "Jugador",
                dado:
                    Math.floor(
                        Math.random() * 6
                    ) + 1
            })
        );

    const maximo =
        Math.max(
            ...resultados.map(
                jugador =>
                    jugador.dado
            )
        );

    const ganadores =
        resultados.filter(
            jugador =>
                jugador.dado ===
                maximo
        );

    for (
        const jugador of resultados
    ) {
        const esGanador =
            ganadores.some(
                ganador =>
                    ganador.userId ===
                    jugador.userId
            );

        await registrarResultado(
            channel.guild.id,
            jugador.userId,
            esGanador
                ? "victoria"
                : "derrota",
            esGanador
                ? (
                    ganadores.length === 1
                        ? 110
                        : 60
                )
                : 10
        );
    }

    const texto =
        resultados
            .sort(
                (a, b) =>
                    b.dado - a.dado
            )
            .map(
                jugador =>
                    `${jugador.dado === maximo ? "🏆" : "🎲"} **${jugador.nombre}** → ${jugador.dado}`
            )
            .join("\n");

    const ganadoresTexto =
        ganadores
            .map(
                jugador =>
                    jugador.nombre
            )
            .join(", ");

    try {
        const message =
            await channel.messages.fetch(
                messageId
            );

        await message.edit({
            embeds: [
                new EmbedBuilder()
                    .setTitle(
                        "🎲 RESULTADO DE LOS DADOS"
                    )
                    .setDescription(
                        [
                            texto,
                            "",
                            ganadores.length === 1
                                ? `🏆 Ganador: **${ganadoresTexto}**`
                                : `🤝 Empate entre: **${ganadoresTexto}**`,
                            "",
                            "🪙 Participación: +10 puntos",
                            ganadores.length === 1
                                ? "🏆 Ganador: +100 puntos"
                                : "🤝 Empate: +50 puntos"
                        ].join("\n")
                    )
                    .setColor(
                        0x57F287
                    )
            ],
            components: []
        });
    } catch {}
}

// ============================================================
// DUELO 1VS1
// ============================================================

function crearEmbedDuelo(
    partida
) {
    const jugadores =
        partida.jugadores
            .map(
                id =>
                    `⚔️ ${partida.nombres.get(id) || "Jugador"}`
            )
            .join("\n");

    return new EmbedBuilder()
        .setTitle(
            "⚔️ DUELO 1VS1"
        )
        .setDescription(
            [
                jugadores,
                "",
                `Jugadores: **${partida.jugadores.length}/2**`,
                "",
                "Pulsa **Unirse al duelo** para enfrentarte al creador.",
                "",
                "⏱️ El duelo expira en 60 segundos."
            ].join("\n")
        )
        .setColor(0xED4245);
}

function crearBotonesDuelo(
    messageId
) {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `minijuegos_duelo_unirse_${messageId}`
                )
                .setLabel(
                    "Unirse al duelo"
                )
                .setEmoji("⚔️")
                .setStyle(
                    ButtonStyle.Danger
                ),

            new ButtonBuilder()
                .setCustomId(
                    `minijuegos_duelo_cancelar_${messageId}`
                )
                .setLabel("Cancelar")
                .setEmoji("❌")
                .setStyle(
                    ButtonStyle.Secondary
                )
        );
}

async function iniciarDuelo(
    interaction
) {
    const partida = {
        creador:
            interaction.user.id,

        jugadores: [
            interaction.user.id
        ],

        nombres: new Map([
            [
                interaction.user.id,
                interaction.user.username
            ]
        ]),

        finalizada: false,
        timeout: null
    };

    await interaction.update({
        embeds: [
            crearEmbedDuelo(partida)
        ],
        components: [
            crearBotonesDuelo(
                "pendiente"
            )
        ]
    });

    const message =
        await interaction.fetchReply();

    partidasDuelo.set(
        message.id,
        partida
    );

    partida.timeout =
        setTimeout(
            () =>
                cancelarDueloPorTiempo(
                    interaction.channel,
                    message.id
                ),
            TIEMPO_DUELO
        );

    await message.edit({
        embeds: [
            crearEmbedDuelo(partida)
        ],
        components: [
            crearBotonesDuelo(
                message.id
            )
        ]
    });
}

async function comenzarDuelo(
    interaction,
    messageId
) {
    const partida =
        partidasDuelo.get(
            messageId
        );

    if (
        !partida ||
        partida.finalizada
    ) {
        return;
    }

    if (
        partida.jugadores.length < 2
    ) {
        return interaction.reply({
            content:
                "❌ Todavía falta un jugador.",
            ephemeral: true
        });
    }

    partida.finalizada = true;

    if (partida.timeout) {
        clearTimeout(
            partida.timeout
        );
    }

    partidasDuelo.delete(
        messageId
    );

    const jugador1 =
        partida.jugadores[0];

    const jugador2 =
        partida.jugadores[1];

    const dado1 =
        Math.floor(
            Math.random() * 6
        ) + 1;

    const dado2 =
        Math.floor(
            Math.random() * 6
        ) + 1;

    let resultado;

    if (dado1 === dado2) {
        resultado = "empate";
    } else if (
        dado1 > dado2
    ) {
        resultado = jugador1;
    } else {
        resultado = jugador2;
    }

    const esEmpate =
        resultado === "empate";

    await registrarResultado(
        interaction.guild.id,
        jugador1,
        esEmpate
            ? "victoria"
            : resultado === jugador1
                ? "victoria"
                : "derrota",
        esEmpate
            ? 60
            : resultado === jugador1
                ? 110
                : 10
    );

    await registrarResultado(
        interaction.guild.id,
        jugador2,
        esEmpate
            ? "victoria"
            : resultado === jugador2
                ? "victoria"
                : "derrota",
        esEmpate
            ? 60
            : resultado === jugador2
                ? 110
                : 10
    );

    const nombre1 =
        partida.nombres.get(
            jugador1
        );

    const nombre2 =
        partida.nombres.get(
            jugador2
        );

    const texto =
        esEmpate
            ? [
                "🤝 **¡EMPATE!**",
                "",
                `${nombre1}: 🎲 **${dado1}**`,
                `${nombre2}: 🎲 **${dado2}**`
            ].join("\n")
            : [
                `🏆 **${resultado === jugador1 ? nombre1 : nombre2} gana el duelo**`,
                "",
                `${nombre1}: 🎲 **${dado1}**`,
                `${nombre2}: 🎲 **${dado2}**`
            ].join("\n");

    await interaction.update({
        embeds: [
            new EmbedBuilder()
                .setTitle(
                    "⚔️ RESULTADO DEL DUELO"
                )
                .setDescription(
                    [
                        texto,
                        "",
                        "🏆 Victoria: +100 puntos",
                        "🤝 Empate: +50 puntos",
                        "🪙 Participación: +10 puntos"
                    ].join("\n")
                )
                .setColor(
                    0x57F287
                )
        ],
        components: []
    });
}

async function cancelarDueloPorTiempo(
    channel,
    messageId
) {
    const partida =
        partidasDuelo.get(
            messageId
        );

    if (!partida) {
        return;
    }

    partidasDuelo.delete(
        messageId
    );

    try {
        const message =
            await channel.messages.fetch(
                messageId
            );

        await message.edit({
            embeds: [
                new EmbedBuilder()
                    .setTitle(
                        "⚔️ DUELO"
                    )
                    .setDescription(
                        "⌛ El tiempo para encontrar un rival ha terminado."
                    )
                    .setColor(
                        0xED4245
                    )
            ],
            components: []
        });
    } catch {}
}

// ============================================================
// CARA O CRUZ
// ============================================================

function crearEmbedCaraOCruz() {
    return new EmbedBuilder()
        .setTitle(
            "🪙 CARA O CRUZ"
        )
        .setDescription(
            [
                "Elige una opción.",
                "",
                "🙂 **Cara** → +20 puntos si aciertas",
                "✖️ **Cruz** → +20 puntos si aciertas",
                "",
                "❌ Si fallas, no ganas puntos."
            ].join("\n")
        )
        .setColor(0xF1C40F);
}

function crearBotonesCaraOCruz() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(
                    "minijuegos_cara"
                )
                .setLabel("Cara")
                .setEmoji("🙂")
                .setStyle(
                    ButtonStyle.Primary
                ),

            new ButtonBuilder()
                .setCustomId(
                    "minijuegos_cruz"
                )
                .setLabel("Cruz")
                .setEmoji("✖️")
                .setStyle(
                    ButtonStyle.Primary
                ),

            new ButtonBuilder()
                .setCustomId(
                    "minijuegos_volver"
                )
                .setLabel("Volver")
                .setEmoji("↩️")
                .setStyle(
                    ButtonStyle.Secondary
                )
        );
}

async function jugarCaraOCruz(
    interaction,
    eleccion
) {
    const resultado =
        Math.random() < 0.5
            ? "cara"
            : "cruz";

    const acierto =
        eleccion === resultado;

    const puntos =
        acierto
            ? 20
            : 0;

    const perfil =
        await registrarResultado(
            interaction.guild.id,
            interaction.user.id,
            acierto
                ? "victoria"
                : "derrota",
            puntos
        );

    await interaction.update({
        embeds: [
            new EmbedBuilder()
                .setTitle(
                    "🪙 RESULTADO CARA O CRUZ"
                )
                .setDescription(
                    [
                        `Tu elección: **${eleccion === "cara" ? "🙂 Cara" : "✖️ Cruz"}**`,
                        `Resultado: **${resultado === "cara" ? "🙂 Cara" : "✖️ Cruz"}**`,
                        "",
                        acierto
                            ? "🎉 **¡Has acertado! +20 puntos**"
                            : "❌ **Has fallado.**",
                        "",
                        `🪙 Puntos actuales: **${perfil.puntos}**`
                    ].join("\n")
                )
                .setColor(
                    acierto
                        ? 0x57F287
                        : 0xED4245
                )
        ],
        components: [
            crearBotonesCaraOCruz()
        ]
    });
}

// ============================================================
// BLACKJACK
// ============================================================

function cartaAleatoria() {
    return (
        Math.floor(
            Math.random() * 10
        ) + 1
    );
}

function calcularMano(
    cartas
) {
    return cartas.reduce(
        (total, carta) =>
            total + carta,
        0
    );
}

function crearEmbedBlackjack(
    partida
) {
    return new EmbedBuilder()
        .setTitle(
            "🃏 21 / BLACKJACK"
        )
        .setDescription(
            [
                `Tus cartas: **${partida.cartas.join(" • ")}**`,
                "",
                `🎯 Total: **${calcularMano(partida.cartas)}**`,
                "",
                "🃏 **Pedir** → roba otra carta",
                "🛑 **Plantarse** → termina la partida",
                "",
                "🎯 Llegar a 21: **+100 puntos**",
                "🏆 Plantarse: **+50 puntos**"
            ].join("\n")
        )
        .setColor(0x9B59B6);
}

function crearBotonesBlackjack() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(
                    "minijuegos_blackjack_pedir"
                )
                .setLabel("Pedir")
                .setEmoji("🃏")
                .setStyle(
                    ButtonStyle.Primary
                ),

            new ButtonBuilder()
                .setCustomId(
                    "minijuegos_blackjack_plantarse"
                )
                .setLabel("Plantarse")
                .setEmoji("🛑")
                .setStyle(
                    ButtonStyle.Success
                ),

            new ButtonBuilder()
                .setCustomId(
                    "minijuegos_volver"
                )
                .setLabel("Volver")
                .setEmoji("↩️")
                .setStyle(
                    ButtonStyle.Secondary
                )
        );
}

async function iniciarBlackjack(
    interaction
) {
    const partida = {
        userId:
            interaction.user.id,

        cartas: [
            cartaAleatoria(),
            cartaAleatoria()
        ],

        finalizada: false
    };

    await interaction.update({
        embeds: [
            crearEmbedBlackjack(
                partida
            )
        ],
        components: [
            crearBotonesBlackjack()
        ]
    });

    const reply =
        await interaction.fetchReply();

    partidasBlackjack.set(
        reply.id,
        partida
    );
}

async function finalizarBlackjack(
    interaction,
    partida,
    resultado,
    puntos
) {
    partida.finalizada = true;

    const perfil =
        await registrarResultado(
            interaction.guild.id,
            interaction.user.id,
            resultado,
            puntos
        );

    partidasBlackjack.delete(
        interaction.message.id
    );

    await interaction.update({
        embeds: [
            new EmbedBuilder()
                .setTitle(
                    "🃏 RESULTADO BLACKJACK"
                )
                .setDescription(
                    [
                        `Tus cartas: **${partida.cartas.join(" • ")}**`,
                        "",
                        `🎯 Total: **${calcularMano(partida.cartas)}**`,
                        "",
                        resultado ===
                            "victoria"
                            ? `🎉 **¡Has ganado! +${puntos} puntos**`
                            : "❌ **Has perdido.**",
                        "",
                        `🪙 Puntos actuales: **${perfil.puntos}**`
                    ].join("\n")
                )
                .setColor(
                    resultado ===
                        "victoria"
                        ? 0x57F287
                        : 0xED4245
                )
        ],
        components: [
            botonVolver()
        ]
    });
}

// ============================================================
// EJECUTAR COMANDO
// ============================================================

async function ejecutar(
    interaction
) {
    await interaction.reply({
        embeds: [
            crearEmbedPrincipal()
        ],
        components: [
            crearMenuPrincipal()
        ]
    });
}

// ============================================================
// SELECT MENUS
// ============================================================

async function manejarSelectMenu(
    interaction
) {
    if (
        interaction.customId ===
        "minijuegos_menu"
    ) {
        const opcion =
            interaction.values[0];

        if (opcion === "dados") {
            return iniciarDados(
                interaction
            );
        }

        if (opcion === "duelo") {
            return iniciarDuelo(
                interaction
            );
        }

        if (
            opcion === "cara_cruz"
        ) {
            return interaction.update({
                embeds: [
                    crearEmbedCaraOCruz()
                ],
                components: [
                    crearBotonesCaraOCruz()
                ]
            });
        }

        if (
            opcion === "blackjack"
        ) {
            return iniciarBlackjack(
                interaction
            );
        }

        if (
            opcion === "tragaperras"
        ) {
            return interaction.update({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(
                            "🎰 TRAGAPERRAS"
                        )
                        .setDescription(
                            [
                                "Prueba tu suerte.",
                                "",
                                "🍒🍒🍒 → **+100 puntos**",
                                "🍋🍋🍋 → **+150 puntos**",
                                "🍊🍊🍊 → **+200 puntos**",
                                "💎💎💎 → **+400 puntos**",
                                "7️⃣7️⃣7️⃣ → **+800 puntos**",
                                "",
                                "🔸 Dos iguales → **+40 puntos**",
                                "🔸 Todo diferente → **0 puntos**",
                                "",
                                "⏱️ Puedes jugar cada **10 segundos**."
                            ].join("\n")
                        )
                        .setColor(
                            0xE67E22
                        )
                ],
                components: [
                    crearMenuTragaperras()
                ]
            });
        }

        if (
            opcion === "estadisticas"
        ) {
            return mostrarEstadisticas(
                interaction
            );
        }

        if (
            opcion === "tienda"
        ) {
            const perfil =
                await obtenerPerfil(
                    interaction.guild.id,
                    interaction.user.id
                );

            return interaction.update({
                embeds: [
                    crearEmbedTienda(
                        perfil
                    )
                ],
                components: [
                    crearMenuTienda()
                ]
            });
        }
    }

    // ========================================================
    // SELECCIÓN DE COLOR
    // ========================================================

    if (
        interaction.customId ===
        "minijuegos_color_seleccionar"
    ) {
        const colorKey =
            interaction.values[0];

        const color =
            COLORES_PERSONALIZADOS[
                colorKey
            ];

        if (!color) {
            return interaction.reply({
                content:
                    "❌ Ese color no existe.",
                ephemeral: true
            });
        }

        const perfil =
            await obtenerPerfil(
                interaction.guild.id,
                interaction.user.id
            );

        if (
            perfil.puntos <
            PRECIO_COLOR_PERSONALIZADO
        ) {
            return interaction.reply({
                content:
                    `❌ Necesitas **${PRECIO_COLOR_PERSONALIZADO} puntos** y tienes **${perfil.puntos}**.`,
                ephemeral: true
            });
        }

        const key =
            `${interaction.guild.id}:${interaction.user.id}`;

        coloresPendientes.set(
            key,
            {
                colorKey,
                expiresAt:
                    Date.now() +
                    5 * 60 * 1000
            }
        );

        return interaction.showModal(
            crearModalNombreRol()
        );
    }

    return false;
}

// ============================================================
// BOTONES
// ============================================================

async function manejarBoton(
    interaction
) {
    const id =
        interaction.customId;

    // ========================================================
    // VOLVER
    // ========================================================

    if (
        id ===
        "minijuegos_volver"
    ) {
        return interaction.update({
            embeds: [
                crearEmbedPrincipal()
            ],
            components: [
                crearMenuPrincipal()
            ]
        });
    }

    // ========================================================
    // TIENDA
    // ========================================================

    if (
        id ===
        "minijuegos_tienda_color"
    ) {
        const perfil =
            await obtenerPerfil(
                interaction.guild.id,
                interaction.user.id
            );

        if (
            perfil.puntos <
            PRECIO_COLOR_PERSONALIZADO
        ) {
            return interaction.reply({
                content:
                    `❌ Necesitas **${PRECIO_COLOR_PERSONALIZADO} puntos** para comprar un color personalizado.\n\n🪙 Actualmente tienes **${perfil.puntos}**.`,
                ephemeral: true
            });
        }

        return interaction.update({
            embeds: [
                new EmbedBuilder()
                    .setTitle(
                        "🎨 ELIGE TU COLOR"
                    )
                    .setDescription(
                        [
                            `🪙 Precio: **${PRECIO_COLOR_PERSONALIZADO} puntos**`,
                            "",
                            "Selecciona el color que quieres para tu rol.",
                            "",
                            "Después podrás escribir el **nombre personalizado** del rol."
                        ].join("\n")
                    )
                    .setColor(
                        0x5865F2
                    )
            ],
            components: [
                crearMenuColores(),
                botonVolver()
            ]
        });
    }

    // ========================================================
    // TRAGAPERRAS
    // ========================================================

    if (
        id ===
        "minijuegos_tragaperras_jugar"
    ) {
        return jugarTragaperras(
            interaction
        );
    }

    // ========================================================
    // DADOS - UNIRSE
    // ========================================================

    if (
        id.startsWith(
            "minijuegos_dados_unirse_"
        )
    ) {
        const messageId =
            id.replace(
                "minijuegos_dados_unirse_",
                ""
            );

        const partida =
            partidasDados.get(
                messageId
            );

        if (
            !partida ||
            partida.finalizada
        ) {
            return interaction.reply({
                content:
                    "❌ Esta partida ya ha terminado.",
                ephemeral: true
            });
        }

        if (
            partida.jugadores.includes(
                interaction.user.id
            )
        ) {
            return interaction.reply({
                content:
                    "❌ Ya estás dentro de esta partida.",
                ephemeral: true
            });
        }

        if (
            partida.jugadores.length >=
            MAX_JUGADORES
        ) {
            return interaction.reply({
                content:
                    "❌ La partida está llena.",
                ephemeral: true
            });
        }

        partida.jugadores.push(
            interaction.user.id
        );

        partida.nombres.set(
            interaction.user.id,
            interaction.user.username
        );

        return interaction.update({
            embeds: [
                crearEmbedDados(
                    partida
                )
            ],
            components: [
                crearBotonesDados(
                    messageId
                )
            ]
        });
    }

    // ========================================================
    // DADOS - EMPEZAR
    // ========================================================

    if (
        id.startsWith(
            "minijuegos_dados_empezar_"
        )
    ) {
        const messageId =
            id.replace(
                "minijuegos_dados_empezar_",
                ""
            );

        const partida =
            partidasDados.get(
                messageId
            );

        if (!partida) {
            return interaction.reply({
                content:
                    "❌ Esta partida ya ha terminado.",
                ephemeral: true
            });
        }

        if (
            partida.creador !==
            interaction.user.id
        ) {
            return interaction.reply({
                content:
                    "❌ Solo el creador puede iniciar la partida.",
                ephemeral: true
            });
        }

        if (
            partida.jugadores.length < 2
        ) {
            return interaction.reply({
                content:
                    "❌ Necesitas al menos 2 jugadores.",
                ephemeral: true
            });
        }

        return terminarDados(
            interaction.channel,
            messageId
        );
    }

    // ========================================================
    // DADOS - CANCELAR
    // ========================================================

    if (
        id.startsWith(
            "minijuegos_dados_cancelar_"
        )
    ) {
        const messageId =
            id.replace(
                "minijuegos_dados_cancelar_",
                ""
            );

        const partida =
            partidasDados.get(
                messageId
            );

        if (!partida) {
            return interaction.reply({
                content:
                    "❌ Esta partida ya ha terminado.",
                ephemeral: true
            });
        }

        if (
            partida.creador !==
            interaction.user.id
        ) {
            return interaction.reply({
                content:
                    "❌ Solo el creador puede cancelar la partida.",
                ephemeral: true
            });
        }

        partida.finalizada =
            true;

        if (partida.timeout) {
            clearTimeout(
                partida.timeout
            );
        }

        partidasDados.delete(
            messageId
        );

        return interaction.update({
            embeds: [
                new EmbedBuilder()
                    .setTitle(
                        "🎲 DADOS"
                    )
                    .setDescription(
                        "❌ La partida ha sido cancelada."
                    )
                    .setColor(
                        0xED4245
                    )
            ],
            components: []
        });
    }

    // ========================================================
    // DUELO - UNIRSE
    // ========================================================

    if (
        id.startsWith(
            "minijuegos_duelo_unirse_"
        )
    ) {
        const messageId =
            id.replace(
                "minijuegos_duelo_unirse_",
                ""
            );

        const partida =
            partidasDuelo.get(
                messageId
            );

        if (
            !partida ||
            partida.finalizada
        ) {
            return interaction.reply({
                content:
                    "❌ Este duelo ya terminó.",
                ephemeral: true
            });
        }

        if (
            partida.jugadores.includes(
                interaction.user.id
            )
        ) {
            return interaction.reply({
                content:
                    "❌ Ya estás dentro del duelo.",
                ephemeral: true
            });
        }

        if (
            partida.jugadores.length >= 2
        ) {
            return interaction.reply({
                content:
                    "❌ El duelo ya está completo.",
                ephemeral: true
            });
        }

        partida.jugadores.push(
            interaction.user.id
        );

        partida.nombres.set(
            interaction.user.id,
            interaction.user.username
        );

        return comenzarDuelo(
            interaction,
            messageId
        );
    }

    // ========================================================
    // DUELO - CANCELAR
    // ========================================================

    if (
        id.startsWith(
            "minijuegos_duelo_cancelar_"
        )
    ) {
        const messageId =
            id.replace(
                "minijuegos_duelo_cancelar_",
                ""
            );

        const partida =
            partidasDuelo.get(
                messageId
            );

        if (!partida) {
            return interaction.reply({
                content:
                    "❌ Este duelo ya terminó.",
                ephemeral: true
            });
        }

        if (
            partida.creador !==
            interaction.user.id
        ) {
            return interaction.reply({
                content:
                    "❌ Solo el creador puede cancelar el duelo.",
                ephemeral: true
            });
        }

        if (partida.timeout) {
            clearTimeout(
                partida.timeout
            );
        }

        partidasDuelo.delete(
            messageId
        );

        return interaction.update({
            embeds: [
                new EmbedBuilder()
                    .setTitle(
                        "⚔️ DUELO"
                    )
                    .setDescription(
                        "❌ El duelo ha sido cancelado."
                    )
                    .setColor(
                        0xED4245
                    )
            ],
            components: []
        });
    }

    // ========================================================
    // CARA O CRUZ
    // ========================================================

    if (
        id ===
        "minijuegos_cara"
    ) {
        return jugarCaraOCruz(
            interaction,
            "cara"
        );
    }

    if (
        id ===
        "minijuegos_cruz"
    ) {
        return jugarCaraOCruz(
            interaction,
            "cruz"
        );
    }

    // ========================================================
    // BLACKJACK - PEDIR
    // ========================================================

    if (
        id ===
        "minijuegos_blackjack_pedir"
    ) {
        const partida =
            partidasBlackjack.get(
                interaction.message.id
            );

        if (
            !partida ||
            partida.finalizada
        ) {
            return interaction.reply({
                content:
                    "❌ Esta partida ya terminó.",
                ephemeral: true
            });
        }

        if (
            partida.userId !==
            interaction.user.id
        ) {
            return interaction.reply({
                content:
                    "❌ Esta partida pertenece a otro jugador.",
                ephemeral: true
            });
        }

        partida.cartas.push(
            cartaAleatoria()
        );

        const total =
            calcularMano(
                partida.cartas
            );

        if (total > 21) {
            return finalizarBlackjack(
                interaction,
                partida,
                "derrota",
                0
            );
        }

        if (total === 21) {
            return finalizarBlackjack(
                interaction,
                partida,
                "victoria",
                100
            );
        }

        return interaction.update({
            embeds: [
                crearEmbedBlackjack(
                    partida
                )
            ],
            components: [
                crearBotonesBlackjack()
            ]
        });
    }

    // ========================================================
    // BLACKJACK - PLANTARSE
    // ========================================================

    if (
        id ===
        "minijuegos_blackjack_plantarse"
    ) {
        const partida =
            partidasBlackjack.get(
                interaction.message.id
            );

        if (
            !partida ||
            partida.finalizada
        ) {
            return interaction.reply({
                content:
                    "❌ Esta partida ya terminó.",
                ephemeral: true
            });
        }

        if (
            partida.userId !==
            interaction.user.id
        ) {
            return interaction.reply({
                content:
                    "❌ Esta partida pertenece a otro jugador.",
                ephemeral: true
            });
        }

        const total =
            calcularMano(
                partida.cartas
            );

        if (total >= 17) {
            return finalizarBlackjack(
                interaction,
                partida,
                "victoria",
                50
            );
        }

        return finalizarBlackjack(
            interaction,
            partida,
            "derrota",
            0
        );
    }

    return false;
}

// ============================================================
// MODALES
// ============================================================

async function manejarModal(
    interaction
) {
    if (
        interaction.customId !==
        "minijuegos_modal_nombre_color"
    ) {
        return false;
    }

    const key =
        `${interaction.guild.id}:${interaction.user.id}`;

    const pendiente =
        coloresPendientes.get(
            key
        );

    if (!pendiente) {
        return interaction.reply({
            content:
                "❌ La selección del color ha caducado. Vuelve a intentarlo.",
            ephemeral: true
        });
    }

    if (
        Date.now() >
        pendiente.expiresAt
    ) {
        coloresPendientes.delete(
            key
        );

        return interaction.reply({
            content:
                "❌ La selección del color ha caducado. Vuelve a intentarlo.",
            ephemeral: true
        });
    }

    const color =
        COLORES_PERSONALIZADOS[
            pendiente.colorKey
        ];

    if (!color) {
        coloresPendientes.delete(
            key
        );

        return interaction.reply({
            content:
                "❌ El color seleccionado no existe.",
            ephemeral: true
        });
    }

    const nombreRol =
        interaction.fields
            .getTextInputValue(
                "minijuegos_nombre_rol"
            )
            .trim();

    if (!nombreRol) {
        return interaction.reply({
            content:
                "❌ Debes escribir un nombre para el rol.",
            ephemeral: true
        });
    }

    if (
        nombreRol ===
        "@everyone" ||
        nombreRol ===
        "@here"
    ) {
        return interaction.reply({
            content:
                "❌ Ese nombre no está permitido.",
            ephemeral: true
        });
    }

    const botMember =
        interaction.guild.members.me ||
        await interaction.guild.members.fetch(
            interaction.client.user.id
        );

    if (
        !botMember.permissions.has(
            PermissionFlagsBits.ManageRoles
        )
    ) {
        coloresPendientes.delete(
            key
        );

        return interaction.reply({
            content:
                "❌ RustLogix no tiene permiso para administrar roles.",
            ephemeral: true
        });
    }

    const perfil =
        await obtenerPerfil(
            interaction.guild.id,
            interaction.user.id
        );

    if (
        perfil.puntos <
        PRECIO_COLOR_PERSONALIZADO
    ) {
        coloresPendientes.delete(
            key
        );

        return interaction.reply({
            content:
                `❌ Ya no tienes suficientes puntos. Necesitas **${PRECIO_COLOR_PERSONALIZADO}** y tienes **${perfil.puntos}**.`,
            ephemeral: true
        });
    }

    try {
        const rol =
            await interaction.guild.roles.create({
                name: nombreRol,
                color: color.valor,
                reason:
                    `Compra de color personalizado en RustLogix - ${interaction.user.tag}`
            });

        const miembro =
            await interaction.guild.members.fetch(
                interaction.user.id
            );

        await miembro.roles.add(
            rol,
            "Compra de color personalizado en RustLogix"
        );

        perfil.puntos -=
            PRECIO_COLOR_PERSONALIZADO;

        await perfil.save();

        coloresPendientes.delete(
            key
        );

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle(
                        "🎨 ¡ROL CREADO!"
                    )
                    .setDescription(
                        [
                            `🎨 Color: ${color.emoji} **${color.nombre}**`,
                            `🏷️ Nombre: **${rol.name}**`,
                            "",
                            `👤 El rol ha sido asignado a ${interaction.user}.`,
                            "",
                            `💰 Precio: **${PRECIO_COLOR_PERSONALIZADO} puntos**`,
                            `🪙 Puntos restantes: **${perfil.puntos}**`
                        ].join("\n")
                    )
                    .setColor(
                        color.valor
                    )
            ]
        });
    } catch (error) {
        console.error(
            "❌ Error creando rol personalizado:",
            error
        );

        coloresPendientes.delete(
            key
        );

        return interaction.reply({
            content:
                "❌ No pude crear o asignar el rol. Comprueba que RustLogix tenga `Administrar roles` y que su rol esté por encima de los roles que crea.",
            ephemeral: true
        });
    }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName("minijuegos")
        .setDescription(
            "Juega a minijuegos y consigue puntos"
        ),

    // IMPORTANTE:
    // index.js busca "execute", no "ejecutar".
    execute: ejecutar,

    manejarBoton,

    manejarSelectMenu,

    manejarModal
};