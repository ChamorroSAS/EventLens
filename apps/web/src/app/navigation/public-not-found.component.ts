import { Component, ElementRef, OnInit, inject } from '@angular/core';
import {
  APPROVED_PUBLIC_ENTRY_PATHS,
  CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA,
  type PublicEntryRouteDescriptor
} from './public-entry-routes.contract';
import { PublicEntryRouterService } from './public-entry-router.service';

@Component({
  selector: 'eventlens-public-not-found',
  standalone: true,
  template: `
    <main class="el-not-found" aria-labelledby="el-not-found-title">
      <div class="el-not-found__card">
        <p class="el-not-found__eyebrow">Error 404</p>
        <h1 id="el-not-found-title" tabindex="-1" class="el-not-found__title">
          Página no encontrada
        </h1>
        <p class="el-not-found__message">
          La dirección que intentas abrir no está disponible o no existe en Phoeve.
        </p>
        <a
          class="el-not-found__action"
          [attr.href]="homePath"
          (click)="onReturnHome($event)"
        >
          Volver al inicio
        </a>
      </div>
    </main>
  `
})
export class PublicNotFoundComponent implements OnInit {
  private readonly hostRef = inject(ElementRef);
  private readonly router = inject(PublicEntryRouterService, { optional: true });
  readonly homePath = APPROVED_PUBLIC_ENTRY_PATHS.HOME;

  ngOnInit(): void {
    const hostEl = this.hostRef.nativeElement as HTMLElement;
    const heading = hostEl.querySelector('#el-not-found-title') as HTMLElement | null;
    heading?.focus();
  }

  onReturnHome(event: MouseEvent): void {
    if (!this.router) {
      return;
    }
    event.preventDefault();
    void this.router.navigateByUrl(APPROVED_PUBLIC_ENTRY_PATHS.HOME);
  }
}

export const PUBLIC_NOT_FOUND_ROUTE_DESCRIPTOR: PublicEntryRouteDescriptor = Object.freeze({
  ...CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA.NOT_FOUND,
  component: PublicNotFoundComponent
});

