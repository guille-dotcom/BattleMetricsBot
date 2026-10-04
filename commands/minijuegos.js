const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require("discord.js");

const MiniGameProfile =
    require("../models/MiniGameProfile");

// ============================================================
// CONFIGURACIÓN
// ============================================================

const MAX_JUGADORES = 10;

const TIEMPO_ESPERA_PARTIDA =
    60 * 1000;

const TIEMPO_DUELO =
    60 * 1000;

const TIEMPO_CARA_CRUZ =
    60 * 1000;

const COOLDOWN_TRAGAPERRAS =
    10 * 1000;

// ============================================================
// TIENDA
// ============================================================

const PRECIO_COLOR_PERSONALIZADO = 300;

// ============================================================
// COLORES DISPONIBLES
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
// COOLDOWN TRAGAPERRAS
// ============================================================

const cooldownTragaperras = new Map();

// ============================================================
// COLORES PENDIENTES DE NOMBRE
// ============================================================
//
// Guarda temporalmente el color seleccionado mientras el usuario
// escribe el nombre del rol en el Modal.
//
// Clave:
// guildId:userId
//
// ============================================================

const coloresPendientes = new Map();

// ============================================================
// COMANDO
// ============================================================

const data =
    new SlashCommandBuilder()
        .setName("minijuegos")
        .setDescription(
            "🎮 Juega minijuegos interactivos con otros usuarios."
        );

// ============================================================
// PERFIL
// ============================================================

