# EventLens — mapa funcional propuesto

## Estado y trazabilidad

**RECOMMENDED:** estructura funcional propuesta por `product_planner`, 2026-10-07. No agrega decisiones confirmadas de producto. Las capacidades y límites proceden de PROJECT, Q-001 a Q-029 y DEC-001 a DEC-059. **CONFIRMED:** discovery cerrado para planificación; los cruces funcionales detectados en esta fase se documentan en las épicas como PL-001 a PL-014, sin sustituir decisiones aceptadas.

Los límites son capacidades del producto; no implican servicios separados, pantallas independientes ni arquitectura de despliegue. Los módulos pertenecen al MVP salvo indicación expresa. Una épica READY está suficientemente delimitada para revisión de requisitos; no significa implementada ni desbloqueada por sus predecesoras.

| ID | Módulo | Responsabilidad | Actores | Capacidades principales | Dependencias funcionales | Horizonte | Épicas |
|---|---|---|---|---|---|---|---|
| MOD-001 | Cuentas y acceso de organizadores | Incorporar organizadores adultos invitados a BETA y proteger su cuenta. | Organizador, administración | Invitaciones; registro; correo verificado; login; recuperación; gestión de sesiones. | MOD-009 | MVP | EL-EP-001 |
| MOD-002 | Organización y ciclo del evento | Preparar, publicar y controlar disponibilidad temporal de un espacio privado. | Organizador, sistema, administración | Datos básicos; portada; preview; zona IANA; inicio; cierre; gracia; suspensión. | MOD-001, MOD-006, MOD-009 | MVP | EL-EP-002, EL-EP-003 |
| MOD-003 | Participación y recepción multimedia | Permitir aportes sin cuenta y conservar originales con procesamiento recuperable. | Invitado, organizador, sistema, administración | QR/enlace/PIN; sesión anónima; consentimiento; carga múltiple; validación; originales y derivados; cuarentena. | MOD-002, MOD-006, MOD-008, MOD-009 | MVP | EL-EP-004, EL-EP-005, EL-EP-006 |
| MOD-004 | Galería y control del contenido | Compartir recuerdos autorizados y gestionar publicación, moderación y denuncias. | Invitado, organizador, administración | Galería responsive; aprobar/rechazar; ocultar; papelera; restauración; denuncia/retiro. | MOD-002, MOD-003, MOD-008, MOD-009 | MVP | EL-EP-007, EL-EP-008, EL-EP-009 |
| MOD-005 | Recuperación de recuerdos | Entregar al organizador sus originales de forma individual o por paquetes. | Organizador, sistema | Descarga individual; exportación asíncrona; ZIPs; enlaces privados 48 h. | MOD-001, MOD-003, MOD-004, MOD-008, MOD-009 | MVP | EL-EP-010 |
| MOD-006 | Planes y capacidad del evento | Asignar condiciones BETA y aplicar límites/overrides sin alterar el plan base. | Organizador, administración, sistema | Plan BETA; límites parametrizados; consumo; ampliación manual; overrides auditados. | MOD-001, MOD-009 | MVP; evolución comercial posterior | EL-EP-011 |
| MOD-007 | Administración y soporte | Permitir intervención operativa justificada y restringida sobre capacidades existentes. | Administración; organizador como solicitante | Búsqueda; diagnóstico; invitaciones; solicitudes; intervenciones; acceso justificado a multimedia. | MOD-001, MOD-002, MOD-003, MOD-004, MOD-006, MOD-008, MOD-009 | MVP | EL-EP-012 |
| MOD-008 | Privacidad y fin de vida de datos | Aplicar consentimiento, retiro y eliminación sin conservar multimedia para auditoría. | Invitado, organizador, administración, sistema; asesoría legal futura | Reglas de consentimiento; borrado de evento/cuenta; ventanas cancelables; purga y backups; preparación jurídica. | MOD-001, MOD-002, MOD-003, MOD-004, MOD-005, MOD-009 | Transversal MVP; cierre jurídico previo a apertura pública | EL-EP-015, EL-EP-017 |
| MOD-009 | Comunicación y operación confiable | Comunicar cambios, detectar fallos, trazar intervenciones y evaluar la beta. | Organizador, administración, equipo operativo, sistema | Correo y panel; deduplicación; auditoría; alertas; recuperación; métricas BETA. | Consume señales de todos los módulos; interfaces definidas por dominio | Transversal MVP | EL-EP-013, EL-EP-014, EL-EP-016 |

## Cross-cutting capabilities

| Capacidad compartida | Límite propietario | Consumidores y criterio |
|---|---|---|
| Autenticación y cuentas | MOD-001 | Organizador/admin autenticados. Invitado conserva sesión anónima en MOD-003; no convertirla en cuenta. |
| Autorización | Cada dominio; políticas comunes | MOD-001 acredita actor; evento/propietario/estado de media/justificación autorizan cada acción. No módulo independiente que duplique reglas. |
| Auditoría y trazabilidad | MOD-009 | Cada dominio emite acción mínima y actor. Administrador consulta en MOD-007. 12 meses configurables; media nunca se retiene para auditoría. |
| Notificaciones | MOD-009 | Correo/panel y deduplicación compartidos. El dominio decide cuándo y si corresponde notificar; no inventar el lifecycle desde el servicio de correo. |
| Almacenamiento de archivos | MOD-003 para originales/derivados; MOD-005 para paquetes | Infraestructura compartida privada. MOD-006 define cuota; MOD-008 define purga. No módulo por proveedor/bucket. |
| Procesamiento multimedia | MOD-003 | Validación, derivados, fallos y cuarentena son parte de recibir aportes utilizables. |
| Seguridad | Todos; operación en MOD-009 | Sesiones/rate limit/aislamiento/TLS, revocación y auditoría se aplican en sus fronteras; respuesta operativa MOD-007. |
| Administración interna | MOD-007 | Capacidad funcional propia de soporte controlado. Ejecuta reglas de los dominios, sin duplicarlas ni acceso libre a media. |
| Planes y límites | MOD-006 | MOD-002/003 aplican vigencia/cuota; consola administra overrides; pagos posteriores sin decisión de proveedor. |
| Configuración | Dominio propietario | Evento MOD-002, plan MOD-006, privacidad MOD-008, alertas/notificaciones MOD-009. No una megaépica de parámetros genéricos. |
| Observabilidad y recuperación | MOD-009 | Salud, errores, procesamiento, purga, backup; los recursos operados siguen perteneciendo a cada dominio. |
| Privacidad y consentimiento | MOD-008 reglas; MOD-003 ejecución de aceptación | MOD-004 tramita reportes; MOD-005 protege paquetes; MOD-001/002 aplican borrado. Revisión jurídica EL-EP-017 antes de apertura pública. |
| Reportes | MOD-004 denuncias; MOD-009 evaluación BETA | Denuncias no son analítica. Las estadísticas detalladas para clientes siguen fuera del MVP. |

## Evolución posterior

**CONFIRMED:** pagos/comercialización, coorganizadores, personalización avanzada, funciones sociales, descargas de invitados, slideshow, álbumes/favoritos, profesionales e importaciones están fuera del MVP. **RECOMMENDED:** extender estos límites cuando se descubran las reglas; no crear módulos/épicas implementables solo por enumerar deseos futuros. Discovery comercial separado antes de definir checkout y políticas de cobro.
