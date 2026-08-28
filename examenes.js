// ============================================
// SISTEMA DE EXÁMENES EN LÍNEA
// ============================================

const EXAMENES = {
    /**
     * Crear un nuevo examen (Admin Principal o Docente)
     */
    crearExamen: async function(data) {
        if (!data.titulo || !data.preguntas || data.preguntas.length === 0) {
            console.error('❌ Faltan datos para crear el examen');
            return null;
        }

        if (typeof EXAMENES_REF === 'undefined' || EXAMENES_REF === null) {
            console.warn('⚠️ EXAMENES_REF no disponible');
            return null;
        }

        try {
            const examen = {
                id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                titulo: data.titulo.trim(),
                materia: data.materia || '',
                grado: data.grado || '',
                seccion: data.seccion || '',
                nivel: data.nivel || '',
                modulo: data.modulo || 'I',
                docente_dni: data.docente_dni || '',
                docente_nombre: data.docente_nombre || '',
                fecha_examen: data.fecha_examen || '',
                hora_inicio: data.hora_inicio || '08:00',
                duracion: parseInt(data.duracion) || 30,
                preguntas: data.preguntas,
                activo: true,
                fecha_creacion: new Date().toISOString(),
                creado_por: data.creado_por || '',
                resultados: [],
                configuracion: {
                    permitir_cambio: false, // NO permite cambiar respuesta
                    mostrar_resultados: true,
                    mostrar_respuestas: false
                }
            };

            await EXAMENES_REF.push(examen);
            console.log('✅ Examen creado:', examen.titulo);
            
            if (typeof AUDITORIA !== 'undefined' && AUDITORIA.registrar) {
                AUDITORIA.registrar(
                    'creacion_examen',
                    'media',
                    data.creado_por || 'admin',
                    `Examen "${examen.titulo}" creado para ${data.grado}`,
                    { materia: data.materia, modulo: data.modulo }
                );
            }

            return examen;
        } catch (error) {
            console.error('❌ Error al crear examen:', error);
            return null;
        }
    },

    /**
     * Obtener exámenes por docente
     */
    obtenerExamenesPorDocente: async function(docenteDni) {
        if (!docenteDni) return [];

        try {
            if (typeof EXAMENES_REF === 'undefined' || EXAMENES_REF === null) {
                return [];
            }

            const snap = await EXAMENES_REF.orderByChild('docente_dni').equalTo(docenteDni).once('value');
            const data = snap.val() || {};
            // CORRECCIÓN: Convertir a arreglo si es objeto
            const examenes = Array.isArray(data) ? data : Object.values(data);
            
            examenes.sort((a, b) => new Date(b.fecha_creacion) - new Date(a.fecha_creacion));
            return examenes;
        } catch (error) {
            console.error('❌ Error al obtener exámenes:', error);
            return [];
        }
    },

    /**
     * Obtener exámenes por alumno (CORREGIDO)
     */
    obtenerExamenesPorAlumno: async function(alumnoDni) {
        if (!alumnoDni) return [];

        try {
            // Obtener datos del alumno
            let grado = '', seccion = '', nivel = '';
            if (typeof USUARIOS_REF !== 'undefined' && USUARIOS_REF !== null) {
                const uSnap = await USUARIOS_REF.once('value');
                let usuarios = uSnap.val() || [];
                // CORRECCIÓN: Convertir a arreglo si es objeto
                usuarios = Array.isArray(usuarios) ? usuarios : Object.values(usuarios);
                const alumno = usuarios.find(u => u.dni === alumnoDni);
                if (alumno) {
                    grado = alumno.grado || '';
                    seccion = alumno.seccion || '';
                    nivel = alumno.nivel || '';
                }
            }

            if (typeof EXAMENES_REF === 'undefined' || EXAMENES_REF === null) {
                return [];
            }

            const snap = await EXAMENES_REF.once('value');
            const data = snap.val() || {};
            // CORRECCIÓN: Convertir a arreglo si es objeto
            const todos = Array.isArray(data) ? data : Object.values(data);
            
            // Filtrar exámenes activos para el alumno
            const examenes = todos.filter(e => 
                e.activo !== false &&
                e.grado === grado &&
                e.seccion === seccion &&
                e.nivel === nivel
            );

            // Ordenar por fecha de examen (más cercano primero)
            examenes.sort((a, b) => new Date(a.fecha_examen) - new Date(b.fecha_examen));

            // Verificar si el alumno ya rindió el examen
            for (let e of examenes) {
                e.ya_rendido = e.resultados?.some(r => r.alumno_dni === alumnoDni) || false;
            }

            return examenes;
        } catch (error) {
            console.error('❌ Error al obtener exámenes por alumno:', error);
            return [];
        }
    },

    /**
     * Obtener un examen específico por ID
     */
    obtenerExamen: async function(examenId) {
        if (!examenId) return null;

        try {
            if (typeof EXAMENES_REF === 'undefined' || EXAMENES_REF === null) {
                return null;
            }

            const snap = await EXAMENES_REF.orderByChild('id').equalTo(examenId).once('value');
            const data = snap.val() || {};
            const keys = Object.keys(data);
            if (keys.length > 0) {
                return { key: keys[0], ...data[keys[0]] };
            }
            return null;
        } catch (error) {
            console.error('❌ Error al obtener examen:', error);
            return null;
        }
    },

    /**
     * Verificar si el examen está disponible para rendir
     */
    estaDisponible: function(examen) {
        if (!examen || examen.activo === false) return false;
        
        const ahora = new Date();
        const fechaExamen = new Date(examen.fecha_examen + 'T' + (examen.hora_inicio || '08:00'));
        const fechaFin = new Date(fechaExamen.getTime() + (examen.duracion || 30) * 60000);
        
        return ahora >= fechaExamen && ahora <= fechaFin;
    },

    /**
     * Verificar si el examen ya expiró
     */
    estaExpirado: function(examen) {
        if (!examen) return true;
        
        const ahora = new Date();
        const fechaExamen = new Date(examen.fecha_examen + 'T' + (examen.hora_inicio || '08:00'));
        const fechaFin = new Date(fechaExamen.getTime() + (examen.duracion || 30) * 60000);
        
        return ahora > fechaFin;
    },

    /**
     * Rendir examen (Alumno)
     */
    rendirExamen: async function(examenId, alumnoDni, alumnoNombre, respuestas) {
        if (!examenId || !alumnoDni || !respuestas) {
            console.error('❌ Faltan datos para rendir examen');
            return null;
        }

        try {
            // Obtener el examen
            const examen = await this.obtenerExamen(examenId);
            if (!examen) {
                console.error('❌ Examen no encontrado');
                return null;
            }

            // Verificar si ya rindió
            if (examen.resultados?.some(r => r.alumno_dni === alumnoDni)) {
                console.error('❌ El alumno ya rindió este examen');
                return null;
            }

            // Verificar si está disponible
            if (!this.estaDisponible(examen)) {
                console.error('❌ Examen no disponible');
                return null;
            }

            // Calcular nota
            let correctas = 0;
            const preguntas = examen.preguntas || [];
            
            preguntas.forEach((p, index) => {
                if (respuestas[index] !== undefined && respuestas[index] === p.respuesta) {
                    correctas++;
                }
            });

            const nota = Math.round((correctas / preguntas.length) * 20);
            const notaFinal = Math.min(nota, 20);

            // Guardar resultado
            const resultado = {
                alumno_dni: alumnoDni,
                alumno_nombre: alumnoNombre || 'Alumno',
                respuestas: respuestas,
                correctas: correctas,
                total: preguntas.length,
                nota: notaFinal,
                fecha: new Date().toISOString(),
                tiempo_tomado: 0 // Se podría agregar tiempo real
            };

            if (!examen.resultados) examen.resultados = [];
            examen.resultados.push(resultado);

            // Guardar en Firebase
            if (typeof EXAMENES_REF !== 'undefined' && EXAMENES_REF !== null) {
                const snap = await EXAMENES_REF.orderByChild('id').equalTo(examenId).once('value');
                const data = snap.val() || {};
                const keys = Object.keys(data);
                if (keys.length > 0) {
                    await EXAMENES_REF.child(keys[0]).update({ 
                        resultados: examen.resultados,
                        activo: examen.activo
                    });
                }
            }

            console.log('✅ Examen rendido:', examenId, 'Alumno:', alumnoDni, 'Nota:', notaFinal);
            
            if (typeof AUDITORIA !== 'undefined' && AUDITORIA.registrar) {
                AUDITORIA.registrar(
                    'rendir_examen',
                    'baja',
                    alumnoDni,
                    `Examen "${examen.titulo}" rendido - Nota: ${notaFinal}/20`,
                    { examen_id: examenId }
                );
            }

            return {
                examen_id: examenId,
                nota: notaFinal,
                correctas: correctas,
                total: preguntas.length,
                respuestas: respuestas,
                respuestas_correctas: preguntas.map(p => p.respuesta)
            };
        } catch (error) {
            console.error('❌ Error al rendir examen:', error);
            return null;
        }
    },

    /**
     * Obtener resultados de un examen
     */
    obtenerResultados: async function(examenId) {
        if (!examenId) return [];

        try {
            const examen = await this.obtenerExamen(examenId);
            if (!examen) return [];
            return examen.resultados || [];
        } catch (error) {
            console.error('❌ Error al obtener resultados:', error);
            return [];
        }
    },

    /**
     * Obtener estadísticas de un examen
     */
    obtenerEstadisticasExamen: async function(examenId) {
        try {
            const resultados = await this.obtenerResultados(examenId);
            if (resultados.length === 0) return null;

            const notas = resultados.map(r => r.nota);
            const promedio = notas.reduce((a, b) => a + b, 0) / notas.length;
            const aprobados = notas.filter(n => n >= 11).length;
            const desaprobados = notas.filter(n => n < 11).length;

            return {
                total_alumnos: resultados.length,
                promedio: Math.round(promedio * 10) / 10,
                aprobados: aprobados,
                desaprobados: desaprobados,
                porcentaje_aprobados: Math.round((aprobados / resultados.length) * 100),
                nota_maxima: Math.max(...notas),
                nota_minima: Math.min(...notas)
            };
        } catch (error) {
            console.error('❌ Error al obtener estadísticas:', error);
            return null;
        }
    },

    /**
     * Actualizar configuración del examen (Docente)
     */
    actualizarConfiguracion: async function(examenId, config) {
        if (!examenId || !config) {
            console.error('❌ Faltan datos');
            return false;
        }

        try {
            if (typeof EXAMENES_REF === 'undefined' || EXAMENES_REF === null) {
                return false;
            }

            const snap = await EXAMENES_REF.orderByChild('id').equalTo(examenId).once('value');
            const data = snap.val() || {};
            const keys = Object.keys(data);
            if (keys.length > 0) {
                const examen = data[keys[0]];
                const datosActualizados = {
                    ...examen,
                    fecha_examen: config.fecha_examen || examen.fecha_examen || '',
                    hora_inicio: config.hora_inicio || examen.hora_inicio || '',
                    duracion: parseInt(config.duracion) || examen.duracion || 30,
                    activo: config.activo !== undefined ? config.activo : true
                };
                await EXAMENES_REF.child(keys[0]).update(datosActualizados);
                console.log('✅ Configuración del examen actualizada');
                return true;
            }
            return false;
        } catch (error) {
            console.error('❌ Error al actualizar configuración:', error);
            return false;
        }
    },

    /**
     * Cerrar un examen
     */
    cerrarExamen: async function(examenId) {
        return this.actualizarConfiguracion(examenId, { activo: false });
    },

    /**
     * Activar un examen
     */
    activarExamen: async function(examenId) {
        return this.actualizarConfiguracion(examenId, { activo: true });
    },

    /**
     * Eliminar un examen
     */
    eliminarExamen: async function(examenId) {
        if (!examenId) return false;

        try {
            if (typeof EXAMENES_REF === 'undefined' || EXAMENES_REF === null) {
                return false;
            }

            const snap = await EXAMENES_REF.orderByChild('id').equalTo(examenId).once('value');
            const data = snap.val() || {};
            const keys = Object.keys(data);
            if (keys.length > 0) {
                await EXAMENES_REF.child(keys[0]).remove();
                console.log('🗑️ Examen eliminado');
                return true;
            }
            return false;
        } catch (error) {
            console.error('❌ Error al eliminar examen:', error);
            return false;
        }
    },

    /**
     * Escuchar exámenes en tiempo real
     */
    escucharExamenes: function(docenteDni, callback) {
        if (!docenteDni || typeof callback !== 'function') {
            console.error('❌ DNI del docente y callback requeridos');
            return null;
        }

        if (typeof EXAMENES_REF === 'undefined' || EXAMENES_REF === null) {
            console.warn('⚠️ EXAMENES_REF no disponible');
            return null;
        }

        const ref = EXAMENES_REF.orderByChild('docente_dni').equalTo(docenteDni);
        ref.on('value', async (snapshot) => {
            const data = snapshot.val() || {};
            // CORRECCIÓN: Convertir a arreglo si es objeto
            const examenes = Array.isArray(data) ? data : Object.values(data);
            callback(examenes);
        });

        return ref;
    },

    /**
     * Escuchar resultados de un examen
     */
    escucharResultados: function(examenId, callback) {
        if (!examenId || typeof callback !== 'function') {
            console.error('❌ ID del examen y callback requeridos');
            return null;
        }

        if (typeof EXAMENES_REF === 'undefined' || EXAMENES_REF === null) {
            console.warn('⚠️ EXAMENES_REF no disponible');
            return null;
        }

        const ref = EXAMENES_REF.orderByChild('id').equalTo(examenId);
        ref.on('value', async (snapshot) => {
            const data = snapshot.val() || {};
            const keys = Object.keys(data);
            if (keys.length > 0) {
                const examen = data[keys[0]];
                callback(examen.resultados || []);
            }
        });

        return ref;
    },

    /**
     * Dejar de escuchar
     */
    dejarEscuchar: function(ref) {
        if (ref) {
            ref.off();
            console.log('🔇 Escucha detenida');
        }
    },

    /**
     * Verificar si un examen tiene preguntas válidas
     */
    validarPreguntas: function(preguntas) {
        if (!preguntas || !Array.isArray(preguntas) || preguntas.length === 0) {
            return { valido: false, mensaje: 'No hay preguntas en el examen.' };
        }

        for (let i = 0; i < preguntas.length; i++) {
            const p = preguntas[i];
            if (!p.texto || p.texto.trim() === '') {
                return { valido: false, mensaje: `La pregunta ${i + 1} no tiene texto.` };
            }
            if (!p.opciones || !Array.isArray(p.opciones) || p.opciones.length < 2) {
                return { valido: false, mensaje: `La pregunta ${i + 1} no tiene suficientes opciones.` };
            }
            for (let j = 0; j < p.opciones.length; j++) {
                if (!p.opciones[j] || p.opciones[j].trim() === '') {
                    return { valido: false, mensaje: `La opción ${j + 1} de la pregunta ${i + 1} está vacía.` };
                }
            }
            if (p.respuesta === undefined || p.respuesta === null || p.respuesta < 0 || p.respuesta >= p.opciones.length) {
                return { valido: false, mensaje: `La pregunta ${i + 1} no tiene una respuesta correcta válida.` };
            }
        }

        return { valido: true, mensaje: 'Todas las preguntas son válidas.' };
    },

    /**
     * Obtener el estado de un examen (texto)
     */
    getEstadoTexto: function(examen) {
        if (!examen) return 'Desconocido';
        if (!examen.activo) return 'Cerrado';
        if (this.estaDisponible(examen)) return 'Disponible';
        if (this.estaExpirado(examen)) return 'Expirado';
        return 'Próximo';
    },

    /**
     * Obtener el estado de un examen (clase CSS)
     */
    getEstadoClase: function(examen) {
        if (!examen) return 'secundary';
        if (!examen.activo) return 'danger';
        if (this.estaDisponible(examen)) return 'success';
        if (this.estaExpirado(examen)) return 'danger';
        return 'warning';
    },

    /**
     * Obtener la nota de un alumno en un examen
     */
    obtenerNotaAlumno: function(examen, alumnoDni) {
        if (!examen || !examen.resultados) return null;
        const resultado = examen.resultados.find(r => r.alumno_dni === alumnoDni);
        return resultado ? resultado.nota : null;
    },

    /**
     * Obtener el detalle de respuestas de un alumno
     */
    obtenerDetalleAlumno: function(examen, alumnoDni) {
        if (!examen || !examen.resultados) return null;
        return examen.resultados.find(r => r.alumno_dni === alumnoDni) || null;
    },

    /**
     * Verificar si un alumno ya rindió un examen
     */
    yaRendio: function(examen, alumnoDni) {
        if (!examen || !examen.resultados) return false;
        return examen.resultados.some(r => r.alumno_dni === alumnoDni);
    },

    /**
     * Obtener el total de alumnos que rindieron un examen
     */
    totalAlumnosRindieron: function(examen) {
        if (!examen || !examen.resultados) return 0;
        return examen.resultados.length;
    },

    /**
     * Obtener el promedio de un examen
     */
    obtenerPromedio: function(examen) {
        if (!examen || !examen.resultados || examen.resultados.length === 0) return 0;
        const notas = examen.resultados.map(r => r.nota);
        return Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10;
    },

    /**
     * Obtener la distribución de notas de un examen
     */
    obtenerDistribucionNotas: function(examen) {
        if (!examen || !examen.resultados || examen.resultados.length === 0) {
            return { '0-5': 0, '6-10': 0, '11-15': 0, '16-20': 0 };
        }
        const distribucion = { '0-5': 0, '6-10': 0, '11-15': 0, '16-20': 0 };
        examen.resultados.forEach(r => {
            const nota = r.nota;
            if (nota <= 5) distribucion['0-5']++;
            else if (nota <= 10) distribucion['6-10']++;
            else if (nota <= 15) distribucion['11-15']++;
            else distribucion['16-20']++;
        });
        return distribucion;
    },

    /**
     * Obtener el ranking de un examen
     */
    obtenerRanking: function(examen) {
        if (!examen || !examen.resultados || examen.resultados.length === 0) return [];
        const resultados = [...examen.resultados];
        resultados.sort((a, b) => b.nota - a.nota);
        return resultados.map((r, index) => ({
            puesto: index + 1,
            alumno_nombre: r.alumno_nombre || 'Alumno',
            nota: r.nota,
            correctas: r.correctas,
            total: r.total
        }));
    },

    /**
     * Generar un reporte de un examen
     */
    generarReporte: function(examen) {
        if (!examen) return null;
        return {
            titulo: examen.titulo || 'Sin título',
            materia: examen.materia || 'Sin materia',
            grado: examen.grado || '',
            seccion: examen.seccion || '',
            fecha: examen.fecha_examen || '',
            duracion: examen.duracion || 0,
            total_preguntas: examen.preguntas ? examen.preguntas.length : 0,
            total_alumnos: this.totalAlumnosRindieron(examen),
            promedio: this.obtenerPromedio(examen),
            distribucion: this.obtenerDistribucionNotas(examen),
            ranking: this.obtenerRanking(examen),
            estado: this.getEstadoTexto(examen)
        };
    }
};

// Exportar para uso global
window.EXAMENES = EXAMENES;

console.log('✅ Sistema de Exámenes cargado correctamente');
console.log('📋 Funciones disponibles:');
console.log('  - EXAMENES.crearExamen()');
console.log('  - EXAMENES.obtenerExamenesPorDocente()');
console.log('  - EXAMENES.obtenerExamenesPorAlumno()');
console.log('  - EXAMENES.obtenerExamen()');
console.log('  - EXAMENES.rendirExamen()');
console.log('  - EXAMENES.obtenerResultados()');
console.log('  - EXAMENES.obtenerEstadisticasExamen()');
console.log('  - EXAMENES.actualizarConfiguracion()');
console.log('  - EXAMENES.cerrarExamen()');
console.log('  - EXAMENES.activarExamen()');
console.log('  - EXAMENES.estaDisponible()');
console.log('  - EXAMENES.validarPreguntas()');
console.log('  - EXAMENES.generarReporte()');
console.log('  - EXAMENES.escucharExamenes()');
console.log('  - EXAMENES.dejarEscuchar()');