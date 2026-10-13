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
        <!-- Hero principal -->
        <section class="el-hero" aria-labelledby="hero-title">
          <div class="el-container el-hero__container">
            <h1 id="hero-title" class="el-hero__title">
              Tu evento termina. Sus recuerdos continúan.
            </h1>
            <p class="el-hero__subtitle">
              Cada invitado vive momentos diferentes. Con EventLens, puedes reunir sus fotos y videos en un espacio dedicado a los recuerdos de tu celebración, de manera sencilla y sin que tus invitados tengan que crear una cuenta.
            </p>
            <div class="el-hero__cta-wrapper">
              <a
                class="el-btn-primary el-btn-lg"
                [attr.href]="betaPath"
                (click)="onNavigateToBeta($event)"
              >
                Solicitar acceso a la Beta
              </a>
              <span class="el-hero__microcopy">
                Acceso disponible mediante invitación.
              </span>
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
                <div class="el-card__icon" aria-hidden="true">&#128101;</div>
                <h3 class="el-card__title">Entre todos</h3>
                <p class="el-card__text">
                  Cada invitado aporta su perspectiva.
                </p>
              </article>

              <article class="el-card">
                <div class="el-card__icon" aria-hidden="true">&#9889;</div>
                <h3 class="el-card__title">Sin complicaciones</h3>
                <p class="el-card__text">
                  Participación desde el navegador mediante un enlace o QR.
                </p>
              </article>

              <article class="el-card">
                <div class="el-card__icon" aria-hidden="true">&#128193;</div>
                <h3 class="el-card__title">En un lugar</h3>
                <p class="el-card__text">
                  Fotos y videos reunidos por evento.
                </p>
              </article>
            </div>
          </div>
        </section>

        <!-- Cómo funciona: cuatro pasos -->
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
                <div class="el-step__badge" aria-hidden="true">1</div>
                <div class="el-step__content">
                  <h3 class="el-step__title">Prepara tu evento</h3>
                  <p class="el-step__text">
                    Crea un espacio para tu celebración y configura cómo participarán tus invitados.
                  </p>
                </div>
              </li>

              <li class="el-step">
                <div class="el-step__badge" aria-hidden="true">2</div>
                <div class="el-step__content">
                  <h3 class="el-step__title">Comparte la invitación</h3>
                  <p class="el-step__text">
                    Envía un enlace o código QR a quienes estarán contigo.
                  </p>
                </div>
              </li>

              <li class="el-step">
                <div class="el-step__badge" aria-hidden="true">3</div>
                <div class="el-step__content">
                  <h3 class="el-step__title">Cada mirada cuenta</h3>
                  <p class="el-step__text">
                    Los invitados comparten sus fotografías y videos desde el celular, sin registrarse.
                  </p>
                </div>
              </li>

              <li class="el-step">
                <div class="el-step__badge" aria-hidden="true">4</div>
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

        <!-- Privacidad: Tus recuerdos, tu espacio, tus decisiones -->
        <section
          id="privacidad"
          class="el-section el-section--privacy"
          aria-labelledby="privacy-heading"
        >
          <div class="el-container">
            <div class="el-privacy-box">
              <h2 id="privacy-heading" tabindex="-1" class="el-privacy-box__title">
                Tus recuerdos, tu espacio, tus decisiones
              </h2>
              <p class="el-privacy-box__text">
                Gestiona el acceso de tus invitados, decide si pueden compartir fotografías y videos y controla cuándo está disponible la galería. Los recuerdos se mantienen dentro del espacio privado de tu evento.
              </p>
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
                <dt class="el-faq-item__question">¿Qué es EventLens?</dt>
                <dd class="el-faq-item__answer">
                  Es una plataforma para reunir las fotografías y videos que comparten los invitados de un evento.
                </dd>
              </div>

              <div class="el-faq-item">
                <dt class="el-faq-item__question">¿Cómo funciona el código QR?</dt>
                <dd class="el-faq-item__answer">
                  El organizador comparte un QR o enlace que permite acceder al espacio del evento. Algunos eventos pueden solicitar un PIN.
                </dd>
              </div>

              <div class="el-faq-item">
                <dt class="el-faq-item__question">¿Mis invitados necesitan crear una cuenta?</dt>
                <dd class="el-faq-item__answer">
                  No. Pueden participar sin registrarse, siguiendo las condiciones de acceso y participación del evento.
                </dd>
              </div>

              <div class="el-faq-item">
                <dt class="el-faq-item__question">¿Cómo puedo solicitar acceso a la Beta?</dt>
                <dd class="el-faq-item__answer">
                  Utiliza el botón «Solicitar acceso a la Beta». Tu solicitud será revisada; enviarla no garantiza una invitación inmediata.
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <!-- Cierre emocional y CTA final -->
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
                class="el-btn-primary el-btn-lg"
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

      <!-- Pie de página -->
      <eventlens-legal-footer></eventlens-legal-footer>
    </div>
  `,
  styles: [`
    .el-home-layout {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      background-color: var(--el-ui-color-background, #fafaf8);
      color: var(--el-ui-color-text-primary, #17202a);
      font-family: var(--el-ui-font-family-base, 'Manrope', system-ui, sans-serif);
    }
    .el-home-main {
      flex: 1;
    }
    .el-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 1.5rem;
    }

    /* Botones reutilizables */
    .el-btn-primary {
      background-color: var(--el-ui-color-primary, #17345c);
      color: #ffffff;
      text-decoration: none;
      font-size: 1rem;
      font-weight: 600;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.15s ease;
      min-height: 48px;
      padding: 0.75rem 1.75rem;
    }
    .el-btn-primary:hover {
      background-color: var(--el-ui-color-primary-hover, #102a4d);
    }
    .el-btn-primary:focus-visible {
      outline: var(--el-ui-focus-outline-width, 2px) solid var(--el-ui-focus-outline-color, #17345c);
      outline-offset: var(--el-ui-focus-outline-offset, 2px);
    }

    /* Hero */
    .el-hero {
      padding: 4.5rem 0 3.5rem;
      background-color: var(--el-ui-color-surface, #ffffff);
      border-bottom: 1px solid var(--el-ui-color-border, #e7e7e3);
    }
    .el-hero__container {
      max-width: 860px;
      text-align: center;
    }
    .el-hero__title {
      font-size: 2.5rem;
      font-weight: 700;
      line-height: 1.2;
      color: var(--el-ui-color-primary, #17345c);
      margin: 0 0 1.25rem;
      letter-spacing: -0.02em;
    }
    .el-hero__subtitle {
      font-size: 1.125rem;
      line-height: 1.6;
      color: var(--el-ui-color-text-secondary, #667085);
      margin: 0 0 2rem;
    }
    .el-hero__cta-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
    }
    .el-hero__microcopy,
    .el-closing__microcopy {
      font-size: 0.875rem;
      color: var(--el-ui-color-text-secondary, #667085);
    }

    /* Secciones generales */
    .el-section {
      padding: 4rem 0;
    }
    .el-section__header {
      max-width: 720px;
      margin: 0 auto 3rem;
      text-align: center;
    }
    .el-section__title {
      font-size: 2rem;
      font-weight: 700;
      color: var(--el-ui-color-primary, #17345c);
      margin: 0 0 1rem;
      letter-spacing: -0.01em;
    }
    .el-section__title:focus,
    .el-privacy-box__title:focus,
    .el-closing__title:focus {
      outline: none;
    }
    .el-section__intro {
      font-size: 1.0625rem;
      line-height: 1.6;
      color: var(--el-ui-color-text-secondary, #667085);
      margin: 0;
    }

    /* Grid y Cards */
    .el-grid--3 {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1.5rem;
    }
    @media (min-width: 768px) {
      .el-grid--3 {
        grid-template-columns: repeat(3, 1fr);
      }
      .el-hero__title {
        font-size: 3.25rem;
      }
    }
    .el-card {
      background-color: var(--el-ui-color-surface, #ffffff);
      border: 1px solid var(--el-ui-color-border, #e7e7e3);
      border-radius: 8px;
      padding: 2rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .el-card__icon {
      font-size: 2rem;
      margin-bottom: 0.25rem;
    }
    .el-card__title {
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0;
      color: var(--el-ui-color-text-primary, #17202a);
    }
    .el-card__text {
      font-size: 0.9375rem;
      line-height: 1.5;
      color: var(--el-ui-color-text-secondary, #667085);
      margin: 0;
    }

    /* Pasos */
    .el-steps-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: 1fr;
      gap: 1.5rem;
    }
    @media (min-width: 768px) {
      .el-steps-list {
        grid-template-columns: repeat(2, 1fr);
      }
    }
    .el-step {
      display: flex;
      gap: 1.25rem;
      background-color: var(--el-ui-color-surface, #ffffff);
      border: 1px solid var(--el-ui-color-border, #e7e7e3);
      border-radius: 8px;
      padding: 1.5rem;
    }
    .el-step__badge {
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background-color: var(--el-ui-color-accent-soft, #fff1ed);
      color: var(--el-ui-color-accent, #f37a5d);
      font-size: 1.125rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .el-step__content {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .el-step__title {
      font-size: 1.125rem;
      font-weight: 600;
      margin: 0;
      color: var(--el-ui-color-text-primary, #17202a);
    }
    .el-step__text {
      font-size: 0.9375rem;
      line-height: 1.5;
      color: var(--el-ui-color-text-secondary, #667085);
      margin: 0;
    }

    /* Caja de privacidad */
    .el-privacy-box {
      background-color: var(--el-ui-color-surface, #ffffff);
      border-left: 4px solid var(--el-ui-color-primary, #17345c);
      border-radius: 0 8px 8px 0;
      padding: 2.5rem;
      max-width: 800px;
      margin: 0 auto;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .el-privacy-box__title {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--el-ui-color-primary, #17345c);
      margin: 0 0 1rem;
    }
    .el-privacy-box__text {
      font-size: 1.0625rem;
      line-height: 1.6;
      color: var(--el-ui-color-text-secondary, #667085);
      margin: 0;
    }

    /* FAQ */
    .el-faq-list {
      max-width: 800px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    .el-faq-item {
      background-color: var(--el-ui-color-surface, #ffffff);
      border: 1px solid var(--el-ui-color-border, #e7e7e3);
      border-radius: 8px;
      padding: 1.5rem;
    }
    .el-faq-item__question {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--el-ui-color-text-primary, #17202a);
      margin-bottom: 0.5rem;
    }
    .el-faq-item__answer {
      font-size: 0.9375rem;
      line-height: 1.5;
      color: var(--el-ui-color-text-secondary, #667085);
      margin: 0;
    }

    /* Cierre */
    .el-section--closing {
      background-color: var(--el-ui-color-surface, #ffffff);
      border-top: 1px solid var(--el-ui-color-border, #e7e7e3);
      text-align: center;
    }
    .el-closing__container {
      max-width: 720px;
    }
    .el-closing__title {
      font-size: 2rem;
      font-weight: 700;
      color: var(--el-ui-color-primary, #17345c);
      margin: 0 0 1rem;
    }
    .el-closing__subtitle {
      font-size: 1.125rem;
      line-height: 1.6;
      color: var(--el-ui-color-text-secondary, #667085);
      margin: 0 0 2rem;
    }
    .el-closing__cta-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
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
}

export const PUBLIC_HOME_ROUTE_DESCRIPTOR: PublicEntryRouteDescriptor = Object.freeze({
  ...CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA.PUBLIC_HOME,
  component: PublicHomePageComponent
});
