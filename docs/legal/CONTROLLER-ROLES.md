# EventLens — Matriz preliminar de responsable y encargado

Estado: DRAFT (2026-10-12). Operador inicial: **persona natural** (decisión confirmada de producto); identidad y contactos reales pendientes.

## Principio

La condición de responsable se analiza **por tratamiento**, según quién decide finalidad y medios. Encargado es quien procesa por cuenta de ese responsable. No afirmar que EventLens es el único responsable de todo contenido del organizador. Base: Ley 1581/2012 art. 3; Decreto 1074/2015.

| Flujo | Responsable propuesto por finalidad | Papel probable del operador natural | Papel del organizador | Pendiente |
|---|---|---|---|---|
| Home, registro técnico mínimo y seguridad | Operador EventLens | Responsable de tratamientos operativos propios | Ninguno | Inventario logs/cookies |
| Solicitud Beta (email) | Operador EventLens | Responsable | Ninguno | Finalidad, autorización, retención, derechos |
| Cuenta/credenciales/sesiones organizador | Operador para gestión de identidad | Responsable de cuenta y controles propios | Titular o representante, según caso | Esquema real y procedimiento |
| Finalidad del evento, quién participa y galería | Organizador según escenario real | Posible encargado técnico; responsable de seguridad/moderación propias | Posible responsable de la finalidad del álbum | Términos, instrucciones y reparto de derechos |
| Fotografías/videos de invitado | Organizador sobre fin y visibilidad del álbum, según caso | Posible encargado de hosting/procesamiento y responsable de algunos tratamientos propios | Define quién puede ver, moderar/exportar según contrato | Derechos de personas retratadas; medios de retiro |
| Aceptación guest y token event-scoped | Depende de qué finalidad se registre | Seguridad y evidencia técnica propias y/o encargado | Reglas del evento | No identificar anon como persona |
| Denuncias y retiro | Operador en investigación de abuso grave; organizador moderación cotidiana | Potencial responsable del expediente de denuncia | Responsable de moderación del evento | Base de datos, minimización, plazos |
| Almacenamiento S3 y emails | Operador o contratante decide finalidad | Instruye al proveedor | No necesariamente contrata proveedor | Países, DPA, subencargados |

## Decisiones funcionales vigentes, sin asignación jurídica automática

**CONFIRMED 2026-10-12:** organizadores personas naturales **y organizaciones**; álbum privado visible únicamente para participantes autorizados según estado y permisos, bajo gestión ordinaria del organizador; terceros pueden denunciar o solicitar retiro sin crear cuenta. [Registro y contraste con contratos](../../.codex/product/sessions/2026-10-12-el-ep-017-organizers-gallery-and-reports.md). Una organización puede tener representantes humanos, pero **no** se presume un nuevo tipo de cuenta o registro empresarial implementado. La clasificación responsable/encargado sigue PENDING tratamiento por tratamiento.

## Riesgos jurídicos materiales

1. **La autorización del uploader no equivale necesariamente al consentimiento de todas las personas que aparecen en sus fotos.** Prever reclamaciones de terceros sin cuenta.
2. El producto no dirigido a menores no elimina el riesgo de **menores presentes en fotografías**. Datos de menores y autorización del representante requieren examen reforzado.
3. El organizador puede **exportar originales**; sus tratamientos posteriores fuera de EventLens no quedan automáticamente autorizados por los términos de la plataforma.
4. EventLens puede actuar con fines propios sobre auditoría/seguridad y por cuenta de un organizador sobre álbumes: no forzar la misma categoría jurídica en todos los tratamientos.
5. El almacenamiento externo, correos y backups requieren inventario de región, proveedor y contrato de transmisión; no confundir transferencia entre responsables con transmisión a encargado.

## Decisiones necesarias para cerrar la matriz

- Naturaleza del organizador: a título personal, por empresa u organización; finalidad precisa.
- Qué instrucciones y derechos del titular se acuerdan mediante términos/contrato.
- Qué datos trata EventLens como responsable para proteger servicio, moderar y auditar.
- Contratos y regiones reales de proveedores y subencargados.
- Tratamiento de fotos de menores y solicitudes de personas sin cuenta.
- Identidad y datos de contacto del operador natural, por procedimiento seguro.

Fuentes: Ley 1581/2012 art. 3 y 12; Decreto 1074/2015; SIC concepto 25-632634 (https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/alcance-de-la-circular-002-de-2025-sobre-transferencias-internacionales-de-datos).
