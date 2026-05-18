const socket = io();

const pantallaInicio = document.getElementById('pantalla-inicio');
const bloqueJuegoActivo = document.getElementById('bloque-juego-activo');
const bloqueFinalGame = document.getElementById('bloque-final-game');
const boxGanadorEmbed = document.getElementById('box-ganador-embed');

const btnVolverMenu = document.getElementById('btn-volver-menu');
const btnJugarAzar = document.getElementById('btn-jugar-azar');

const btnCrearSala = document.getElementById('btn-crear-sala');
const btnUnirseSala = document.getElementById('btn-unirse-sala');

const inputNombre = document.getElementById('input-nombre');
const inputSala = document.getElementById('input-sala');
const grilla = document.getElementById('grilla');
const marcador = document.getElementById('marcador');
const mensajes = document.getElementById('mensajes');
const inputMsg = document.getElementById('input-msg');
const btnEnviar = document.getElementById('btn-enviar');

const pistaTextoActiva = document.getElementById('pista-texto-activa');
const barraRespuesta = document.getElementById('barra-respuesta');
const bancoBurbujas = document.getElementById('banco-burbujas');
const btnConfirmar = document.getElementById('btn-confirmar');
const listaPistasContenedor = document.getElementById('lista-pistas');
const previewTitulo = document.getElementById('preview-titulo');
const inputNumNivel = document.getElementById('input-num-nivel');
const btnAudio = document.getElementById('btn-audio');

let miNombre = "";
let miSala = ""; 
let pistaSeleccionada = null;
let juegoPistas = [];
let respuestaActual = []; 
let burbujasData = [];    
let bloqueadoPorError = false;
let letrasGlobalesFijas = {}; 
let listaJugadoresGlobal = [];
let sonidoHabilitado = true; 
let palabrasResueltasGlobales = [];

let audioCtx = null;
function iniciarAudioContext() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { console.error(e); }
}

function reproducirSonidoArcade(tipo) {
    if (!sonidoHabilitado) return;
    pistaSeleccionada && iniciarAudioContext();
    if (!audioCtx) return;

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    const tiempoActual = audioCtx.currentTime;

    if (tipo === "burbuja") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(600, tiempoActual);
        osc.frequency.exponentialRampToValueAtTime(900, tiempoActual + 0.08);
        gainNode.gain.setValueAtTime(0.12, tiempoActual);
        gainNode.gain.exponentialRampToValueAtTime(0.01, tiempoActual + 0.08);
        osc.start(tiempoActual);
        osc.stop(tiempoActual + 0.08);
    } 
    else if (tipo === "acierto") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(523.25, tiempoActual); 
        osc.frequency.setValueAtTime(659.25, tiempoActual + 0.08); 
        osc.frequency.setValueAtTime(783.99, tiempoActual + 0.16); 
        osc.frequency.exponentialRampToValueAtTime(1046.50, tiempoActual + 0.3); 
        gainNode.gain.setValueAtTime(0.18, tiempoActual);
        gainNode.gain.exponentialRampToValueAtTime(0.01, tiempoActual + 0.35);
        osc.start(tiempoActual);
        osc.stop(tiempoActual + 0.35);
    } 
    else if (tipo === "error") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(240, tiempoActual);
        osc.frequency.linearRampToValueAtTime(90, tiempoActual + 0.4);
        gainNode.gain.setValueAtTime(0.20, tiempoActual);
        gainNode.gain.linearRampToValueAtTime(0.01, tiempoActual + 0.4);
        osc.start(tiempoActual);
        osc.stop(tiempoActual + 0.4);
    }
}

btnAudio.addEventListener('click', () => {
    iniciarAudioContext();
    sonidoHabilitado = !sonidoHabilitado;
    if (sonidoHabilitado) {
        btnAudio.innerText = "🔊 Sonido: ON";
        btnAudio.classList.remove('mutado');
    } else {
        btnAudio.innerText = "🔇 Sonido: OFF";
        btnAudio.classList.add('mutado');
    }
});


let modoSeleccionado = 'random';
const tabAzar = document.getElementById('tab-azar');
const tabManual = document.getElementById('tab-manual');
const panelManual = document.getElementById('panel-manual');

