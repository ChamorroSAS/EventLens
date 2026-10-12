# Contrato local de entrada pública y navegación

2026-10-12 · EL-EP-018 · Gate técnico APPROVED, dictamen read-only `ep018_architect` incorporado por el orquestador. No cambia baseline, módulo de dominio, política de cuenta o credenciales. [Gates](../product/sessions/2026-10-12-el-ep-018-review-gates.md).

## Rutas y owners

| Ruta | Contrato | Propietario / integración |
|---|---|---|
| `/` | Home público con/sin sesión, nunca auto-redirect; contenido estático independiente del API | EL-EP-018, assets/foundation203/204 existentes |
| `/ingresar` | Login organizador y retorno seguro; no nueva autenticación | MOD-001, REST/OpenAPI/cliente y LoginForm propietario |
| `/solicitar-acceso` | Solicitud Beta pública, sólo correo, respuesta neutra sin cuenta/invitación | MOD-001 / EL-TK-008, backend existente; montaje HTTP/formulario faltante |
| `/mis-eventos` | Sesión organizador ordinaria; ownership/capacidades actuales del servidor | MOD-002 y OrganizerDashboard/Shell existentes |
| `/mi-cuenta` | Composición propia ordinaria o gestión restringida, nunca segundo dashboard | MOD-001 y MOD-008 / EL-TK-201 |
| `/g/:lookupKey` | Entrada directa al evento, sin Home/login organizador | Productor real getShareAccessSnapshot de EL-EP-004 |
| Wildcard frontend | 404 neutra después de rutas conocidas | Sin enumeración ni absorción API/media/assets |

Paths Beta/Mis eventos cerrados como contrato técnico de destinos aprobados. Anclas Home: como-funciona, beneficios, privacidad, preguntas-frecuentes. No `/evento/:id`, directorio, cambio QR ni enlace admin público. Admin conserva su contrato independiente.

## Identidad, proyección y campos propios

Fuente MOD-001 validada y capacidades vigentes de los owners, no valores del navegador. Estados de consumo: comprobación pendiente, anónimo, organizador ordinario, gestión restringida de eliminación, indisponibilidad. Unknown/unavailable no concede navegación privada ni prueba ausencia de sesión. Home no muestra correo/datos privados.

Mi cuenta lee exclusivamente correo, verificación y estado efectivos desde identidad; no nombre, avatar, teléfono, perfil/editables, fechas internas, invitationId, hashes, revisiones técnicas o tokens por existencia en domain record. Seguridad/sesiones se delegan a MOD-001; eliminación/reauth/consulta/cancelación a201 y sus predecesoras186/191/192/193. No cerrar001/015 globalmente por integrar esta superficie.

**Hallazgo de fuente:** organizer-auth.ts admite PENDING_DELETION en login/validateSession, pero resultado de login hardcodea account.status ACTIVE y ActorContext no proyecta propósito restringido. Corregir la proyección efectiva en owner MOD-001 al integrar, sin recrear185/186 ni cambiar su verificación. No autorizar por login.account.status/loggedIn. Pendiente sólo consulta/cancela eliminación autorizada; no menús, sesiones/seguridad ordinarios ni eventos. Pruebas de API deben verificar estas restricciones, no únicamente UI.

## Retorno y cierre de sesión

Resolver/canonicalizar returnUrl a rutas internas permitidas y comprobar autorización actual. Excluir externo, protocol-relative, esquemas, rutas API/media, QR/guest, admin, ciclos/auth; sin retorno válido, login termina en `/`. No usar credenciales guest como retorno. Home nunca auto-redirige.

Logout: MOD-001, sesión organizador actual únicamente. Expirar cookie y limpiar datos/caches/contexto organizador, preservando sesiones guest/admin. Éxito o sesión ya expirada/revocada → Home `/`, foco h1 y anuncio discreto de resultado. Fallo temporal/ACK incierto: quitar presentación privada, informar resultado indeterminado y reintento/reconciliación; no afirmar revocación ni restaurar capacidad ordinaria hasta comprobar autoridad. Sin logout global. UI cierra menú y no crea confirmación destructiva nueva.

## HTTP, bootstrap y hosting

Angular Router compatible con Angular instalado, composición de shells existentes, sin SSR/segunda app/librería UI. Controllers/adapters de los owners exponen capacidades existentes mediante REST/JSON/OpenAPI y cliente TypeScript generado; no DTO Nest/Prisma en Angular. Runtime AppModule y schema inspeccionados sólo health; módulos DONE no acreditan estas APIs/páginas montadas.

Secuenciación de tickets:206 sólo infraestructura/descriptores/retorno puro y ErrorState real en harness exclusivo test, sin activar root o importar pantallas futuras. Cada207..211 entrega componente/descriptor y transporte HTTP/OpenAPI/cliente de sus capacidades owners.213 depende de esas salidas y activa main/AppComponent/provideRouter/RouterOutlet, Home y404;214 valida runtime final con212. Sin ciclo oculto ni placeholders.211 incluye conectar callbacks alcanzables083 a074..078/082owners y retirar autoridad local simulada; no amplía a uploads/galería completos.205comprobando/indisponible son consumo/transporte, no estado persistido; CSRF transitorio permitido sin exponer tokens de sesión/credencial/proof.

Proyección pública mínima no expone sessionToken/cookie/proof/records ORM. Mutaciones autenticadas conservan Origin/CSRF y restricciones owner; respuestas privadas no-store. No nuevas tablas, autoridad o frontera transaccional; RecoveryAuthority y garantías dominio intactas.

Build servido/refresh directo de rutas conocidas; separar `/api`, assets/media y 404 de recursos físicos del fallback index.html. No se acredita Nginx productivo por dev server. Base href inicial `/`; prefijo alternativo de pruebas debe ser coherente con Router/assets/base pública de compartir.

Productor real event-public-access.ts:736–739 emite `/g/${cred.lookup_key}` y URL absoluta mediante baseUrl sin barras finales; no valida origen. Adapter suministra base pública desde configuración servidor confiable y valida HTTPS/origen/prefijo, nunca Host/payload arbitrario; local HTTP sólo fixture/laboratorio configurado. Preservar formato ya emitido. Redactar credencial en logs proxy/servidor/telemetría; no sólo evitar analytics Angular. Cache/referrer/indexación privados restrictivos; robots/noindex no autorizan. Indexación comercial Home es release, no requisito de ticketización; publicación pública conserva EP017/Q029.

## Evidencia y validación requerida

Fuente directa: main.ts/AppComponent sin Router, apps/api/AppModule sóloHealthController, schema sólohealth; productorQR real; organizer-auth.ts y contracts.ts; reauthentication.ts vigente. Grafo EventLens fast generación2026-10-09, cobertura not_tracked; ausencia de resultados no demuestra inexistencia. Dictamen no ejecutó tests ni verificó despliegue.

Entrega: OpenAPI/cliente generado y endpoints realmente montados; API permisos/no enumeración/CSRF/restricción; Playwright refresh/login-retorno/URLmaliciosa/logoutbackforward/sesiónpendiente/restringida/guestdirecto; buildservido base/fallback/QR sinabsorciónAPI ni media; UX/a11y conforme handoff. Las brechas son trabajo de integración y correctivo de proyección, no aprobación de una política de acceso nueva.
