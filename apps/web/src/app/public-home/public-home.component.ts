import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  inject,
  signal
} from '@angular/core';
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
  templateUrl: './public-home.component.html',
  styleUrl: './public-home.component.scss'
})
export class PublicHomePageComponent implements AfterViewInit, OnDestroy {
  private readonly router = inject(PublicEntryRouterService, { optional: true });
  private readonly elementRef = inject(ElementRef);
  readonly betaPath = APPROVED_PUBLIC_ENTRY_PATHS.BETA_ACCESS;

  readonly isReducedMotion = signal(false);
  readonly activeStep = signal<number>(1);

  private revealObserver?: IntersectionObserver;
  private stepObserver?: IntersectionObserver;
  private mediaQueryList?: MediaQueryList;
  private mediaQueryHandler?: (e: MediaQueryListEvent) => void;

  ngAfterViewInit(): void {
    this.initReducedMotionListener();
    this.initRevealObserver();
    this.initStepObserver();
  }

  ngOnDestroy(): void {
    this.revealObserver?.disconnect();
    this.stepObserver?.disconnect();
    if (this.mediaQueryList && this.mediaQueryHandler) {
      this.mediaQueryList.removeEventListener('change', this.mediaQueryHandler);
    }
  }

  private initReducedMotionListener(): void {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    this.mediaQueryList = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.isReducedMotion.set(this.mediaQueryList.matches);

    this.mediaQueryHandler = (event: MediaQueryListEvent) => {
      this.isReducedMotion.set(event.matches);
      if (event.matches) {
        // Revelar todo inmediatamente si el usuario activa reduced-motion
        this.revealAllElementsImmediately();
      }
    };
    this.mediaQueryList.addEventListener('change', this.mediaQueryHandler);
  }

  private initRevealObserver(): void {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      this.revealAllElementsImmediately();
      return;
    }

    if (this.isReducedMotion()) {
      this.revealAllElementsImmediately();
      return;
    }

    const host = this.elementRef.nativeElement as HTMLElement;
    const revealTargets = host.querySelectorAll<HTMLElement>('.el-reveal');

    if (revealTargets.length === 0) return;

    this.revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('el-reveal--visible');
            this.revealObserver?.unobserve(entry.target);
          }
        }
      },
      {
        threshold: 0.12,
        rootMargin: '0px 0px -40px 0px'
      }
    );

    revealTargets.forEach((target) => this.revealObserver?.observe(target));
  }

  private initStepObserver(): void {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;

    const host = this.elementRef.nativeElement as HTMLElement;
    const stepItems = host.querySelectorAll<HTMLElement>('.el-step');

    if (stepItems.length === 0) return;

    this.stepObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const stepNum = entry.target.getAttribute('data-step');
            if (stepNum) {
              const parsed = parseInt(stepNum, 10);
              if (!isNaN(parsed)) {
                this.activeStep.set(parsed);
              }
            }
          }
        }
      },
      {
        threshold: 0.5,
        rootMargin: '-10% 0px -30% 0px'
      }
    );

    stepItems.forEach((step) => this.stepObserver?.observe(step));
  }

  private revealAllElementsImmediately(): void {
    if (typeof document === 'undefined') return;
    const host = this.elementRef.nativeElement as HTMLElement;
    const targets = host.querySelectorAll('.el-reveal');
    targets.forEach((target) => target.classList.add('el-reveal--visible'));
  }

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
        const behavior: ScrollBehavior = this.isReducedMotion() ? 'auto' : 'smooth';
        element.scrollIntoView({ behavior });
        element.focus();
      }
    }
  }
}

export const PUBLIC_HOME_ROUTE_DESCRIPTOR: PublicEntryRouteDescriptor = Object.freeze({
  ...CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA.PUBLIC_HOME,
  component: PublicHomePageComponent
});
