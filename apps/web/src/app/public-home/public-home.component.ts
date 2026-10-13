import { Component, inject } from '@angular/core';
import {
  APPROVED_PUBLIC_ENTRY_PATHS,
  CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA,
  type PublicEntryRouteDescriptor
} from '../navigation/public-entry-routes.contract';
import { PublicEntryRouterService } from '../navigation/public-entry-router.service';
import { AppHeaderComponent } from './app-header.component';
import { LegalFooterComponent } from './legal-footer.component';

@Component({
  selector: 'eventlens-public-home',
  standalone: true,
  imports: [AppHeaderComponent, LegalFooterComponent],
  template: `
    <div class="el-home-layout">
      <!-- Cabecera principal -->
      <eventlens-app-header></eventlens-app-header>

      <main id="main-content" class="el-home-main" tabindex="-1">
        <!-- Hero principal (2 columnas en desktop) -->
        <section class="el-hero" aria-labelledby="hero-title">
          <div class="el-container el-hero__container">
            <!-- Columna izquierda: Información editorial y llamadas a la acción -->
            <div class="el-hero__content">
              <div class="el-hero__pill" aria-label="Sin fricciones de descarga o registro">
                <span class="el-pill-dot" aria-hidden="true">&#9679;</span>
                0 APPS QUE DESCARGAR &bull; 0 CUENTAS QUE CREAR
              </div>

              <h1 id="hero-title" class="el-hero__title">
                Tu evento termina. Sus recuerdos continúan.
              </h1>

              <p class="el-hero__subtitle">
                Reúne todas las fotos y videos de tus invitados en un único álbum digital en calidad original. Cada invitado vive momentos diferentes. Con EventLens, puedes reunir sus fotos y videos en un espacio dedicado a los recuerdos de tu celebración, de manera sencilla y sin que tus invitados tengan que crear una cuenta.
              </p>

              <div class="el-hero__actions">
                <a
                  class="el-btn-primary el-btn-lg"
                  [attr.href]="betaPath"
                  (click)="onNavigateToBeta($event)"
                >
                  Solicitar acceso a la Beta
                </a>

                <a
                  class="el-btn-demo"
                  href="#como-funciona"
                  (click)="onScrollTo($event, 'como-funciona')"
                >
                  <span>Ver Demo en vivo</span>
                  <span class="el-demo-arrow" aria-hidden="true">&#9654;</span>
                </a>
              </div>

              <!-- Beneficios inmediatos en checks -->
              <div class="el-hero__checks">
                <span class="el-check-item">
                  <span class="el-check-mark" aria-hidden="true">&#10003;</span>
                  100% Calidad original
                </span>
                <span class="el-check-item">
                  <span class="el-check-mark" aria-hidden="true">&#10003;</span>
                  Galería privada
                </span>
                <span class="el-check-item">
                  <span class="el-check-mark" aria-hidden="true">&#10003;</span>
                  Listo en 2 minutos
                </span>
              </div>

              <span class="el-hero__microcopy">
                Acceso disponible mediante invitación.
              </span>

              <!-- Etiquetas de tipo de evento -->
              <div class="el-hero__chips-container">
                <span class="el-chips-label">Ideal para:</span>
                <div class="el-chips-list">
                  <span class="el-chip">
                    <span class="el-chip-emoji" aria-hidden="true">&#128141;</span> Bodas
                  </span>
                  <span class="el-chip">
                    <span class="el-chip-emoji" aria-hidden="true">&#127881;</span> Fiestas y Cumpleaños
                  </span>
                  <span class="el-chip">
                    <span class="el-chip-emoji" aria-hidden="true">&#127970;</span> Eventos corporativos
                  </span>
                </div>
              </div>
            </div>

            <!-- Columna derecha: Composición visual rica de la experiencia EventLens -->
            <div class="el-hero__visual" aria-hidden="true">
              <!-- Confetis decorativos -->
              <div class="el-confetti el-confetti--1"></div>
              <div class="el-confetti el-confetti--2"></div>
              <div class="el-confetti el-confetti--3"></div>
              <div class="el-confetti el-confetti--4"></div>

              <!-- Polaroid flotante izquierda -->
              <div class="el-polaroid-mockup">
                <div class="el-polaroid-photo">
                  <div class="el-polaroid-inner">
                    <span class="el-photo-tag">Momento mágico</span>
                  </div>
                </div>
                <div class="el-polaroid-caption">Ana &amp; Carlos &hearts;</div>
              </div>

              <!-- Smartphone central -->
              <div class="el-phone-mockup">
                <div class="el-phone-speaker"></div>
                <div class="el-phone-screen">
                  <!-- App Header interior -->
                  <div class="el-app-header">
                    <span class="el-app-logo">EVENTLENS</span>
                    <span class="el-app-user-dot"></span>
                  </div>

                  <!-- Título del evento -->
                  <div class="el-app-banner">
                    <span class="el-app-badge">&#128141; ¡La boda de Ana y Carlos!</span>
                  </div>

                  <!-- Grid de fotos de invitados -->
                  <div class="el-app-grid">
                    <div class="el-app-photo el-app-photo--1">
                      <span class="el-photo-time">19:42</span>
                    </div>
                    <div class="el-app-photo el-app-photo--2">
                      <span class="el-photo-time">20:15</span>
                    </div>
                    <div class="el-app-photo el-app-photo--3">
                      <span class="el-photo-time">21:04</span>
                    </div>
                    <div class="el-app-photo el-app-photo--4">
                      <span class="el-photo-time">21:30</span>
                    </div>
                    <div class="el-app-photo el-app-photo--5">
                      <span class="el-photo-time">22:10</span>
                    </div>
                    <div class="el-app-photo el-app-photo--6">
                      <span class="el-photo-time">23:05</span>
                    </div>
                  </div>

                  <!-- Botón flotante para subir -->
                  <div class="el-app-fab">
                    <span>&#43;</span>
                  </div>
                </div>
              </div>

              <!-- Table Card derecha -->
              <div class="el-tablecard-mockup">
                <div class="el-tablecard-header">
                  <span class="el-tablecard-title">Table Card</span>
                </div>
                <div class="el-tablecard-qr">
                  <!-- SVG de código QR nítido y realista -->
                  <svg class="el-qr-svg" viewBox="0 0 100 100" width="100%" height="100%">
                    <!-- Fondo blanco -->
                    <rect width="100" height="100" fill="#ffffff" />
                    <!-- Patrones de esquina (finder patterns) -->
                    <rect x="5" y="5" width="26" height="26" fill="#17202a" rx="3" />
                    <rect x="9" y="9" width="18" height="18" fill="#ffffff" rx="2" />
                    <rect x="13" y="13" width="10" height="10" fill="#e05638" rx="1.5" />

                    <rect x="69" y="5" width="26" height="26" fill="#17202a" rx="3" />
                    <rect x="73" y="9" width="18" height="18" fill="#ffffff" rx="2" />
                    <rect x="77" y="13" width="10" height="10" fill="#e05638" rx="1.5" />

                    <rect x="5" y="69" width="26" height="26" fill="#17202a" rx="3" />
                    <rect x="9" y="73" width="18" height="18" fill="#ffffff" rx="2" />
                    <rect x="13" y="77" width="10" height="10" fill="#e05638" rx="1.5" />

                    <!-- Módulos de datos -->
                    <rect x="36" y="8" width="6" height="6" fill="#17202a" />
                    <rect x="46" y="8" width="6" height="6" fill="#17202a" />
                    <rect x="56" y="14" width="6" height="6" fill="#17202a" />
                    <rect x="36" y="22" width="6" height="6" fill="#17202a" />
                    <rect x="48" y="24" width="6" height="6" fill="#17202a" />

                    <rect x="10" y="38" width="6" height="6" fill="#17202a" />
                    <rect x="22" y="44" width="6" height="6" fill="#17202a" />
                    <rect x="36" y="38" width="6" height="6" fill="#17202a" />
                    <rect x="58" y="38" width="6" height="6" fill="#17202a" />
                    <rect x="70" y="44" width="6" height="6" fill="#17202a" />
                    <rect x="84" y="38" width="6" height="6" fill="#17202a" />

                    <rect x="36" y="52" width="6" height="6" fill="#17202a" />
                    <rect x="46" y="60" width="6" height="6" fill="#17202a" />
                    <rect x="56" y="52" width="6" height="6" fill="#17202a" />
                    <rect x="72" y="60" width="6" height="6" fill="#17202a" />
                    <rect x="84" y="52" width="6" height="6" fill="#17202a" />

                    <rect x="36" y="74" width="6" height="6" fill="#17202a" />
                    <rect x="48" y="82" width="6" height="6" fill="#17202a" />
                    <rect x="62" y="74" width="6" height="6" fill="#17202a" />
                    <rect x="76" y="84" width="6" height="6" fill="#17202a" />

                    <!-- Logo central -->
                    <circle cx="50" cy="50" r="10" fill="#ffffff" />
                    <circle cx="50" cy="50" r="7" fill="#e05638" />
                  </svg>
                </div>
                <div class="el-tablecard-body">
                  <p class="el-tablecard-prompt">&iquest;Subes tus fotos aqu&iacute;?</p>
                  <p class="el-tablecard-text">Escanea con tu c&aacute;mara y comparte tus recuerdos.</p>
                  <p class="el-tablecard-highlight">Sin bajar apps.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Beneficios: Cada mirada cuenta -->
        <section
          id="beneficios"
          class="el-section el-section--beneficios"
          aria-labelledby="beneficios-heading"
        >
          <div class="el-container">
            <div class="el-section__header">
              <h2 id="beneficios-heading" tabindex="-1" class="el-section__title">
                Cada mirada cuenta
              </h2>
              <p class="el-section__intro">
                Los recuerdos más especiales no siempre están en una sola cámara. Invita a tus familiares y amigos a compartir lo que vivieron, reúne esas perspectivas y vuelve a disfrutar de cada momento.
              </p>
            </div>

            <div class="el-grid el-grid--3">
              <article class="el-card">
                <div class="el-card__icon el-card__icon--purple" aria-hidden="true">&#128101;</div>
                <h3 class="el-card__title">Entre todos</h3>
                <p class="el-card__text">
                  Cada invitado aporta su perspectiva.
                </p>
              </article>

              <article class="el-card">
                <div class="el-card__icon el-card__icon--orange" aria-hidden="true">&#9889;</div>
                <h3 class="el-card__title">Sin complicaciones</h3>
                <p class="el-card__text">
                  Participación desde el navegador mediante un enlace o QR.
                </p>
              </article>

              <article class="el-card">
                <div class="el-card__icon el-card__icon--yellow" aria-hidden="true">&#128193;</div>
                <h3 class="el-card__title">En un lugar</h3>
                <p class="el-card__text">
                  Fotos y videos reunidos por evento.
                </p>
              </article>
            </div>
          </div>
        </section>

        <!-- Cómo funciona: cuatro pasos ilustrados -->
        <section
          id="como-funciona"
          class="el-section el-section--steps"
          aria-labelledby="steps-heading"
        >
          <div class="el-container">
            <div class="el-section__header">
              <h2 id="steps-heading" tabindex="-1" class="el-section__title">
                Cómo funciona
              </h2>
            </div>

            <ol class="el-steps-list">
              <li class="el-step">
                <div class="el-step__preview el-step__preview--1" aria-hidden="true">
                  <div class="el-step-badge">1</div>
                  <div class="el-step-mockup">
                    <div class="el-step-mockup-header"></div>
                    <div class="el-step-mockup-line"></div>
                    <div class="el-step-mockup-line el-step-mockup-line--short"></div>
                  </div>
                </div>
                <div class="el-step__content">
                  <h3 class="el-step__title">Prepara tu evento</h3>
                  <p class="el-step__text">
                    Crea un espacio para tu celebración y configura cómo participarán tus invitados.
                  </p>
                </div>
              </li>

              <li class="el-step">
                <div class="el-step__preview el-step__preview--2" aria-hidden="true">
                  <div class="el-step-badge">2</div>
                  <div class="el-step-mockup el-step-mockup--qr">
                    <div class="el-step-mini-qr"></div>
                    <div class="el-step-people-dots">
                      <span></span><span></span><span></span>
                    </div>
                  </div>
                </div>
                <div class="el-step__content">
                  <h3 class="el-step__title">Comparte la invitación</h3>
                  <p class="el-step__text">
                    Envía un enlace o código QR a quienes estarán contigo.
                  </p>
                </div>
              </li>

              <li class="el-step">
                <div class="el-step__preview el-step__preview--3" aria-hidden="true">
                  <div class="el-step-badge">3</div>
                  <div class="el-step-mockup el-step-mockup--photos">
                    <div class="el-step-mini-thumb"></div>
                    <div class="el-step-mini-thumb"></div>
                  </div>
                </div>
                <div class="el-step__content">
                  <h3 class="el-step__title">Cada mirada cuenta</h3>
                  <p class="el-step__text">
                    Los invitados comparten sus fotografías y videos desde el celular, sin registrarse.
                  </p>
                </div>
              </li>

              <li class="el-step">
                <div class="el-step__preview el-step__preview--4" aria-hidden="true">
                  <div class="el-step-badge">4</div>
                  <div class="el-step-mockup el-step-mockup--gallery">
                    <div class="el-step-mini-grid">
                      <span></span><span></span><span></span><span></span>
                    </div>
                  </div>
                </div>
                <div class="el-step__content">
                  <h3 class="el-step__title">Revive los recuerdos</h3>
                  <p class="el-step__text">
                    Consulta los contenidos disponibles y recupera tus recuerdos según las opciones habilitadas para el evento.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </section>

        <!-- Sección Comparativa: EventLens vs WhatsApp vs Drive -->
        <section
          id="comparar"
          class="el-section el-section--comparar"
          aria-labelledby="comparar-heading"
        >
          <div class="el-container">
            <div class="el-section__header">
              <h2 id="comparar-heading" tabindex="-1" class="el-section__title">
                EventLens vs WhatsApp vs Drive
              </h2>
            </div>

            <div class="el-comparison-wrapper">
              <table class="el-comparison-table" role="table">
                <thead>
                  <tr>
                    <th scope="col" class="el-th-feature">Característica</th>
                    <th scope="col" class="el-th-brand">EventLens</th>
                    <th scope="col" class="el-th-competitor">
                      <span class="el-brand-icon" aria-hidden="true">&#128172;</span> WhatsApp
                    </th>
                    <th scope="col" class="el-th-competitor">
                      <span class="el-brand-icon" aria-hidden="true">&#128193;</span> Google Drive
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row" class="el-td-feature">Fotos en calidad original</th>
                    <td class="el-td-brand"><span class="el-icon-check" aria-label="Sí">&#9989;</span></td>
                    <td class="el-td-other"><span class="el-icon-neutral" aria-label="Regular">&#128528;</span></td>
                    <td class="el-td-other"><span class="el-icon-warning" aria-label="Con compresión">&#9888;&#65039;</span></td>
                  </tr>
                  <tr>
                    <th scope="row" class="el-td-feature">No requiere descargar App</th>
                    <td class="el-td-brand"><span class="el-icon-check" aria-label="Sí">&#9989;</span></td>
                    <td class="el-td-other"><span class="el-icon-cross" aria-label="No">&#10060;</span></td>
                    <td class="el-td-other"><span class="el-icon-neutral" aria-label="Opcional">&#128528;</span></td>
                  </tr>
                  <tr>
                    <th scope="row" class="el-td-feature">No requiere crear cuenta</th>
                    <td class="el-td-brand"><span class="el-icon-check" aria-label="Sí">&#9989;</span></td>
                    <td class="el-td-other"><span class="el-icon-cross" aria-label="No">&#10060;</span></td>
                    <td class="el-td-other"><span class="el-icon-neutral" aria-label="Requiere Google">&#128528;</span></td>
                  </tr>
                  <tr>
                    <th scope="row" class="el-td-feature">Todo organizado en un solo lugar</th>
                    <td class="el-td-brand"><span class="el-icon-check" aria-label="Sí">&#9989;</span></td>
                    <td class="el-td-other"><span class="el-icon-cross" aria-label="No">&#10060;</span></td>
                    <td class="el-td-other"><span class="el-icon-folder" aria-label="Carpetas manuales">&#128450;&#65039;</span></td>
                  </tr>
                  <tr>
                    <th scope="row" class="el-td-feature">Búsqueda fácil / filtros</th>
                    <td class="el-td-brand"><span class="el-icon-check" aria-label="Sí">&#9989;</span></td>
                    <td class="el-td-other"><span class="el-icon-cross" aria-label="No">&#10060;</span></td>
                    <td class="el-td-other"><span class="el-icon-cross" aria-label="No">&#10060;</span></td>
                  </tr>
                  <tr>
                    <th scope="row" class="el-td-feature">Galería interactiva en vivo</th>
                    <td class="el-td-brand"><span class="el-icon-check" aria-label="Sí">&#9989;</span></td>
                    <td class="el-td-other"><span class="el-icon-cross" aria-label="No">&#10060;</span></td>
                    <td class="el-td-other"><span class="el-icon-cross" aria-label="No">&#10060;</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <!-- Privacidad: Tus recuerdos, tu espacio, tus decisiones -->
        <section
          id="privacidad"
          class="el-section el-section--privacy"
          aria-labelledby="privacy-heading"
        >
          <div class="el-container">
            <div class="el-privacy-box">
              <div class="el-privacy-box__main">
                <h2 id="privacy-heading" tabindex="-1" class="el-privacy-box__title">
                  Tus recuerdos, tu espacio, tus decisiones
                </h2>
                <p class="el-privacy-box__text">
                  Gestiona el acceso de tus invitados, decide si pueden compartir fotografías y videos y controla cuándo está disponible la galería. Los recuerdos se mantienen dentro del espacio privado de tu evento.
                </p>
              </div>
              <div class="el-privacy-box__icon" aria-hidden="true">
                <div class="el-lock-circle">
                  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Preguntas frecuentes -->
        <section
          id="preguntas-frecuentes"
          class="el-section el-section--faq"
          aria-labelledby="faq-heading"
        >
          <div class="el-container">
            <div class="el-section__header">
              <h2 id="faq-heading" tabindex="-1" class="el-section__title">
                Preguntas frecuentes
              </h2>
            </div>

            <dl class="el-faq-list">
              <div class="el-faq-item">
                <dt class="el-faq-item__question">
                  <span>¿Qué es EventLens?</span>
                  <span class="el-faq-chevron" aria-hidden="true">&#9662;</span>
                </dt>
                <dd class="el-faq-item__answer">
                  Es una plataforma para reunir las fotografías y videos que comparten los invitados de un evento.
                </dd>
              </div>

              <div class="el-faq-item">
                <dt class="el-faq-item__question">
                  <span>¿Cómo funciona el código QR?</span>
                  <span class="el-faq-chevron" aria-hidden="true">&#9662;</span>
                </dt>
                <dd class="el-faq-item__answer">
                  El organizador comparte un QR o enlace que permite acceder al espacio del evento. Algunos eventos pueden solicitar un PIN.
                </dd>
              </div>

              <div class="el-faq-item">
                <dt class="el-faq-item__question">
                  <span>¿Mis invitados necesitan crear una cuenta?</span>
                  <span class="el-faq-chevron" aria-hidden="true">&#9662;</span>
                </dt>
                <dd class="el-faq-item__answer">
                  No. Pueden participar sin registrarse, siguiendo las condiciones de acceso y participación del evento.
                </dd>
              </div>

              <div class="el-faq-item">
                <dt class="el-faq-item__question">
                  <span>¿Cómo puedo solicitar acceso a la Beta?</span>
                  <span class="el-faq-chevron" aria-hidden="true">&#9662;</span>
                </dt>
                <dd class="el-faq-item__answer">
                  Utiliza el botón «Solicitar acceso a la Beta». Tu solicitud será revisada; enviarla no garantiza una invitación inmediata.
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <!-- Cierre emocional y CTA final en banner coral degradado -->
        <section class="el-section el-section--closing" aria-labelledby="closing-heading">
          <div class="el-container el-closing__container">
            <h2 id="closing-heading" tabindex="-1" class="el-closing__title">
              Cada celebración tiene una historia.
            </h2>
            <p class="el-closing__subtitle">
              Haz que todos formen parte de ella y conserva los recuerdos desde diferentes miradas.
            </p>
            <div class="el-closing__cta-wrapper">
              <a
                class="el-btn-primary el-btn-lg el-btn-closing"
                [attr.href]="betaPath"
                (click)="onNavigateToBeta($event)"
              >
                Solicitar acceso a la Beta
              </a>
              <span class="el-closing__microcopy">
                Acceso mediante invitación.
              </span>
            </div>
          </div>
        </section>
      </main>

      <!-- Pie de página oscuro -->
      <eventlens-legal-footer></eventlens-legal-footer>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .el-home-layout {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      background-color: var(--el-ui-color-background, #faf8f4);
      color: var(--el-ui-color-text-primary, #17202a);
      font-family: var(--el-ui-font-family-base, 'Manrope', system-ui, sans-serif);
      -webkit-font-smoothing: antialiased;
    }

    .el-home-main {
      flex: 1;
    }

    .el-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 1.5rem;
    }

    /* ── Botones ───────────────────────────────────────────────────────────── */
    .el-btn-primary {
      background-color: #e05638;
      color: #ffffff;
      text-decoration: none;
      font-size: 1rem;
      font-weight: 700;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
      min-height: 52px;
      padding: 0.875rem 2rem;
      box-shadow: 0 4px 12px rgba(224, 86, 56, 0.28);
    }

    .el-btn-primary:hover {
      background-color: #c94426;
      box-shadow: 0 6px 16px rgba(224, 86, 56, 0.36);
      transform: translateY(-1px);
    }

    .el-btn-primary:focus-visible {
      outline: 2px solid #17345c;
      outline-offset: 2px;
    }

    .el-btn-demo {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      color: #17202a;
      text-decoration: none;
      font-size: 0.9375rem;
      font-weight: 700;
      padding: 0.75rem 1.25rem;
      min-height: 52px;
      border-radius: 8px;
      transition: all 0.15s ease;
    }

    .el-btn-demo:hover {
      color: #e05638;
      background-color: rgba(224, 86, 56, 0.06);
    }

    .el-demo-arrow {
      font-size: 0.75rem;
      color: #e05638;
      transition: transform 0.15s ease;
    }

    .el-btn-demo:hover .el-demo-arrow {
      transform: translateX(3px);
    }

    /* ── Hero Principal ────────────────────────────────────────────────────── */
    .el-hero {
      padding: 3.5rem 0 4.5rem;
      background-color: var(--el-ui-color-background, #faf8f4);
      position: relative;
      overflow: hidden;
    }

    .el-hero__container {
      display: grid;
      grid-template-columns: 1fr;
      gap: 3.5rem;
      align-items: center;
    }

    @media (min-width: 992px) {
      .el-hero__container {
        grid-template-columns: 1.15fr 0.85fr;
        gap: 2.5rem;
      }
    }

    .el-hero__content {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      text-align: left;
    }

    .el-hero__pill {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background-color: #fff1ed;
      color: #d94828;
      border: 1px solid rgba(224, 86, 56, 0.2);
      padding: 0.375rem 0.875rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.05em;
      margin-bottom: 1.5rem;
    }

    .el-pill-dot {
      color: #e05638;
      font-size: 0.625rem;
    }

    .el-hero__title {
      font-size: 2.75rem;
      font-weight: 800;
      line-height: 1.15;
      color: #17202a;
      margin: 0 0 1.25rem;
      letter-spacing: -0.03em;
    }

    @media (min-width: 768px) {
      .el-hero__title {
        font-size: 3.5rem;
      }
    }

    .el-hero__subtitle {
      font-size: 1.125rem;
      line-height: 1.6;
      color: #4b5563;
      margin: 0 0 2rem;
      max-width: 580px;
    }

    .el-hero__actions {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
      margin-bottom: 1.75rem;
    }

    .el-hero__checks {
      display: flex;
      flex-wrap: wrap;
      gap: 1.25rem;
      margin-bottom: 0.75rem;
      font-size: 0.875rem;
      font-weight: 600;
      color: #374151;
    }

    .el-check-item {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
    }

    .el-check-mark {
      color: #16a34a;
      font-weight: 800;
    }

    .el-hero__microcopy {
      font-size: 0.8125rem;
      color: #6b7280;
      margin-bottom: 1.75rem;
    }

    .el-hero__chips-container {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding-top: 1.25rem;
      border-top: 1px solid rgba(0, 0, 0, 0.08);
      width: 100%;
      max-width: 540px;
    }

    .el-chips-label {
      font-size: 0.8125rem;
      font-weight: 700;
      color: #6b7280;
    }

    .el-chips-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.625rem;
    }

    .el-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      background-color: #ffffff;
      border: 1px solid #e5e7eb;
      padding: 0.375rem 0.75rem;
      border-radius: 999px;
      font-size: 0.8125rem;
      font-weight: 600;
      color: #374151;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    }

    /* ── Visual Mockup (Smartphone, Polaroid, Table Card) ─────────────────── */
    .el-hero__visual {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 520px;
    }

    /* Confeti festivo */
    .el-confetti {
      position: absolute;
      width: 10px;
      height: 10px;
      border-radius: 2px;
      opacity: 0.7;
    }
    .el-confetti--1 {
      top: 10%;
      left: 15%;
      background: #fcd34d;
      transform: rotate(25deg);
    }
    .el-confetti--2 {
      top: 18%;
      right: 12%;
      background: #f87171;
      transform: rotate(-35deg);
    }
    .el-confetti--3 {
      bottom: 22%;
      left: 8%;
      background: #c084fc;
      transform: rotate(45deg);
    }
    .el-confetti--4 {
      bottom: 15%;
      right: 10%;
      background: #60a5fa;
      transform: rotate(-15deg);
    }

    /* Polaroid */
    .el-polaroid-mockup {
      position: absolute;
      left: -20px;
      top: 90px;
      width: 150px;
      background: #ffffff;
      padding: 8px 8px 16px;
      border-radius: 6px;
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.12);
      transform: rotate(-8deg);
      z-index: 2;
    }
    @media (max-width: 640px) {
      .el-polaroid-mockup {
        display: none;
      }
    }
    .el-polaroid-photo {
      height: 125px;
      background: linear-gradient(135deg, #fbcfe8 0%, #fed7aa 100%);
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .el-polaroid-inner {
      background: rgba(255, 255, 255, 0.85);
      padding: 4px 8px;
      border-radius: 4px;
    }
    .el-photo-tag {
      font-size: 0.6875rem;
      font-weight: 700;
      color: #be185d;
    }
    .el-polaroid-caption {
      margin-top: 8px;
      text-align: center;
      font-size: 0.75rem;
      font-weight: 700;
      color: #4b5563;
      font-family: cursive, sans-serif;
    }

    /* Smartphone Mockup */
    .el-phone-mockup {
      width: 250px;
      height: 480px;
      background: #111827;
      border-radius: 38px;
      padding: 10px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.1);
      position: relative;
      z-index: 5;
    }
    .el-phone-speaker {
      width: 50px;
      height: 4px;
      background: #374151;
      border-radius: 999px;
      position: absolute;
      top: 14px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10;
    }
    .el-phone-screen {
      width: 100%;
      height: 100%;
      background: #faf8f5;
      border-radius: 30px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      position: relative;
    }
    .el-app-header {
      padding: 18px 12px 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(0, 0, 0, 0.05);
    }
    .el-app-logo {
      font-size: 0.6875rem;
      font-weight: 800;
      color: #17345c;
      letter-spacing: 0.05em;
    }
    .el-app-user-dot {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #e05638;
    }
    .el-app-banner {
      padding: 6px 10px;
      text-align: center;
    }
    .el-app-badge {
      font-size: 0.6875rem;
      font-weight: 700;
      color: #1f2937;
      background: #ffffff;
      padding: 3px 8px;
      border-radius: 999px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
      display: inline-block;
    }
    .el-app-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6px;
      padding: 6px 10px;
      flex: 1;
    }
    .el-app-photo {
      border-radius: 8px;
      position: relative;
      display: flex;
      align-items: flex-end;
      padding: 4px;
    }
    .el-app-photo--1 { background: linear-gradient(135deg, #fed7aa, #f472b6); }
    .el-app-photo--2 { background: linear-gradient(135deg, #a7f3d0, #60a5fa); }
    .el-app-photo--3 { background: linear-gradient(135deg, #fef08a, #f97316); }
    .el-app-photo--4 { background: linear-gradient(135deg, #ddd6fe, #ec4899); }
    .el-app-photo--5 { background: linear-gradient(135deg, #bae6fd, #818cf8); }
    .el-app-photo--6 { background: linear-gradient(135deg, #fecdd3, #f59e0b); }
    .el-photo-time {
      font-size: 0.5625rem;
      font-weight: 700;
      color: #ffffff;
      background: rgba(0, 0, 0, 0.45);
      padding: 1px 4px;
      border-radius: 3px;
    }
    .el-app-fab {
      position: absolute;
      bottom: 12px;
      right: 12px;
      width: 32px;
      height: 32px;
      background: #e05638;
      color: #ffffff;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.25rem;
      font-weight: 300;
      box-shadow: 0 4px 10px rgba(224, 86, 56, 0.4);
    }

    /* Table Card Mockup */
    .el-tablecard-mockup {
      position: absolute;
      right: -25px;
      top: 75px;
      width: 175px;
      background: #ffffff;
      border-radius: 14px;
      padding: 14px 12px;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.12);
      transform: rotate(6deg);
      z-index: 3;
      border: 1px solid #f3f4f6;
    }
    @media (max-width: 640px) {
      .el-tablecard-mockup {
        display: none;
      }
    }
    .el-tablecard-header {
      text-align: center;
      margin-bottom: 8px;
    }
    .el-tablecard-title {
      font-size: 0.75rem;
      font-weight: 800;
      color: #17202a;
      letter-spacing: -0.01em;
    }
    .el-tablecard-qr {
      width: 90px;
      height: 90px;
      margin: 0 auto 10px;
      border-radius: 6px;
      overflow: hidden;
      padding: 4px;
      background: #ffffff;
      border: 1px solid #e5e7eb;
    }
    .el-qr-svg {
      display: block;
    }
    .el-tablecard-body {
      text-align: center;
    }
    .el-tablecard-prompt {
      font-size: 0.75rem;
      font-weight: 800;
      color: #17202a;
      margin: 0 0 3px;
    }
    .el-tablecard-text {
      font-size: 0.625rem;
      line-height: 1.3;
      color: #6b7280;
      margin: 0 0 3px;
    }
    .el-tablecard-highlight {
      font-size: 0.6875rem;
      font-weight: 800;
      color: #e05638;
      margin: 0;
    }

    /* ── Secciones Generales ───────────────────────────────────────────────── */
    .el-section {
      padding: 5rem 0;
    }

    .el-section__header {
      max-width: 720px;
      margin: 0 auto 3.5rem;
      text-align: center;
    }

    .el-section__title {
      font-size: 2.25rem;
      font-weight: 800;
      color: #17202a;
      margin: 0 0 1rem;
      letter-spacing: -0.02em;
    }

    .el-section__title:focus,
    .el-privacy-box__title:focus,
    .el-closing__title:focus {
      outline: none;
    }

    .el-section__intro {
      font-size: 1.0625rem;
      line-height: 1.6;
      color: #6b7280;
      margin: 0;
    }

    /* ── Beneficios (Cada mirada cuenta) ──────────────────────────────────── */
    .el-grid--3 {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1.75rem;
    }

    @media (min-width: 768px) {
      .el-grid--3 {
        grid-template-columns: repeat(3, 1fr);
      }
    }

    .el-card {
      background-color: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.05);
      border-radius: 16px;
      padding: 2.5rem 2rem;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 1rem;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.04), 0 8px 10px -6px rgba(0, 0, 0, 0.02);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .el-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 16px 32px -6px rgba(0, 0, 0, 0.07);
    }

    .el-card__icon {
      width: 52px;
      height: 52px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
    }

    .el-card__icon--purple {
      background-color: #ede9fe;
      color: #7c3aed;
    }

    .el-card__icon--orange {
      background-color: #ffedd5;
      color: #ea580c;
    }

    .el-card__icon--yellow {
      background-color: #fef9c3;
      color: #ca8a04;
    }

    .el-card__title {
      font-size: 1.25rem;
      font-weight: 700;
      margin: 0;
      color: #17202a;
    }

    .el-card__text {
      font-size: 0.9375rem;
      line-height: 1.6;
      color: #6b7280;
      margin: 0;
    }

    /* ── Cómo funciona (Pasos) ────────────────────────────────────────────── */
    .el-steps-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: 1fr;
      gap: 1.75rem;
    }

    @media (min-width: 640px) {
      .el-steps-list {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (min-width: 1024px) {
      .el-steps-list {
        grid-template-columns: repeat(4, 1fr);
      }
    }

    .el-step {
      background-color: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.05);
      border-radius: 16px;
      padding: 1.75rem 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      box-shadow: 0 8px 20px -4px rgba(0, 0, 0, 0.03);
    }

    .el-step__preview {
      height: 100px;
      background-color: #f9fafb;
      border-radius: 12px;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border: 1px solid #f3f4f6;
    }

    .el-step-badge {
      position: absolute;
      top: 8px;
      left: 8px;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background-color: #17202a;
      color: #ffffff;
      font-size: 0.75rem;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .el-step-mockup {
      width: 60px;
      height: 44px;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .el-step-mockup-header {
      height: 6px;
      background: #e05638;
      border-radius: 2px;
    }

    .el-step-mockup-line {
      height: 4px;
      background: #e5e7eb;
      border-radius: 2px;
    }

    .el-step-mockup-line--short {
      width: 60%;
    }

    .el-step-mockup--qr {
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      position: relative;
    }

    .el-step-mini-qr {
      width: 38px;
      height: 38px;
      background: #17202a;
      border-radius: 4px;
    }

    .el-step-mockup--photos {
      display: flex;
      gap: 6px;
      background: transparent;
      border: none;
    }

    .el-step-mini-thumb {
      width: 34px;
      height: 42px;
      border-radius: 4px;
      background: linear-gradient(135deg, #fbcfe8, #fed7aa);
      border: 1px solid #ffffff;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
    }

    .el-step-mockup--gallery {
      background: transparent;
      border: none;
    }

    .el-step-mini-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 3px;
      width: 44px;
      height: 44px;
    }

    .el-step-mini-grid span {
      background: #e5e7eb;
      border-radius: 2px;
    }
    .el-step-mini-grid span:first-child { background: #fca5a5; }
    .el-step-mini-grid span:nth-child(2) { background: #93c5fd; }
    .el-step-mini-grid span:nth-child(3) { background: #fde047; }
    .el-step-mini-grid span:nth-child(4) { background: #86efac; }

    .el-step__content {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .el-step__title {
      font-size: 1.125rem;
      font-weight: 700;
      color: #17202a;
      margin: 0;
    }

    .el-step__text {
      font-size: 0.875rem;
      line-height: 1.5;
      color: #6b7280;
      margin: 0;
    }

    /* ── Sección Comparativa (EventLens vs WhatsApp vs Drive) ──────────────── */
    .el-section--comparar {
      background-color: var(--el-ui-color-background, #faf8f4);
    }

    .el-comparison-wrapper {
      max-width: 920px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 20px;
      padding: 1.5rem;
      box-shadow: 0 12px 30px -6px rgba(0, 0, 0, 0.05);
      border: 1px solid rgba(0, 0, 0, 0.05);
      overflow-x: auto;
    }

    .el-comparison-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 0.9375rem;
    }

    .el-comparison-table th,
    .el-comparison-table td {
      padding: 1.125rem 1rem;
      text-align: center;
      border-bottom: 1px solid #f3f4f6;
    }

    .el-comparison-table tr:last-child th,
    .el-comparison-table tr:last-child td {
      border-bottom: none;
    }

    .el-th-feature,
    .el-td-feature {
      text-align: left !important;
      font-weight: 600;
      color: #1f2937;
      min-width: 200px;
    }

    .el-th-brand {
      background-color: #f0fdf4;
      color: #15803d;
      font-weight: 800;
      border-top-left-radius: 12px;
      border-top-right-radius: 12px;
      font-size: 1.0625rem;
    }

    .el-td-brand {
      background-color: #f0fdf4;
      font-size: 1.25rem;
    }

    .el-comparison-table tr:last-child .el-td-brand {
      border-bottom-left-radius: 12px;
      border-bottom-right-radius: 12px;
    }

    .el-th-competitor {
      color: #4b5563;
      font-weight: 700;
    }

    .el-td-other {
      font-size: 1.25rem;
    }

    .el-brand-icon {
      font-size: 1rem;
      margin-right: 0.25rem;
    }

    /* ── Privacidad ────────────────────────────────────────────────────────── */
    .el-privacy-box {
      background-color: #ffffff;
      border-radius: 20px;
      padding: 3rem 2.5rem;
      max-width: 900px;
      margin: 0 auto;
      box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.04);
      border: 1px solid rgba(0, 0, 0, 0.05);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 2rem;
    }

    .el-privacy-box__main {
      flex: 1;
    }

    .el-privacy-box__title {
      font-size: 1.625rem;
      font-weight: 800;
      color: #17202a;
      margin: 0 0 1rem;
      letter-spacing: -0.01em;
    }

    .el-privacy-box__text {
      font-size: 1.0625rem;
      line-height: 1.6;
      color: #6b7280;
      margin: 0;
    }

    .el-privacy-box__icon {
      flex-shrink: 0;
    }

    .el-lock-circle {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background-color: #e0f2fe;
      color: #0284c7;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    @media (max-width: 640px) {
      .el-privacy-box {
        flex-direction: column;
        align-items: flex-start;
      }
    }

    /* ── FAQ ───────────────────────────────────────────────────────────────── */
    .el-faq-list {
      max-width: 860px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .el-faq-item {
      background-color: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.06);
      border-radius: 14px;
      padding: 1.5rem 1.75rem;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
    }

    .el-faq-item__question {
      font-size: 1.0625rem;
      font-weight: 700;
      color: #17202a;
      margin-bottom: 0.625rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }

    .el-faq-chevron {
      color: #9ca3af;
      font-size: 1rem;
      flex-shrink: 0;
    }

    .el-faq-item__answer {
      font-size: 0.9375rem;
      line-height: 1.6;
      color: #6b7280;
      margin: 0;
    }

    /* ── Cierre Emocional (Banner Coral Degradado) ─────────────────────────── */
    .el-section--closing {
      background: linear-gradient(135deg, #f87171 0%, #ea580c 100%);
      color: #ffffff;
      text-align: center;
      padding: 5.5rem 0;
    }

    .el-closing__container {
      max-width: 760px;
    }

    .el-closing__title {
      font-size: 2.25rem;
      font-weight: 800;
      color: #ffffff;
      margin: 0 0 1rem;
      letter-spacing: -0.02em;
    }

    .el-closing__subtitle {
      font-size: 1.125rem;
      line-height: 1.6;
      color: rgba(255, 255, 255, 0.92);
      margin: 0 0 2.25rem;
    }

    .el-closing__cta-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.875rem;
    }

    .el-btn-closing {
      background-color: #142a4a;
      color: #ffffff;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
    }

    .el-btn-closing:hover {
      background-color: #0f1f38;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.32);
      transform: translateY(-2px);
    }

    .el-closing__microcopy {
      font-size: 0.875rem;
      color: rgba(255, 255, 255, 0.8);
      font-weight: 500;
    }
  `]
})
export class PublicHomePageComponent {
  private readonly router = inject(PublicEntryRouterService, { optional: true });
  readonly betaPath = APPROVED_PUBLIC_ENTRY_PATHS.BETA_ACCESS;

  onNavigateToBeta(event: MouseEvent): void {
    if (!this.router) return;
    event.preventDefault();
    void this.router.navigateByUrl(APPROVED_PUBLIC_ENTRY_PATHS.BETA_ACCESS);
  }

  onScrollTo(event: MouseEvent, targetId: string): void {
    event.preventDefault();
    if (typeof document !== 'undefined') {
      const element = document.getElementById(targetId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
        element.focus();
      }
    }
  }
}

export const PUBLIC_HOME_ROUTE_DESCRIPTOR: PublicEntryRouteDescriptor = Object.freeze({
  ...CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA.PUBLIC_HOME,
  component: PublicHomePageComponent
});