tabAzar.addEventListener('click', () => {
    modoSeleccionado = 'random';
    tabAzar.classList.add('activo');
    tabManual.classList.remove('activo');
    panelManual.classList.add('oculto');
});

tabManual.addEventListener('click', () => {
    modoSeleccionado = 'manual';
    tabManual.classList.add('activo');
    tabAzar.classList.remove('activo');
    panelManual.classList.remove('oculto');
    consultingNivel();
});

function consultingNivel() {
    if (modoSeleccionado === "random") {
        previewTitulo.innerText = "Tablero: Sorpresa 🎲";
        previewTitulo.style.color = "#00ff66";
    } else {
        socket.emit('solicitar-titulo-nivel', inputNumNivel.value);
    }
}
inputNumNivel.addEventListener('input', consultingNivel);


socket.on('recibir-titulo-nivel', ({ existe, titulo }) => {
    previewTitulo.innerText = `Tablero: ${titulo}`;
    previewTitulo.style.color = existe ? "#00ff66" : "#ff5555";
});

// NUEVA LÓGICA: Crea sala y avisa
btnCrearSala.addEventListener('click', () => {
    miNombre = inputNombre.value.trim();
    if (!miNombre) return alert("¡Por favor, escribí tu nombre primero!");

    iniciarAudioContext();
    miSala = Math.random().toString(36).substring(2, 6).toUpperCase(); 
    inputSala.value = miSala; 

    const modoNivel = modoSeleccionado;
    const numNivel = inputNumNivel.value;

    socket.emit('unirse', { nombre: miNombre, sala: miSala, accion: 'crear', modoNivel, numNivel });
    
    btnCrearSala.disabled = true;
    btnUnirseSala.disabled = true;
    btnCrearSala.innerText = `⏳ CÓDIGO: ${miSala}`;
    btnUnirseSala.innerText = "Esperando rival...";
});

// NUEVA LÓGICA: Se une y valida
btnUnirseSala.addEventListener('click', () => {
    miNombre = inputNombre.value.trim();
    miSala = inputSala.value.trim().toUpperCase();

    if (!miNombre) return alert("¡Por favor, escribí tu nombre primero!");
    if (!miSala) return alert("¡Tenés que ingresar el código de la sala que creó tu amigo!");

    iniciarAudioContext();

    const modoNivel = modoSeleccionado;
    const numNivel = inputNumNivel.value;

    socket.emit('unirse', { nombre: miNombre, sala: miSala, accion: 'unirse', modoNivel, numNivel });
    
    btnCrearSala.disabled = true;
    btnUnirseSala.disabled = true;
    btnUnirseSala.innerText = `Conectando...`;
});

// SOLUCIÓN: Atrapa errores y rehabilita botones sin F5
socket.on('error-sala', (msg) => {
    alert(msg);
    btnCrearSala.disabled = false;
    btnUnirseSala.disabled = false;
    btnCrearSala.innerText = "➕ Crear Sala";
    btnUnirseSala.innerText = "🤝 Unirse a Sala";
    inputSala.value = ""; // Vaciamos para que pueda intentar de nuevo
});

socket.on('actualizar-jugadores', (jugadores, puntos) => {
    listaJugadoresGlobal = jugadores;
    if (jugadores.length < 2) {
        marcador.innerText = `Sala [${miSala}] - Esperando rival... (1/2)`;
    } else {
        actualizarMarcadorVisual(puntos);
    }
});

function actualizarMarcadorVisual(puntos) {
    if (listaJugadoresGlobal.length < 2) return;
    let t = "⚔️ ";
    listaJugadoresGlobal.forEach((j, idx) => {
        let nombreDisplay = j.id === socket.id ? `${j.nombre} (Vos)` : j.nombre;
        let misPuntos = puntos[j.id] !== undefined ? puntos[j.id] : 0;
        t += `${nombreDisplay}: ${misPuntos} pts`;
        if (idx === 0) t += " VS ";
    });
    marcador.innerText = t;
}