async function obtenerPerfil(
    guildId,
    userId
) {
    let perfil =
        await MiniGameProfile.findOne({
            guildId,
            userId
        });

    if (!perfil) {
        perfil =
            await MiniGameProfile.create({
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

    if (
        resultado === "victoria"
    ) {
        perfil.victorias += 1;
    }

    if (
        resultado === "derrota"
    ) {
        perfil.derrotas += 1;
    }

    await perfil.save();
}

// ============================================================
// MENU PRINCIPAL
// ============================================================

function crearMenuPrincipal() {
    const embed =
        new EmbedBuilder()
            .setTitle(
                "🎮 RUSTLOGIX ARCADE"
            )
            .setDescription(
                "¡Bienvenido a los minijuegos de RustLogix!\n\n" +
                "Selecciona una opción en el menú de abajo.\n\n" +

                "🎲 **Dados Multijugador**\n" +
                "Juega contra varios usuarios y lanza los dados.\n\n" +

                "⚔️ **Duelo 1vs1**\n" +
                "Reta a otro jugador a un duelo.\n\n" +

                "🪙 **Cara o Cruz**\n" +
                "Desafía a otro jugador en un lanzamiento de moneda.\n\n" +

                "🃏 **21 / Blackjack**\n" +
                "Juega contra la banca intentando acercarte a 21.\n\n" +

                "🎰 **Tragaperras**\n" +
                "Juega solo y consigue puntos cada 10 segundos.\n\n" +

                "🏆 **Mis Estadísticas**\n" +
                "Consulta tus puntos, victorias y partidas.\n\n" +

                "🛒 **Tienda**\n" +
                "Gasta tus puntos en recompensas."
            )
            .setColor(0x5865F2)
            .setFooter({
                text:
                    "RustLogix • Minijuegos"
            });

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                "minijuegos_menu"
            )
            .setPlaceholder(
                "🎮 Selecciona una opción"
            )
            .addOptions([
                {
                    label:
                        "Dados Multijugador",
                    description:
                        "Juega dados contra varios jugadores.",
                    value:
                        "dados",
                    emoji:
                        "🎲"
                },

                {
                    label:
                        "Duelo 1vs1",
                    description:
                        "Reta a otro jugador.",
                    value:
                        "duelo",
                    emoji:
                        "⚔️"
                },

                {
                    label:
                        "Cara o Cruz",
                    description:
                        "Desafía a otro jugador.",
                    value:
                        "cara_cruz",
                    emoji:
                        "🪙"
                },

                {
                    label:
                        "21 / Blackjack",
                    description:
                        "Juega Blackjack contra la banca.",
                    value:
                        "blackjack",
                    emoji:
                        "🃏"
                },

                {
                    label:
                        "Tragaperras",
                    description:
                        "Juega solo y consigue puntos.",
                    value:
                        "tragaperras",
                    emoji:
                        "🎰"
                },

                {
                    label:
                        "Mis Estadísticas",
                    description:
                        "Mira tus puntos y victorias.",
                    value:
                        "estadisticas",
                    emoji:
                        "🏆"
                },

                {
                    label:
                        "Tienda",
                    description:
                        "Gasta tus puntos en recompensas.",
                    value:
                        "tienda",
                    emoji:
                        "🛒"
                }
            ]);

    return {
        embeds: [
            embed
        ],
        components: [
            new ActionRowBuilder()
                .addComponents(
                    menu
                )
        ]
    };
}

// ============================================================
// MENU TIENDA
// ============================================================

async function crearMenuTienda(
    interaction
) {
    const perfil =
        await obtenerPerfil(
            interaction.guild.id,
            interaction.user.id
        );

    const embed =
        new EmbedBuilder()
            .setTitle(
                "🛒 TIENDA RUSTLOGIX"
            )
            .setDescription(
                "Gasta los puntos que consigues jugando a los minijuegos.\n\n" +

                `💰 **Tus puntos:** **${perfil.puntos}**\n\n` +

                "🎨 **Color personalizado**\n" +
                "Crea un rol con el nombre que tú quieras y el color que elijas.\n\n" +

                `💰 Precio: **${PRECIO_COLOR_PERSONALIZADO} puntos**\n\n` +

                "Pulsa el botón para comenzar."
            )
            .setColor(0xF1C40F)
            .setFooter({
                text:
                    "RustLogix • Tienda"
            });

    const comprar =
        new ButtonBuilder()
            .setCustomId(
                "minijuegos_tienda_color"
            )
            .setLabel(
                `Color personalizado • ${PRECIO_COLOR_PERSONALIZADO} puntos`
            )
            .setEmoji("🎨")
            .setStyle(
                ButtonStyle.Primary
            );

    const volver =
        new ButtonBuilder()
            .setCustomId(
                "minijuegos_volver"
            )
            .setLabel(
                "Volver"
            )
            .setEmoji("↩️")
            .setStyle(
                ButtonStyle.Secondary
            );

    return {
        embeds: [
            embed
        ],
        components: [
            new ActionRowBuilder()
                .addComponents(
                    comprar,
                    volver
                )
        ]
    };
}

// ============================================================
// MENU DADOS
// ============================================================

function crearMenuDados() {
    const embed =
        new EmbedBuilder()
            .setTitle(
                "🎲 DADOS MULTIJUGADOR"
            )
            .setDescription(
                "Crea una partida y deja que otros jugadores se unan.\n\n" +

                `👥 Máximo: **${MAX_JUGADORES} jugadores**\n` +
                "⏱️ La partida espera 60 segundos antes de expirar.\n\n" +

                "**Recompensas**\n" +
                "🎮 Participar: **+10 puntos**\n" +
                "🏆 Ganar: **+100 puntos adicionales**\n\n" +

                "Necesitas al menos **2 jugadores** para comenzar."
            )
            .setColor(0xF1C40F)
            .setFooter({
                text:
                    "RustLogix • Dados"
            });

    const crear =
        new ButtonBuilder()
            .setCustomId(
                "minijuegos_dados_crear"
            )
            .setLabel(
                "Crear partida"
            )
            .setEmoji("🎲")
            .setStyle(
                ButtonStyle.Primary
            );

    const volver =
        new ButtonBuilder()
            .setCustomId(
                "minijuegos_volver"
            )
            .setLabel(
                "Volver"
            )
            .setEmoji("↩️")
            .setStyle(
                ButtonStyle.Secondary
            );

    return {
        embeds: [
            embed
        ],
        components: [
            new ActionRowBuilder()
                .addComponents(
                    crear,
                    volver
                )
        ]
    };
}

// ============================================================
// MENSAJE PARTIDA DADOS
// ============================================================

function crearMensajePartida(
    partida
) {
    const jugadoresTexto =
        partida.jugadores
            .map(
                (
                    jugador,
                    index
                ) =>
                    `${index + 1}. <@${jugador.userId}>`
            )
            .join("\n");

    const embed =
        new EmbedBuilder()
            .setTitle(
                "🎲 PARTIDA DE DADOS"
            )
            .setDescription(
                `👑 **Creador:** <@${partida.creadorId}>\n\n` +

                `👥 **Jugadores (${partida.jugadores.length}/${MAX_JUGADORES})**\n` +
                `${jugadoresTexto}\n\n` +

                "🙋 Pulsa **Unirse** para entrar.\n" +
                "🎲 El creador puede iniciar cuando haya al menos 2 jugadores."
            )
            .setColor(0xF1C40F)
            .setFooter({
                text:
                    "La partida expira automáticamente en 60 segundos."
            });

    const unirse =
        new ButtonBuilder()
            .setCustomId(
                `minijuegos_dados_unirse_${partida.id}`
            )
            .setLabel(
                "Unirse"
            )
            .setEmoji("🙋")
            .setStyle(
                ButtonStyle.Success
            )
            .setDisabled(
                partida.jugadores.length >=
                    MAX_JUGADORES
            );

    const iniciar =
        new ButtonBuilder()
            .setCustomId(
                `minijuegos_dados_iniciar_${partida.id}`
            )
            .setLabel(
                "Iniciar partida"
            )
            .setEmoji("🎲")
            .setStyle(
                ButtonStyle.Primary
            );

    const cancelar =
        new ButtonBuilder()
            .setCustomId(
                `minijuegos_dados_cancelar_${partida.id}`
            )
            .setLabel(
                "Cancelar"
            )
            .setEmoji("❌")
            .setStyle(
                ButtonStyle.Danger
            );

    return {
        embeds: [
            embed
        ],
        components: [
            new ActionRowBuilder()
                .addComponents(
                    unirse,
                    iniciar,
                    cancelar
                )
        ]
    };
}

// ============================================================
// MENU DUELO
// ============================================================

function crearMenuDuelo() {
    const embed =
        new EmbedBuilder()
            .setTitle(
                "⚔️ DUELO 1VS1"
            )
            .setDescription(
                "Crea un duelo y espera a que otro jugador acepte.\n\n" +

                "⚔️ Cada jugador lanzará un dado de 1 a 6.\n" +
                "🏆 El jugador con el número más alto gana.\n\n" +

                "**Recompensas**\n" +
                "🎮 Participar: **+10 puntos**\n" +
                "🏆 Ganador: **+100 puntos adicionales**\n\n" +

                "⏱️ El desafío expira después de 60 segundos."
            )
            .setColor(0xE74C3C)
            .setFooter({
                text:
                    "RustLogix • Duelo 1vs1"
            });

    const crear =
        new ButtonBuilder()
            .setCustomId(
                "minijuegos_duelo_crear"
            )
            .setLabel(
                "Crear duelo"
            )
            .setEmoji("⚔️")
            .setStyle(
                ButtonStyle.Danger
            );

    const volver =
        new ButtonBuilder()
            .setCustomId(
                "minijuegos_volver"
            )
            .setLabel(
                "Volver"
            )
            .setEmoji("↩️")
            .setStyle(
                ButtonStyle.Secondary
            );

    return {
        embeds: [
            embed
        ],
        components: [
            new ActionRowBuilder()
                .addComponents(
                    crear,
                    volver
                )
        ]
    };
}

// ============================================================
// MENSAJE DUELO
// ============================================================

function crearMensajeDuelo(
    partida
) {
    const embed =
        new EmbedBuilder()
            .setTitle(
                "⚔️ DUELO 1VS1"
            )
            .setDescription(
                `👤 **Jugador 1:** <@${partida.creadorId}>\n` +

                `👤 **Jugador 2:** ${
                    partida.oponenteId
                        ? `<@${partida.oponenteId}>`
                        : "**Esperando jugador...**"
                }\n\n` +

                "⚔️ Otro jugador puede aceptar el desafío.\n" +
                "🎲 Cuando haya dos jugadores, el creador puede comenzar."
            )
            .setColor(0xE74C3C)
            .setFooter({
                text:
                    "RustLogix • Duelo 1vs1"
            });

    const unirse =
        new ButtonBuilder()
            .setCustomId(
                `minijuegos_duelo_unirse_${partida.id}`
            )
            .setLabel(
                "Aceptar duelo"
            )
            .setEmoji("⚔️")
            .setStyle(
                ButtonStyle.Success
            )
            .setDisabled(
                Boolean(
                    partida.oponenteId
                )
            );

    const iniciar =
        new ButtonBuilder()
            .setCustomId(
                `minijuegos_duelo_iniciar_${partida.id}`
            )
            .setLabel(
                "Iniciar"
            )
            .setEmoji("🎲")
            .setStyle(
                ButtonStyle.Primary
            )
            .setDisabled(
                !partida.oponenteId
            );

    const cancelar =
        new ButtonBuilder()
            .setCustomId(
                `minijuegos_duelo_cancelar_${partida.id}`
            )
            .setLabel(
                "Cancelar"
            )
            .setEmoji("❌")
            .setStyle(
                ButtonStyle.Danger
            );

    return {
        embeds: [
            embed
        ],
        components: [
            new ActionRowBuilder()
                .addComponents(
                    unirse,
                    iniciar,
                    cancelar
                )
        ]
    };
}

// ============================================================
// MENU CARA O CRUZ
// ============================================================

function crearMenuCaraOCruz() {
    const embed =
        new EmbedBuilder()
            .setTitle(
                "🪙 CARA O CRUZ"
            )
            .setDescription(
                "Crea un desafío y espera a que otro jugador se una.\n\n" +

                "🪙 El creador elegirá **Cara** o **Cruz**.\n" +
                "👤 El segundo jugador recibirá automáticamente el lado contrario.\n\n" +

                "**Recompensas**\n" +
                "🎮 Participar: **+10 puntos**\n" +
                "🏆 Ganador: **+100 puntos adicionales**\n\n" +

                "⏱️ El desafío expira después de 60 segundos."
            )
            .setColor(0x3498DB)
            .setFooter({
                text:
                    "RustLogix • Cara o Cruz"
            });

    const crear =
        new ButtonBuilder()
            .setCustomId(
                "minijuegos_cara_cruz_crear"
            )
            .setLabel(
                "Crear desafío"
            )
            .setEmoji("🪙")
            .setStyle(
                ButtonStyle.Primary
            );

    const volver =
        new ButtonBuilder()
            .setCustomId(
                "minijuegos_volver"
            )
            .setLabel(
                "Volver"
            )
            .setEmoji("↩️")
            .setStyle(
                ButtonStyle.Secondary
            );

    return {
        embeds: [
            embed
        ],
        components: [
            new ActionRowBuilder()
                .addComponents(
                    crear,
                    volver
                )
        ]
    };
}

// ============================================================
// MENSAJE CARA O CRUZ
// ============================================================

function crearMensajeCaraOCruz(
    partida
) {
    const embed =
        new EmbedBuilder()
            .setTitle(
                "🪙 DESAFÍO CARA O CRUZ"
            )
            .setDescription(
                `👑 **Creador:** <@${partida.creadorId}>\n` +

                `👤 **Oponente:** ${
                    partida.oponenteId
                        ? `<@${partida.oponenteId}>`
                        : "**Esperando jugador...**"
                }\n\n` +

                (
                    partida.oponenteId
                        ? "🪙 El creador debe elegir **Cara** o **Cruz**."
                        : "🙋 Pulsa **Unirse** para aceptar el desafío."
                )
            )
            .setColor(0x3498DB)
            .setFooter({
                text:
                    "RustLogix • Cara o Cruz"
            });

    const componentes = [];

    if (
        !partida.oponenteId
    ) {
        const unirse =
            new ButtonBuilder()
                .setCustomId(
                    `minijuegos_cara_cruz_unirse_${partida.id}`
                )
                .setLabel(
                    "Unirse"
                )
                .setEmoji("🙋")
                .setStyle(
                    ButtonStyle.Success
                );

        componentes.push(
            new ActionRowBuilder()
                .addComponents(
                    unirse
                )
        );
    } else if (
        !partida.eleccionCreador
    ) {
        const cara =
            new ButtonBuilder()
                .setCustomId(
                    `minijuegos_cara_cruz_cara_${partida.id}`
                )
                .setLabel(
                    "Cara"
                )
                .setEmoji("🙂")
                .setStyle(
                    ButtonStyle.Primary
                );

        const cruz =
            new ButtonBuilder()
                .setCustomId(
                    `minijuegos_cara_cruz_cruz_${partida.id}`
                )
                .setLabel(
                    "Cruz"
                )
                .setEmoji("✖️")
                .setStyle(
                    ButtonStyle.Primary
                );

        componentes.push(
            new ActionRowBuilder()
                .addComponents(
                    cara,
                    cruz
                )
        );
    }

    const cancelar =
        new ButtonBuilder()
            .setCustomId(
                `minijuegos_cara_cruz_cancelar_${partida.id}`
            )
            .setLabel(
                "Cancelar"
            )
            .setEmoji("❌")
            .setStyle(
                ButtonStyle.Danger
            );

    componentes.push(
        new ActionRowBuilder()
            .addComponents(
                cancelar
            )
    );

    return {
        embeds: [
            embed
        ],
        components:
            componentes
    };
}

// ============================================================
// MENU BLACKJACK
// ============================================================

function crearMenuBlackjack() {
    const embed =
        new EmbedBuilder()
            .setTitle(
                "🃏 21 / BLACKJACK"
            )
            .setDescription(
                "Juega contra la banca.\n\n" +

                "🎯 Intenta acercarte a **21** sin pasarte.\n" +
                "🃏 Puedes pedir cartas o plantarte.\n\n" +

                "**Recompensas**\n" +
                "🎮 Victoria: **+100 puntos**\n" +
                "💀 Derrota: **-10 puntos**\n" +
                "🤝 Empate: **+10 puntos**\n\n" +

                "El Blackjack natural paga **+150 puntos**."
            )
            .setColor(0x2ECC71)
            .setFooter({
                text:
                    "RustLogix • Blackjack"
            });

    const jugar =
        new ButtonBuilder()
            .setCustomId(
                "minijuegos_blackjack_jugar"
            )
            .setLabel(
                "Jugar"
            )
            .setEmoji("🃏")
            .setStyle(
                ButtonStyle.Success
            );

    const volver =
        new ButtonBuilder()
            .setCustomId(
                "minijuegos_volver"
            )
            .setLabel(
                "Volver"
            )
            .setEmoji("↩️")
            .setStyle(
                ButtonStyle.Secondary
            );

    return {
        embeds: [
            embed
        ],
        components: [
            new ActionRowBuilder()
                .addComponents(
                    jugar,
                    volver
                )
        ]
    };
}

// ============================================================
// MENU TRAGAPERRAS
// ============================================================

function crearMenuTragaperras() {
    const embed =
        new EmbedBuilder()
            .setTitle(
                "🎰 TRAGAPERRAS RUSTLOGIX"
            )
            .setDescription(
                "Juega solo y consigue puntos.\n\n" +

                "🎰 Pulsa **Jugar** para probar suerte.\n\n" +

                "**Premios**\n" +
                "🍒🍒🍒 → **+20 puntos**\n" +
                "🍋🍋🍋 → **+30 puntos**\n" +
                "🍊🍊🍊 → **+40 puntos**\n" +
                "💎💎💎 → **+100 puntos**\n" +
                "7️⃣7️⃣7️⃣ → **+300 puntos**\n\n" +

                "❌ Cualquier otra combinación → **0 puntos**\n\n" +

                "⏱️ Puedes volver a jugar cada **10 segundos**."
            )
            .setColor(0xF1C40F)
            .setFooter({
                text:
                    "RustLogix • Tragaperras"
            });

    const jugar =
        new ButtonBuilder()
            .setCustomId(
                "minijuegos_tragaperras_jugar"
            )
            .setLabel(
                "Jugar"
            )
            .setEmoji("🎰")
            .setStyle(
                ButtonStyle.Success
            );

    const volver =
        new ButtonBuilder()
            .setCustomId(
                "minijuegos_volver"
            )
            .setLabel(
                "Volver"
            )
            .setEmoji("↩️")
            .setStyle(
                ButtonStyle.Secondary
            );

    return {
        embeds: [
            embed
        ],
        components: [
            new ActionRowBuilder()
                .addComponents(
                    jugar,
                    volver
                )
        ]
    };
}

// ============================================================
// BARAJA BLACKJACK
// ============================================================

function crearBaraja() {
    const palos = [
        "♠️",
        "♥️",
        "♦️",
        "♣️"
    ];

    const valores = [
        {
            nombre: "A",
            valor: 11
        },
        {
            nombre: "2",
            valor: 2
        },
        {
            nombre: "3",
            valor: 3
        },
        {
            nombre: "4",
            valor: 4
        },
        {
            nombre: "5",
            valor: 5
        },
        {
            nombre: "6",
            valor: 6
        },
        {
            nombre: "7",
            valor: 7
        },
        {
            nombre: "8",
            valor: 8
        },
        {
            nombre: "9",
            valor: 9
        },
        {
            nombre: "10",
            valor: 10
        },
        {
            nombre: "J",
            valor: 10
        },
        {
            nombre: "Q",
            valor: 10
        },
        {
            nombre: "K",
            valor: 10
        }
    ];

    const baraja = [];

    for (
        const palo of palos
    ) {
        for (
            const valor of valores
        ) {
            baraja.push({
                nombre:
                    `${valor.nombre}${palo}`,
                valor:
                    valor.valor
            });
        }
    }

    for (
        let i = baraja.length - 1;
        i > 0;
        i--
    ) {
        const j =
            Math.floor(
                Math.random() *
                    (i + 1)
            );

        [
            baraja[i],
            baraja[j]
        ] = [
            baraja[j],
            baraja[i]
        ];
    }

    return baraja;
}

// ============================================================
// VALOR MANO
// ============================================================

function calcularValorMano(
    mano
) {
    let total =
        mano.reduce(
            (
                suma,
                carta
            ) =>
                suma +
                carta.valor,
            0
        );

    let ases =
        mano.filter(
            carta =>
                carta.nombre.startsWith(
                    "A"
                )
        ).length;

    while (
        total > 21 &&
        ases > 0
    ) {
        total -= 10;
        ases--;
    }

    return total;
}

// ============================================================
// TEXTO MANO
// ============================================================

function textoMano(
    mano
) {
    return mano
        .map(
            carta =>
                carta.nombre
        )
        .join("  ");
}

// ============================================================
// MENSAJE BLACKJACK
// ============================================================

function crearMensajeBlackjack(
    partida
) {
    const jugadorTotal =
        calcularValorMano(
            partida.jugador
        );

    const embed =
        new EmbedBuilder()
            .setTitle(
                "🃏 21 / BLACKJACK"
            )
            .setDescription(
                `👤 **Jugador:** <@${partida.userId}>\n\n` +

                `🃏 **Tus cartas:**\n${textoMano(partida.jugador)}\n\n` +

                `🎯 **Tu puntuación:** **${jugadorTotal}**\n\n` +

                "🏦 **Banca:**\n🃏 Carta oculta\n\n" +

                "¿Qué quieres hacer?"
            )
            .setColor(0x2ECC71)
            .setFooter({
                text:
                    "RustLogix • Blackjack"
            });

    const pedir =
        new ButtonBuilder()
            .setCustomId(
                `minijuegos_blackjack_pedir_${partida.id}`
            )
            .setLabel(
                "Pedir carta"
            )
            .setEmoji("🃏")
            .setStyle(
                ButtonStyle.Primary
            );

    const plantarse =
        new ButtonBuilder()
            .setCustomId(
                `minijuegos_blackjack_plantarse_${partida.id}`
            )
            .setLabel(
                "Plantarse"
            )
            .setEmoji("✋")
            .setStyle(
                ButtonStyle.Secondary
            );

    return {
        embeds: [
            embed
        ],
        components: [
            new ActionRowBuilder()
                .addComponents(
                    pedir,
                    plantarse
                )
        ]
    };
}

// ============================================================
// FINALIZAR BLACKJACK
// ============================================================

async function finalizarBlackjack(
    interaction,
    partida
) {
    while (
        calcularValorMano(
            partida.banca
        ) < 17
    ) {
        partida.banca.push(
            partida.baraja.pop()
        );
    }

    const jugadorTotal =
        calcularValorMano(
            partida.jugador
        );

    const bancaTotal =
        calcularValorMano(
            partida.banca
        );

    let resultado;
    let puntos;
    let tipoResultado;

    if (
        jugadorTotal > 21
    ) {
        resultado =
            "💀 **Te pasaste de 21. Has perdido.**";

        puntos =
            -10;

        tipoResultado =
            "derrota";
    } else if (
        bancaTotal > 21
    ) {
        resultado =
            "🏆 **La banca se pasó de 21. ¡Has ganado!**";

        puntos =
            100;

        tipoResultado =
            "victoria";
    } else if (
        jugadorTotal >
        bancaTotal
    ) {
        resultado =
            "🏆 **¡Has ganado!**";

        puntos =
            100;

        tipoResultado =
            "victoria";
    } else if (
        jugadorTotal <
        bancaTotal
    ) {
        resultado =
            "💀 **La banca gana.**";

        puntos =
            -10;

        tipoResultado =
            "derrota";
    } else {
        resultado =
            "🤝 **Empate.**";

        puntos =
            10;

        tipoResultado =
            "empate";
    }

    const perfil =
        await obtenerPerfil(
            partida.guildId,
            partida.userId
        );

    perfil.partidas += 1;
    perfil.puntos += puntos;

    if (
        tipoResultado ===
        "victoria"
    ) {
        perfil.victorias += 1;
    }

    if (
        tipoResultado ===
        "derrota"
    ) {
        perfil.derrotas += 1;
    }

    await perfil.save();

    const embed =
        new EmbedBuilder()
            .setTitle(
                "🃏 RESULTADO BLACKJACK"
            )
            .setDescription(
                `👤 <@${partida.userId}>\n\n` +

                `🃏 **Tus cartas:**\n${textoMano(partida.jugador)}\n` +
                `🎯 **Total:** ${jugadorTotal}\n\n` +

                `🏦 **Cartas de la banca:**\n${textoMano(partida.banca)}\n` +
                `🎯 **Total banca:** ${bancaTotal}\n\n` +

                `${resultado}\n\n` +

                `💰 **Puntos:** ${
                    puntos >= 0
                        ? "+"
                        : ""
                }${puntos}`
            )
            .setColor(
                puntos > 0
                    ? 0x2ECC71
                    : puntos < 0
                        ? 0xE74C3C
                        : 0xF1C40F
            )
            .setFooter({
                text:
                    "RustLogix • Blackjack"
            });

    partidasBlackjack.delete(
        partida.id
    );

    const volver =
        new ButtonBuilder()
            .setCustomId(
                "minijuegos_volver"
            )
            .setLabel(
                "Volver a Minijuegos"
            )
            .setEmoji("🎮")
            .setStyle(
                ButtonStyle.Secondary
            );

    await interaction.update({
        embeds: [
            embed
        ],
        components: [
            new ActionRowBuilder()
                .addComponents(
                    volver
                )
        ]
    });
}

// ============================================================
// EXECUTE
// ============================================================

async function execute(
    interaction
) {
    await interaction.reply(
        crearMenuPrincipal()
    );
}

// ============================================================
// MANEJAR BOTONES
// ============================================================

async function manejarBoton(
    interaction
) {
    const customId =
        interaction.customId;

    // ========================================================
    // VOLVER
    // ========================================================

    if (
        customId ===
        "minijuegos_volver"
    ) {
        await interaction.update(
            crearMenuPrincipal()
        );

        return true;
    }

    // ========================================================
    // ABRIR COMPRA DE COLOR
    // ========================================================

    if (
        customId ===
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
            await interaction.reply({
                content:
                    `❌ No tienes suficientes puntos.\n\n` +
                    `💰 Tienes: **${perfil.puntos} puntos**\n` +
                    `🎨 Necesitas: **${PRECIO_COLOR_PERSONALIZADO} puntos**\n` +
                    `📉 Te faltan: **${PRECIO_COLOR_PERSONALIZADO - perfil.puntos} puntos**`,
                ephemeral: true
            });

            return true;
        }

        const menuColores =
            new StringSelectMenuBuilder()
                .setCustomId(
                    "minijuegos_color_seleccionar"
                )
                .setPlaceholder(
                    "🎨 Selecciona tu color"
                )
                .addOptions(
                    Object.entries(
                        COLORES_PERSONALIZADOS
                    ).map(
                        (
                            [
                                valor,
                                color
                            ]
                        ) => ({
                            label:
                                color.nombre,
                            description:
                                `${color.nombre} • ${PRECIO_COLOR_PERSONALIZADO} puntos`,
                            value:
                                valor,
                            emoji:
                                color.emoji
                        })
                    )
                );

        const embed =
            new EmbedBuilder()
                .setTitle(
                    "🎨 ELIGE TU COLOR"
                )
                .setDescription(
                    `Selecciona el color que quieres para tu nuevo rol.\n\n` +

                    `💰 **Precio:** ${PRECIO_COLOR_PERSONALIZADO} puntos\n` +
                    `🪙 **Tus puntos:** ${perfil.puntos}\n\n` +

                    "📝 Después de elegir el color, RustLogix te pedirá el **nombre que quieres ponerle al rol**."
                )
                .setColor(0x5865F2)
                .setFooter({
                    text:
                        "RustLogix • Tienda"
                });

        const cancelar =
            new ButtonBuilder()
                .setCustomId(
                    "minijuegos_volver"
                )
                .setLabel(
                    "Cancelar"
                )
                .setEmoji("↩️")
                .setStyle(
                    ButtonStyle.Secondary
                );

        await interaction.update({
            embeds: [
                embed
            ],
            components: [
                new ActionRowBuilder()
                    .addComponents(
                        menuColores
                    ),
                new ActionRowBuilder()
                    .addComponents(
                        cancelar
                    )
            ]
        });

        return true;
    }

    // ========================================================
    // TRAGAPERRAS
    // ========================================================

    if (
        customId ===
        "minijuegos_tragaperras_jugar"
    ) {
        const ahora =
            Date.now();

        const ultimoJuego =
            cooldownTragaperras.get(
                interaction.user.id
            );

        if (
            ultimoJuego &&
            ahora -
                ultimoJuego <
                COOLDOWN_TRAGAPERRAS
        ) {
            const restante =
                Math.ceil(
                    (
                        COOLDOWN_TRAGAPERRAS -
                        (
                            ahora -
                            ultimoJuego
                        )
                    ) /
                        1000
                );

            await interaction.reply({
                content:
                    `⏱️ Debes esperar **${restante} segundos** para volver a jugar.`,
                ephemeral: true
            });

            return true;
        }

        cooldownTragaperras.set(
            interaction.user.id,
            ahora
        );

        const simbolos = [
            "🍒",
            "🍋",
            "🍊",
            "💎",
            "7️⃣"
        ];

        const resultado = [
            simbolos[
                Math.floor(
                    Math.random() *
                        simbolos.length
                )
            ],

            simbolos[
                Math.floor(
                    Math.random() *
                        simbolos.length
                )
            ],

            simbolos[
                Math.floor(
                    Math.random() *
                        simbolos.length
                )
            ]
        ];

        let puntos = 0;
        let mensaje =
            "❌ **Sin premio esta vez.**";

        if (
            resultado.every(
                simbolo =>
                    simbolo ===
                    "🍒"
            )
        ) {
            puntos =
                20;

            mensaje =
                "🍒 **¡Tres cerezas! +20 puntos**";
        } else if (
            resultado.every(
                simbolo =>
                    simbolo ===
                    "🍋"
            )
        ) {
            puntos =
                30;

            mensaje =
                "🍋 **¡Tres limones! +30 puntos**";
        } else if (
            resultado.every(
                simbolo =>
                    simbolo ===
                    "🍊"
            )
        ) {
            puntos =
                40;

            mensaje =
                "🍊 **¡Tres naranjas! +40 puntos**";
        } else if (
            resultado.every(
                simbolo =>
                    simbolo ===
                    "💎"
            )
        ) {
            puntos =
                100;

            mensaje =
                "💎 **¡TRES DIAMANTES! +100 puntos**";
        } else if (
            resultado.every(
                simbolo =>
                    simbolo ===
                    "7️⃣"
            )
        ) {
            puntos =
                300;

            mensaje =
                "🎉 **¡777! PREMIO MÁXIMO +300 PUNTOS**";
        }

        const perfil =
            await obtenerPerfil(
                interaction.guild.id,
                interaction.user.id
            );

        perfil.partidas += 1;
        perfil.puntos += puntos;

        await perfil.save();

        const embed =
            new EmbedBuilder()
                .setTitle(
                    "🎰 RESULTADO TRAGAPERRAS"
                )
                .setDescription(
                    `👤 <@${interaction.user.id}>\n\n` +

                    `🎰 **${resultado.join(" │ ")}**\n\n` +

                    `${mensaje}\n\n` +

                    `💰 **Tus puntos:** ${perfil.puntos}\n\n` +

                    "⏱️ Puedes volver a jugar en **10 segundos**."
                )
                .setColor(
                    puntos > 0
                        ? 0x2ECC71
                        : 0xE74C3C
                )
                .setFooter({
                    text:
                        "RustLogix • Tragaperras"
                });

        const jugar =
            new ButtonBuilder()
                .setCustomId(
                    "minijuegos_tragaperras_jugar"
                )
                .setLabel(
                    "Jugar otra vez"
                )
                .setEmoji("🎰")
                .setStyle(
                    ButtonStyle.Success
                );

        const volver =
            new ButtonBuilder()
                .setCustomId(
                    "minijuegos_volver"
                )
                .setLabel(
                    "Volver"
                )
                .setEmoji("↩️")
                .setStyle(
                    ButtonStyle.Secondary
                );

        await interaction.update({
            embeds: [
                embed
            ],
            components: [
                new ActionRowBuilder()
                    .addComponents(
                        jugar,
                        volver
                    )
            ]
        });

        return true;
    }

    // ========================================================
    // DADOS - CREAR
    // ========================================================

    if (
        customId ===
        "minijuegos_dados_crear"
    ) {
        const partidaExistente =
            [
                ...partidasDados.values()
            ].find(
                partida =>
                    partida.guildId ===
                        interaction.guild.id &&
                    partida.jugadores.some(
                        jugador =>
                            jugador.userId ===
                            interaction.user.id
                    )
            );

        if (
            partidaExistente
        ) {
            await interaction.reply({
                content:
                    "❌ Ya estás participando en una partida de dados.",
                ephemeral: true
            });

            return true;
        }

        const id =
            `${interaction.guild.id}_${Date.now()}_${interaction.user.id}`;

        const partida = {
            id,
            guildId:
                interaction.guild.id,
            canalId:
                interaction.channel.id,
            creadorId:
                interaction.user.id,
            jugadores: [
                {
                    userId:
                        interaction.user.id,
                    nombre:
                        interaction.user.username
                }
            ],
            iniciada:
                false
        };

        partidasDados.set(
            id,
            partida
        );

        await interaction.update(
            crearMensajePartida(
                partida
            )
        );

        setTimeout(
            async () => {
                const actual =
                    partidasDados.get(
                        id
                    );

                if (
                    !actual ||
                    actual.iniciada
                ) {
                    return;
                }

                partidasDados.delete(
                    id
                );

                try {
                    await interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle(
                                    "⏰ PARTIDA EXPIRADA"
                                )
                                .setDescription(
                                    "La partida de dados expiró porque no fue iniciada a tiempo."
                                )
                                .setColor(
                                    0xE74C3C
                                )
                        ],
                        components: []
                    });
                } catch (error) {
                    console.error(
                        "❌ Error cerrando partida de dados:",
                        error.message
                    );
                }
            },
            TIEMPO_ESPERA_PARTIDA
        );

        return true;
    }

    // ========================================================
    // DADOS - UNIRSE
    // ========================================================

    if (
        customId.startsWith(
            "minijuegos_dados_unirse_"
        )
    ) {
        const id =
            customId.replace(
                "minijuegos_dados_unirse_",
                ""
            );

        const partida =
            partidasDados.get(
                id
            );

        if (!partida) {
            await interaction.reply({
                content:
                    "❌ Esta partida ya no existe.",
                ephemeral: true
            });

            return true;
        }

        if (
            partida.iniciada
        ) {
            await interaction.reply({
                content:
                    "❌ La partida ya comenzó.",
                ephemeral: true
            });

            return true;
        }

        if (
            partida.jugadores.some(
                jugador =>
                    jugador.userId ===
                    interaction.user.id
            )
        ) {
            await interaction.reply({
                content:
                    "⚠️ Ya estás dentro de esta partida.",
                ephemeral: true
            });

            return true;
        }

        if (
            partida.jugadores.length >=
            MAX_JUGADORES
        ) {
            await interaction.reply({
                content:
                    "❌ La partida ya está llena.",
                ephemeral: true
            });

            return true;
        }

        partida.jugadores.push({
            userId:
                interaction.user.id,
            nombre:
                interaction.user.username
        });

        await interaction.update(
            crearMensajePartida(
                partida
            )
        );

        return true;
    }

    // ========================================================
    // DADOS - INICIAR
    // ========================================================

    if (
        customId.startsWith(
            "minijuegos_dados_iniciar_"
        )
    ) {
        const id =
            customId.replace(
                "minijuegos_dados_iniciar_",
                ""
            );

        const partida =
            partidasDados.get(
                id
            );

        if (!partida) {
            await interaction.reply({
                content:
                    "❌ Esta partida ya no existe.",
                ephemeral: true
            });

            return true;
        }

        if (
            interaction.user.id !==
            partida.creadorId
        ) {
            await interaction.reply({
                content:
                    "❌ Solo el creador puede iniciar la partida.",
                ephemeral: true
            });

            return true;
        }

        if (
            partida.jugadores.length <
            2
        ) {
            await interaction.reply({
                content:
                    "❌ Necesitas al menos **2 jugadores** para comenzar.",
                ephemeral: true
            });

            return true;
        }

        partida.iniciada =
            true;

        const resultados = [];

        for (
            const jugador of
            partida.jugadores
        ) {
            resultados.push({
                userId:
                    jugador.userId,
                nombre:
                    jugador.nombre,
                dado:
                    Math.floor(
                        Math.random() *
                            6
                    ) + 1
            });
        }

        const mayor =
            Math.max(
                ...resultados.map(
                    resultado =>
                        resultado.dado
                )
            );

        const ganadores =
            resultados.filter(
                resultado =>
                    resultado.dado ===
                    mayor
            );

        resultados.sort(
            (a, b) =>
                b.dado -
                a.dado
        );

        const textoResultados =
            resultados
                .map(
                    resultado =>
                        `🎲 <@${resultado.userId}> → **${resultado.dado}**`
                )
                .join("\n");

        for (
            const resultado of
            resultados
        ) {
            const perfil =
                await obtenerPerfil(
                    partida.guildId,
                    resultado.userId
                );

            perfil.partidas += 1;
            perfil.puntos += 10;

            if (
                resultado.dado ===
                mayor
            ) {
                perfil.victorias += 1;

                perfil.puntos +=
                    ganadores.length ===
                        1
                        ? 100
                        : 50;
            } else {
                perfil.derrotas += 1;
            }

            await perfil.save();
        }

        let ganadorTexto;

        if (
            ganadores.length ===
            1
        ) {
            ganadorTexto =
                `🏆 **Ganador:** <@${ganadores[0].userId}>\n` +
                `🎲 Sacó un **${mayor}**\n` +
                `💰 **+110 puntos**`;
        } else {
            ganadorTexto =
                `🏆 **Empate entre ${ganadores.length} jugadores**\n` +
                `🎲 Todos sacaron **${mayor}**\n` +
                `💰 **+60 puntos** para cada ganador`;
        }

        const embed =
            new EmbedBuilder()
                .setTitle(
                    "🎲 RESULTADO DE LOS DADOS"
                )
                .setDescription(
                    `${textoResultados}\n\n` +
                    `${ganadorTexto}\n\n` +
                    "🎮 Los demás participantes reciben **+10 puntos**."
                )
                .setColor(
                    0x2ECC71
                )
                .setFooter({
                    text:
                        "RustLogix • Minijuegos"
                });

        partidasDados.delete(
            id
        );

        await interaction.update({
            embeds: [
                embed
            ],
            components: [
                new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(
                                "minijuegos_volver"
                            )
                            .setLabel(
                                "Volver a Minijuegos"
                            )
                            .setEmoji("🎮")
                            .setStyle(
                                ButtonStyle.Secondary
                            )
                    )
            ]
        });

        return true;
    }

    // ========================================================
    // DADOS - CANCELAR
    // ========================================================

    if (
        customId.startsWith(
            "minijuegos_dados_cancelar_"
        )
    ) {
        const id =
            customId.replace(
                "minijuegos_dados_cancelar_",
                ""
            );

        const partida =
            partidasDados.get(
                id
            );

        if (!partida) {
            await interaction.reply({
                content:
                    "❌ Esta partida ya no existe.",
                ephemeral: true
            });

            return true;
        }

        if (
            interaction.user.id !==
            partida.creadorId
        ) {
            await interaction.reply({
                content:
                    "❌ Solo el creador puede cancelar la partida.",
                ephemeral: true
            });

            return true;
        }

        partidasDados.delete(
            id
        );

        await interaction.update({
            embeds: [
                new EmbedBuilder()
                    .setTitle(
                        "❌ PARTIDA CANCELADA"
                    )
                    .setDescription(
                        "La partida de dados fue cancelada por el creador."
                    )
                    .setColor(
                        0xE74C3C
                    )
            ],
            components: [
                new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(
                                "minijuegos_volver"
                            )
                            .setLabel(
                                "Volver a Minijuegos"
                            )
                            .setEmoji("🎮")
                            .setStyle(
                                ButtonStyle.Secondary
                            )
                    )
            ]
        });

        return true;
    }

    // ========================================================
    // DUELO - CREAR
    // ========================================================

    if (
        customId ===
        "minijuegos_duelo_crear"
    ) {
        const existente =
            [
                ...partidasDuelo.values()
            ].find(
                partida =>
                    partida.guildId ===
                        interaction.guild.id &&
                    (
                        partida.creadorId ===
                            interaction.user.id ||
                        partida.oponenteId ===
                            interaction.user.id
                    )
            );

        if (
            existente
        ) {
            await interaction.reply({
                content:
                    "❌ Ya tienes un duelo activo.",
                ephemeral: true
            });

            return true;
        }

        const id =
            `${interaction.guild.id}_${Date.now()}_${interaction.user.id}`;

        const partida = {
            id,
            guildId:
                interaction.guild.id,
            canalId:
                interaction.channel.id,
            creadorId:
                interaction.user.id,
            oponenteId:
                null,
            iniciada:
                false
        };

        partidasDuelo.set(
            id,
            partida
        );

        await interaction.update(
            crearMensajeDuelo(
                partida
            )
        );

        setTimeout(
            async () => {
                const actual =
                    partidasDuelo.get(
                        id
                    );

                if (
                    !actual ||
                    actual.iniciada
                ) {
                    return;
                }

                partidasDuelo.delete(
                    id
                );

                try {
                    await interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle(
                                    "⏰ DUELO EXPIRADO"
                                )
                                .setDescription(
                                    "El desafío expiró porque nadie inició el duelo."
                                )
                                .setColor(
                                    0xE74C3C
                                )
                        ],
                        components: []
                    });
                } catch (error) {
                    console.error(
                        "❌ Error cerrando duelo:",
                        error.message
                    );
                }
            },
            TIEMPO_DUELO
        );

        return true;
    }

    // ========================================================
    // DUELO - UNIRSE
    // ========================================================

    if (
        customId.startsWith(
            "minijuegos_duelo_unirse_"
        )
    ) {
        const id =
            customId.replace(
                "minijuegos_duelo_unirse_",
                ""
            );

        const partida =
            partidasDuelo.get(
                id
            );

        if (!partida) {
            await interaction.reply({
                content:
                    "❌ Este duelo ya no existe.",
                ephemeral: true
            });

            return true;
        }

        if (
            interaction.user.id ===
            partida.creadorId
        ) {
            await interaction.reply({
                content:
                    "❌ No puedes enfrentarte contra ti mismo.",
                ephemeral: true
            });

            return true;
        }

        if (
            partida.oponenteId
        ) {
            await interaction.reply({
                content:
                    "❌ Este duelo ya tiene un oponente.",
                ephemeral: true
            });

            return true;
        }

        partida.oponenteId =
            interaction.user.id;

        await interaction.update(
            crearMensajeDuelo(
                partida
            )
        );

        return true;
    }

    // ========================================================
    // DUELO - INICIAR
    // ========================================================

    if (
        customId.startsWith(
            "minijuegos_duelo_iniciar_"
        )
    ) {
        const id =
            customId.replace(
                "minijuegos_duelo_iniciar_",
                ""
            );

        const partida =
            partidasDuelo.get(
                id
            );

        if (!partida) {
            await interaction.reply({
                content:
                    "❌ Este duelo ya no existe.",
                ephemeral: true
            });

            return true;
        }

        if (
            interaction.user.id !==
            partida.creadorId
        ) {
            await interaction.reply({
                content:
                    "❌ Solo el creador puede iniciar el duelo.",
                ephemeral: true
            });

            return true;
        }

        if (
            !partida.oponenteId
        ) {
            await interaction.reply({
                content:
                    "❌ Todavía falta un jugador.",
                ephemeral: true
            });

            return true;
        }

        partida.iniciada =
            true;

        const dado1 =
            Math.floor(
                Math.random() *
                    6
            ) + 1;

        const dado2 =
            Math.floor(
                Math.random() *
                    6
            ) + 1;

        let resultado;
        let ganadorId =
            null;

        if (
            dado1 > dado2
        ) {
            ganadorId =
                partida.creadorId;

            resultado =
                `🏆 **Ganador:** <@${partida.creadorId}>`;
        } else if (
            dado2 > dado1
        ) {
            ganadorId =
                partida.oponenteId;

            resultado =
                `🏆 **Ganador:** <@${partida.oponenteId}>`;
        } else {
            resultado =
                "🤝 **¡Empate!**";
        }

        await registrarResultado(
            partida.guildId,
            partida.creadorId,
            ganadorId === null
                ? "empate"
                : ganadorId ===
                    partida.creadorId
                    ? "victoria"
                    : "derrota",
            ganadorId === null
                ? 10
                : ganadorId ===
                    partida.creadorId
                    ? 110
                    : 10
        );

        await registrarResultado(
            partida.guildId,
            partida.oponenteId,
            ganadorId === null
                ? "empate"
                : ganadorId ===
                    partida.oponenteId
                    ? "victoria"
                    : "derrota",
            ganadorId === null
                ? 10
                : ganadorId ===
                    partida.oponenteId
                    ? 110
                    : 10
        );

        const embed =
            new EmbedBuilder()
                .setTitle(
                    "⚔️ RESULTADO DEL DUELO"
                )
                .setDescription(
                    `👤 <@${partida.creadorId}> → 🎲 **${dado1}**\n` +
                    `👤 <@${partida.oponenteId}> → 🎲 **${dado2}**\n\n` +

                    `${resultado}\n\n` +

                    (
                        ganadorId
                            ? "💰 El ganador recibe **+110 puntos**.\n🎮 El perdedor recibe **+10 puntos**."
                            : "💰 Ambos reciben **+10 puntos**."
                    )
                )
                .setColor(
                    ganadorId
                        ? 0x2ECC71
                        : 0xF1C40F
                );

        partidasDuelo.delete(
            id
        );

        await interaction.update({
            embeds: [
                embed
            ],
            components: [
                new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(
                                "minijuegos_volver"
                            )
                            .setLabel(
                                "Volver a Minijuegos"
                            )
                            .setEmoji("🎮")
                            .setStyle(
                                ButtonStyle.Secondary
                            )
                    )
            ]
        });

        return true;
    }

    // ========================================================
    // DUELO - CANCELAR
    // ========================================================

    if (
        customId.startsWith(
            "minijuegos_duelo_cancelar_"
        )
    ) {
        const id =
            customId.replace(
                "minijuegos_duelo_cancelar_",
                ""
            );

        const partida =
            partidasDuelo.get(
                id
            );

        if (!partida) {
            await interaction.reply({
                content:
                    "❌ Este duelo ya no existe.",
                ephemeral: true
            });

            return true;
        }

        if (
            interaction.user.id !==
            partida.creadorId
        ) {
            await interaction.reply({
                content:
                    "❌ Solo el creador puede cancelar el duelo.",
                ephemeral: true
            });

            return true;
        }

        partidasDuelo.delete(
            id
        );

        await interaction.update({
            embeds: [
                new EmbedBuilder()
                    .setTitle(
                        "❌ DUELO CANCELADO"
                    )
                    .setDescription(
                        "El creador canceló el duelo."
                    )
                    .setColor(
                        0xE74C3C
                    )
            ],
            components: [
                new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(
                                "minijuegos_volver"
                            )
                            .setLabel(
                                "Volver a Minijuegos"
                            )
                            .setEmoji("🎮")
                            .setStyle(
                                ButtonStyle.Secondary
                            )
                    )
            ]
        });

        return true;
    }

    // ========================================================
    // CARA O CRUZ - CREAR
    // ========================================================

    if (
        customId ===
        "minijuegos_cara_cruz_crear"
    ) {
        const existente =
            [
                ...partidasCaraOCruz.values()
            ].find(
                partida =>
                    partida.guildId ===
                        interaction.guild.id &&
                    (
                        partida.creadorId ===
                            interaction.user.id ||
                        partida.oponenteId ===
                            interaction.user.id
                    )
            );

        if (
            existente
        ) {
            await interaction.reply({
                content:
                    "❌ Ya tienes un desafío de Cara o Cruz activo.",
                ephemeral: true
            });

            return true;
        }

        const id =
            `${interaction.guild.id}_${Date.now()}_${interaction.user.id}`;

        const partida = {
            id,
            guildId:
                interaction.guild.id,
            canalId:
                interaction.channel.id,
            creadorId:
                interaction.user.id,
            oponenteId:
                null,
            eleccionCreador:
                null,
            iniciada:
                false
        };

        partidasCaraOCruz.set(
            id,
            partida
        );

        await interaction.update(
            crearMensajeCaraOCruz(
                partida
            )
        );

        setTimeout(
            async () => {
                const actual =
                    partidasCaraOCruz.get(
                        id
                    );

                if (
                    !actual ||
                    actual.iniciada
                ) {
                    return;
                }

                partidasCaraOCruz.delete(
                    id
                );

                try {
                    await interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle(
                                    "⏰ DESAFÍO EXPIRADO"
                                )
                                .setDescription(
                                    "El desafío de Cara o Cruz expiró."
                                )
                                .setColor(
                                    0xE74C3C
                                )
                        ],
                        components: []
                    });
                } catch (error) {
                    console.error(
                        "❌ Error cerrando Cara o Cruz:",
                        error.message
                    );
                }
            },
            TIEMPO_CARA_CRUZ
        );

        return true;
    }

    // ========================================================
    // CARA O CRUZ - UNIRSE
    // ========================================================

    if (
        customId.startsWith(
            "minijuegos_cara_cruz_unirse_"
        )
    ) {
        const id =
            customId.replace(
                "minijuegos_cara_cruz_unirse_",
                ""
            );

        const partida =
            partidasCaraOCruz.get(
                id
            );

        if (!partida) {
            await interaction.reply({
                content:
                    "❌ Este desafío ya no existe.",
                ephemeral: true
            });

            return true;
        }

        if (
            interaction.user.id ===
            partida.creadorId
        ) {
            await interaction.reply({
                content:
                    "❌ No puedes jugar contra ti mismo.",
                ephemeral: true
            });

            return true;
        }

        if (
            partida.oponenteId
        ) {
            await interaction.reply({
                content:
                    "❌ Este desafío ya tiene un jugador.",
                ephemeral: true
            });

            return true;
        }

        partida.oponenteId =
            interaction.user.id;

        await interaction.update(
            crearMensajeCaraOCruz(
                partida
            )
        );

        return true;
    }

    // ========================================================
    // CARA O CRUZ - ELECCIÓN
    // ========================================================

    if (
        customId.startsWith(
            "minijuegos_cara_cruz_cara_"
        ) ||
        customId.startsWith(
            "minijuegos_cara_cruz_cruz_"
        )
    ) {
        const esCara =
            customId.startsWith(
                "minijuegos_cara_cruz_cara_"
            );

        const prefijo =
            esCara
                ? "minijuegos_cara_cruz_cara_"
                : "minijuegos_cara_cruz_cruz_";

        const id =
            customId.replace(
                prefijo,
                ""
            );

        const partida =
            partidasCaraOCruz.get(
                id
            );

        if (!partida) {
            await interaction.reply({
                content:
                    "❌ Este desafío ya no existe.",
                ephemeral: true
            });

            return true;
        }

        if (
            interaction.user.id !==
            partida.creadorId
        ) {
            await interaction.reply({
                content:
                    "❌ Solo el creador puede elegir Cara o Cruz.",
                ephemeral: true
            });

            return true;
        }

        if (
            !partida.oponenteId
        ) {
            await interaction.reply({
                content:
                    "❌ Primero debe unirse otro jugador.",
                ephemeral: true
            });

            return true;
        }

        partida.eleccionCreador =
            esCara
                ? "cara"
                : "cruz";

        partida.iniciada =
            true;

        const eleccionOponente =
            esCara
                ? "cruz"
                : "cara";

        const resultado =
            Math.random() <
                0.5
                ? "cara"
                : "cruz";

        const ganadorId =
            resultado ===
                partida.eleccionCreador
                ? partida.creadorId
                : partida.oponenteId;

        await registrarResultado(
            partida.guildId,
            partida.creadorId,
            ganadorId ===
                partida.creadorId
                ? "victoria"
                : "derrota",
            ganadorId ===
                partida.creadorId
                ? 110
                : 10
        );

        await registrarResultado(
            partida.guildId,
            partida.oponenteId,
            ganadorId ===
                partida.oponenteId
                ? "victoria"
                : "derrota",
            ganadorId ===
                partida.oponenteId
                ? 110
                : 10
        );

        const ganadorTexto =
            ganadorId ===
                partida.creadorId
                ? `<@${partida.creadorId}>`
                : `<@${partida.oponenteId}>`;

        const embed =
            new EmbedBuilder()
                .setTitle(
                    "🪙 RESULTADO CARA O CRUZ"
                )
                .setDescription(
                    `👤 <@${partida.creadorId}> eligió **${
                        partida.eleccionCreador ===
                            "cara"
                            ? "Cara 🙂"
                            : "Cruz ✖️"
                    }**\n` +

                    `👤 <@${partida.oponenteId}> recibió **${
                        eleccionOponente ===
                            "cara"
                            ? "Cara 🙂"
                            : "Cruz ✖️"
                    }**\n\n` +

                    `🪙 **La moneda cayó en: ${
                        resultado ===
                            "cara"
                            ? "CARA 🙂"
                            : "CRUZ ✖️"
                    }**\n\n` +

                    `🏆 **Ganador:** ${ganadorTexto}\n` +

                    "💰 El ganador recibe **+110 puntos**.\n" +
                    "🎮 El perdedor recibe **+10 puntos**."
                )
                .setColor(
                    0x2ECC71
                );

        partidasCaraOCruz.delete(
            id
        );

        await interaction.update({
            embeds: [
                embed
            ],
            components: [
                new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(
                                "minijuegos_volver"
                            )
                            .setLabel(
                                "Volver a Minijuegos"
                            )
                            .setEmoji("🎮")
                            .setStyle(
                                ButtonStyle.Secondary
                            )
                    )
            ]
        });

        return true;
    }

    // ========================================================
    // CARA O CRUZ - CANCELAR
    // ========================================================

    if (
        customId.startsWith(
            "minijuegos_cara_cruz_cancelar_"
        )
    ) {
        const id =
            customId.replace(
                "minijuegos_cara_cruz_cancelar_",
                ""
            );

        const partida =
            partidasCaraOCruz.get(
                id
            );

        if (!partida) {
            await interaction.reply({
                content:
                    "❌ Este desafío ya no existe.",
                ephemeral: true
            });

            return true;
        }

        if (
            interaction.user.id !==
            partida.creadorId
        ) {
            await interaction.reply({
                content:
                    "❌ Solo el creador puede cancelar el desafío.",
                ephemeral: true
            });

            return true;
        }

        partidasCaraOCruz.delete(
            id
        );

        await interaction.update({
            embeds: [
                new EmbedBuilder()
                    .setTitle(
                        "❌ DESAFÍO CANCELADO"
                    )
                    .setDescription(
                        "El desafío de Cara o Cruz fue cancelado."
                    )
                    .setColor(
                        0xE74C3C
                    )
            ],
            components: [
                new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(
                                "minijuegos_volver"
                            )
                            .setLabel(
                                "Volver a Minijuegos"
                            )
                            .setEmoji("🎮")
                            .setStyle(
                                ButtonStyle.Secondary
                            )
                    )
            ]
        });

        return true;
    }

    // ========================================================
    // BLACKJACK - JUGAR
    // ========================================================

    if (
        customId ===
        "minijuegos_blackjack_jugar"
    ) {
        const existente =
            [
                ...partidasBlackjack.values()
            ].find(
                partida =>
                    partida.guildId ===
                        interaction.guild.id &&
                    partida.userId ===
                        interaction.user.id
            );

        if (
            existente
        ) {
            await interaction.reply({
                content:
                    "❌ Ya tienes una partida de Blackjack activa.",
                ephemeral: true
            });

            return true;
        }

        const baraja =
            crearBaraja();

        const partida = {
            id:
                `${interaction.guild.id}_${Date.now()}_${interaction.user.id}`,

            guildId:
                interaction.guild.id,

            canalId:
                interaction.channel.id,

            userId:
                interaction.user.id,

            baraja,

            jugador: [
                baraja.pop(),
                baraja.pop()
            ],

            banca: [
                baraja.pop(),
                baraja.pop()
            ]
        };

        partidasBlackjack.set(
            partida.id,
            partida
        );

        const jugadorTotal =
            calcularValorMano(
                partida.jugador
            );

        if (
            jugadorTotal ===
            21
        ) {
            partidasBlackjack.delete(
                partida.id
            );

            const perfil =
                await obtenerPerfil(
                    partida.guildId,
                    partida.userId
                );

            perfil.partidas += 1;
            perfil.victorias += 1;
            perfil.puntos += 150;

            await perfil.save();

            const embed =
                new EmbedBuilder()
                    .setTitle(
                        "🃏 ¡BLACKJACK!"
                    )
                    .setDescription(
                        `👤 <@${partida.userId}>\n\n` +

                        `🃏 **Tus cartas:**\n${textoMano(partida.jugador)}\n\n` +

                        "🎯 **21 puntos**\n\n" +

                        "🏆 **¡Blackjack natural!**\n" +
                        "💰 **+150 puntos**"
                    )
                    .setColor(
                        0xF1C40F
                    );

            await interaction.update({
                embeds: [
                    embed
                ],
                components: [
                    new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(
                                    "minijuegos_volver"
                                )
                                .setLabel(
                                    "Volver a Minijuegos"
                                )
                                .setEmoji("🎮")
                                .setStyle(
                                    ButtonStyle.Secondary
                                )
                        )
                ]
            });

            return true;
        }

        await interaction.update(
            crearMensajeBlackjack(
                partida
            )
        );

        return true;
    }

    // ========================================================
    // BLACKJACK - PEDIR
    // ========================================================

    if (
        customId.startsWith(
            "minijuegos_blackjack_pedir_"
        )
    ) {
        const id =
            customId.replace(
                "minijuegos_blackjack_pedir_",
                ""
            );

        const partida =
            partidasBlackjack.get(
                id
            );

        if (!partida) {
            await interaction.reply({
                content:
                    "❌ Esta partida ya no existe.",
                ephemeral: true
            });

            return true;
        }

        if (
            interaction.user.id !==
            partida.userId
        ) {
            await interaction.reply({
                content:
                    "❌ Esta partida pertenece a otro jugador.",
                ephemeral: true
            });

            return true;
        }

        partida.jugador.push(
            partida.baraja.pop()
        );

        const total =
            calcularValorMano(
                partida.jugador
            );

        if (
            total >= 21
        ) {
            await finalizarBlackjack(
                interaction,
                partida
            );

            return true;
        }

        await interaction.update(
            crearMensajeBlackjack(
                partida
            )
        );

        return true;
    }

    // ========================================================
    // BLACKJACK - PLANTARSE
    // ========================================================

    if (
        customId.startsWith(
            "minijuegos_blackjack_plantarse_"
        )
    ) {
        const id =
            customId.replace(
                "minijuegos_blackjack_plantarse_",
                ""
            );

        const partida =
            partidasBlackjack.get(
                id
            );

        if (!partida) {
            await interaction.reply({
                content:
                    "❌ Esta partida ya no existe.",
                ephemeral: true
            });

            return true;
        }

        if (
            interaction.user.id !==
            partida.userId
        ) {
            await interaction.reply({
                content:
                    "❌ Esta partida pertenece a otro jugador.",
                ephemeral: true
            });

            return true;
        }

        await finalizarBlackjack(
            interaction,
            partida
        );

        return true;
    }

    return false;
}

