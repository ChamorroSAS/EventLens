# EL-TK-082 — Derivar a solicitud de retiro cuando la sesión guest no está disponible

## Parent epic
EL-EP-004

## Status
DRAFT

## User story
**Como** persona que perdió su sesión guest, **quiero** acceder a la ruta de solicitud de retiro sin recuperar mi token, **para** poder pedir revisión de un aporte sin acceder a contenido privado.

## Alcance funcional
Exponer la entrada al RemovalRequestFlow sin sesión, reutilizando el contrato aprobado de EL-EP-009/DEC-103..105.

## Fuera de alcance
Resolver la solicitud, recuperar una sesión perdida, listar aportes privados o eliminar automáticamente contenido.

## Criterios de aceptación
### Escenario 1
**Dado** una sesión ausente/revocada, **cuando** la persona solicita retirar contenido, **entonces** accede al intake sin sesión sin recuperar ni asumir una sesión previa.

### Escenario 2
**Dado** una solicitud enviada, **cuando** se confirma recepción, **entonces** no se comunica que el contenido fue eliminado.

## Reglas de negocio
Correo de contacto no prueba titularidad ni recupera sesión. La resolución pertenece a EL-EP-009.

## Validaciones y permisos
No revelar existencia de contenido privado durante validación pública.

## Casos de error y estados vacíos
Referencias inválidas, rate limit o error temporal preservan neutralidad y entradas según contrato de EL-EP-009.

## Datos / contratos afectados
Solo navegación/entrada al RemovalRequest contract; no nuevo modelo de dominio.

## Dependencias técnicas y funcionales
Contrato aprobado de intake EL-EP-009 y disponibilidad guest.

## Dependencias de tickets
- **depends_on:** EL-TK-074, EL-TK-075, contrato de EL-EP-009.
- **blocks:** EL-TK-083.

## Pruebas requeridas
Sin sesión, sesión revocada, no enumeración y copy recepción≠resolución.

## Observabilidad / auditoría
Sin registrar referencias sensibles en logs públicos.

## Prioridad
P0

## Estimación
S

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