socket.on('comenzar-partida', (data) => {
    pantallaInicio.classList.add('oculto');
    bloqueFinalGame.classList.add('oculto');
    bloqueJuegoActivo.classList.remove('oculto'); 
    
    document.getElementById('titulo-juego').innerText = `🧩 Nivel ${data.nivel}: ${data.titulo}`;
    juegoPistas = data.pistas;
    letrasGlobalesFijas = {};
    palabrasResueltasGlobales = [];

    grilla.innerHTML = "";
    barraRespuesta.innerHTML = "";
    bancoBurbujas.innerHTML = "";
    pistaTextoActiva.innerText = "Seleccioná una pista de la lista o tocá la grilla para arrancar";
    
    btnCrearSala.disabled = false;
    btnUnirseSala.disabled = false;
    btnCrearSala.innerText = "➕ Crear Sala";
    btnUnirseSala.innerText = "🤝 Unirse a Sala";
    inputSala.value = ""; 

    renderizarGrillaEstatica(data.filas, data.columnas);
    renderizarListaPistas(juegoPistas);
});

function renderizarGrillaEstatica(filas, columnas) {
    grilla.innerHTML = "";
    const matrizAux = Array(filas).fill().map(() => Array(columnas).fill(null));

    juegoPistas.forEach((p) => {
        for (let i = 0; i < p.largo; i++) {
            let f = p.dir === "H" ? p.fila : p.fila + i;
            let c = p.dir === "H" ? p.col + i : p.col;
            if (!matrizAux[f][c]) {
                matrizAux[f][c] = { esPrimera: (i === 0), numPista: p.id, pistasAsociadas: [p.id] };
            } else {
                matrizAux[f][c].pistasAsociadas.push(p.id);
            }
        }
    });

    for (let f = 0; f < filas; f++) {
        for (let c = 0; c < columnas; c++) {
            const div = document.createElement('div');
            div.className = "celda";
            div.id = `celda-${f}-${c}`;

            const info = matrizAux[f][c];
            if (info) {
                div.classList.add('activa');
                if (info.esPrimera) {
                    const span = document.createElement('span');
                    span.className = "numero-pista";
                    span.innerText = info.numPista;
                    div.appendChild(span);
                }
                
                div.addEventListener('click', () => {
                    if (bloqueadoPorError || !bloqueFinalGame.classList.contains('oculto')) return;
                    
                    let disponibles = info.pistasAsociadas.filter(id => !palabrasResueltasGlobales.includes(id));
                    if (disponibles.length === 0) return; 

                    reproducirSonidoArcade("burbuja");
                    
                    if (disponibles.length > 1 && pistaSeleccionada) {
                        let idxActual = disponibles.indexOf(pistaSeleccionada.id);
                        if (idxActual !== -1) {
                            let siguienteIdx = (idxActual + 1) % disponibles.length;
                            activarPistaDetalle(disponibles[siguienteIdx]);
                            return;
                        }
                    }
                    activarPistaDetalle(disponibles[0]);
                });
            }
            grilla.appendChild(div);
        }
    }
}

function renderizarListaPistas(pistas) {
    listaPistasContenedor.innerHTML = "";
    pistas.forEach(p => {
        const div = document.createElement('div');
        div.className = "item-pista";
        div.id = `item-pista-${p.id}`;
        div.innerText = `[${p.id}] ${p.dir === "H" ? "Horiz" : "Vert"}: ${p.pista} (${p.largo} letras)`;
        div.addEventListener('click', () => {
            if (bloqueadoPorError || palabrasResueltasGlobales.includes(p.id) || !bloqueFinalGame.classList.contains('oculto')) return;
            reproducirSonidoArcade("burbuja");
            activarPistaDetalle(p.id);
        });
        listaPistasContenedor.appendChild(div);
    });
}