// ============================================================
// SELECT MENUS
// ============================================================

async function manejarSelectMenu(
    interaction
) {
    // ========================================================
    // SELECCIÓN DE COLOR
    // ========================================================

    if (
        interaction.customId ===
        "minijuegos_color_seleccionar"
    ) {
        const colorSeleccionado =
            interaction.values[0];

        const datosColor =
            COLORES_PERSONALIZADOS[
                colorSeleccionado
            ];

        if (!datosColor) {
            await interaction.reply({
                content:
                    "❌ Ese color no existe.",
                ephemeral: true
            });

            return true;
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
            await interaction.reply({
                content:
                    `❌ No tienes suficientes puntos.\n\n` +
                    `💰 Tienes: **${perfil.puntos} puntos**\n` +
                    `🎨 Necesitas: **${PRECIO_COLOR_PERSONALIZADO} puntos**`,
                ephemeral: true
            });

            return true;
        }

        const botMember =
            interaction.guild.members.me;

        if (!botMember) {
            await interaction.reply({
                content:
                    "❌ No pude comprobar los permisos del bot.",
                ephemeral: true
            });

            return true;
        }

        if (
            !botMember.permissions.has(
                "ManageRoles"
            )
        ) {
            await interaction.reply({
                content:
                    "❌ RustLogix necesita el permiso **Gestionar roles** para crear tu rol.",
                ephemeral: true
            });

            return true;
        }

        // ====================================================
        // GUARDAR COLOR SELECCIONADO
        // ====================================================

        const clave =
            `${interaction.guild.id}:${interaction.user.id}`;

        coloresPendientes.set(
            clave,
            {
                color:
                    colorSeleccionado,
                creado:
                    Date.now()
            }
        );

        // ====================================================
        // CREAR MODAL
        // ====================================================

        const modal =
            new ModalBuilder()
                .setCustomId(
                    "minijuegos_color_nombre_modal"
                )
                .setTitle(
                    `🎨 Rol ${datosColor.nombre}`
                );

        const nombreRolInput =
            new TextInputBuilder()
                .setCustomId(
                    "minijuegos_nombre_rol"
                )
                .setLabel(
                    "¿Qué nombre quieres para tu rol?"
                )
                .setPlaceholder(
                    "Ejemplo: VIP Naranja"
                )
                .setStyle(
                    TextInputStyle.Short
                )
                .setMinLength(
                    1
                )
                .setMaxLength(
                    100
                )
                .setRequired(
                    true
                );

        modal.addComponents(
            new ActionRowBuilder()
                .addComponents(
                    nombreRolInput
                )
        );

        await interaction.showModal(
            modal
        );

        // ====================================================
        // LIMPIAR DESPUÉS DE 5 MINUTOS
        // ====================================================

        setTimeout(
            () => {
                const pendiente =
                    coloresPendientes.get(
                        clave
                    );

                if (
                    pendiente &&
                    pendiente.creado ===
                        Date.now()
                ) {
                    coloresPendientes.delete(
                        clave
                    );
                }
            },
            5 * 60 * 1000
        );

        return true;
    }

    // ========================================================
    // MENU PRINCIPAL
    // ========================================================

    if (
        interaction.customId !==
        "minijuegos_menu"
    ) {
        return false;
    }

    const valor =
        interaction.values[0];

    if (
        valor ===
        "dados"
    ) {
        await interaction.update(
            crearMenuDados()
        );

        return true;
    }

    if (
        valor ===
        "duelo"
    ) {
        await interaction.update(
            crearMenuDuelo()
        );

        return true;
    }

    if (
        valor ===
        "cara_cruz"
    ) {
        await interaction.update(
            crearMenuCaraOCruz()
        );

        return true;
    }

    if (
        valor ===
        "blackjack"
    ) {
        await interaction.update(
            crearMenuBlackjack()
        );

        return true;
    }

    if (
        valor ===
        "tragaperras"
    ) {
        await interaction.update(
            crearMenuTragaperras()
        );

        return true;
    }

    if (
        valor ===
        "estadisticas"
    ) {
        const perfil =
            await obtenerPerfil(
                interaction.guild.id,
                interaction.user.id
            );

        const embed =
            new EmbedBuilder()
                .setTitle(
                    "🏆 MIS ESTADÍSTICAS"
                )
                .setDescription(
                    `👤 **Jugador:** <@${interaction.user.id}>\n\n` +

                    `💰 **Puntos:** ${perfil.puntos}\n` +
                    `🏆 **Victorias:** ${perfil.victorias}\n` +
                    `💀 **Derrotas:** ${perfil.derrotas}\n` +
                    `🎮 **Partidas:** ${perfil.partidas}`
                )
                .setColor(
                    0x5865F2
                );

        const volver =
            new ButtonBuilder()
                .setCustomId(
                    "minijuegos_volver"
                )
                .setLabel(
                    "Volver"
                )
                .setEmoji("↩️")
                .setStyle(
                    ButtonStyle.Secondary
                );

        await interaction.update({
            embeds: [
                embed
            ],
            components: [
                new ActionRowBuilder()
                    .addComponents(
                        volver
                    )
            ]
        });

        return true;
    }

    if (
        valor ===
        "tienda"
    ) {
        await interaction.update(
            await crearMenuTienda(
                interaction
            )
        );

        return true;
    }

    return false;
}

