const http = require("http");

const PORT = process.env.PORT || 3000;

console.log("========================================");
console.log("🧪 PRUEBA MINIMA DE RENDER");
console.log("🟢 Node.js inició correctamente");
console.log("🟢 PORT:", PORT);
console.log("🟢 TOKEN existe:", !!process.env.TOKEN);
console.log("🟢 MONGODB_URI existe:", !!process.env.MONGODB_URI);
console.log("========================================");

const server = http.createServer((req, res) => {
    res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8"
    });

    res.end("RustLogix - prueba Render OK\n");
});

server.listen(PORT, "0.0.0.0", () => {
    console.log("🌐 Servidor HTTP iniciado correctamente");
    console.log(`🌐 Escuchando en 0.0.0.0:${PORT}`);
    console.log("🟢 Render debería poder mantener este servicio activo.");
});