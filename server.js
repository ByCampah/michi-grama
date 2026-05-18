const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let listaCrucigramas = [];
try {
    const data = fs.readFileSync(path.join(__dirname, 'crucigramas.json'), 'utf8');
    listaCrucigramas = JSON.parse(data);
    console.log(`📖 Michi-Mazo cargado con ${listaCrucigramas.length} niveles.`);
} catch (err) {
    console.error("❌ Error al cargar crucigramas.json:", err);
}

const salas = {}; 

io.on('connection', (socket) => {
    
    socket.on('solicitar-titulo-nivel', (num) => {
        const nivelEncontrado = listaCrucigramas.find(c => c.nivel === parseInt(num));
        if (nivelEncontrado) {
            socket.emit('recibir-titulo-nivel', { existe: true, titulo: nivelEncontrado.titulo });
        } else {
            socket.emit('recibir-titulo-nivel', { existe: false, titulo: "Nivel no encontrado ❌" });
        }
    });

    // LÓGICA BLINDADA: Filtra si es creador o si intenta unirse a una sala que no existe
    socket.on('unirse', ({ nombre, sala, accion, modoNivel, numNivel }) => {
        const nombreSala = sala || "SalaPublica";

        if (accion === 'unirse' && !salas[nombreSala]) {
            socket.emit('error-sala', `La sala [${nombreSala}] no existe o ya cerró. ¡Revisá el código!`);
            return;
        }

        if (socket.salaInfo && socket.salaInfo !== nombreSala) {
            socket.leave(socket.salaInfo);
            removerJugadorDeSala(socket.id, socket.salaInfo);
        }

        if (!salas[nombreSala]) {
            salas[nombreSala] = {
                jugadores: [],
                tableroSeleccionado: null,
                palabrasResueltas: {}, 
                puntos: {},
                letrasFijas: {}, 
                configNivel: { modo: modoNivel, numero: parseInt(numNivel) || 1 }
            };
        }

        const partida = salas[nombreSala];

        const yaEsta = partida.jugadores.find(j => j.id === socket.id);
        if (!yaEsta && partida.jugadores.length >= 2) {
            socket.emit('error-sala', `La sala [${nombreSala}] ya está llena. Usá otro código.`);
            return;
        }

        socket.join(nombreSala);
        socket.salaInfo = nombreSala;

        if (!yaEsta) {
            partida.jugadores.push({ id: socket.id, nombre: nombre || `Michi-${Math.floor(Math.random()*1000)}` });
            partida.puntos[socket.id] = 0;
        }

        if (partida.jugadores.length === 1) {
            partida.configNivel = { modo: modoNivel, numero: parseInt(numNivel) || 1 };
        }

        io.to(nombreSala).emit('actualizar-jugadores', partida.jugadores, partida.puntos);

        if (partida.jugadores.length === 2 && !partida.tableroSeleccionado) {
            iniciarBatallaMichigrama(nombreSala);
        }
    });

    socket.on('solicitar-nueva-partida', ({ modo, numero }) => {
        const sala = socket.salaInfo;
        if (!sala || !salas[sala]) return;
        
        const partida = salas[sala];
        if (partida.jugadores.length === 2) {
            partida.configNivel = { modo: modo || "random", numero: parseInt(numero) || 1 };
            iniciarBatallaMichigrama(sala);
        }
    });

    socket.on('confirmar-palabra', ({ pistaId, intento }) => {
        const sala = socket.salaInfo;
        if (!sala || !salas[sala]) return;
        
        const partida = salas[sala];
        const t = partida.tableroSeleccionado;
        if (!t) return;

        const pistaObj = t.pistas.find(p => p.id === pistaId);
        if (!pistaObj) return;

        if (partida.palabrasResueltas[pistaId]) return;

        const jugador = partida.jugadores.find(j => j.id === socket.id);

        if (intento.toUpperCase() === pistaObj.palabra.toUpperCase()) {
            partida.palabrasResueltas[pistaId] = socket.id;
            
            const puntosGanados = pistaObj.palabra.length * 2;
            partida.puntos[socket.id] += puntosGanados;

            for (let i = 0; i < pistaObj.palabra.length; i++) {
                let f = pistaObj.dir === "H" ? pistaObj.fila : pistaObj.fila + i;
                let c = pistaObj.dir === "H" ? pistaObj.col + i : pistaObj.col;
                partida.letrasFijas[`${f}-${c}`] = pistaObj.palabra[i];
            }

            io.to(sala).emit('palabra-bloqueada', { 
                pistaId, 
                palabra: pistaObj.palabra, 
                fila: pistaObj.fila, 
                col: pistaObj.col, 
                dir: pistaObj.dir, 
                dueno: socket.id,
                puntos: partida.puntos,
                letrasFijas: partida.letrasFijas
            });

            io.to(sala).emit('msj-chat', { 
                nombre: "Michi-Árbitro 🐾", 
                texto: `¡${jugador.nombre} capturó la pista ${pistaId}! (+${puntosGanados} pts)`, 
                tipo: "sistema" 
            });

            verificarFinDeJuego(sala);
        } else {
            partida.puntos[socket.id] = Math.max(0, partida.puntos[socket.id] - 3);
            socket.emit('castigo-error', { pistaId, puntos: partida.puntos });
            io.to(sala).emit('actualizar-marcador-solo', partida.puntos);
            io.to(sala).emit('msj-chat', { 
                nombre: "Michi-Árbitro 🐾", 
                texto: `¡${jugador.nombre} mandó fruta en la pista ${pistaId}! (-3 pts)`, 
                tipo: "error-msj" 
            });
        }
    });

    socket.on('solicitar-volver-lobby', () => {
        const sala = socket.salaInfo;
        if (!sala || !salas[sala]) return;
        const partida = salas[sala];

        partida.tableroSeleccionado = null;
        partida.palabrasResueltas = {};
        partida.letrasFijas = {};
        partida.jugadores.forEach(j => partida.puntos[j.id] = 0);
        
        io.to(sala).emit('forzar-regreso-lobby', partida.jugadores, partida.puntos);
    });

    socket.on('enviar-msj', (texto) => {
        const sala = socket.salaInfo;
        if (!sala || !salas[sala]) return;
        
        const partida = salas[sala];
        const jugador = partida.jugadores.find(j => j.id === socket.id);
        if (jugador) io.to(sala).emit('msj-chat', { nombre: jugador.nombre, texto });
    });

    socket.on('disconnect', () => {
        if (socket.salaInfo) {
            removerJugadorDeSala(socket.id, socket.salaInfo);
        }
    });
});