// ============================================================
// MODAL - NOMBRE DEL ROL
// ============================================================

async function manejarModal(
    interaction
) {
    if (
        interaction.customId !==
        "minijuegos_color_nombre_modal"
    ) {
        return false;
    }

    const clave =
        `${interaction.guild.id}:${interaction.user.id}`;

    const pendiente =
        coloresPendientes.get(
            clave
        );

    if (!pendiente) {
        await interaction.reply({
            content:
                "❌ Esta compra expiró. Vuelve a seleccionar el color desde la tienda.",
            ephemeral: true
        });

        return true;
    }

    coloresPendientes.delete(
        clave
    );

    // ========================================================
    // COMPROBAR COLOR
    // ========================================================

    const datosColor =
        COLORES_PERSONALIZADOS[
            pendiente.color
        ];

    if (!datosColor) {
        await interaction.reply({
            content:
                "❌ El color seleccionado ya no está disponible.",
            ephemeral: true
        });

        return true;
    }

    // ========================================================
    // OBTENER NOMBRE
    // ========================================================

    let nombreRol =
        interaction.fields.getTextInputValue(
            "minijuegos_nombre_rol"
        );

    nombreRol =
        nombreRol.trim();

    if (!nombreRol) {
        await interaction.reply({
            content:
                "❌ Debes escribir un nombre para el rol.",
            ephemeral: true
        });

        return true;
    }

    if (
        nombreRol.length >
        100
    ) {
        await interaction.reply({
            content:
                "❌ El nombre del rol no puede superar los 100 caracteres.",
            ephemeral: true
        });

        return true;
    }

    // ========================================================
    // COMPROBAR PUNTOS DE NUEVO
    // ========================================================

    const perfil =
        await obtenerPerfil(
            interaction.guild.id,
            interaction.user.id
        );

    if (
        perfil.puntos <
        PRECIO_COLOR_PERSONALIZADO
    ) {
        await interaction.reply({
            content:
                `❌ Ya no tienes suficientes puntos para realizar la compra.\n\n` +
                `💰 Tienes: **${perfil.puntos} puntos**\n` +
                `🎨 Necesitas: **${PRECIO_COLOR_PERSONALIZADO} puntos**`,
            ephemeral: true
        });

        return true;
    }

    // ========================================================
    // COMPROBAR PERMISOS
    // ========================================================

    const botMember =
        interaction.guild.members.me;

    if (!botMember) {
        await interaction.reply({
            content:
                "❌ No pude comprobar al bot dentro del servidor.",
            ephemeral: true
        });

        return true;
    }

    if (
        !botMember.permissions.has(
            "ManageRoles"
        )
    ) {
        await interaction.reply({
            content:
                "❌ RustLogix necesita el permiso **Gestionar roles**.",
            ephemeral: true
        });

        return true;
    }

    // ========================================================
    // COMPROBAR SI YA EXISTE UN ROL CON ESE NOMBRE
    // ========================================================

    const rolExistente =
        interaction.guild.roles.cache.find(
            rol =>
                rol.name ===
                nombreRol
        );

    if (rolExistente) {
        await interaction.reply({
            content:
                `❌ Ya existe un rol llamado **${nombreRol}**.\n\n` +
                "Elige otro nombre para tu rol.",
            ephemeral: true
        });

        return true;
    }

    // ========================================================
    // CREAR ROL
    // ========================================================

    let rolNuevo;

    try {
        rolNuevo =
            await interaction.guild.roles.create({
                name:
                    nombreRol,

                color:
                    datosColor.valor,

                reason:
                    `RustLogix - Compra de color personalizado por ${interaction.user.tag}`
            });
    } catch (error) {
        console.error(
            "❌ Error creando rol personalizado:",
            error
        );

        await interaction.reply({
            content:
                "❌ No pude crear el rol.\n\n" +
                "Comprueba que RustLogix tenga **Gestionar roles** y que su rol esté por encima de la posición donde Discord permite crear/asignar el rol.",
            ephemeral: true
        });

        return true;
    }

    // ========================================================
    // COMPROBAR POSICIÓN DEL ROL
    // ========================================================

    if (
        rolNuevo.position >=
        botMember.roles.highest.position
    ) {
        try {
            await rolNuevo.delete(
                "RustLogix - Rol fuera del alcance del bot"
            );
        } catch (error) {
            console.error(
                "⚠️ No pude borrar el rol creado:",
                error.message
            );
        }

        await interaction.reply({
            content:
                "❌ No puedo asignar ese rol porque la posición del rol de RustLogix no permite administrarlo.\n\n" +
                "Mueve el rol de **RustLogix** por encima de los roles que crea.",
            ephemeral: true
        });

        return true;
    }

    // ========================================================
    // ASIGNAR ROL
    // ========================================================

    try {
        const miembro =
            await interaction.guild.members.fetch(
                interaction.user.id
            );

        await miembro.roles.add(
            rolNuevo,
            "RustLogix - Compra de color personalizado"
        );
    } catch (error) {
        console.error(
            "❌ Error asignando rol personalizado:",
            error
        );

        try {
            await rolNuevo.delete(
                "RustLogix - No se pudo asignar al usuario"
            );
        } catch (deleteError) {
            console.error(
                "⚠️ No pude borrar el rol después del fallo:",
                deleteError.message
            );
        }

        await interaction.reply({
            content:
                "❌ El rol fue creado, pero no pude asignártelo. No se te descontaron puntos.",
            ephemeral: true
        });

        return true;
    }

    // ========================================================
    // COBRAR LOS 300 PUNTOS
    // ========================================================

    perfil.puntos -=
        PRECIO_COLOR_PERSONALIZADO;

    await perfil.save();

    // ========================================================
    // CONFIRMACIÓN
    // ========================================================

    const embed =
        new EmbedBuilder()
            .setTitle(
                `${datosColor.emoji} ¡ROL CREADO!`
            )
            .setDescription(
                "🎉 **Tu compra se realizó correctamente.**\n\n" +

                `👤 **Jugador:** <@${interaction.user.id}>\n` +
                `🏷️ **Rol:** <@&${rolNuevo.id}>\n` +
                `${datosColor.emoji} **Color:** ${datosColor.nombre}\n\n` +

                `💰 **Gastado:** ${PRECIO_COLOR_PERSONALIZADO} puntos\n` +
                `🪙 **Puntos restantes:** ${perfil.puntos}\n\n` +

                "El rol ya fue creado y asignado a tu cuenta."
            )
            .setColor(
                datosColor.valor
            )
            .setFooter({
                text:
                    "RustLogix • Tienda"
            });

    const volver =
        new ButtonBuilder()
            .setCustomId(
                "minijuegos_volver"
            )
            .setLabel(
                "Volver a Minijuegos"
            )
            .setEmoji("🎮")
            .setStyle(
                ButtonStyle.Secondary
            );

    await interaction.reply({
        embeds: [
            embed
        ],
        components: [
            new ActionRowBuilder()
                .addComponents(
                    volver
                )
        ]
    });

    return true;
}

// ============================================================
// EXPORTAR
// ============================================================

module.exports = {
    data,
    execute,
    manejarBoton,
    manejarSelectMenu,
    manejarModal
};