function activarPistaDetalle(pistaId) {
    if (palabrasResueltasGlobales.includes(pistaId)) return; 

    pistaSeleccionada = juegoPistas.find(p => p.id === pistaId);
    if (!pistaSeleccionada) return;

    document.querySelectorAll('.item-pista').forEach(el => el.classList.remove('seleccionada'));
    const itemDestacado = document.getElementById(`item-pista-${pistaId}`);
    if (itemDestacado) itemDestacado.classList.add('seleccionada');

    document.querySelectorAll('.celda').forEach(el => el.classList.remove('iluminada'));
    for (let i = 0; i < pistaSeleccionada.largo; i++) {
        let f = pistaSeleccionada.dir === "H" ? pistaSeleccionada.fila : pistaSeleccionada.fila + i;
        let c = pistaSeleccionada.dir === "H" ? pistaSeleccionada.col + i : pistaSeleccionada.col;
        const celdaElemento = document.getElementById(`celda-${f}-${c}`);
        if (celdaElemento) celdaElemento.classList.add('iluminada');
    }

    pistaTextoActiva.innerText = `[Pista ${pistaSeleccionada.id}]: ${pistaSeleccionada.pista}`;

    respuestaActual = Array(pistaSeleccionada.largo).fill("");

    for (let i = 0; i < pistaSeleccionada.largo; i++) {
        let f = pistaSeleccionada.dir === "H" ? pistaSeleccionada.fila : pistaSeleccionada.fila + i;
        let c = pistaSeleccionada.dir === "H" ? pistaSeleccionada.col + i : pistaSeleccionada.col;
        const key = `${f}-${c}`;
        if (letrasGlobalesFijas[key]) {
            respuestaActual[i] = letrasGlobalesFijas[key]; 
        }
    }

    if (pistaSeleccionada.bancoLetras) {
        burbujasData = pistaSeleccionada.bancoLetras.map((l, idx) => ({ id: idx, letra: l, usada: false }));
    } else {
        burbujasData = [];
    }

    respuestaActual.forEach((l) => {
        if (l) {
            const bIndex = burbujasData.findIndex(b => b.letra === l && !b.usada);
            if (bIndex !== -1) burbujasData[bIndex].usada = true;
        }
    });

    dibujarPanelesConstruccion();
}

function dibujarPanelesConstruccion() {
    barraRespuesta.innerHTML = "";
    respuestaActual.forEach((letra, idx) => {
        const slot = document.createElement('div');
        slot.className = "slot-letra";
        slot.innerText = letra;
        
        let f = pistaSeleccionada.dir === "H" ? pistaSeleccionada.fila : pistaSeleccionada.fila + idx;
        let c = pistaSeleccionada.dir === "H" ? pistaSeleccionada.col + idx : pistaSeleccionada.col;
        const esFijaCruzada = letrasGlobalesFijas[`${f}-${c}`] !== undefined;

        if (esFijaCruzada) {
            slot.style.border = "1px solid #00ff66";
            slot.style.background = "rgba(0,255,102,0.2)";
            slot.style.color = "#00ff66";
            slot.style.pointerEvents = "none"; 
        } else {
            slot.addEventListener('click', () => {
                if (bloqueadoPorError || !letra) return;
                reproducirSonidoArcade("burbuja");
                
                const bIndex = burbujasData.findIndex(b => b.letra === letra && b.usada);
                if (bIndex !== -1) burbujasData[bIndex].usada = false;
                
                respuestaActual[idx] = "";
                dibujarPanelesConstruccion();
            });
        }
        barraRespuesta.appendChild(slot);
    });

    bancoBurbujas.innerHTML = "";
    burbujasData.forEach(b => {
        const div = document.createElement('div');
        div.className = "burbuja";
        if (b.usada) div.classList.add('usada');
        div.innerText = b.letra;

        div.addEventListener('click', () => {
            if (bloqueadoPorError || b.usada) return;
            reproducirSonidoArcade("burbuja");
            
            const primerVacioIdx = respuestaActual.indexOf("");
            if (primerVacioIdx !== -1) {
                respuestaActual[primerVacioIdx] = b.letra;
                b.usada = true;
                dibujarPanelesConstruccion();
            }
        });
        bancoBurbujas.appendChild(div);
    });

    const estaCompleta = respuestaActual.every(l => l !== "");
    btnConfirmar.disabled = !estaCompleta;
}

btnConfirmar.addEventListener('click', () => {
    if (!pistaSeleccionada || bloqueadoPorError) return;
    const palabraFinal = respuestaActual.join("");
    socket.emit('confirmar-palabra', { pistaId: pistaSeleccionada.id, intento: palabraFinal });
});