function removerJugadorDeSala(socketId, nombreSala) {
    if (!salas[nombreSala]) return;
    const partida = salas[nombreSala];
    
    partida.jugadores = partida.jugadores.filter(j => j.id !== socketId);
    delete partida.puntos[socketId];

    io.to(nombreSala).emit('actualizar-jugadores', partida.jugadores, partida.puntos);

    if (partida.jugadores.length === 0) {
        delete salas[nombreSala];
    }
}

function iniciarBatallaMichigrama(nombreSala) {
    const partida = salas[nombreSala];
    if (!partida) return;

    let t = null;
    const config = partida.configNivel;

    if (config.modo === "manual") {
        t = listaCrucigramas.find(c => c.nivel === config.numero);
    }
    
    if (!t && listaCrucigramas.length > 0) {
        const randomIdx = Math.floor(Math.random() * listaCrucigramas.length);
        t = listaCrucigramas[randomIdx];
    }

    partida.tableroSeleccionado = t;
    partida.palabrasResueltas = {};
    partida.letrasFijas = {};
    partida.jugadores.forEach(j => partida.puntos[j.id] = 0); 

    const abecedario = "ABCDEFGHIJKLMOPQRSTUVWXYZ";
    const pistasParaCliente = t.pistas.map(p => {
        let letrasBanco = p.palabra.toUpperCase().split('');
        for (let i = 0; i < 4; i++) {
            let letraFalsa = abecedario[Math.floor(Math.random() * abecedario.length)];
            letrasBanco.push(letraFalsa);
        }
        for (let i = letrasBanco.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [letrasBanco[i], letrasBanco[j]] = [letrasBanco[j], letrasBanco[i]];
        }

        return {
            id: p.id,
            fila: p.fila,
            col: p.col,
            dir: p.dir,
            pista: p.pista,
            largo: p.palabra.length,
            bancoLetras: letrasBanco 
        };
    });

    io.to(nombreSala).emit('comenzar-partida', {
        titulo: t.titulo,
        nivel: t.nivel,
        filas: t.filas,
        columnas: t.columnas,
        pistas: pistasParaCliente
    });
}

function verificarFinDeJuego(nombreSala) {
    const partida = salas[nombreSala];
    if (!partida) return;

    const totalPalabras = partida.tableroSeleccionado.pistas.length;
    const resueltas = Object.keys(partida.palabrasResueltas).length;

    if (resueltas === totalPalabras) {
        let ganador = "Empate";
        let maxPuntos = -1;
        let detallePuntos = [];

        partida.jugadores.forEach(j => {
            detallePuntos.push(`${j.nombre}: ${partida.puntos[j.id]} pts`);
            if (partida.puntos[j.id] > maxPuntos) {
                maxPuntos = partida.puntos[j.id];
                ganador = j.nombre;
            } else if (partida.puntos[j.id] === maxPuntos) {
                ganador = "Empate exacto 🐾";
            }
        });

        io.to(nombreSala).emit('fin-partida-pantalla', {
            ganador,
            resumen: detallePuntos.join(" VS ")
        });
    }
}

// Render nos asigna el puerto automáticamente en process.env.PORT. Si no existe, usa el 3000 local.
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🐱 Servidor del Michigrama activo en el puerto ${PORT}`));