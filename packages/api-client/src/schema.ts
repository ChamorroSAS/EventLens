// Generated from contracts/openapi.json. Run pnpm client:generate; do not edit.
export interface paths {
    "/api/v1/health/live": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Comprobar que la API está activa */
        get: operations["getLiveness"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/health/ready": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Comprobar disponibilidad de PostgreSQL */
        get: operations["getReadiness"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/organizer/session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Proyectar estado efectivo y capacidades de la sesión de organizador */
        get: operations["getOrganizerSessionProjection"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/organizer/session/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Iniciar sesión de organizador con credenciales verificadas */
        post: operations["loginOrganizerSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/organizer/session/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cerrar la sesión actual de organizador preservando otros contextos */
        post: operations["logoutOrganizerSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/public/beta-access-requests": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Enviar solicitud pública de acceso a la Beta sin enumeración */
        post: operations["submitPublicBetaAccessRequest"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/organizer/account/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Listar sesiones activas de la cuenta de organizador actual */
        get: operations["listOrganizerSessions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/organizer/account/sessions/revoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Revocar una sesión específica perteneciente al organizador autenticado */
        post: operations["revokeOrganizerSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/organizer/account/sessions/revoke-others": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cerrar todas las demás sesiones activas preservando la sesión actual */
        post: operations["revokeOtherOrganizerSessions"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/organizer/account/deletion": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Consultar estado y capacidades de eliminación de la cuenta propia */
        get: operations["getOrganizerAccountDeletionState"];
        put?: never;
        /** Verificar contraseña actual y ejecutar solicitud o cancelación de eliminación de cuenta */
        post: operations["executeOrganizerAccountDeletionTransition"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/organizer/account/reauthentication/challenges": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Iniciar desafío de reautenticación para solicitud o cancelación de eliminación de cuenta */
        post: operations["beginOrganizerAccountReauthChallenge"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Listar eventos pertenecientes al organizador autenticado (EL-TK-047) */
        get: operations["listOrganizerEvents"];
        put?: never;
        /** Crear un nuevo borrador de evento de forma idempotente (EL-TK-224) */
        post: operations["createOrganizerEvent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/configuration/name": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Actualizar nombre de un borrador de evento con control de revisión e idempotencia (EL-TK-225) */
        patch: operations["updateOrganizerEventName"];
        trace?: never;
    };
    "/api/v1/events/{eventId}/configuration": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Obtener configuración autorizada y capacidades de un evento propio (EL-TK-047) */
        get: operations["getAuthorizedEventConfiguration"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/share-access": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Obtener enlace público /g/:lookupKey y QR SVG usando la base pública confiable del servidor (EL-TK-081, EL-TK-212) */
        get: operations["getEventShareAccessSnapshot"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/configuration/schedule": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Definir fecha y hora local de inicio para un borrador de evento (EL-TK-226) */
        put: operations["setEventSchedule"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/configuration/timezone": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Cambiar zona horaria de un evento en estado DRAFT o SCHEDULED (EL-TK-227) */
        put: operations["changeEventTimezone"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/public/guest-entry/{lookupKey}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Resolver el acceso público guest por lookupKey y recuperar recibo de sesión activa sin exponer tokens */
        get: operations["resolveGuestPublicEntry"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/public/guest-entry/{lookupKey}/session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Verificar PIN opcional y emitir sesión guest mediante cookie HttpOnly devolviendo recibo autoritativo */
        post: operations["createGuestEntrySession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/public/guest-session/consent": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Registrar consentimiento explícito versionado para la sesión guest activa */
        post: operations["recordGuestSessionConsent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/public/guest-session/nickname": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Guardar nombre o apodo de aportante en la sesión guest activa */
        post: operations["setGuestSessionNickname"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/public/guest-session/contributions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Consultar Mis aportes asociados exclusivamente a la sesión guest activa */
        get: operations["getGuestOwnContributions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/public/guest-entry/{lookupKey}/removal-intake": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Consultar la derivación y aviso oficial de solicitud de retiro sin exigir ni recuperar sesión guest */
        get: operations["getGuestRemovalIntakeRoute"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: never;
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getLiveness: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        status: "alive";
                    };
                };
            };
        };
    };
    getReadiness: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        status: "ready";
                    };
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
        };
    };
    getOrganizerSessionProjection: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        state: "ANONYMOUS" | "ORGANIZER_ACTIVE" | "ORGANIZER_RESTRICTED_DELETION";
                        capabilities: {
                            canSignIn: boolean;
                            canRequestBetaAccess: boolean;
                            canAccessMyEvents: boolean;
                            canAccessMyAccount: boolean;
                            canManageSessions: boolean;
                            canManageAccountDeletion: boolean;
                            isDeletionRestricted: boolean;
                            canSignOut: boolean;
                        };
                        account: {
                            email: string;
                            emailVerified: boolean;
                            /** @enum {string} */
                            accountStatus: "ACTIVE" | "PENDING_DELETION";
                        } | null;
                    };
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
        };
    };
    loginOrganizerSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: email */
                    email: string;
                    password: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        state: "ANONYMOUS" | "ORGANIZER_ACTIVE" | "ORGANIZER_RESTRICTED_DELETION";
                        capabilities: {
                            canSignIn: boolean;
                            canRequestBetaAccess: boolean;
                            canAccessMyEvents: boolean;
                            canAccessMyAccount: boolean;
                            canManageSessions: boolean;
                            canManageAccountDeletion: boolean;
                            isDeletionRestricted: boolean;
                            canSignOut: boolean;
                        };
                        account: {
                            email: string;
                            emailVerified: boolean;
                            /** @enum {string} */
                            accountStatus: "ACTIVE" | "PENDING_DELETION";
                        } | null;
                    };
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
        };
    };
    logoutOrganizerSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        outcome: "LOGGED_OUT" | "ALREADY_EXPIRED_OR_REVOKED";
                        projection: {
                            /** @enum {string} */
                            state: "ANONYMOUS" | "ORGANIZER_ACTIVE" | "ORGANIZER_RESTRICTED_DELETION";
                            capabilities: {
                                canSignIn: boolean;
                                canRequestBetaAccess: boolean;
                                canAccessMyEvents: boolean;
                                canAccessMyAccount: boolean;
                                canManageSessions: boolean;
                                canManageAccountDeletion: boolean;
                                isDeletionRestricted: boolean;
                                canSignOut: boolean;
                            };
                            account: {
                                email: string;
                                emailVerified: boolean;
                                /** @enum {string} */
                                accountStatus: "ACTIVE" | "PENDING_DELETION";
                            } | null;
                        };
                    };
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
        };
    };
    submitPublicBetaAccessRequest: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: email */
                    email: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        outcome: "REQUEST_RECEIVED";
                        message: string;
                    };
                };
            };
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
        };
    };
    listOrganizerSessions: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        sessions: {
                            /** Format: uuid */
                            id: string;
                            /** Format: date-time */
                            authTime: string;
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            lastActiveAt: string;
                            /** Format: date-time */
                            expiresAt: string;
                            /** Format: date-time */
                            idleExpiresAt: string;
                            isCurrent: boolean;
                        }[];
                        total: number;
                    };
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
        };
    };
    revokeOrganizerSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    targetSessionId: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        outcome: "REVOKED" | "ALREADY_REVOKED";
                        /** Format: uuid */
                        targetSessionId: string;
                        isCurrentSession: boolean;
                    };
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
        };
    };
    revokeOtherOrganizerSessions: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        outcome: "REVOKED_OTHERS";
                        revokedCount: number;
                        /** Format: uuid */
                        preservedCurrentSessionId: string;
                    };
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
        };
    };
    getOrganizerAccountDeletionState: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        accountId: string;
                        /** @enum {string} */
                        accountStatus: "ACTIVE" | "PENDING_DELETION" | "DELETED";
                        /** @enum {string} */
                        sessionMode: "ORDINARY" | "DELETION_MANAGEMENT_ONLY";
                        revision: number;
                        affectedEventsCount: number;
                        canRequestDeletion: boolean;
                        canCancelDeletion: boolean;
                        cancelUntilUtcIso: string | null;
                        isUncertainAck: boolean;
                        isIrreversible: boolean;
                        requestId: string | null;
                    };
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
        };
    };
    executeOrganizerAccountDeletionTransition: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    challengeId: string;
                    currentPassword: string;
                    /** @enum {string} */
                    operation: "REQUEST_ACCOUNT_DELETION" | "CANCEL_ACCOUNT_DELETION";
                    accountId?: string;
                    expectedRevision: number;
                    idempotencyKey: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        accountStatus: "ACTIVE" | "PENDING_DELETION" | "DELETED";
                        /** @enum {string} */
                        status: "CONFIRMED" | "CANCELLED" | "UNKNOWN";
                        cancelUntilUtcIso: string | null;
                        message: string;
                    };
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
        };
    };
    beginOrganizerAccountReauthChallenge: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    operation: "REQUEST_ACCOUNT_DELETION" | "CANCEL_ACCOUNT_DELETION";
                    accountId?: string;
                    expectedRevision: number;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        challengeId: string;
                        /** Format: date-time */
                        expiresAtIso: string;
                    };
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
        };
    };
    listOrganizerEvents: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** Format: uuid */
                        organizerId: string;
                        name: string;
                        /** @enum {string} */
                        status: "DRAFT" | "SCHEDULED" | "ACTIVE" | "CLOSED" | "GRACE_PERIOD" | "SUSPENDED" | "PENDING_DELETION" | "ARCHIVED";
                        timezone: string;
                        startsAtLocal: string | null;
                        scheduledAt: string | null;
                        utcOffsetMinutes: number | null;
                        expiresAt: string | null;
                        graceEndsAt: string | null;
                        uploadsEnabled: boolean;
                        guestGalleryEnabled: boolean;
                        /** @enum {string} */
                        moderationMode: "AUTO_PUBLISH" | "MANUAL_REVIEW";
                        pinEnabled: boolean;
                        /** Format: date-time */
                        createdAt: string;
                        /** Format: date-time */
                        updatedAt: string;
                    }[];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
        };
    };
    createOrganizerEvent: {
        parameters: {
            query?: never;
            header: {
                /** @description Clave de idempotencia única para la operación */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        receipt: {
                            /** Format: uuid */
                            operationId: string;
                            /** Format: uuid */
                            eventId: string;
                            operation: string;
                            appliedRevision: string;
                            outcome: string;
                        };
                        /** @enum {string} */
                        outcome: "APPLIED" | "REPLAYED";
                        event: {
                            /** Format: uuid */
                            id: string;
                        };
                    };
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        receipt: {
                            /** Format: uuid */
                            operationId: string;
                            /** Format: uuid */
                            eventId: string;
                            operation: string;
                            appliedRevision: string;
                            outcome: string;
                        };
                        /** @enum {string} */
                        outcome: "APPLIED" | "REPLAYED";
                        event: {
                            /** Format: uuid */
                            id: string;
                        };
                    };
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
        };
    };
    updateOrganizerEventName: {
        parameters: {
            query?: never;
            header: {
                /** @description Clave de idempotencia única para la operación */
                "Idempotency-Key": string;
            };
            path: {
                eventId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    expectedRevision: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        receipt: {
                            /** Format: uuid */
                            operationId: string;
                            /** Format: uuid */
                            eventId: string;
                            operation: string;
                            appliedRevision: string;
                            outcome: string;
                        };
                        /** @enum {string} */
                        outcome: "APPLIED" | "REPLAYED";
                        revision: string;
                        event: {
                            /** Format: uuid */
                            id: string;
                            name: string;
                            revision: string;
                        };
                    };
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
        };
    };
    getAuthorizedEventConfiguration: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                eventId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        event: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            organizerId: string;
                            name: string;
                            /** @enum {string} */
                            status: "DRAFT" | "SCHEDULED" | "ACTIVE" | "CLOSED" | "GRACE_PERIOD" | "SUSPENDED" | "PENDING_DELETION" | "ARCHIVED";
                            timezone: string;
                            startsAtLocal: string | null;
                            scheduledAt: string | null;
                            utcOffsetMinutes: number | null;
                            expiresAt: string | null;
                            graceEndsAt: string | null;
                            uploadsEnabled: boolean;
                            guestGalleryEnabled: boolean;
                            /** @enum {string} */
                            moderationMode: "AUTO_PUBLISH" | "MANUAL_REVIEW";
                            pinEnabled: boolean;
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            updatedAt: string;
                        };
                        revision: string;
                        capabilities: {
                            canEditSchedule: boolean;
                            canEditSettings: boolean;
                            canManageAccess: boolean;
                            canViewLifecycle: boolean;
                            canViewCapacity: boolean;
                            canPublishOrActivate: boolean;
                            canEditName: boolean;
                            canSetLocalSchedule: boolean;
                            canChangeTimezone: boolean;
                        };
                    };
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
        };
    };
    getEventShareAccessSnapshot: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                eventId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        eventId: string;
                        lookupKey: string;
                        sharePath: string;
                        shareUrl: string;
                        generation: number;
                        pinRequired: boolean;
                        qrPayload: string;
                        qrSvg: string;
                    };
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
        };
    };
    setEventSchedule: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                eventId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description Fecha y hora local en formato 'YYYY-MM-DDTHH:mm' o 'YYYY-MM-DDTHH:mm:ss' */
                    startsAtLocal: string;
                    /** @description Offset UTC explícito en minutos para desambiguar transiciones DST (fall-back) */
                    utcOffsetMinutes?: number | null;
                    /** @description Revisión esperada para control de concurrencia optimista (CAS monotónico) */
                    expectedRevision?: string | null;
                    /** @description Clave de idempotencia para prevención de ejecuciones duplicadas */
                    idempotencyKey?: string | null;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        event: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            organizerId: string;
                            name: string;
                            /** @enum {string} */
                            status: "DRAFT" | "SCHEDULED" | "ACTIVE" | "CLOSED" | "GRACE_PERIOD" | "SUSPENDED" | "PENDING_DELETION" | "ARCHIVED";
                            timezone: string;
                            startsAtLocal: string | null;
                            scheduledAt: string | null;
                            utcOffsetMinutes: number | null;
                            expiresAt: string | null;
                            graceEndsAt: string | null;
                            uploadsEnabled: boolean;
                            guestGalleryEnabled: boolean;
                            /** @enum {string} */
                            moderationMode: "AUTO_PUBLISH" | "MANUAL_REVIEW";
                            pinEnabled: boolean;
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            updatedAt: string;
                        };
                        /** @enum {string} */
                        outcome: "UPDATED" | "IDEMPOTENT_REPLAY";
                        receipt?: {
                            /** Format: uuid */
                            operationId: string;
                            /** Format: uuid */
                            eventId: string;
                            operation: string;
                            appliedRevision: string;
                            outcome: string;
                        } | null;
                    };
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
        };
    };
    changeEventTimezone: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                eventId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description Identificador IANA de la nueva zona horaria (ej. America/Bogota, UTC) */
                    timezone: string;
                    /** @description Offset UTC explícito en minutos para desambiguar transiciones DST (fall-back) */
                    utcOffsetMinutes?: number | null;
                    /** @description Revisión esperada para control de concurrencia optimista (CAS monotónico) */
                    expectedRevision?: string | null;
                    /** @description Clave de idempotencia para prevención de ejecuciones duplicadas */
                    idempotencyKey?: string | null;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        event: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            organizerId: string;
                            name: string;
                            /** @enum {string} */
                            status: "DRAFT" | "SCHEDULED" | "ACTIVE" | "CLOSED" | "GRACE_PERIOD" | "SUSPENDED" | "PENDING_DELETION" | "ARCHIVED";
                            timezone: string;
                            startsAtLocal: string | null;
                            scheduledAt: string | null;
                            utcOffsetMinutes: number | null;
                            expiresAt: string | null;
                            graceEndsAt: string | null;
                            uploadsEnabled: boolean;
                            guestGalleryEnabled: boolean;
                            /** @enum {string} */
                            moderationMode: "AUTO_PUBLISH" | "MANUAL_REVIEW";
                            pinEnabled: boolean;
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            updatedAt: string;
                        };
                        previousTimezone: string;
                        /** @enum {string|null} */
                        warning?: "RECALCULATED_SCHEDULE" | null;
                        /** @enum {string} */
                        outcome: "TIMEZONE_CHANGED" | "IDEMPOTENT_REPLAY";
                        receipt?: {
                            /** Format: uuid */
                            operationId: string;
                            /** Format: uuid */
                            eventId: string;
                            operation: string;
                            appliedRevision: string;
                            outcome: string;
                        } | null;
                    };
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
        };
    };
    resolveGuestPublicEntry: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                lookupKey: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        access: {
                            /** @enum {string} */
                            accessState: "ALLOWED" | "RESTRICTED" | "UNAVAILABLE";
                            /** Format: uuid */
                            eventId: string;
                            name: string;
                            status: string;
                            timezone: string;
                            generation: number;
                            pinRequired: boolean;
                            canViewLanding: boolean;
                            canUpload: boolean;
                            canViewGallery: boolean;
                            restrictionReason?: string;
                        };
                        session: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            eventId: string;
                            credentialGeneration: number;
                            contributorNickname: string | null;
                            hasConsented: boolean;
                            consentVersion: string | null;
                        } | null;
                        contributions: {
                            /** Format: uuid */
                            attemptId: string;
                            /** @enum {string} */
                            mediaType: "PHOTO" | "VIDEO";
                            status: string;
                            declaredSize: number;
                            actualSize: number | null;
                            detectedType: string | null;
                            durationSeconds: number | null;
                            /** Format: date-time */
                            createdAt: string;
                            rejectionReason: string | null;
                        }[];
                    };
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
        };
    };
    createGuestEntrySession: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                lookupKey: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    pin?: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        session: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            eventId: string;
                            credentialGeneration: number;
                            contributorNickname: string | null;
                            hasConsented: boolean;
                            consentVersion: string | null;
                        };
                        contributions: {
                            /** Format: uuid */
                            attemptId: string;
                            /** @enum {string} */
                            mediaType: "PHOTO" | "VIDEO";
                            status: string;
                            declaredSize: number;
                            actualSize: number | null;
                            detectedType: string | null;
                            durationSeconds: number | null;
                            /** Format: date-time */
                            createdAt: string;
                            rejectionReason: string | null;
                        }[];
                    };
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
        };
    };
    recordGuestSessionConsent: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    documentVersion: string;
                    accepted: boolean;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        session: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            eventId: string;
                            credentialGeneration: number;
                            contributorNickname: string | null;
                            hasConsented: boolean;
                            consentVersion: string | null;
                        };
                        /** @enum {string} */
                        outcome: "RECORDED" | "IDEMPOTENT_REPLAY";
                    };
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
        };
    };
    setGuestSessionNickname: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    nickname: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        session: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            eventId: string;
                            credentialGeneration: number;
                            contributorNickname: string | null;
                            hasConsented: boolean;
                            consentVersion: string | null;
                        };
                    };
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
        };
    };
    getGuestOwnContributions: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        session: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            eventId: string;
                            credentialGeneration: number;
                            contributorNickname: string | null;
                            hasConsented: boolean;
                            consentVersion: string | null;
                        };
                        contributions: {
                            /** Format: uuid */
                            attemptId: string;
                            /** @enum {string} */
                            mediaType: "PHOTO" | "VIDEO";
                            status: string;
                            declaredSize: number;
                            actualSize: number | null;
                            detectedType: string | null;
                            durationSeconds: number | null;
                            /** Format: date-time */
                            createdAt: string;
                            rejectionReason: string | null;
                        }[];
                        totalCount: number;
                        acceptedCount: number;
                    };
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
        };
    };
    getGuestRemovalIntakeRoute: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                lookupKey: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        eventId: string;
                        eventName: string;
                        intakePath: string;
                        disclaimer: string;
                        /** @enum {boolean} */
                        requiresSession: false;
                    };
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code: string;
                        message: string;
                        /** Format: uuid */
                        correlationId: string;
                    };
                };
            };
        };
    };
}
