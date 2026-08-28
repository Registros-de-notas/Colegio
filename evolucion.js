// ============================================
// SISTEMA DE EVOLUCIÓN DEL ALUMNO
// ============================================

const EVOLUCION = {
    /**
     * Registrar evolución de un alumno
     */
    registrar: async function(alumnoDni, tipo, descripcion, metadata = {}) {
        if (!alumnoDni || !tipo) {
            console.error('❌ Faltan datos para registrar evolución');
            return null;
        }

        if (typeof EVOLUCION_REF === 'undefined' || EVOLUCION_REF === null) {
            console.warn('⚠️ EVOLUCION_REF no disponible, guardando en localStorage');
            return this.guardarLocal(alumnoDni, tipo, descripcion, metadata);
        }

        try {
            const registro = {
                id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                alumno_dni: alumnoDni,
                tipo: tipo, // 'nota', 'asistencia', 'comportamiento', 'logro'
                descripcion: descripcion,
                metadata: metadata,
                fecha: new Date().toISOString(),
                timestamp: Date.now()
            };

            await EVOLUCION_REF.push(registro);
            console.log('✅ Evolución registrada:', tipo);
            return registro;
        } catch (error) {
            console.error('❌ Error al registrar evolución:', error);
            return this.guardarLocal(alumnoDni, tipo, descripcion, metadata);
        }
    },

    /**
     * Guardar en localStorage como fallback
     */
    guardarLocal: function(alumnoDni, tipo, descripcion, metadata) {
        const registro = {
            id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            alumno_dni: alumnoDni,
            tipo: tipo,
            descripcion: descripcion,
            metadata: metadata,
            fecha: new Date().toISOString(),
            timestamp: Date.now(),
            local: true
        };

        const evolucionLocal = JSON.parse(localStorage.getItem('evolucion_local') || '[]');
        evolucionLocal.push(registro);
        localStorage.setItem('evolucion_local', JSON.stringify(evolucionLocal));
        console.log('💾 Evolución guardada en localStorage:', tipo);
        return registro;
    },

    /**
     * Obtener evolución de un alumno
     */
    obtenerEvolucion: async function(alumnoDni, periodos = 4) {
        if (!alumnoDni) {
            console.error('❌ DNI del alumno requerido');
            return null;
        }

        try {
            // Obtener datos de Firebase
            let evolucion = [];
            let notas = [];
            let asistencias = [];

            if (typeof EVOLUCION_REF !== 'undefined' && EVOLUCION_REF !== null) {
                const evolucionSnap = await EVOLUCION_REF.orderByChild('alumno_dni').equalTo(alumnoDni).once('value');
                evolucion = Object.values(evolucionSnap.val() || {});
            }

            if (typeof NOTAS_REF !== 'undefined' && NOTAS_REF !== null) {
                const notasSnap = await NOTAS_REF.orderByChild('alumno_dni').equalTo(alumnoDni).once('value');
                notas = Object.values(notasSnap.val() || {});
            }

            if (typeof ASISTENCIAS_REF !== 'undefined' && ASISTENCIAS_REF !== null) {
                const asistenciasSnap = await ASISTENCIAS_REF.orderByChild('alumno_dni').equalTo(alumnoDni).once('value');
                asistencias = Object.values(asistenciasSnap.val() || {});
            }

            // Obtener de localStorage (fallback)
            const localEvolucion = JSON.parse(localStorage.getItem('evolucion_local') || '[]');
            const localNotas = JSON.parse(localStorage.getItem('notas_local') || '[]');
            const localAsistencias = JSON.parse(localStorage.getItem('asistencias_local') || '[]');

            evolucion = [...evolucion, ...localEvolucion.filter(e => e.alumno_dni === alumnoDni)];
            notas = [...notas, ...localNotas.filter(n => n.alumno_dni === alumnoDni)];
            asistencias = [...asistencias, ...localAsistencias.filter(a => a.alumno_dni === alumnoDni)];

            // Procesar evolución
            const registros = evolucion.sort((a, b) => a.timestamp - b.timestamp);

            // Procesar notas por módulo
            const modulos = ['I', 'II', 'III', 'IV'];
            const notasPorModulo = {};
            modulos.forEach(mod => {
                notasPorModulo[mod] = notas
                    .filter(n => n.modulo === mod)
                    .map(n => ({
                        materia: n.materia,
                        ec: n.EC || 0,
                        ep: n.EP || 0,
                        ed: n.ED || 0,
                        pm: n.PM || 0,
                        docente: n.docente_nombre || n.docente_dni
                    }));
            });

            // Calcular promedios por módulo
            const promediosPorModulo = {};
            modulos.forEach(mod => {
                const notasMod = notasPorModulo[mod] || [];
                if (notasMod.length > 0) {
                    const sumaPM = notasMod.reduce((acc, n) => acc + parseFloat(n.pm || 0), 0);
                    promediosPorModulo[mod] = Math.round((sumaPM / notasMod.length) * 10) / 10;
                } else {
                    promediosPorModulo[mod] = 0;
                }
            });

            // Procesar asistencias por módulo
            const asistenciasPorModulo = {};
            modulos.forEach(mod => {
                const asisMod = asistencias.filter(a => {
                    const fecha = new Date(a.fecha);
                    const mes = fecha.getMonth();
                    if (mod === 'I' && mes >= 0 && mes <= 2) return true;
                    if (mod === 'II' && mes >= 3 && mes <= 5) return true;
                    if (mod === 'III' && mes >= 6 && mes <= 8) return true;
                    if (mod === 'IV' && mes >= 9 && mes <= 11) return true;
                    return false;
                });

                const total = asisMod.length;
                const presentes = asisMod.filter(a => a.estado === 'asistio').length;
                asistenciasPorModulo[mod] = {
                    total: total,
                    presentes: presentes,
                    porcentaje: total > 0 ? Math.round((presentes / total) * 100) : 0
                };
            });

            // Calcular tendencia
            const tendencia = this.calcularTendencia(promediosPorModulo);

            // Detectar mejoras y áreas de oportunidad
            const analisis = this.analizarEvolucion(promediosPorModulo, registros);

            // Generar gráfico de datos
            const datosGrafico = this.generarDatosGrafico(promediosPorModulo, asistenciasPorModulo);

            // Obtener nombres de módulos
            const nombresModulos = getNombresModulos ? getNombresModulos() : { I: 'Módulo I', II: 'Módulo II', III: 'Módulo III', IV: 'Módulo IV' };

            return {
                alumno_dni: alumnoDni,
                periodos: periodos,
                promediosPorModulo: promediosPorModulo,
                asistenciasPorModulo: asistenciasPorModulo,
                notasPorModulo: notasPorModulo,
                tendencia: tendencia,
                analisis: analisis,
                datosGrafico: datosGrafico,
                registros: registros,
                nombresModulos: nombresModulos,
                resumen: {
                    mejorPromedio: Math.max(...Object.values(promediosPorModulo).filter(v => v > 0) || [0]),
                    peorPromedio: Math.min(...Object.values(promediosPorModulo).filter(v => v > 0) || [0]),
                    promedioGeneral: Object.values(promediosPorModulo).filter(v => v > 0).length > 0 ?
                        Math.round(Object.values(promediosPorModulo).filter(v => v > 0).reduce((a, b) => a + b, 0) /
                        Object.values(promediosPorModulo).filter(v => v > 0).length * 10) / 10 : 0,
                    mejorModulo: this.obtenerMejorModulo(promediosPorModulo),
                    peorModulo: this.obtenerPeorModulo(promediosPorModulo),
                    modulosCompletos: Object.values(promediosPorModulo).filter(v => v > 0).length
                }
            };

        } catch (error) {
            console.error('❌ Error al obtener evolución:', error);
            return null;
        }
    },

    /**
     * Calcular tendencia de rendimiento
     */
    calcularTendencia: function(promedios) {
        const modulos = ['I', 'II', 'III', 'IV'];
        const valores = modulos.map(m => promedios[m] || 0).filter(v => v > 0);

        if (valores.length < 2) return 'estable';

        const ultimo = valores[valores.length - 1];
        const penultimo = valores[valores.length - 2];

        if (ultimo > penultimo + 0.5) return 'mejorando';
        if (ultimo < penultimo - 0.5) return 'empeorando';
        return 'estable';
    },

    /**
     * Analizar evolución y generar recomendaciones
     */
    analizarEvolucion: function(promedios, registros) {
        const modulos = ['I', 'II', 'III', 'IV'];
        const mejoras = [];
        const oportunidades = [];

        // Analizar cambios entre módulos
        for (let i = 1; i < modulos.length; i++) {
            const actual = promedios[modulos[i]] || 0;
            const anterior = promedios[modulos[i - 1]] || 0;

            if (actual > anterior && actual - anterior >= 1.5 && anterior > 0) {
                mejoras.push({
                    modulo: modulos[i],
                    mejora: Math.round((actual - anterior) * 10) / 10,
                    descripcion: `Mejora significativa en ${modulos[i]} (${anterior} → ${actual})`
                });
            }

            if (actual < anterior && anterior - actual >= 1.5 && actual > 0) {
                oportunidades.push({
                    modulo: modulos[i],
                    caida: Math.round((anterior - actual) * 10) / 10,
                    descripcion: `Descenso en ${modulos[i]} (${anterior} → ${actual})`
                });
            }
        }

        // Analizar logros recientes
        const logrosRecientes = registros
            .filter(r => r.tipo === 'logro')
            .slice(-3)
            .map(r => r.descripcion);

        return {
            mejoras: mejoras,
            oportunidades: oportunidades,
            logrosRecientes: logrosRecientes,
            recomendaciones: this.generarRecomendaciones(mejoras, oportunidades)
        };
    },

    /**
     * Generar recomendaciones personalizadas
     */
    generarRecomendaciones: function(mejoras, oportunidades) {
        const recomendaciones = [];

        if (oportunidades.length > 0) {
            recomendaciones.push({
                tipo: 'atención',
                mensaje: 'Se detectaron áreas que necesitan refuerzo. Recomendamos atención adicional en los módulos: ' +
                    oportunidades.map(o => o.modulo).join(', ')
            });
        }

        if (mejoras.length > 0) {
            recomendaciones.push({
                tipo: 'felicitación',
                mensaje: '¡Excelente progreso! Ha mejorado en los módulos: ' +
                    mejoras.map(m => m.modulo).join(', ')
            });
        }

        if (mejoras.length === 0 && oportunidades.length === 0) {
            recomendaciones.push({
                tipo: 'mantenimiento',
                mensaje: 'El rendimiento se mantiene estable. Continúa con el mismo esfuerzo.'
            });
        }

        return recomendaciones;
    },

    /**
     * Obtener mejor módulo
     */
    obtenerMejorModulo: function(promedios) {
        let mejor = 0;
        let mejorModulo = '';
        for (const [mod, val] of Object.entries(promedios)) {
            if (val > mejor) {
                mejor = val;
                mejorModulo = mod;
            }
        }
        return mejorModulo;
    },

    /**
     * Obtener peor módulo
     */
    obtenerPeorModulo: function(promedios) {
        let peor = Infinity;
        let peorModulo = '';
        for (const [mod, val] of Object.entries(promedios)) {
            if (val > 0 && val < peor) {
                peor = val;
                peorModulo = mod;
            }
        }
        return peorModulo;
    },

    /**
     * Generar datos para gráficos
     */
    generarDatosGrafico: function(promedios, asistencias) {
        const modulos = ['I', 'II', 'III', 'IV'];
        const nombresModulos = getNombresModulos ? getNombresModulos() : { I: 'Módulo I', II: 'Módulo II', III: 'Módulo III', IV: 'Módulo IV' };

        return {
            labels: modulos.map(m => nombresModulos[m] || 'Módulo ' + m),
            notas: modulos.map(m => promedios[m] || 0),
            asistencias: modulos.map(m => asistencias[m]?.porcentaje || 0),
            modulosNombres: modulos.map(m => nombresModulos[m] || 'Módulo ' + m)
        };
    },

    /**
     * Obtener evolución de un alumno con datos de Firebase en tiempo real
     */
    escucharEvolucion: function(alumnoDni, callback) {
        if (!alumnoDni || typeof callback !== 'function') {
            console.error('❌ DNI del alumno y callback requeridos');
            return null;
        }

        if (typeof EVOLUCION_REF === 'undefined' || EVOLUCION_REF === null) {
            console.warn('⚠️ EVOLUCION_REF no disponible para escuchar');
            return null;
        }

        const ref = EVOLUCION_REF.orderByChild('alumno_dni').equalTo(alumnoDni);
        ref.on('value', async (snapshot) => {
            const data = await this.obtenerEvolucion(alumnoDni);
            callback(data);
        });

        return ref;
    },

    /**
     * Dejar de escuchar evolución
     */
    dejarEscuchar: function(ref) {
        if (ref) {
            ref.off();
            console.log('🔇 Escucha de evolución detenida');
        }
    },

    /**
     * Exportar evolución a CSV
     */
    exportarCSV: async function(alumnoDni) {
        const data = await this.obtenerEvolucion(alumnoDni);
        if (!data || !data.registros || data.registros.length === 0) {
            alert('No hay datos de evolución para exportar');
            return;
        }

        const headers = ['Fecha', 'Tipo', 'Descripción', 'Materia', 'Nota', 'Estado'];
        const rows = data.registros.map(r => [
            new Date(r.fecha).toLocaleString('es-ES'),
            r.tipo || 'desconocido',
            r.descripcion || 'Sin descripción',
            r.metadata?.materia || '',
            r.metadata?.nota || '',
            r.metadata?.estado || ''
        ]);

        let csv = headers.join(',') + '\n';
        rows.forEach(row => {
            csv += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',') + '\n';
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `evolucion_${alumnoDni}_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    }
};

// ============================================
// EXPORTAR PARA USO EN OTROS ARCHIVOS
// ============================================

// Hacer disponible globalmente
window.EVOLUCION = EVOLUCION;

console.log('✅ Sistema de Evolución cargado correctamente');
console.log('📋 Funciones disponibles:');
console.log('  - EVOLUCION.registrar()');
console.log('  - EVOLUCION.obtenerEvolucion()');
console.log('  - EVOLUCION.escucharEvolucion()');
console.log('  - EVOLUCION.dejarEscuchar()');
console.log('  - EVOLUCION.exportarCSV()');