socket.on('palabra-bloqueada', ({ pistaId, palabra, fila, col, dir, dueno, puntos, letrasFijas }) => {
    palabrasResueltasGlobales.push(pistaId);

    const item = document.getElementById(`item-pista-${pistaId}`);
    if (item) item.classList.add('completada');

    if (dueno === socket.id) reproducirSonidoArcade("acierto");

    const claseDueno = (dueno === socket.id) ? 'resuelta-p1' : 'resuelta-p2';

    for (let i = 0; i < palabra.length; i++) {
        let f = dir === "H" ? fila : fila + i;
        let c = dir === "H" ? col + i : col;
        letrasGlobalesFijas[`${f}-${c}`] = palabra[i];

        const celda = document.getElementById(`celda-${f}-${c}`);
        if (celda) {
            celda.className = `celda activa ${claseDueno}`;
            celda.innerText = palabra[i];
        }
    }

    if (pistaSeleccionada && pistaSeleccionada.id === pistaId) {
        pistaTextoActiva.innerText = "¡Palabra capturada! Elegí otra.";
        barraRespuesta.innerHTML = "";
        bancoBurbujas.innerHTML = "";
        btnConfirmar.disabled = true;
        pistaSeleccionada = null;
        document.querySelectorAll('.celda').forEach(el => el.classList.remove('iluminada'));
    } else if (pistaSeleccionada) {
        activarPistaDetalle(pistaSeleccionada.id);
    }

    actualizarMarcadorVisual(puntos);
});

socket.on('castigo-error', ({ pistaId, puntos }) => {
    bloqueadoPorError = true;
    reproducirSonidoArcade("error");
    btnConfirmar.classList.add('congelado');
    btnConfirmar.innerText = "¡CONGELADO por 3s! ❄️";
    actualizarMarcadorVisual(puntos);
    
    setTimeout(() => {
        btnConfirmar.classList.remove('congelado');
        btnConfirmar.innerText = "Confirmar Respuesta";
        bloqueadoPorError = false;
        if (pistaSeleccionada) activarPistaDetalle(pistaSeleccionada.id);
    }, 3000);
});

socket.on('fin-partida-pantalla', ({ ganador, resumen }) => {
    document.querySelectorAll('.celda').forEach(el => el.classList.remove('iluminada'));
    bloqueJuegoActivo.classList.add('oculto');
    boxGanadorEmbed.innerText = `👑 ¡Fin del Juego! Ganador definitivo: ${ganador}\n(${resumen})`;
    bloqueFinalGame.classList.remove('oculto');
});

btnVolverMenu.addEventListener('click', () => {
    socket.emit('solicitar-volver-lobby');
});

btnJugarAzar.addEventListener('click', () => {
    socket.emit('solicitar-nueva-partida', { modo: "random", numero: 1 });
});

socket.on('forzar-regreso-lobby', () => {
    bloqueFinalGame.classList.add('oculto');
    pantallaInicio.classList.remove('oculto');
    
    pistaSeleccionada = null;
    juegoPistas = [];
    respuestaActual = [];
    burbujasData = [];
    letrasGlobalesFijas = {};
    palabrasResueltasGlobales = []; 
    
    grilla.innerHTML = "";
    listaPistasContenedor.innerHTML = "";
    barraRespuesta.innerHTML = "";
    bancoBurbujas.innerHTML = "";
    pistaTextoActiva.innerText = "Seleccioná una pista de la lista o tocá la grilla para arrancar";
});

socket.on('actualizar-marcador-solo', (puntos) => {
    actualizarMarcadorVisual(puntos);
});

btnEnviar.addEventListener('click', mandarMensajeChat);
inputMsg.addEventListener('keypress', (e) => { if(e.key === 'Enter') mandarMensajeChat(); });

function mandarMensajeChat() {
    const txt = inputMsg.value.trim();
    if(txt) {
        socket.emit('enviar-msj', txt);
        inputMsg.value = "";
    }
}

socket.on('msj-chat', ({ nombre, texto, tipo }) => {
    const div = document.createElement('div');
    div.className = "msg";
    if (tipo) div.className = `msg ${tipo}`;
    div.innerHTML = `<strong>${nombre}:</strong> ${texto}`;
    mensajes.appendChild(div);
    mensajes.scrollTop = mensajes.scrollHeight;
});